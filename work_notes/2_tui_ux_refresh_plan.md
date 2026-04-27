# UX/UI Refresh for `wt` TUI

## Context

The interactive picker shipped with `wt` (built on `@opentui/react`) has a handful of
sharp edges that the user surfaced in `work_notes/1_prompt.md` and the screenshot:

- Typing `r` in the branch field switches the user into Remove mode mid-keystroke
  (the global hotkey at `App.tsx:22-25` swallows every `r`).
- Once in Remove mode there is no on-screen hint how to leave it.
- The currently checked-out branch is indistinguishable from any other branch.
- Existing-worktree rows and branch-only rows are visually identical except for a
  small trailing `✓` and a path string — easy to miss at a glance.
- The "cursor" is a static `_` baked into a `<text>` node — it never blinks.
- The `(will create)` annotation sits in the same color as the rest of the row, so
  it reads as part of the branch name.
- Footer hints read as one undifferentiated blob — three separate key/action
  pairs are jammed together with single spaces and no visual separator, so
  `↑↓ move ↵ go esc cancel` parses as a single string instead of three hints.

Goal: a calm, **monochromatic warm-amber** look with subtle but always-present
navigation hints, real input behavior, and clear status semantics — without
turning the screen into a Christmas tree.

## Design decisions (locked in by the user)

- **Mode toggle:** drop `g`/`r` global hotkeys. Use **Tab** to flip Go ↔ Remove.
- **Palette:** warm amber accent (`#FCD34D`) + warm neutrals (`#57534E` dim,
  `#A8A29E` muted, `#E7E5E4` body). Errors stay warm-red `#F87171`.
- **Active branch marker:** `●` prefix in accent color + bold.

## Overall page layout

The current layout uses three full-width `<box borderStyle="single">` panels
(header, input, footer) with the list as an unbordered middle section. Each
panel has `padding={1}`, which together with the borders eats most of the
visual airiness — the screen reads as four stacked boxes instead of one calm
surface.

Target layout — minimal, one frame, content-first:

```
┌──────────────────────────────────────────────────────────────────┐
│  ● Go    Remove                                         ⇥ switch │   ← top strip,
├──────────────────────────────────────────────────────────────────┤     hairline rule
│                                                                  │     under it
│   › type to filter or create…                                    │   ← input row,
│                                                                  │     no border,
│     ● score-contribs              .worktrees/score-contribs      │     blinking cursor
│     ◆ master                      .worktrees/master              │
│     ○ jpeczke/MISC-flaky-tests                                   │   ← list takes
│     ○ jpeczke/SWIN-3183-celo-payout                              │     the rest
│   ▸ + new-thing                   (will create)                  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤   ← hairline rule
│  ● current   ◆ worktree   ○ branch   + create                    │   ← icon legend
│  ↑↓ navigate  │  ↵ go  │  ⇥ remove mode  │  esc cancel           │     + key hints
└──────────────────────────────────────────────────────────────────┘
```

The bottom strip becomes **two stacked lines** inside the same footer area: the
icon legend on top, the key hints below. Both in `theme.muted` for the words; in
the legend, each glyph is colored exactly as it appears in the list above
(active glyph in `theme.accent`, worktree glyph in `theme.accent`, branch glyph
in `theme.dim`, create `+` in `theme.accent`) so the legend is a literal mirror
of the list semantics — not a separate vocabulary the user has to memorize.

The Remove-mode legend collapses to just the relevant glyphs (`◆ worktree`)
since branch-only and create rows don't appear there.

Concretely:
- **Drop all internal `borderStyle="single"` boxes.** Use a single outer frame
  on the root `<box>` only (or no outer frame at all — favor the single-frame
  variant so the picker has a clear bounding edge).
- **Separators are hairlines, not boxes.** Use a single `<text>` row of `─`
  characters in `theme.dim` between header/body and body/footer. Cheaper
  visually than nested borders.
- **Input prompt** uses a `›` glyph in `theme.accent` instead of a bordered
  box around the input. The glyph + blinking cursor is enough to mark "this is
  where you type". Drop the `Branch:` label entirely — the placeholder
  (`type to filter or create…`) carries it.
