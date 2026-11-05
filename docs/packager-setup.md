# Optional packager setup

A workspace packager can offer a guided toolchain installation without adding platform-specific commands to the public core. The packager module already exports `name`, `target`, `identityFields`, `validate` and `build`. Add **both** optional hooks when the platform needs tools that are not already installed:

```ts
async setupStatus() {
  // Read-only: do not download tools, accept terms, create keys, or change the project.
  return { state: 'setup-required', reason: 'Install the package toolchain', termsUrl: 'https://example.test/terms' };
  // Or { state: 'ready' }, or { state: 'unavailable', reason: '...' }.
},
async setup({ log, acceptTerms }) {
  // Install missing dependencies idempotently, logging progress with log('...').
  // If external terms are required, refuse when acceptTerms is false.
}
```

The panel checks status for the selected project and packager; only `ready` enables **Build package**. `setup-required` replaces it with **Setup**. The separate `/api/projects/<id>/package-setup` action runs setup as a background job. After setup, the server checks status again and marks the job successful only if tools are ready. The dialog then closes; the developer starts **Build package** with a separate click. Failed jobs retain logs and allow retry. A packager without these hooks is unchanged.

Keep status fast, read-only and accurate after restart. Setup should resume safely after interrupted downloads, avoid touching existing signing keys, never print secrets to job logs or errors, and use the user's explicit acknowledgement before agreeing to external terms. A direct package-build request is also gated by the current status. Publishing a site and building its installed launcher remain independent operations. The private workspace packager owns the actual installer, signing and device validation.
