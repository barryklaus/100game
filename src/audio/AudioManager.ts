export type AudioCue = 'card-hover'|'card-select'|'card-flick'|'card-impact'|'card-draw'|'draw-pile'|'shuffle'|'center-energy'|'total-increase'|'reverse'|'zero'|'minus-ten'|'win'|'loss'|'avatar-reaction'|'emote'|'button'|'tavern-ambience'|'fire-ambience'|'city-ambience';
type LegacyCue = 'pickup'|'slap'|'draw'|'target'|'minus'|'exact'|'bust'|'click';
type Channel = 'sfx'|'music'|'ambience'|'ui';
type AudioOptions = {position?:{x:number;y:number;z:number};intensity?:number;volume?:number};
type SoundSettings = {volume:number;sfxVolume:number;musicVolume:number;ambienceVolume:number;muted:boolean};
const aliases:Record<LegacyCue,AudioCue>={pickup:'card-select',slap:'card-impact',draw:'card-draw',target:'avatar-reaction',minus:'minus-ten',exact:'win',bust:'loss',click:'button'};
const cardClips: readonly [string, string][] = [
  ['take', 'SOUND-CARD-TAKE.mp3'],
  ['deal-1', 'SOUND-CARD-DEAL1.wav'], ['deal-2', 'SOUND-CARD-DEAL2.wav'], ['deal-3', 'SOUND-CARD-DEAL3.wav'],
  ['flick-1', 'SOUND-CARD-FLICK.wav'], ['flick-2', 'SOUND-CARD-FLICK2.wav'],
  ['placed-1', 'SOUND-CARD-PLACED.wav'], ['placed-2', 'SOUND-CARD-PLACED-2.wav'],
];
const cardCueClips: Partial<Record<AudioCue, readonly string[]>> = {
  'card-select': ['take'], 'draw-pile': ['take'],
  'card-draw': ['deal-1', 'deal-2', 'deal-3'], 'shuffle': ['deal-1', 'deal-2', 'deal-3'],
  'card-flick': ['flick-1', 'flick-2'], 'card-impact': ['placed-1', 'placed-2'],
};

