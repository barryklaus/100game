import { prefersLosslessHand } from '../game/deck';

type PermissionOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const clamp = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));

/** A small, calibrated tilt for the sharp DOM hand. Sensor work stops when the tab is hidden. */
export class GyroHand {
  status: 'off' | 'waiting' | 'on' | 'denied' | 'unavailable' = 'off';
  onStatusChange?: () => void;
  private baseline: { beta: number; gamma: number } | null = null;
  private last: { beta: number; gamma: number } | null = null;
  private targetX = 0;
  private targetY = 0;
  private x = 0;
  private y = 0;
  private frame = 0;
  private sensorTimer = 0;
  private lastSensorTime = 0;

  get available(): boolean {
    return isSecureContext && 'DeviceOrientationEvent' in window &&
      prefersLosslessHand() && matchMedia('(pointer: coarse)').matches;
  }

  async enable(): Promise<void> {
    if (this.status === 'on' || this.status === 'waiting') return;
    if (!this.available) { this.setStatus('unavailable'); return; }
    this.setStatus('waiting');
    try {
      // iOS requires this call directly inside the button's click gesture.
      const permission = (DeviceOrientationEvent as PermissionOrientationEvent).requestPermission?.();
      if (permission && await permission !== 'granted') {
        this.setStatus('denied');
        return;
      }
      addEventListener('deviceorientation', this.onOrientation, { passive: true });
      addEventListener('orientationchange', this.recenter, { passive: true });
      document.addEventListener('visibilitychange', this.onVisibility);
      this.sensorTimer = window.setTimeout(() => {
        if (this.status === 'waiting') { this.setStatus('unavailable'); this.stop(); }
      }, 2500);
    } catch {
      this.setStatus('denied');
    }
  }

  recenter = (): void => {
    this.baseline = this.last ? { ...this.last } : null;
    this.targetX = this.targetY = 0;
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.targetX = this.targetY = this.x = this.y = 0;
      this.paint(0);
    } else if (this.status === 'on') {
      this.recenter();
      this.tick();
    }
  };

  private onOrientation = (event: DeviceOrientationEvent): void => {
    if (event.beta == null || event.gamma == null) return;
    this.last = { beta: event.beta, gamma: event.gamma };
    if (!this.baseline) this.recenter();
    if (this.status === 'waiting') {
      clearTimeout(this.sensorTimer);
      this.setStatus('on');
    }
    const pitch = clamp(event.beta - this.baseline!.beta, 40);
    const roll = clamp(event.gamma - this.baseline!.gamma, 40);
    const angle = screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0;
    const landscape = Math.abs(angle) % 180 === 90;
    this.targetX = clamp((landscape ? roll : -pitch) * .25, 9);
    this.targetY = clamp((landscape ? -pitch : roll) * .25, 9);
    this.lastSensorTime = performance.now();
    this.tick();
  };

  private tick = (): void => {
    if (this.frame || document.hidden || this.status !== 'on') return;
    const step = () => {
      this.frame = 0;
      if (this.status !== 'on' || document.hidden) return;
      const beforeX = this.x, beforeY = this.y;
      this.x += (this.targetX - this.x) * .16;
      this.y += (this.targetY - this.y) * .16;
      const motion = Math.hypot(this.x - beforeX, this.y - beforeY);
      this.paint(motion);
      if (performance.now() - this.lastSensorTime < 300 || motion > .008) this.frame = requestAnimationFrame(step);
      else this.paint(0);
    };
    this.frame = requestAnimationFrame(step);
  };

  private paint(motion: number): void {
    const root = document.documentElement;
    root.style.setProperty('--gyro-x', `${this.x.toFixed(2)}deg`);
    root.style.setProperty('--gyro-y', `${this.y.toFixed(2)}deg`);
    const foil = Math.min(.48, motion * 1.5);
    for (const card of Array.from(document.querySelectorAll<HTMLElement>('.crisp-mobile-hand .local-hand .hand-card'))) {
      if (card.classList.contains('dragging') || card.classList.contains('inspecting')) continue;
      card.style.setProperty('--holo-x', `${(50 + this.y * 3).toFixed(1)}%`);
      card.style.setProperty('--holo-y', `${(50 - this.x * 3).toFixed(1)}%`);
      card.style.setProperty('--foil-angle', `${(35 + this.y * 5 + this.x * 2).toFixed(1)}deg`);
      card.style.setProperty('--foil-motion', foil.toFixed(2));
      card.toggleAttribute('data-foil-moving', foil > .08);
    }
  }

  stop(): void {
    removeEventListener('deviceorientation', this.onOrientation);
    removeEventListener('orientationchange', this.recenter);
    document.removeEventListener('visibilitychange', this.onVisibility);
    clearTimeout(this.sensorTimer);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.baseline = this.last = null;
    this.targetX = this.targetY = this.x = this.y = 0;
    this.paint(0);
    document.documentElement.style.removeProperty('--gyro-x');
    document.documentElement.style.removeProperty('--gyro-y');
    if (this.status === 'on' || this.status === 'waiting') this.setStatus('off');
  }

  private setStatus(status: GyroHand['status']): void {
    this.status = status;
    this.onStatusChange?.();
  }
}
