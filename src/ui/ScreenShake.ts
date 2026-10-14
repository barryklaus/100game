/** Drive danger from the displayed score, so shake starts with the number's arrival. */
export function setScreenDanger(total:number|null):void {
  document.documentElement.classList.toggle('total-danger100',total===100);
}

/** Remove the shared screen translation before fitting cards into the 3D scene. */
export function unshakenRect(rect:DOMRect):DOMRect {
  if(!document.documentElement.classList.contains('total-danger100'))return rect;
  const origin=document.body.getBoundingClientRect();
  return new DOMRect(rect.x-origin.left,rect.y-origin.top,rect.width,rect.height);
}

export const screenRect=(element:Element):DOMRect=>unshakenRect(element.getBoundingClientRect());
