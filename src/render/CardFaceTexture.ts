import * as THREE from 'three';
import type { CardFace } from '../game/cardFace';

const FONT = 'Luckiest Guy';
const EDGE = 54; // Roughly five percent of the card width: B's frame, made thicker.

let fontPromise: Promise<void> | undefined;
function loadFaceFont(): Promise<void> {
  fontPromise ??= document.fonts.load(`96px "${FONT}"`).then(() => undefined).catch(() => undefined);
  return fontPromise;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function index(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, dark = false): void {
  ctx.save();
  ctx.font = `${size}px "${FONT}", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * .105;
  ctx.strokeStyle = dark ? '#fff8e5' : '#191525';
  ctx.fillStyle = dark ? '#211927' : '#fffdf4';
  ctx.shadowColor = '#130d18bb';
  ctx.shadowBlur = dark ? 0 : 9;
  ctx.shadowOffsetY = dark ? 0 : 5;
  ctx.strokeText(value, x, y);
  ctx.fillText(value, x, y);
  ctx.restore();
}

/** Print fixed card information once. Moving light is a separate border-only mesh. */
export async function cardFaceTexture(source: THREE.Texture, face: CardFace): Promise<THREE.CanvasTexture> {
  await loadFaceFont();
  const image = source.image as CanvasImageSource & { width: number; height: number };
  const width = image.width || 1064, height = image.height || 1478;
  const edge = width * EDGE / 1064;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const outerRadius = width * .055;
  rounded(ctx, 0, 0, width, height, outerRadius);
  ctx.clip();

  const border = ctx.createLinearGradient(0, 0, width, height);
  border.addColorStop(0, '#fff6d9');
  border.addColorStop(.13, face.accent);
  border.addColorStop(.51, face.accent);
  border.addColorStop(.84, '#fff2d0');
  border.addColorStop(1, face.accent);
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  rounded(ctx, edge, edge, width - edge * 2, height - edge * 2, outerRadius * .56);
  ctx.clip();
  ctx.drawImage(image, edge, edge, width - edge * 2, height - edge * 2);
  ctx.restore();

  const titleBand = face.special ? height * .162 : 0;
  if (face.special) {
    const top = height - edge - titleBand;
    ctx.fillStyle = '#fff9e9';
    ctx.fillRect(edge, top, width - edge * 2, titleBand);
    ctx.fillStyle = face.accent;
    ctx.fillRect(edge, top, width - edge * 2, width * .014);
    const rightCell = width * .205;
    const center = (edge + width - edge - rightCell) / 2;
    let size = width * (face.title!.length > 10 ? .069 : .091);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    do { ctx.font = `${size}px "${FONT}", system-ui, sans-serif`; size -= 2; }
    while (ctx.measureText(face.title!).width > width - edge * 2 - rightCell - width * .06 && size > 30);
    ctx.fillStyle = '#211927';
    ctx.fillText(face.title!, center, top + titleBand * .43);
    ctx.font = `700 ${width * .038}px system-ui, sans-serif`;
    ctx.fillStyle = '#5a4c55';
    ctx.fillText(face.detail!, center, top + titleBand * .75);
  }

  const indexSize = width * (face.index.length > 1 ? .205 : .249);
  index(ctx, face.index, width * .073, height * .052, indexSize);
  ctx.save();
  ctx.translate(width, height);
  ctx.rotate(Math.PI);
  index(ctx, face.index, width * .073, height * .052, indexSize * .68, face.special);
  ctx.restore();

  // A quiet hairline lends definition without widening the printed border.
  rounded(ctx, edge * .5, edge * .5, width - edge, height - edge, outerRadius * .78);
  ctx.strokeStyle = '#fff9e9a8';
  ctx.lineWidth = width * .004;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.cardFace = face;
  return texture;
}
