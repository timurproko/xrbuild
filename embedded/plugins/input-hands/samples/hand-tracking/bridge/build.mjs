// Explicit optional native bridge build. Never starts a camera or consumes private prebuilt files.
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {prepareMarkers} from './prepare-markers.mjs';
import {sensorDependency} from './sensor-dependency.mjs';
import {statePaths,userPath,plainPath} from '../state-paths.mjs';
import {sourceSha256,stageRuntime} from './runtime.mjs';
const options=statePaths(),core=options.core,root=path.dirname(fileURLToPath(import.meta.url));
const dependency=await sensorDependency(options);
const {findCmake,visualStudioGenerator}=await import(pathToFileURL(path.join(core,'packages/control-panel/src/host-build.ts')).href);
const cmake=findCmake();if(!cmake)throw new Error('Install the native C++ build workload and CMake');
const build=userPath(options,'cacheRoot',`bridge/b-${(await sourceSha256()).slice(0,16)}`,true);await fs.mkdir(build,{recursive:true});
const lock=userPath(options,'cacheRoot','bridge/build.lock',true),owner=await fs.open(lock,'wx');
const run=(exe,args)=>execFileSync(exe,args,{cwd:build,stdio:'inherit',windowsHide:true});
try{const markerSource=await prepareMarkers(cmake,options),p=value=>value.replaceAll('\\','/');
  run(cmake,['-S',root,'-B',build,'-G',visualStudioGenerator(cmake),'-A','x64',`-DMARKER_SOURCE=${p(markerSource)}`,`-DSENSOR_INCLUDE=${p(dependency.include)}`,`-DSENSOR_LIBRARY=${p(dependency.library)}`,`-DSENSOR_RUNTIME=${p(dependency.runtime)}`,`-DSENSOR_CPP_HEADER=${p(dependency.cppHeader)}`,`-DSENSOR_GEOMETRY_HEADER=${p(dependency.geometryHeader)}`,`-DXRB_CORE_THIRD_PARTY=${p(path.join(core,'third_party'))}`]);
  run(cmake,['--build',build,'--config','Release']);
  // Self-tests exercise framing/geometry/marker fixtures, never enumerate/open a camera.
  run(path.join(path.dirname(cmake),'ctest.exe'),['--test-dir',build,'-C','Release','--output-on-failure']);
  if(process.argv.includes('--stage-runtime'))await stageRuntime(path.join(build,'Release'),options,dependency);
}finally{plainPath(lock);await owner.close();await fs.unlink(lock);}
