import { ChartColorCustomPalette, ChartColorThemeConfig } from '../types/pos';

export interface ChartColorPalette {
  id: string;
  name: string;
  description: string;
  primary: string;
  primaryLight: string;
  secondary: string;
  positive: string;
  positiveDark: string;
  warning: string;
  danger: string;
  neutral: string;
  grid: string;
  series: string[];
  swatches: string[];
}

export interface ChartThemePreset {
  id: string;
  name: string;
  description: string;
  palette: ChartColorPalette;
}

export const DEFAULT_CUSTOM_CHART_COLORS: ChartColorCustomPalette = {
  primary: '#0284c7',
  secondary: '#6366f1',
  positive: '#10b981',
  warning: '#f59e0b',
  danger: '#f43f5e',
  neutral: '#94a3b8',
};

const adjustHexLightness = (hex: string, factor: number): string => {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const mix = (channel: number) =>
    factor >= 0
      ? Math.round(channel + (255 - channel) * factor)
      : Math.round(channel * (1 + factor));
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
};

export const CHART_THEME_PRESETS: ChartThemePreset[] = [
  {
    id: 'ocean',
    name: 'Ocean KasirKu',
    description: 'Biru & hijau emerald bawaan yang bersih dan kontras tinggi.',
    palette: {
      id: 'ocean',
      name: 'Ocean KasirKu',
      description: 'Biru & hijau emerald bawaan yang bersih dan kontras tinggi.',
      primary: '#0284c7',
      primaryLight: '#38bdf8',
      secondary: '#6366f1',
      positive: '#10b981',
      positiveDark: '#059669',
      warning: '#f59e0b',
      danger: '#f43f5e',
      neutral: '#94a3b8',
      grid: '#e2e8f0',
      series: ['#0284c7', '#10b981', '#6366f1', '#f59e0b', '#f43f5e', '#0d9488', '#8b5cf6', '#ea580c'],
      swatches: ['#0284c7', '#10b981', '#6366f1', '#f59e0b', '#f43f5e'],
    },
  },
  {
    id: 'emerald',
    name: 'Ritel Segar',
    description: 'Nuansa hijau minimarket & kebutuhan segar yang menenangkan.',
    palette: {
      id: 'emerald',
      name: 'Ritel Segar',
      description: 'Nuansa hijau minimarket & kebutuhan segar yang menenangkan.',
      primary: '#059669',
      primaryLight: '#34d399',
      secondary: '#0ea5e9',
      positive: '#16a34a',
      positiveDark: '#15803d',
      warning: '#d97706',
      danger: '#e11d48',
      neutral: '#94a3b8',
      grid: '#e2e8f0',
      series: ['#059669', '#0ea5e9', '#14b8a6', '#d97706', '#e11d48', '#84cc16', '#0284c7', '#65a30d'],
      swatches: ['#059669', '#0ea5e9', '#14b8a6', '#d97706', '#e11d48'],
    },
  },
  {
    id: 'indigo',
    name: 'Indigo Eksekutif',
    description: 'Palet indigo & cyan modern berkesan korporat dan tajam.',
    palette: {
      id: 'indigo',
      name: 'Indigo Eksekutif',
      description: 'Palet indigo & cyan modern berkesan korporat dan tajam.',
      primary: '#4f46e5',
      primaryLight: '#818cf8',
      secondary: '#06b6d4',
      positive: '#10b981',
      positiveDark: '#059669',
      warning: '#f59e0b',
      danger: '#ec4899',
      neutral: '#94a3b8',
      grid: '#e2e8f0',
      series: ['#4f46e5', '#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6', '#14b8a6'],
      swatches: ['#4f46e5', '#06b6d4', '#10b981', '#8b5cf6', '#ec4899'],
    },
  },
  {
    id: 'terracotta',
    name: 'Kuliner Hangat',
    description: 'Oranye terracotta & amber cocok untuk F&B, kafe, dan bakery.',
    palette: {
      id: 'terracotta',
      name: 'Kuliner Hangat',
      description: 'Oranye terracotta & amber cocok untuk F&B, kafe, dan bakery.',
      primary: '#ea580c',
      primaryLight: '#fb923c',
      secondary: '#d97706',
      positive: '#059669',
      positiveDark: '#047857',
      warning: '#eab308',
      danger: '#dc2626',
      neutral: '#a8a29e',
      grid: '#e7e5e4',
      series: ['#ea580c', '#d97706', '#059669', '#0284c7', '#dc2626', '#9333ea', '#ca8a04', '#0d9488'],
      swatches: ['#ea580c', '#d97706', '#059669', '#0284c7', '#dc2626'],
    },
  },
  {
    id: 'berry',
    name: 'Butik Modern',
    description: 'Kombinasi magenta rose, violet, dan teal yang ekspresif.',
    palette: {
      id: 'berry',
      name: 'Butik Modern',
      description: 'Kombinasi magenta rose, violet, dan teal yang ekspresif.',
      primary: '#db2777',
      primaryLight: '#f472b6',
      secondary: '#9333ea',
      positive: '#0d9488',
      positiveDark: '#0f766e',
      warning: '#f59e0b',
      danger: '#e11d48',
      neutral: '#94a3b8',
      grid: '#e2e8f0',
      series: ['#db2777', '#9333ea', '#0d9488', '#0284c7', '#f59e0b', '#e11d48', '#6366f1', '#10b981'],
      swatches: ['#db2777', '#9333ea', '#0d9488', '#0284c7', '#f59e0b'],
    },
  },
  {
    id: 'monochrome',
    name: 'Grafit Minimalis',
    description: 'Slate gelap editorial dengan aksen sinyal yang terukur.',
    palette: {
      id: 'monochrome',
      name: 'Grafit Minimalis',
      description: 'Slate gelap editorial dengan aksen sinyal yang terukur.',
      primary: '#0f172a',
      primaryLight: '#475569',
      secondary: '#334155',
      positive: '#059669',
      positiveDark: '#047857',
      warning: '#d97706',
      danger: '#dc2626',
      neutral: '#cbd5e1',
      grid: '#e2e8f0',
      series: ['#0f172a', '#475569', '#059669', '#0284c7', '#d97706', '#64748b', '#dc2626', '#94a3b8'],
      swatches: ['#0f172a', '#475569', '#059669', '#d97706', '#dc2626'],
    },
  },
];

