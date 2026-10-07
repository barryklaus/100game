import type {AudioCue} from './AudioManager';
/** Inbound snapshots and their flight completion describe the same card once. */
export class RemoteCardAudio {
  private thrown='';
  private landed='';
  constructor(private play:(cue:AudioCue)=>void){}
  reset():void{this.thrown='';this.landed='';}
  throw(key:string):void{if(key&&key!==this.thrown){this.thrown=key;this.play('card-flick');}}
  land(key:string):void{if(key&&key!==this.landed){this.landed=key;this.play('card-impact');}}
}
