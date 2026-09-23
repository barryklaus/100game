import * as THREE from 'three';

/** Artwork always uses its original aspect ratio. No extra frame covers the face. */
export function createCardMesh(front: THREE.Texture, back: THREE.Texture, special = false, height = 1.43): THREE.Group {
  const image = front.image as { width: number; height: number };
  const width = height * (image.width / image.height);
  const radius = width * .06;
  const shape = new THREE.Shape();
  const x = -width / 2, y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const root = new THREE.Group();
  const edge = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .015, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .0025, bevelThickness: .0025, curveSegments: 8 }),
    new THREE.MeshStandardMaterial({color:0x807264,roughness:.66,metalness:.04}));
  edge.position.z = -.009;
  edge.castShadow = true;
  edge.receiveShadow = true;
  root.add(edge);
  const geometry = new THREE.ShapeGeometry(shape, 12);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getX(i) + width/2)/width, (position.getY(i) + height/2)/height);
  const material = new THREE.MeshPhysicalMaterial({map:front,color:0xbdbdbd,emissiveMap:front,emissive:0xffffff,emissiveIntensity:.22,envMapIntensity:.16,roughness:.8,metalness:0,clearcoat:.035,clearcoatRoughness:.65,alphaTest:.3});
  // Soft border-only diffraction. The printed illustration remains untouched.
  if (special) {
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        #ifdef USE_MAP
          vec2 cardUV = vMapUv;
          float edgeDistance = min(min(cardUV.x, 1.0-cardUV.x), min(cardUV.y, 1.0-cardUV.y));
          float border = 1.0 - smoothstep(.028, .069, edgeDistance);
          vec3 normalV = normalize(vNormal);
          vec3 viewV = normalize(vViewPosition);
          float angle = dot(normalV, viewV);
          float spectralPhase = dot(normalV.xy, vec2(3.6, -2.1)) + cardUV.x*1.4 + cardUV.y*.75;
          vec3 spectral = .5 + .5*cos(6.283185*(spectralPhase + vec3(0.,.33,.67)));
          float strength = border*(.045 + pow(1.0-abs(angle), 1.5)*.38);
          gl_FragColor.rgb += spectral*strength;
        #endif
      `);
    };
    material.customProgramCacheKey = () => '100-border-foil-v1';
  }
  const face = new THREE.Mesh(geometry, material);
  face.position.z = .01;
  face.castShadow = true;
  face.receiveShadow = true;
  root.add(face);
  const reverse = new THREE.Mesh(geometry.clone(), new THREE.MeshStandardMaterial({map:back,roughness:.77,metalness:.025,alphaTest:.3}));
  reverse.position.z = -.012;
  reverse.rotation.y = Math.PI;
  root.add(reverse);
  root.userData.cardHeight = height;
  root.userData.cardWidth = width;
  return root;
}

export function disposeCardMesh(root: THREE.Group): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material.dispose());
  });
}
