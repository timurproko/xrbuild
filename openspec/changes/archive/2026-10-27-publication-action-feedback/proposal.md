# Proposal

## Why

Publication currently uses a full Publish button but a small trash icon for Unpublish, so the primary action changes position and visual weight after deployment. Publication jobs also lack immediate progress feedback in that action, making a background publish or unpublish look idle even though the panel remains available.

## What Changes

- Keep Publish and Unpublish in the same full-size action-button slot and use the state-appropriate label.
- Show each publisher's actual HTTPS hostname in the selector instead of an environment-style label, while continuing to save its stable publisher name.
- Hide the package-history divider and empty placeholder until at least one package matches the selected platform and package identity.
- Update target-specific controls immediately on every Platform tab click, including rapid switches while a previous save is running; serialize persistence and keep only the latest queued choice. If another settings save lands first, automatically rebase the selected Platform onto current settings instead of showing a settings-conflict dialog; restore authoritative state only when saving truly fails.
- Allow publisher changes to select another deployment destination without moving or removing the current publisher's route, remember a slug per provider, and immediately show that provider's own status/action so each deployment can be selected again for status or Unpublish. If another background save updates the manifest first, automatically rebase and retry Publisher or Slug edits instead of showing a settings-conflict dialog. Pin the latest publication selection while it saves or runs a publish/unpublish job and ignore superseded project refresh responses so the dropdown and Slug cannot jump back to older values. Publication completion SHALL update only the provider the user selected and never choose another provider automatically. Require route-move confirmation only for slug changes on a live or uncertain selected publisher.
- While a publish or unpublish job is running, disable the publication action, Publisher and Slug controls; replace the button's visible text with a centered spinner while retaining its normal dimensions and an accessible operation name. After publication, keep Publisher selectable for another destination but lock the selected published Slug until it is unpublished, without stale validation errors. Top-align publication labels, inputs and the action when an error adds field height.
- Keep publication work in the existing background job system without opening a blocking progress dialog; project navigation, settings and activity views remain usable.
- Show every live publisher deployment as its own Build-card block, using the publisher hostname as the title and the complete deployed URL below it. On successful publish or unpublish completion, update the button immediately and animate the affected block expanding in or collapsing away while publisher status catches up, preserving existing confirmation and error behavior.

## Capabilities

### Modified Capabilities

- `dev-control-panel`: make the publication action visually consistent and expose non-blocking in-button job progress.

## Impact

- `packages/control-panel`: publication job summaries, publisher hostname presentation, Build-card rendering and styles, live job-event rendering, and focused UI/job tests.
- No publisher plugin contract, publication route, build input or HTTP authorization behavior changes.
