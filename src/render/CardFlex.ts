import * as THREE from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';

/** Temporary tessellation only for a flying card; resting cards stay lightweight. */
export function flyingCardFlex(root:THREE.Group):(amount:number)=>void {
  const surfaces:{geometry:THREE.BufferGeometry;original:Float32Array}[]=[];
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const previous=object.geometry;
    object.geometry=new TessellateModifier(.22,3).modify(previous);
    previous.dispose();
    surfaces.push({geometry:object.geometry,original:new Float32Array(object.geometry.getAttribute('position').array)});
  });
  return amount=>{
    for(const {geometry,original} of surfaces){
      const position=geometry.getAttribute('position');
      for(let i=0;i<position.count;i++){
        const x=original[i*3],y=original[i*3+1],z=original[i*3+2];
        position.setXYZ(i,x,y,z+(y*y-.15)*amount);
      }
      position.needsUpdate=true;
    }
  };
}
