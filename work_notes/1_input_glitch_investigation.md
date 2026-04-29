# Input glitch investigation

## Symptom

Typing in the `type to filter or create…` input is broken: characters are dropped,
appear late, or randomly pop up and disappear. Example: typing `test-worktree` shows
`t-worktree` or similar garbled output.

---

## What we tried (and why each failed)

### Attempt 1 — Remove `onInput` (keep `useKeyboard` for text)
**Rationale:** suspected double-write: `useKeyboard` and `onInput` both calling `setQuery`.  
**Result:** still broken.  
**Why it failed:** `useKeyboard` fires *before* the `<input>`'s internal handler
(`emitWithPriority` runs global listeners first, then `renderableHandlers`). Removing
`onInput` and driving state from `useKeyboard` means we're reading the input's buffer
*before* the character has been inserted — so we get stale/empty strings, not the
accumulated text.

### Attempt 2 — Remove `value` prop
**Rationale:** `InputRenderable.set value()` calls `setText()` (full buffer replace) and
then `emit("input")` — suspected feedback loop: `value={query}` on every render triggers
setter → fires `onInput` → `setQuery` → re-render → setter again.  
**Result:** still broken.  
**Why it partially helped but didn't fix it:** removing `value` prevents the feedback loop
but doesn't address the root race condition (see below).

### Attempt 3 — Stabilise `onInput` with `useCallback`
**Rationale:** inline `onInput` arrow creates a new function reference every render;
`initEventListeners` removes the old listener and adds the new one on every re-render,
causing a window where no listener is attached.  
**Result:** still broken.  
**Why it partially helped:** listener churn was reduced, but React re-renders still happen
on every keystroke (because `setQuery` triggers them), and each re-render hits
`resetAfterCommit` → `requestRender()` which races with the input's own render cycle.

### Attempt 4 — `useRef` for query, `useState` only for filtered list
**Rationale:** the `<input>` would have fully stable props (no re-render of the input
element itself), only the list below would re-render.  
**Result:** still broken (current state).  
**Why it still fails:** unclear — the `<input>` props are now truly stable, so
`updateProperties` touches nothing on the input after mount. Yet the glitch persists,
which means the issue is *not* in React prop reconciliation at all.

---

## Current understanding of the real cause (hypothesis)

After tracing through the opentui source, the most likely remaining cause is one of:

### Hypothesis A — `useKeyboard` steals keys before `<input>` processes them

