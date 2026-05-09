# Design Reference

Visual and interaction design consistency reference for worktree-cli's TUI.

---

## Visual Vocabulary

The TUI communicates five branch states to the user:

| State | Meaning |
|---|---|
| **Main** | The main repo directory — pinned at top, always visible; navigate here to go back |
| **Current** | The branch HEAD points at in the main repo — _you are here_ |
| **Worktree** | A branch that has an open worktree somewhere on disk |
| **Branch** | A local branch with no open worktree — exists but dormant |
| **Create** | A name typed by the user that doesn't exist yet — action |

---

## Icons

| State | Icon | Rationale |
|---|---|---|
| Main repo | `⌂` | House = home; always pinned at top of the list |
| Current (`isActive`) | `◆` | Diamond = pinned; unique shape signals the one active branch |
| Worktree (not active) | `●` | Filled circle = alive elsewhere |
| Branch (no worktree) | `○` | Open circle = exists but dormant |
| Create | `+` | Action glyph — something will be made |
| Tab bar active | `▸` | Arrow = navigation indicator; avoids collision with `●` = worktree |

---

## Color Palette

### Raw tokens (`theme.ts`)

| Token | Hex | Description |
|---|---|---|
| `accent` | `#FCD34D` | Gold — primary accent |
| `text` | `#E7E5E4` | Near-white — default text |
| `muted` | `#A8A29E` | Grey — secondary text |
| `dim` | `#57534E` | Dark grey — tertiary / separators |
| `error` | `#F87171` | Red — error messages |

### Semantic tokens (`theme.ts`)

| Token | Hex | Applied to |
|---|---|---|
| `home` | `#A78BFA` | `kind=main` icon (`⌂`) |
| `active` | `#67E8F9` | `isActive` branch icon and name |
| `worktree` | `#FCD34D` | `kind=worktree` icon; worktree path when `isActive && kind=worktree` |
| `branch` | `#57534E` | `kind=branch` icon |
| `create` | `#FCD34D` | `kind=create` icon and "(will create)" label |
| `cursor` | `#FCD34D` | `▸` selection arrow |
| `prompt` | `#FCD34D` | `›` input prompt |
| `separator` | `#57534E` | Horizontal rule lines |

### Intentionality

- **Violet (`home`)** — soft, distinct. Reserved for the main repo row only; signals origin without
  competing with active-branch cyan or action-element gold.
- **Cyan (`active`)** — cool, rare, striking. Reserved exclusively for the single active branch so
  it pops immediately at a glance. Never reuse for anything else.
- **Gold (`worktree`, `create`, `cursor`, `prompt`)** — warm, notable. Signals "something is open
  or happening here." Shared by action-oriented elements.
- **Dim (`branch`, `separator`)** — recedes. Used for dormant states and structural chrome that
  should not compete for attention.

---

## Color Application Rules

When multiple conditions apply to one row, priority is:

0. `kind=main` → `⌂` in `theme.home` (violet). Name in `theme.active` if also `isActive`,
   else `theme.text`. Path (repo root) in `theme.muted`.
1. `isActive` → `◆` in `theme.active` (cyan). Name in `theme.active`.
   - If also `kind=worktree`: append path in `theme.worktree` (gold).
2. `kind=worktree` (not active) → `●` in `theme.worktree`. Name in `theme.text`. Path in
   `theme.muted`.
3. `kind=branch` → `○` in `theme.branch`. Name in `theme.text`. No path.
4. `kind=create` → `+` in `theme.create`. Name in `theme.text`. Label in `theme.create`.

**Selection cursor** (`▸` in `theme.cursor`) signals which row is focused. It does **not**
override the row's icon or name color — the state identity must survive selection.

---

## Typography

| Token | Use when |
|---|---|
| `theme.active` (cyan) | Active branch icon and name only |
| `theme.text` (near-white) | Primary readable content — branch names, labels |
| `theme.muted` (grey) | Secondary info — paths, legend labels |
| `theme.dim` (dark grey) | Tertiary / structural — separators, dormant icons |
| `theme.accent` (gold) | Chrome — prompt, cursor, create/worktree icons |
| `theme.error` (red) | Error messages only |

---

## Component Inventory

### `GoPicker` (`src/tui/GoPicker.tsx`)

- **Input row** — prompt `›` in `theme.prompt`, text input
- **GoRow** — one row per item; applies icon/color rules above
- **GoFooter** — legend row (`◆` `●` `○` `+`) + keybinds row

### `RemovePicker` (`src/tui/RemovePicker.tsx`)

- **Input row** — prompt `›` in `theme.prompt`, text input
- **Item row** — all items are worktrees: `●` in `theme.worktree`, name in `theme.text`, path in
  `theme.muted`
- **RemoveFooter** — legend `●` in `theme.worktree` + keybinds row

### `App` tab bar (`src/tui/App.tsx`)

- Active tab: `▸` in `theme.accent` + label in `theme.accent`
- Inactive tab: two spaces + label in `theme.dim`

---

## Extending

Checklist when adding a new branch state:

1. Add the state to `GoItemKind` in `GoPicker.tsx`.
2. Choose an icon — it must be visually distinct from `⌂ ◆ ● ○ +`.
3. Add a semantic color token to `theme.ts` with a comment explaining what it signals.
4. Add a `GoRow` branch for the new kind, following priority rules above.
5. Add the icon + label to `GoFooter` legend.
6. Document the new state in this file (Visual Vocabulary, Icons, Color Palette, Component
   Inventory).
