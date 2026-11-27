# Tasks

## 1. Panel maintenance and restart

- [x] 1.1 Show short restart, rebuild and update labels with a distinct update colour and a visible Update menu dot; keep full reasons in tooltips.
- [x] 1.2 Keep progress dialog logs at one fixed height and refuse Restart while Rebuild or Update runs.
- [x] 1.3 Treat requests refused or unreachable during a restart as transient, without error dialogs, Retry or a Failed status.

## 2. Shared controls

- [x] 2.1 Give inputs, steppers, dropdowns, slider thumbs and swatches one field hover line; centre icon buttons in small toolbars; let elements opt out of hover hints.
- [x] 2.2 Add the themed colour popover with right-click copy and paste, count multi-select choices, open dropdowns inside a fullscreen element, and list hand-mesh plugins as post-processing.

## 3. Hands layout and viewer

- [x] 3.1 Move setup into a Setup tab beside Transform, Display and Log, render tabs, Start and status from the first paint, and remove viewer centre text and hover hints from viewer controls.
- [x] 3.2 Add the endless grid, corner axis widget, resolution-sized monitor frame, centre object with pick-up and rotation, direct mouse controls, and physical hand placement relative to the frame.

## 4. Hands settings

- [x] 4.1 Add Transform and Display presets with save and delete, the Display multi-select, live slider application, the Log tab and the installed-tracker provider list.
- [x] 4.2 Move post-processing into a Post-process tab of layers chosen from an Add layer multi-select, with Install for plugins that need prerequisites.
- [x] 4.3 Make the side panel resizable with a splitter and collapse tabs that do not fit into a more menu.

## 5. Post-processing layers and setup

- [x] 5.1 Give each layer card a live status badge, an on/off switch, Install or Retry in its header, a view-only mesh color and brightness, and log its states under the plugin name.
- [x] 5.2 Run a plugin's own prerequisite setup as a cancellable job with one shared progress contract and declared install kinds such as a GPU runtime.
- [x] 5.3 Add the viewer Display menu for the skeleton and the active mesh layer.

## 6. Hand mesh delivery

- [x] 6.1 Call the browser fetch correctly in the SDK mesh client, answer private-network preflights, and log the viewer's mesh connection.
- [x] 6.2 Keep the mesh between slow results and over single bad tracking frames instead of flickering.

## 7. Shared toasts

- [x] 7.1 Add toasts that pages, core and plugins raise, and show recoverable Hands errors as toasts with their actions.
