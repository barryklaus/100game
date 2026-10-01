import * as THREE from 'three';

/** Keep the full tabletop transform at the handoff, including its oval foreshortening. */
export class CardFlightFit {
  private start = new THREE.Matrix4();
  private end = new THREE.Matrix4();
  private blended = new THREE.Matrix4();

  constructor(from: {position:THREE.Vector3;quaternion:THREE.Quaternion;scale:number;matrix?:THREE.Matrix4},
    to: {position:THREE.Vector3;quaternion:THREE.Quaternion;scale:number;matrix?:THREE.Matrix4}) {
    for (const [pose, correction] of [[from,this.start],[to,this.end]] as const) {
      if (!pose.matrix) continue;
      correction.compose(pose.position,pose.quaternion,new THREE.Vector3().setScalar(pose.scale));
      correction.invert().multiply(pose.matrix);
    }
  }

  apply(root:THREE.Group, progress:number):void {
    const a=this.start.elements,b=this.end.elements,out=this.blended.elements;
    for(let i=0;i<16;i++)out[i]=THREE.MathUtils.lerp(a[i],b[i],progress);
    root.updateMatrix();
    root.matrix.multiply(this.blended);
    root.matrixWorldNeedsUpdate=true;
  }
}
