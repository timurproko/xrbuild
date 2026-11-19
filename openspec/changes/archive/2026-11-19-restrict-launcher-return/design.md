## Context

Launchers and apps meet on three kinds of origin today: the same origin (published launcher and apps), loopback
development servers on different ports or host names (`127.0.0.1` and `localhost`), and the native host, which serves
its launcher at `https://app.local` and may open published apps on another origin.

## Decision

`appLaunchContext` returns a context only when the return address's origin is one of:

1. the origin of the page being launched;
2. a loopback host (`127.0.0.1`, `localhost`, `::1`) over `http:`;
3. exactly `https://app.local`, which only the native host serves.

Anything else yields `null`, so the return control is not created and Escape does nothing, as for a direct launch.

## Alternatives

- Same origin only: breaks the native host and loopback development flows.
- An allowlist passed by the host: more moving parts, and no current launcher needs an origin outside the three above.
  It can be added later without changing this rule.

## Risks

A launcher published on a different public origin than its apps loses its return control. No such launcher exists.
