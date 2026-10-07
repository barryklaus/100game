import type { Suit } from '../data/config';

const motifs: Record<Suit, string> = {
  fire: '<path d="M0-11C8-2 3 0 8 4C11 12-11 14-8 3L-4-3L-3 4C2 2-2-4 0-11Z"/>',
  water: '<path d="M0-11C3-5 8 0 8 4A8 8 0 0 1-8 4C-8 0-3-5 0-11Z"/><path d="M-4 5Q-3 9 1 9"/>',
  leaf: '<path d="M-8 9C-12-5 1-9 10-10C10 2 6 13-8 9ZM-7 8L7-7M-2 3L-4-3M3-2L8 0"/>',
  sun: '<circle r="4"/><path d="M0-11V-7M0 7V11M-11 0H-7M7 0H11M-8-8L-5-5M5 5L8 8M8-8L5-5M-5 5L-8 8"/>',
};
const urls = new Map<Suit, string>();
const images = new Map<Suit, Promise<HTMLImageElement>>();

/** One static ornament shared by the DOM and printed 3D card textures.
 * Everything stays within the existing frame, leaving the artwork untouched. */
export function cardFrameUrl(suit: Suit): string {
  let url = urls.get(suit);
  if (url) return url;
  const stamps: string[] = [];
  for (let y = 154; y <= 1324; y += 130) {
    for (const x of [27, 1037]) stamps.push(`<g transform="translate(${x} ${y})">${motifs[suit]}</g>`);
  }
  for (const y of [27, 1451]) {
    for (let x = 142; x <= 922; x += 130) stamps.push(`<g transform="translate(${x} ${y})">${motifs[suit]}</g>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1064" height="1478" viewBox="0 0 1064 1478" fill="none">
    <rect x="12" y="12" width="1040" height="1454" rx="47" stroke="#171329" stroke-opacity=".82" stroke-width="5"/>
    <rect x="43" y="43" width="978" height="1392" rx="22" stroke="#171329" stroke-opacity=".8" stroke-width="5"/>
    <rect x="46" y="46" width="972" height="1386" rx="20" stroke="#ffda83" stroke-opacity=".65" stroke-width="2"/>
    <g stroke="#fff0aa" stroke-opacity=".75" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${stamps.join('')}</g>
    <g fill="#ffe09a" stroke="#171329" stroke-width="2"><path d="M27 15L38 27L27 39L16 27Z M1037 15L1048 27L1037 39L1026 27Z M27 1439L38 1451L27 1463L16 1451Z M1037 1439L1048 1451L1037 1463L1026 1451Z"/></g>
  </svg>`;
  url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  urls.set(suit, url);
  return url;
}

export function cardFrameImage(suit: Suit): Promise<HTMLImageElement> {
  let image = images.get(suit);
  if (!image) {
    const element = new Image();
    element.src = cardFrameUrl(suit);
    image = element.decode().then(() => element);
    images.set(suit, image);
  }
  return image;
}
