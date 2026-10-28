import { conditionAnimations } from './ConditionAnimationData';
import { masterAnimations } from './MasterAnimationData';
import { MasterAnimations, masterFrameStyle, masterFrameUrl, masterSpecialThrowFrames } from './MasterAnimations';
import { masterAnchors } from './MasterCharacters';
import { masterCharacterData } from './MasterSpriteData';
import { specialThrows } from './SpecialThrowData';

const root = document.querySelector<HTMLElement>('#special-throw-review')!;
const params = new URLSearchParams(location.search);
const styles = document.createElement('style');
styles.textContent = `
  *{box-sizing:border-box}body{margin:0;background:#10151d;color:#f3e7cc;font:15px/1.45 system-ui,sans-serif}
  main{max-width:1100px;margin:auto;padding:20px}h1{font-size:clamp(22px,4vw,30px);margin:0 0 6px}
  p{margin:6px 0 18px;color:#c7c2b6}a{color:#e7c782}.controls{display:flex;align-items:end;flex-wrap:wrap;gap:12px;margin:18px 0}
  label{display:grid;gap:5px}select,button{font:inherit;color:inherit;background:#202b39;border:1px solid #776d54;border-radius:8px;padding:9px 12px}
  button{cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #ffdc8c;outline-offset:3px}
  button.primary{background:#e2c384;color:#171b22;font-weight:700}.check{display:flex;align-items:center;gap:6px;padding:8px 0}
  .comparison{display:grid;grid-template-columns:1fr 1fr;gap:18px}.panel{min-width:0;margin:0}.panel h2{font-size:15px;margin:0 0 8px}
  .stage{position:relative;width:100%;aspect-ratio:1;background:#17222c;border:1px solid #39424b;border-radius:12px;overflow:hidden}
  .seat,.master-sprite,.master-hands{position:absolute;inset:0;width:100%;height:100%}.master-frame,.reference-frame{position:absolute;max-width:none;object-fit:fill;pointer-events:none}
  .stage.guides:before{content:'';position:absolute;inset:0;background:linear-gradient(transparent calc(50% - .5px),#85949d44 50%,transparent calc(50% + .5px)),linear-gradient(90deg,transparent calc(50% - .5px),#85949d44 50%,transparent calc(50% + .5px));pointer-events:none}
  .master-hand-release,.master-hand-catch{position:absolute;pointer-events:none}.table-cover{display:none;position:absolute;left:-15%;width:130%;top:55%;height:55%;border:2px solid #a98b56;border-radius:50% 50% 0 0;background:#173238;pointer-events:none}
  .cover .table-cover{display:block}.metrics{display:block;min-height:3.8em;padding:10px 0;color:#b9c6cc;font:12px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}
  .status{border-left:3px solid #d7b876;padding:9px 12px;margin:12px 0;background:#1b2631;min-height:42px}.note{font-size:13px}.pose-controls{padding-top:2px;border-top:1px solid #39424b}
  @media(max-width:650px){main{padding:14px}.comparison{gap:8px}.panel h2{font-size:13px}.metrics{font-size:10px}.controls{gap:9px}select,button{padding:8px 10px;font-size:14px}}
`;
document.head.append(styles);
root.innerHTML = `<main>
  <h1>Special Throw · Animation review</h1>
  <p>Idle and action share the same fixed canvas and display scale. This preview uses the game's animation controller and does not change statistics.</p>
  <div class="controls">
    <label>Character<select id="character">${masterCharacterData.map(character => `<option value="${character.id}">${character.name}</option>`).join('')}</select></label>
    <label>Condition<select id="condition"><option value="0">Healthy</option><option value="1">1 · Bruised</option><option value="2">2 · Torn clothes</option><option value="3">3 · Bandaged</option></select></label>
    <button id="play" class="primary">Play full sequence</button><button id="idle">Return to idle</button>
  </div>
  <div class="controls">
    <label class="check"><input id="reduced" type="checkbox"> Reduced motion</label>
    <label class="check"><input id="table" type="checkbox"> Table cover</label>
    <label class="check"><input id="guides" type="checkbox" checked> Alignment guides</label>
    <label class="check"><input id="repeat" type="checkbox"> Repeat sequence</label>
  </div>
  <div id="status" class="status" role="status">Ready.</div>
  <div class="comparison">
    <figure class="panel"><h2>Idle reference · fixed</h2><div id="reference" class="stage guides"><img class="reference-frame" alt="Idle reference"><div class="table-cover"></div></div><output id="reference-metrics" class="metrics"></output></figure>
    <figure class="panel"><h2>Special Throw · live</h2><div id="action" class="stage guides"></div><output id="action-metrics" class="metrics"></output></figure>
  </div>
  <div class="controls pose-controls">
    <label>Inspect an action drawing<select id="pose"></select></label><button id="inspect">Show drawing</button>
    <button id="previous">← Previous</button><button id="next">Next →</button>
  </div>
  <p id="move" class="note"></p>
  <p class="note">Native dimensions describe the actual downloaded drawing, not an enlarged export. Injured characters keep their matching throw artwork. Standing, leaning, and arm movement may change the silhouette; the canvas does not auto-fit each pose.</p>
  <a href="/">Return to game</a>
</main>`;

