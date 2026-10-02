# Paseo Answer

Answer an agent’s questions through a form instead of composing a long reply.
Works with any Paseo conversation provider. Question extraction uses **Pi on the daemon host**, independently of the conversation’s model.

- **Answer** button in the composer; `/answer` also works.
- Desktop dialog and mobile bottom sheet. No new tab.
- One question at a time, with Previous, Next, Skip, and review.
- Single-choice, multiple-choice, and optional text alongside choices.
- Host-saved drafts for continuing on another device.
- One reviewed user message, sent only when you press **Send answers**.

## Requirements

- Paseo **0.9.1** with plugins enabled. This version targets Paseo 0.9.x.
- Node.js **22.19.0 or newer** on the daemon host.
- The npm installation of `@earendil-works/pi-coding-agent` **1.0.0 or newer**, with authentication configured for the same OS user as the daemon.
- At least one authenticated Pi model. Standalone Pi binaries without the SDK are not supported.

The plugin uses the host’s Pi installation; it does not install another copy or copy your credentials.

## Install

From this checkout:

```sh
paseo plugin install .
```

After publishing the repository, installation from Git is also supported:

```sh
paseo plugin install https://github.com/kumekay/paseo_answer.git
```

No compilation or npm installation is required for the plugin itself. Paseo compiles the TypeScript entry points and supplies the client libraries.

To pick up local changes:

```sh
paseo plugin reload answer
```

## Use

1. Open a conversation and press **Answer**, or enter `/answer` without attachments.
2. On the first use on each host, search for and select an extraction model. **There is no default, automatic selection, or fallback.**
3. If the agent is still working, leave the form open. Extraction waits for it to finish.
4. Answer, add context, or skip each question.
5. Review the answers. Press **Send answers** to submit one normal user message.

Extraction includes all assistant text after the latest user input, across history pages. It excludes reasoning and tool messages. The model is instructed to keep only questions directed at you and not invent choices.

You can change the host’s extraction model from the form. Existing drafts keep their questions; the new model applies to future extraction.

Closing the dialog does not submit. The form saves edits to the host. Wait for **Draft saved on this host** before switching devices. If two devices edit the same draft, the second conflicting save is rejected rather than overwriting the first. Close and reopen the form to load the host’s version; unsaved edits are not merged.

A newer user input invalidates the previous draft. Questions cannot be edited in this version.

## Host configuration

Pi is located through the daemon’s `PATH`. If Paseo cannot find it, set **`PASEO_ANSWER_PI_DIR`** in the daemon environment to the directory containing Pi’s `package.json` (not the executable or the credential directory).

Model choice and drafts live in:

```text
$PASEO_HOME/plugin-data/answer
```

Without `PASEO_HOME`, the default is `~/.paseo/plugin-data/answer`. Set **`PASEO_ANSWER_DATA_DIR`** to choose another directory. Settings are host-local, not synced between daemons.

After changing Pi authentication or provider configuration, reload the plugin. The daemon must have access to that Pi configuration and to the selected provider’s network endpoint.

## Privacy and limits

This is a trusted local plugin with Node.js access on the daemon host. It sends the assistant text in the selected iteration to your chosen extraction provider. Drafts are local JSON files; new directories and files use restricted permissions. Pi manages credentials and OAuth refresh.

Model output is validated before a draft is saved, but extraction quality still depends on the chosen model. Authentication, model availability, and output errors are shown rather than silently switching models.

Submission checks the current conversation and draft revision before sending. Paseo does not provide an atomic compare-and-send operation: another client can advance the conversation in the small gap between validation and submission. A lost send acknowledgment can also leave delivery uncertain; check the conversation before retrying.

## Development

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm audit
```

Tests cover the daemon API, Pi adapter, composer/slash contributions, and user-facing form. External model calls and Paseo connections are replaced at those boundaries. Automated tests do not make paid model calls. `npm audit` covers this project's packages, not the separately installed Pi runtime; keep Pi updated.

Optional installed-host checks:

```sh
PASEO_COMPILER=/path/to/paseo/packages/server/dist/server/server/plugins/compiler.js npm test -- tests/host.test.ts
```

These checks compile against that Paseo installation and load the host Pi SDK. They do not run an extraction. See [TESTING.md](TESTING.md) for the verification record.
