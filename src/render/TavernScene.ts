import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { QUALITY_PRESETS, type QualityPreset } from './quality';
import { makeWorldMaterials, glowTexture } from './WorldMaterials';
import { ManifestedTotal } from './ManifestedTotal';
import { PhysicalHand } from './PhysicalHand';
import { CLEAN_CARD_LAYER, createCardMesh } from './CardMesh';
import { CardPile } from './CardPile';

type SceneState = {
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

const wood = (color: number, roughness = .72): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: .05 });

export class TavernScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 80);
  private clock = new THREE.Clock();
  private frame = 0;
  private active = false;
  private contextLost=false;
  private quality: QualityPreset = 'high';
  private reducedMotion = false;
  private qualityConfigured = false;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private ao!: SSAOPass;
  private cardMasks = new WeakMap<THREE.Material, THREE.Material>();
  private materials = makeWorldMaterials();
  private number = new ManifestedTotal();
  private hand!: PhysicalHand;
  private environment!: THREE.WebGLRenderTarget;
  private lastEventKey = '';
  private eventKind = 'none';
  private impact = 0;
  private candleFlames: THREE.Mesh[] = [];
  private fill = new THREE.DirectionalLight(0xffddad, 1.7);
  private roomDust!: THREE.Points;
  private lastSeatUpdate = -1;
  private activeSeat = 0;
  private profileTime=0;
  private profileFrames=0;
  private profileDelta=0;
  private total = 0;
  private targetPower = .16;
  private eventPulse = 0;
  private direction: 1 | -1 = 1;
  private pointer = new THREE.Vector2();
  private smoothPointer = new THREE.Vector2();
  private world = new THREE.Group();
  private energyGroup = new THREE.Group();
  private wellPower = .16;
  private centerLight = new THREE.PointLight(0xffb339, 7, 13, 1.45);
  private particles: THREE.Points;
  private particleBase: Float32Array;
  private floatingIslands: THREE.Group[] = [];
  private lanterns: THREE.Group[] = [];
  private stationChairs: THREE.Group[] = [];
  private textureLoader = new THREE.TextureLoader();
  private textureCache = new Map<string, Promise<THREE.Texture>>();
  private deckPile!: CardPile;
  private discardPile!: CardPile;
  private deckStack!: THREE.Group;
  private discardStack!: THREE.Group;
  private pileShadows: THREE.Mesh[] = [];
  private drawCardUrl = '';
  private playerCount = 0;
  private localSeat = 0;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset=false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x080a17, 1);
    this.renderer.domElement.className = 'world3d-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    document.body.prepend(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();this.contextLost=true;this.renderer.domElement.hidden=true;document.documentElement.classList.remove('world3d-active','world3d-total');});
    this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.renderer.domElement.hidden=!this.active;document.documentElement.classList.toggle('world3d-active',this.active);document.documentElement.classList.toggle('world3d-total',this.active);});

    this.scene.background = new THREE.Color(0x080a17);
    this.scene.fog = new THREE.FogExp2(0x090a16, .019);
    const particleSystem = this.makeParticles();
    this.particles = particleSystem.points;
    this.particleBase = particleSystem.base;
    this.buildWorld();
    this.world.add(this.number.group);
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    const room=new RoomEnvironment();
    this.environment=pmrem.fromScene(room,.025);
    this.scene.environment=this.environment.texture;
    this.scene.environmentIntensity=.32;
    room.dispose();pmrem.dispose();
    this.composer=new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.ao=new SSAOPass(this.scene,this.camera,innerWidth,innerHeight);this.ao.kernelRadius=4;this.ao.minDistance=.003;this.ao.maxDistance=.045;this.ao.enabled=false;this.composer.addPass(this.ao);
    this.bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.16,.38,1.65);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.hand=new PhysicalHand(this.scene,this.camera,url=>this.loadTexture(url));
    this.resize();
    addEventListener('resize', this.resize, { passive: true });
    addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.loop();
  }

  set qualityHigh(value: boolean) { this.configure({quality:value?'high':'mobile',reducedMotion:this.reducedMotion}); }

  configure(options: {quality:QualityPreset; reducedMotion:boolean}): void {
    if(this.qualityConfigured && this.quality===options.quality && this.reducedMotion===options.reducedMotion) return;
    this.qualityConfigured=true;
    this.quality=options.quality;
    this.reducedMotion=options.reducedMotion;
    const budget=QUALITY_PRESETS[this.quality];
    this.bloom.strength=budget.bloomStrength;this.ao.enabled=budget.ambientOcclusion;
    this.scene.environmentIntensity=budget.reflections?.32:.18;
    let dynamic=0;
    this.scene.traverse(object=>{
      if(object instanceof THREE.PointLight && object!==this.centerLight) object.visible=dynamic++<budget.dynamicLights-1;
      if(object instanceof THREE.DirectionalLight && object.castShadow){object.shadow.mapSize.set(budget.shadowMapSize,budget.shadowMapSize);object.shadow.map?.dispose();object.shadow.map=null;}
    });
    this.hand.configure(options.reducedMotion);
    this.particles.geometry.setDrawRange(0,budget.particleCount);
    this.resize();
  }

  update(next: SceneState): void {
    this.active = next.active;
    this.total = Math.max(0, next.total);
    this.targetPower = .16 + Math.min(1, this.total / 100) * .78;
    this.direction = next.direction;
    this.playerCount = next.playerCount;
    this.localSeat = next.localSeat;
    this.activeSeat=next.activeSeat??0;
    this.number.set(next.total);
    this.drawCardUrl = next.drawCardUrl;
    this.pileShadows[0].visible = (next.drawCount ?? 0) > 0;
    this.pileShadows[1].visible = (next.discardCount ?? 0) > 0;
    void this.deckPile.setCards(Array.from({length:next.drawCount??0},()=>next.drawCardUrl),next.drawCardUrl).catch(()=>undefined);
    void this.discardPile.setCards(next.discardCards??(next.discardCardUrl?[next.discardCardUrl]:[]),next.drawCardUrl).catch(()=>undefined);
    const key=next.eventKey??`${next.total}:${next.discardCardUrl}:${next.event}`;
    if(key!==this.lastEventKey){
      if(this.lastEventKey){this.eventPulse=next.event==='exact'?1.6:next.event==='bust'?1.25:.8;this.impact=1;this.eventKind=next.event;}
      this.lastEventKey=key;
    }
    this.renderer.domElement.hidden = !next.active||this.contextLost;
    document.documentElement.classList.toggle('world3d-active', next.active&&!this.contextLost);
    document.documentElement.classList.toggle('world3d-total', next.active&&!this.contextLost);
  }

  private buildWorld(): void {
    this.scene.add(this.world);
    this.world.position.z = -.35;
    this.addLighting();
    this.addSkyAndArchitecture();
    this.addTable();
    this.addPlayerStations();
    this.addWell();
    this.addProps();
  }

  private addLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0x98afe5, 0x815345, 2.1));
    const moon = new THREE.DirectionalLight(0x8ba9ff, 2.15);
    moon.position.set(-4, 9, -5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.bias=-.0004;moon.shadow.normalBias=.045;moon.shadow.radius=3;
    moon.shadow.camera.left = -8; moon.shadow.camera.right = 8;
    moon.shadow.camera.top = 7; moon.shadow.camera.bottom = -5;
    this.scene.add(moon);
    const warm = new THREE.DirectionalLight(0xffad63, 2.9);
    warm.position.set(5, 6, 6);
    this.scene.add(warm);
    this.fill.position.set(0,5,10);this.scene.add(this.fill);
    this.centerLight.position.set(0, 2.1, -.65);
    this.centerLight.castShadow = false;
    this.scene.add(this.centerLight);
  }

  private addSkyAndArchitecture(): void {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(45, 22), new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: { uColorA: { value: new THREE.Color(0x0c1746) }, uColorB: { value: new THREE.Color(0x4950a2) } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec2 vUv;uniform vec3 uColorA;uniform vec3 uColorB;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){vec3 c=mix(uColorA,uColorB,pow(vUv.y,1.3));float s=step(.992,h(floor(vUv*vec2(120.,68.))));c+=s*(.55+.45*sin(vUv.x*81.))*vec3(.75,.86,1.);gl_FragColor=vec4(c,1.);}`,
    }));
    sky.position.set(0, 6, -19);
    this.world.add(sky);

    const stoneGeo = new RoundedBoxGeometry(1.02, .5, .5,2,.04);
    const stoneMat = this.materials.stone;
    const transforms: THREE.Matrix4[] = [];
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 5; col++) {
        const y = -.25 + row * .54;
        const offset = row % 2 ? .26 : 0;
        transforms.push(new THREE.Matrix4().makeTranslation(-7.65 + col * 1.02 + offset, y, -7.55));
        transforms.push(new THREE.Matrix4().makeTranslation(3.55 + col * 1.02 + offset, y, -7.55));
      }
    }
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const z = -6.9 + col * 1.05;
        const y = -.25 + row * .54;
        const left = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-8.4, y, z);
        const right = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(8.4, y, z);
        transforms.push(left, right);
      }
    }
    const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, transforms.length);
    transforms.forEach((matrix, index) => {stones.setMatrixAt(index, matrix);stones.setColorAt(index,new THREE.Color().setHSL(.08+(index%5)*.01,.08,.52+(index%7)*.025));});
    stones.receiveShadow = true;
    this.world.add(stones);

    const beamMaterial = this.materials.wood;
    [-7.6, -4.8, 4.8, 7.6].forEach(x => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(.32, 7.4, .42), beamMaterial);
      beam.position.set(x, 2.65, -7.15);
      beam.castShadow = true;
      this.world.add(beam);
    });
    const overhead = new THREE.Mesh(new THREE.BoxGeometry(16.5, .42, .5), beamMaterial);
    overhead.position.set(0, 6.2, -7.1);
    this.world.add(overhead);

    this.addArch(-2.85, .95);
    this.addArch(0, 1.08);
    this.addArch(2.85, .95);
    this.addDistantCity();
    this.addExteriorDepth();
  }

  private addArch(x: number, scale: number): void {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x463547, roughness: .78 });
    const columnGeo = new THREE.BoxGeometry(.25 * scale, 3.3 * scale, .28);
    [-1, 1].forEach(side => {
      const column = new THREE.Mesh(columnGeo, frameMat);
      column.position.set(x + side * 1.05 * scale, 3.1 * scale, -7.05);
      column.castShadow = true;
      this.world.add(column);
    });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.05 * scale, .16 * scale, 8, 30, Math.PI), frameMat);
    arch.position.set(x, 4.75 * scale, -7.05);
    this.world.add(arch);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2.45 * scale, .24, .5), frameMat);
    sill.position.set(x, 1.45 * scale, -6.95);
    this.world.add(sill);
  }

  private addDistantCity(): void {
    const cityMat = new THREE.MeshBasicMaterial({ color: 0x18235c });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffd879 });
    [-4.2, -3.35, -2.1, -.9, .15, 1.2, 2.3, 3.45, 4.25].forEach((x, index) => {
      const height = 1.15 + (index % 4) * .38;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(.22, .32, height, 6), cityMat);
      tower.position.set(x, 1.35 + height / 2, -7.85);
      this.world.add(tower);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(.39, .55, 6), cityMat);
      roof.position.set(x, 1.35 + height + .27, -7.85);
      this.world.add(roof);
      const windowLight = new THREE.Mesh(new THREE.PlaneGeometry(.09, .18), lightMat);
      windowLight.position.set(x, 1.55 + height * .45, -7.51);
      this.world.add(windowLight);
    });
    [-3.9, .7, 3.8].forEach((x, index) => {
      const island = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.55 + index * .08, 0), new THREE.MeshStandardMaterial({ color: 0x26305a, roughness: .9 }));
      rock.scale.y = .42;
      island.add(rock);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(.1, .18, .65, 6), cityMat);
      tower.position.y = .45;
      island.add(tower);
      island.position.set(x, 5.2 - index * .42, -7.72);
      this.floatingIslands.push(island);
      this.world.add(island);
    });
  }

  private addExteriorDepth():void {
    const windows:THREE.Matrix4[]=[];
    for(let layer=0;layer<3;layer++){
      const color=[0x343863,0x4b4674,0x5c5282][layer];
      const material=new THREE.MeshStandardMaterial({color,roughness:.9,emissive:color,emissiveIntensity:.2});
      const roofMat=new THREE.MeshStandardMaterial({color:0x27355b,roughness:.75,emissive:0x142240,emissiveIntensity:.2});
      for(let i=0;i<11;i++){
        const x=(i-5)*(1.2+layer*.3),height=1.1+((i*7+layer*3)%9)*.23,z=-9.7-layer*2.2;
        const tower=new THREE.Mesh(new THREE.CylinderGeometry(.26,.35,height,7),material);tower.position.set(x,height/2+.4,z);this.world.add(tower);
        const roof=new THREE.Mesh(new THREE.ConeGeometry(.45,.65,7),roofMat);roof.position.set(x,height+.68,z);this.world.add(roof);
        for(let j=0;j<3;j++)windows.push(new THREE.Matrix4().makeTranslation(x,.75+j*.48,z+.35));
        if(i%3===0){const bridge=new THREE.Mesh(new THREE.BoxGeometry(1.2,.14,.35),material);bridge.position.set(x+.5,1.2,z);this.world.add(bridge);}
      }
    }
    const lights=new THREE.InstancedMesh(new THREE.PlaneGeometry(.055,.115),new THREE.MeshBasicMaterial({color:0xffc780}),windows.length);windows.forEach((matrix,i)=>lights.setMatrixAt(i,matrix));this.world.add(lights);
    const cloudMaterial=new THREE.SpriteMaterial({map:glowTexture(),color:0x959ee8,transparent:true,opacity:.1,depthWrite:false});
    for(let i=0;i<6;i++){const cloud=new THREE.Sprite(cloudMaterial);cloud.position.set((i-2.5)*2.4,3.8+(i%3)*.7,-10-i*.4);cloud.scale.set(4,.8,1);this.world.add(cloud);}
  }

  private addTable(): void {
    const {wood,cloth,brass}=this.materials;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.15,6.35,.65,96),wood);
    base.position.y=-.3;base.castShadow=true;base.receiveShadow=true;this.world.add(base);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(5.71,5.73,.17,96),cloth);
    top.position.y=.2;top.receiveShadow=true;this.world.add(top);
    const inset=new THREE.Mesh(new THREE.CylinderGeometry(5.68,5.68,.075,96),cloth);
    inset.position.y=.31;inset.receiveShadow=true;this.world.add(inset);
    [[6.1,.22,.19],[6.2,.12,-.43],[5.77,.12,.27]].forEach(([radius,tube,y])=>{
      const rim=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,16,112),wood);rim.rotation.x=Math.PI/2;rim.position.y=y;rim.castShadow=true;rim.receiveShadow=true;this.world.add(rim);
    });
    [[5.89,.025,.39],[6.23,.018,.23],[5.58,.014,.305]].forEach(([radius,tube,y])=>{
      const rim=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,8,112),brass);rim.rotation.x=Math.PI/2;rim.position.y=y;this.world.add(rim);
    });
    const inlay=new THREE.InstancedMesh(new THREE.BoxGeometry(.035,.013,.17),brass,80);
    for(let i=0;i<80;i++){const a=i/80*Math.PI*2;const m=new THREE.Matrix4().makeRotationY(a);m.setPosition(Math.sin(a)*5.93,.423,Math.cos(a)*5.93);inlay.setMatrixAt(i,m);}this.world.add(inlay);
    // Small inset studs mark the table edge without circles beneath the seats.
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2;
      const jewel=new THREE.Mesh(new THREE.OctahedronGeometry(.1),brass);jewel.scale.y=.25;jewel.position.set(Math.sin(a)*5.82,.43,Math.cos(a)*5.82);this.world.add(jewel);
    }
    const floor=new THREE.Mesh(new THREE.CylinderGeometry(14,14,.1,64),wood);floor.position.y=-1.1;floor.receiveShadow=true;this.world.add(floor);
  }

  private addPlayerStations(): void {
    const chairWood = this.materials.wood;
    const chairMetal = new THREE.MeshStandardMaterial({ color: 0xa96b31, roughness: .38, metalness: .48 });
    const cushion = new THREE.MeshStandardMaterial({ color: 0x302349, roughness: .72 });
    const legGeometry = new THREE.CylinderGeometry(.075, .095, .72, 8);
    const seatGeometry = new RoundedBoxGeometry(1.18,.2,.92,2,.06);
    const backGeometry = new RoundedBoxGeometry(1.2,1.32,.16,2,.05);

    for (let index = 0; index < 8; index++) {
      const angle = index / 8 * Math.PI * 2;
      const chair = new THREE.Group();
      const seat = new THREE.Mesh(seatGeometry, chairWood);
      seat.position.y = .38;
      seat.castShadow = true;
      chair.add(seat);
      const seatPad = new THREE.Mesh(new THREE.BoxGeometry(.96, .1, .7), cushion);
      seatPad.position.y = .53;
      seatPad.castShadow = true;
      chair.add(seatPad);
      const back = new THREE.Mesh(backGeometry, chairWood);
      back.position.set(0, 1.11, .39);
      back.castShadow = true;
      chair.add(back);
      [-.5, .5].forEach(x => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.06, .075, 1.55, 8), chairMetal);
        post.position.set(x, 1.08, .39);
        post.castShadow = true;
        chair.add(post);
      });
      const crest = new THREE.Mesh(new THREE.TorusGeometry(.42, .07, 8, 24, Math.PI), chairMetal);
      crest.rotation.z = Math.PI;
      crest.position.set(0, 1.78, .39);
      chair.add(crest);
      [[-.45,.25,-.32],[.45,.25,-.32],[-.45,.25,.32],[.45,.25,.32]].forEach(([x,y,z]) => {
        const leg = new THREE.Mesh(legGeometry, chairWood);
        leg.position.set(x, y, z);
        leg.castShadow = true;
        chair.add(leg);
      });
      chair.position.set(Math.sin(angle) * 6.95, -.12, Math.cos(angle) * 6.95);
      chair.rotation.y = angle;
      this.stationChairs.push(chair);
      this.world.add(chair);

    }
  }

  private addWell(): void {
    this.energyGroup.position.set(0,.40,-.28);this.world.add(this.energyGroup);
    const brass=this.materials.brass;
    const darkMetal=new THREE.MeshPhysicalMaterial({color:0x302333,roughness:.34,metalness:.56,clearcoat:.3,clearcoatRoughness:.36});
    const profile=[new THREE.Vector2(.55,0),new THREE.Vector2(.83,.045),new THREE.Vector2(1.08,.16),new THREE.Vector2(1.23,.4),new THREE.Vector2(1.26,.65),new THREE.Vector2(1.2,.9),new THREE.Vector2(1.06,1.15),new THREE.Vector2(.96,1.28),new THREE.Vector2(.96,1.33),new THREE.Vector2(.88,1.33),new THREE.Vector2(.88,1.14)];
    const pot=new THREE.Mesh(new THREE.LatheGeometry(profile,72),darkMetal);pot.position.y=.15;pot.castShadow=true;pot.receiveShadow=true;this.energyGroup.add(pot);
    [[.98,.07,1.48],[1.07,.025,1.32],[.85,.04,.2]].forEach(([radius,tube,y])=>{const lip=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,12,80),brass);lip.rotation.x=Math.PI/2;lip.position.y=y;this.energyGroup.add(lip);});
    [-1,1].forEach(side=>{const handle=new THREE.Mesh(new THREE.TorusGeometry(.35,.08,12,36),brass);handle.position.set(side*1.21,.97,0);handle.rotation.y=.22*side;this.energyGroup.add(handle);});
    for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2;const foot=new THREE.Mesh(new THREE.SphereGeometry(.24,18,12),brass);foot.scale.set(.8,.6,1.4);foot.position.set(Math.sin(a)*.8,.1,Math.cos(a)*.8);this.energyGroup.add(foot);}
    // A small engraved crest gives the ancient vessel personality without a cartoon face.
    const crest=new THREE.Mesh(new THREE.TorusGeometry(.22,.016,8,32),brass);crest.position.set(0,.85,1.21);this.energyGroup.add(crest);
    const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.105),new THREE.MeshStandardMaterial({color:0xffe5ac,emissive:0xffa134,emissiveIntensity:1.1,roughness:.19,metalness:.3}));gem.scale.y=1.25;gem.position.set(0,.85,1.255);this.energyGroup.add(gem);
    const liquid=new THREE.Mesh(new THREE.CircleGeometry(.89,80),new THREE.MeshStandardMaterial({color:0xf7c370,emissive:0x794012,emissiveIntensity:.18,roughness:.48,metalness:.12,side:THREE.DoubleSide}));
    liquid.rotation.x=-Math.PI/2;liquid.position.y=1.405;this.energyGroup.add(liquid);
    this.energyGroup.add(this.particles);
    this.deckPile=new CardPile(true,url=>this.loadTexture(url));
    this.discardPile=new CardPile(false,url=>this.loadTexture(url));
    this.deckStack=this.deckPile.group;this.discardStack=this.discardPile.group;
    this.deckStack.position.set(-2.82,0,-.06);this.deckStack.rotation.y=-.06;
    this.discardStack.position.set(2.82,0,-.06);this.discardStack.rotation.y=.06;
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
    let pending = this.textureCache.get(url);
    if (!pending) {
      pending = this.textureLoader.loadAsync(url).then(texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(QUALITY_PRESETS[this.quality].textureAnisotropy, this.renderer.capabilities.getMaxAnisotropy());
        return texture;
      });
      this.textureCache.set(url, pending);
    }
    return pending;
  }

  private screenPoint(rect: DOMRect, distance: number): THREE.Vector3 {
    const x = (rect.left + rect.width / 2) / innerWidth * 2 - 1;
    const y = -(rect.top + rect.height / 2) / innerHeight * 2 + 1;
    const direction = new THREE.Vector3(x, y, .35).unproject(this.camera).sub(this.camera.position).normalize();
    return this.camera.position.clone().add(direction.multiplyScalar(distance));
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
    spin?: number;
  }): Promise<void> {
    const { root, visual, start, end, startQuaternion, endQuaternion, startScale, endScale, draw, spin=0 } = options;
    const control = start.clone().lerp(end, .5);
    control.y += draw ? .85 : .65;
    control.z += draw ? .45 : -.3;
    root.position.copy(start);
    root.quaternion.copy(startQuaternion);
    root.scale.setScalar(startScale);
    visual.rotation.y = draw ? Math.PI : 0;
    const started = performance.now();
    const duration = this.reducedMotion ? 80 : draw ? 520 : 440;
    return new Promise(resolve => {
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
        visual.rotation.y = draw ? Math.PI * (1 - t) : Math.sin(raw * Math.PI) * .24;
        visual.rotation.z = spin*Math.PI*2*t + Math.sin(raw * Math.PI) * (draw ? -.16 : .24);
        if (raw < 1) requestAnimationFrame(step);
        else {
          this.scene.remove(root);
          root.traverse(object => {
            if (object instanceof THREE.Mesh) {
              object.geometry.dispose();
              const materials = Array.isArray(object.material) ? object.material : [object.material];
              materials.forEach(material => material.dispose());
            }
          });
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  async playCardToDiscard(frontUrl: string, sourceRect: DOMRect, spin=0): Promise<void> {
    const { root, visual } = await this.makeFlyingCard(frontUrl);
    const distance = innerHeight > innerWidth * 1.08 ? 4.9 : 5.35;
    const start = this.screenPoint(sourceRect, distance);
    const landing = this.discardPile.cardPose(this.discardPile.count);
    const end = landing.position;
    const startQuaternion = this.camera.quaternion.clone();
    const endQuaternion = landing.quaternion;
    await this.animateCardFlight({ root, visual, start, end, startQuaternion, endQuaternion, startScale: this.screenScale(sourceRect, distance), endScale: 1, draw: false, spin });
  }

  async drawCardToHand(frontUrl: string, targetRect: DOMRect): Promise<void> {
    const { root, visual } = await this.makeFlyingCard(frontUrl);
    const distance = innerHeight > innerWidth * 1.08 ? 4.85 : 5.15;
    const drawn = this.deckPile.cardPose(this.deckPile.count);
    const start = drawn.position;
    const end = this.screenPoint(targetRect, distance);
    const startQuaternion = drawn.quaternion;
    const endQuaternion = this.camera.quaternion.clone();
    await this.animateCardFlight({ root, visual, start, end, startQuaternion, endQuaternion, startScale: 1, endScale: this.screenScale(targetRect, distance), draw: true });
  }

  private makeParticles(): { points: THREE.Points; base: Float32Array } {
    const count = 210;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = .55 + Math.random() * 1.3;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = .25 + Math.random() * 1.8;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffd75a, map:glowTexture(), size: .11, transparent: true, opacity: .82, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    return { points, base: positions };
  }

  private addProps(): void {
    const shelfMat = this.materials.wood;
    [-6.7, 6.7].forEach((x, sideIndex) => {
      [2.2, 3.55].forEach(y => {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.5, .16, .75), shelfMat);
        shelf.position.set(x, y, -5.55);
        this.world.add(shelf);
      });
      for (let i = 0; i < 11; i++) {
        const book = new THREE.Mesh(new THREE.BoxGeometry(.13 + (i % 3) * .03, .42 + (i % 4) * .05, .35), new THREE.MeshStandardMaterial({ color: [0x7e3e3e, 0x344d73, 0x4f6840, 0x865f2d][i % 4], roughness: .8 }));
        book.position.set(x - 1 + i * .19, 2.48 + (i % 2) * 1.35, -5.5);
        book.rotation.z = (i % 3 - 1) * .05;
        this.world.add(book);
      }
      this.addLantern(x + (sideIndex ? -.25 : .25), 4.9, -4.5);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, .85, 1), shelfMat);
      crate.position.set(x, .12, 1.5);
      crate.rotation.y = sideIndex ? -.22 : .22;
      crate.castShadow = true;
      this.world.add(crate);
    });
    this.addLantern(-4.5, 2.4, -2.1);
    this.addLantern(4.5, 2.4, -2.1);
    this.addPlant(-5.7, .2, -.2);
    this.addPlant(5.8, .2, .1);
    this.addRichDetails();
  }

  private addRichDetails(): void {
    const {wood,brass}=this.materials;
    const candleWax=new THREE.MeshStandardMaterial({color:0xffd799,roughness:.62,emissive:0x7d3408,emissiveIntensity:.12});
    const flameMaterial=new THREE.MeshBasicMaterial({color:0xffd681});
    const candleSpots=[[-5.4,.58,2.4],[5.4,.58,2.4],[-4.9,.58,-3.2],[4.9,.58,-3.2],[-6.9,2.3,-5.4],[6.9,3.65,-5.4]];
    candleSpots.forEach(([x,y,z],i)=>{
      const group=new THREE.Group();group.position.set(x,y,z);
      const dish=new THREE.Mesh(new THREE.CylinderGeometry(.29,.24,.07,24),brass);group.add(dish);
      const height=.38+(i%3)*.17;
      const candle=new THREE.Mesh(new THREE.CylinderGeometry(.115,.14,height,24),candleWax);candle.position.y=height/2;candle.castShadow=true;group.add(candle);
      for(let d=0;d<4;d++){const wax=new THREE.Mesh(new THREE.SphereGeometry(.043,8,8),candleWax);const a=d*1.9;wax.scale.y=2;wax.position.set(Math.sin(a)*.112,height-.09-d*.017,Math.cos(a)*.112);group.add(wax);}
      const flame=new THREE.Mesh(new THREE.SphereGeometry(.055,12,12),flameMaterial);flame.scale.set(.75,2.6,.75);flame.position.y=height+.095;group.add(flame);this.candleFlames.push(flame);
      const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:0xffb766,transparent:true,opacity:.35,blending:THREE.AdditiveBlending,depthWrite:false}));glow.position.copy(flame.position);glow.scale.set(.82,.82,.82);group.add(glow);
      this.world.add(group);
    });
    // Glazed bottles, folded parchment and traveler's mugs live on the room perimeter.
    const glassColors=[0x437870,0x6e517a,0xa26939];
    [-6.7,6.7].forEach((side,sideIndex)=>{
      for(let i=0;i<5;i++){
        const bottle=new THREE.Group();
        const glass=new THREE.MeshPhysicalMaterial({color:glassColors[i%3],roughness:.18,metalness:.08,clearcoat:1,clearcoatRoughness:.1,transparent:true,opacity:.92});
        const shape=new THREE.LatheGeometry([new THREE.Vector2(.13,0),new THREE.Vector2(.16,.05),new THREE.Vector2(.15,.27),new THREE.Vector2(.065,.37),new THREE.Vector2(.055,.55)],20);
        bottle.add(new THREE.Mesh(shape,glass));
        const stopper=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.085,12),wood);stopper.position.y=.57;bottle.add(stopper);
        bottle.position.set(side-1+i*.39,3.65,-5.5);this.world.add(bottle);
      }
      const mug=new THREE.Group();const cup=new THREE.Mesh(new THREE.CylinderGeometry(.22,.18,.44,24,1,true),new THREE.MeshStandardMaterial({color:sideIndex?0x486879:0x875139,roughness:.3}));cup.position.y=.22;cup.castShadow=true;mug.add(cup);
      const coffee=new THREE.Mesh(new THREE.CircleGeometry(.2,24),new THREE.MeshStandardMaterial({color:0x251311,roughness:.22}));coffee.rotation.x=-Math.PI/2;coffee.position.y=.39;mug.add(coffee);
      const handle=new THREE.Mesh(new THREE.TorusGeometry(.17,.038,10,20),brass);handle.position.set(.24,.26,0);mug.add(handle);mug.position.set(sideIndex?5:-5,.45,1.6);this.world.add(mug);
      const scroll=new THREE.Mesh(new THREE.PlaneGeometry(.54,.8),new THREE.MeshStandardMaterial({color:0xc3a978,roughness:1,side:THREE.DoubleSide}));scroll.rotation.set(-Math.PI/2,0,sideIndex?.3:-.3);scroll.position.set(sideIndex?4.7:-4.7,.43,2.5);scroll.receiveShadow=true;this.world.add(scroll);
      const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=256;const ctx=signCanvas.getContext('2d')!;
      ctx.fillStyle='#291c24';ctx.fillRect(0,0,512,256);ctx.strokeStyle='#b99157';ctx.lineWidth=5;ctx.strokeRect(15,15,482,226);ctx.fillStyle='#efd6a4';ctx.textAlign='center';ctx.font='italic 32px Georgia';ctx.fillText(sideIndex?'Curious people':'Same game.',256,98);ctx.fillText(sideIndex?'play here.':'Brighter days.',256,146);ctx.font='20px Georgia';ctx.fillText('✦',256,203);
      const signTexture=new THREE.CanvasTexture(signCanvas);signTexture.colorSpace=THREE.SRGBColorSpace;
      const sign=new THREE.Mesh(new THREE.BoxGeometry(1.65,.86,.1),wood);const writing=new THREE.Mesh(new THREE.PlaneGeometry(1.59,.8),new THREE.MeshStandardMaterial({map:signTexture,roughness:.9}));writing.position.z=.056;sign.add(writing);sign.position.set(side,3.45,-5.05);sign.rotation.z=sideIndex?-.045:.04;this.world.add(sign);
    });
    // Foreground floor boards and window-side bevels catch practical warm light.
    const arches=this.materials.brass;
    [-2.85,0,2.85].forEach(x=>{const ledge=new THREE.Mesh(new RoundedBoxGeometry(2.28,.15,.6,2,.045),wood);ledge.position.set(x,.62,-6.9);ledge.receiveShadow=true;this.world.add(ledge);const latch=new THREE.Mesh(new THREE.BoxGeometry(.035,3.1,.08),arches);latch.position.set(x,2.8,-7.13);this.world.add(latch);});
    const dustGeometry=new THREE.BufferGeometry();const dust=new Float32Array(100*3);for(let i=0;i<100;i++){dust[i*3]=Math.sin(i*43.13)*7;dust[i*3+1]=.8+(i%29)/29*5;dust[i*3+2]=Math.cos(i*17.71)*6;}
    dustGeometry.setAttribute('position',new THREE.BufferAttribute(dust,3));this.roomDust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({map:glowTexture(),size:.07,color:0xc9d1ef,transparent:true,opacity:.28,depthWrite:false}));this.world.add(this.roomDust);
    const moon=new THREE.Mesh(new THREE.SphereGeometry(.55,24,20),new THREE.MeshBasicMaterial({color:0xacc6ff}));moon.position.set(2.1,5.1,-8.15);this.world.add(moon);
    const aura=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:0x727dff,transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthWrite:false}));aura.position.copy(moon.position);aura.scale.set(4,4,4);this.world.add(aura);
    this.particles.geometry.setDrawRange(0,QUALITY_PRESETS[this.quality].particleCount);
  }

  private addLantern(x: number, y: number, z: number): void {
    const group = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: 0x24171a, roughness: .46, metalness: .7 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.18, .23, .55, 6), new THREE.MeshStandardMaterial({ color: 0xffb23e, emissive: 0xff7c1d, emissiveIntensity: 2.5, transparent: true, opacity: .88 }));
    group.add(body);
    const top = new THREE.Mesh(new THREE.ConeGeometry(.3, .22, 6), frame); top.position.y = .38; group.add(top);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .08, 6), frame); bottom.position.y = -.32; group.add(bottom);
    group.position.set(x, y, z);
    const light = new THREE.PointLight(0xff9745, 2.6, 5, 1.7);
    group.add(light);
    this.lanterns.push(group);
    this.world.add(group);
  }

  private addPlant(x: number, y: number, z: number): void {
    const group = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(.42, .32, .55, 10), new THREE.MeshStandardMaterial({ color: 0x70452c, roughness: .82 }));
    group.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x41663e, roughness: .8 });
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(.19, .85, 7), leafMat);
      const angle = i / 9 * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * .2, .55 + (i % 3) * .12, Math.sin(angle) * .2);
      leaf.rotation.z = Math.cos(angle) * .42;
      leaf.rotation.x = Math.sin(angle) * .42;
      group.add(leaf);
    }
    group.position.set(x, y, z);
    this.world.add(group);
  }

  private onPointerMove = (event: PointerEvent): void => {
    this.pointer.set(event.clientX / innerWidth - .5, event.clientY / innerHeight - .5);
  };

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
    for (let playerIndex = 0; playerIndex < this.playerCount; playerIndex++) {
      const seat = layer.querySelector<HTMLElement>(`.seat[data-seat="${playerIndex}"]`);
      if (!seat || playerIndex === this.localSeat) continue;
      const relativeIndex = (playerIndex - this.localSeat + this.playerCount) % this.playerCount;
      const stationIndex = (8 - Math.round(relativeIndex * 8 / this.playerCount)) % 8;
      const chair = this.stationChairs[stationIndex];
      if (!chair) continue;
      const anchorHeight=stationIndex===4?3.4:(stationIndex===3||stationIndex===5)?2.48:2.03;
      const anchor = chair.localToWorld(new THREE.Vector3(0, anchorHeight, 0)).project(this.camera);
      const projectedX = (anchor.x * .5 + .5) * innerWidth - bounds.left;
      const edgePadding = innerWidth < 600 ? 48 : 62;
      const safeX = Math.max(edgePadding, Math.min(bounds.width - edgePadding, projectedX));
      seat.style.setProperty('--seat-chair-x', `${safeX}px`);
      const projectedY=(-anchor.y*.5+.5)*innerHeight-bounds.top;
      const minimumY=innerHeight<520&&innerWidth>innerHeight?72-bounds.top:0;
      seat.style.setProperty('--seat-chair-y', `${Math.max(minimumY,projectedY)}px`);
    }
  }

  private resize = (): void => {
    const portrait = innerHeight > innerWidth * 1.08;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.fov = portrait ? 46 : 42;
    this.camera.position.set(0, portrait ? 8.8 : 7.3, portrait ? 14.7 : 12.4);
    this.camera.lookAt(0, portrait ? 1.35 : .82, portrait ? -.75 : -.45);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY_PRESETS[this.quality].pixelRatio));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.shadowMap.enabled = QUALITY_PRESETS[this.quality].shadows;
    this.composer?.setPixelRatio(Math.min(devicePixelRatio,QUALITY_PRESETS[this.quality].pixelRatio));
    this.composer?.setSize(innerWidth,innerHeight);
    if (this.deckStack && this.discardStack) {
      const pileX = portrait ? 1.15 : 2.82;
      const pileZ = portrait ? 2.05 : -.06;
      this.deckStack.position.set(-pileX, 0, pileZ);
      this.discardStack.position.set(pileX, 0, pileZ);
      this.pileShadows[0].position.set(-pileX,.3485,pileZ);
      this.pileShadows[1].position.set(pileX,.3485,pileZ);
    }
    this.stationChairs.forEach((chair, index) => {
      const angle = index / 8 * Math.PI * 2;
      chair.position.set(Math.sin(angle) * (portrait ? 4.05 : 6), -.12, Math.cos(angle) * (portrait ? 6.15 : 6.95));
    });
  };

  private animate(time: number, delta: number): void {
    this.smoothPointer.lerp(this.reducedMotion?new THREE.Vector2():this.pointer, 1 - Math.pow(.0008, delta));
    const portrait = innerHeight > innerWidth * 1.08;
    const baseX = 0;
    const baseY = portrait ? 8.8 : 7.3;
    const baseZ = portrait ? 14.7 : 12.4;
    this.camera.position.x = baseX + this.smoothPointer.x * .26;
    this.camera.position.y = baseY - this.smoothPointer.y * .13;
    this.camera.position.z = baseZ - (!this.reducedMotion && (this.eventKind==='exact'||this.eventKind==='bust')?this.impact*.13:0);
    this.camera.lookAt(this.smoothPointer.x * .1, portrait ? 1.35 : .82, portrait ? -.75 : -.45);
    this.camera.updateMatrixWorld();
    if(time-this.lastSeatUpdate>.04){this.positionSeatOverlays();this.lastSeatUpdate=time;}
    this.number.update(time,delta,this.camera,this.reducedMotion);
    this.hand.update(delta);

    this.eventPulse = Math.max(0, this.eventPulse - delta * 1.4);
    const power = this.wellPower = THREE.MathUtils.lerp(this.wellPower, this.targetPower + this.eventPulse, 1 - Math.pow(.004, delta));
    this.impact=Math.max(0,this.impact-delta*1.35);
    const drain=this.eventKind==='minus'||this.eventKind==='zero';
    this.fill.intensity=1.6+power*.45-(drain?this.impact*.45:0);
    this.candleFlames.forEach((flame,i)=>{flame.scale.y=this.reducedMotion?1:1+Math.sin(time*9+i*2)*.14;});
    if(this.roomDust){this.roomDust.rotation.y=this.reducedMotion?0:time*.009;}
    document.documentElement.style.setProperty('--well-light',String(.15+Math.min(power,1)*.25));
    this.centerLight.intensity = 4.8 + power * 7.5 - (drain?this.impact*3.5:0);
    this.centerLight.color.setHSL(.095 - Math.min(.035, this.total / 4000), .98, .58);
    this.energyGroup.position.y = .40;
    this.energyGroup.scale.setScalar(1);

    const pos = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = pos.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const baseYParticle = this.particleBase[i * 3 + 1];
      array[i * 3 + 1] = .2 + ((baseYParticle + time * (.2 + power * .32) + i * .031) % 2.05);
      const angle = time * .18 * this.direction + i * .37;
      const radius = Math.hypot(this.particleBase[i * 3], this.particleBase[i * 3 + 2]);
      array[i * 3] = Math.cos(angle) * radius;
      array[i * 3 + 2] = Math.sin(angle) * radius;
    }
    pos.needsUpdate = true;
    this.particles.visible=!this.reducedMotion;
    (this.particles.material as THREE.PointsMaterial).opacity = .28 + Math.min(1, power) * .65;
    this.floatingIslands.forEach((island, i) => { island.position.y = 5.2-i*.42+(this.reducedMotion?0:Math.sin(time*.55+i)*.025); island.rotation.y = this.reducedMotion?0:Math.sin(time * .08 + i) * .08; });
    this.lanterns.forEach((lantern, i) => { const light = lantern.children.find(child => child instanceof THREE.PointLight) as THREE.PointLight | undefined; if (light) light.intensity = 2.3 + (this.reducedMotion?0:Math.sin(time * 7.2 + i * 2.1) * .28); });
  }

  /** Keep bloom/AO on the room while drawing the printed cards without either. */
  private renderWithCleanCards(): void {
    const cards: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; visible: boolean }[] = [];
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.userData.cleanCard) return;
      cards.push({ mesh: object, material: object.material, visible: object.visible });
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
      this.composer.render();
    } finally {
      cards.forEach(card => { card.mesh.material = card.material; });
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
      // This keeps a flying card correctly hidden behind the vessel and chairs.
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

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    if (!this.active || document.hidden || this.contextLost) { this.clock.getDelta(); return; }
    const realDelta=this.clock.getDelta();
    const delta = Math.min(.05, realDelta);
    this.profileFrames++;this.profileDelta+=realDelta;
    const time = this.clock.elapsedTime;
    this.animate(time, delta);
    this.renderer.info.reset();
    if(QUALITY_PRESETS[this.quality].bloom)this.renderWithCleanCards();else this.renderer.render(this.scene, this.camera);
    if(time-this.profileTime>1){this.renderer.domElement.dataset.frameMs=(this.profileDelta/this.profileFrames*1000).toFixed(1);this.renderer.domElement.dataset.drawCalls=String(this.renderer.info.render.calls);this.renderer.domElement.dataset.triangles=String(this.renderer.info.render.triangles);this.profileFrames=0;this.profileDelta=0;this.profileTime=time;}
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.hand.dispose();this.number.dispose();this.composer.dispose();this.bloom.dispose();this.ao.dispose();this.environment.dispose();
    this.deckPile.dispose();this.discardPile.dispose();
    removeEventListener('resize', this.resize);
    removeEventListener('pointermove', this.onPointerMove);
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
