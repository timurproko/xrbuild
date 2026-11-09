import {execFileSync} from 'node:child_process';
import {runtimePaths,verifyRuntime} from './runtime.mjs';
await verifyRuntime();
const {executable}=runtimePaths();
for(const argument of ['--self-test','--geometry-vectors','--marker-self-test'])execFileSync(executable,[argument],{stdio:'inherit',windowsHide:true,timeout:30000});
console.log('Hand Tracking runtime verified.');
