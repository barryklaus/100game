/** Fixed phrases keep room reactions short and safe for everyone. */
export const REACTIONS = [
  {id:'yawa',text:'Yawa!'}, {id:'atay',text:'Atay!'}, {id:'rip',text:'RIP'},
  {id:'nice',text:'Nice one.'}, {id:'personal',text:'That was personal.'},
  {id:'fine',text:'This is fine.'}, {id:'mercy',text:'Have mercy.'},
  {id:'oops',text:'Oops.'}, {id:'cursed',text:'Cursed table.'},
  {id:'relax',text:'Everybody relax.'}, {id:'problem',text:'Your problem now.'},
  {id:'funeral',text:'Too young for this.'},
] as const;
export function reactionPhrase(id:unknown):string|undefined{return REACTIONS.find(item=>item.id===id)?.text;}
export interface RoomReaction {serial:number;seat:number;phrase:string;expiresAt:number}
export function specialPhrase(rank:string):string|undefined {
  return ({'7':'CHOOSE · Your problem now.','8':'REVERSE · Plot twist.','9':'ZERO · Nothing to see here.','10':'−10 · Crisis postponed.'} as Record<string,string>)[rank];
}
