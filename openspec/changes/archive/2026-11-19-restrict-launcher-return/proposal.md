## Why

An app opened with `xrb-launch=1` shows the return control and, when it is pressed or Escape is used, navigates to
whatever HTTP(S) address `xrb-return` holds. A crafted link can therefore send a user from a trusted app to any site.

## What Changes

- The SDK accepts a launcher return address only when it is the page's own origin, a loopback HTTP address, or the
  native host's app origin. Any other address is treated as a direct launch: no return control and no Escape return.
- `appLaunchUrl` keeps building links for any launcher; only the reading side decides.

## Impact

- `packages/sdk/src/launch-context.ts` (`appLaunchContext`), used by the return control and the Escape handler.
- Tests in `packages/sdk/test/return-overlay.test.ts`.
- New capability spec `app-launch-return`.
