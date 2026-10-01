import { CardImpactFlow } from './CardImpactFlow';
import { overflowQuake } from '../ui/totalFeedback';
import { OverflowFireworks } from './OverflowFireworks';
import { CardHandoff } from './CardHandoff';
import type { CardSpin } from '../ui/cardGesture';
import { avatarAnchor } from '../ui/avatarLayout';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { QUALITY_PRESETS, type QualityPreset } from './quality';
import { ObservatoryTable, ArcaneTotalRing } from './ObservatoryTable';
import { PhysicalHand } from './PhysicalHand';
import { CLEAN_CARD_LAYER, createCardMesh } from './CardMesh';
import { cardFaceFromUrl } from '../game/cardFace';
import { cardFaceTexture } from './CardFaceTexture';
import { CardPile } from './CardPile';
import { flyingCardFlex } from './CardFlex';

type SceneState = {
  pendingPlay?: boolean;
  playKey?: string;
  totalPending?: boolean;
  active: boolean;
  total: number;
  direction: 1 | -1;
  event: string;
  playerCount: number;
  localSeat: number;
  eventKey?: string;
  activeSeat?: number;
  drawCount?: number;
  discardCount?: number;
  drawCardUrl: string;
  discardCardUrl?: string;
  discardCards?: string[];
};