const character = root.querySelector<HTMLSelectElement>('#character')!;
const condition = root.querySelector<HTMLSelectElement>('#condition')!;
const reduced = root.querySelector<HTMLInputElement>('#reduced')!;
const table = root.querySelector<HTMLInputElement>('#table')!;
const guides = root.querySelector<HTMLInputElement>('#guides')!;
const repeat = root.querySelector<HTMLInputElement>('#repeat')!;
const pose = root.querySelector<HTMLSelectElement>('#pose')!;
const status = root.querySelector<HTMLElement>('#status')!;
const action = root.querySelector<HTMLElement>('#action')!;
const reference = root.querySelector<HTMLImageElement>('.reference-frame')!;
const playButton = root.querySelector<HTMLButtonElement>('#play')!;
character.value = masterCharacterData.some(item => item.id === params.get('character')) ? params.get('character')! : 'finn';
condition.value = ['0','1','2','3'].includes(params.get('condition') ?? '') ? params.get('condition')! : '0';
let controller: MasterAnimations | undefined;
let observer: MutationObserver | undefined;
let generation = 0;
let repeatTimer = 0;

function metrics(image: HTMLImageElement, target: string, frame: string): void {
  const output = root.querySelector<HTMLOutputElement>(target)!;
  const rect = image.getBoundingClientRect();
  output.textContent = `${frame} · native ${image.naturalWidth} × ${image.naturalHeight}px · displayed ${Math.round(rect.width)} × ${Math.round(rect.height)} CSS px`;
}
function updateActionMetrics(): void {
  const image = action.querySelector<HTMLImageElement>('.master-frame');
  if (image) metrics(image, '#action-metrics', action.querySelector<HTMLElement>('.master-sprite')?.dataset.frame ?? 'loading');
}
function updateCovers(): void {
  root.querySelectorAll<HTMLElement>('.stage').forEach(stage => {
    stage.classList.toggle('cover', table.checked);
    stage.classList.toggle('guides', guides.checked);
  });
}
function reset(): number {
  const ticket = ++generation;
  clearTimeout(repeatTimer);
  controller?.reset();
  observer?.disconnect();
  const id = character.value, stage = Number(condition.value), index = masterCharacterData.findIndex(item => item.id === id);
  const set = conditionAnimations[id]?.[stage] ?? masterAnimations[id];
  const idle = set.emotions.focused ?? 'rest';
  reference.src = masterFrameUrl(id, idle, stage);
  reference.style.cssText = masterFrameStyle(id, idle, stage);
  reference.onload = () => metrics(reference, '#reference-metrics', idle);
  metrics(reference, '#reference-metrics', idle);
  action.innerHTML = `<div class="seat master-seat" data-seat="0" data-condition="${stage}" data-mood="Normal"><div class="master-sprite" data-character="${id}" data-condition="${stage}"><img class="master-frame" alt="${masterCharacterData[index].name} animation"></div><div class="master-hands">${masterAnchors(index, stage)}</div></div><div class="table-cover"></div>`;
  const image = action.querySelector<HTMLImageElement>('.master-frame')!;
  image.addEventListener('load', updateActionMetrics);
  observer = new MutationObserver(updateActionMetrics);
  observer.observe(action.querySelector('.master-sprite')!, { attributes:true, childList:false, subtree:true, attributeFilter:['data-frame','src','style'] });
  controller = new MasterAnimations(action);
  controller.sync({active:0,total:0,overflow:false,target:false,reducedMotion:reduced.checked});
  const frames = masterSpecialThrowFrames(id, stage);
  pose.innerHTML = frames.map((frame, index) => `<option value="${index}" data-frame="${frame}">${index + 1} · ${frame}</option>`).join('');
  root.querySelector('#move')!.textContent = `${specialThrows[id]?.move ?? 'Special Throw'}${stage ? ' · uses the matching injured throw artwork' : ''}`;
  params.set('character', id); params.set('condition', String(stage));
  history.replaceState(null, '', '?' + params);
  playButton.disabled = false;
  updateCovers();
  status.textContent = 'Idle. Play the full sequence or inspect a drawing.';
  return ticket;
}

