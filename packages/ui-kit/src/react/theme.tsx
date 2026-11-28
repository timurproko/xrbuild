import { createContext, useContext, type ReactNode } from 'react';
import { resolveUiKitTheme, type UiKitTheme, type UiKitThemeSelection } from '../visual-theme.ts';

const ThemeContext = createContext<UiKitTheme | undefined>(undefined);
export interface UiKitThemeProviderProps {
  theme?: UiKitThemeSelection;
  /** App-declared fallback; never masks an inherited provider choice. */
  defaultTheme?: UiKitThemeSelection;
  children?: ReactNode;
}
export function UiKitThemeProvider({ theme, defaultTheme, children }: UiKitThemeProviderProps) {
  const inherited = useContext(ThemeContext);
  const selected = theme === undefined ? inherited ?? (defaultTheme === undefined ? undefined : resolveUiKitTheme(defaultTheme)) : resolveUiKitTheme(theme);
  return <ThemeContext value={selected}>{children}</ThemeContext>;
}
/** Per-control override, inherited selection, then the library's unchanged Default. */
export function useUiKitTheme(override?: UiKitThemeSelection): UiKitTheme {
  const inherited = useContext(ThemeContext);
  return override === undefined ? inherited ?? resolveUiKitTheme() : resolveUiKitTheme(override);
}
