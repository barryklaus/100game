export type QualityPreset = 'ultra' | 'high' | 'medium' | 'mobile';

export interface QualityConfig {
  label: string;
  /** Maximum device pixel ratio, rather than a fixed render resolution. */
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  bloomStrength: number;
  ambientOcclusion: boolean;
  textureAnisotropy: number;
  reflections: boolean;
}

/** Shared render budgets. All presets use the same art and scene composition. */
export const QUALITY_PRESETS: Readonly<Record<QualityPreset, Readonly<QualityConfig>>> = {
  ultra: { label: 'Ultra', pixelRatio: 2, shadows: true, shadowMapSize: 2048, bloom: false, bloomStrength: 0, ambientOcclusion: false, textureAnisotropy: 16, reflections: true },
  high: { label: 'High', pixelRatio: 2, shadows: true, shadowMapSize: 1024, bloom: false, bloomStrength: 0, ambientOcclusion: false, textureAnisotropy: 16, reflections: true },
  medium: { label: 'Medium', pixelRatio: 1.35, shadows: true, shadowMapSize: 512, bloom: false, bloomStrength: 0, ambientOcclusion: false, textureAnisotropy: 16, reflections: false },
  mobile: { label: 'Mobile', pixelRatio: 1.5, shadows: false, shadowMapSize: 256, bloom: false, bloomStrength: 0, ambientOcclusion: false, textureAnisotropy: 16, reflections: false },
};

export function defaultQuality(): QualityPreset {
  return 'high';
}

export function normalizeQuality(value: unknown, fallback: QualityPreset = defaultQuality()): QualityPreset {
  if (value === 'low') return 'mobile'; // Saved settings from the original two-tier renderer.
  return value === 'ultra' || value === 'high' || value === 'medium' || value === 'mobile' ? value : fallback;
}
