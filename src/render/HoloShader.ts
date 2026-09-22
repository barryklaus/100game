import * as THREE from 'three';

type CardMesh = {
  element: HTMLElement;
  group: THREE.Group;
  front: THREE.ShaderMaterial;
  back: THREE.MeshBasicMaterial;
  faceUrl: string;
  ready: boolean;
};

// One transparent renderer turns every live card into a thin 3D object.
// DOM cards stay underneath as interaction and accessibility hit targets.
export class HoloShader {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, innerWidth, innerHeight, 0, .1, 3000);
  private loader = new THREE.TextureLoader();
  private cards = new Map<HTMLElement, CardMesh>();
  private textures = new Map<string, THREE.Texture>();
  private box = new THREE.BoxGeometry(1, 1, 1);
  private face = new THREE.PlaneGeometry(1, 1);
  private edge = new THREE.MeshStandardMaterial({ color: 0x201b22, roughness: .34, metalness: .72 });
  private pointer = new THREE.Vector2(-1000, -1000);
  private active: HTMLElement | null = null;
  private pressed: HTMLElement | null = null;
  private frame = 0;
  private lastTime = performance.now();
  private isEnabled = true;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'card3d-canvas';
    document.body.append(this.renderer.domElement);
    this.camera.position.z = 1000;
    this.scene.add(new THREE.HemisphereLight(0xfff3d6, 0x18243d, 1.9));
    const tavernLight = new THREE.DirectionalLight(0xffc77f, 1.5);
    tavernLight.position.set(-1, 2, 4);
    this.scene.add(tavernLight);
    const energyLight = new THREE.PointLight(0xffb84f, 4.2, 1200, 1.4);
    energyLight.position.set(innerWidth / 2, innerHeight * .48, 220);
    energyLight.name = 'energy';
    this.scene.add(energyLight);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerUp, { passive: true });
    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  get enabled(): boolean { return this.isEnabled; }
  set enabled(value: boolean) {
    this.isEnabled = value;
    document.documentElement.classList.toggle('three-cards-active', value);
    this.renderer.domElement.style.display = value ? '' : 'none';
  }

  private onPointerMove = (event: PointerEvent): void => {
    this.pointer.set(event.clientX, event.clientY);
    this.active = (event.target as Element | null)?.closest<HTMLElement>('.playing-card:not(.waiting-hand)') ?? null;
  };
  private onPointerDown = (event: PointerEvent): void => {
    this.pressed = (event.target as Element | null)?.closest<HTMLElement>('.playing-card:not(.waiting-hand)') ?? null;
  };
  private onPointerUp = (): void => { this.pressed = null; };

  private texture(url: string, ready?: (texture: THREE.Texture) => void): THREE.Texture | null {
    const cached = this.textures.get(url);
    if (cached) { ready?.(cached); return cached; }
    this.loader.load(url, texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      this.textures.set(url, texture);
      ready?.(texture);
    });
    return null;
  }

  private frontMaterial(special: boolean): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true, depthTest: true, depthWrite: true,
      uniforms: {
        uMap: { value: null }, uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2(.5, .5) },
        uSpecial: { value: special ? 1 : 0 }, uHover: { value: 0 },
        uBoost: { value: 0 }, uEnergy: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uMap;
        uniform float uTime; uniform vec2 uPointer; uniform float uSpecial;
        uniform float uHover; uniform float uBoost; uniform float uEnergy;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float roundedMask(vec2 uv){
          vec2 p=abs(uv-.5); vec2 q=max(p-vec2(.455,.468),0.0);
          return 1.0-smoothstep(.026,.031,length(q));
        }
        void main(){
          float mask=roundedMask(vUv); if(mask<.01) discard;
          vec4 art=texture2D(uMap,vUv); if(art.a<.02) discard;
          float pointerLight=1.0-smoothstep(.0,.68,distance(vUv,uPointer));
          float diagonal=vUv.x*.72+vUv.y*.48+uTime*.055+uPointer.x*.18-uPointer.y*.12;
          vec3 rainbow=.5+.5*cos(6.28318*(diagonal+vec3(0.0,.33,.67)));
          float ribbon=pow(.5+.5*sin(diagonal*23.0),8.0);
          float grain=hash(floor(vUv*vec2(155.0,215.0))+floor(uTime*9.0));
          float sparkle=step(.992-uBoost*.006,grain)*(.25+uBoost*.42);
          float foil=uSpecial*(.045+pointerLight*.16+ribbon*.10+sparkle)*(.45+uHover*.55);
          float glare=pointerLight*uHover*(.06+uBoost*.10);
          float energy=pow(1.0-vUv.y,2.8)*uEnergy*(.04+uSpecial*.08);
          vec3 color=art.rgb*(.96+pointerLight*uHover*.06);
          color=mix(color,color+rainbow*.52,foil);
          color+=vec3(1.0,.58,.16)*energy;
          color+=vec3(1.0,.94,.78)*glare+sparkle*uSpecial;
          gl_FragColor=vec4(color,art.a*mask);
        }`,
    });
  }

  private addCard(element: HTMLElement): void {
    const image = element.querySelector<HTMLImageElement>('img');
    if (!image?.src) return;
    const group = new THREE.Group();
    const front = this.frontMaterial(element.classList.contains('special'));
    const back = new THREE.MeshBasicMaterial({ color: 0x262331, transparent: true });
    const slab = new THREE.Mesh(this.box, this.edge);
    const frontFace = new THREE.Mesh(this.face, front);
    const backFace = new THREE.Mesh(this.face, back);
    frontFace.position.z = .505;
    backFace.position.z = -.505;
    backFace.rotation.y = Math.PI;
    frontFace.renderOrder = 2;
    backFace.renderOrder = 2;
    group.add(slab, frontFace, backFace);
    this.scene.add(group);
    const item: CardMesh = { element, group, front, back, faceUrl: image.src, ready: false };
    this.cards.set(element, item);
    this.texture(image.src, texture => {
      item.front.uniforms.uMap.value = texture;
      item.ready = true;
      element.classList.add('three-card-ready');
    });
    const backUrl = element.classList.contains('card-back') ? image.src : document.querySelector<HTMLImageElement>('.card-back img')?.src || image.src;
    this.texture(backUrl, texture => { item.back.map = texture; item.back.needsUpdate = true; });
  }

  private removeCard(item: CardMesh): void {
    item.element.classList.remove('three-card-ready');
    this.scene.remove(item.group);
    item.front.dispose();
    item.back.dispose();
    this.cards.delete(item.element);
  }

  private resize = (): void => {
    const width = innerWidth, height = innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.left = 0; this.camera.right = width; this.camera.top = height; this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    this.scene.getObjectByName('energy')?.position.set(width / 2, height * .49, 220);
  };

  private syncCards(time: number): void {
    const visible = new Set<HTMLElement>(Array.from(document.querySelectorAll<HTMLElement>('.playing-card:not(.hero-card)')));
    visible.forEach(element => { if (!this.cards.has(element)) this.addCard(element); });
    [...this.cards.values()].forEach(item => { if (!visible.has(item.element) || !item.element.isConnected) this.removeCard(item); });
    const energy = Math.max(0, Math.min(1, Number(document.querySelector('.total-number')?.textContent || 0) / 100));
    const delta = Math.min(.06, (time - this.lastTime) / 1000);
    let order = 0;
    this.cards.forEach(item => {
      const { element, group, front } = item;
      const image = element.querySelector<HTMLImageElement>('img');
      if (image?.src && image.src !== item.faceUrl) {
        item.faceUrl = image.src; item.ready = false; element.classList.remove('three-card-ready');
        this.texture(image.src, texture => { front.uniforms.uMap.value = texture; item.ready = true; element.classList.add('three-card-ready'); });
      }
      const rect = element.getBoundingClientRect();
      if (!item.ready || rect.width < 2 || rect.height < 2 || rect.bottom < -20 || rect.top > innerHeight + 20) { group.visible = false; return; }
      group.visible = true;
      const computed = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(computed.transform === 'none' ? undefined : computed.transform);
      const scaleX = Math.hypot(matrix.a, matrix.b) || 1;
      const scaleY = Math.hypot(matrix.c, matrix.d) || 1;
      const width = element.offsetWidth * scaleX, height = element.offsetHeight * scaleY;
      const cssRotation = Math.atan2(matrix.b, matrix.a);
      const isActive = this.active === element || this.pressed === element;
      const px = Math.max(0, Math.min(1, (this.pointer.x - rect.left) / Math.max(1, rect.width)));
      const py = Math.max(0, Math.min(1, (this.pointer.y - rect.top) / Math.max(1, rect.height)));
      const ease = 1 - Math.pow(.001, delta);
      group.position.set(rect.left + rect.width / 2, innerHeight - rect.top - rect.height / 2, isActive ? 24 : order++ * .02);
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, isActive ? (.5 - py) * .23 : 0, ease);
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, isActive ? (px - .5) * .31 : 0, ease);
      group.rotation.z = -cssRotation;
      const lift = isActive ? 1.035 : 1;
      group.scale.set(width * lift, height * lift, element.classList.contains('dragging') ? 7 : 4);
      front.uniforms.uTime.value = time / 1000;
      front.uniforms.uPointer.value.set(px, 1 - py);
      front.uniforms.uHover.value = THREE.MathUtils.lerp(front.uniforms.uHover.value, isActive ? 1 : 0, ease);
      front.uniforms.uBoost.value = this.pressed === element || element.classList.contains('dragging') ? 1 : 0;
      front.uniforms.uEnergy.value = energy;
    });
  }

  private loop = (time = performance.now()): void => {
    this.frame = requestAnimationFrame(this.loop);
    if (!this.isEnabled || document.hidden) return;
    document.documentElement.classList.add('three-cards-active');
    this.syncCards(time);
    this.renderer.render(this.scene, this.camera);
    this.lastTime = time;
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('resize', this.resize);
    [...this.cards.values()].forEach(item => this.removeCard(item));
    this.textures.forEach(texture => texture.dispose());
    this.box.dispose(); this.face.dispose(); this.edge.dispose(); this.renderer.dispose();
    this.renderer.domElement.remove();
    document.documentElement.classList.remove('three-cards-active');
  }
}
