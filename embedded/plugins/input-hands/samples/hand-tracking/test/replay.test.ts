import test from 'node:test';
import assert from 'node:assert/strict';
import { Playback, ReplayImages } from '../src/live/recording/replay.ts';
import { clip, settle } from './recording-helpers.ts';
import { deferred, bitmap } from './live-helpers.ts';
test('playback uses recorded gaps, pause/seek/speed/step without interpolating observations', () => {
  const p=new Playback([0,33,250]);p.play(10000);p.tick(10040);assert.equal(p.index,1);assert.equal(p.positionMs,40);
  p.pause(10050);p.tick(50000);assert.equal(p.positionMs,50);
  p.seek(200,50000);assert.equal(p.index,1);p.step(1);assert.equal(p.index,2);assert.equal(p.positionMs,250);
  p.play(60000);assert.equal(p.index,0);p.setSpeed(2,60000);p.tick(60100);assert.equal(p.index,1);assert.equal(p.positionMs,200);
  p.tick(60200);assert.equal(p.index,2);assert.equal(p.playing,false);p.step(-1);assert.equal(p.positionMs,33);
  p.seek(-2,0);assert.equal(p.index,0);p.seek(99999,0);assert.equal(p.index,2);assert.throws(()=>p.seek(NaN,0));assert.throws(()=>p.setSpeed(0,0));
});
test('single-frame clip is seekable and never spins a playback clock',()=>{const p=new Playback([0]);p.play(10);assert.equal(p.playing,false);p.step(1);assert.equal(p.index,0);});
test('decoding is bounded to one in flight; newest request wins; every bitmap is closed',async()=>{
  const c=await clip(), requests:ReturnType<typeof deferred<ImageBitmap>>[]=[],shown:number[]=[];
  const images=new ReplayImages(()=>{const value=deferred<ImageBitmap>();requests.push(value);return value.promise;},index=>shown.push(index),error=>{throw error;});
  images.setClip(c);images.request(0);images.request(1);images.request(2);assert.equal(requests.length,1);
  const first=bitmap();requests[0].resolve(first.value);await settle();assert.equal(first.state.closes,1);assert.deepEqual(shown,[]);assert.equal(requests.length,2);
  const last=bitmap();requests[1].resolve(last.value);await settle();assert.deepEqual(shown,[2]);assert.equal(last.state.closes,1);assert.equal(images.snapshot().inFlight,0);
  images.invalidate();images.request(2);assert.equal(requests.length,3);images.setClip(null);
  const stale=bitmap();requests[2].resolve(stale.value);await settle();assert.equal(stale.state.closes,1);assert.deepEqual(shown,[2]);
});
test('decoder failure is surfaced once, not retried every animation frame',async()=>{
  const c=await clip();let errors=0,decodes=0;
  const images=new ReplayImages(async()=>{decodes++;throw new Error('corrupt PNG');},()=>{},()=>errors++);images.setClip(c);images.request(0);await settle();
  images.request(0);await settle();assert.equal(errors,1);assert.equal(decodes,1);
});
