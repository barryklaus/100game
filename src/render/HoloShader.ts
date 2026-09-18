import * as THREE from 'three';

// One renderer and one reusable shader paint all visible special-card sheens.
export class HoloShader {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
  private material: THREE.ShaderMaterial;
  private pointer = new THREE.Vector2(.5, .5);
  private screenPointer = new THREE.Vector2(.5, .5);
  private frame = 0;
  enabled = true;
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor(0, 0);
    this.renderer.domElement.className = 'holo-canvas';
    document.body.append(this.renderer.domElement);
    this.camera.position.z = 1;
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uPointer: { value: this.pointer }, uBoost: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.0);}`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime; uniform vec2 uPointer; uniform float uBoost;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          vec2 uv=vUv;
          float dist=distance(uv,uPointer);
          float sweep=1.0-smoothstep(0.0,.24,abs(uv.x*.8+uv.y*.5-fract(uTime*.12)*1.5));
          float pointerGlow=1.0-smoothstep(.0,.58,dist);
          float rainbow=uv.x*.6+uv.y*.35+uTime*.055+pointerGlow*.1;
          vec3 color=.5+.5*cos(6.28318*(rainbow+vec3(0.0,.34,.68)));
          float grain=hash(floor(uv*vec2(210.,320.))+floor(uTime*12.));
          float sparkle=step(.993,grain)*.24;
          float edge=1.-smoothstep(.0,.075,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y)));
          float corner=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
          float mask=smoothstep(0.,.015,corner);
          float alpha=(.06+sweep*.2+pointerGlow*.1+edge*.1+sparkle+uBoost*.1)*mask;
          gl_FragColor=vec4(mix(color,vec3(1.),sparkle),min(alpha,.43));
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    window.addEventListener('pointermove', event => { this.screenPointer.set(event.clientX / innerWidth, 1 - event.clientY / innerHeight); });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.loop();
  }
  private resize(): void {
    this.renderer.setSize(innerWidth, innerHeight, false);
  }
  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    if (!this.enabled || document.hidden) { this.renderer.domElement.style.display = 'none'; return; }
    this.renderer.domElement.style.display = '';
    this.renderer.setScissorTest(false);
    this.renderer.clear();
    this.renderer.setScissorTest(true);
    this.material.uniforms.uTime.value = performance.now() / 1000;
    document.querySelectorAll<HTMLElement>('.playing-card.special:not(.hero-card)').forEach(card => {
      const rect = card.getBoundingClientRect();
      if (rect.width < 1 || rect.bottom < 0 || rect.top > innerHeight) return;
      this.material.uniforms.uBoost.value = card.classList.contains('dragging') ? 1 : 0;
      const x = Math.max(0, Math.floor(rect.left));
      const y = Math.max(0, Math.floor(innerHeight - rect.bottom));
      const w = Math.min(Math.ceil(rect.width), innerWidth - x);
      const h = Math.min(Math.ceil(rect.height), innerHeight - y);
      if (w <= 0 || h <= 0) return;
      this.pointer.set(
        (this.screenPointer.x * innerWidth - rect.left) / rect.width,
        (this.screenPointer.y * innerHeight - (innerHeight - rect.bottom)) / rect.height,
      );
      this.renderer.setViewport(x, y, w, h);
      this.renderer.setScissor(x, y, w, h);
      this.renderer.render(this.scene, this.camera);
    });
    this.renderer.setScissorTest(false);
  };
  dispose(): void { cancelAnimationFrame(this.frame); this.renderer.dispose(); this.material.dispose(); this.renderer.domElement.remove(); }
}
