import * as THREE from 'three';

/** Physical thickness at the standard 1.43-unit artwork height. */
export const CARD_THICKNESS = .006;
/** Ultra's second camera pass keeps printed artwork free of room post-processing. */
export const CLEAN_CARD_LAYER = 1;
const STANDARD_HEIGHT = 1.43;
const CORNER_RADIUS = .055;

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

/** Full-resolution artwork with no added border, foil, tint, or hard alpha cutoff. */
export function createCardMesh(front: THREE.Texture, back: THREE.Texture, _special = false, height = STANDARD_HEIGHT): THREE.Group {
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
