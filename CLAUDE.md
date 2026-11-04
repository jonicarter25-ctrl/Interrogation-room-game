# Interrogation Room: notes for Claude sessions

The whole game is `index.html`. It is authored for the claude.ai Artifact skeleton: no doctype, html, head or body tags; `<title>` and `<meta>` first, then `<style>`, the three container divs, a `training-data` JSON script block, and one inline `<script>` IIFE. Keep that order.

## Publishing

Publish `index.html` with the Artifact tool to the existing URL in `README.md`. Capabilities to declare on a publish that changes them: `{"sample": {}, "db": {}, "user": {"scopes": ["profile"]}}`. Omit `capabilities` on an ordinary redeploy to keep them.

## Where things are in the script

- `SETTINGS`, `PRESETS`, `castPlan`, `normDials`: settings and difficulty.
- `truthPrompt`, `briefsPrompt`, `actorInput`, `refereeInput`, `scorePrompt`, `repairPrompt`: every prompt the page sends. They embed the JSON shapes the page parses; change the prompt and the normaliser together.
- `normalizeTruth`, `normalizeBriefs`, `auditTruth`: tolerant parsing of model output.
- `newGame`, `applyState`, `askSuspect`, `waitForCounsel`, `requestForensic`, `submitAccusation`: game logic.
- `initCloud` and the `cloud` object: db-backed casebook sync, shared gallery, profile names. Everything degrades to local-only when `claude.use('db')` resolves null.
- `render` and the `view*` functions: all UI is string-templated; every control uses `data-act` and is handled in `handleAct`.
- `TRAINING` is populated from the `training-data` block; the source files are `training/*.json`.

## Testing

`test/harness.js` is a Playwright script with a mocked `window.claude` (sample, db, user). Run `node test/harness.js` from the repo root; it drives the full flow at phone and desktop widths and writes screenshots to `test/shots/`. Chromium and Playwright are preinstalled in the cloud session. Syntax-check the script after edits:

```
sed -n '/^<script>/,/^<\/script>/p' index.html | sed '1d;$d' > /tmp/app.js && node --check /tmp/app.js
```

## Conventions

- Colours only through the tokens on `:root` (light and dark blocks). No literal colours in component rules.
- Phone first: nothing wider than 390px, side gutter via the `.gutter` class.
- Never retry a Claude call from a loop. One repair call after the truth audit is the only automatic follow-up.
- Commit on the working branch and push; do not open pull requests unless asked.
