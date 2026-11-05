import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { play, setMuted, setVolume, Glide, pitchOf } from '../src/sound.ts';
import { playUiSound, setUiSoundMuted, setUiSoundVolume, UiSoundGlide, uiSoundPitch } from '@xr-build/sdk';

test('UI library and return control use one feedback engine and volume/mute state', async () => {
  assert.equal(play, playUiSound);
  assert.equal(setMuted, setUiSoundMuted);
  assert.equal(setVolume, setUiSoundVolume);
  assert.equal(Glide, UiSoundGlide);
  assert.equal(pitchOf, uiSoundPitch);
  const [control, dialog] = await Promise.all([
    readFile(new URL('../../sdk/src/return-control.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dialog.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(control, /import \{ play as playFeedback \} from '\.\/ui-sound\.ts'/);
  assert.match(control, /playFeedback\('off'\)/);
  assert.match(dialog, /play\('off'\)/);
  assert.doesNotMatch(control, /new AudioContext|createOscillator/);
});
