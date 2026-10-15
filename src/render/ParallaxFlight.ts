import * as THREE from 'three';
import { parallaxOffsets } from '../ui/ParallaxHand';

export type ParallaxFlight={pose:(x:number,y:number)=>void;progress:(value:number)=>void};
/** One front draw combines three layers; a throw smoothly settles into its flat pile print. */
export function installParallaxFlight(root:THREE.Group,print:THREE.Texture,background:HTMLImageElement,object:HTMLImageElement):ParallaxFlight {
  const bg=new THREE.Texture(background),fg=new THREE.Texture(object);
  for(const texture of [bg,fg]){texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;texture.anisotropy=8;}
  const face=root.getObjectByName('card-front') as THREE.Mesh;
  const previous=face.material as THREE.Material;
  const uniforms={uPrint:{value:print},uBackground:{value:bg},uObject:{value:fg},uBg:{value:new THREE.Vector2()},uFg:{value:new THREE.Vector2()},uAmount:{value:0},uTilt:{value:0},uMotion:{value:0},uInset:{value:new THREE.Vector2(54/1064,54/1064*(print.image.width/print.image.height))}};
  const material=new THREE.ShaderMaterial({toneMapped:false,fog:false,uniforms,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      varying vec2 vUv;
      uniform sampler2D uPrint,uBackground,uObject;
      uniform vec2 uBg,uFg,uInset;
      uniform float uAmount,uTilt,uMotion;
      float hash(vec2 p){vec3 h=fract(vec3(p.xyx)*.1031);h+=dot(h,h.yzx+33.33);return fract((h.x+h.y)*h.z);}
      void main(){
        vec2 art=(vUv-uInset)/(1.0-2.0*uInset);
        vec2 bgUv=(art-.5-uBg*uAmount)/1.06+.5;
        vec3 color=texture2D(uBackground,bgUv).rgb;
        vec2 grainUv=bgUv*vec2(230.0,321.0);
        float grain=hash(floor(grainUv));
        float facet=.5+.5*sin(grain*37.0+uTilt*19.0);
        float fleck=smoothstep(.86,.995,facet)*(1.0-smoothstep(1.0,2.4,max(fwidth(grainUv.x),fwidth(grainUv.y))));
        vec3 spectrum=.008+.992*pow(.5+.5*cos(6.283185*(grain*7.31+uTilt*.90+vec3(0.0,.333333,.666667))),vec3(1.6));
        spectrum=mix(spectrum,vec3(1.0),smoothstep(.985,.999,facet)*.9);
        color=mix(color,spectrum,sqrt(clamp(uMotion*1.8,0.0,1.0))*fleck*.92);
        vec2 objectUv=art-uFg*uAmount;
        vec4 item=texture2D(uObject,objectUv);
        if(any(lessThan(objectUv,vec2(0.0)))||any(greaterThan(objectUv,vec2(1.0))))item.a=0.0;
        color=mix(color,item.rgb,item.a);
        vec4 label=texture2D(uPrint,vUv);
        gl_FragColor=vec4(mix(color,label.rgb,label.a),1.0);
        #include <colorspace_fragment>
      }`});
  material.addEventListener('dispose',()=>{print.dispose();bg.dispose();fg.dispose();});
  face.material=material;previous.dispose();
  const foil=root.getObjectByName('card-artwork-foil') as THREE.Mesh|undefined;
  if(foil){foil.removeFromParent();foil.geometry.dispose();(foil.material as THREE.Material).dispose();}
  const normal=new THREE.Vector3(),last=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3();let painted=false;
  face.onBeforeRender=(_renderer,_scene,camera)=>{
    normal.set(0,0,1).transformDirection(face.matrixWorld);right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
    uniforms.uTilt.value=normal.dot(right)*.8+normal.dot(up)*.5;
    uniforms.uMotion.value=painted?Math.min(1,normal.distanceTo(last)*42):0;last.copy(normal);painted=true;
  };
  const controller={pose:(x:number,y:number)=>{const offsets=parallaxOffsets(x,y);uniforms.uBg.value.set(offsets.background.x,-offsets.background.y);uniforms.uFg.value.set(offsets.object.x,-offsets.object.y);uniforms.uAmount.value=1;},progress:(value:number)=>{uniforms.uAmount.value=(1-value)**2;}};
  root.userData.parallaxFlight=controller;
  return controller;
}
