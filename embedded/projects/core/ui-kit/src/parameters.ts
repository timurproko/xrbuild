import type { ComponentLibrary } from '@xr-build/sdk';
import { uiKitTheme } from './theme.ts';
import { uiKitThemeChoices } from '@xr-build/ui-kit/theme-choices';

/** The serializable manifest declaration is checked against this typed public contract. */
export const componentLibrary = {
  parameters: { theme: { type: 'choice', label: 'Theme', options: uiKitThemeChoices, default: uiKitTheme.defaultTheme } },
} as const satisfies ComponentLibrary;
