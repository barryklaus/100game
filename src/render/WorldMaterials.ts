import * as THREE from 'three';

function canvasTexture(paint: (ctx: CanvasRenderingContext2D, size: number) => void, size = 512): THREE.CanvasTexture {
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=size;
  paint(canvas.getContext('2d')!,size);
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping; texture.anisotropy=4;
  return texture;
}
let seed=71;
const random=():number => {seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
export function makeWorldMaterials(): {wood:THREE.MeshPhysicalMaterial;cloth:THREE.MeshStandardMaterial;brass:THREE.MeshStandardMaterial;stone:THREE.MeshStandardMaterial} {
  const grain=canvasTexture((ctx,size)=>{
    ctx.fillStyle='#815030';ctx.fillRect(0,0,size,size);
    for(let i=0;i<1250;i++){
      const y=random()*size;ctx.strokeStyle=`rgba(${random()>.6?'236,176,99':'31,13,8'},${.025+random()*.13})`;ctx.lineWidth=.2+random()*2.2;
      ctx.beginPath();ctx.moveTo(-20,y);for(let x=0;x<=size+20;x+=16)ctx.lineTo(x,y+Math.sin(x*.019+y*.052)*3+Math.sin(x*.006+y)*7);ctx.stroke();
    }
    for(let i=0;i<90;i++){ctx.strokeStyle='rgba(255,222,172,.1)';ctx.lineWidth=.5;const x=random()*size,y=random()*size;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*35,y+2);ctx.stroke();}
  });
  const fabric=canvasTexture((ctx,size)=>{
    ctx.fillStyle='#4b4058';ctx.fillRect(0,0,size,size);
    for(let y=0;y<size;y+=3)for(let x=0;x<size;x+=3){const n=45+random()*45;ctx.fillStyle=`rgba(${n+20},${n},${n+27},.3)`;ctx.fillRect(x,y,(y%2)?2:1,2);}
    ctx.strokeStyle='#b79a5c33';ctx.lineWidth=2;ctx.beginPath();ctx.arc(size/2,size/2,size*.45,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<32;i++){const a=i/32*Math.PI*2;const x=size/2+Math.cos(a)*size*.432,y=size/2+Math.sin(a)*size*.432;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.beginPath();ctx.moveTo(-3,0);ctx.lineTo(0,-5);ctx.lineTo(3,0);ctx.lineTo(0,5);ctx.closePath();ctx.stroke();ctx.restore();}
  });
  const metal=canvasTexture((ctx,size)=>{ctx.fillStyle='#bfa26e';ctx.fillRect(0,0,size,size);for(let i=0;i<1400;i++){const x=random()*size,y=random()*size;ctx.fillStyle=random()>.5?'#53391c22':'#fff2b519';ctx.fillRect(x,y,random()*45,.6);}});
  const stoneTexture=canvasTexture((ctx,size)=>{ctx.fillStyle='#736a72';ctx.fillRect(0,0,size,size);for(let i=0;i<9000;i++){ctx.fillStyle=random()>.5?'#fff7e808':'#211c2818';ctx.fillRect(random()*size,random()*size,random()*8,random()*5);}});
  return {
    wood:new THREE.MeshPhysicalMaterial({map:grain,color:0xc09067,roughness:.48,metalness:.025,clearcoat:.22,clearcoatRoughness:.42,bumpMap:grain,bumpScale:.024}),
    cloth:new THREE.MeshStandardMaterial({map:fabric,color:0x7c6b92,roughness:.97,metalness:0,bumpMap:fabric,bumpScale:.017}),
    brass:new THREE.MeshStandardMaterial({map:metal,color:0xe6bd78,roughness:.37,metalness:.78,bumpMap:metal,bumpScale:.008}),
    stone:new THREE.MeshStandardMaterial({map:stoneTexture,color:0x847585,roughness:.96,bumpMap:stoneTexture,bumpScale:.032}),
  };
}

export function glowTexture():THREE.CanvasTexture {
  return canvasTexture((ctx,size)=>{const g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);g.addColorStop(0,'rgba(255,241,186,1)');g.addColorStop(.13,'rgba(255,205,99,.7)');g.addColorStop(.45,'rgba(255,169,56,.13)');g.addColorStop(1,'rgba(255,150,20,0)');ctx.fillStyle=g;ctx.fillRect(0,0,size,size);},64);
}
