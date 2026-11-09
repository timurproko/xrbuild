// Focused synthetic-only native build using the core's selected-origin plan and user-cache receipts.
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {statePaths} from './samples/hand-tracking/state-paths.mjs';
const options=statePaths(),{core,workspace}=options,root=path.dirname(fileURLToPath(import.meta.url));
const load=name=>import(pathToFileURL(path.join(core,`packages/control-panel/src/${name}.ts`)).href);
const {findCmake,visualStudioGenerator,nativePluginPlan,resolvedPluginCmakeVars,recordPluginBuildSuccess}=await load('host-build');
const {nativeDirectory,writeNativeReceipt}=await load('plugin-artifacts');
const {buildInventory}=await load('embedded-inputs');
const cmake=findCmake();if(!cmake)throw new Error('Install the native C++ workload and CMake');
const plan=await nativePluginPlan(core,workspace);if(plan.problems.length)throw new Error(plan.problems.join('; '));
const project=plan.projects.find(p=>path.resolve(p.sourceDir)===path.resolve(root));if(!project)throw new Error('Select this plugin origin in the user workspace before building');
const plugin=project.plugin;await nativeDirectory(workspace,plugin.nativeStateRoot,true);
const lock=path.join(plugin.nativeStateRoot,'.xrb-native-build.lock'),owner=await fs.open(lock,'wx');let started=false;
const run=(exe,args)=>execFileSync(exe,args,{cwd:workspace,stdio:'inherit',windowsHide:true});
try{
  await nativeDirectory(workspace,project.buildDir,true);await nativeDirectory(workspace,project.outputDir,true);
  const before=(await buildInventory(root,true,['bin'])).fingerprint;
  await writeNativeReceipt(core,workspace,plugin.sourceRoot,plugin.nativeStateRoot,'building');started=true;
  run(cmake,['-S',root,'-B',project.buildDir,'-G',visualStudioGenerator(cmake),'-A','x64',...resolvedPluginCmakeVars(core,project)]);
  run(cmake,['--build',project.buildDir,'--config','Release']);
  run(path.join(path.dirname(cmake),'ctest.exe'),['--test-dir',project.buildDir,'-C','Release','--output-on-failure']);
  if(before!==(await buildInventory(root,true,['bin'])).fingerprint)throw new Error('Synthetic provider source changed during build');
  await recordPluginBuildSuccess(project.buildDir);await writeNativeReceipt(core,workspace,plugin.sourceRoot,plugin.nativeStateRoot,'complete');
}catch(error){if(started)await writeNativeReceipt(core,workspace,plugin.sourceRoot,plugin.nativeStateRoot,'failed');throw error;}
finally{await owner.close();await fs.unlink(lock);}
