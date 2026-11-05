import assert from'node:assert/strict';
import test from'node:test';
import {exposedProviderInputs,runtimeProviderInputs} from'../ui/provider-choice.js';

const providers=[
  {role:'input',name:'direct-input'},
  {role:'input',name:'canonical-input',runtimeName:'legacy'},
];

test('provider choices expose canonical IDs while preserving runtime IDs in project manifests',()=>{
  assert.deepEqual(exposedProviderInputs(['mouse','legacy','direct-input'],providers),['mouse','canonical-input','direct-input']);
  assert.deepEqual(runtimeProviderInputs(['mouse','canonical-input','direct-input'],providers),['mouse','legacy','direct-input']);
  assert.deepEqual(runtimeProviderInputs(exposedProviderInputs(['legacy'],providers),providers),['legacy']);
});
