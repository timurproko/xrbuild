# Design

## Silent restart

`windowsHide` does not reliably prevent every visible transition when a detached console-subsystem `node.exe` is created directly. Windows Script Host is a GUI-subsystem launcher and its `Run` method accepts window style `0`, which starts the replacement command hidden.

`silentRestartInvocation()` therefore invokes `wscript.exe` with `restart-silent.vbs`, the working directory, Node executable and filtered server arguments. The child remains detached with ignored standard streams and inherited environment. The script quotes every argument and starts Node hidden without waiting.

## In-place rebuild

The shared navigation already intercepts Restart and calls the panel endpoint while retaining the current route. Rebuild will use the same boundary: the menu click is consumed on the active registered tool, a shared progress dialog opens, and `POST /api/host/rebuild` starts immediately because choosing the Rebuild menu item is the explicit user action.

The shared helper polls the bounded jobs API for the returned job ID, renders the latest output, and changes the dialog to success or failure without navigating. Control Panel can retain its richer activity integration while managed tools use the framework-neutral helper. The old maintenance URL remains a safe fallback, but consuming it starts rebuild directly rather than presenting a second confirmation.

## Verification

Tests require the WScript command, script path, working directory, Node executable, filtered arguments and hidden detached options. Navigation regression coverage requires tool Rebuild to be intercepted beside Restart, use the rebuild endpoint, poll job state and avoid the confirmation path. A real alternate-port restart must return with a different process ID, focused/full Control Panel tests must remain green, and final visual acceptance confirms neither restart nor rebuild leaves the active route or flashes terminal UI.
