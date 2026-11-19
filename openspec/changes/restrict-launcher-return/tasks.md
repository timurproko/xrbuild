## 1. Return address is limited to trusted launcher origins

- [x] 1.1 `appLaunchContext` rejects a return address whose origin is not the page origin, a loopback HTTP origin or `https://app.local`
- [ ] 1.2 Tests cover the accepted origins and a foreign origin that yields no return control and no Escape return