- **Consistent left gutter.** Header label, input prompt, and list items all
  start at the same x-column (2 chars in). The selection cursor `▸` lives in
  that gutter so it doesn't shift the row when toggled.
- **Vertical rhythm.** One blank line between the input and the list, none
  between list items. Padding `1` on the outer box only.

## Theme module (new file)

`src/tui/theme.ts` — single source of truth so the rest of the code stops sprinkling
hex literals.

```ts
export const theme = {
  accent: "#FCD34D",   // warm amber — selected / active / mode-active
  text:   "#E7E5E4",   // body text
  muted:  "#A8A29E",   // secondary info (paths, "(will create)", footer)
  dim:    "#57534E",   // tertiary / inactive mode label / borders
  error:  "#F87171",   // soft warm red
} as const;
```

## File-by-file changes

### `src/tui/App.tsx`

1. **Remove the global key hook.** Delete the `useKeyboard` block that listens for
   `g`/`r` (lines 22-25). Mode switching happens via Tab handled inside each picker
   (since both pickers already own a `useKeyboard`, they each call `onToggleMode()`
   on Tab, propagated from `App`).
2. **Header redesign.** Replace the `[g] Go [r] Remove` strip with:
   ```
   ● Go    Remove        ⇥ switch
   ```
   The active mode is rendered with the accent color + `●` prefix; the inactive
   one is `theme.dim`. The right side shows the Tab affordance in `theme.muted`
   so the user always sees how to leave whichever mode they are in.
3. Pass `onToggleMode={() => setMode(m => m === "go" ? "remove" : "go")}` down to
   both pickers.
4. Use `theme.error` for the error box, drop the hard-coded `#FF4444`.

### `src/tui/GoPicker.tsx`

1. **Replace the fake input** at line 103-105 with the real `<input>` host element:
   ```tsx
   <input
     focused
     value={query}
     placeholder="type to filter or create…"
     onInput={(v) => { setQuery(v); setSelectedIdx(0); }}
   />
   ```
   This gives a real blinking cursor and removes ~20 lines of manual key
   plumbing (the `isPrintable` / `backspace` branches in the `useKeyboard`).
2. **Slim down the `useKeyboard`** to just the navigation keys it still owns:
   `escape`, `up`, `down`, `return`, **`tab`** (calls `onToggleMode`). All
   character keys flow into `<input>` via React focus, so `r` no longer leaks.
3. **Accept `currentBranch: string`** as a new prop (passed from `App`, which
   computes it once via the existing `currentBranch()` in `src/git/repo.ts`).
4. **Item rendering** — every row gets a leading **status glyph** so the
   row class is identifiable from the leftmost column without reading text:

   ```
     ● score-contribs              .worktrees/score-contribs
     ◆ master                      .worktrees/master
     ○ jpeczke/MISC-flaky-tests
     ○ jpeczke/SWIN-3183-celo-payout
   ▸ + new-thing                   (will create)
   ```

   Glyph legend (one column, fixed width, no trailing labels needed):
   - `●` — currently checked-out branch (always also a worktree).
   - `◆` — existing worktree (filled diamond → "materialized on disk").
   - `○` — branch only, no worktree yet (hollow circle → "not materialized").
   - `+` — create-new row (action, not a state).

   Color rules per row class (selection layered on top):
   - Active branch (`item.branch === currentBranch`): glyph + label both in
     `theme.accent`, label bold. Path in `theme.muted`.
   - Worktree row: glyph in `theme.accent`, label in `theme.text`, path in
     `theme.muted`. The accent glyph is the "yes, materialized" cue.
   - Branch-only row: glyph in `theme.dim`, label in `theme.text`. No trailing
     `branch` word needed — the hollow `○` carries the meaning.
   - Create row: `+` glyph in `theme.accent`, label in `theme.text`, trailing
     `(will create)` in `theme.accent` so it reads as a *new action*.
   - Selection cursor `▸` (in accent) appears in a column to the *left* of the
     status glyph, so the glyph stays in the same column whether selected or
     not — keeps the eye-line clean as the user moves up/down.
   - Selected row's label switches to `theme.accent` for the non-active rows;
     for the active-branch row it stays bold accent (already maxed out).
   - Two-column layout per row: a `<box flexDirection="row">` with the
     branch-label box at fixed minimum width and the path/annotation in a
     second column, so paths/annotations align vertically across rows.
