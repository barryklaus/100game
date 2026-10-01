/** Stable component identities keep portraits connected while the game changes. */
const components = [
  'game-page', 'game-header', 'online-alert', 'game-layout', 'arena', 'table-rim',
  'table-felt', 'energy-system', 'total-wrap', 'table-cards', 'seat-layer',
  'target-hint', 'side-panel', 'shared-turn', 'hand-dock', 'dock-prompt',
  'dock-avatar', 'dock-person', 'local-hand', 'dock-controls', 'emote-menu',
  'info-fab', 'dock-quote', 'result-overlay', 'modal-overlay',
  'ring-controls', 'ring-markers', 'character-sprite',
];

function identity(node: Node): string | undefined {
  if (!(node instanceof HTMLElement)) return;
  if (node.dataset.seat !== undefined) return `seat:${node.dataset.seat}`;
  if (node.dataset.ringFocus !== undefined) return `marker:${node.dataset.ringFocus}`;
  return components.find(name => node.classList.contains(name));
}

function attributes(current: HTMLElement, next: HTMLElement): void {
  // These coordinates belong to the 3D renderer, not the HTML view template.
  const projected = current.matches('.seat')
    ? ['--seat-chair-x', '--seat-chair-y'].map(name => [name, current.style.getPropertyValue(name)] as const)
    : [];
  for (const attribute of Array.from(current.attributes)) {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(next.attributes)) {
    if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  }
  for (const [name, value] of projected) if (value) current.style.setProperty(name, value);
}

function patch(current: Node, next: Node): void {
  if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  if (!(current instanceof HTMLElement) || !(next instanceof HTMLElement)) return;
  attributes(current, next);
  // Card hit targets intentionally keep their existing lifecycle: it resets drag
  // classes and lets PhysicalHand attach the new targets after a completed play.
  if (current.matches('.local-hand, .shared-hand, .table-cards')) {
    current.replaceChildren(...Array.from(next.childNodes));
    return;
  }
  children(current, next);
}

function children(current: HTMLElement, next: HTMLElement): void {
  const old = Array.from(current.childNodes);
  const used = new Set<Node>();
  const pairs = Array.from(next.childNodes).map(incoming => {
    const key = identity(incoming);
    const match = old.find(candidate => !used.has(candidate)
      && identity(candidate) === key
      && candidate.nodeType === incoming.nodeType
      && candidate.nodeName === incoming.nodeName);
    if (match) used.add(match);
    return {incoming, match};
  });
  // Remove obsolete siblings first, so an unchanged portrait doesn't have to be
  // moved around a disappearing turn bubble, modal, or pass-device panel.
  for (const node of old) if (!used.has(node)) current.removeChild(node);
  let cursor = current.firstChild;
  for (const {incoming, match} of pairs) {
    const node = match ?? incoming;
    if (match) patch(match, incoming);
    // Do not detach or move already-correct nodes: that can restart CSS animation.
    if (node !== cursor) current.insertBefore(node, cursor);
    cursor = node.nextSibling;
  }
}

export function updateGameView(root: HTMLElement, markup: string): void {
  const handPositions=new Map(Array.from(root.querySelectorAll<HTMLElement>('.local-hand .hand-card')).map(card=>[card.dataset.card!,card.getBoundingClientRect()]));
  const previousTotal=root.querySelector('.total-number')?.textContent;
  const template = document.createElement('template');
  template.innerHTML = markup;
  const next = template.content.firstElementChild;
  if (!root.firstElementChild?.matches('.game-page') || !next?.matches('.game-page')) {
    root.replaceChildren(template.content);
    return;
  }
  const container = document.createElement('div');
  container.append(template.content);
  children(root, container);
  if(!document.documentElement.classList.contains('reduce-motion')){
    // CSS translate is independent of the existing fan and gyro transforms.
    if(document.documentElement.classList.contains('crisp-mobile-hand')){
      root.querySelectorAll<HTMLElement>('.local-hand .hand-card').forEach(card=>{
        const before=handPositions.get(card.dataset.card!);if(!before)return;
        const after=card.getBoundingClientRect();const x=before.left-after.left,y=before.top-after.top;
        if(Math.abs(x)+Math.abs(y)>2)card.animate([{translate:`${x}px ${y}px`},{translate:'0 0'}],{duration:340,easing:'cubic-bezier(.2,.7,.3,1)'});
      });
    }
    const total=root.querySelector<HTMLElement>('.total-number');
    if(total&&previousTotal!==total.textContent)total.animate([{translate:'0 5px',opacity:.55},{translate:'0 0',opacity:1}],{duration:260,easing:'ease-out'});
  }
}
