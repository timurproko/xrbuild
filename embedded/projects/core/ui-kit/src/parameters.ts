import type { ComponentLibrary } from '@xr-build/sdk';
import { uiKitTheme } from './theme.ts';
import { uiKitThemeChoices } from '../../../../../packages/ui-kit/src/theme-choices.ts';

/** The serializable manifest declaration is checked against this typed public contract. */
export const componentLibrary = {
  parameters: { theme: { type: 'choice', label: 'Theme', options: uiKitThemeChoices, default: uiKitTheme.defaultTheme } },
} as const satisfies ComponentLibrary;
