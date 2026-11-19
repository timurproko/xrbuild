# Headset plugin

- Stable packager ID `headset`, target `webxr`; one canonical publisher URL, never another published site.
- Factories consume explicit service context. No global package/tool lookup, PATH mutation, signing fallback or eager tools/keys/network on discovery.
- Source stays read-only; configuration, existing signing identities, locks, receipts and build generations are user-owned.
- Optional toolchain is explicitly provisioned, inventoried and license-reviewed, never downloaded/distributed implicitly. Preserve invalid/partial/foreign state and existing package versions.
- Run `packager/test/*.test.mjs` through the frozen embedded lane. Tests use synthetic disposable state only; do not sign, publish or run hardware as validation.