5. Update `key={item.branch}` to `key={item.kind + ":" + item.branch}` so
   create/branch rows with the same name don't collide in React.

### `src/tui/RemovePicker.tsx`

1. **Same input swap** as GoPicker — real `<input>` instead of `Filter: [{query}_]`.
2. **`useKeyboard` slim-down** identical to GoPicker; add `tab` → `onToggleMode`.
   Do NOT toggle mode mid-confirmation prompt (early-return when
   `confirmState !== "none"`).
3. Selected item color → `theme.accent` (drop `#FF6666`); the destructive nature
   is signalled by the confirm prompt, not by red list rows.
4. Confirm prompt: keep `theme.error` for the message text, but add a second
   line in `theme.muted` reading `[y] confirm   [n / esc] cancel` so users see
   the way out.

### Footer (both pickers)

The real problem with the footer isn't color — it's that three separate hints
(`↑↓ move`, `↵ go`, `esc cancel`) get mashed together with single spaces and read
as one continuous string. Fix it structurally, not just chromatically:

- Each hint is its own `<text>` span with the **key glyph in `theme.text`** and
  the **action label in `theme.muted`**. Two colors per hint create a built-in
  visual rhythm: bright key, dim word, bright key, dim word.
- Hints are joined by a vertical bar separator `│` in `theme.dim` with one space
  on each side — a clear, consistent gutter between hints.
- The whole footer color baseline moves from `#666666` → `theme.muted`.

Layout (a single `<box flexDirection="row">` per hint, joined by separator spans):

```
GoPicker:     ↑↓ navigate  │  ↵ go      │  ⇥ remove mode  │  esc cancel
RemovePicker: ↑↓ navigate  │  ↵ remove  │  ⇥ go mode      │  esc cancel
```

Active mode's own affordance is omitted (no "⇥ go mode" while already in Go) —
this answers the original "no exit hint from Remove mode" complaint while keeping
the bar scannable.

## Files to touch

| File | Change |
|---|---|
| `src/tui/theme.ts` | **new** — color tokens |
| `src/tui/App.tsx` | drop global hotkeys, Tab-based header, pass `currentBranch` + `onToggleMode` |
| `src/tui/GoPicker.tsx` | real `<input>`, three-class row rendering, Tab handler, accent palette |
| `src/tui/RemovePicker.tsx` | real `<input>`, Tab handler, palette swap, confirm-prompt hint line |
| `src/cli/runTui.tsx` *(or wherever `App` is mounted)* | compute `currentBranch` once and pass it down |

## Verification

1. **Build & run locally**:
   ```
   bun run build && wt
   ```
2. **The `r`-bug regression check**: open the picker, type `react-feature`, confirm
   nothing switches modes mid-typing and the full string lands in the input.
3. **Mode toggle**: press Tab — header flips, footer hint reflects new direction.
   Press Tab again — back to Go.
4. **Active branch marker**: in a repo where HEAD is on `master`, confirm the
   `master` row shows `●` + bold + amber.
5. **Three row classes** are visually distinct without reading the path: existing
   worktree (path in muted), branch-only (`branch` tag in dim), create (`(will
   create)` in amber).
6. **Cursor blinks** in the input field; backspace and printable keys still work.
7. **Remove mode**: enter via Tab, see footer's `⇥ go mode` hint, hit Enter on a
   worktree, confirm prompt shows the `[y] confirm  [n / esc] cancel` line, hit
   `n` — returns to list, not to Go mode.
8. **Run the suite**: `bun test` — no behavioral regressions in `createNonInteractive`
   or the git layer (this is a pure-presentation change).
