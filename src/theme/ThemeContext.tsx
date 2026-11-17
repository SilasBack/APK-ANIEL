import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  placeholder: string;
  primary: string;
  primaryText: string;
  primarySoft: string;
  primarySoftBorder: string;
  primarySoftText: string;
  danger: string;
  dangerSoft: string;
  dangerBorder: string;
  success: string;
  successSoft: string;
  successBorder: string;
  successText: string;
  warning: string;
  warningSoft: string;
  warningBorder: string;
  warningText: string;
  info: string;
  infoSoft: string;
  icon: string;
  iconMuted: string;
}

const LIGHT_COLORS: ThemeColors = {
  bg: '#F7FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F7FAFC',
  surfaceMuted: '#EDF2F7',
  border: '#EDF2F7',
  borderStrong: '#E2E8F0',
  text: '#1A202C',
  textSecondary: '#4A5568',
  textMuted: '#718096',
  placeholder: '#A0AEC0',
  primary: '#08776F',
  primaryText: '#FFFFFF',
  primarySoft: '#E6F4F1',
  primarySoftBorder: '#B2DFDB',
  primarySoftText: '#08776F',
  danger: '#C53030',
  dangerSoft: '#FFF5F5',
  dangerBorder: '#FEB2B2',
  success: '#2F855A',
  successSoft: '#F0FFF4',
  successBorder: '#9AE6B4',
  successText: '#22543D',
  warning: '#C05621',
  warningSoft: '#FFFAF0',
  warningBorder: '#FBD38D',
  warningText: '#7B341E',
  info: '#2B6CB0',
  infoSoft: '#EBF8FF',
  icon: '#1A202C',
  iconMuted: '#718096',
};

const DARK_COLORS: ThemeColors = {
  bg: '#0B1117',
  surface: '#131B24',
  surfaceAlt: '#0F161E',
  surfaceMuted: '#1C2733',
  border: '#1E293B',
  borderStrong: '#2D3B4E',
  text: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  placeholder: '#64748B',
  primary: '#0D9488',
  primaryText: '#FFFFFF',
  primarySoft: '#0F2D2B',
  primarySoftBorder: '#1F5450',
  primarySoftText: '#5EEAD4',
  danger: '#F87171',
  dangerSoft: '#2B1418',
  dangerBorder: '#7F1D1D',
  success: '#34D399',
  successSoft: '#0E281F',
  successBorder: '#1F5A47',
  successText: '#6EE7B7',
  warning: '#FBBF24',
  warningSoft: '#2B2110',
  warningBorder: '#784912',
  warningText: '#FDE68A',
  info: '#60A5FA',
  infoSoft: '#12263A',
  icon: '#F1F5F9',
  iconMuted: '#94A3B8',
};

const BG_MAP: Record<string, string> = {
  '#FFF': '#131B24',
  '#FFFFFF': '#131B24',
  '#F7FAFC': '#0B1117',
  '#F5F7FA': '#0B1117',
  '#F8FAFC': '#0B1117',
  '#EDF2F7': '#1C2733',
  '#F1F5F9': '#1C2733',
  '#E2E8F0': '#263344',
  '#E6F4F1': '#0F2D2B',
  '#F0FFF4': '#0E281F',
  '#C6F6D5': '#143A2B',
  '#FFFAF0': '#2B2110',
  '#FEFCBF': '#2B2110',
  '#FEEBC8': '#332510',
  '#FFF5F5': '#2B1418',
  '#FED7D7': '#3B181E',
  '#EBF8FF': '#12263A',
  '#08776F': '#0D9488',
  '#1A202C': '#1E293B',
};

const BORDER_MAP: Record<string, string> = {
  '#EDF2F7': '#1E293B',
  '#F7FAFC': '#1E293B',
  '#F1F5F9': '#1E293B',
  '#E2E8F0': '#2D3B4E',
  '#CBD5E0': '#334155',
  '#B2DFDB': '#1F5450',
  '#9AE6B4': '#1F5A47',
  '#FBD38D': '#784912',
  '#FEB2B2': '#7F1D1D',
  '#FED7D7': '#7F1D1D',
  '#08776F': '#14B8A6',
};

const TEXT_MAP: Record<string, string> = {
  '#1A202C': '#F1F5F9',
  '#111827': '#F1F5F9',
  '#000': '#F1F5F9',
  '#000000': '#F1F5F9',
  '#2D3748': '#E2E8F0',
  '#333': '#E2E8F0',
  '#333333': '#E2E8F0',
  '#4A5568': '#CBD5E1',
  '#666': '#CBD5E1',
  '#666666': '#CBD5E1',
  '#718096': '#94A3B8',
  '#888': '#94A3B8',
  '#888888': '#94A3B8',
  '#A0AEC0': '#64748B',
  '#999': '#64748B',
  '#999999': '#64748B',
  '#08776F': '#2DD4BF',
  '#22543D': '#6EE7B7',
  '#276749': '#6EE7B7',
  '#2F855A': '#34D399',
  '#7B341E': '#FDE68A',
  '#9C4221': '#FCD34D',
  '#975A16': '#FCD34D',
  '#B7791F': '#FBBF24',
  '#C05621': '#FBBF24',
  '#C53030': '#FCA5A5',
  '#E53E3E': '#FCA5A5',
  '#2B6CB0': '#93C5FD',
};

function mapColor(value: any, table: Record<string, string>): any {
  if (typeof value !== 'string') return value;
  const key = value.trim().toUpperCase();
  return table[key] ?? value;
}

function adaptStyleObject(style: any): any {
  if (!style || typeof style !== 'object' || Array.isArray(style)) return style;
  let changed = false;
  const next: Record<string, any> = { ...style };
  for (const [k, v] of Object.entries(style)) {
    if (k === 'backgroundColor') {
      const mapped = mapColor(v, BG_MAP);
      if (mapped !== v) {
        next[k] = mapped;
        changed = true;
      }
    } else if (
      k === 'borderColor' ||
      k === 'borderTopColor' ||
      k === 'borderBottomColor' ||
      k === 'borderLeftColor' ||
      k === 'borderRightColor'
    ) {
      const mapped = mapColor(v, BORDER_MAP);
      if (mapped !== v) {
        next[k] = mapped;
        changed = true;
      }
    } else if (k === 'color') {
      const mapped = mapColor(v, TEXT_MAP);
      if (mapped !== v) {
        next[k] = mapped;
        changed = true;
      }
    }
  }
  return changed ? next : style;
}

export function adaptStylesForDark<T extends Record<string, any>>(
  baseStyles: T,
  excludeKeys: string[] = []
): T {
  const excluded = new Set(excludeKeys);
  const out: Record<string, any> = {};
  for (const key of Object.keys(baseStyles)) {
    out[key] = excluded.has(key) ? baseStyles[key] : adaptStyleObject(baseStyles[key]);
  }
  return out as T;
}

const STORAGE_KEY = '@aniel_theme_mode';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  isDark: false,
  colors: LIGHT_COLORS,
  setMode: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!mounted) return;
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  function setMode(next: ThemeMode) {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }

  function toggleTheme() {
    setMode(isDark ? 'light' : 'dark');
  }

  const value = useMemo(
    () => ({ mode, isDark, colors, setMode, toggleTheme }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, isDark, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemedStyles<T extends Record<string, any>>(
  baseStyles: T,
  excludeKeys?: string[]
): T {
  const { isDark } = useTheme();
  return useMemo(
    () => (isDark ? adaptStylesForDark(baseStyles, excludeKeys) : baseStyles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDark, baseStyles]
  );
}
