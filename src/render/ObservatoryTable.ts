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
/** Inlaid line art stays above the felt and below the first card's paper edge. */
function inlaidRing(radius:number,width:number,material:THREE.Material):THREE.Mesh {
  const mesh=ring(radius,width,material,.3482);
  mesh.scale.z=.04;
  return mesh;
}

/** One baked celestial atlas keeps the richer design at a single surface draw call. */
function engraving(cartoon=false):THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;
  const c=canvas.getContext('2d')!;
  c.fillStyle=cartoon?'#073e49':'#10243a';c.fillRect(0,0,2048,2048);
  let seed=91;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  if(cartoon){
    // Broad illustrated felt tones, baked once; no moving grain or extra draw calls.
    const wash=c.createRadialGradient(880,670,180,1024,1024,1350);
    wash.addColorStop(0,'#145362');wash.addColorStop(.65,'#0b414d');wash.addColorStop(1,'#062e39');
    c.fillStyle=wash;c.fillRect(0,0,2048,2048);
    for(let i=0;i<7000;i++){c.fillStyle=random()>.5?'#72b7b304':'#001c2906';c.fillRect(random()*2048,random()*2048,3,1);}
  }else for(let i=0;i<48000;i++){c.fillStyle=random()>.5?'#ffffff05':'#0000000b';c.fillRect(random()*2048,random()*2048,random()*3+1,1);}
  c.translate(1024,1024);
  const gold=cartoon?'#d2a950':'#c6a360',fine=cartoon?'#997b40':'#8b754c',bright=cartoon?'#eac16a':'#e3c785';
  const circle=(r:number,color=gold,width=1.5)=>{c.strokeStyle=color;c.lineWidth=width*(cartoon?1.7:1);c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();};
  const star=(x:number,y:number,r:number)=>{
    c.save();c.translate(x,y);c.fillStyle=bright;c.beginPath();
    for(let i=0;i<8;i++){const a=i*Math.PI/4,s=i%2?r*.19:r;c.lineTo(Math.sin(a)*s,Math.cos(a)*s);}c.closePath();c.fill();c.restore();
  };
  const glyph=(path:string,x:number,y:number,size:number)=>{
    c.save();c.translate(x,y);c.scale(size/100,size/100);c.strokeStyle=gold;c.lineWidth=cartoon?6.5:5;c.lineCap='round';c.lineJoin='round';c.stroke(new Path2D(path));c.restore();
  };
  // Original vector glyphs stay crisp and identical across browser font families.
  const zodiac=[
    'M0 38V-7C0-55-51-52-37-17M0-7C0-55 51-52 37-17',
    'M-27-45Q-24-18 0-18Q24-18 27-45M0-18A27 27 0 1 1 -1-18',
    'M-34-38Q0-24 34-38M-34 38Q0 24 34 38M-17-32V32M17-32V32',
    'M35-24H-17A13 13 0 1 0 -17 2A13 13 0 1 0 -17-24M-35 24H17A13 13 0 1 0 17-2A13 13 0 1 0 17 24',
    'M-30 8A12 12 0 1 1 -30 32A12 12 0 1 1 -30 8M-22 10C-4 1-35-44-10-44C19-44 26-19 11 9C-5 38 20 49 34 25',
    'M-38 29V-25Q-27-43-16-25V26M-16-25Q-5-43 6-25V27M6-25Q17-43 28-25V19C28 43 8 38 9 16C10-5 42-5 41 15Q36 31 23 37',
    'M-38 34H38M-38 13H-17A22 22 0 1 1 17 13H38',
    'M-38 28V-25Q-27-42-16-25V28M-16-25Q-5-42 6-25V28M6-25Q17-42 28-25V13Q28 30 44 28M37 20L44 28L37 36',
    'M-32 32L32-32M8-32H32V-8M-29-9L9 29',
    'M-37-18L-26-35L-15-18V26M-15-18Q0-50 14-16V13C14 45 45 42 41 20C37-1 18 7 14 16',
    'M-40-14L-24-29L-8-14L8-29L24-14L40-29M-40 22L-24 7L-8 22L8 7L24 22L40 7',
    'M-25-40Q6 0-25 40M25-40Q-6 0 25 40M-35 0H35',
  ];
  [333,345,376,480,490,797,810,920,932,967].forEach((r,i)=>circle(r,i%3===0?gold:fine,i===7?2.2:1.3));
  for(let i=0;i<180;i++){
    c.save();c.rotate(i/180*Math.PI*2);c.strokeStyle=i%15===0?bright:fine;c.lineWidth=i%5===0?2:1;
    c.beginPath();c.moveTo(0,-938);c.lineTo(0,i%15===0?-961:i%5===0?-953:-945);c.stroke();c.restore();
  }
  for(let i=0;i<12;i++){
    const a=-Math.PI/2+i*Math.PI/6,x=Math.cos(a)*862,y=Math.sin(a)*862;
    c.save();c.translate(x,y);circle(cartoon?51:43,fine,1.2);if(!cartoon)circle(47,'#a98c52',.8);c.restore();glyph(zodiac[i],x,y,cartoon?78:61);
    // Spokes and star junctions connect the atlas to the central astrolabe.
    const junction=a+Math.PI/12;
    c.strokeStyle=fine;c.lineWidth=cartoon?2.2:1.2;c.beginPath();c.moveTo(Math.cos(junction)*815,Math.sin(junction)*815);c.lineTo(Math.cos(junction)*505,Math.sin(junction)*505);c.stroke();
    star(Math.cos(junction)*495,Math.sin(junction)*495,9);
    star(Math.cos(junction)*795,Math.sin(junction)*795,7);
  }
  // Recognizable constellation chains, leaving the center and outer symbol band quiet.
  const chains=[[[0,0],[22,-38],[64,-26],[83,9],[119,-12]],[[0,0],[28,24],[60,10],[89,43]],[[0,0],[19,-29],[48,-52],[82,-31],[69,9],[33,21],[0,0]]];
  for(let i=0;i<24;i++){
    const a=i*Math.PI/12+.08,r=565+(i%3)*76;
    c.save();c.rotate(a);c.translate(r,0);c.rotate(-a+.25*(i%4));
    const chain=chains[i%chains.length];c.strokeStyle=cartoon?'#bd965899':'#a88a536e';c.lineWidth=cartoon?2.1:1.2;c.beginPath();chain.forEach(([x,y],j)=>j?c.lineTo(x,y):c.moveTo(x,y));c.stroke();
    chain.forEach(([x,y],j)=>{c.fillStyle=gold;c.beginPath();c.arc(x,y,(j%2?2:3)*(cartoon?1.4:1),0,Math.PI*2);c.fill();if(j%3===0)star(x,y,cartoon?9:6);});c.restore();
  }
  for(let i=0;i<160;i++){
    const a=random()*Math.PI*2,r=520+random()*258;star(Math.cos(a)*r,Math.sin(a)*r,random()>.93?6:1.2);
  }
  const planets=[
    'M0-18A18 18 0 1 1 -1-18M0 18V45M-12 33H12',
    'M-9-14A22 22 0 1 1 -10-14M9-9L35-35M17-35H35V-17',
    'M0-16A16 16 0 1 1 -1-16M0-16V-30M-17-43Q0-21 17-43M0 16V40M-11 30H11',
    'M-23-25Q14-42 6-15L-20 10H22M12-35V36M1 25H24',
    'M-10-38V30M-23-23H3M-10 7Q26-17 22 11Q18 31 34 35',
    'M0-38V35M-13 22H13M-28-31V-15Q0 19 28-15V-31',
    'M0-24A24 24 0 1 1 -1-24M0-2A2 2 0 1 1 -1-2',
    'M13-27C-25-16-25 21 13 29C-5 13-5-12 13-27',
  ];
  planets.forEach((path,i)=>{const a=i*Math.PI/4-Math.PI/2;glyph(path,Math.cos(a)*438,Math.sin(a)*438,38);});
  // A compass rose beneath the standing total, with thin solar rays.
  circle(205,fine);circle(217,gold);circle(74,gold,2);circle(81,fine);
  for(let i=0;i<32;i++){
    c.save();c.rotate(i*Math.PI/16);c.strokeStyle=i%4===0?gold:fine;c.lineWidth=1.2;
    c.beginPath();c.moveTo(0,-88);c.lineTo(i%2?6:11,i%4===0?-267:-202);c.lineTo(0,-179);c.lineTo(i%2?-6:-11,i%4===0?-267:-202);c.closePath();c.stroke();c.restore();
  }
  // Moon phases on the near rim, separated into two arcs so the player's hand has room.
  const moonAngles=[.12,.16,.20,.24,.28,.32,.68,.72,.76,.80,.84,.88];
  moonAngles.forEach((a,i)=>{
    const x=Math.cos(a*Math.PI)*899,y=Math.sin(a*Math.PI)*899;
    c.save();c.translate(x,y);c.beginPath();c.arc(0,0,12,0,Math.PI*2);c.clip();
    const phase=i/11*Math.PI*2;c.fillStyle='#10243a';c.fillRect(-12,-12,24,24);c.fillStyle=gold;
    for(let py=-12;py<12;py++)for(let px=-12;px<12;px++){
      const nx=(px+.5)/12,ny=(py+.5)/12,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
      if(nx*nx+ny*ny<=1&&nx*Math.sin(phase)-nz*Math.cos(phase)>0)c.fillRect(px,py,1,1);
    }
    c.restore();c.strokeStyle=fine;c.lineWidth=.8;c.beginPath();c.arc(x,y,12,0,Math.PI*2);c.stroke();
  });
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=16;return texture;
}

