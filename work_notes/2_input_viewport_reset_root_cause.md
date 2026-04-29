# Input viewport reset — root cause

## Symptom

While typing in the filter input, the displayed text **shifts left** — early characters
become invisible as they scroll out of view. The text value is correct (pressing Enter
creates the right worktree). It is a **display-only / visibility problem**, not a value
mutation problem. No characters are dropped.

## Root cause chain

1. `EditBufferRenderable` constructor creates the `EditorView` with:
   ```js
   this.editorView = EditorView.create(this.editBuffer, this.width || 80, this.height || 24)
   ```
   At construction time `this.width` is `0` (yoga layout hasn't run yet), so the
   EditorView is initialised with **width = 80**.

2. On first layout pass, yoga computes the real width (e.g. 74 columns) and calls
   `onLayoutResize(74, 1)` → `onResize(74, 1)` → `editorView.setViewportSize(74, 1)`.
   The viewport shrinks from 80 → 74. Any text already in the buffer that filled
   columns 74–80 is now beyond the viewport edge — it scrolls left.

3. On every subsequent keystroke, `onInput` → `setItems(...)` → React re-render →
   yoga re-runs layout → `onLayoutResize` is called again with the same real width.
   Each call resets `setViewportSize`, which (in the native Zig layer) resets
   `offsetX = 0`. The viewport jumps back to show from column 0, leaving the cursor
   (at the end of the string) outside the visible area — text appears to scroll left
   and disappear.

## Key code references

- `EditBufferRenderable` constructor (index-07knw1vn.js ~19645):
  `EditorView.create(this.editBuffer, this.width || 80, ...)` — fallback to 80
- `EditBufferRenderable.onResize` (index-07knw1vn.js ~19902):
  calls `this.editorView.setViewportSize(width, height)`
- `Renderable.onLayoutResize` (index-07knw1vn.js ~15679):
  calls `this.onResize(width, height)` when `sizeChanged`
- `Renderable` layout update (index-07knw1vn.js ~15654):
  `sizeChanged = oldWidth !== newWidth || oldHeight !== newHeight`

## What did NOT work

- Pinning `height={2}` on the input row — height is not what triggers the resize;
  the issue is the width mismatch between the initial EditorView (80) and the real
  computed width, re-applied on every layout pass.

## Fix

Give the `<input>` an explicit `width` prop. This makes yoga compute a stable width
from the first layout pass, so `sizeChanged` is never true after the initial
correction and `setViewportSize` is never called again during typing:

```tsx
<input focused width="100%" placeholder="…" onInput={handleInput} />
```

Apply to both `GoPicker.tsx` and `RemovePicker.tsx`.

If `width="100%"` alone is not enough (because the flex row itself changes), also
give the input row a fixed height to fully stabilise both dimensions:

```tsx
<box flexDirection="row" paddingLeft={2} paddingTop={1} height={2}>
  <text fg={theme.accent}>› </text>
  <input focused width="100%" placeholder="…" onInput={handleInput} />
</box>
```
