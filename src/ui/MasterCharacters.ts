import { masterCharacterData } from './MasterSpriteData';

export const masterNames = masterCharacterData.map(character => character.name);
export function masterCharacter(index: number) {
  return masterCharacterData[(index % masterCharacterData.length + masterCharacterData.length) % masterCharacterData.length];
}
export function masterImage(index: number, portrait = false): string {
  return `${import.meta.env.BASE_URL}assets/social-club/masters-v1/${masterCharacter(index).id}-${portrait ? 'portrait' : 'master'}.webp`;
}
/** The artwork stays a whole drawing; these invisible anchors connect the actual flying cards. */
export function masterHandRect(root: HTMLElement, index: number, catching = false): DOMRect | undefined {
  return root.querySelector<HTMLElement>(`.seat[data-seat="${index}"] .master-hand-${catching ? 'catch' : 'release'}`)?.getBoundingClientRect();
}
export function masterAnchors(index: number): string {
  const character = masterCharacter(index);
  return (['release', 'catch'] as const).map(kind => {
    const [x, y, w, h] = character[kind];
    return `<span class="master-hand-${kind}" aria-hidden="true" style="left:${(x-w/2)/512*100}%;top:${(y-h/2)/512*100}%;width:${w/512*100}%;height:${h/512*100}%"></span>`;
  }).join('');
}
