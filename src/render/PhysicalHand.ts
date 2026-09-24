import * as THREE from 'three';
import { createCardMesh, disposeCardMesh } from './CardMesh';
import { prefersLosslessHand } from '../game/deck';

type HandObject = { id: string; element: HTMLElement; mesh?: THREE.Group; loading: boolean; rotation: THREE.Euler; };

/** DOM targets keep native accessibility; their actual visible cards share the room's lights. */
export class PhysicalHand {
  private cards = new Map<string, HandObject>();
  private observer: MutationObserver;
  private disposed = false;
  private temp = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
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
  update(delta: number): void {
    if (this.crispMobile) return;
    this.camera.updateMatrixWorld();
    for (const item of this.cards.values()) {
      const {element,mesh}=item;
      if(!mesh) continue;
      mesh.visible=element.isConnected && !element.classList.contains('card-departing') && !element.classList.contains('receiving-card');
      if(!mesh.visible) continue;
      const rect=element.getBoundingClientRect();
      const dragging=element.classList.contains('dragging');
      const inspecting=element.classList.contains('inspecting');
      const hovering=element.matches(':hover') && !element.classList.contains('waiting-hand');
      const distance=inspecting ? 5.4 : 5.8;
      const worldHeight=2*distance*Math.tan(THREE.MathUtils.degToRad(this.camera.fov*.5));
      this.temp.set((rect.left+rect.width/2)/innerWidth*2-1,-(rect.top+rect.height/2)/innerHeight*2+1,.5).unproject(this.camera).sub(this.camera.position);
      const forward=new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);
      this.temp.multiplyScalar(distance/this.temp.dot(forward)).add(this.camera.position);
      mesh.position.copy(this.temp);
      const fan=element===element.parentElement?.firstElementChild ? 7 : -7;
      const tx=Number(element.dataset.tiltX||0),ty=Number(element.dataset.tiltY||0),rz=Number(element.dataset.turn||0);
      const targetX=dragging ? -tx : inspecting ? 0 : hovering ? -.045 : -.025;
      const targetY=dragging ? -ty : inspecting ? 0 : hovering ? .055 : 0;
      const targetZ=dragging ? -rz : inspecting ? 0 : THREE.MathUtils.degToRad(fan);
      const lerp=this.reducedMotion ? 1 : 1-Math.exp(-delta*24);
      item.rotation.x=THREE.MathUtils.lerp(item.rotation.x,targetX,lerp);
      item.rotation.y=THREE.MathUtils.lerp(item.rotation.y,targetY,lerp);
      item.rotation.z=THREE.MathUtils.lerp(item.rotation.z,targetZ,lerp);
      this.rotation.setFromEuler(item.rotation);
      mesh.quaternion.copy(this.camera.quaternion).multiply(this.rotation);
      const scale=element.offsetHeight/innerHeight*worldHeight/mesh.userData.cardHeight;
      mesh.scale.setScalar(scale*(inspecting?1.22:dragging?1.055:hovering?1.015:1));
    }
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