export const buildCustomChartPalette = (
  customColors?: Partial<ChartColorCustomPalette>
): ChartColorPalette => {
  const merged: ChartColorCustomPalette = {
    ...DEFAULT_CUSTOM_CHART_COLORS,
    ...(customColors || {}),
  };
  return {
    id: 'custom',
    name: 'Kustom Toko',
    description: 'Palet warna kustom sesuai identitas visual toko Anda.',
    primary: merged.primary,
    primaryLight: adjustHexLightness(merged.primary, 0.3),
    secondary: merged.secondary,
    positive: merged.positive,
    positiveDark: adjustHexLightness(merged.positive, -0.2),
    warning: merged.warning,
    danger: merged.danger,
    neutral: merged.neutral,
    grid: '#e2e8f0',
    series: [
      merged.primary,
      merged.positive,
      merged.secondary,
      merged.warning,
      merged.danger,
      adjustHexLightness(merged.primary, 0.25),
      adjustHexLightness(merged.secondary, -0.15),
      adjustHexLightness(merged.warning, -0.15),
    ],
    swatches: [
      merged.primary,
      merged.positive,
      merged.secondary,
      merged.warning,
      merged.danger,
    ],
  };
};

export const resolveChartPalette = (
  config?: ChartColorThemeConfig | null
): ChartColorPalette => {
  if (!config || !config.themeId) {
    return CHART_THEME_PRESETS[0].palette;
  }
  if (config.themeId === 'custom') {
    return buildCustomChartPalette(config.customColors);
  }
  const found = CHART_THEME_PRESETS.find((t) => t.id === config.themeId);
  return found ? found.palette : CHART_THEME_PRESETS[0].palette;
};
