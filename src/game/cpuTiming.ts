/** Normal CPU thinking pace, shared by local and hosted games. */
export function cpuActionDelay(random = Math.random): number {
  return 420 + random() * 440;
}
