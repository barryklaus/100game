import * as THREE from 'three';

/** Physical thickness at the standard 1.43-unit artwork height. */
export const CARD_THICKNESS = .006;
/** Ultra's second camera pass keeps printed artwork free of room post-processing. */
export const CLEAN_CARD_LAYER = 1;
const STANDARD_HEIGHT = 1.43;
const CORNER_RADIUS = .055;
const BORDER_WIDTH = .052;

function artworkSize(texture: THREE.Texture): { width: number; height: number } {
  const image = texture.image as { width?: number; height?: number } | undefined;
  return { width: image?.width || 1064, height: image?.height || 1478 };
}

/** The artwork itself fills this traditional playing-card silhouette. */
function roundedCardShape(width: number, height: number): THREE.Shape {
  const halfWidth = width / 2, halfHeight = height / 2;
  const radius = width * CORNER_RADIUS;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.absarc(halfWidth - radius, -halfHeight + radius, radius, -Math.PI / 2, 0, false);
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.absarc(halfWidth - radius, halfHeight - radius, radius, 0, Math.PI / 2, false);
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.absarc(-halfWidth + radius, halfHeight - radius, radius, Math.PI / 2, Math.PI, false);
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.absarc(-halfWidth + radius, -halfHeight + radius, radius, Math.PI, Math.PI * 1.5, false);
  return shape;
}

export function roundedCardOutline(width: number, height: number): THREE.Vector2[] {
  const outline = roundedCardShape(width, height).getPoints(16);
  if (outline[0].equals(outline[outline.length - 1])) outline.pop();
  return outline;
}

/** Shape geometry clips square source art without a shader cutoff or extra frame. */
export function createCardSurfaceGeometry(texture: THREE.Texture, height = STANDARD_HEIGHT): THREE.ShapeGeometry {
  const image = artworkSize(texture);
  const width = height * image.width / image.height;
  const geometry = new THREE.ShapeGeometry(roundedCardShape(width, height), 16);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < positions.count; index++) {
    uv.setXY(index, positions.getX(index) / width + .5, positions.getY(index) / height + .5);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** A real, rounded ring: the shader never covers the illustrated center. */
export function createCardFoilGeometry(texture: THREE.Texture, height = STANDARD_HEIGHT): THREE.ShapeGeometry {
  const image = artworkSize(texture);
  const width = height * image.width / image.height;
  const inset = width * BORDER_WIDTH;
  const shape = roundedCardShape(width, height);
  const inner = roundedCardShape(width - inset * 2, height - inset * 2).getPoints(16).reverse();
  const hole = new THREE.Path();
  inner.forEach((point, index) => index ? hole.lineTo(point.x, point.y) : hole.moveTo(point.x, point.y));
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(shape, 16);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < positions.count; index++)
    uv.setXY(index, positions.getX(index) / width + .5, positions.getY(index) / height + .5);
  uv.needsUpdate = true;
  return geometry;
}

