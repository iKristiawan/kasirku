import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { ChartColorCustomPalette, ChartColorThemeConfig } from '../types/pos';
import {
  ChartColorPalette,
  CHART_THEME_PRESETS,
  DEFAULT_CUSTOM_CHART_COLORS,
  resolveChartPalette,
} from '../utils/chartTheme';

const STORAGE_KEY = 'kasirku_dashboard_chart_theme_v1';

interface ChartThemeContextValue {
  themeId: string;
  config: ChartColorThemeConfig;
  palette: ChartColorPalette;
  customColors: ChartColorCustomPalette;
  isDefaultTheme: boolean;
  selectPreset: (themeId: string) => void;
  updateCustomColors: (patch: Partial<ChartColorCustomPalette>) => void;
  resetTheme: () => void;
}

const DEFAULT_CONFIG: ChartColorThemeConfig = {
  themeId: 'ocean',
  customColors: DEFAULT_CUSTOM_CHART_COLORS,
};

const ChartThemeContext = createContext<ChartThemeContextValue>({
  themeId: 'ocean',
  config: DEFAULT_CONFIG,
  palette: CHART_THEME_PRESETS[0].palette,
  customColors: DEFAULT_CUSTOM_CHART_COLORS,
  isDefaultTheme: true,
  selectPreset: () => {},
  updateCustomColors: () => {},
  resetTheme: () => {},
});

const readLocalThemeConfig = (): ChartColorThemeConfig | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChartColorThemeConfig;
    if (parsed && typeof parsed.themeId === 'string') {
      return {
        themeId: parsed.themeId,
        customColors: {
          ...DEFAULT_CUSTOM_CHART_COLORS,
          ...(parsed.customColors || {}),
        },
      };
    }
  } catch {
    // Ignore storage error
  }
  return null;
};

interface ChartThemeProviderProps {
  children: React.ReactNode;
  initialConfig?: ChartColorThemeConfig;
  onChangeConfig?: (nextConfig: ChartColorThemeConfig) => void;
}

export const ChartThemeProvider: React.FC<ChartThemeProviderProps> = ({
  children,
  initialConfig,
  onChangeConfig,
}) => {
  const [config, setConfig] = useState<ChartColorThemeConfig>(() => {
    if (initialConfig && initialConfig.themeId) {
      return {
        themeId: initialConfig.themeId,
        customColors: {
          ...DEFAULT_CUSTOM_CHART_COLORS,
          ...(initialConfig.customColors || {}),
        },
      };
    }
    return readLocalThemeConfig() || DEFAULT_CONFIG;
  });

  // Keep synced if storeSettings changes externally (e.g., Firestore sync)
  useEffect(() => {
    if (initialConfig && initialConfig.themeId) {
      setConfig((prev) => {
        const nextCustom = {
          ...DEFAULT_CUSTOM_CHART_COLORS,
          ...(initialConfig.customColors || {}),
        };
        if (
          prev.themeId === initialConfig.themeId &&
          JSON.stringify(prev.customColors) === JSON.stringify(nextCustom)
        ) {
          return prev;
        }
        return {
          themeId: initialConfig.themeId,
          customColors: nextCustom,
        };
      });
    }
  }, [initialConfig]);

  const commitConfig = useCallback(
    (next: ChartColorThemeConfig) => {
      setConfig(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      onChangeConfig?.(next);
    },
    [onChangeConfig]
  );

  const selectPreset = useCallback(
    (themeId: string) => {
      commitConfig({
        ...config,
        themeId,
      });
    },
    [config, commitConfig]
  );

  const updateCustomColors = useCallback(
    (patch: Partial<ChartColorCustomPalette>) => {
      const nextCustom: ChartColorCustomPalette = {
        ...DEFAULT_CUSTOM_CHART_COLORS,
        ...(config.customColors || {}),
        ...patch,
      };
      commitConfig({
        themeId: 'custom',
        customColors: nextCustom,
      });
    },
    [config, commitConfig]
  );

  const resetTheme = useCallback(() => {
    commitConfig(DEFAULT_CONFIG);
  }, [commitConfig]);

  const palette = useMemo(() => resolveChartPalette(config), [config]);

  const value = useMemo<ChartThemeContextValue>(
    () => ({
      themeId: config.themeId,
      config,
      palette,
      customColors: config.customColors || DEFAULT_CUSTOM_CHART_COLORS,
      isDefaultTheme: config.themeId === 'ocean',
      selectPreset,
      updateCustomColors,
      resetTheme,
    }),
    [config, palette, selectPreset, updateCustomColors, resetTheme]
  );

  return (
    <ChartThemeContext.Provider value={value}>
      {children}
    </ChartThemeContext.Provider>
  );
};

export const useChartTheme = (): ChartThemeContextValue => useContext(ChartThemeContext);
