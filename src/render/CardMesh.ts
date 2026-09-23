import * as THREE from 'three';

/** Physical thickness at the standard 1.43-unit artwork height. */
export const CARD_THICKNESS = .006;
/** A second camera pass draws printed artwork after room post-processing. */
export const CLEAN_CARD_LAYER = 1;
const STANDARD_HEIGHT = 1.43;
const outlines = new WeakMap<THREE.Texture, THREE.Vector2[]>();
const preparedTextures = new WeakMap<THREE.Texture, THREE.Texture>();

/** Stop invisible white source pixels bleeding into the edge through mipmaps. */
export function prepareCardTexture(texture: THREE.Texture): THREE.Texture {
  const cached = preparedTextures.get(texture);
  if (cached) return cached;
  if (typeof document === 'undefined' || !texture.image) return texture;
  const { width, height } = artworkSize(texture);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return texture;
    context.drawImage(texture.image as CanvasImageSource, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    const count = width * height;
    const visited = new Uint8Array(count);
    const queue = new Int32Array(count);
    let head = 0, tail = 0;
    for (let i = 0; i < count; i++) if (data[i * 4 + 3] !== 0) visited[i] = 1;
    const extend = (target: number, source: number) => {
      if (visited[target]) return;
      const to = target * 4, from = source * 4;
      // Only completely invisible RGB changes. Artwork and alpha stay intact.
      data[to] = data[from]; data[to + 1] = data[from + 1]; data[to + 2] = data[from + 2];
      visited[target] = 1;
      queue[tail++] = target;
    };
    // Seed transparent pixels bordering artwork, then spread those edge colors
    // outward. The complete transparent margin must be valid at coarse mips too.
    for (let i = 0; i < count; i++) {
      if (data[i * 4 + 3] !== 0) continue;
      const x = i % width;
      if (x > 0 && data[(i - 1) * 4 + 3] !== 0) extend(i, i - 1);
      else if (x < width - 1 && data[(i + 1) * 4 + 3] !== 0) extend(i, i + 1);
      else if (i >= width && data[(i - width) * 4 + 3] !== 0) extend(i, i - width);
      else if (i < count - width && data[(i + width) * 4 + 3] !== 0) extend(i, i + width);
    }
    while (head < tail) {
      const i = queue[head++], x = i % width;
      if (x > 0) extend(i - 1, i);
      if (x < width - 1) extend(i + 1, i);
      if (i >= width) extend(i - width, i);
      if (i < count - width) extend(i + width, i);
    }
    // Canvas export would premultiply transparent RGB back to black. A raw
    // upload preserves the bleed colors without touching the supplied files.
    const prepared = new THREE.DataTexture(new Uint8Array(data.buffer), width, height, THREE.RGBAFormat);
    prepared.name = `${texture.name || 'card'}-edge-safe`;
    prepared.colorSpace = texture.colorSpace;
    prepared.minFilter = texture.minFilter;
    prepared.magFilter = texture.magFilter;
    prepared.anisotropy = texture.anisotropy;
    prepared.wrapS = texture.wrapS;
    prepared.wrapT = texture.wrapT;
    prepared.generateMipmaps = texture.generateMipmaps;
    prepared.flipY = true;
    prepared.needsUpdate = true;
    preparedTextures.set(texture, prepared);
    const disposePrepared = () => {
      prepared.dispose();
      preparedTextures.delete(texture);
      texture.removeEventListener('dispose', disposePrepared);
    };
    texture.addEventListener('dispose', disposePrepared);
    return prepared;
  } catch {
    // A non-image texture or unavailable pixel read can still render normally.
    return texture;
  }
}

function artworkSize(texture: THREE.Texture): { width: number; height: number } {
  const image = texture.image as { width?: number; height?: number } | undefined;
  return { width: image?.width || 511, height: image?.height || 711 };
}

/** Full artwork UVs, including its transparent pixels, without cropping or stretching. */
export function createCardSurfaceGeometry(texture: THREE.Texture, height = STANDARD_HEIGHT): THREE.PlaneGeometry {
  const image = artworkSize(texture);
  return new THREE.PlaneGeometry(height * image.width / image.height, height);
}

function artworkOutline(texture: THREE.Texture): THREE.Vector2[] {
  const cached = outlines.get(texture);
  if (cached) return cached;
  const { width, height } = artworkSize(texture);
  let points: THREE.Vector2[] = [];
  // Follow the actual opaque print boundary. The supplied files have transparent
  // margins and rounded corners which a solid rectangular backing must not fill.
  if (typeof document !== 'undefined' && texture.image) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        context.drawImage(texture.image as CanvasImageSource, 0, 0);
        const pixels = context.getImageData(0, 0, width, height).data;
        const left: THREE.Vector2[] = [], right: THREE.Vector2[] = [];
        for (let y = 0; y < height; y++) {
          let first = 0, last = width - 1;
          while (first < width && pixels[(y * width + first) * 4 + 3] < 128) first++;
          if (first === width) continue;
          while (last > first && pixels[(y * width + last) * 4 + 3] < 128) last--;
          // Half a pixel inside the printed edge keeps the dark paper edge from
          // creating a new outline around antialiased source artwork.
          left.push(new THREE.Vector2((first + .75) / width - .5, .5 - (y + .5) / height));
          right.push(new THREE.Vector2((last + .25) / width - .5, .5 - (y + .5) / height));
        }
        if (left.length > 1) {
          // Straight side runs need few vertices; retain corner changes exactly.
          const simplify = (side: THREE.Vector2[]) => side.filter((point, i) =>
            i === 0 || i === side.length - 1 || point.x !== side[i - 1].x || point.x !== side[i + 1].x);
          points = [...simplify(right), ...simplify(left).reverse()];
        }
      }
    } catch {
      // Texture loading and non-DOM callers can still create a safe inset edge.
    }
  }
  if (!points.length) {
    // Same-origin artwork is traced above. This conservative fallback sits well
    // inside the supplied 5px margins and approximately 30px rounded corners.
    const shape = new THREE.Shape();
    const x = -.48, y = -.485, w = .96, h = .97, r = .062;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    points = shape.getPoints(8);
  }
  outlines.set(texture, points);
  return points;
}

/** Sidewalls only: no solid cap behind the transparent artwork. */
function createPaperEdge(texture: THREE.Texture, height: number, thickness: number): THREE.BufferGeometry {
  const image = artworkSize(texture), width = height * image.width / image.height;
  const outline = artworkOutline(texture);
  const positions: number[] = [], indices: number[] = [];
  outline.forEach(point => {
    positions.push(point.x * width, point.y * height, -thickness / 2);
    positions.push(point.x * width, point.y * height, thickness / 2);
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

/** Artwork always uses its original aspect ratio. No added frame or foil overlay. */
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
    map: prepareCardTexture(front), color: 0xffffff, alphaTest: .5, toneMapped: false, fog: false,
  }));
  face.name = 'card-front';
  face.position.z = thickness / 2;
  face.castShadow = true;
  face.receiveShadow = false;
  root.add(face);

  const reverse = new THREE.Mesh(createCardSurfaceGeometry(back, height), new THREE.MeshBasicMaterial({
    map: prepareCardTexture(back), color: 0xffffff, alphaTest: .5, toneMapped: false, fog: false,
  }));
  reverse.name = 'card-back';
  reverse.position.z = -thickness / 2;
  reverse.rotation.y = Math.PI;
  reverse.castShadow = true;
  reverse.receiveShadow = false;
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
