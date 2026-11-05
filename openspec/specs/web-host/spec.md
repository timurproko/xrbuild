# web-host Specification

## Purpose
The host (`xrb-host`) shows a web application full-screen, in 3D on a stereo display, and gives the page the viewer's eye positions and the display geometry so it can render a correct off-axis stereo pair. Display-specific work comes from the display provider; the host owns the window, the page, frame presentation, the host channel and tool output.

## Requirements

### Requirement: Display selection
With a 3D display provider, the host SHALL place a borderless full-screen window on the monitor that drives the 3D display, without user interaction. The display provider identifies that monitor.

#### Scenario: 3D display connected as secondary monitor
- **WHEN** the host starts on a machine whose 3D display is not the primary monitor
- **THEN** the app window covers exactly that display's monitor rectangle and no other monitor

#### Scenario: No 3D display connected
- **WHEN** the host starts with a 3D display provider (for example `--display=stereo-panel`) and the provider finds no device
- **THEN** the host logs the failure and exits with a non-zero code

#### Scenario: Desktop fallback
- **WHEN** the host starts with `--display=desktop`, or with `--display-fallback=desktop` and no 3D display is found
- **THEN** the host does not exit and runs windowed in 2D

### Requirement: Stereo output through the display provider
With a stereo display provider, the host SHALL open the provider's display session and present each frame as a half side-by-side image (left eye in the left half, right eye in the right half) at the panel's native resolution per eye. The provider's runtime turns it into the 3D image.

#### Scenario: Viewer sees depth
- **WHEN** a page renders a different image to each half of its canvas and a viewer is tracked
- **THEN** the viewer perceives the content in 3D on the display

#### Scenario: Display runtime missing
- **WHEN** the display provider's runtime is not installed or its session fails to start
- **THEN** the host logs the provider's error code and message and exits with a non-zero code

### Requirement: Eye pose feed
The host SHALL give the page, once per displayed frame, the latest left- and right-eye positions in metres in the panel frame: origin at the panel centre, +X right, +Y up along the panel surface, +Z toward the viewer.

#### Scenario: Viewer moves head
- **WHEN** the viewer moves their head 5 cm to the right
- **THEN** within two displayed frames the eye positions given to the page shift by about +0.05 m in X

#### Scenario: Tracking lost
- **WHEN** the display provider's eye tracker reports the pose as invalid
- **THEN** the host keeps giving the last valid eye positions and flags the pose as stale

### Requirement: Display geometry feed
The host SHALL give the page the panel's physical width and height in metres, its tilt, and the per-eye render resolution before the page's first rendered frame.

#### Scenario: Page starts
- **WHEN** the page's runtime initializes inside the host
- **THEN** the display geometry is available synchronously, without waiting for a network round trip

### Requirement: Local content origin
The host SHALL serve the packaged web app from a stable, non-`file://` origin on which ES module workers, same-origin iframes and relative asset URLs work, and the app SHALL need no network access to load.

#### Scenario: App uses a module worker and an iframe
- **WHEN** a packaged app creates a module Web Worker and reads a same-origin iframe's document
- **THEN** both operations succeed while the machine is offline

### Requirement: Clean display shutdown
The host SHALL let the display provider end its session cleanly whenever it exits for a reason it can handle (a stop command, window close, or a fatal page error), so the display is left usable by the next app.

#### Scenario: Stop then start another app
- **WHEN** the host exits after a stop command and another app using the same display provider is launched next
- **THEN** that app starts its display session successfully without a device reset

### Requirement: Render performance budget
With a reference scene, the host and page together SHALL sustain at least 55 presented frames per second on the reference rig while hand tracking runs.

#### Scenario: Reference scene under load
- **WHEN** the reference web app runs on the reference rig with hand tracking active for 5 minutes
- **THEN** the median presented frame rate is at least 55 fps and the 99th-percentile frame time is below 33 ms

### Requirement: Status stream for tools
With `--status=stdout`, the host SHALL write its channel address once at startup (`@channel <url>`) and then one `@status {json}` line per second to stdout, holding page fps, frame time, hand latency, render resolution, hand tracking rate, state and count, channel clients, running time and view. Without the option, stdout gets only log lines.

#### Scenario: Tool reads status
- **WHEN** a tool starts the host with `--status=stdout` and reads its stdout through a pipe
- **THEN** it receives the channel address once, and then a parseable status line every second while the page runs

#### Scenario: Station run
- **WHEN** the station agent starts the host without arguments
- **THEN** no status lines are written

### Requirement: No console, inherited stdout is kept
The host SHALL never open or join a console, so a console's Ctrl+C or close never ends it without its display exit. It SHALL write its output to an inherited stdout handle when one exists, such as a pipe from a tool, as well as to its log file.

#### Scenario: Started by a tool with a pipe
- **WHEN** a tool starts the host with stdout redirected to a pipe
- **THEN** every log and status line arrives in the pipe

#### Scenario: Agent console stopped
- **WHEN** the station agent runs in a console window and is stopped with Ctrl+C while the host runs
- **THEN** the host is not killed by the console event, and the 3D display returns to 2D

#### Scenario: Started by the station agent
- **WHEN** the station agent starts the installed package
- **THEN** no console or terminal window appears

### Requirement: Clean exit when the agent goes away
When the platform provider reports that its station agent is gone, the host SHALL start its clean exit at once (stereo off, display session ended, input devices released), without waiting for a stop call or a kill.