`InternalKeyHandler.emitWithPriority` runs global listeners (registered via
`useKeyboard`) **before** `renderableHandlers` (the focused `<input>`'s internal handler).

The `useKeyboard` handler is `async`. If the async handler does any awaiting (it doesn't
for normal chars, but the `return` branch does), the event processing order may be
disrupted. More critically: the `useKeyboard` callback is wrapped with `useEffectEvent`
which captures a ref to the latest handler — but if a stale closure is captured at the
wrong moment, `items`/`safeIdx` could be wrong, and calling `renderer.destroy()` or
`setSelectedIdx` from a stale closure during a render cycle could corrupt state.

### Hypothesis B — `<input>`'s `focused` prop causes focus/blur on mount

`setProperty("focused", true, undefined)` is called on initial mount (first render,
`oldProp` is `undefined`). `focus()` calls `this.ctx.focusRenderable(this)` which calls
`this._currentFocusedRenderable?.blur()` on whatever was focused before. If nothing was
focused, it's fine. But if the renderer has a default focused element, this blur/focus
cycle could disrupt initial key handler registration.

### Hypothesis C — The issue is in how opentui's render loop interacts with stdin parsing

The `CliRenderer` processes stdin bytes → parses keypresses → dispatches them through
`InternalKeyHandler`. If the render loop and stdin parsing share a tick, a keypress
arriving during a render frame could be queued and processed at an unexpected time.

### Hypothesis D — `useKeyboard` handler is registered twice

`useKeyboard` uses `useEffect` with `[keyHandler, options.release]` deps. `keyHandler`
is `renderer.keyInput` from context — stable. But if the `GoPicker` component
unmounts and remounts (e.g., on mode switch), the effect runs again, registering a
second handler. The first handler may not have been cleaned up if the cleanup ran at
the wrong time. Result: two `useKeyboard` handlers firing for every key.

---

## How to write a test that reproduces the issue

`@opentui/core` ships a full testing framework (`testing.js`) with:
- `createTestRenderer(options)` — creates an in-memory renderer with a fake stdin/stdout
- `createMockKeys(renderer)` — provides `typeText(str)`, `pressKey(key)`, etc.
- `captureCharFrame()` — returns the current rendered frame as a string
- `renderOnce()` — runs one render loop tick

### Proposed test: `tests/tui.input.test.ts`

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import React from "react";
import { GoPicker } from "../src/tui/GoPicker.tsx";

describe("GoPicker input", () => {
  test("types all characters correctly", async () => {
    const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 120,
      height: 30,
    });

    const root = createRoot(renderer);
    root.render(
      React.createElement(GoPicker, {
        repoRoot: "/repo",
        worktrees: [],
        localBranches: ["main", "feature-foo", "feature-bar"],
        currentBranch: "main",
        onDone: () => {},
        onError: () => {},
        onToggleMode: () => {},
      }),
    );
    await renderOnce();

    // Type a word one character at a time (simulates real user input)
    await mockInput.typeText("test-worktree");
    await renderOnce();

    const frame = captureCharFrame();

    // The input line should contain the full typed string
    expect(frame).toContain("test-worktree");
  });

  test("filters list as user types", async () => {
    const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 120,
      height: 30,
    });

    const root = createRoot(renderer);
    root.render(
      React.createElement(GoPicker, {
        repoRoot: "/repo",
        worktrees: [],
        localBranches: ["main", "feature-foo", "feature-bar"],
        currentBranch: "main",
        onDone: () => {},
        onError: () => {},
        onToggleMode: () => {},
      }),
    );
    await renderOnce();

    await mockInput.typeText("feature");
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("feature-foo");
    expect(frame).toContain("feature-bar");
    // "main" should be filtered out
    expect(frame).not.toMatch(/○ main/);
  });

  test("shows create option for unknown branch name", async () => {
    const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 120,
      height: 30,
    });

    const root = createRoot(renderer);
    root.render(
      React.createElement(GoPicker, {
        repoRoot: "/repo",
        worktrees: [],
        localBranches: ["main"],
        currentBranch: "main",
        onDone: () => {},
        onError: () => {},
        onToggleMode: () => {},
      }),
    );
    await renderOnce();

    await mockInput.typeText("new-branch");
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("new-branch");
    expect(frame).toContain("will create");
  });
});
```

### Why this test would catch the bug

- `typeText("test-worktree")` emits each character as a separate stdin `data` event,
  exactly as real terminal input does — no batching
- If any character is dropped (due to race between render and key handler), the
  `captureCharFrame()` assertion will fail because the displayed string won't match
- This is a true E2E test through opentui's full stack: stdin → parser → KeyHandler →
  InputRenderable → render buffer → frame capture

### Open question for the test

`typeText` in opentui's testing module calls `pressKeys` with `delayMs = 0` (no async
gap between characters). The real terminal may process characters with tiny gaps.
We should also test with `delayMs = 16` (one frame ~60fps) to replicate the async
render-between-keystrokes scenario where the race is most visible.

---

## Next steps

1. Write the test above — if it passes, the bug is timing-dependent and we need
   `delayMs > 0` to expose it
2. If `delayMs = 0` already fails, we have a reproducible case and can bisect
3. Likely real fix: stop using `useKeyboard` entirely and handle *all* keys inside
   `onInput`/`onSubmit`/`onChange` callbacks that the `<input>` itself exposes,
   so there's only one listener on the key stream
