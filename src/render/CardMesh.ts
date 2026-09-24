import * as THREE from 'three';
import type { Suit } from '../data/config';

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
const foilSuitIndex: Record<Suit, number> = { fire: 0, water: 1, leaf: 2, sun: 3 };

function cardFoilMaterial(special: boolean, suit: Suit): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: special ? 'prismatic-special-border' : 'metallic-card-border',
    transparent: false,
    depthWrite: true,
    toneMapped: false,
    uniforms: { uTilt: { value: 0 }, uMotion: { value: 0 }, uSpecial: { value: special ? 1 : 0 }, uSuit: { value: foilSuitIndex[suit] } },
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
      uniform float uSuit;
      float motif(vec2 uv) {
        vec2 p = fract(uv * vec2(16.0, 22.0)) - 0.5;
        if (uSuit < 0.5) { // Repeating little flame tongues.
          float flame = abs(p.x + 0.16 * sin(p.y * 10.0)) + p.y * 0.27;
          return (1.0 - smoothstep(0.12, 0.18, flame)) * smoothstep(-0.43, -0.12, p.y);
        }
        if (uSuit < 1.5) { // Droplets with a fine ripple beneath them.
          float drop = length(vec2(p.x * 1.15, p.y * 0.85 + 0.07));
          float ripple = abs(length(vec2(p.x, p.y + 0.30)) - 0.24);
          return 1.0 - min(1.0, smoothstep(0.13, 0.18, drop) * smoothstep(0.025, 0.055, ripple));
        }
        if (uSuit < 2.5) { // Tiny diagonal leaves with an etched vein.
          vec2 leaf = vec2(p.x + p.y * 0.48, p.y - p.x * 0.48);
          float blade = abs(leaf.x) + 0.65 * abs(leaf.y);
          float shape = 1.0 - smoothstep(0.15, 0.20, blade);
          float vein = 1.0 - smoothstep(0.012, 0.035, abs(leaf.x));
          return shape * (0.65 + 0.35 * vein);
        }
        // Eight pointed sunbursts.
        float rays = min(min(abs(p.x), abs(p.y)), min(abs(p.x + p.y), abs(p.x - p.y)) * 0.71);
        return (1.0 - smoothstep(0.018, 0.045, rays)) * (1.0 - smoothstep(0.18, 0.32, length(p)));
      }
      void main() {
        vec3 darkMetal = vec3(0.17, 0.035, 0.027);
        vec3 colorMetal = vec3(0.78, 0.15, 0.045);
        vec3 brightMetal = vec3(1.0, 0.65, 0.21);
        if (uSuit > 0.5 && uSuit < 1.5) {
          darkMetal = vec3(0.025, 0.10, 0.20);
          colorMetal = vec3(0.025, 0.42, 0.82);
          brightMetal = vec3(0.36, 0.90, 1.0);
        } else if (uSuit > 1.5 && uSuit < 2.5) {
          darkMetal = vec3(0.035, 0.14, 0.065);
          colorMetal = vec3(0.11, 0.53, 0.16);
          brightMetal = vec3(0.60, 0.95, 0.31);
        } else if (uSuit > 2.5) {
          darkMetal = vec3(0.20, 0.10, 0.015);
          colorMetal = vec3(0.77, 0.39, 0.035);
          brightMetal = vec3(1.0, 0.85, 0.39);
        }
        // A fixed tilt changes the reflection; no clock or idle animation is used.
        float phase = vUv.x * 1.0 + vUv.y * 0.61 + uTilt * 0.68;
        float band = 0.5 + 0.5 * cos(phase * 18.0);
        float groove = 0.5 + 0.5 * sin(phase * 48.0);
        vec3 foil = mix(darkMetal, colorMetal, 0.42 + 0.42 * band);
        foil = mix(foil, brightMetal, pow(band, mix(7.0, 4.0, uSpecial)) * (0.37 + 0.26 * uSpecial));
        foil *= 0.84 + 0.16 * groove;
        float etching = motif(vUv);
        foil = mix(foil, brightMetal, etching * (0.13 + uMotion * (0.35 + 0.16 * uSpecial)));
        float sweep = pow(max(0.0, sin(phase * 22.0)), 30.0);
        float glitter = etching * pow(max(0.0, sin(vUv.x * 171.0 + vUv.y * 233.0 + uTilt * 8.0)), 12.0);
        foil = mix(foil, brightMetal, min(1.0, uMotion * (sweep * 0.58 + glitter * (0.65 + 0.25 * uSpecial))));
        gl_FragColor = vec4(foil, 1.0);
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
  const faceInfo = front.userData?.cardFace as { special?: boolean; suit?: Suit } | undefined;
  const isSpecial = Boolean(faceInfo?.special ?? special);
  const foil = new THREE.Mesh(createCardFoilGeometry(front, height), cardFoilMaterial(isSpecial, faceInfo?.suit ?? 'sun'));
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
