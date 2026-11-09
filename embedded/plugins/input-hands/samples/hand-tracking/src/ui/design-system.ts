import {enhanceSelects,installDropdowns,installIcons,installNumberSteppers,installTabs,installTooltips,setPageIdentity} from '@xr-build/design-system';
/** Mount shared interactive controls while native selects remain the application state source. */
export function setupDesignSystem():()=>void{
  setPageIdentity('Hands','👋',getComputedStyle(document.documentElement).getPropertyValue('--xrb-glyph-filter').trim());
  const disposeIcons=installIcons(document);
  const disposeTooltips=installTooltips(document);
  const disposeTabs=installTabs(document);
  const disposeDropdowns=installDropdowns(document);
  const disposeSelects=enhanceSelects(document);
  const disposeSteppers=installNumberSteppers(document);
  return()=>{disposeSteppers();disposeSelects();disposeDropdowns();disposeTabs();disposeTooltips();disposeIcons();};
}
