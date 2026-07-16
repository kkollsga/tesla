# tesla — Claude Code Conventions

A streaming + board-game launcher for the Tesla browser. Vanilla HTML/CSS/JS,
**no build step, no bundler, no dependencies** (except the Font Awesome CDN).
Served live from `main` by GitHub Pages at <https://kkollsga.github.io/tesla>.

## The two facts that shape everything here

1. **`main` is production.** Pages serves it directly — a push to `main` is a
   deploy to a live public site, immediately, with no staging and no rollback
   button. Never work the project directly on `main`; ship via the `release`
   skill.
2. **There is no safety net.** No tests, no CI, no linter, no types. Nothing
   will tell you that you broke a game. Verification is something you *do*, not
   something that runs. See "Verifying a change".

## Architecture

- **`index.html`** (~1010 lines) — the entire launcher, self-contained: ~333
  lines CSS, ~324 markup, ~341 JS. Holds the `GAMES` registry, the Tesla
  navigation logic (`navigateToService`, `isTeslaDistribution`), and the
  localStorage favourite.
- **`games/*.html`** (9 games) — each standalone, most with their CSS *and* logic
  inline. `games/assets/` holds hive's insect SVGs; `icons/` holds the launcher's
  service icons.
- **Shared modules** — only four, in three different architectures:

  | Module | Shape | DOM refs |
  |---|---|---|
  | `puzzle-generator.js`, `puzzle-curator.js` | pure classes, headless | 0 |
  | `hive.js` (4015 lines) | 2 classes (`Hex`, `MovementSystem`) + ~90 globals | 87 |
  | `chess-logic.js`, `damme-logic.js` | flat procedural globals | 40 / 26 |

  The `-logic` suffix is a lie on the latter two — they own rendering, drag/drop,
  and timers. The genuinely logic-only files are the `puzzle-*` pair (and
  they're nonogram-specific, not generic; sudoku has its own inline generator).

- **No module system.** Every file is a classic script with no exports; globals
  resolve by `<script>` load order. `gameState`, `dragState`, `initGame`,
  `makeMove` and ~8 more are declared identically in chess, damme, and hive —
  harmless only because one page loads one game. **Never add `defer`, `async`, or
  `type="module"`** to a script tag: `class` declarations don't attach to
  `window`, so nonogram's `PuzzleGenerator`/`PuzzleCurator` would silently
  vanish.

## Verifying a change

In this order, every time. Skipping the last step is how a broken game ships.

1. **`node --check <file>`** — the cheap syntax gate for standalone `.js`.
   ```bash
   for f in games/*.js dev-docs/checks/scripts/*.js; do node --check "$f" || echo "FAIL: $f"; done
   ```
2. **Harnesses** for the pure logic —
   `node dev-docs/checks/scripts/puzzle-generator-check.js` (exit 0 = green).
   See `dev-docs/checks/README.md`. Only `puzzle-generator.js` /
   `puzzle-curator.js` are headless-testable; everything else touches
   `document` at load. **Don't build a DOM shim to fake it** — verify in a
   browser instead.
3. **Drive it in a browser.** Serve it — never `file://`:
   ```bash
   python3 -m http.server 8000    # then http://localhost:8000
   ```
   `file://` breaks hive, which does `fetch('assets/${insectType}.svg')`
   (`hive.js:2730`). A syntax check proves the file parses; it proves nothing
   about whether the game works.
4. **Click through from the launcher**, not just the game's direct URL — the
   game-link wiring is exactly what half-lands.

**Local testing is currently broken for 8 of 9 games** — every game tile but
nonogram hard-codes `https://kkollsga.github.io/...`, so clicking one in a local
checkout navigates to *production*. Until that's fixed
(`dev-docs/plans/launcher-navigation.md`), open the game's local URL directly and
know you're not testing the real path.

## The game authoring standard

`dev-docs/designs/game-design.md` (2156 lines) is the standard for building a
game here. **Read it before game work — but read
`dev-docs/plans/standard-vs-reality.md` first.** The doc is aspirational: only 1
of 9 games implements its mandated `GameLogic`/`GameRenderer`/`InputHandler`
trio, `data-theme` appears in zero files, and the doc contradicts itself on the
exit URL. Treat a rule as the target state for *new* work, not a description of
the app — and don't "fix" a game to comply with the half of the doc that's
under review.

## Adding a game — the four-place checklist

Adding a game means editing `index.html` in three places plus the README. Miss
one and it half-works:

1. `index.html` `<style>` — the `.game-option.<name>-option` colour block.
2. `index.html` game grid — the `<a class="game-option">` tile (+ its
   `favorite-indicator` span).
3. `index.html` `GAMES` object — `name`, `url`, `icon`.
4. `README.md` — the games list, the Project Structure tree, and the count.

The standard documents this at `game-design.md` L1311-1375. Step 4 is the one
that gets skipped — the README currently documents 8 games and there are 9.

## Code health

Each pass through a file should leave it more compartmentalised than you found
it.

- **No bugs left behind.** When you hit a pre-existing bug — even one unrelated
  to your task — fix it in the same change, or if it's genuinely out of scope,
  surface it explicitly (file it via `add-todo`) rather than silently stepping
  over it. Before "fixing", confirm it's actually a bug and not deliberate:
  read the surrounding code, and distinguish a real defect from an intentional
  choice.
- **Say what you verified.** With no test suite, most findings here are
  inferences from reading. If you ran something, say so. If you're reasoning
  from source, don't dress it up as measured.
- **Don't duplicate chrome.** The navbar/modal CSS is already copy-pasted across
  all 9 games (~4770 lines of CSS live inside game `<style>` blocks) and has
  visibly drifted. Adding a tenth copy makes it worse — see
  `dev-docs/plans/game-chrome-consolidation.md`.
- Factor a function when it grows past ~80 lines or handles 3+ unrelated
  concerns.
- Fixing a bug — scan for the *class* of bug. The reported symptom is rarely the
  only instance.

## Working style

- **Offload, don't print.** Write long output (diffs, logs, dumps) to
  `dev-docs/temp/` and report the path instead of printing it into the
  conversation. Layout: `dev-docs/README.md`.
- **Keep `todos.md` lean** — one backlink line per thread; detail lives in the
  linked `plans/` doc.
- Keep responses under ~400 tokens for skill-driven flows.

## Skill mandates

- **Large feature or non-trivial refactor → the `phased-plan` skill.** Not
  standard plan mode. It gates investigation → plan → branch → per-phase
  verify/commit.
- **Capturing work → `add-todo`.** It owns todo-entry shape; don't hand-edit
  `todos.md` into a detail dump.
- **Shipping → `release`.** It's the only path to a `main` push.
- **Tidying → `dev-docs-cleanup`.** Run it before a new phased-plan.
- **Inbox → `read-inbox`** (receive) / **`notify`** (send).

## Inbox hygiene

`inbox/unread/` (at the repo root) holds incoming feedback/bug/coordination
notes (named `YYYY-MM-DD-from-<sender>-<topic>.md`); `inbox/read/` is the
archive. The inbox is gitignored (`/inbox/`) — local working state, not
committed. Channel map: `inbox/README.md`.

**When a message has been actioned, move it from `inbox/unread/` to
`inbox/read/`.** "Actioned" means the work shipped, the bug was verified fixed,
or it's a no-action acknowledgement — not merely read. `unread/` must reflect
only what still needs doing, so a stale "you have unread mail" never hides a
genuinely open item among resolved ones. Append a one-line
`## Status (tesla, <date>): …` footer to substantive work-items before moving.

**Route to the party who can act.** A note only belongs in another project's
inbox if it carries an *actionable* task for them. If there's nothing for them
to do, don't file it. A local inbox note is a file, not a post — it isn't
covered by the ban below.

## Commits & pushing

Commit format: `type: short description` (`feat`, `fix`, `docs`, `refactor`,
`chore`). There is no CHANGELOG and no version — **git history is the only
record this project has**, so a message like "fix" or "update" throws away the
only thing that would have explained the change later. Several already do.

**Pushing `main` requires explicit, in-the-moment approval — it deploys a live
public site.** Default is *don't push*. The user runs `git push` manually unless
they tell you, *in the same turn you'd run it*, to push for them ("push it",
"go ahead and push"). Approval is one-shot: it covers exactly that one `git
push` and does not carry to any later commit or branch. Conversational phrasing
from earlier in the session ("ship it", "looks good") **does not** carry over.

