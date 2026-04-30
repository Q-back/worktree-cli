# TUI Branch State Visual Redesign

## Context

The GoPicker TUI currently has two visual problems:

1. **Initial cursor always starts at index 0** — the user wants the cursor to
   auto-land on the currently active branch when the TUI opens.
2. **Ambiguous icon/color scheme** — the `●` (current) and `◆` (worktree) icons
   use the *same gold color*, making them visually indistinct. The user also wants
   the icons swapped to be more intuitive, and clear 3-way visual separation between:
   - what branch the main repo is pointing at (`◆` = home/pinned)
   - branches that have an open worktree (`●` = alive elsewhere)
   - branches with no worktree (`○` = dormant)

A `DESIGN.md` should also be created as a consistency reference for future changes.

---

## New Icon Semantics

| State | Icon | Color | Rationale |
|---|---|---|---|
| `isActive` (main repo HEAD) | `◆` | cyan `#67E8F9` | You are here — the unique pop color |
| `kind="worktree"` (not active) | `●` | gold `#FCD34D` | Open elsewhere — warm, notable |
| `kind="branch"` (no worktree) | `○` | dim `#57534E` | Open circle = exists but dormant |
| `kind="create"` | `+` | gold `#FCD34D` | Action = same energy as worktree |
| Tab bar active indicator | `▸` | gold | Avoids collision with `●` = worktree |

**Edge case:** `isActive && kind="worktree"` — show `◆` in cyan (active wins),
but append the worktree path in gold as a secondary signal.

---

## Color Design

Cool cyan for "you are here" (rare, striking), warm gold for "something is open
here" (notable), dim for dormant. Cyan is the only pop color reserved for the
single active branch — making it immediately locatable at a glance.

**New semantic tokens to add to `theme.ts`** (additive, existing keys unchanged):

```typescript
// Semantic — branch state
active:   "#67E8F9",   // isActive: cyan = you are here
worktree: "#FCD34D",   // kind=worktree (not active): gold = open elsewhere
branch:   "#57534E",   // kind=branch (not active): dim = dormant  <- alias of dim
create:   "#FCD34D",   // kind=create: gold = action  <- alias of accent

// Semantic — chrome
cursor:    "#FCD34D",  // arrow selection indicator
prompt:    "#FCD34D",  // input prompt
separator: "#57534E",  // lines
```

---

## Files to Modify

### `src/tui/theme.ts`
Add semantic tokens above. Keep existing raw keys intact (backward compat).

### `src/tui/GoPicker.tsx`

**Fix 1 — Initial cursor** (line 59):
```typescript
// Before:
const [selectedIdx, setSelectedIdx] = useState(0);

// After:
const initialIdx = baseItemsRef.current.findIndex(
  (item) => item.branch === currentBranch,
);
const [selectedIdx, setSelectedIdx] = useState(initialIdx >= 0 ? initialIdx : 0);
```
`handleInput` already resets to 0 on filter, so this only affects the initial open.

**Fix 2 — GoRow rendering** (lines 137-189):

Revised logic priority:
1. `isActive` -> `◆` in `theme.active` (cyan); show worktree path in `theme.worktree`
   (gold) if `kind === "worktree"`, else no path
2. `kind === "worktree"` -> `●` in `theme.worktree` (gold); path in `theme.muted`
3. `kind === "branch"` -> `○` in `theme.branch` (dim); no path
4. `kind === "create"` -> `+` in `theme.create` (gold); "(will create)" in `theme.create`

Selected row: cursor `▸` in gold signals selection; **do not** override the row's
icon/name color — the visual identity of the state must survive selection.

**Fix 3 — GoFooter** (lines 192-222):
- `◆` labeled "current" in `theme.active` (cyan)
- `●` labeled "worktree" in `theme.worktree` (gold)
- `○` labeled "branch" in `theme.dim`
- `+` labeled "create" in `theme.create`

### `src/tui/RemovePicker.tsx`

Row renderer (line 109-113): change icon `◆` -> `●`, color -> `theme.worktree`
(gold, since these are all worktrees, not the active branch).
`RemoveFooter` (line 129): same glyph and color change.

### `src/tui/App.tsx`

Tab bar active indicator (lines 44/46): change `"● "` -> `"▸ "` so `●`
no longer collides with its new meaning (has-worktree).

### New file: `DESIGN.md` (repo root)

Sections:
1. **Visual Vocabulary** — the 4 states and what they mean to the user
2. **Icons** — symbol table with meaning and rationale
3. **Color Palette** — token table (raw + semantic), cyan/gold/dim intentionality
4. **Color Application Rules** — priority order when multiple conditions apply
5. **Typography** — when to use dim/muted/text/active
6. **Component Inventory** — GoPicker, RemovePicker, App tab bar
7. **Extending** — checklist for adding a new state

---

## Verification

1. `bun run build` (or equivalent) — must compile with no type errors
2. Run `wt` from a repo that has:
   - The current branch visible in the list
   - At least one existing worktree
   - At least one branch-only (no worktree)
3. Confirm cursor opens on the current branch row
4. Confirm `◆` (cyan) shows for current branch, `●` (gold) for worktree,
   `○` (dim) for plain branch
5. Tab to Remove mode — confirm `●` (gold) for all items there
6. Check footer legend matches icons in each mode
