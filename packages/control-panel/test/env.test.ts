import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_PORT, EXPLICIT_WORKSPACE_PORT, panelPort, projectsDir, projectsFromArgs, REPO, shortcutWorkspace, workspaceDir, workspaceFromArgs } from '../src/env.ts';

test('XRB_HOME names the workspace', () => {
  assert.equal(workspaceDir({ XRB_HOME: 'D:/work/my-xr', USERPROFILE: 'C:/Users/u' }), path.resolve('D:/work/my-xr'));
});

test('default workspace is .xrbuild in the user folder', () => {
  assert.equal(workspaceDir({ USERPROFILE: 'C:/Users/u' }), path.join('C:/Users/u', '.xrbuild'));
});

test('auto shortcut always opens the selected user workspace or its setup flow', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-shortcut-'));
  try {
    const home = path.join(root, 'home');
    const user = path.join(home, '.xrbuild');
    const checkout = path.join(root, 'checkout');
    await fs.mkdir(path.join(checkout, '.xrbuild'), { recursive: true });
    const env = { USERPROFILE: home };
    assert.equal(workspaceDir(env), user);
    assert.equal(shortcutWorkspace(env, checkout), undefined, 'a missing user workspace opens user setup, not the checkout workspace');
    await fs.mkdir(user, { recursive: true });
    assert.equal(shortcutWorkspace(env, checkout), undefined, 'an empty user workspace opens user setup');
    const alternate = path.join(root, 'other-user');
    assert.equal(shortcutWorkspace({ ...env, XRB_HOME: alternate }, checkout), undefined, 'XRB_HOME keeps user mode before the directory exists');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('explicit workspace and project roots resolve from the launching checkout', () => {
  assert.equal(workspaceFromArgs(['--open', '--workspace=.xrbuild'], 'D:/work/task'), path.resolve('D:/work/task/.xrbuild'));
  assert.equal(projectsFromArgs(['--projects=../xrbuild.dev'], 'D:/work/task'), path.resolve('D:/work/xrbuild.dev'));
  assert.equal(workspaceFromArgs([], 'D:/work/task'), undefined);
  assert.equal(projectsFromArgs([], 'D:/work/task'), undefined);
  assert.throws(() => workspaceFromArgs(['--workspace']), /requires --workspace=<path>/);
  assert.throws(() => workspaceFromArgs(['--workspace=']), /requires a path/);
  assert.throws(() => workspaceFromArgs(['--workspace=a', '--workspace=b']), /only once/);
  assert.throws(() => projectsFromArgs(['--projects']), /requires --projects=<path>/);
  assert.throws(() => projectsFromArgs(['--projects=']), /requires a path/);
  assert.throws(() => projectsFromArgs(['--projects=a', '--projects=b']), /only once/);
});

test('XRB_PROJECTS_HOME overrides the project root and otherwise projects stay in the workspace', () => {
  assert.equal(projectsDir({ XRB_PROJECTS_HOME: 'D:/work/apps' }, 'D:/work/integrations'), path.resolve('D:/work/apps'));
  assert.equal(projectsDir({}, 'D:/work/integrations'), 'D:/work/integrations');
});

test('explicit workspaces have a separate default port; per-process overrides win', () => {
  const user = { XRB_HOME: 'D:/work/user' };
  const explicit = workspaceFromArgs(['--workspace=.xrbuild'], 'D:/work/task');
  assert.equal(panelPort(undefined, user), DEFAULT_PORT);
  assert.equal(panelPort(explicit, user), EXPLICIT_WORKSPACE_PORT);
  assert.equal(panelPort('D:/work/other', user), EXPLICIT_WORKSPACE_PORT);
  assert.equal(panelPort(undefined, user, 'D:/work/apps'), EXPLICIT_WORKSPACE_PORT);
  assert.equal(panelPort(undefined, { ...user, XRB_PANEL_PORT: '5192' }), 5192);
  assert.equal(panelPort(explicit, { ...user, XRB_PANEL_PORT: '5192' }), 5192);
  assert.equal(panelPort(explicit, { ...user, XRB_PANEL_PORT: '' }), EXPLICIT_WORKSPACE_PORT);
});

test('repository panel entry points select .xrbuild while user entry points do not', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(REPO, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['panel:repo'], /--workspace=\.xrbuild/);
  assert.doesNotMatch(pkg.scripts.panel, /--workspace=/);
  assert.match(await fs.readFile(path.join(REPO, 'start-repo.vbs'), 'utf8'), /--workspace=\.xrbuild/);
  assert.doesNotMatch(await fs.readFile(path.join(REPO, 'start.vbs'), 'utf8'), /--workspace=|--auto-workspace/);
  const auto = await fs.readFile(path.join(REPO, 'start-auto.vbs'), 'utf8');
  assert.match(auto, /shell\.CurrentDirectory = here/);
  assert.match(auto, /--open --auto-workspace/);
  assert.doesNotMatch(auto, /--workspace=|XRB_HOME/);
});

test('Start-menu installer has one checkout-relative shortcut with auto, repo and user modes', async () => {
  const script = await fs.readFile(path.join(REPO, 'tools/add-to-start.vbs'), 'utf8');
  assert.match(script, /launcher = "start-auto\.vbs"/);
  assert.match(script, /Case "--repo"\s+launcher = "start-repo\.vbs"/);
  assert.match(script, /Case "--user"\s+launcher = "start\.vbs"/);
  assert.match(script, /WScript\.Arguments\.Count > 1/);
  assert.match(script, /Case Else\s+MsgBox[\s\S]*?WScript\.Quit 1/);
  assert.match(script, /repo = fso\.GetParentFolderName\(fso\.GetParentFolderName\(WScript\.ScriptFullName\)\)/);
  assert.match(script, /lnk\.Arguments = """" & repo & "\\" & launcher & """"/);
  assert.match(script, /shell\.SpecialFolders\("Programs"\)/);
  assert.doesNotMatch(script, /XRB_HOME/);
});

test('development Start-menu installer creates a distinct checkout-relative repository shortcut', async () => {
  const script = await fs.readFile(path.join(REPO, 'tools/add-dev-to-start.vbs'), 'utf8');
  assert.match(script, /XR Build Dev\.lnk/);
  assert.match(script, /repo = fso\.GetParentFolderName\(fso\.GetParentFolderName\(WScript\.ScriptFullName\)\)/);
  assert.match(script, /lnk\.Arguments = """" & repo & "\\start-repo\.vbs" & """"/);
  assert.match(script, /lnk\.WorkingDirectory = repo/);
  assert.match(script, /lnk\.IconLocation = repo & "\\native\\host\\src\\app\.ico,0"/);
  assert.doesNotMatch(script, /XR Build\.lnk/);
  assert.doesNotMatch(script, /start(?:-auto)?\.vbs/);
});

test('repository selection follows the current checkout, not a primary checkout path', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-resolution-'));
  const primary = path.join(root, 'primary'), task = path.join(root, 'task');
  await fs.mkdir(path.join(primary, '.xrbuild'), { recursive: true });
  await fs.mkdir(path.join(task, '.xrbuild'), { recursive: true });
  await fs.writeFile(path.join(primary, '.xrbuild', 'marker'), 'primary');
  await fs.writeFile(path.join(task, '.xrbuild', 'marker'), 'task');
  const selected = workspaceFromArgs(['--workspace=.xrbuild'], task)!;
  assert.equal(await fs.readFile(path.join(selected, 'marker'), 'utf8'), 'task');
  assert.notEqual(selected, workspaceFromArgs(['--workspace=.xrbuild'], primary));
  await fs.rm(root, { recursive: true, force: true });
});
