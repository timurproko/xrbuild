/** Graphics-free metadata shared by author declarations and the theme registry. */
export const uiKitThemeChoices = [
  { value: 'default', label: 'Default' },
  { value: 'chamfer', label: 'Chamfer' },
] as const;
export type UiKitThemeId = typeof uiKitThemeChoices[number]['value'];
