// Compact result text is separate from the detailed (full revision) job output.
import type { RepoOutcome } from './update.ts';
import type { FollowupStep } from './update-followup.ts';

const oneLine = (text: string, max = 220) => {
  const value = text.replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};
export const updateRepoLabel = (repo: RepoOutcome) => repo.roles.map(role => role === 'core' ? 'Core' : 'Workspace').join('/');

export function compactUpdateResult(repositories: RepoOutcome[], steps: FollowupStep[], restartRequired: boolean) {
  const refused = repositories.filter(repo => repo.state === 'failed');
  const pending = steps.filter(step => step.state === 'failed' || step.state === 'deferred');
  const changed = repositories.some(repo => repo.state === 'updated');
  let title = restartRequired ? 'Updated, restart needed' : changed ? 'Updated' : 'Already up to date';
  if (refused.length) {
    const successful = repositories.find(repo => repo.state === 'updated');
    title = successful && refused.length === 1
      ? `${updateRepoLabel(successful)} updated; ${updateRepoLabel(refused[0]!).toLowerCase()} needs attention` : 'Update needs attention';
  } else if (pending.length) title = changed ? 'Updated; preparation needs attention' : 'Update needs attention';
  const repositoryLines = repositories.map(repo => {
    const revision = repo.state === 'up-to-date' ? 'already up to date' : `${repo.from?.slice(0, 7) ?? 'unknown'} → ${repo.to?.slice(0, 7) ?? 'unknown'}`;
    const reason = repo.state === 'failed' ? `; ${oneLine((repo.error ?? 'needs attention').replace(/^(?:Check|Fetch|LFS|Pull|Dependencies|Rebuild):\s*(?:Core|Workspace):\s*/i, '').split(';')[0]!)}` : '';
    const kept = repo.retained?.length ? `; kept local ${oneLine(repo.retained.slice(0, 2).join(', '), 95)}${repo.retained.length > 2 ? ', …' : ''} (upstream defaults skipped)` : '';
    return `${updateRepoLabel(repo)}: ${revision}${reason}${kept}.`;
  });
  const actions: string[] = [];
  if (refused.length) actions.push('Resolve repository issues and retry Update');
  if (pending.length) actions.push(`Pending: ${oneLine([...new Set(pending.map(step => step.label))].join(', '), 85)}${refused.length ? '' : '; retry Update'}`);
  if (repositories.some(repo => repo.retained?.length)) actions.push('Inspect defaults: git show REV:PATH; explicitly adopt reviewed values (guidance in View job)');
  if (restartRequired) actions.push('Restart to load updated code');
  const nextAction = actions.length ? `${actions.join('; ')}.` : '';
  const summary = [...repositoryLines, ...(nextAction ? [nextAction] : [])].join('\n');
  return { title, repositoryLines, nextAction, summary };
}
