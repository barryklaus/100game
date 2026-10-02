import * as THREE from 'three';
import { glowTexture } from './WorldMaterials';
import { totalDanger } from '../ui/totalFeedback';
import type { QualityPreset } from './quality';

const HEAT_RED=new THREE.Color(0xff2718);
const RING_RED=new THREE.Color(0xff2318);
const brass = () => new THREE.MeshStandardMaterial({color:0x9b7844,metalness:.82,roughness:.36});
function ring(radius:number, width:number, material:THREE.Material, y:number):THREE.Mesh {
  const mesh=new THREE.Mesh(new THREE.TorusGeometry(radius,width,6,128),material);
  mesh.rotation.x=-Math.PI/2;mesh.position.y=y;return mesh;
}

/** One baked engraving map gives every quality tier the same crafted surface. */
function engraving():THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;
  const c=canvas.getContext('2d')!;const mid=1024;
  c.fillStyle='#10243a';c.fillRect(0,0,2048,2048);
  let seed=91;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<48000;i++){const light=random()>.5;c.fillStyle=light?'#ffffff05':'#0000000b';c.fillRect(random()*2048,random()*2048,random()*3+1,1);}
  c.translate(mid,mid);
  const circle=(r:number,color:string,width=1)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();};
  [345,892,908].forEach((r,i)=>circle(r,'#aa844d',i===1?2:1));
  for(let i=0;i<72;i++){
    const a=i/72*Math.PI*2;c.save();c.rotate(a);
    c.strokeStyle=i%6===0?'#bc9559':'#715c3d';c.lineWidth=1;c.beginPath();c.moveTo(0,-919);c.lineTo(0,i%6===0?-942:-926);c.stroke();
    c.restore();
  }
  for(let i=0;i<12;i++){
    c.save();c.rotate(i*Math.PI/6);c.strokeStyle='#81704c';c.lineWidth=1;
    c.beginPath();c.moveTo(0,-354);c.lineTo(0,-385);c.moveTo(-5,-370);c.lineTo(0,-378);c.lineTo(5,-370);c.lineTo(0,-362);c.closePath();c.stroke();
    const radius=820;c.fillStyle='#b89559';c.beginPath();
    for(let j=0;j<16;j++){const a=j*Math.PI/8,r=j%2?3:j%4===0?15:8;const x=Math.sin(a)*r,y=-radius+Math.cos(a)*r;j?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();c.fill();
    c.restore();
  }
  // Sparse constellation tracks in the annulus, leaving the center quiet.
  for(let i=0;i<28;i++){
    const a=random()*Math.PI*2,r=440+random()*330;
    c.save();c.rotate(a);c.translate(r,0);c.strokeStyle='#ad864780';c.beginPath();c.moveTo(-24,-15);c.lineTo(18,8);c.lineTo(48,-26);c.stroke();
    for(const [x,y] of [[-24,-15],[18,8],[48,-26]]){c.fillStyle='#ccab6da0';c.beginPath();c.arc(x,y,2,0,Math.PI*2);c.fill();}c.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

/** Baked walnut grain keeps the physical rim inexpensive at every quality tier. */
function walnut():THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const c=canvas.getContext('2d')!;c.fillStyle='#754522';c.fillRect(0,0,512,512);
  for(let i=0;i<900;i++){
    c.strokeStyle=i%3===0?'#e8a95a18':'#25120724';c.lineWidth=i%5===0?1.4:.6;
    c.beginPath();
    for(let x=0;x<=512;x+=8){const y=i*.64+Math.sin(x*.018+i*.22)*3+Math.sin(x*.055+i)*.7;x?c.lineTo(x,y):c.moveTo(x,y);}
    c.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;return texture;
}

export class ObservatoryTable {
  readonly group=new THREE.Group();
  private metal=brass();
  private danger={value:0};
  private flow={value:1};
  private flowStrength={value:0};
  constructor(){
    const metal=this.metal;
    const wood=new THREE.MeshStandardMaterial({map:walnut(),color:0xf4bd83,metalness:.08,roughness:.3});
    const base=new THREE.Mesh(new THREE.CylinderGeometry(5.05,4.98,.36,128),wood);base.position.y=.14;base.receiveShadow=true;this.group.add(base);
    const rail=new THREE.Mesh(new THREE.RingGeometry(4.72,5.05,128),wood);rail.rotation.x=-Math.PI/2;rail.position.y=.345;rail.receiveShadow=true;this.group.add(rail);
    const top=new THREE.Mesh(new THREE.CircleGeometry(4.74,128),new THREE.MeshStandardMaterial({map:engraving(),roughness:.91,metalness:.06}));
    const surface=top.material as THREE.MeshStandardMaterial;
    surface.onBeforeCompile=shader=>{
      shader.uniforms.uTableDanger=this.danger;
      shader.uniforms.uTableFlow=this.flow;
      shader.uniforms.uTableFlowStrength=this.flowStrength;
      shader.fragmentShader='uniform float uTableDanger;uniform float uTableFlow;uniform float uTableFlowStrength;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        float goldMask=smoothstep(.01,.055,diffuseColor.r-diffuseColor.b);
        float lineMask=goldMask*smoothstep(.03,.18,max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b)));
        vec3 heated=vec3(max(diffuseColor.r*1.9,.16),diffuseColor.g*.08,diffuseColor.b*.035);
        diffuseColor.rgb=mix(diffuseColor.rgb,heated,uTableDanger*goldMask);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        float radius=length(vMapUv-vec2(.5))*2.;
        float waveRadius=1.03-uTableFlow*1.3;
        float wave=1.-smoothstep(.025,.14,abs(radius-waveRadius));
        float wake=smoothstep(0.,.06,radius-waveRadius)*(1.-smoothstep(.06,.32,radius-waveRadius));
        float flash=pow(max(0.,1.-uTableFlow*5.),2.);
        vec3 flowColor=mix(vec3(1.,.58,.12),vec3(1.,.045,.008),uTableDanger);
        totalEmissiveRadiance+=flowColor*lineMask*uTableFlowStrength*(wave*3.2+wake*.18+flash*.9);`);
    };
    top.rotation.x=-Math.PI/2;top.position.y=.3475;top.receiveShadow=true;this.group.add(top);
    for(const [r,w,y] of [[4.76,.012,.352],[5.015,.014,.335],[5.01,.011,.005]])this.group.add(ring(r,w,metal,y));
  }
  setTotal(total:number):void{
    const danger=totalDanger(total);this.danger.value=danger;
    this.metal.color.set(0x9b7844).lerp(HEAT_RED,danger);
    this.metal.emissive.set(0xff2310);this.metal.emissiveIntensity=danger*.32;
  }
  setFlow(progress:number,strength:number):void{
    this.flow.value=progress;this.flowStrength.value=strength;
    const rimPulse=Math.pow(Math.max(0,1-progress*4),2)*strength;
    this.metal.emissive.copy(this.metal.color);this.metal.emissiveIntensity=this.danger.value*.32+rimPulse*2;
  }
}

/** Presentation-only ring, direction marks and bounded event effects. */
export class ArcaneTotalRing {
  readonly group=new THREE.Group();
  private orbit=new THREE.Group();
  private metal=brass();
  private danger=0;
  private sectors=new THREE.Group();
  private light=new THREE.MeshBasicMaterial({color:0x858ce0,transparent:true,opacity:.55,depthWrite:false});
  private pulse:THREE.Mesh;
  private fragments:THREE.Points;
  private elapsed=2;
  private event='none';
  private direction=1;
  private arrival=0;
  private quality:QualityPreset='high';
  constructor(){
    this.group.position.set(0,0,0);
    const metal=this.metal;
    for(const [r,w,y] of [[1.34,.012,.36],[1.48,.007,.362],[1.63,.013,.357]])this.group.add(ring(r,w,metal,y));
    this.group.add(ring(1.38,.007,this.light,.37));
    for(let i=0;i<12;i++){
      const sector=new THREE.Mesh(new THREE.TorusGeometry(1.55,.012,5,12,Math.PI/9),this.light);sector.rotation.x=-Math.PI/2;sector.rotation.z=i*Math.PI/6;sector.position.y=.376;this.sectors.add(sector);
      const a=i/12*Math.PI*2;const marker=new THREE.Mesh(new THREE.ConeGeometry(.035,.12,3),metal);marker.rotation.set(-Math.PI/2,0,-a);marker.position.set(Math.sin(a)*1.74,.366,Math.cos(a)*1.74);this.orbit.add(marker);
    }
    this.group.add(this.orbit,this.sectors);
    this.pulse=new THREE.Mesh(new THREE.RingGeometry(1.2,1.24,96),new THREE.MeshBasicMaterial({color:0x97bdff,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));this.pulse.rotation.x=-Math.PI/2;this.pulse.position.y=.39;this.group.add(this.pulse);
    const positions=new Float32Array(48*3);for(let i=0;i<48;i++){const a=i*2.399;positions[i*3]=Math.sin(a)*(1.4+(i%7)*.055);positions[i*3+1]=.4+(i%5)*.055;positions[i*3+2]=Math.cos(a)*(1.4+(i%7)*.055);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    this.fragments=new THREE.Points(geometry,new THREE.PointsMaterial({color:0x9aaeff,size:.027,transparent:true,opacity:.25,depthWrite:false,map:glowTexture(),blending:THREE.AdditiveBlending}));this.group.add(this.fragments);
  }
  configure(quality:QualityPreset):void{this.quality=quality;this.fragments.geometry.setDrawRange(0,quality==='ultra'?48:quality==='high'?20:quality==='medium'?8:0);}
  trigger(event:string):void {this.event=event;this.elapsed=0;}
  setTotal(total:number):void{this.danger=totalDanger(total);this.metal.color.set(0x9b7844).lerp(HEAT_RED,this.danger);}
  receiveCard():void{this.arrival=1;}
  setDirection(direction:number):void {this.direction=direction;}
  update(delta:number,reduced:boolean):void{
    this.elapsed+=delta;const t=Math.min(1,this.elapsed/1.05);const strength=reduced?0:Math.sin(t*Math.PI);
    const burst=this.event==='bust';
    this.light.color.set(0xc99a4e).lerp(RING_RED,this.danger);
    this.arrival=Math.max(0,this.arrival-delta*3);
    this.light.opacity=Math.min(1,.26+this.danger*.5+strength*.2+this.arrival*.6);
    this.metal.emissive.copy(this.light.color);this.metal.emissiveIntensity=reduced?0:this.arrival*1.8;
    // Rotate inside the shared oval coordinates, never lift/tilt the line art off the cloth.
    const motion=reduced||t>=1?0:delta*strength*this.direction;
    this.sectors.rotation.y+=motion*(this.event==='reverse'?-1.1:.55);
    this.orbit.rotation.y+=motion*.65;
    this.orbit.scale.z=this.direction;
    const active=['exact','bust','zero','minus'].includes(this.event);
    const material=this.pulse.material as THREE.MeshBasicMaterial;material.opacity=active?strength*(burst?.8:.45):0;material.color.copy(this.light.color);
    const inward=this.event==='zero'||this.event==='minus';this.pulse.scale.setScalar(inward?1.5-t*.65:1+t*.85);
    const particles=this.fragments.material as THREE.PointsMaterial;particles.opacity=reduced?0:(this.quality==='ultra'?.22:.12)+strength*(burst?.75:.25);particles.color.copy(this.light.color);
    this.fragments.rotation.y+=reduced?0:delta*.035*this.direction;this.fragments.position.y=burst?strength*.5:0;
  }
}
