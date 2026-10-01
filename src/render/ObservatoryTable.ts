import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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
  c.fillStyle='#191d28';c.fillRect(0,0,2048,2048);
  let seed=91;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<48000;i++){const light=random()>.5;c.fillStyle=light?'#ffffff05':'#0000000b';c.fillRect(random()*2048,random()*2048,random()*3+1,1);}
  c.translate(mid,mid);
  const circle=(r:number,color:string,width=1)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();};
  [370,390,408,741,753,820,882,897,969,981].forEach((r,i)=>circle(r,i<3?'#665c4e':'#807052',i%3===0?2:1));
  for(let i=0;i<180;i++){
    const a=i/180*Math.PI*2;c.save();c.rotate(a);
    c.strokeStyle=i%5===0?'#ae8b52':'#6a5b45';c.lineWidth=i%5===0?2:1;c.beginPath();c.moveTo(0,-902);c.lineTo(0,i%5===0?-933:-916);c.stroke();
    if(i%15===0){c.font='16px Georgia';c.textAlign='center';c.fillStyle='#98815a';c.fillText(String(i*2).padStart(3,'0'),0,-948);}
    c.restore();
  }
  for(let i=0;i<12;i++){
    c.save();c.rotate(i*Math.PI/6);c.strokeStyle='#81704c';c.lineWidth=1;
    c.beginPath();c.moveTo(0,-421);c.lineTo(0,-488);c.moveTo(-9,-458);c.lineTo(0,-470);c.lineTo(9,-458);c.lineTo(0,-446);c.closePath();c.stroke();
    c.beginPath();c.moveTo(-30,-785);c.lineTo(0,-815);c.lineTo(30,-785);c.lineTo(0,-755);c.closePath();c.stroke();
    c.fillStyle='#9b8257';c.font='22px Georgia';c.textAlign='center';c.fillText(['✧','·','◇','⊙'][i%4],0,-772);
    c.restore();
  }
  // Sparse constellation tracks in the annulus, leaving the center quiet.
  for(let i=0;i<16;i++){
    const a=random()*Math.PI*2,r=500+random()*170;
    c.save();c.rotate(a);c.translate(r,0);c.strokeStyle='#686b8755';c.beginPath();c.moveTo(-24,-15);c.lineTo(18,8);c.lineTo(48,-26);c.stroke();
    for(const [x,y] of [[-24,-15],[18,8],[48,-26]]){c.fillStyle='#b7ac8477';c.beginPath();c.arc(x,y,2,0,Math.PI*2);c.fill();}c.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

export class ObservatoryTable {
  readonly group=new THREE.Group();
  readonly cradle=new THREE.Group();
  private haze:THREE.Mesh;
  private metal=brass();
  private danger={value:0};
  private flow={value:1};
  private flowStrength={value:0};
  constructor(){
    const metal=this.metal;
    const edge=new THREE.MeshStandardMaterial({color:0x131620,metalness:.75,roughness:.38});
    const base=new THREE.Mesh(new THREE.CylinderGeometry(5.05,4.94,.28,128),edge);base.position.y=.19;base.receiveShadow=true;this.group.add(base);
    const top=new THREE.Mesh(new THREE.CircleGeometry(4.99,128),new THREE.MeshStandardMaterial({map:engraving(),roughness:.62,metalness:.38}));
    const surface=top.material as THREE.MeshStandardMaterial;
    surface.onBeforeCompile=shader=>{
      shader.uniforms.uTableDanger=this.danger;
      shader.uniforms.uTableFlow=this.flow;
      shader.uniforms.uTableFlowStrength=this.flowStrength;
      shader.fragmentShader='uniform float uTableDanger;uniform float uTableFlow;uniform float uTableFlowStrength;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        float lineMask=smoothstep(.025,.095,max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b)));
        float goldMask=smoothstep(.01,.055,diffuseColor.r-diffuseColor.b);
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
    for(const [r,w,y] of [[5.02,.027,.335],[4.82,.008,.352],[4.37,.009,.351],[5.01,.015,.065]])this.group.add(ring(r,w,metal,y));
    const studs=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.055,0),metal,24);
    for(let i=0;i<24;i++){const a=i/24*Math.PI*2;const m=new THREE.Matrix4().makeRotationY(a);m.scale(new THREE.Vector3(1,.25,1));m.setPosition(Math.sin(a)*4.92,.356,Math.cos(a)*4.92);studs.setMatrixAt(i,m);}this.group.add(studs);
    const floor=new THREE.Mesh(new THREE.CircleGeometry(50,64),new THREE.MeshStandardMaterial({color:0x070810,roughness:.8}));floor.rotation.x=-Math.PI/2;floor.position.y=-.3;floor.receiveShadow=true;this.group.add(floor);
    this.buildCradle(metal,edge);this.group.add(this.cradle);
    // A single low-opacity cone approximates overhead light scattering, with no raymarch pass.
    this.haze=new THREE.Mesh(new THREE.ConeGeometry(4.6,7.5,40,1,true),new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
      uniforms:{opacity:{value:.015}},
      vertexShader:`varying vec2 vUv;varying float vFacing;void main(){vUv=uv;vec4 view=modelViewMatrix*vec4(position,1.);vFacing=abs(dot(normalize(normalMatrix*normal),normalize(-view.xyz)));gl_Position=projectionMatrix*view;}`,
      fragmentShader:`varying vec2 vUv;varying float vFacing;uniform float opacity;void main(){float soft=pow(sin(vUv.y*3.14159),2.);float bands=.72+.28*sin(vUv.x*37.);gl_FragColor=vec4(.48,.49,.68,soft*bands*opacity*pow(vFacing,2.));}`
    }));this.haze.position.set(-.25,4.12,0);this.group.add(this.haze);
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
  configure(quality:QualityPreset):void{
    this.haze.visible=quality==='ultra'||quality==='high';
    (this.haze.material as THREE.ShaderMaterial).uniforms.opacity.value=quality==='ultra'?.006:.002;
  }
  private buildCradle(metal:THREE.Material,edge:THREE.Material):void{
    const base=new THREE.Mesh(new RoundedBoxGeometry(1.24,.065,1.69,3,.065),edge);base.position.y=.313;base.receiveShadow=true;this.cradle.add(base);
    // The four shallow bevels border a recessed card-sized landing, never another deck.
    for(const [x,z,w,d] of [[-.586,0,.035,1.51],[.586,0,.035,1.51],[0,-.808,1.1,.035],[0,.808,1.1,.035]]){
      const rail=new THREE.Mesh(new RoundedBoxGeometry(w,.025,d,2,.012),metal);rail.position.set(x,.355,z);this.cradle.add(rail);
    }
    const geometry=new THREE.BufferGeometry();const lines:number[]=[];
    for(let i=0;i<3;i++){const r=.15+i*.13;for(let s=0;s<32;s++){const a=s/32*Math.PI*2,b=(s+1)/32*Math.PI*2;lines.push(Math.cos(a)*r,.349,Math.sin(a)*r,Math.cos(b)*r,.349,Math.sin(b)*r);}}
    lines.push(-.4,.349,0,.4,.349,0,0,.349,-.62,0,.349,.62);
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));this.cradle.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x806845,transparent:true,opacity:.65})));
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
