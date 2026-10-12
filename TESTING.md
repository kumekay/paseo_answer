# Verification record

## Automated checks

Validated locally against Paseo 0.11.0-beta.3 (SDK packages 0.11.2) and the host Pi SDK 1.0.0:

- **53 tests passed** across eight suites, including the optional installed-host checks.
- `npm run typecheck` passed.
- `npm audit` reports advisories only in transitive dev dependencies (for example `braces`, `sprintf-js`); none ship with the plugin. The separately installed Pi runtime is outside that audit.
- Both plugin entries compiled from a clean source copy **without node_modules**.
- The plugin reloaded successfully on the running daemon without restarting it.

The tests exercise the agreed public boundaries:

| Boundary | Coverage |
| --- | --- |
| Daemon API | Explicit model configuration, persistence, completed-iteration extraction, stale draft removal, revision checks, input validation, review and submission guards |
| Pi adapter | Explicit model lookup, extraction schema and decoding, availability errors, failure/timeout handling; no model fallback |
| Paseo gateway | Assistant-only text, history pagination, latest-user boundary, failed iterations, stable draft identity after history reload |
| Form | Choices and text, navigation, skip, review, edit and Send; compact and wide layouts |
| Session | First-use model choice, searchable model changes, host-isolated caches, ordered autosave, save-before-send, unsaved errors, obsolete-draft removal without new extraction |
| Contributions | Composer Answer button, client-only slash command, real protocol page-size validation and directory pagination |
| Installed host | Pi ESM loading and clean-source Paseo compilation |

Implementation used incremental red→green slices. Additional regression failures were reproduced before fixing them: Paseo's 200-entry page limit, missing buttons past the first directory page, absent model-change controls, cross-host model-cache reuse, misleading save confirmation, failed-iteration extraction, orphan assistant text, and draft invalidation after a timeline epoch change.

Installed Paseo compiler modules emit missing-source-map warnings during the optional checks. The checks still pass.

## Browser smoke checks

Used the installed Paseo web client against the local daemon through a temporary loopback-only test host. Daemon authentication, origin policy, credentials, and running user agents were not changed.

Verified:

- Answer appears in the conversation composer.
- A wide viewport opens a dialog; a 390 × 844 viewport opens a bottom sheet.
- The first-use picker requires an explicit model choice and supports search.
- `/answer`, submitted through the mobile composer Send button, opens the same picker without creating an agent prompt.
- The test conversation still had zero timeline entries afterward.
- The owned test agent was archived and the temporary browser/test host removed.

## Not verified live

No extraction model was selected for the user, and no paid model call was made. A real extraction and reviewed submission still need a smoke test after the user chooses their host model. The full form behavior is covered by automated interface tests, not a live model run.

Mobile presentation was checked in a browser viewport, **not on a physical iOS or Android device**. Native keyboard and accessibility behavior still need device validation. GitHub CI has been added but has not run remotely.
