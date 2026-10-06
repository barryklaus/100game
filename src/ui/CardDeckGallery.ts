import { Texture } from 'three';
import { SUITS, type Suit } from '../data/config';
import { cardFaceFromUrl } from '../game/cardFace';
import { cardFaceTexture } from '../render/CardFaceTexture';
import { midnightCardPath } from '../game/midnightDeck';

const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'K'] as const;
const base = new URL('../', location.href);
const grid = document.querySelector<HTMLElement>('#deck')!;
const suitFilter = document.querySelector<HTMLSelectElement>('#suit-filter')!;
const actionFilter = document.querySelector<HTMLInputElement>('#actions-only')!;
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    observer.unobserve(entry.target);
    void print(entry.target as HTMLImageElement);
  }
}, { rootMargin: '250px' });

async function print(target: HTMLImageElement): Promise<void> {
  try {
    const image = new Image();
    image.src = target.dataset.art!;
    await image.decode();
    const source = new Texture(image);
    const face = cardFaceFromUrl(image.src)!;
    const texture = await cardFaceTexture(source, face);
    target.src = (texture.image as HTMLCanvasElement).toDataURL('image/png');
    target.dataset.ready = 'true';
    source.dispose();
    texture.dispose();
  } catch {
    target.alt += ' — image unavailable';
    target.dataset.ready = 'error';
  }
}

function show(): void {
  observer.disconnect();
  grid.replaceChildren();
  for (const suit of SUITS) {
    if (suitFilter.value !== 'all' && suit !== suitFilter.value) continue;
    for (const rank of ranks) {
      if (actionFilter.checked && !['7', '8', '9', '10'].includes(rank)) continue;
      const art = new URL(midnightCardPath({ suit, rank }), base);
      const face = cardFaceFromUrl(art.href)!;
      const figure = document.createElement('figure');
      figure.dataset.suit = suit;
      const img = document.createElement('img');
      img.alt = `${suit} · ${face.title ?? face.index}`;
      img.width = 1064; img.height = 1486;
      img.dataset.art = art.href;
      const caption = document.createElement('figcaption');
      caption.textContent = `${suit.toUpperCase()} · ${face.title ?? (rank === 'K' ? '+10 (J / Q / K)' : face.index)}`;
      const link = document.createElement('a');
      link.textContent = 'Full-bleed original';
      link.href = new URL(midnightCardPath({ suit: suit as Suit, rank }, true), base).href;
      figure.append(img, caption, link);
      grid.append(figure);
      observer.observe(img);
    }
  }
}
suitFilter.addEventListener('change', show);
actionFilter.addEventListener('change', show);
show();
