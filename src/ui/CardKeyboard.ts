type CardKey = {key:string;repeat:boolean;altKey:boolean;ctrlKey:boolean;metaKey:boolean};
export type CardKeyboardAction = {type:'select'|'play';id:string}|{type:'consume'};

/** Only cards in the current controllable hand may receive keyboard actions. */
export function cardKeyboardAction(event:CardKey, ids:string[], selected:string|null, focused:string|undefined):CardKeyboardAction|undefined {
  if(event.altKey||event.ctrlKey||event.metaKey||!ids.length)return;
  const previous=event.key==='ArrowLeft'||event.key==='ArrowUp';
  const next=event.key==='ArrowRight'||event.key==='ArrowDown';
  const current=ids.includes(focused??'')?focused:ids.includes(selected??'')?selected:undefined;
  if(previous||next){
    const index=current?ids.indexOf(current):-1;
    return {type:'select',id:ids[index<0?(previous?0:ids.length-1):(index+(previous?-1:1)+ids.length)%ids.length]};
  }
  if(event.key===' '||event.key==='Enter')return event.repeat||!current?{type:'consume'}:{type:'play',id:current};
}
