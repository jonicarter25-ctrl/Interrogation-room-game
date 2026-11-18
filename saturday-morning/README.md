# Saturday Morning

A programming desk for a fictional cartoon channel. One Saturday, 8:00 to 10:00 a.m., eight shows in the library, Batman locked at 9:00, and two lineups (A and B) drawn on one shared clock so you can see where the mornings differ.

Open it: https://claude.ai/artifact/6YGCMcmDF5sDJWyYmikJeS (private until shared from the page's Share menu). `index.html` also opens straight from disk.

This folder is separate from the Interrogation Room game in the repository root and shares nothing with it.

## How it works

- **One clock, two lineups.** A sits over B on wide screens and beside B on a phone. A striped marker between them flags every stretch where they differ, and a list underneath names each one.
- **Placing.** Pick a time (click open airtime, or use the stepper), then press Place on a library card. Dragging a card or a placed show works too, with a mouse or pen.
- **Rules.** Shows may touch but not overlap, must stay inside 8:00 to 10:00, and air once per lineup. Batman cannot be moved or removed. A rejected placement leaves the lineup alone, says exactly what clashed, and offers the nearest time that works.
- **Undo.** Each lineup keeps its own history. Undo and Redo sit in the toolbar, and Ctrl/Cmd+Z works.
- **Fill open airtime.** Searches every way of dropping unused shows into the gaps and proposes the one that fills the most minutes, without moving anything already placed. It previews on the timeline, explains any gap it cannot fill, and applies as a single edit.
- **Saving.** Both lineups and their undo history are kept in the browser. On claude.ai they are also copied to the viewer's private slice of the artifact's database, so they follow you to another device.

## Files

- `index.html` is the whole page: styles, markup, one inline script. It is written for the claude.ai artifact skeleton, so it has no doctype, html, head or body tags.
- `test/verify.js` drives the page with Playwright at desktop and phone widths: `node saturday-morning/test/verify.js` (add `--fonts` to load the web fonts for the screenshots it writes to `test/shots/`).

Publish with the Artifact tool to the URL above. Capabilities: `{"db": {}, "user": {}}`; omit them on an ordinary redeploy.
