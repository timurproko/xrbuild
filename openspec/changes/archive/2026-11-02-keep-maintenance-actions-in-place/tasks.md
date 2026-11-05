# Tasks

- [x] Route current restart through the hidden WScript launcher instead of directly creating the Node console process; verify arguments, environment, route and detached lifecycle remain unchanged.
- [x] Extend restart regression coverage and run a real alternate-port restart; verify the replacement process has a new PID and no terminal application is requested by either launcher layer.
- [x] Intercept Rebuild in shared tool navigation, start it without confirmation and show live job progress over the active registered tool route.
- [x] Update navigation regressions and run focused/full Control Panel tests plus strict OpenSpec and name validation.