Invoking the **`release`** skill is itself the authorization for the one `main`
push that run produces — that's the sanctioned path. Branch pushes deploy
nothing and are routine.

## Public posts — BANNED by default. No exceptions without verbatim-text approval.

**Publishing anything under the user's identity is prohibited.** This is a hard
ban, not a "prefer to ask" — the default action for any outward-facing
publication is *do not do it*.

**"Post" is defined broadly.** GitHub issues, comments, and comment EDITS;
reactions; issue/PR state changes; discussions; PR reviews on external repos;
emails; anything that leaves this machine attributed to the user — via any
channel (`gh`, raw API, MCP tool, or otherwise).

**The only lifting procedure:**
1. The exact, final text is shown to the user in the conversation.
2. The user replies with an unambiguous affirmative about *that* draft ("post
   it", "yes"), in the turn(s) immediately following it. If any other work
   intervenes, re-show and re-ask.
3. The approval covers exactly one publication event.

**What is NEVER approval:** plan or design approvals; "do all" / "go ahead"
delegation of a work pipeline; skill invocations; checklist items; standing
instructions from earlier sessions. **Subagents are never authorized to post,
full stop** — agent briefs touching external services must state read-only.

Routine dev flow in this repo (branch pushes, the `release` skill's `main` push)
is governed by "Commits & pushing", not this section.

When in doubt there is no doubt: it's banned.