/** Replace procedural cues with licensed clips through registerClip without touching gameplay. */
export class AudioManager extends EventTarget {
  private context?:AudioContext;
  private master?:GainNode;
  private channels=new Map<Channel,GainNode>();
  private clips=new Map<string,{buffer:AudioBuffer;channel:Channel;loop:boolean}>();
  private loops=new Map<string,AudioBufferSourceNode>();
  private cardClipLoad?:Promise<void>;
  private previousClip=new Map<AudioCue,string>();
  private settings:SoundSettings={volume:.55,sfxVolume:.8,musicVolume:.45,ambienceVolume:.3,muted:false};
  get volume():number{return this.settings.volume;}
  set volume(value:number){this.settings.volume=value;this.applyGains();}
  configure(settings:SoundSettings):void{this.settings={...settings};this.applyGains();}
  unlock():void{
    if(!this.context){
      this.context=new AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);
      for(const channel of ['sfx','music','ambience','ui'] as const){const gain=this.context.createGain();gain.connect(this.master);this.channels.set(channel,gain);}
      this.applyGains();
    }
    if(this.context.state==='suspended')void this.context.resume();
  }
  private applyGains():void{
    if(!this.context||!this.master)return;
    const now=this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted?0:this.settings.volume,now,.03);
    for(const [channel,gain] of this.channels)gain.gain.setTargetAtTime(channel==='music'?this.settings.musicVolume:channel==='ambience'?this.settings.ambienceVolume:this.settings.sfxVolume,now,.03);
  }
  async registerClip(name:string,url:string,options:{channel?:Channel;loop?:boolean}={}):Promise<void>{
    this.unlock();const response=await fetch(url);if(!response.ok)throw new Error(`Sound could not be loaded: ${name}`);
    const buffer=await this.context!.decodeAudioData(await response.arrayBuffer());this.clips.set(name,{buffer,channel:options.channel??'sfx',loop:options.loop??false});
  }
  /** Decode the supplied card recordings after the first user gesture. */
  loadCardClips():Promise<void>{
    return this.cardClipLoad ??= Promise.allSettled(cardClips.map(([name,file]) =>
      this.registerClip(name,`${import.meta.env.BASE_URL}assets/sfx/${file}`)
    )).then(() => undefined);
  }
  stop(name:string):void{const source=this.loops.get(name);if(source){source.stop();this.loops.delete(name);}}
  private output(channel:Channel,options:AudioOptions):AudioNode{
    const ctx=this.context!;const gain=ctx.createGain();gain.gain.value=options.volume??1;
    if(options.position){const panner=ctx.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=7;panner.maxDistance=35;panner.rolloffFactor=.65;panner.positionX.value=options.position.x;panner.positionY.value=options.position.y;panner.positionZ.value=options.position.z;gain.connect(panner);panner.connect(this.channels.get(channel)!);}else gain.connect(this.channels.get(channel)!);
    return gain;
  }
  private tone(freq:number,duration:number,type:OscillatorType='sine',gain=.08,slide=1,options:AudioOptions={},delay=0):void{
    const ctx=this.context!;const now=ctx.currentTime+delay;const oscillator=ctx.createOscillator();const envelope=ctx.createGain();
    oscillator.type=type;oscillator.frequency.setValueAtTime(freq,now);oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,freq*slide),now+duration);
    envelope.gain.setValueAtTime(.0001,now);envelope.gain.exponentialRampToValueAtTime(Math.max(.0002,gain*(options.intensity??1)),now+.008);envelope.gain.exponentialRampToValueAtTime(.0001,now+duration);
    const output=this.output('sfx',options);oscillator.connect(envelope).connect(output);oscillator.start(now);oscillator.stop(now+duration+.02);oscillator.onended=()=>{oscillator.disconnect();envelope.disconnect();output.disconnect();};
  }
  private paper(duration:number,options:AudioOptions):void{
    const ctx=this.context!,length=Math.floor(ctx.sampleRate*duration);const buffer=ctx.createBuffer(1,length,ctx.sampleRate);const samples=buffer.getChannelData(0);
    for(let i=0;i<length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/length,2)*.12;
    const source=ctx.createBufferSource();source.buffer=buffer;const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=1100;
    const output=this.output('sfx',options);source.connect(filter).connect(output);source.start();source.onended=()=>{source.disconnect();filter.disconnect();output.disconnect();};
  }
  play(name:AudioCue|LegacyCue,options:AudioOptions={}):void{
    const cue=aliases[name as LegacyCue]??name as AudioCue;
    this.dispatchEvent(new CustomEvent('cue',{detail:{name:cue,...options}}));
    this.unlock();if(this.settings.muted||!this.volume)return;
    const choices=cardCueClips[cue]?.filter(key=>this.clips.has(key));
    const previous=this.previousClip.get(cue);
    const candidates=choices && choices.length>1 ? choices.filter(key=>key!==previous) : choices;
    const chosen=candidates?.[Math.floor(Math.random()*candidates.length)] ?? cue;
    if(choices?.length)this.previousClip.set(cue,chosen);
    const clip=this.clips.get(chosen);
    if(clip){if(clip.loop&&this.loops.has(cue))return;const source=this.context!.createBufferSource();source.buffer=clip.buffer;source.loop=clip.loop;const output=this.output(clip.channel,options);source.connect(output);source.start();if(clip.loop)this.loops.set(cue,source);source.onended=()=>{source.disconnect();output.disconnect();this.loops.delete(cue);};return;}
    if(cue==='card-hover')this.tone(430,.04,'sine',.014,1.06,options);
    else if(cue==='card-select'){this.paper(.07,options);this.tone(320,.07,'sine',.028,1.16,options);}
    else if(cue==='card-flick'||cue==='shuffle')this.paper(.14,options);
    else if(cue==='card-impact'){this.paper(.055,options);this.tone(115,.12,'triangle',.13,.45,options);}
    else if(cue==='card-draw'||cue==='draw-pile')this.paper(.1,options);
    else if(cue==='avatar-reaction'||cue==='emote')this.tone(520,.18,'sine',.055,.75,options);
    else if(cue==='reverse'){this.tone(320,.19,'sine',.07,1.6,options);this.tone(520,.2,'sine',.05,.65,options,.13);}
    else if(cue==='zero')this.tone(195,.38,'sine',.09,.52,options);
    else if(cue==='minus-ten'){this.tone(110,.4,'sine',.13,.36,options);this.paper(.13,{...options,volume:.35});}
    else if(cue==='win')[523,659,784,1047].forEach((f,i)=>this.tone(f,.32,'sine',.065,1,options,i*.07));
    else if(cue==='loss')this.tone(180,.55,'triangle',.09,.25,options);
    else if(cue==='button')this.tone(560,.04,'sine',.025,1.08,options);
    else if(cue==='total-increase'||cue==='center-energy')this.tone(170,.2,'sine',.035,1.3,options);
    // Ambience and music are independent loop buses, silent until a real clip is registered.
  }
  dispose():void{for(const source of this.loops.values())source.stop();this.loops.clear();void this.context?.close();}
}
