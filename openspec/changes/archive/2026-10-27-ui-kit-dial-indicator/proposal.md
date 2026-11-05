# Dial indicator value feedback

## Why

Dial knob rotation is eased for visual motion, but the indicator bulbs currently use that eased position too. After an input reaches its final value, the final bulb can remain temporarily unlit even though the Dial already reports the maximum value.

## What Changes

- Drive Dial indicator bulbs from the control's actual value while keeping the knob's eased rotation unchanged.
- Add a regression test that moves a Dial to its maximum and verifies the final bulb lights on the next frame.

## Impact

- `packages/ui-kit/src/dial.ts`: indicator bulb rendering.
- `packages/ui-kit/test/controls.test.ts`: focused Dial regression coverage.
- No public API or specification change (`skip_specs: true`).
