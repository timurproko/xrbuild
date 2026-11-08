const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The launcher card a publisher records with a deployment: the same contract the panel's preview list carries. */
export function validCard(card) {
  return !!card && typeof card === 'object'
    && typeof card.name === 'string' && !!card.name.trim()
    && typeof card.description === 'string'
    && !!card.icon && typeof card.icon === 'object' && typeof card.icon.default === 'boolean' && typeof card.icon.model === 'boolean'
    && typeof card.icon.color === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(card.icon.color);
}

function assertString(value, message) {
  if (typeof value !== 'string' || !value) throw new Error(message);
  return value;
}

export function titleFromSlug(slug) {
  return slug.split('-').map((word) => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ');
}

export function normalizeInventory(value) {
  if (value?.version !== 1 || !Array.isArray(value.publications)) throw new Error('The publication inventory has an unsupported format.');
  const seenIds = new Set();
  const seenSlugs = new Set();
  const publications = value.publications.map((item) => {
    const id = assertString(item?.id, 'A publication has no ID.');
    const slug = item?.slug;
    if (typeof slug !== 'string') throw new Error('A publication has no route.');
    if (slug && !SLUG.test(slug)) throw new Error(`The publication route "${slug}" is invalid.`);
    if (seenIds.has(id) || seenSlugs.has(slug)) throw new Error('The publication inventory contains duplicate entries.');
    if (!Number.isFinite(item.publishedMs)) throw new Error(`The publication "${slug}" has no publish date.`);
    seenIds.add(id);
    seenSlugs.add(slug);
    return { id, slug, publishedMs: item.publishedMs, ...(validCard(item.card) ? { card: item.card } : {}) };
  });
  return publications.sort((a, b) => b.publishedMs - a.publishedMs || a.slug.localeCompare(b.slug));
}
