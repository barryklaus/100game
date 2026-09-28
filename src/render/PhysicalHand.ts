import * as THREE from 'three';
import { createCardMesh, disposeCardMesh } from './CardMesh';
import { separatedHandDepths } from './HandDepth';
import { prefersLosslessHand } from '../game/deck';

type HandObject = { id: string; element: HTMLElement; mesh?: THREE.Group; loading: boolean; rotation: THREE.Euler; };

/** DOM targets keep native accessibility; their actual visible cards share the room's lights. */
export class PhysicalHand {
  private cards = new Map<string, HandObject>();
  private observer: MutationObserver;
  private disposed = false;
  private temp = new THREE.Vector3();
  private reducedMotion = false;
  private crispMobile = prefersLosslessHand();
  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private loadTexture: (url: string) => Promise<THREE.Texture>) {
    this.observer = new MutationObserver(() => this.sync());
    this.observer.observe(document.querySelector('#app')!, { childList: true, subtree: true });
    document.documentElement.classList.toggle('crisp-mobile-hand', this.crispMobile);
    addEventListener('resize', this.onResize, { passive: true });
    this.sync();
  }
  configure(reducedMotion: boolean): void { this.reducedMotion = reducedMotion; }
  private onResize = (): void => {
    const crispMobile = prefersLosslessHand();
    if (crispMobile === this.crispMobile) return;
    this.crispMobile = crispMobile;
    document.documentElement.classList.toggle('crisp-mobile-hand', crispMobile);
    this.sync();
  };
  private sync(): void {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.local-hand .hand-card'));
    if (this.crispMobile) {
      for (const item of this.cards.values()) if (item.mesh) {
        this.scene.remove(item.mesh); disposeCardMesh(item.mesh);
      }
      this.cards.clear();
      for (const element of elements) {
        element.classList.remove('mesh-ready');
        const image = element.querySelector<HTMLImageElement>('img');
        if (image?.dataset.fullSrc && image.getAttribute('src') !== image.dataset.fullSrc) image.src = image.dataset.fullSrc;
      }
      return;
    }
    const ids = new Set(elements.map(element => element.dataset.card!));
    for (const [id, item] of this.cards) {
      if (ids.has(id)) continue;
      if (item.mesh) { this.scene.remove(item.mesh); disposeCardMesh(item.mesh); }
      this.cards.delete(id);
    }
    for (const element of elements) {
      const image = element.querySelector<HTMLImageElement>('img');
      if (image?.dataset.standardSrc && image.getAttribute('src') !== image.dataset.standardSrc) image.src = image.dataset.standardSrc;
      const id = element.dataset.card!;
      const existing = this.cards.get(id);
      if (existing) { existing.element = element; if(existing.mesh) element.classList.add('mesh-ready'); continue; }
      const item: HandObject = {id,element,loading:true,rotation:new THREE.Euler()};
      this.cards.set(id,item);
      const front = element.querySelector<HTMLImageElement>('img')?.src;
      const back = document.querySelector<HTMLImageElement>('.draw-stack img')?.src;
      if (!front || !back) continue;
      void Promise.all([this.loadTexture(front),this.loadTexture(back)]).then(([face,reverse]) => {
        if(this.disposed || this.cards.get(id)!==item) return;
        item.mesh=createCardMesh(face,reverse,element.classList.contains('special'));
        // The hand floats in front of the camera; its moving shadow cannot land
        // naturally on the table and would force a full shadow-map redraw.
        item.mesh.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = false; });
        item.mesh.renderOrder=10;
        this.scene.add(item.mesh);
        item.loading=false;
        item.element.classList.add('mesh-ready');
      }).catch(() => { item.loading=false; });
    }
  }
  /** Used by deal animations, including hidden receiving-card meshes. */
  cardPose(id:string):{position:THREE.Vector3;quaternion:THREE.Quaternion;scale:number}|undefined {
    const mesh=this.cards.get(id)?.mesh;
    if(!mesh)return;
    return {position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),scale:mesh.scale.x};
  }
  update(delta: number): void {
    if (this.crispMobile) return;
    this.camera.updateMatrixWorld();
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);
    const poses=[];
    for (const item of this.cards.values()) {
      const {element,mesh}=item;
      if(!mesh) continue;
      mesh.visible=element.isConnected && element.closest('[data-phase]')?.getAttribute('data-phase')!=='ended' && !element.classList.contains('card-departing') && !element.classList.contains('receiving-card');
      if(!element.isConnected||element.classList.contains('card-departing'))continue;
      const rect=element.getBoundingClientRect();
      const dragging=element.classList.contains('dragging');
      const inspecting=element.classList.contains('inspecting');
      const hovering=element.matches(':hover') && !element.classList.contains('waiting-hand');
      const slot=Array.from(element.parentElement?.children??[]).indexOf(element);
      const fan=slot===0?7:-7;
      const tx=Number(element.dataset.tiltX||0),ty=Number(element.dataset.tiltY||0),rz=Number(element.dataset.turn||0);
      const targetX=dragging ? -tx : inspecting ? 0 : hovering ? -.045 : -.025;
      const targetY=dragging ? -ty : inspecting ? 0 : hovering ? .055 : 0;
      const targetZ=dragging ? -rz : inspecting ? 0 : THREE.MathUtils.degToRad(fan);
      const lerp=this.reducedMotion ? 1 : 1-Math.exp(-delta*24);
      item.rotation.x=THREE.MathUtils.lerp(item.rotation.x,targetX,lerp);
      item.rotation.y=THREE.MathUtils.lerp(item.rotation.y,targetY,lerp);
      item.rotation.z=THREE.MathUtils.lerp(item.rotation.z,targetZ,lerp);
      const localRotation=new THREE.Quaternion().setFromEuler(item.rotation);
      mesh.quaternion.copy(this.camera.quaternion).multiply(localRotation);
      const scalePerDistance=element.offsetHeight/innerHeight*2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov*.5))/mesh.userData.cardHeight*(inspecting?1.22:dragging?1.055:hovering?1.015:1);
      const axes=new THREE.Matrix4().makeRotationFromQuaternion(localRotation).elements;
      const extentRatio=(Math.abs(axes[2])*mesh.userData.cardWidth/2+Math.abs(axes[6])*mesh.userData.cardHeight/2+Math.abs(axes[10])*mesh.userData.cardThickness/2)*scalePerDistance;
      const priority=dragging?30:inspecting?20:hovering?10:slot;
      poses.push({item,mesh,rect,dragging,scalePerDistance,extentRatio,priority});
    }
    poses.sort((a,b)=>a.priority-b.priority);
    const depths=separatedHandDepths(poses.map(pose=>pose.extentRatio));
    poses.forEach(({mesh,rect,dragging,scalePerDistance},index)=>{
      const distance=depths[index];
      this.temp.set((rect.left+rect.width/2)/innerWidth*2-1,-(rect.top+rect.height/2)/innerHeight*2+1,.5).unproject(this.camera).sub(this.camera.position);
      this.temp.multiplyScalar(distance/this.temp.dot(forward)).add(this.camera.position);
      if(mesh.userData.placed && !dragging && !this.reducedMotion)mesh.position.lerp(this.temp,1-Math.exp(-delta*18));
      else mesh.position.copy(this.temp);
      // Smooth lateral reflow, but always enforce the separated depth planes.
      const currentDepth=mesh.position.clone().sub(this.camera.position).dot(forward);
      mesh.position.addScaledVector(forward,distance-currentDepth);
      mesh.scale.setScalar(scalePerDistance*distance);
      mesh.userData.placed=true;
    });
  }
  dispose(): void {
    this.disposed=true;
    this.observer.disconnect();
    removeEventListener('resize', this.onResize);
    document.documentElement.classList.remove('crisp-mobile-hand');
    for(const item of this.cards.values()) if(item.mesh){this.scene.remove(item.mesh);disposeCardMesh(item.mesh);}
    this.cards.clear();
  }
}
