/** Why the panel cannot start or prepare a project now, in the order users can act on them. */
export type LaunchBlockReason =
  | 'restarting' | 'restart-required' | 'plugins-changing' | 'plugins-pending' | 'cache-maintenance'
  | 'launch-preparing' | 'preview-preparing' | 'settings-saving';

export interface LaunchBlocker {
  reason: LaunchBlockReason;
  message: string;
  /** True when only restarting the panel clears the cause; the UI offers Restart. */
  restart: boolean;
}

export interface LaunchState {
  restartPending?: boolean;
  changingPlugins?: boolean;
  maintainingCache?: boolean;
  servicesPending?: boolean;
  servicesProblem?: string | null;
  servicesNeedRestart?: boolean;
  preparingNativeRun?: boolean;
  preparingPreview?: boolean;
  settingsSaving?: boolean;
}

const blocker = (reason: LaunchBlockReason, message: string, restart = false): LaunchBlocker => ({ reason, message, restart });

/** Returns the first blocking cause, or null. Each cause has its own message; none tells the user to wait in vain. */
export function launchBlocker(state: LaunchState): LaunchBlocker | null {
  if (state.restartPending) return blocker('restarting', 'The panel is restarting; try again when it reloads.');
  if (state.servicesPending && state.servicesNeedRestart)
    return blocker('restart-required', 'Plugin code or dependencies changed since the panel started. Restart the panel to use them.', true);
  if (state.changingPlugins) return blocker('plugins-changing', 'Plugin services are being updated; try again when the update finishes.');
  if (state.servicesPending) return blocker('plugins-pending', state.servicesProblem ?? 'Plugin services are awaiting refresh; try again in a moment.');
  if (state.maintainingCache) return blocker('cache-maintenance', 'Cache cleanup is running; try again when it finishes.');
  if (state.preparingNativeRun) return blocker('launch-preparing', 'Another app launch is being prepared; try again when it starts.');
  if (state.preparingPreview) return blocker('preview-preparing', 'A browser preview is being prepared; try again when it opens.');
  if (state.settingsSaving) return blocker('settings-saving', "This project's settings are being saved; try again when the save finishes.");
  return null;
}
