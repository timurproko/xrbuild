// The Jobs list and progress dialogs share one clipboard interaction and log source.
export async function readJobLog(origin, job, fallback = '') {
  if (!Number.isSafeInteger(job?.id) || job.id < 1) return job?.lines?.length ? job.lines.join('\n') : fallback;
  const response = await fetch(new URL(`/api/jobs/${job.id}`, origin), {cache: 'no-store'});
  if (!response.ok) throw new Error('Could not read the complete job log.');
  const current = await response.json();
  return current.lines?.length ? current.lines.join('\n') : fallback;
}
export function installJobLogCopy(button, read) {
  let timer;
  const copy = async event => {
    event.preventDefault();
    button.disabled = true;clearTimeout(timer);
    try {
      const text = await read();
      await button.ownerDocument.defaultView.navigator.clipboard.writeText(text);
      button.dataset.tooltip = 'Copied to clipboard.';
    } catch { button.dataset.tooltip = 'Could not copy log. Try again.'; }
    finally {
      button.disabled = false;
      button.setAttribute('aria-description', button.dataset.tooltip);
      timer = setTimeout(() => {delete button.dataset.tooltip;button.removeAttribute('aria-description');}, 2000);
    }
  };
  button.addEventListener('click', copy);
  return () => {clearTimeout(timer);button.removeEventListener('click', copy);};
}
