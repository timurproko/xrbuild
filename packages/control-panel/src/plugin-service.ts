import type { ResolvedPlugin } from './extension-catalog.ts';
import { readUserPluginConfig, type UserPluginConfig } from './plugin-config.ts';

/** A notice for every open panel page (shown as a toast). Actions can only open panel links. */
export interface PanelToast { title: string; message?: string; tone?: 'info' | 'ok' | 'warn' | 'err'; id?: string; actions?: { label: string; href: string }[] }
let notifier: ((toast: PanelToast) => void) | null = null;
/** The running panel registers how toasts reach its pages. */
export function setPanelNotifier(fn: ((toast: PanelToast) => void) | null): void { notifier = fn; }
/** Validates and sends a toast; malformed toasts are dropped. */
export function notifyPanel(toast: PanelToast): void {
  if (!notifier || !toast || typeof toast.title !== 'string' || !toast.title.trim()) return;
  const tone = ['info', 'ok', 'warn', 'err'].includes(toast.tone ?? '') ? toast.tone : 'info';
  const actions = (Array.isArray(toast.actions) ? toast.actions : []).filter(a => a && typeof a.label === 'string' && typeof a.href === 'string' && a.href.startsWith('/')).slice(0, 2);
  notifier({ title: toast.title.slice(0, 120), ...(typeof toast.message === 'string' ? { message: toast.message.slice(0, 400) } : {}), tone,
    ...(typeof toast.id === 'string' ? { id: toast.id.slice(0, 80) } : {}), actions });
}

/** Factories receive the owning source and selected writable workspace, not process-global environment state. */
export interface PluginServiceContext {
  core?: string;
  workspace: string;
  plugin: ResolvedPlugin;
  config: UserPluginConfig | null;
  /** Completed installed public workspace, or null for packaged/source-only services. */
  runtimeRoot: string | null;
  /** Shows a toast on every open panel page, titled with the plugin's name unless the toast names itself. */
  toast(toast: PanelToast): void;
}
export async function pluginServiceContext(plugin: ResolvedPlugin, workspace: string, core?: string, runtimeRoot: string | null = null): Promise<PluginServiceContext> {
  return { core, workspace, toast: toast => notifyPanel({ ...toast, title: toast?.title || plugin.meta.title || plugin.id }), plugin: runtimeRoot && plugin.origin === 'bundled' ? { ...plugin, installRoot: runtimeRoot } : plugin, runtimeRoot, config: plugin.meta.config === undefined ? null : await readUserPluginConfig(workspace, plugin.id, plugin.meta.config, { create: false }) };
}
