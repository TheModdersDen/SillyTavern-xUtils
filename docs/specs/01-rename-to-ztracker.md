# Spec: Rename extension to xUtils

Status: Completed
Last updated: 2026-01-21

## Goal
Rename the extension to **xUtils** in a way that is clear to users and does not accidentally break existing stored tracker data.

## Scope
- Rename user-facing extension name in UI and metadata.
- Rename internal extension keys used for:
  - `extensionSettings` storage
  - per-message `message.extra` tracker payload
  - per-chat `chatMetadata`
  - global prompt interceptor function name
- Ensure template loading paths remain valid after rename.

## Open questions to clarify first
1. Migration policy:
   - Do we want a non-breaking migration from the legacy keys to new keys (`xUtils`), or is this a breaking fork?
2. Folder name / install path:
   - What will the extension folder be named in SillyTavern after installation? (This affects template paths like `third-party/<folder>`.)
3. Branding:
   - Is the display name exactly `xUtils` (lowercase z) or `XUtils`?
4. Backward compatibility window:
   - If we migrate, do we keep reading the legacy key for a while, or do a one-time copy and then drop support?

## Decisions (chosen)
- Chosen display name: `xUtils`
- Chosen internal key (settings/extras/metadata): `xUtils`
- Chosen extension folder name (for templates): `SillyTavern-xUtils`
- Migration approach: none (fresh start)
- Legacy read-compat window: none (no backward compatibility before first xUtils release)

## Clarifications checklist (answer these before coding)
- [x] Confirm display name: `xUtils`
- [x] Confirm internal key: `xUtils`
- [x] Confirm template folder name used by ST installer: `SillyTavern-xUtils`
- [x] Confirm migration: no
- [x] Confirm legacy read-compat window: none

## Implementation plan (high level)
- Update `manifest.json` fields (`display_name`, `version`, `homePage`, `generate_interceptor`).
- Update internal constants (extension key, extension name).
- Update any hard-coded template base paths.
- Do not include any migration/back-compat logic for legacy tracker data.

## Acceptance criteria
- Shows as `xUtils` in Manage Extensions.
- Tracker generation, rendering, edit/delete/regenerate still works.
- Existing chats created before the rename are not supported (fresh start).
- No console errors related to template loading or missing interceptor.

## Tasks checklist
- [x] Decide display name and internal key
- [x] Decide migration approach
- [x] Implement rename
- [x] Ensure no migration/back-compat code remains
- [x] Update docs (README + screenshots if needed)
- [skippped] Add/update tests covering migration behavior *(explicitly deferred; test coverage will be added in a later spec)*
 
## Notes / consequences
- Old stored data (message extras / settings / chat metadata) created under the previous name will be ignored by xUtils.
- This simplifies the code but is a breaking change for existing users of the legacy tracker build.

## Notes
- `generate_interceptor` must be a global function name (assigned to `globalThis`).
- Chat metadata references must be retrieved from `SillyTavern.getContext().chatMetadata` at time of use (don’t store references long-term).