async function play(): Promise<void> {
  const ticket = reset(), cast = controller!;
  playButton.disabled = true;
  try {
    status.textContent = 'Loading complete drawings…';
    await cast.warm(0, Number(condition.value) ? 'throw' : 'special-throw');
    if (ticket !== generation) return;
    status.textContent = 'Preparing Special Throw…';
    // Use both game calls: arming followed by an accepted play must not restart the wind-up.
    cast.armSpecialThrow(0);
    const hand = await cast.prepareThrow(0, true);
    if (ticket !== generation) return;
    if (!hand) throw new Error('The preparation did not complete.');
    status.textContent = 'Release and follow-through · one card retained.';
    cast.release(0, true);
    await cast.prepareDraw(0);
    if (ticket !== generation) return;
    status.textContent = 'Receive · returning to the normal two-card pose.';
    await cast.received(0);
    if (ticket !== generation) return;
    status.textContent = 'Complete · back to idle.';
    if (repeat.checked) repeatTimer = window.setTimeout(() => void play(), 1000);
  } catch {
    if (ticket !== generation) return;
    cast.cancel(0);
    status.textContent = 'A drawing could not load. The idle pose is retained; try Play full sequence after the connection recovers.';
  } finally {
    if (ticket === generation) playButton.disabled = false;
  }
}
function inspect(delta = 0): void {
  const selected = Math.max(0, Math.min(pose.options.length - 1, pose.selectedIndex + delta));
  const frame = pose.options[selected]?.dataset.frame;
  if (!frame) return;
  reset();
  pose.selectedIndex = selected;
  controller!.reset();
  const sprite = action.querySelector<HTMLElement>('.master-sprite')!;
  const image = sprite.querySelector<HTMLImageElement>('.master-frame')!;
  sprite.dataset.frame = frame;
  image.src = masterFrameUrl(character.value, frame, Number(condition.value));
  image.style.cssText = masterFrameStyle(character.value, frame, Number(condition.value));
  status.textContent = `Drawing ${selected + 1}/${pose.options.length} · ${frame}. Both panels retain the same canvas.`;
}
playButton.addEventListener('click', () => void play());
root.querySelector('#idle')!.addEventListener('click', reset);
root.querySelector('#inspect')!.addEventListener('click', () => inspect());
root.querySelector('#previous')!.addEventListener('click', () => inspect(-1));
root.querySelector('#next')!.addEventListener('click', () => inspect(1));
for (const select of [character, condition]) select.addEventListener('change', reset);
reduced.addEventListener('change', reset);
table.addEventListener('change', updateCovers); guides.addEventListener('change', updateCovers);
repeat.addEventListener('change', () => { if (!repeat.checked) clearTimeout(repeatTimer); });
new ResizeObserver(() => { updateActionMetrics(); metrics(reference, '#reference-metrics', reference.src.split('?')[0].split('/').pop()?.replace('.webp','') ?? 'idle'); }).observe(action);
window.addEventListener('pagehide', () => { ++generation; clearTimeout(repeatTimer); controller?.reset(); observer?.disconnect(); });
reset();
