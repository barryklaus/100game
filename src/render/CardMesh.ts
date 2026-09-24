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
        // Deep spectral metal is visible at rest. The narrow silver flash is
        // driven by actual card motion, never by elapsed time.
        float phase = vUv.x * 0.91 + vUv.y * 0.56 + uTilt * 0.76;
        vec3 spectrum = 0.5 + 0.5 * cos(6.2831853 * (phase * 2.45 + vec3(0.0, 0.34, 0.68)));
        spectrum = pow(spectrum, vec3(1.38)) * 1.34;
        float grooves = 0.5 + 0.5 * sin(phase * 45.0);
        float metal = smoothstep(0.13, 0.88, grooves);
        float fine = 0.5 + 0.5 * sin(vUv.x * 258.0 + vUv.y * 179.0);
        vec3 shadowMetal = mix(vec3(0.035, 0.055, 0.12), vec3(0.16, 0.07, 0.15), uSpecial);
        float colorWeight = mix(0.76, 0.93, uSpecial) * (0.38 + 0.62 * metal);
        vec3 foil = mix(shadowMetal, spectrum, colorWeight);
        foil *= 0.88 + 0.12 * fine;
        float streak = pow(max(0.0, sin((phase + uTilt * 0.16) * 20.0)), 25.0);
        float sparks = pow(max(0.0, sin(vUv.x * 149.0 + vUv.y * 211.0 + uTilt * 8.0)), 55.0);
        float glint = uMotion * (streak * 0.88 + sparks * 0.24);
        foil = mix(foil, vec3(1.0, 0.96, 0.84), min(1.0, glint * mix(0.9, 1.25, uSpecial)));
        gl_FragColor = vec4(foil, mix(0.94, 0.99, uSpecial));
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
    const motion = hasFoilPose ? Math.min(1, foilPosition.distanceTo(lastPosition) * 28 + foilNormal.distanceTo(lastNormal) * 14) : 0;
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
