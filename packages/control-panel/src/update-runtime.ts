// Fresh child processes load the fetched install/build recipe, not modules cached by the running panel.
import path from 'node:path';
import { runProcess, type JobContext } from './jobs.ts';

export async function setupUpdatedCore(core: string, ctx: JobContext): Promise<void> {
  ctx.line('Core dependencies: pinned pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile (public core only).');
  await ctx.run(process.execPath, [path.join(core, 'tools/panel-bootstrap/update-setup.mjs')], { cwd: core });
}

/** Service preparation also loads post-pull code rather than the panel's cached modules. */
export async function rebuildUpdatedServices(core: string, workspace: string, ctx: JobContext): Promise<void> {
  await ctx.run(process.execPath, [path.join(core, 'packages/control-panel/src/update-services.ts'), `--workspace=${workspace}`], { cwd: core });
}

export async function rebuildUpdatedSources(core: string, workspace: string, ctx: JobContext, run = runProcess): Promise<string[]> {
  const args = [path.join(core, 'packages/control-panel/src/update-rebuild.ts'), `--workspace=${workspace}`];
  ctx.line(`> ${process.execPath} ${args.join(' ')}`);
  let rebuilt: string[] | null = null, invalid = false;
  const code = await run(process.execPath, args, line => {
    if (line.startsWith('XRB_UPDATE_REBUILD_RESULT ')) {
      try {
        const value: unknown = JSON.parse(line.slice('XRB_UPDATE_REBUILD_RESULT '.length));
        if (rebuilt || !Array.isArray(value) || !value.every(item => typeof item === 'string')) invalid = true;
        else rebuilt = value;
      } catch { invalid = true; }
    } else ctx.line(line);
  }, { cwd: core });
  if (code !== 0) throw new Error(`Native rebuild process exited with ${code}`);
  if (invalid || !rebuilt) throw new Error('Native rebuild did not report valid completion');
  return rebuilt;
}
