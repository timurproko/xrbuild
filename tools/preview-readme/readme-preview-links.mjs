const fragmentLink = /\bhref="(#[^"]*)"/gu;

/**
 * Repoints fragment-only links at the generated preview document instead of the source-directory
 * base used to resolve README images. Other rendered destinations remain untouched.
 */
export function rebasePreviewFragmentLinks(renderedMarkdown, previewHref) {
  return renderedMarkdown.replace(fragmentLink, (_attribute, fragment) => {
    const destination = new URL(fragment, previewHref).href;
    return `href="${destination}"`;
  });
}