#### Scenario: Agent stops
- **WHEN** the station agent shuts down while the host runs
- **THEN** the host log shows the agent connection closed and the clean shutdown, and the 3D display returns to 2D

### Requirement: App icon
The host window SHALL use the app's icon, so it shows in the taskbar and task switcher. The icon comes from `--icon=<png>`, else `app-icon.png` next to the exe, else the built-in default icon, which is also the exe's file icon.

#### Scenario: Packaged app with an icon
- **WHEN** a package built with an icon is started by the station agent
- **THEN** the taskbar shows that icon for the app window, the same image as the package's thumbnail

#### Scenario: No icon
- **WHEN** the host starts with no `--icon` and no `app-icon.png`
- **THEN** the window shows the built-in default icon

### Requirement: Debug stream on request
Only when started with `--camera-view=on` SHALL the host ask the input provider for its labelled debug images (for example camera views with detection boxes) and publish them on the host channel, each stream keeping only its newest image. Without the option, no debug images are produced or sent.

#### Scenario: Camera view requested
- **WHEN** the host runs with `--camera-view=on` and the input provider publishes two labelled image streams
- **THEN** a channel client receives the newest image of both streams with their labels, and the page keeps running unaffected

#### Scenario: No camera view
- **WHEN** the host runs without `--camera-view=on`
- **THEN** no debug image messages are sent on the channel

#### Scenario: Cost of debug streaming
- **WHEN** the reference web app runs at 60 fps with hands on the reference rig and the camera view is on
- **THEN** the median page fps stays at least 55 and the hand tracking rate drops by no more than 10 percent

### Requirement: Clean exit on a close request
The host SHALL treat a close request (`WM_CLOSE`) sent to its window by another process the same as Esc on the 3D display: stereo off, display session ended, input devices released, exit code 0.

#### Scenario: Close from a tool
- **WHEN** a tool sends a close request to the running host's window
- **THEN** the host logs the clean shutdown, and the 3D display returns to 2D and can be used by the next host

### Requirement: 2D and 3D while the app runs
On a display provider with a switchable session, the host SHALL switch between 3D and 2D when a channel client asks (`kSetView`), without ending the session. It SHALL resize the page to one view or two eyes side by side, show black until the page has painted at the new size, and announce the view (`kView`), also to later clients.

#### Scenario: Start in 2D
- **WHEN** the host starts with `--view=2d` on a display that can switch
- **THEN** the session starts with stereo off and the page laid out as one view

#### Scenario: Status line
- **WHEN** a tool reads the host's status lines
- **THEN** they say whether the view can be switched and which view is shown

#### Scenario: Switch to 2D from the panel
- **WHEN** an app runs in 3D and the control panel asks for 2D
- **THEN** within a second the display shows the same app as a flat picture, hands keep working, and the host reports the 2D view

#### Scenario: Page asks for 3D
- **WHEN** an app started with `--view=2d` calls the SDK's `setStereo(true)`
- **THEN** the page is laid out at twice the eye width, the display shows it in 3D with head tracking, and the SDK reports the 3D view to the app

#### Scenario: No session
- **WHEN** a host whose display has no switchable session (for example `--display=desktop`) receives a view request
- **THEN** nothing changes, the host answers with a view that is not switchable, and the status line shows that the view cannot be switched

### Requirement: Managed camera projection channel

The host SHALL accept an optional bounded initial managed-camera projection, Perspective or Orthographic, defaulting
to Perspective. It SHALL publish the current projection over the host channel to the page and to clients that connect
later. A control-panel channel client SHALL be able to change that projection while the app runs, independently of the
physical 2D/3D display view. Invalid options or channel payloads SHALL NOT change the current projection.

#### Scenario: Start Desktop in 2D

- **WHEN** the panel starts the desktop host with Orthographic managed-camera projection
- **THEN** the page receives Orthographic after connecting while the desktop display remains its normal mono view

#### Scenario: Change projection live

- **WHEN** the control panel changes a running host from Perspective to Orthographic
- **THEN** the host publishes Orthographic to the current page and retains it for a page reload without restarting the host

#### Scenario: Projection does not switch the display

- **WHEN** the host receives a camera-projection change without a view request on a switchable display
- **THEN** the physical display view remains unchanged

#### Scenario: Invalid projection request

- **WHEN** a channel client sends an unsupported projection value or malformed message
- **THEN** the host keeps the previous projection and continues serving the page

### Requirement: Active page window identity

The native host SHALL follow the active main page's title and favicon after navigation. A favicon delivered by CEF
SHALL replace the window and taskbar icons without restarting the host; an unavailable or invalid favicon SHALL leave
the previous icon intact.

#### Scenario: Launcher opens an app

- **WHEN** a native launcher navigates to a destination app with its own title and favicon
- **THEN** the existing host window updates both its title and icon to the destination app

#### Scenario: Favicon cannot be decoded

- **WHEN** the active page reports an unavailable or invalid favicon
- **THEN** the host keeps its current window icon and continues rendering the page

### Requirement: Escape never automatically quits the host
The host SHALL forward Escape for app-shell navigation without invoking automatic fullscreen closure, including while no page is ready. Explicit window close and panel Stop SHALL retain graceful shutdown behavior.

#### Scenario: Direct app without an Escape handler
- **WHEN** Escape is pressed in a direct native app, with or without a usable SDK
- **THEN** the host remains open in fullscreen and windowed modes
