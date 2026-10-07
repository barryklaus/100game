import * as THREE from 'three';
import type { CardFace } from '../game/cardFace';
import { cardFrameImage } from './CardFrame';

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

function lines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const result: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { result.push(line); line = word; }
    else line = next;
  }
  if (line) result.push(line);
  return result;
}

/** Print fixed card information once. Moving artwork light is a separate mesh. */
export async function cardFaceTexture(source: THREE.Texture, face: CardFace): Promise<THREE.CanvasTexture> {
  const [, frame] = await Promise.all([loadFaceFont(), cardFrameImage(face.suit)]);
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
  const suitHighlight = { fire: '#e6280c', water: '#087cec', leaf: '#21b93c', sun: '#edad08' }[face.suit];
  border.addColorStop(0, face.theme === 'midnight' ? suitHighlight : '#fff6d9');
  border.addColorStop(.13, face.accent);
  border.addColorStop(.51, face.accent);
  border.addColorStop(.84, face.theme === 'midnight' ? suitHighlight : '#fff2d0');
  border.addColorStop(1, face.accent);
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  rounded(ctx, edge, edge, width - edge * 2, height - edge * 2, outerRadius * .56);
  ctx.clip();
  ctx.drawImage(image, edge, edge, width - edge * 2, height - edge * 2);
  ctx.restore();

  const titleBand = face.special ? height * .185 : 0;
  if (face.special) {
    const top = height - edge - titleBand;
    ctx.fillStyle = '#fff9e9';
    ctx.fillRect(edge, top, width - edge * 2, titleBand);
    ctx.fillStyle = face.accent;
    ctx.fillRect(edge, top, width - edge * 2, width * .014);
    const rightCell = width * .47;
    const center = (edge + width - edge - rightCell) / 2;
    const textWidth = width - edge * 2 - rightCell - width * .04;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleSize = width * .06, detailSize = width * .04;
    ctx.font = `${titleSize}px "${FONT}", system-ui, sans-serif`;
    const titleLines = lines(ctx, face.title!, textWidth);
    ctx.font = `700 ${detailSize}px system-ui, sans-serif`;
    const detailLines = lines(ctx, face.detail!, textWidth);
    const blockHeight = titleLines.length * titleSize + width * .01 + detailLines.length * detailSize * 1.15;
    let y = top + (titleBand - blockHeight) / 2;
    ctx.font = `${titleSize}px "${FONT}", system-ui, sans-serif`;
    ctx.fillStyle = '#211927';
    for (const line of titleLines) { ctx.fillText(line, center, y + titleSize / 2); y += titleSize; }
    y += width * .01;
    ctx.font = `700 ${detailSize}px system-ui, sans-serif`;
    ctx.fillStyle = '#322938';
    for (const line of detailLines) { ctx.fillText(line, center, y + detailSize * .575); y += detailSize * 1.15; }
  }

  const wordIndex = face.index.length > 3;
  const indexSize = width * (wordIndex ? face.index === 'ZERO' ? .14 : .095 : 1.5 * (face.index.length > 1 ? .205 : .249));
  index(ctx, face.index, width * .073, height * .052, indexSize);
  ctx.save();
  ctx.translate(width, height);
  ctx.rotate(Math.PI);
  index(ctx, face.index, width * .073, height * .052, indexSize * (face.special && !wordIndex ? .68 : 1), face.special);
  ctx.restore();

  ctx.drawImage(frame, 0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.cardFace = face;
  return texture;
}
