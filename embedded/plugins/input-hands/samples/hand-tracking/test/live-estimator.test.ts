import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MediaPipeEstimator, activeWorkers } from '../src/live/estimator.ts';
import { DEFAULT_SETTINGS } from '../src/live/contracts.ts';
import { Port, bitmap, inference } from './live-helpers.ts';

test('estimator initialization and single-frame backpressure preserve bitmap ownership', async () => {
  const before = activeWorkers(), port = new Port(), estimator = new MediaPipeEstimator(()=>port);
  const ready = estimator.initialize('http://localhost/vendor/','hand.task',{...DEFAULT_SETTINGS});
  port.emit({ type:'ready',delegate:'CPU',fallback:null }); assert.equal((await ready).delegate,'CPU');
  await assert.rejects(estimator.initialize('http://localhost/','again',{...DEFAULT_SETTINGS}),/single-use/);
  const input = bitmap(), busy = bitmap(), output = bitmap();
  const result = estimator.estimate(input.value,100);
  await assert.rejects(estimator.estimate(busy.value,101),/busy/); assert.equal(busy.state.closes,1);
  assert.equal(port.sent.filter(message=>message.type==='frame').length,1);
  port.emit({type:'result',id:1,result:inference(),bitmap:output.value}); const processed = await result;
  assert.equal(processed.bitmap,output.value); processed.bitmap.close(); assert.equal(output.state.closes,1);
  const disposal=estimator.dispose(); port.emit({type:'disposed'}); await disposal;
  assert.equal(port.terminations,1); assert.equal(activeWorkers(),before);
});
test('dispose rejects in-flight work and closes late result bitmaps before terminating', async () => {
  const port = new Port(), estimator = new MediaPipeEstimator(()=>port);
  const ready=estimator.initialize('http://localhost/','model',{...DEFAULT_SETTINGS});port.emit({type:'ready',delegate:'GPU',fallback:null});await ready;
  const result=estimator.estimate(bitmap().value,1);const rejection=assert.rejects(result,{name:'AbortError'});
  const disposed=estimator.dispose();await rejection;
  const late=bitmap();port.emit({type:'result',id:1,result:inference(),bitmap:late.value});assert.equal(late.state.closes,1);
  port.emit({type:'disposed'});await disposed;await estimator.dispose();assert.equal(port.terminations,1);
});
test('cancelling model initialization rejects its promise and releases the worker', async () => {
  const port=new Port(),estimator=new MediaPipeEstimator(()=>port);
  const ready=estimator.initialize('http://localhost/','model',{...DEFAULT_SETTINGS});const rejection=assert.rejects(ready,{name:'AbortError'});
  const disposed=estimator.dispose();await rejection;port.emit({type:'disposed'});await disposed;assert.equal(port.terminations,1);
});
test('a worker that never acknowledges disposal is terminated within a bound', async () => {
  const before=activeWorkers(),port=new Port(),estimator=new MediaPipeEstimator(()=>port);
  await estimator.dispose();assert.equal(port.terminations,1);assert.equal(activeWorkers(),before);
});
