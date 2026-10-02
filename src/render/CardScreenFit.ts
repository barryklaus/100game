/** Match the projected card to its actual hand target, including small sprite hands. */
export function cardScreenScale(rect: { width: number; height: number }, viewportHeight: number,
  fovDegrees: number, distance: number, cardHeight = 1.43, aspect = 1064 / 1478): number {
  const pixels = Math.max(1, Math.min(rect.height, rect.width / aspect));
  const worldHeight = 2 * distance * Math.tan(fovDegrees * Math.PI / 360);
  return pixels / Math.max(1, viewportHeight) * worldHeight / cardHeight;
}
