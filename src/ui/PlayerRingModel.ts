/** Circular seat order is presentation only; rules and seat IDs never rotate. */
export function wrapSeat(value: number, count: number): number {
  return ((value % count) + count) % count;
}
export function seatDistance(index: number, center: number, count: number): number {
  return wrapSeat(index - center + count / 2, count) - count / 2;
}
export function nearestCenter(index: number, center: number, count: number): number {
  return center + seatDistance(index + .5, center, count);
}
export function ringSeat(index: number, center: number, count: number, portrait: boolean, spotlight = false) {
  const distance = count <= 4 ? index - (spotlight ? center : (count - 1) / 2) : seatDistance(index, center, count);
  const visible = Math.abs(distance) < 2;
  const u = distance / Math.max(1.5, (count - 1) / 2 * Number(count <= 4));
  const opacity = count <= 4 && !spotlight ? 1 : Math.max(0, Math.min(1, (2 - Math.abs(distance)) * 2));
  return { distance, visible, opacity, x: .5 + u * (portrait ? .375 : .30), y: (portrait ? .32 : .30) + u * u * .012, scale: 1 - Math.min(1, Math.abs(u)) * .06 };
}
/** Fixed four-chair spacing: smaller games occupy the inner seats instead of spreading out. */
export function traditionalRingSeat(index: number, center: number, count: number, portrait: boolean, spotlight = false) {
  const pose=ringSeat(index,center,count,portrait,spotlight);
  return {...pose,x:.5+pose.distance*(portrait?.235:.155),scale:1-Math.min(1,Math.abs(pose.distance)/1.5)*.03};
}
export type CharacterFrame = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export function faceFrame(total: number, active: boolean, relieved: boolean, overflow: boolean, mood = 'Normal'): CharacterFrame {
  if (overflow) return 5;
  if (relieved) return 4;
  if (total >= 90) return active ? 3 : 2;
  if (total >= 70) return 2;
  if (active) return 1;
  if (['Smug', 'Confident', 'Happy', 'Excited'].includes(mood)) return 4;
  if (['Scared', 'Sad', 'Confused'].includes(mood)) return 2;
  return 0;
}
