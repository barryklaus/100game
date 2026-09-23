import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import fontData from './totalFont.json?raw';

/** Genuine bevelled serif typography, lit by the same lights as the vessel. */
export class ManifestedTotal {
  readonly group=new THREE.Group();
  private font=new FontLoader().parse(JSON.parse(fontData));
  private faces=new THREE.MeshStandardMaterial({color:0xffe5a0,emissive:0xf9b74e,emissiveIntensity:.06,roughness:.48,metalness:.18});
  private sides=new THREE.MeshStandardMaterial({color:0x8e5123,roughness:.36,metalness:.62});
  private geometry?:TextGeometry;
  private mesh?:THREE.Mesh;
  private total=-1;
  private pulse=0;
  constructor(){ this.set(0); }
  set(total:number):void{
    if(total===this.total)return;
    this.pulse=this.total<0?0:1;this.total=total;
    if(this.mesh)this.group.remove(this.mesh);
    this.geometry?.dispose();
    this.geometry=new TextGeometry(String(total),{font:this.font,size:1.1,depth:.1,curveSegments:7,bevelEnabled:true,bevelThickness:.019,bevelSize:.012,bevelSegments:3});
    this.geometry.computeBoundingBox();const bounds=this.geometry.boundingBox!;
    this.geometry.translate(-(bounds.max.x+bounds.min.x)/2,-bounds.min.y,0);
    this.mesh=new THREE.Mesh(this.geometry,[this.faces,this.sides]);this.mesh.castShadow=true;
    this.group.add(this.mesh);
  }
  update(time:number,delta:number,camera:THREE.Camera,reduced:boolean):void{
    this.pulse=Math.max(0,this.pulse-delta*2.8);
    this.group.position.set(0,2.15+(reduced?0:Math.sin(time*1.2)*.026),.22);
    this.group.quaternion.copy(camera.quaternion);
    const scale=1.35+(reduced?0:Math.sin(this.pulse*Math.PI)*.07);
    this.group.scale.setScalar(scale);
    this.faces.emissiveIntensity=.06+this.pulse*.09;
    this.faces.color.set(this.total>100?0xffb49e:this.total>89?0xffda87:0xffefb7);
  }
  dispose():void{this.geometry?.dispose();this.faces.dispose();this.sides.dispose();}
}
