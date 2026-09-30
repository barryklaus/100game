import * as THREE from 'three';
import type {QualityPreset} from './quality';

/** One reusable GPU burst, invisible and inactive between overflows. */
export class OverflowFireworks {
  readonly points:THREE.Points;
  private age=4;
  private material:THREE.ShaderMaterial;
  constructor(){
    const positions:number[]=[],velocities:number[]=[],colors:number[]=[],delays:number[]=[];
    const palette=[0xffc24c,0xff5038,0xffe6ac,0x55cfff,0xff71c9];
    for(let i=0;i<192;i++){
      const burst=i%4,a=i*2.399963,y=((i*37)%101)/50-1,r=Math.sqrt(1-y*y),speed=2.1+(i%7)*.24;
      positions.push(burst===0?0:Math.sin(burst*2.1)*1.5,1.1+(burst%2)*.7,Math.cos(burst*2.1)*.55-.65);
      velocities.push(Math.cos(a)*r*speed,y*speed+.9,Math.sin(a)*r*speed);
      const color=new THREE.Color(palette[i%palette.length]);colors.push(color.r,color.g,color.b);delays.push(burst*.16);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('velocity',new THREE.Float32BufferAttribute(velocities,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setAttribute('delay',new THREE.Float32BufferAttribute(delays,1));
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
      uniforms:{uTime:{value:4}},
      vertexShader:`attribute vec3 velocity;attribute vec3 color;attribute float delay;uniform float uTime;varying vec3 vColor;varying float vAlpha;
        void main(){float t=max(0.,uTime-delay);vColor=color;vAlpha=step(delay,uTime)*pow(max(0.,1.-t/2.3),1.5);
        vec3 p=position+velocity*t;p.y-=.9*t*t;vec4 view=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*view;gl_PointSize=clamp(190./max(1.,-view.z),4.,22.)*(.6+vAlpha*.4);}`,
      fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){vec2 p=gl_PointCoord-.5;float r=length(p);if(r>.5)discard;float core=pow(max(0.,1.-r*2.),2.);float star=max(0.,1.-min(abs(p.x),abs(p.y))*25.)*max(0.,1.-r*2.);gl_FragColor=vec4(vColor, max(core,star*.65)*vAlpha);}`});
    this.points=new THREE.Points(geometry,this.material);this.points.frustumCulled=false;this.points.visible=false;
  }
  configure(quality:QualityPreset):void{this.points.geometry.setDrawRange(0,quality==='ultra'?192:quality==='high'?144:quality==='medium'?96:64);}
  trigger(reduced:boolean):void{this.age=reduced?4:0;this.points.visible=!reduced;this.material.uniforms.uTime.value=this.age;}
  update(delta:number,reduced:boolean):void{if(!this.points.visible)return;this.age+=delta;this.points.visible=!reduced&&this.age<3;this.material.uniforms.uTime.value=this.age;}
}