export class ObservatoryScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 80);
  private clock = new THREE.Clock();
  private frame = 0;
  private lastRafTime = 0;
  private frameAccumulator = 0;
  private renderScale = 1;
  private fastSamples = 0;
  private activeFlights = 0;
  private handoff = new CardHandoff();
  private active = false;
  private contextLost=false;
  private quality: QualityPreset = 'high';
  private reducedMotion = false;
  private qualityConfigured = false;
  private composer?: EffectComposer;
  private bloom?: UnrealBloomPass;
  private ao?: SSAOPass;
  private cardMasks = new WeakMap<THREE.Material, THREE.Material>();
  private table = new ObservatoryTable();
  private cardFlow = new CardImpactFlow();
  private playKey = '';
  private pendingOverflow = false;
  onCardArrival?: (key: string) => void;
  get canAnimate(): boolean { return !this.contextLost; }
  private totalPulse?: Animation;
  private ring = new ArcaneTotalRing();
  private fireworks = new OverflowFireworks();
  private overflowAge=4;
  private hand!: PhysicalHand;
  private environment!: THREE.WebGLRenderTarget;
  private lastEventKey = '';
  private eventKind = 'none';
  private impact = 0;

  private ceilingLight = new THREE.SpotLight(0xeee2d3, 145, 23, .71, .82, 1.5);
  private lastSeatUpdate = -1;
  private seatProjectionDirty = true;
  private profileTime=0;
  private profileFrames=0;
  private profileDelta=0;
  private world = new THREE.Group();

  private textureLoader = new THREE.TextureLoader();
  private textureCache = new Map<string, Promise<THREE.Texture>>();
  private loadedTextures = new Map<string, THREE.Texture>();
  private textureLastUsed = new Map<string, number>();
  private pruneTimer = 0;
  private deckPile!: CardPile;
  private discardPile!: CardPile;
  private deckStack!: THREE.Group;
  private discardStack!: THREE.Group;
  private pileShadows: THREE.Mesh[] = [];
  private drawCardUrl = '';
  private playerCount = 0;
  private currentTotal=0;
  private flowColor():string{return `hsl(${43*(1-Math.max(0,Math.min(1,this.currentTotal/100)))} 100% 65%)`;}
  private localSeat = 0;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset=false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setClearColor(0x03050a, 1);
    this.renderer.domElement.className = 'world3d-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    document.body.prepend(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();this.contextLost=true;this.onCardArrival?.(this.playKey);this.renderer.domElement.hidden=true;document.documentElement.classList.remove('world3d-active','world3d-total');});
    this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.renderer.domElement.hidden=!this.active;document.documentElement.classList.toggle('world3d-active',this.active);document.documentElement.classList.toggle('world3d-total',this.active);});

    this.scene.background = new THREE.Color(0x03050a);
    this.scene.fog = new THREE.FogExp2(0x03050a, .025);
    this.buildWorld();

    const pmrem=new THREE.PMREMGenerator(this.renderer);
    const room=new RoomEnvironment();
    this.environment=pmrem.fromScene(room,.025);
    this.scene.environment=this.environment.texture;
    this.scene.environmentIntensity=.18;
    room.dispose();pmrem.dispose();
    this.hand=new PhysicalHand(this.scene,this.camera,url=>this.loadTexture(url));
    this.resize();
    this.renderer.shadowMap.needsUpdate = true;
    addEventListener('resize', this.resize, { passive: true });
    this.loop();
  }

  set qualityHigh(value: boolean) { this.configure({quality:value?'high':'mobile',reducedMotion:this.reducedMotion}); }

  private configurePostProcessing(budget: typeof QUALITY_PRESETS[QualityPreset]): void {
    if (!budget.bloom) {
      this.composer?.dispose();this.bloom?.dispose();this.ao?.dispose();
      this.composer=undefined;this.bloom=undefined;this.ao=undefined;
      return;
    }
    if (!this.composer) {
      this.composer=new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene,this.camera));
      this.ao=new SSAOPass(this.scene,this.camera,innerWidth,innerHeight);
      this.ao.kernelRadius=4;this.ao.minDistance=.003;this.ao.maxDistance=.045;
      this.composer.addPass(this.ao);
      this.bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),budget.bloomStrength,.38,1.65);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.bloom!.strength=budget.bloomStrength;
    this.ao!.enabled=budget.ambientOcclusion;
  }

  configure(options: {quality:QualityPreset; reducedMotion:boolean}): void {
    if(this.qualityConfigured && this.quality===options.quality && this.reducedMotion===options.reducedMotion) return;
    const qualityChanged = !this.qualityConfigured || this.quality !== options.quality;
    this.qualityConfigured=true;
    this.quality=options.quality;
    this.reducedMotion=options.reducedMotion;
    if (qualityChanged) this.renderScale = 1;
    const budget=QUALITY_PRESETS[this.quality];
    if (qualityChanged) this.configurePostProcessing(budget);
    this.scene.environmentIntensity=budget.reflections?.22:.18;
    if (qualityChanged) {
      this.ceilingLight.shadow.mapSize.set(budget.shadowMapSize,budget.shadowMapSize);
      this.ceilingLight.shadow.map?.dispose();
      this.ceilingLight.shadow.map=null;
    }
    this.hand.configure(options.reducedMotion);
    this.ring.configure(options.quality);
    this.table.configure(options.quality);
    this.fireworks.configure(options.quality);
    this.discardPile.setDetail(options.quality==='ultra'?14:options.quality==='high'?10:options.quality==='medium'?7:4);
    this.resize();
    this.renderer.shadowMap.needsUpdate = true;
  }

  update(next: SceneState): void {
    this.active = next.active;
    this.playerCount = next.playerCount;
    this.currentTotal=next.total;
    this.localSeat = next.localSeat;
    this.seatProjectionDirty = true;
    this.ring.setDirection(next.direction);
    this.ring.setTotal(next.total);
    this.table.setTotal(next.total);
    this.playKey = next.active?(next.playKey??''):'';
    this.cardFlow.setCard(this.playKey);
    if (!next.active || next.event === 'none') this.pendingOverflow = false;
    this.drawCardUrl = next.drawCardUrl;
    this.pileShadows[0].visible = (next.drawCount ?? 0) > 0;
    this.pileShadows[1].visible = (next.discardCount ?? 0) > 0;
    const deckUpdate = this.deckPile.setCards(Array.from({length:next.drawCount??0},()=>next.drawCardUrl),next.drawCardUrl);
    const discardUpdate = this.discardPile.setCards(next.discardCards??(next.discardCardUrl?[next.discardCardUrl]:[]),next.drawCardUrl);
    void Promise.allSettled([deckUpdate,discardUpdate]).then(()=>{
      this.renderer.shadowMap.needsUpdate=true;
      clearTimeout(this.pruneTimer);
      this.pruneTimer=window.setTimeout(()=>this.pruneTextureCache(),300);
    });
    const key=next.eventKey??`${next.total}:${next.discardCardUrl}:${next.event}`;
    if(!next.active || (next.event==='none'&&key!==this.lastEventKey)){this.overflowAge=4;this.fireworks.trigger(true);}
    if(!next.active)this.handoff.clear();
    else void this.handoff.sync(key,!!next.pendingPlay,discardUpdate).catch(()=>undefined);
    if(key!==this.lastEventKey){
      if(this.lastEventKey){if(next.total>100&&next.event==='bust'){if(next.totalPending)this.pendingOverflow=true;else{this.overflowAge=0;this.fireworks.trigger(this.reducedMotion);}}this.impact=1;this.eventKind=next.event;this.ring.trigger(next.event);}
      this.lastEventKey=key;
    }
    this.renderer.domElement.hidden = !next.active||this.contextLost;
    document.documentElement.classList.toggle('world3d-active', next.active&&!this.contextLost);
    document.documentElement.classList.toggle('world3d-total', next.active&&!this.contextLost);
  }

  private buildWorld(): void {
    this.scene.add(this.world);
    this.world.position.z=-.35;
    this.scene.add(new THREE.HemisphereLight(0x7485ba,0x080811,.27));
    this.ceilingLight.position.set(-.7,9,1.1);
    this.ceilingLight.target.position.set(0,.35,-.5);
    this.ceilingLight.castShadow=true;
    this.ceilingLight.shadow.bias=-.0003;
    this.ceilingLight.shadow.normalBias=.018;
    this.ceilingLight.shadow.radius=5;
    this.scene.add(this.ceilingLight,this.ceilingLight.target);
    const rim=new THREE.DirectionalLight(0x6669bc,.7);rim.position.set(2,2,-5);this.scene.add(rim);
    this.world.add(this.table.group,this.ring.group,this.fireworks.points);
    this.deckPile=new CardPile(true,url=>this.loadTexture(url));
    this.discardPile=new CardPile(false,url=>this.loadTexture(url));
    this.deckStack=this.deckPile.group;this.discardStack=this.discardPile.group;
    this.deckStack.position.set(-2.42,0,-.06);this.deckStack.rotation.y=-.06;
    this.discardStack.position.set(2.42,0,-.06);this.discardStack.rotation.y=.06;
    this.world.add(this.deckStack,this.discardStack);
    const pixels=new Uint8Array(64*64*4);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const radius=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5);
      const index=(y*64+x)*4;
      pixels[index+3]=Math.round(165*Math.pow(Math.max(0,1-radius),1.4));
    }
    const texture=new THREE.DataTexture(pixels,64,64,THREE.RGBAFormat);
    texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;
    const shadowMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
    const shadowGeometry=new THREE.PlaneGeometry(1.75,2.25);
    for(const stack of [this.deckStack,this.discardStack]){
      const shadow=new THREE.Mesh(shadowGeometry,shadowMaterial);
      shadow.rotation.x=-Math.PI/2;
      shadow.position.set(stack.position.x,.3485,stack.position.z);
      shadow.visible=false;
      this.pileShadows.push(shadow);
      this.world.add(shadow);
    }
  }

  private loadTexture(url: string): Promise<THREE.Texture> {
    this.textureLastUsed.set(url, performance.now());
    let pending = this.textureCache.get(url);
    if (!pending) {
      pending = this.textureLoader.loadAsync(url).then(async loaded => {
        const face = cardFaceFromUrl(url);
        const texture = face ? await cardFaceTexture(loaded, face) : loaded;
        if (texture !== loaded) loaded.dispose();
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(QUALITY_PRESETS[this.quality].textureAnisotropy, this.renderer.capabilities.getMaxAnisotropy());
        this.loadedTextures.set(url, texture);
        return texture;
      }).catch(error => {
        this.textureCache.delete(url);
        this.textureLastUsed.delete(url);
        throw error;
      });
      this.textureCache.set(url, pending);
    }
    return pending;
  }

  /** Keep only a small warm set of high-resolution cards in GPU memory. */
  private pruneTextureCache(): void {
    const maximum = 14;
    if (this.loadedTextures.size <= maximum) return;
    const active = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => {
        const map = (material as THREE.MeshBasicMaterial).map;
        if (map) active.add(map);
      });
    });
    const unused = [...this.loadedTextures.entries()]
      .filter(([,texture]) => !active.has(texture))
      .sort(([a],[b]) => (this.textureLastUsed.get(a)??0) - (this.textureLastUsed.get(b)??0));
    for (const [url, texture] of unused) {
      if (this.loadedTextures.size <= maximum) break;
      texture.dispose();
      this.loadedTextures.delete(url);
      this.textureCache.delete(url);
      this.textureLastUsed.delete(url);
    }
  }

  private screenPoint(rect: DOMRect, distance: number): THREE.Vector3 {
    const x = (rect.left + rect.width / 2) / innerWidth * 2 - 1;
    const y = -(rect.top + rect.height / 2) / innerHeight * 2 + 1;
    const direction = new THREE.Vector3(x, y, .35).unproject(this.camera).sub(this.camera.position).normalize();
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);
    return this.camera.position.clone().add(direction.multiplyScalar(distance/direction.dot(forward)));
  }

  private screenScale(rect: DOMRect, distance: number): number {
    const worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * .5));
    return Math.max(.46, Math.min(1.65, rect.height / innerHeight * worldHeight / 1.43));
  }

  private tablePoint(x: number, y: number, z: number): THREE.Vector3 {
    this.world.updateMatrixWorld(true);
    return this.world.localToWorld(new THREE.Vector3(x, y, z));
  }

  private pilePoint(side: -1 | 1, y: number): THREE.Vector3 {
    this.world.updateMatrixWorld(true);
    return (side < 0 ? this.deckStack : this.discardStack).localToWorld(new THREE.Vector3(0, y, 0));
  }

  private async makeFlyingCard(frontUrl: string): Promise<{ root: THREE.Group; visual: THREE.Group }> {
    const [frontTexture, backTexture] = await Promise.all([
      this.loadTexture(frontUrl),
      this.loadTexture(this.drawCardUrl || frontUrl),
    ]);
    const root = new THREE.Group();
    root.visible = false;
    const visual = new THREE.Group();
    visual.add(createCardMesh(frontTexture,backTexture,/-[789]|-10\./.test(frontUrl)));
    root.add(visual);
    this.scene.add(root);
    return { root, visual };
  }

  private animateCardFlight(options: {
    root: THREE.Group;
    visual: THREE.Group;
    start: THREE.Vector3;
    end: THREE.Vector3;
    startQuaternion: THREE.Quaternion;
    endQuaternion: THREE.Quaternion;
    startScale: number;
    endScale: number;
    draw: boolean;
    spin?: CardSpin;
    onStart?: () => void;
    onArrive?: () => void;
  }): Promise<void> {
    const { root, visual, start, end, startQuaternion, endQuaternion, startScale, endScale, draw, spin, onStart, onArrive } = options;
    const control = start.clone().lerp(end, .5);
    control.y += draw ? .85 : .65;
    control.z += draw ? .45 : -.3;
    root.position.copy(start);
    root.visible = true;
    root.quaternion.copy(startQuaternion);
    root.scale.setScalar(startScale);
    visual.rotation.y = draw ? Math.PI : 0;
    const flex=flyingCardFlex(visual);
    onStart?.();
    this.hand.update(0);
    const started = performance.now();
    const duration = this.reducedMotion ? 80 : draw ? 520 : spin ? (spin.turns===2?720:560) : 440;
    const spinAxis=spin?new THREE.Vector3(spin.x,spin.y,spin.z):undefined;
    const spinRotation=new THREE.Quaternion();
    return new Promise(resolve => {
      this.activeFlights++;
      const step = (now: number): void => {
        const raw = Math.min(1, (now - started) / duration);
        const flightT = draw ? raw : Math.min(1,raw/.86);
        const t = flightT*flightT*(3-2*flightT);
        const inverse = 1 - t;
        root.position.set(
          inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
          inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
          inverse * inverse * start.z + 2 * inverse * t * control.z + t * t * end.z,
        );
        if(!draw && raw>.86)root.position.y+=Math.sin((raw-.86)/.14*Math.PI)*.075;
        root.quaternion.slerpQuaternions(startQuaternion, endQuaternion, t);
        root.scale.setScalar(THREE.MathUtils.lerp(startScale, endScale, t));
        flex(this.reducedMotion?0:Math.sin(raw*Math.PI)*(draw?.09:.2));
        visual.rotation.set(0,draw ? Math.PI * (1 - t) : Math.sin(raw * Math.PI) * .24,Math.sin(raw * Math.PI) * (draw ? -.16 : .24));
        if(spin && spinAxis && !this.reducedMotion){
          spinRotation.setFromAxisAngle(spinAxis,spin.turns*Math.PI*2*t);
          visual.quaternion.premultiply(spinRotation);
        }
        if (raw < 1) requestAnimationFrame(step);
        else {
          this.activeFlights--;
          this.renderer.shadowMap.needsUpdate = true;
          onArrive?.();
          this.hand.update(0);
          const release=()=>{
            this.scene.remove(root);
            root.traverse(object => {
              if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                const materials=Array.isArray(object.material)?object.material:[object.material];
                materials.forEach(material=>material.dispose());
              }
            });
            this.pruneTextureCache();
          };
          if(draw)release();
          else this.handoff.retain(this.lastEventKey,release);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  async playCardToDiscard(frontUrl: string, sourceRect: DOMRect, spin?:CardSpin, cardId?:string, onStart?:()=>void, onReady?:()=>Promise<DOMRect|undefined>): Promise<void> {
    const { root, visual } = await this.makeFlyingCard(frontUrl);
    let handRect: DOMRect | undefined;
    try { handRect = await onReady?.(); }
    catch (error) {
      this.scene.remove(root);
      root.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } });
      throw error;
    }
    if (handRect) sourceRect = handRect;
    const distance = innerHeight > innerWidth * 1.08 ? 4.9 : 5.35;
    const pose=cardId?this.hand.cardPose(cardId):undefined;
    const start = pose?.position??this.screenPoint(sourceRect, distance);
    const landing = this.discardPile.cardPose(this.discardPile.count);
    const end = landing.position;
    const startQuaternion = pose?.quaternion??this.camera.quaternion.clone();
    const endQuaternion = landing.quaternion;
    await this.animateCardFlight({ root, visual, start, end, startQuaternion, endQuaternion, startScale: pose?.scale??this.screenScale(sourceRect, distance), endScale: 1, draw: false, spin, onStart });
  }

  async drawCardToHand(frontUrl: string, targetRect: DOMRect, cardId?:string, onArrive?:()=>void): Promise<void> {
    const { root, visual } = await this.makeFlyingCard(frontUrl);
    const distance = innerHeight > innerWidth * 1.08 ? 4.85 : 5.15;
    const drawn = this.deckPile.cardPose(this.deckPile.count);
    const start = drawn.position;
    this.hand.update(0);
    const pose=cardId?this.hand.cardPose(cardId):undefined;
    const end = pose?.position??this.screenPoint(targetRect, distance);
    const startQuaternion = drawn.quaternion;
    const endQuaternion = pose?.quaternion??this.camera.quaternion.clone();
    await this.animateCardFlight({ root, visual, start, end, startQuaternion, endQuaternion, startScale: 1, endScale: pose?.scale??this.screenScale(targetRect, distance), draw: true, onArrive });
  }

  private positionSeatOverlays(): void {
    if (!this.active || !this.playerCount) return;
    const layer = document.querySelector<HTMLElement>('.seat-layer');
    if (!layer) return;
    const bounds = layer.getBoundingClientRect();
    document.querySelectorAll<HTMLElement>('.table-cards .pile-wrap').forEach((pile,index)=>{
      const point=this.pilePoint(index===0?-1:1,.35);point.z+=.91;point.project(this.camera);
      pile.style.setProperty('--pile-label-x',`${(point.x*.5+.5)*innerWidth}px`);
      pile.style.setProperty('--pile-label-y',`${(-point.y*.5+.5)*innerHeight+7}px`);
    });
    const portrait=innerHeight>innerWidth*1.08;
    const total=this.tablePoint(0,.40,portrait ? .45 : 1.05).project(this.camera);
    document.documentElement.style.setProperty('--total-x',`${(total.x*.5+.5)*innerWidth}px`);
    document.documentElement.style.setProperty('--total-y',`${(-total.y*.5+.5)*innerHeight}px`);
    this.projectPlayerRing();
    for (let playerIndex=0;!layer.classList.contains('player-ring') && playerIndex<this.playerCount;playerIndex++) {
      const seat=layer.querySelector<HTMLElement>(`.seat[data-seat="${playerIndex}"]`);
      if(!seat)continue;
      const {x,y}=avatarAnchor(playerIndex,this.localSeat,this.playerCount,portrait);
      seat.style.setProperty('--seat-chair-x',`${x*innerWidth-bounds.left}px`);
      seat.style.setProperty('--seat-chair-y',`${y*innerHeight-bounds.top}px`);
    }
  }

  /** Clip busts at the projected far rim, so the tabletop covers their lower bodies. */
  projectPlayerRing(): void {
    if (!this.active) return;
    const layer = document.querySelector<HTMLElement>('.seat-layer.player-ring');
    if (!layer) return;
    this.world.updateMatrixWorld(true);
    const rim = Array.from({length:97},(_,i)=>{
      const angle=i/96*Math.PI*2;
      const point=this.table.group.localToWorld(new THREE.Vector3(Math.cos(angle)*5.02,.355,Math.sin(angle)*5.02)).project(this.camera);
      return {x:(point.x*.5+.5)*innerWidth,y:(-point.y*.5+.5)*innerHeight};
    });
    const edgeAt=(x:number):number=>{
      let y=Infinity;
      for(let i=1;i<rim.length;i++){
        const a=rim[i-1],b=rim[i];
        if(x<Math.min(a.x,b.x)||x>Math.max(a.x,b.x)||Math.abs(b.x-a.x)<.001)continue;
        y=Math.min(y,a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x));
      }
      return Number.isFinite(y)?y:rim.reduce((closest,p)=>Math.abs(p.x-x)<Math.abs(closest.x-x)?p:closest).y;
    };
    const seats=Array.from(layer.querySelectorAll<HTMLElement>('.seat:not([hidden])'));
    // Position every seat first, then read bounds together to avoid repeated reflow.
    seats.forEach(seat=>{
      const x=parseFloat(seat.style.getPropertyValue('--ring-x'))/100*innerWidth;
      seat.style.setProperty('--table-seat-y',`${edgeAt(x)}px`);
    });
    const bounds=seats.map(seat=>seat.getBoundingClientRect());
    seats.forEach((seat,index)=>{
      const rect=bounds[index];
      if(rect.width<1)return;
      const ratio=seat.offsetWidth/rect.width;
      const padding=24/seat.offsetWidth;
      const points=Array.from({length:9},(_,i)=>{
        const fraction=1+padding-i/8*(1+padding*2);
        const y=Math.max(0,Math.min(seat.offsetHeight+24,(edgeAt(rect.left+rect.width*fraction)-rect.top)*ratio));
        return `${fraction*100}% ${y.toFixed(1)}px`;
      });
      seat.style.setProperty('--table-seat-clip',`polygon(-24px -24px,calc(100% + 24px) -24px,${points.join(',')})`);
    });
  }

  private resize = (): void => {
    const portrait = innerHeight > innerWidth * 1.08;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.fov = portrait ? 46 : 42;
    this.camera.position.set(0, portrait ? 10.0 : 7.0, portrait ? 14.2 : 11.0);
    this.world.rotation.x = .18;
    this.table.group.scale.set(portrait ? 1.30 : 1.38,1,.70);
    this.camera.lookAt(0, portrait ? .6 : .45, portrait ? .1 : -.3);
    this.camera.updateProjectionMatrix();
    const budget = QUALITY_PRESETS[this.quality];
    const pixelBudget = Math.sqrt((this.quality === 'ultra' ? 6_000_000 : 4_000_000) / Math.max(1, innerWidth * innerHeight));
    const pixelRatio = Math.min(devicePixelRatio, budget.pixelRatio * this.renderScale, pixelBudget);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.shadowMap.enabled = budget.shadows;
    this.composer?.setPixelRatio(pixelRatio);
    this.composer?.setSize(innerWidth,innerHeight);
    this.renderer.domElement.dataset.pixelRatio = pixelRatio.toFixed(2);
    this.renderer.shadowMap.needsUpdate = true;
    this.seatProjectionDirty = true;
    if (this.deckStack && this.discardStack) {
      const pileX = portrait ? 1.05 : 3.65;
      const pileZ = portrait ? 2.3 : 1.0;
      this.deckStack.position.set(-pileX, 0, pileZ);
      // Cancel the tabletop's oval stretch without distorting the card-sized cradle.
      this.table.group.updateMatrix();this.deckStack.updateMatrix();
      this.table.cradle.matrixAutoUpdate=false;
      this.table.cradle.matrix.copy(this.table.group.matrix).invert().multiply(this.deckStack.matrix);
      this.discardStack.position.set(pileX, 0, pileZ);
      this.pileShadows[0].position.set(-pileX,.3485,pileZ);
      this.pileShadows[1].position.set(pileX,.3485,pileZ);
    }
  };

  private animate(time: number, delta: number): void {
    const portrait = innerHeight > innerWidth * 1.08;
    const baseX = 0;
    const baseY = portrait ? 10.0 : 7.0;
    const baseZ = portrait ? 14.2 : 11.0;
    const beat=this.reducedMotion?0:Math.sin((1-this.impact)*Math.PI);
    const orbit=this.eventKind==='reverse'?beat*.12:0;
    const punch=['zero','minus','bust'].includes(this.eventKind)?beat*(this.eventKind==='bust'?.42:.2):0;
    this.overflowAge+=delta;
    const quake=overflowQuake(this.overflowAge,this.reducedMotion);
    this.fireworks.update(delta,this.reducedMotion);
    const shake=this.eventKind==='bust'||this.eventKind==='minus'?Math.sin(time*54)*beat*.028:0;
    this.camera.position.set(baseX+Math.sin(orbit)*baseZ+shake+quake.x,baseY-punch+quake.y,Math.cos(orbit)*baseZ-punch+quake.z);
    this.camera.lookAt(0,portrait?.6:.45,portrait?.1:-.3);
    this.camera.rotateZ(quake.roll);
    this.camera.updateMatrixWorld();
    if(time-this.lastSeatUpdate>.04 && (this.seatProjectionDirty || this.impact>0 || this.overflowAge<2.4 || this.eventKind!=='none')){
      this.positionSeatOverlays();this.lastSeatUpdate=time;this.seatProjectionDirty=false;
    }
    const flow=this.cardFlow.update(delta,this.reducedMotion);
    this.table.setFlow(flow.progress,flow.strength);
    if(flow.arrival){
      this.onCardArrival?.(this.playKey);
      if (this.pendingOverflow) {
        this.pendingOverflow=false;this.overflowAge=0;this.fireworks.trigger(this.reducedMotion);
      }
      this.ring.receiveCard();
      const total=document.querySelector<HTMLElement>('.total-number');
      if(total&&!total.closest('.busted')){
        this.totalPulse?.cancel();
        const color=this.flowColor();
        this.totalPulse=total.animate([
          {scale:'1',textShadow:`0 0 0 ${color}`},
          {scale:'1.07',textShadow:`0 0 22px ${color},0 0 44px ${color}`,offset:.28},
          {scale:'1',textShadow:'0 3px 0 #6a5a40,0 9px 20px #0009'}
        ],{duration:360,easing:'ease-out'});
      }
    }
    this.ring.update(delta,this.reducedMotion);
    this.hand.update(delta);
    if(this.impact===0)this.eventKind='none';
    this.impact=Math.max(0,this.impact-delta/1.05);
  }

  /** Keep bloom/AO on the room while drawing the printed cards without either. */
  private renderWithCleanCards(): void {
    const cards: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; visible: boolean }[] = [];
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.userData.cleanCard) return;
      cards.push({ mesh: object, material: object.material, visible: object.visible });
      // The foil is composited only in the clean pass; it never feeds bloom.
      if (object.userData.cardFoil) { object.visible = false; return; }
      const mask = (material: THREE.Material): THREE.Material => {
        let cached = this.cardMasks.get(material);
        if (!cached) {
          // Retain the artwork alpha silhouette/depth, but contribute no light
          // or color to bloom. The original artwork is drawn below afterward.
          const black = material.clone() as THREE.MeshBasicMaterial;
          black.color.set(0x000000);
          black.toneMapped = false;
          this.cardMasks.set(material, black);
          const disposeMask = () => {
            black.dispose();
            this.cardMasks.delete(material);
            material.removeEventListener('dispose', disposeMask);
          };
          material.addEventListener('dispose', disposeMask);
          cached = black;
        }
        return cached;
      };
      object.material = Array.isArray(object.material) ? object.material.map(mask) : mask(object.material);
    });
    try {
      this.composer!.render();
    } finally {
      cards.forEach(card => { card.mesh.material = card.material; card.mesh.visible = card.visible; });
    }
    if (!cards.length) return;

    const colorWrites = new Map<THREE.Material, boolean>();
    const background = this.scene.background;
    const cameraLayers = this.camera.layers.mask;
    const autoClear = this.renderer.autoClear;
    const shadowUpdate = this.renderer.shadowMap.autoUpdate;
    const shadowNeedsUpdate = this.renderer.shadowMap.needsUpdate;
    try {
      // The composer output has no usable room depth on the default framebuffer.
      // Rebuild depth without changing its color, then draw only the clean cards.
      // This keeps a flying card correctly hidden behind the table and piles.
      this.renderer.setRenderTarget(null);
      this.renderer.autoClear = false;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = false;
      this.scene.background = null;
      cards.forEach(card => { card.mesh.visible = false; });
      this.scene.traverse(object => {
        const material = (object as THREE.Mesh).material;
        if (!material || object.userData.cleanCard) return;
        const materials = Array.isArray(material) ? material : [material];
        materials.forEach(entry => {
          if (!colorWrites.has(entry)) colorWrites.set(entry, entry.colorWrite);
          entry.colorWrite = false;
        });
      });
      this.renderer.clearDepth();
      this.renderer.render(this.scene, this.camera);
      cards.forEach(card => { card.mesh.visible = card.visible; });
      this.camera.layers.set(CLEAN_CARD_LAYER);
      this.renderer.render(this.scene, this.camera);
    } finally {
      cards.forEach(card => { card.mesh.visible = card.visible; });
      colorWrites.forEach((value, material) => { material.colorWrite = value; });
      this.camera.layers.mask = cameraLayers;
      this.scene.background = background;
      this.renderer.autoClear = autoClear;
      this.renderer.shadowMap.autoUpdate = shadowUpdate;
      this.renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
    }
  }

  private loop = (stamp = performance.now()): void => {
    this.frame = requestAnimationFrame(this.loop);
    if (!this.active || document.hidden || this.contextLost) { this.clock.getDelta();this.lastRafTime=stamp;this.frameAccumulator=0;return; }
    const sinceLast = this.lastRafTime ? Math.min(50,stamp-this.lastRafTime) : 1000/60;
    this.lastRafTime=stamp;
    this.frameAccumulator=Math.min(50,this.frameAccumulator+sinceLast);
    if(this.frameAccumulator < 1000/60-1) return;
    this.frameAccumulator %= 1000/60;
    const realDelta=this.clock.getDelta();
    const delta = Math.min(.05, realDelta);
    this.profileFrames++;this.profileDelta+=realDelta;
    const time = this.clock.elapsedTime;
    this.animate(time, delta);
    if (this.activeFlights || (this.quality==='ultra' && this.impact>0)) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.info.reset();
    if(QUALITY_PRESETS[this.quality].bloom)this.renderWithCleanCards();else this.renderer.render(this.scene, this.camera);
    if(time-this.profileTime>2.4){
      const frameMs=this.profileDelta/this.profileFrames*1000;
      this.renderer.domElement.dataset.frameMs=frameMs.toFixed(1);
      this.renderer.domElement.dataset.drawCalls=String(this.renderer.info.render.calls);
      this.renderer.domElement.dataset.triangles=String(this.renderer.info.render.triangles);
      if(frameMs>19.5 && this.renderScale>.66){
        this.renderScale=Math.max(.65,this.renderScale-(frameMs>28?.15:.1));
        this.fastSamples=0;this.resize();
      } else if(frameMs<17.5 && this.renderScale<1){
        if(++this.fastSamples>=2){this.renderScale=Math.min(1,this.renderScale+.05);this.fastSamples=0;this.resize();}
      } else this.fastSamples=0;
      this.profileFrames=0;this.profileDelta=0;this.profileTime=time;
    }
  };

  dispose(): void {
    this.handoff.clear();
    this.totalPulse?.cancel();
    cancelAnimationFrame(this.frame);
    clearTimeout(this.pruneTimer);
    this.hand.dispose();this.composer?.dispose();this.bloom?.dispose();this.ao?.dispose();this.environment.dispose();
    this.deckPile.dispose();this.discardPile.dispose();
    removeEventListener('resize', this.resize);
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    this.textureCache.forEach(pending => void pending.then(texture => texture.dispose()));
    this.renderer.dispose();
    this.renderer.domElement.remove();
    document.documentElement.classList.remove('world3d-active','world3d-total');
  }
}
