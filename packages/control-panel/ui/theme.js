// Loaded before styles so a saved appearance never flashes the opposite palette.
(() => {
  const root = document.documentElement, key = 'panel.theme';
  const normalize = value => ['light', 'dark'].includes(value) ? value : 'system';
  const apply = value => {
    const theme = normalize(value);
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    window.dispatchEvent(new Event('xrb-theme-change'));
  };
  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  apply(saved);
  window.xrbTheme = Object.freeze({
    get: () => normalize(root.dataset.theme),
    set: value => {
      const theme = normalize(value);
      try {
        if (theme === 'system') localStorage.removeItem(key);
        else localStorage.setItem(key, theme);
      } catch {}
      apply(theme);
    },
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
