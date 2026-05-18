---
name: design-rules
description: "UI/UX design system: Material 3 Expressive — tonal palette, springs, rounded shapes, shadcn-first, AI parity"
---

# Design rules

- Hide UI: Focus content. No decor. No slow anim. No visual noise.
- Material 3 Expressive: Copy if fit.
- Shadcn First: Use `src/components/ui/`. Edit in place. No duplicate impl.
- CSS vars theme: Colors use `index.css` HSL (`hsl(var(--primary))`). No hard-code Tailwind. -> Easy theme.
- AI parity — UI action -> add tool in `internal/ai/tools.go`.
- Hide AI: No flashy AI UI. `@sajni` in cmd palette = main entry.

**Material 3 Expressive** is the active design language

**Why:** User wants Google M3 Expressive vocabulary applied with restraint — refined, not loud. Rounded shapes, dynamic tonal color, emphasized springs.

**How to apply:**

- **Shapes:** Use M3 corner scale via `rounded-*` classes. sm=8 / md=12 / lg=16 / xl=24 / 2xl=28 (dialogs/sheets) / full=pill (chips/buttons/FAB). Default radius is NOT zero — no global radius nuke.
- **Color:** HSL CSS vars only (`hsl(var(--primary))`), never hard-coded Tailwind color classes. Tokens follow M3: primary/secondary/tertiary plus container variants (`--primary-container`, `--on-primary-container`). Surface uses `--surface`, `--surface-container`, `--surface-container-high`. Tonal layering preferred over shadow.
- **Motion:** Emphasized easing `cubic-bezier(0.2, 0, 0, 1)`. Springs from framer-motion: `{ type: 'spring', stiffness: 380, damping: 28 }` for expressive bounces, `{ stiffness: 220, damping: 30 }` for standard. M3 durations: short 100-200ms, medium 250-400ms, long 450-600ms.
- **Elevation:** Prefer surface-container layering over drop shadows. When shadows needed, use `--m3-elevation-1..5` tokens.
- **Components:** shadcn-first — modify `src/components/ui/*` in place. Button has M3 variants (filled/tonal/outlined/text/elevated). Use shadcn Calendar in Popover instead of `<Input type="date">`.
- Can check <https://m3.material.io/blog/building-with-m3-expressive> for more information on the guidelines

**AI parity:** every user action in the UI must also be a tool in `internal/ai/tools.go`. New feature = new tool.

**AI is ambient:** do not prominently surface AI affordances. The @sajni trigger in command palette is primary entry point. Never encourage AI use; let it be discovered.
