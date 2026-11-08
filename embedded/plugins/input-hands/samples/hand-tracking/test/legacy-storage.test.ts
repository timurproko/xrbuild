import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyStorage,migratedStorage,type StorageLike} from '../src/ui/legacy-storage.ts';

function memory(initial:Record<string,string>={}):StorageLike&{values:Map<string,string>} {
  const values=new Map(Object.entries(initial));
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};
}

test('legacy Hand Tracking Input settings migrate once to canonical keys',()=>{
  const cases:[string,string][]=[
    ['handtracking.capture-preferences.v1',legacyStorage.capture],
    ['handtracking.fusion-calibrations.v1',legacyStorage.calibration],
    ['handtracking.recording-limit.v2',legacyStorage.recordingLimit],
    ['handtracking.recording-auto-capture.v1',legacyStorage.recordingAutoCapture],
    ['handtracking.tab.controls.v1',legacyStorage.tab('controls')],
  ];
  for(const [current,old] of cases){const store=memory({[old]:'saved'});assert.equal(migratedStorage(store,current,old),'saved');assert.equal(store.getItem(current),'saved');assert.equal(store.getItem(old),null);}
});

test('canonical settings win and legacy data is not regenerated',()=>{
  const store=memory({'handtracking.capture-preferences.v1':'current',[legacyStorage.capture]:'old'});
  assert.equal(migratedStorage(store,'handtracking.capture-preferences.v1',legacyStorage.capture),'current');
  assert.equal(store.getItem(legacyStorage.capture),'old');
  assert.equal([...store.values.keys()].some(key=>key.startsWith('handlab.')),true);
});
