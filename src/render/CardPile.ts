import * as THREE from 'three';
import { CARD_THICKNESS, createCardMesh, disposeCardMesh } from './CardMesh';

// The inset cloth ends at .3475. Cards sit on it, with no plinth or spacer.
export const CARD_TABLE_HEIGHT = .349;
const CARD_PITCH = CARD_THICKNESS + .00015;

/** One thin physical card per entry; the top face always belongs to the stack. */
export class CardPile {
  readonly group = new THREE.Group();
  private cards = new Map<string, THREE.Group>();
  private requested: string[] = [];
  private backUrl = '';
  private revision = 0;
  private disposed = false;
  get count(): number { return this.requested.length; }

  constructor(private draw: boolean, private load: (url: string) => Promise<THREE.Texture>) {}

  async setCards(fronts: string[], backUrl: string): Promise<void> {
    if (backUrl === this.backUrl && fronts.length === this.count && fronts.every((url, i) => url === this.requested[i])) return;
    this.requested = [...fronts]; this.backUrl = backUrl;
    const revision = ++this.revision;
    const keys = fronts.map((url, index) => `${index}:${url}`);
    for (const [key, card] of this.cards) {
      if (keys.includes(key)) continue;
      this.group.remove(card); disposeCardMesh(card); this.cards.delete(key);
    }
    if (!fronts.length) return;
    const back = await this.load(backUrl);
    await Promise.all(fronts.map(async (url, index) => {
      if (this.cards.has(keys[index])) return;
      const front = await this.load(url);
      if (this.disposed || revision !== this.revision) return;
      const card = createCardMesh(front, back);
      const pose = this.localPose(index);
      card.position.copy(pose.position); card.quaternion.copy(pose.quaternion);
      this.cards.set(keys[index], card); this.group.add(card);
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
  }
}
