export type AvatarPose='idle'|'blink'|'look'|'anticipation'|'happy'|'laugh'|'shock'|'worried'|'angry'|'smug'|'thinking'|'celebration'|'defeat';
export type AvatarAtlas={url:string;columns:number;rows:number;fps:number;clips:Partial<Record<AvatarPose,readonly number[]>>};

/** Supplied still portraits use restrained motion. Future atlases plug into the same seat elements. */
export class AvatarAnimator {
  private atlases=new Map<number,AvatarAtlas>();
  private frame=0;
  private last=0;
  private reduced=false;
  private nodes:HTMLElement[]=[];
  private observer:MutationObserver;
  constructor(root:HTMLElement){
    this.observer=new MutationObserver(()=>{this.nodes=Array.from(root.querySelectorAll<HTMLElement>('[data-avatar-pose]'));});
    this.observer.observe(root,{childList:true,subtree:true});this.frame=requestAnimationFrame(this.tick);
  }
  register(avatar:number,atlas:AvatarAtlas):void{this.atlases.set(avatar,atlas);}
  configure(reducedMotion:boolean):void{this.reduced=reducedMotion;}
  private tick=(time:number):void=>{
    this.frame=requestAnimationFrame(this.tick);if(document.hidden||time-this.last<80)return;this.last=time;
    for(const node of this.nodes){const atlas=this.atlases.get(Number(node.dataset.avatarId));if(!atlas)continue;
      const pose=node.dataset.avatarPose as AvatarPose;const clip=atlas.clips[pose]??atlas.clips.idle;if(!clip?.length)continue;
      const frame=clip[this.reduced?0:Math.floor(time/1000*atlas.fps)%clip.length];
      const image=node.querySelector<HTMLImageElement>('img');if(image)image.style.opacity='0';
      node.style.backgroundImage=`url("${atlas.url}")`;node.style.backgroundSize=`${atlas.columns*100}% ${atlas.rows*100}%`;
      node.style.backgroundPosition=`${atlas.columns===1?0:frame%atlas.columns/(atlas.columns-1)*100}% ${atlas.rows===1?0:Math.floor(frame/atlas.columns)/(atlas.rows-1)*100}%`;
    }
  };
  dispose():void{cancelAnimationFrame(this.frame);this.observer.disconnect();}
}
export function avatarPose(mood:string,active:boolean,ended:boolean,busted:boolean):AvatarPose{
  if(ended)return busted?'defeat':'celebration';
  const map:Record<string,AvatarPose>={Happy:'happy',Angry:'angry',Sad:'defeat',Confident:'smug',Focused:'anticipation',Thinking:'thinking',Excited:'laugh',Scared:'worried',Smug:'smug',Confused:'shock',Tired:'idle',Bored:'look'};
  return active?'anticipation':map[mood]??'idle';
}