/** Baked walnut grain keeps the physical rim inexpensive at every quality tier. */
function walnut(cartoon=false):THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const c=canvas.getContext('2d')!;c.fillStyle=cartoon?'#9c5e2d':'#754522';c.fillRect(0,0,512,512);
  for(let i=0;i<(cartoon?64:900);i++){
    c.strokeStyle=cartoon?(i%3===0?'#dc984c55':'#50290c55'):(i%3===0?'#e8a95a18':'#25120724');c.lineWidth=cartoon?(i%3===0?3:1.6):(i%5===0?1.4:.6);
    c.beginPath();
    for(let x=0;x<=512;x+=8){const y=i*(cartoon?8:.64)+Math.sin(x*.018+i*.22)*(cartoon?5:3)+Math.sin(x*.055+i)*.7;x?c.lineTo(x,y):c.moveTo(x,y);}
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
  private direction=0;
  private arrows:THREE.InstancedMesh;
  private arrowInk=new THREE.MeshBasicMaterial({color:0xa27a3e,side:THREE.DoubleSide});
  constructor(cartoon=false){
    // One draw call for a ring of chevrons, physically laid on the tabletop.
    const chevron=new THREE.Shape();
    chevron.moveTo(-.09,-.07);chevron.lineTo(.02,0);chevron.lineTo(-.09,.07);
    chevron.lineTo(-.025,.07);chevron.lineTo(.09,0);chevron.lineTo(-.025,-.07);chevron.closePath();
    const arrowGeometry=new THREE.ShapeGeometry(chevron);arrowGeometry.rotateX(-Math.PI/2);
    this.arrows=new THREE.InstancedMesh(arrowGeometry,this.arrowInk,32);
    this.arrows.name='turn-order-edge-arrows';this.group.add(this.arrows);this.setDirection(1);
    const metal=this.metal;
    if(cartoon){metal.color.set(0xc39645);metal.metalness=.18;metal.roughness=.75;}
    const wood=cartoon?new THREE.MeshBasicMaterial({map:walnut(true),color:0xffffff}):new THREE.MeshStandardMaterial({map:walnut(),color:0xf4bd83,metalness:.08,roughness:.3});
    const base=new THREE.Mesh(new THREE.CylinderGeometry(5.05,4.98,.36,128),cartoon?new THREE.MeshBasicMaterial({color:0x472914}):wood);base.position.y=.14;base.receiveShadow=true;this.group.add(base);
    const rail=new THREE.Mesh(new THREE.RingGeometry(4.72,5.05,128),wood);rail.rotation.x=-Math.PI/2;rail.position.y=.345;rail.receiveShadow=true;this.group.add(rail);
    const top=new THREE.Mesh(new THREE.CircleGeometry(4.74,128),new THREE.MeshStandardMaterial({map:engraving(cartoon),roughness:cartoon?1:.91,metalness:cartoon?0:.06}));
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
        diffuseColor.rgb=mix(diffuseColor.rgb,heated,uTableDanger*goldMask*.42);
        diffuseColor.rgb*=1.-lineMask*.32;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        float radius=length(vMapUv-vec2(.5))*2.;
        float waveRadius=1.03-uTableFlow*1.3;
        float wave=1.-smoothstep(.035,.16,abs(radius-waveRadius));
        float wake=smoothstep(0.,.06,radius-waveRadius)*(1.-smoothstep(.06,.32,radius-waveRadius));
        float flash=pow(max(0.,1.-uTableFlow*5.),2.);
        float angle=atan(vMapUv.y-.5,vMapUv.x-.5);
        float orbitHead=pow(max(0.,cos(angle-uTableFlow*7.85398)),28.);
        float orbitBand=1.-smoothstep(.006,.032,abs(radius-.79));
        float spokes=pow(max(0.,cos(angle*12.-uTableFlow*12.56637)),10.);
        vec3 flowColor=mix(vec3(1.,.58,.12),vec3(1.,.045,.008),uTableDanger);
        vec3 restingGold=mix(vec3(1.,.57,.16),vec3(1.,.23,.04),uTableDanger*.6);
        totalEmissiveRadiance+=restingGold*lineMask*.018;
        totalEmissiveRadiance+=flowColor*lineMask*uTableFlowStrength*(wave*(4.6+spokes*2.)+wake*.28+flash*.55+orbitHead*orbitBand*3.2);`);
      if(cartoon){
        // Keep the ink/felt palette instead of washing it out with a PBR hotspot.
        // Retain a little physical light and all gameplay light traveling through the atlas.
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
          outgoingLight=mix(diffuseColor.rgb*.9,outgoingLight,.14)+totalEmissiveRadiance*.86;
          #include <opaque_fragment>`);
      }
    };
    top.rotation.x=-Math.PI/2;top.position.y=.3475;top.receiveShadow=true;this.group.add(top);
    if(cartoon){
      const ink=new THREE.MeshBasicMaterial({color:0x17190f});
      this.group.add(ring(4.73,.022,ink,.349),ring(5.035,.023,ink,.346),ring(5.025,.022,ink,-.033));
    }
    for(const [r,w,y] of [[4.76,.012,.352],[5.015,.014,.335],[5.01,.011,.005]])this.group.add(ring(r,w,metal,y));
  }
  setDirection(direction:number):void {
    const sign=direction<0?-1:1;if(sign===this.direction)return;this.direction=sign;
    for(let index=0;index<32;index++){
      const angle=index*Math.PI*2/32;
      this.arrows.setMatrixAt(index,new THREE.Matrix4().compose(
        new THREE.Vector3(Math.sin(angle)*4.46,.3485,Math.cos(angle)*4.46),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle+(sign>0?Math.PI:0)),new THREE.Vector3(1,1,1)));
    }
    this.arrows.instanceMatrix.needsUpdate=true;this.arrows.computeBoundingSphere();
  }
  setTotal(total:number):void{
    const danger=totalDanger(total);this.danger.value=danger;this.arrowInk.color.set(0xa27a3e).lerp(HEAT_RED,danger);
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
    for(const [r,w] of [[1.34,.012],[1.48,.007],[1.63,.013]])this.group.add(inlaidRing(r,w,metal));
    this.group.add(inlaidRing(1.38,.007,this.light));
    for(let i=0;i<12;i++){
      const sector=new THREE.Mesh(new THREE.TorusGeometry(1.55,.012,5,12,Math.PI/9),this.light);sector.rotation.x=-Math.PI/2;sector.rotation.z=i*Math.PI/6;sector.scale.z=.04;sector.position.y=.3482;this.sectors.add(sector);
      const a=i/12*Math.PI*2;const marker=new THREE.Mesh(new THREE.ConeGeometry(.035,.12,3),metal);marker.rotation.set(-Math.PI/2,0,-a);marker.scale.z=.015;marker.position.set(Math.sin(a)*1.74,.3482,Math.cos(a)*1.74);this.orbit.add(marker);
    }
    this.group.add(this.orbit,this.sectors);
    this.pulse=new THREE.Mesh(new THREE.RingGeometry(1.2,1.24,96),new THREE.MeshBasicMaterial({color:0x97bdff,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));this.pulse.rotation.x=-Math.PI/2;this.pulse.position.y=.3486;this.group.add(this.pulse);
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
