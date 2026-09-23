import * as THREE from 'three';
import { CARD_THICKNESS, createCardMesh, disposeCardMesh, roundedCardOutline } from './CardMesh';

// The inset cloth ends at .3475. Cards sit on it, with no plinth or spacer.
export const CARD_TABLE_HEIGHT = .349;
const CARD_PITCH = CARD_THICKNESS + .00015;
const VISIBLE_CARDS = 3;

function makePaperSide(): THREE.DataTexture {
  const pixels = new Uint8Array(4 * 4 * 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const shade = y === 0 ? 82 : y === 1 ? 126 : y === 2 ? 111 : 72;
    const offset = (y * 4 + x) * 4;
    pixels[offset] = shade;
    pixels[offset + 1] = Math.round(shade * .88);
    pixels[offset + 2] = Math.round(shade * .76);
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, 4, 4, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function makeRoundedStackSide(): THREE.BufferGeometry {
  const outline = roundedCardOutline(1.02, 1.42);
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  let distance = 0;
  outline.forEach((point, index) => {
    if (index) distance += point.distanceTo(outline[index - 1]);
    positions.push(point.x, 0, point.y, point.x, 1, point.y);
    uv.push(distance, 0, distance, 1);
    const next = (index + 1) % outline.length;
    indices.push(index * 2, index * 2 + 1, next * 2, next * 2, index * 2 + 1, next * 2 + 1);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** The top three cards stay physical; a striped paper block carries hidden layers. */
export class CardPile {
  readonly group = new THREE.Group();
  private cards = new Map<string, THREE.Group>();
  private requested: string[] = [];
  private backUrl = '';
  private revision = 0;
  private disposed = false;
  private sideTexture = makePaperSide();
  private sideMaterial = new THREE.MeshStandardMaterial({map:this.sideTexture,roughness:.9,metalness:0});
  private body = new THREE.Mesh(makeRoundedStackSide(), this.sideMaterial);
  get count(): number { return this.requested.length; }

  constructor(private draw: boolean, private load: (url: string) => Promise<THREE.Texture>) {
    this.body.name = 'pile-paper-body';
    this.body.castShadow = true;
    this.body.receiveShadow = true;
  }

  async setCards(fronts: string[], backUrl: string): Promise<void> {
    if (backUrl === this.backUrl && fronts.length === this.count && fronts.every((url, i) => url === this.requested[i])) return;
    this.requested = [...fronts]; this.backUrl = backUrl;
    const revision = ++this.revision;
    const firstVisible = Math.max(0, fronts.length - VISIBLE_CARDS);
    const keys = fronts.slice(firstVisible).map((url, offset) => `${firstVisible + offset}:${url}`);
    this.sideTexture.repeat.y = firstVisible;
    this.sideTexture.needsUpdate = true;
    if (firstVisible) {
      this.body.scale.y = firstVisible * CARD_PITCH;
      this.body.position.y = CARD_TABLE_HEIGHT;
      if (this.body.parent !== this.group) this.group.add(this.body);
    } else this.group.remove(this.body);
    for (const [key, card] of this.cards) {
      if (keys.includes(key)) continue;
      this.group.remove(card); disposeCardMesh(card); this.cards.delete(key);
    }
    if (!fronts.length) return;
    const back = await this.load(backUrl);
    await Promise.all(fronts.slice(firstVisible).map(async (url, offset) => {
      const index = firstVisible + offset;
      const key = keys[offset];
      if (this.cards.has(key)) return;
      const front = await this.load(url);
      if (this.disposed || revision !== this.revision) return;
      const card = createCardMesh(front, back);
      const pose = this.localPose(index);
      card.position.copy(pose.position); card.quaternion.copy(pose.quaternion);
      this.cards.set(key, card); this.group.add(card);
    }));
  }

  private localPose(index: number): {position: THREE.Vector3; quaternion: THREE.Quaternion} {
    // Tiny stable misalignment, with tighter registration in the draw deck.
    const spread = this.draw ? .0025 : .009;
    const angle = index === 0 ? 0 : Math.sin(index * 2.37) * (this.draw ? .002 : .018);
    const position = new THREE.Vector3(
      index === 0 ? 0 : Math.sin(index * 2.8) * spread,
      CARD_TABLE_HEIGHT + CARD_THICKNESS / 2 + index * CARD_PITCH,
      index === 0 ? 0 : Math.cos(index * 1.9) * spread,
    );
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    return {position, quaternion};
  }

  /** index=count is the next landing position, or the card just drawn off the top. */
  cardPose(index = Math.max(0, this.count - 1)): {position: THREE.Vector3; quaternion: THREE.Quaternion} {
    const pose = this.localPose(index);
    this.group.updateWorldMatrix(true, false);
    this.group.localToWorld(pose.position);
    pose.quaternion.premultiply(this.group.getWorldQuaternion(new THREE.Quaternion()));
    return pose;
  }

  dispose(): void {
    this.disposed = true; this.revision++;
    for (const card of this.cards.values()) disposeCardMesh(card);
    this.cards.clear(); this.group.clear();
    this.body.geometry.dispose();this.sideMaterial.dispose();this.sideTexture.dispose();
  }
}
