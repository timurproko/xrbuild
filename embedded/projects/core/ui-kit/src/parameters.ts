import type { ComponentLibrary } from '@xr-build/sdk';
import { uiKitThemeChoices } from '../../../../../packages/ui-kit/src/theme-choices.ts';

/** The serializable manifest declaration is checked against this typed public contract. */
export const componentLibrary = {
  parameters: { theme: { type: 'choice', label: 'Theme', options: uiKitThemeChoices, default: 'default' } },
} as const satisfies ComponentLibrary;
