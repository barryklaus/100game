import * as THREE from 'three';

type SceneState = {
  active: boolean;
  total: number;
  direction: 1 | -1;
  event: string;
  playerCount: number;
  drawCardUrl: string;
  discardCardUrl?: string;
};

type EnergyMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTime: { value: number };
    uPower: { value: number };
    uDirection: { value: number };
  };
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
  private highQuality = true;
  private total = 0;
  private targetPower = .16;
  private eventPulse = 0;
  private direction: 1 | -1 = 1;
  private pointer = new THREE.Vector2();
  private smoothPointer = new THREE.Vector2();
  private world = new THREE.Group();
  private energyGroup = new THREE.Group();
  private energyMaterial: EnergyMaterial;
  private liquidMaterial = new THREE.MeshStandardMaterial({ color: 0xffcf4a, emissive: 0xff8f22, emissiveIntensity: 2.4, roughness: .25 });
  private centerLight = new THREE.PointLight(0xffb339, 7, 13, 1.45);
  private particles: THREE.Points;
  private particleBase: Float32Array;
  private floatingIslands: THREE.Group[] = [];
  private lanterns: THREE.Group[] = [];
  private stationMaterials: THREE.MeshStandardMaterial[] = [];
  private stationChairs: THREE.Group[] = [];
  private stationMarkers: THREE.Group[] = [];
  private textureLoader = new THREE.TextureLoader();
  private textureCache = new Map<string, Promise<THREE.Texture>>();
  private deckTop!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private discardTop!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private deckStack!: THREE.Group;
  private discardStack!: THREE.Group;
  private drawCardUrl = '';
  private discardCardUrl = '';

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x080a17, 1);
    this.renderer.domElement.className = 'world3d-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    document.body.prepend(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x080a17);
    this.scene.fog = new THREE.FogExp2(0x090a16, .019);
    this.energyMaterial = this.makeEnergyMaterial();
    const particleSystem = this.makeParticles();
    this.particles = particleSystem.points;
    this.particleBase = particleSystem.base;
    this.buildWorld();
    this.resize();
    addEventListener('resize', this.resize, { passive: true });
    addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.loop();
  }

  set qualityHigh(value: boolean) {
    this.highQuality = value;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, value ? 1.45 : 1));
    this.renderer.shadowMap.enabled = value && innerWidth > 720;
    this.resize();
  }

  update(next: SceneState): void {
    this.active = next.active;
    this.total = Math.max(0, next.total);
    this.targetPower = .16 + Math.min(1, this.total / 100) * .78;
    this.direction = next.direction;
    this.stationMaterials.forEach((material, index) => {
      const occupied = index < next.playerCount;
      material.emissiveIntensity = occupied ? .62 : .12;
      material.opacity = occupied ? 1 : .58;
    });
    if (next.drawCardUrl !== this.drawCardUrl) {
      this.drawCardUrl = next.drawCardUrl;
      void this.setSurfaceTexture(this.deckTop, next.drawCardUrl);
    }
    if ((next.discardCardUrl ?? '') !== this.discardCardUrl) {
      this.discardCardUrl = next.discardCardUrl ?? '';
      this.discardTop.visible = !!next.discardCardUrl;
      if (next.discardCardUrl) void this.setSurfaceTexture(this.discardTop, next.discardCardUrl);
    }
    if (next.event !== 'none') this.eventPulse = next.event === 'exact' ? 1.6 : next.event === 'bust' ? 1.25 : .72;
    this.renderer.domElement.hidden = !next.active;
    document.documentElement.classList.toggle('world3d-active', next.active);
  }

  private makeEnergyMaterial(): EnergyMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uPower: { value: .2 },
        uDirection: { value: 1 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv=uv;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uPower;
        uniform float uDirection;
        void main(){
          float flow=sin((vUv.x*22.0-uTime*1.9*uDirection)*6.28318)*.5+.5;
          float fine=sin((vUv.x*53.0+uTime*.72*uDirection)*6.28318)*.5+.5;
          float edge=smoothstep(0.0,.22,vUv.y)*smoothstep(1.0,.78,vUv.y);
          vec3 amber=vec3(1.0,.35,.035);
          vec3 gold=vec3(1.0,.92,.31);
          vec3 color=mix(amber,gold,flow*.74+fine*.16);
          float alpha=edge*(.42+flow*.42+fine*.12)*(.42+uPower*.58);
          gl_FragColor=vec4(color,alpha);
        }
      `,
    }) as EnergyMaterial;
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
    this.scene.add(new THREE.HemisphereLight(0x789bea, 0x512416, 2.3));
    const moon = new THREE.DirectionalLight(0x8ba9ff, 2.15);
    moon.position.set(-4, 9, -5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -8; moon.shadow.camera.right = 8;
    moon.shadow.camera.top = 7; moon.shadow.camera.bottom = -5;
    this.scene.add(moon);
    const warm = new THREE.DirectionalLight(0xffad63, 2.9);
    warm.position.set(5, 6, 6);
    this.scene.add(warm);
    this.centerLight.position.set(0, 2.1, -.65);
    this.centerLight.castShadow = false;
    this.scene.add(this.centerLight);
  }

  private addSkyAndArchitecture(): void {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: { uColorA: { value: new THREE.Color(0x0c1746) }, uColorB: { value: new THREE.Color(0x4950a2) } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec2 vUv;uniform vec3 uColorA;uniform vec3 uColorB;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){vec3 c=mix(uColorA,uColorB,pow(vUv.y,1.3));float s=step(.992,h(floor(vUv*vec2(120.,68.))));c+=s*(.55+.45*sin(vUv.x*81.))*vec3(.75,.86,1.);gl_FragColor=vec4(c,1.);}`,
    }));
    sky.position.set(0, 3.4, -8.4);
    this.world.add(sky);

    const stoneGeo = new THREE.BoxGeometry(1.02, .5, .5);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x31283b, roughness: .93, metalness: 0 });
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
    transforms.forEach((matrix, index) => stones.setMatrixAt(index, matrix));
    stones.receiveShadow = true;
    this.world.add(stones);

    const beamMaterial = wood(0x2a1514, .86);
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

  private addTable(): void {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.15, 6.4, .72, 64), wood(0x2b1516, .72));
    base.position.y = -.34;
    base.receiveShadow = true;
    base.castShadow = true;
    this.world.add(base);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(5.68, 5.78, .28, 64), new THREE.MeshStandardMaterial({ color: 0x182b44, roughness: .58, metalness: .18 }));
    top.position.y = .16;
    top.receiveShadow = true;
    this.world.add(top);
    const inset = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.58, .17, 64), new THREE.MeshStandardMaterial({ color: 0x261c3a, roughness: .6, metalness: .08 }));
    inset.position.y = .34;
    inset.receiveShadow = true;
    this.world.add(inset);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xa6632c, roughness: .34, metalness: .55 });
    [3.62, 5.75, 6.12].forEach((radius, index) => {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, index === 2 ? .13 : .075, 10, 64), rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = .46 - index * .04;
      rim.castShadow = true;
      this.world.add(rim);
    });
    for (let i = 0; i < 20; i++) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(.018, .015, 1.7), new THREE.MeshBasicMaterial({ color: 0x74452e }));
      mark.position.set(Math.sin(i * .91) * 4.65, .322, Math.cos(i * 1.13) * 2.5);
      mark.rotation.y = i * .68;
      this.world.add(mark);
    }
  }

  private addPlayerStations(): void {
    const chairWood = wood(0x3a1d1b, .68);
    const chairMetal = new THREE.MeshStandardMaterial({ color: 0xa96b31, roughness: .38, metalness: .48 });
    const cushion = new THREE.MeshStandardMaterial({ color: 0x302349, roughness: .72 });
    const legGeometry = new THREE.CylinderGeometry(.075, .095, .72, 8);
    const seatGeometry = new THREE.BoxGeometry(1.18, .2, .92);
    const backGeometry = new THREE.BoxGeometry(1.2, 1.32, .16);

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

      const stationMaterial = new THREE.MeshStandardMaterial({
        color: 0xb17434,
        emissive: 0xff9d2d,
        emissiveIntensity: .12,
        roughness: .38,
        metalness: .58,
        transparent: true,
        opacity: .58,
      });
      const marker = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(.38, .55, 32), stationMaterial);
      ring.rotation.x = -Math.PI / 2;
      marker.add(ring);
      const notch = new THREE.Mesh(new THREE.ConeGeometry(.12, .28, 3), stationMaterial);
      notch.rotation.x = Math.PI / 2;
      notch.position.z = -.64;
      marker.add(notch);
      marker.position.set(Math.sin(angle) * 5.2, .37, Math.cos(angle) * 5.2);
      marker.rotation.y = angle;
      this.stationMaterials.push(stationMaterial);
      this.stationMarkers.push(marker);
      this.world.add(marker);
    }
  }

  private addWell(): void {
    this.energyGroup.position.set(0, .43, -.28);
    this.world.add(this.energyGroup);
    const outerGroove = new THREE.Mesh(new THREE.TorusGeometry(1.68, .23, 18, 72), new THREE.MeshStandardMaterial({ color: 0x21182b, roughness: .42, metalness: .55 }));
    outerGroove.rotation.x = Math.PI / 2;
    outerGroove.receiveShadow = true;
    this.energyGroup.add(outerGroove);
    const energy = new THREE.Mesh(new THREE.TorusGeometry(1.68, .105, 12, 96), this.energyMaterial);
    energy.rotation.x = Math.PI / 2;
    energy.position.y = .08;
    this.energyGroup.add(energy);

    const profile = [
      new THREE.Vector2(.62, 0), new THREE.Vector2(1.02, .08), new THREE.Vector2(1.22, .42),
      new THREE.Vector2(1.17, .88), new THREE.Vector2(.98, 1.18), new THREE.Vector2(.87, 1.26),
    ];
    const potMaterial = new THREE.MeshStandardMaterial({ color: 0x201a29, roughness: .3, metalness: .5 });
    const pot = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), potMaterial);
    pot.position.y = .18;
    pot.castShadow = true;
    pot.receiveShadow = true;
    this.energyGroup.add(pot);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(.98, .13, 12, 48), new THREE.MeshStandardMaterial({ color: 0x4a3446, roughness: .3, metalness: .45 }));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 1.48;
    this.energyGroup.add(lip);
    const liquid = new THREE.Mesh(new THREE.CircleGeometry(.86, 48), this.liquidMaterial);
    liquid.rotation.x = -Math.PI / 2;
    liquid.position.y = 1.49;
    this.energyGroup.add(liquid);
    [-1, 1].forEach(side => {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(.48, .09, 10, 30), potMaterial);
      handle.position.set(side * 1.08, .84, 0);
      this.energyGroup.add(handle);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(.28, 16, 12), potMaterial);
      foot.scale.set(1.25, .55, 1.1);
      foot.position.set(side * .56, .11, .17);
      this.energyGroup.add(foot);
    });
    const faceMat = new THREE.MeshBasicMaterial({ color: 0xffef9b });
    [-.31, .31].forEach(x => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.09, 14, 10), faceMat);
      eye.scale.y = 1.45;
      eye.position.set(x, .88, .98);
      this.energyGroup.add(eye);
    });
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(.17, 18, 12), new THREE.MeshBasicMaterial({ color: 0x120b18 }));
    mouth.scale.set(1, .65, .22);
    mouth.position.set(0, .6, 1.08);
    this.energyGroup.add(mouth);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(.11, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff8290 }));
    tongue.scale.set(1, .42, .15);
    tongue.position.set(0, .55, 1.14);
    this.energyGroup.add(tongue);
    this.energyGroup.add(this.particles);

    this.deckTop = this.addPhysicalCardStack(-2.82, -.06, true);
    this.discardTop = this.addPhysicalCardStack(2.82, -.06, false);
    this.deckStack = this.deckTop.parent as THREE.Group;
    this.discardStack = this.discardTop.parent as THREE.Group;
    this.discardTop.visible = false;
  }

  private addPhysicalCardStack(x: number, z: number, muted: boolean): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const group = new THREE.Group();
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: muted ? 0x37323b : 0x4d3340, roughness: .45, metalness: .28 });
    for (let i = 0; i < 7; i++) {
      const card = new THREE.Mesh(new THREE.BoxGeometry(1.03, .035, 1.43), edgeMaterial);
      card.position.y = .48 + i * .033;
      card.rotation.y = (i - 3) * .006;
      card.castShadow = true;
      group.add(card);
    }
    const topMaterial = new THREE.MeshBasicMaterial({ color: muted ? 0x252231 : 0x4d3340, toneMapped: false });
    const topCard = new THREE.Mesh(new THREE.PlaneGeometry(1.03, 1.43), topMaterial);
    topCard.rotation.x = -Math.PI / 2;
    topCard.position.y = .725;
    topCard.receiveShadow = true;
    group.add(topCard);
    group.position.set(x, 0, z);
    group.rotation.y = x < 0 ? -.06 : .06;
    this.world.add(group);
    return topCard;
  }

  private loadTexture(url: string): Promise<THREE.Texture> {
    let pending = this.textureCache.get(url);
    if (!pending) {
      pending = this.textureLoader.loadAsync(url).then(texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        return texture;
      });
      this.textureCache.set(url, pending);
    }
    return pending;
  }

  private async setSurfaceTexture(mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>, url: string): Promise<void> {
    const texture = await this.loadTexture(url);
    mesh.material.map = texture;
    mesh.material.color.set(0xffffff);
    mesh.material.needsUpdate = true;
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
    const portrait = innerHeight > innerWidth * 1.08;
    return this.tablePoint(side * (portrait ? 1.55 : 2.82), y, portrait ? 1.62 : -.06);
  }

  private async makeFlyingCard(frontUrl: string): Promise<{ root: THREE.Group; visual: THREE.Group }> {
    const [frontTexture, backTexture] = await Promise.all([
      this.loadTexture(frontUrl),
      this.loadTexture(this.drawCardUrl || frontUrl),
    ]);
    const root = new THREE.Group();
    const visual = new THREE.Group();
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.47, .045), new THREE.MeshStandardMaterial({ color: 0x191722, roughness: .42, metalness: .16 }));
    edge.castShadow = true;
    visual.add(edge);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1.03, 1.43), new THREE.MeshBasicMaterial({ map: frontTexture, toneMapped: false }));
    front.position.z = .026;
    visual.add(front);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.03, 1.43), new THREE.MeshBasicMaterial({ map: backTexture, toneMapped: false }));
    back.position.z = -.026;
    back.rotation.y = Math.PI;
    visual.add(back);
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
  }): Promise<void> {
    const { root, visual, start, end, startQuaternion, endQuaternion, startScale, endScale, draw } = options;
    const control = start.clone().lerp(end, .5);
    control.y += draw ? 2.05 : 2.55;
    control.z += draw ? .45 : -.3;
    root.position.copy(start);
    root.quaternion.copy(startQuaternion);
    root.scale.setScalar(startScale);
    visual.rotation.y = draw ? Math.PI : 0;
    const started = performance.now();
    const duration = draw ? 720 : 590;
    return new Promise(resolve => {
      const step = (now: number): void => {
        const raw = Math.min(1, (now - started) / duration);
        const t = 1 - Math.pow(1 - raw, 3);
        const inverse = 1 - t;
        root.position.set(
          inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
          inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
          inverse * inverse * start.z + 2 * inverse * t * control.z + t * t * end.z,
        );
        root.quaternion.slerpQuaternions(startQuaternion, endQuaternion, t);
        root.scale.setScalar(THREE.MathUtils.lerp(startScale, endScale, t));
        visual.rotation.y = draw ? Math.PI * (1 - t) : Math.sin(raw * Math.PI) * .24;
        visual.rotation.z = Math.sin(raw * Math.PI) * (draw ? -.16 : .24);
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

  async playCardToDiscard(frontUrl: string, sourceRect: DOMRect): Promise<void> {
    const { root, visual } = await this.makeFlyingCard(frontUrl);
    const distance = innerHeight > innerWidth * 1.08 ? 4.9 : 5.35;
    const start = this.screenPoint(sourceRect, distance);
    const end = this.pilePoint(1, .78);
    const startQuaternion = this.camera.quaternion.clone();
    const endQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, .025));
    await this.animateCardFlight({ root, visual, start, end, startQuaternion, endQuaternion, startScale: this.screenScale(sourceRect, distance), endScale: 1, draw: false });
  }

  async drawCardToHand(frontUrl: string, targetRect: DOMRect): Promise<void> {
    const { root, visual } = await this.makeFlyingCard(frontUrl);
    const distance = innerHeight > innerWidth * 1.08 ? 4.85 : 5.15;
    const start = this.pilePoint(-1, .8);
    const end = this.screenPoint(targetRect, distance);
    const startQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -.035));
    const endQuaternion = this.camera.quaternion.clone();
    await this.animateCardFlight({ root, visual, start, end, startQuaternion, endQuaternion, startScale: 1, endScale: this.screenScale(targetRect, distance), draw: true });
  }

  private makeParticles(): { points: THREE.Points; base: Float32Array } {
    const count = 90;
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
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffd75a, size: .07, transparent: true, opacity: .82, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    return { points, base: positions };
  }

  private addProps(): void {
    const shelfMat = wood(0x351c18, .82);
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

  private resize = (): void => {
    const portrait = innerHeight > innerWidth * 1.08;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.fov = portrait ? 46 : 42;
    this.camera.position.set(0, portrait ? 8.8 : 7.3, portrait ? 14.7 : 12.4);
    this.camera.lookAt(0, portrait ? 1.35 : .82, portrait ? -.75 : -.45);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.highQuality ? (portrait ? 1.3 : 1.45) : 1));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.shadowMap.enabled = this.highQuality && innerWidth > 720;
    if (this.deckStack && this.discardStack) {
      const pileX = portrait ? 1.55 : 2.82;
      const pileZ = portrait ? 1.62 : -.06;
      this.deckStack.position.set(-pileX, 0, pileZ);
      this.discardStack.position.set(pileX, 0, pileZ);
    }
    this.stationChairs.forEach((chair, index) => {
      const angle = index / 8 * Math.PI * 2;
      chair.position.set(Math.sin(angle) * (portrait ? 4.05 : 6.95), -.12, Math.cos(angle) * (portrait ? 6.15 : 6.95));
    });
    this.stationMarkers.forEach((marker, index) => {
      const angle = index / 8 * Math.PI * 2;
      marker.position.set(Math.sin(angle) * (portrait ? 3.25 : 5.2), .37, Math.cos(angle) * (portrait ? 4.35 : 5.2));
    });
  };

  private animate(time: number, delta: number): void {
    this.smoothPointer.lerp(this.pointer, 1 - Math.pow(.0008, delta));
    const portrait = innerHeight > innerWidth * 1.08;
    const baseX = 0;
    const baseY = portrait ? 8.8 : 7.3;
    const baseZ = portrait ? 14.7 : 12.4;
    this.camera.position.x = baseX + this.smoothPointer.x * .26;
    this.camera.position.y = baseY - this.smoothPointer.y * .13;
    this.camera.position.z = baseZ;
    this.camera.lookAt(this.smoothPointer.x * .1, portrait ? 1.35 : .82, -.45);

    this.eventPulse = Math.max(0, this.eventPulse - delta * 1.4);
    const power = THREE.MathUtils.lerp(this.energyMaterial.uniforms.uPower.value, this.targetPower + this.eventPulse, 1 - Math.pow(.004, delta));
    this.energyMaterial.uniforms.uPower.value = power;
    this.energyMaterial.uniforms.uTime.value = time;
    this.energyMaterial.uniforms.uDirection.value = this.direction;
    this.liquidMaterial.emissiveIntensity = 1.8 + power * 2.4;
    this.centerLight.intensity = 4.8 + power * 7.5;
    this.centerLight.color.setHSL(.095 - Math.min(.035, this.total / 4000), .98, .58);
    this.energyGroup.position.y = .43 + Math.sin(time * 1.7) * .018;
    this.energyGroup.scale.setScalar(1 + Math.sin(time * 2.25) * .006 + this.eventPulse * .035);

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
    (this.particles.material as THREE.PointsMaterial).opacity = .28 + Math.min(1, power) * .65;
    this.floatingIslands.forEach((island, i) => { island.position.y += Math.sin(time * .55 + i) * .0007; island.rotation.y = Math.sin(time * .08 + i) * .08; });
    this.lanterns.forEach((lantern, i) => { const light = lantern.children.find(child => child instanceof THREE.PointLight) as THREE.PointLight | undefined; if (light) light.intensity = 2.3 + Math.sin(time * 7.2 + i * 2.1) * .28; });
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    if (!this.active || document.hidden) { this.clock.getDelta(); return; }
    const delta = Math.min(.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    this.animate(time, delta);
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
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
    document.documentElement.classList.remove('world3d-active');
  }
}
