import { conditionAnimations } from './ConditionAnimationData';
import { masterCharacterData } from './MasterSpriteData';
import { masterAnimations } from './MasterAnimationData';

export const masterNames = masterCharacterData.map(character => character.name);
export function masterCharacter(index: number) {
  return masterCharacterData[(index % masterCharacterData.length + masterCharacterData.length) % masterCharacterData.length];
}
export function masterImage(index: number, portrait = false): string {
  const id = masterCharacter(index).id;
  if(!portrait)return `${import.meta.env.BASE_URL}assets/social-club/masters-native-v1/${id}-master.webp`;
  const revision = id === 'finn' ? '-v2' : '';
  return `${import.meta.env.BASE_URL}assets/social-club/masters-v1/${id}-${portrait ? 'portrait' : 'master'}${revision}.webp`;
}
/** The artwork stays a whole drawing; these invisible anchors connect the actual flying cards. */
export function masterHandRect(root: HTMLElement, index: number, catching = false): DOMRect | undefined {
  return root.querySelector<HTMLElement>(`.seat[data-seat="${index}"] .master-hand-${catching ? 'catch' : 'release'}`)?.getBoundingClientRect();
}
export function masterAnchors(index: number,condition=0): string {
  const character = masterCharacter(index);
  return (['release', 'catch'] as const).map(kind => {
    const data=conditionAnimations[character.id]?.[condition]??masterAnimations[character.id];
    const [x, y, w, h] = data?.handoff?.[kind] ?? character[kind];
    const [scale,dx,dy]=data?.registration??[1,0,0];
    return `<span class="master-hand-${kind}" aria-hidden="true" style="left:${((x-w/2)*scale+dx/4)/512*100}%;top:${((y-h/2)*scale+dy/4)/512*100}%;width:${w*scale/512*100}%;height:${h*scale/512*100}%"></span>`;
  }).join('');
}
