/** Catalog namespaces identify ownership, not public publication routes. */
export function defaultProjectSlug(projectId) {
  return String(projectId ?? '').replace(/^(?:bundled|workspace):/, '').split('/').at(-1) ?? '';
}

/** Installed services, not a manifest's stale publisher selection or configuration status. */
export function hasProjectPublishers(project) {
  return !!(project.publicationStandalone ?? project.publication)?.publishers?.length;
}

/** Keep unchanged project identity mounted while workflow fields/actions are replaced. */
export function renderProjectHero(root, markup, projectId) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const next = template.content.firstElementChild;
  const current = root.querySelector(':scope > .project-hero');
  const oldHeader = current?.querySelector(':scope > .project-hero-top');
  const newHeader = next.querySelector(':scope > .project-hero-top');
  const identity = header => {
    const copy = header.cloneNode(true);
    copy.querySelector('.hero-actions')?.remove();
    return copy.innerHTML;
  };
  if (current?.dataset.projectId === projectId && oldHeader && newHeader && identity(oldHeader) === identity(newHeader)) {
    oldHeader.querySelector('.hero-actions').replaceWith(newHeader.querySelector('.hero-actions'));
    for (const child of [...current.childNodes]) if (child !== oldHeader) child.remove();
    for (const child of [...next.childNodes]) {
      if (child === newHeader) break;
      current.insertBefore(child, oldHeader);
    }
    while (newHeader.nextSibling) current.append(newHeader.nextSibling);
  } else {
    next.dataset.projectId = projectId;
    root.replaceChildren(next);
  }
}
