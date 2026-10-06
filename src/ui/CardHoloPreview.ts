import * as THREE from 'three';
import { SUITS, type Rank } from '../data/config';
import { midnightCardPath } from '../game/midnightDeck';
import { cardFaceFromUrl } from '../game/cardFace';
import { cardFaceTexture } from '../render/CardFaceTexture';
import { createCardMesh, disposeCardMesh } from '../render/CardMesh';

const host = document.querySelector<HTMLElement>('#holograms')!;
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor('#091320');
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.append(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera();
camera.position.z = 10;
const cards: THREE.Group[] = [];
let playing = false, raf = 0, version = 0;

function layout(): void {
  const width = host.clientWidth, height = host.clientHeight;
  const portrait = width < 700;
  const extent = Math.max(portrait ? 4.9 : 3.1, (portrait ? 3.2 : 6.25) * height / width);
  camera.left = -extent * width / height / 2; camera.right = -camera.left;
  camera.top = extent / 2; camera.bottom = -camera.top;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  cards.forEach((card, i) => card.position.set(portrait ? (i % 2 - .5) * 1.5 : (i - 1.5) * 1.4, portrait ? (i < 2 ? 1.12 : -1.12) : 0, 0));
  renderer.render(scene, camera);
}
function loop(time: number): void {
  if (playing) cards.forEach((card,i) => {
    const phase = time / 700 + i * .5;
    card.rotation.set(Math.sin(phase * .75) * .24, Math.sin(phase) * .42, Math.sin(phase * .4) * .025);
  });
  renderer.render(scene,camera);
  if (playing) raf = requestAnimationFrame(loop);
}
async function load(): Promise<void> {
  const current = ++version;
  const rank = (document.querySelector<HTMLSelectElement>('#rank')!.value) as Rank;
  document.querySelector<HTMLElement>('#status')!.textContent = 'Loading artwork…';
  const next = await Promise.all(SUITS.map(async suit => {
    const url = new URL(midnightCardPath({suit,rank}),new URL('../',location.href)).href;
    const image = new Image(); image.src = url; await image.decode();
    const source = new THREE.Texture(image); source.colorSpace = THREE.SRGBColorSpace;
    const face = await cardFaceTexture(source,cardFaceFromUrl(url)!); source.dispose();
    const mesh = createCardMesh(face,face,false,1.9); mesh.userData.previewTexture = face;
    return mesh;
  }));
  if (version !== current) {next.forEach(card=>{disposeCardMesh(card);card.userData.previewTexture.dispose();});return;}
  cards.forEach(card=>{scene.remove(card);disposeCardMesh(card);card.userData.previewTexture.dispose();});
  cards.splice(0,cards.length,...next);cards.forEach(card=>scene.add(card));
  layout();
  document.querySelector<HTMLElement>('#status')!.textContent = 'Fire · Water · Leaf · Sun';
}
document.querySelector('#tilt')!.addEventListener('click',()=>{
  cards.forEach(card=>{card.getObjectByName('card-artwork-foil')!.visible=true;});
  playing = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  document.querySelector('#tilt')!.setAttribute('aria-pressed','true');
});
document.querySelector('#still')!.addEventListener('click',()=>{
  playing = false;cancelAnimationFrame(raf);
  cards.forEach(card=>{
    card.rotation.set(0,0,0);
    card.getObjectByName('card-artwork-foil')!.visible=false;
  });
  renderer.render(scene,camera);
  document.querySelector('#tilt')!.setAttribute('aria-pressed','false');
});
document.querySelector('#rank')!.addEventListener('change',()=>void load());
window.addEventListener('resize',layout);
document.addEventListener('visibilitychange',()=>{
  cancelAnimationFrame(raf);
  if (!document.hidden && playing) raf=requestAnimationFrame(loop);
});
void load();
