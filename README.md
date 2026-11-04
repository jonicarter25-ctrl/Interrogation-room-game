# Interrogation Room

A detective game that runs as a single published page on claude.ai. Each case is written fresh as a sealed truth file; the suspects are played by Claude from private briefs derived from it; a referee checks every answer against the truth so lies stay consistent and nobody reveals what they could not know.

Play it: https://claude.ai/artifact/WYKDxApK6Mm8rEuYFTnVRA (private until shared from the page's Share menu).

## How a case works

1. **Truth file.** One call writes the night minute by minute: victim, cast with assigned parts, killer, optional accomplice, motive, method, physical evidence, five forensic results, a red herring and a solution path. A deterministic audit checks it (every suspect accounted for, the murder inside the alibi gap, every report filled) and makes at most one repair call.
2. **Briefs.** A second call derives a private brief per suspect: true movements, what they know and how, what they cannot know, their secret, the lies they will tell with the evidence that cracks each, an honest mistake for the unreliable witness, tells, a pressure profile and an opening line.
3. **Questioning.** Each question is an actor call (in character, streamed) followed by a referee call that corrects leaks and inconsistencies, labels each claim true / lie / mistaken / evasion, and sets the pressure change. Tone (gentle, direct, hard) and presented evidence feed both.
4. **Pressure.** Composed, uneasy, rattled, shut down, or demanding counsel, by each suspect's break points and style. Counsel costs clock time and brings them back guarded.
5. **Time budget.** Questions cost five minutes; forensic reports cost 25 to 90; counsel costs 20 to 45 depending on the setting.
6. **Evidence board.** Pin trimmed quotes, scene items, reports and notes; place them on the night's timeline; link pairs as contradicting or supporting; review the links side by side.
7. **Accusation.** Killer, accomplice where the case allows one, motive, method and cited pins. Names are scored deterministically; motive, method and evidence are graded by a reviewing-officer call.
8. **Reveal.** The true night with the player's pins laid over it, every lie in the order it was told with caught / cited / admitted badges, the full transcript with lies underlined, each suspect's secret, and the solution path.

## Settings and difficulty

Three settings: 1920s country house, 1947 noir docks, 1983 Antarctic research station. Each has its own era, speech, forensic reports, night window, clock start and counsel mechanic.

Difficulty presets (Inspector, Chief Inspector, Scotland Yard) or custom dials: suspect count 3 to 6, liars besides the killer 0 to 3, accomplice on or off, unreliable witness on or off, time budget 4, 6 or 8 hours.

Hand-written training cases, one per setting, open instantly and are the same for everyone.

## Casebook and sharing

Finished cases are kept in the browser and, for a signed-in viewer, synced to their private slice of the artifact's database. A scrambled case code can be pasted by anyone to play the same sealed night. Finished cases can also be shared to a gallery inside the page, with play counts and best scores.

## Repository

- `index.html` is the whole game: a `<title>`, a `<style>`, and one inline script. It is authored for the claude.ai artifact skeleton, so it has no doctype, html, head or body tags of its own.
- Runtime capabilities declared at publish: `sample` (asking Claude), `db` and `user` (casebook sync, gallery, profile names).
- Colours are tokens on `:root` with light and dark values; the page is phone-first.

## Development

There is no build step. Publish `index.html` with the Artifact tool. A mocked-Claude Playwright harness exists in the development session's scratch space; it drives the full flow at phone and desktop widths with canned truth, briefs, actor, referee and scorer responses.
