import * as THREE from 'three';

/** Cards share the world camera, but composite above the HTML characters and total. */
export class ForegroundCards {
  readonly scene = new THREE.Scene();
  private renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  private active = false;
  contextLost = false;

  constructor(private camera: THREE.PerspectiveCamera, onContextChange: () => void) {
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'foreground-cards-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.hidden = true;
    document.body.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.contextLost = true; this.renderer.domElement.hidden = true; onContextChange();
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.contextLost = false; onContextChange();
    });
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.renderer.domElement.hidden = true;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
  }

  render(): void {
    const visible = this.active && !this.contextLost && this.scene.children.some(card => card.visible);
    this.renderer.domElement.hidden = !visible;
    if (visible) this.renderer.render(this.scene, this.camera);
  }

  get drawCalls(): number { return this.renderer.domElement.hidden ? 0 : this.renderer.info.render.calls; }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
