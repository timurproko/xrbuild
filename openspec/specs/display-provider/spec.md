# display-provider Specification

## Purpose
Defines how a 3D display or a plain desktop window presents the app and supplies the viewer's eyes, so the core and
the page render for any display through one contract.

## Requirements
### Requirement: Display geometry
A display provider SHALL report the physical panel size in metres, the per-eye resolution, the monitor area the app
window must cover, and whether it can show stereo. The host SHALL size the page and window from this report.

#### Scenario: Page sized for the display
- **WHEN** a display provider reports a per-eye resolution of 3840 x 2160 and stereo support
- **THEN** in 3D the page is 7680 x 2160 CSS pixels and the window covers the reported monitor area

### Requirement: Eye poses in the panel frame
A display provider SHALL supply both eye positions in the panel frame on request each frame and SHALL mark them stale
when its tracker has no current pose. Displays without eye tracking SHALL supply a fixed nominal viewer.

#### Scenario: Viewer lost
- **WHEN** the display's eye tracker loses the viewer
- **THEN** the page keeps the last eye positions, marked stale

#### Scenario: Desktop display
- **WHEN** the app runs in the built-in desktop display
- **THEN** the page receives the nominal viewer 0.6 m in front of the panel centre, never stale

### Requirement: Frame presentation format
A display provider SHALL declare the frame layout it accepts (side by side or mono). The host SHALL render the page in
that layout and present it full-screen on the monitor the provider names; the provider turns it into the displayed
image.

#### Scenario: Side-by-side display
- **WHEN** a display declares side-by-side stereo
- **THEN** the left eye's image is in the left half of each presented frame and the right eye's in the right half

### Requirement: Run-time stereo switch
A display provider that can switch SHALL change between 3D and 2D while the app runs, on request from the page or the
control panel, and the host SHALL confirm the active view to the page after the switch. `--view=2d` SHALL start a
stereo display in 2D.

#### Scenario: Switch to 2D
- **WHEN** the page asks for 2D on a switchable display
- **THEN** the display shows the mono page as a plain 2D monitor would and the page receives a view message with stereo off

#### Scenario: Display cannot switch
- **WHEN** the page asks for 2D on a display that reports it cannot switch
- **THEN** the view stays unchanged and the page receives a view message with `switchable` false

### Requirement: Clean display exit
A display provider SHALL own its shutdown sequence, and the host SHALL give it the time it needs on every exit path
that is not a forced kill, so the display is left ready for the next app.

#### Scenario: 3D display left in 2D
- **WHEN** a host running a 3D display plugin receives `WM_CLOSE`, a platform `exit`, or the page quits
- **THEN** the plugin runs its exit sequence and the display is back in 2D after the host exits

### Requirement: Built-in desktop display
The core SHALL include a `desktop` display: a window on the primary monitor (or full screen on a chosen monitor),
mono, with the nominal viewer, which needs no device and no third-party runtime.

#### Scenario: Development without hardware
- **WHEN** a developer runs an app on a laptop with `--display=desktop`
- **THEN** the app runs in a window with no 3D display, no camera and no third-party software installed
