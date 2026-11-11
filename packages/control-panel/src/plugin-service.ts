import type { ResolvedPlugin } from './extension-catalog.ts';
import { readUserPluginConfig, type UserPluginConfig } from './plugin-config.ts';

/** Factories receive the owning source and selected writable workspace, not process-global environment state. */
export interface PluginServiceContext {
  core?: string;
  workspace: string;
  plugin: ResolvedPlugin;
  config: UserPluginConfig | null;
  /** Completed installed public workspace, or null for packaged/source-only services. */
  runtimeRoot: string | null;
}
export async function pluginServiceContext(plugin: ResolvedPlugin, workspace: string, core?: string, runtimeRoot: string | null = null): Promise<PluginServiceContext> {
  return { core, workspace, plugin: runtimeRoot && plugin.origin === 'bundled' ? { ...plugin, installRoot: runtimeRoot } : plugin, runtimeRoot, config: plugin.meta.config === undefined ? null : await readUserPluginConfig(workspace, plugin.id, plugin.meta.config, { create: false }) };
}
