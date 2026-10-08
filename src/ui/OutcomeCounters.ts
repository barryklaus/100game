import type { Stats } from '../data/storage';

/** Lifetime match outcomes are independent of legacy rating and currency. */
export function outcomeCounters(stats: Pick<Stats, 'freedoms' | 'deaths'>, base: string): string {
  const counters = [
    { id: 'freedom', label: 'Freedom', value: stats.freedoms },
    { id: 'death', label: 'Death', value: stats.deaths },
  ];
  return `<div class="header-wallet outcome-counters" role="group" aria-label="Lifetime match outcomes">${counters.map(({ id, label, value }) => {
    const count = value.toLocaleString();
    return `<button type="button" class="outcome-counter outcome-${id}" data-action="stats" title="Lifetime ${label.toLowerCase()} count" aria-label="${label}: ${count}. Open statistics"><img src="${base}assets/ui/outcomes/${id}.svg" width="28" height="28" alt="" aria-hidden="true"><span class="outcome-copy"><span class="outcome-label">${label}</span><strong class="outcome-value">${count}</strong></span></button>`;
  }).join('')}</div>`;
}