const foilNormal = new THREE.Vector3();
const foilPosition = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const cameraUp = new THREE.Vector3();
function cardFoilMaterial(special: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: special ? 'prismatic-special-border' : 'metallic-card-border',
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: { uTilt: { value: 0 }, uMotion: { value: 0 }, uSpecial: { value: special ? 1 : 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTilt;
      uniform float uMotion;
      uniform float uSpecial;
      void main() {
        // Pearl and spectral color are fixed on a resting card. Only its real
        // position or orientation change brings out the sharp moving glint.
        float phase = vUv.x * 0.83 + vUv.y * 0.49 + uTilt * 0.68;
        float grain = 0.5 + 0.5 * sin(vUv.x * 231.0 + vUv.y * 173.0);
        float threads = 0.5 + 0.5 * sin((vUv.x + vUv.y * 0.66) * 85.0);
        vec3 rainbow = 0.56 + 0.44 * cos(6.2831853 * (phase * 2.3 + vec3(0.0, 0.33, 0.67)));
        vec3 pearl = vec3(0.95, 0.91, 0.82);
        vec3 specialFoil = mix(pearl, rainbow, 0.72 + 0.10 * threads);
        vec3 normalFoil = mix(vec3(0.53, 0.34, 0.13), vec3(1.0, 0.91, 0.64), 0.35 + 0.35 * threads);
        float stripe = pow(max(0.0, sin((phase + uTilt * 0.22) * 19.0)), 24.0);
        float sparkle = pow(max(0.0, sin(vUv.x * 133.0 + vUv.y * 193.0 + uTilt * 7.0)), 48.0);
        float glint = uMotion * (stripe * 0.84 + sparkle * 0.16);
        vec3 foil = mix(normalFoil, specialFoil, uSpecial);
        foil = mix(foil, vec3(1.0, 0.98, 0.91), glint);
        float opacity = mix(0.48, 0.84, uSpecial) + grain * 0.035 + glint * 0.12;
        gl_FragColor = vec4(foil, min(opacity, 1.0));
        #include <colorspace_fragment>
      }
    `,
  });
}

/** A thin paper side follows exactly the same rounded perimeter. */
function createPaperEdge(texture: THREE.Texture, height: number, thickness: number): THREE.BufferGeometry {
  const image = artworkSize(texture), width = height * image.width / image.height;
  const outline = roundedCardOutline(width, height);
  const positions: number[] = [], indices: number[] = [];
  outline.forEach(point => {
    positions.push(point.x, point.y, -thickness / 2);
    positions.push(point.x, point.y, thickness / 2);
  });
  outline.forEach((_, index) => {
    const a = index * 2, b = ((index + 1) % outline.length) * 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Full-resolution printed face with a separate border-only light pass. */
export function createCardMesh(front: THREE.Texture, back: THREE.Texture, special = false, height = STANDARD_HEIGHT): THREE.Group {
  const image = artworkSize(front);
  const width = height * image.width / image.height;
  const thickness = CARD_THICKNESS * (height / STANDARD_HEIGHT);
  const root = new THREE.Group();
  const edge = new THREE.Mesh(createPaperEdge(front, height, thickness),
    new THREE.MeshBasicMaterial({ color: 0x30231e, side: THREE.DoubleSide, toneMapped: false, fog: false }));
  edge.name = 'card-paper-edge';
  edge.castShadow = true;
  edge.receiveShadow = true;
  root.add(edge);

  const face = new THREE.Mesh(createCardSurfaceGeometry(front, height), new THREE.MeshBasicMaterial({
    map: front, color: 0xffffff, toneMapped: false, fog: false,
  }));
  face.name = 'card-front';
  face.position.z = thickness / 2;
  face.castShadow = true;
  root.add(face);

  const reverse = new THREE.Mesh(createCardSurfaceGeometry(back, height), new THREE.MeshBasicMaterial({
    map: back, color: 0xffffff, toneMapped: false, fog: false,
  }));
  reverse.name = 'card-back';
  reverse.position.z = -thickness / 2;
  reverse.rotation.y = Math.PI;
  reverse.castShadow = true;
  root.add(reverse);
  const isSpecial = Boolean((front.userData?.cardFace as { special?: boolean } | undefined)?.special ?? special);
  const foil = new THREE.Mesh(createCardFoilGeometry(front, height), cardFoilMaterial(isSpecial));
  foil.name = 'card-border-foil';
  foil.position.z = thickness / 2 + .00035;
  let hasFoilPose = false;
  const lastNormal = new THREE.Vector3();
  const lastPosition = new THREE.Vector3();
  foil.onBeforeRender = (_renderer, _scene, camera, _geometry, material) => {
    const shader = material as THREE.ShaderMaterial;
    foilNormal.set(0, 0, 1).transformDirection(foil.matrixWorld);
    foilPosition.setFromMatrixPosition(foil.matrixWorld);
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
    shader.uniforms.uTilt.value = foilNormal.dot(cameraRight) * .8 + foilNormal.dot(cameraUp) * .5;
    const motion = hasFoilPose ? Math.min(1, foilPosition.distanceTo(lastPosition) * 10 + foilNormal.distanceTo(lastNormal) * 5) : 0;
    shader.uniforms.uMotion.value = document.documentElement.classList.contains('reduce-motion') ? 0 : motion;
    lastPosition.copy(foilPosition); lastNormal.copy(foilNormal); hasFoilPose = true;
  };
  foil.userData.cardFoil = true;
  root.add(foil);
  root.children.forEach(surface => {
    surface.userData.cleanCard = true;
    surface.layers.enable(CLEAN_CARD_LAYER);
  });
  root.userData.cardHeight = height;
  root.userData.cardWidth = width;
  root.userData.cardThickness = thickness;
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
