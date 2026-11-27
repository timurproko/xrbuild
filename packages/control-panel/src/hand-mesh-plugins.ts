import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { containedModule, pluginEnabled, resolvePluginCatalog, type PluginCatalog } from './extension-catalog.ts';
import { resolveMeshRuntime, type MeshRuntimeOptions } from './hand-mesh-runtime.ts';
import type { HandMeshDeclaration } from './hand-mesh-contract.ts';

export interface HandMeshPlugin {
  owner: string;
  id: string;
  label: string;
  available: boolean;
  reason: string;
  /** Enabled and selected, but its declared runtime is not installed yet. */
  needsSetup: boolean;
  declaration: HandMeshDeclaration;
  /** Private launch path, not portable output or a browser-facing metadata field. */
  program: string | null;
  /** Server-private launch-time revalidation, never serialized to a consumer. */
  launch?: (signal?: AbortSignal) => Promise<{ program: string; cwd: string }>;
}
export interface HandMeshRegistry { plugins: HandMeshPlugin[]; revision: string; problems: string[] }

/** Only catalog metadata and file stats; never binary queries, imports, setup or capture. */
export async function handMeshRegistry(catalog: PluginCatalog, options: Pick<MeshRuntimeOptions, 'userRoot'> = {}): Promise<HandMeshRegistry> {
  const plugins: HandMeshPlugin[] = [], stamps: unknown[] = [];
  for (const plugin of catalog.plugins) {
    const declaration = plugin.meta.handMesh;
    if (!declaration) continue;
    let program: string | null = null, stamp = '', problem: string | null = null;
    try {
      program = (await resolveMeshRuntime({ owner: plugin.key, sourceRoot: plugin.sourceRoot, declaration }, options)).program;
      const stat = await fs.stat(program);
      stamp = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    } catch (error) {
      // Bind unavailable-state changes too, without exposing private paths in the reason.
      stamp = error instanceof Error ? error.message : 'Invalid program';
      problem = declaration.runtime ? 'Mesh runtime is missing, unsafe or needs explicit preparation' : 'Mesh sidecar program is missing or not a regular contained file';
    }
    const enabled = pluginEnabled(plugin, catalog.prefs), selected = catalog.selected.some(p => p.key === plugin.key);
    const reason = !enabled ? 'Plugin is disabled' : !selected ? 'Plugin origin is ambiguous or not selected'
      : problem ?? 'Not started; checked when a desktop app runs';
    plugins.push({ owner: plugin.key, id: declaration.id, label: declaration.label,
      available: enabled && selected && !problem, reason, needsSetup: enabled && selected && !!problem && !!declaration.runtime, declaration, program: enabled && selected && !problem ? program : null,
      ...(enabled && selected && !problem ? { launch: async (signal?: AbortSignal) => {
        const resolved = await resolveMeshRuntime({ owner: plugin.key, sourceRoot: plugin.sourceRoot, declaration }, { ...options, verify: true, signal });
        const stat = await fs.stat(resolved.program);
        if (stamp !== `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`) throw new Error('Mesh program changed since discovery');
        return resolved;
      } } : {}) });
    stamps.push([plugin.key, plugin.sourceRoot, declaration, stamp]);
  }
  const revision = createHash('sha256').update(JSON.stringify([plugins, stamps, catalog.problems])).digest('hex');
  return { plugins, revision, problems: [...catalog.problems] };
}
export async function discoverHandMeshPlugins(core: string, workspace: string): Promise<HandMeshRegistry> {
  return handMeshRegistry(await resolvePluginCatalog(workspace, core, true));
}
