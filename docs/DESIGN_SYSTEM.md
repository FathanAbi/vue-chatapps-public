# Design System — vue-frontend

> The single source of truth is `vue-frontend/src/assets/main.css`. Every value
> below is a CSS custom property defined there; components reference the
> variables and never hardcode colours, spacing or radii.

---

## 1. Design philosophy

- **Modern, clean, professional.** A light-only theme for now, deliberately.
- **Consistency over decoration.** Usability and readability come first; no
  gradients, no decorative shadows, a single accent colour.
- **Token-driven.** One accent (blue) plus a neutral slate scale, semantic
  state colours, and a 4px spacing grid.
- **CSP-safe.** No external fonts or icon scripts — the nginx vhost enforces
  `script-src 'self'` and `style-src 'self'` (plus `'unsafe-inline'` for Vue's
  scoped styles). The icon set is inline SVG (`components/ui/AppIcon.vue`).
- **Accessible by default.** Visible focus rings, labelled inputs, ARIA roles
  on menus/dialogs, keyboard-operable controls, `aria-current` navigation.

---

## 2. Colour palette

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#2563eb` | Primary actions, active nav, own message bubbles |
| `--color-primary-hover` | `#1d4ed8` | Hover |
| `--color-primary-active` | `#1e40af` | Pressed |
| `--color-primary-soft` | `#eff6ff` | Tinted surfaces (feature icons, active cards) |
| `--color-primary-ring` | `rgba(37,99,235,.25)` | Focus ring on inputs |
| `--color-on-primary` | `#ffffff` | Text on primary |
| `--color-success` / `-soft` | `#059669` / `#ecfdf5` | Success |
| `--color-warning` / `-soft` | `#d97706` / `#fffbeb` | Warning |
| `--color-danger` / `-hover` / `-soft` | `#dc2626` / `#b91c1c` / `#fef2f2` | Errors, destructive |
| `--color-info` / `-soft` | `#0284c7` / `#f0f9ff` | Informational |
| `--color-bg` | `#f8fafc` | App background |
| `--color-surface` | `#ffffff` | Cards, header, sidebar |
| `--color-surface-2` | `#f1f5f9` | Hover surface, icon chips |
| `--color-border` | `#e2e8f0` | Default borders |
| `--color-border-strong` | `#cbd5e1` | Input borders |
| `--color-text` | `#0f172a` | Body text |
| `--color-text-muted` | `#64748b` | Secondary text |
| `--color-text-subtle` | `#94a3b8` | Placeholders, meta |

## 3. Typography

- `--font-sans` — system UI stack (no webfont download).
- `--font-mono` — reserved for code.
- Sizes: `--fs-xs` 12 · `--fs-sm` 13 · `--fs-base` 15 · `--fs-md` 16 ·
  `--fs-lg` 18 · `--fs-xl` 20 · `--fs-2xl` 24 · `--fs-3xl` 30.
- Weights: `--fw-normal` 400 · `--fw-medium` 500 · `--fw-semibold` 600 ·
  `--fw-bold` 700.
- Line heights: `--lh-tight` 1.25 · `--lh-normal` 1.5 · `--lh-relaxed` 1.65.

The heading hierarchy is enforced by `PageHeader` (page titles),
section `<h2>`s and card `<h3>`s.

## 4. Spacing scale

4px grid: `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 ·
`--space-5` 20 · `--space-6` 24 · `--space-7` 32 · `--space-8` 40.

## 5. Radius, elevation, layout, motion, z-index

- Radius: `--radius-sm` 6 · `--radius-md` 8 · `--radius-lg` 12 · `--radius-xl` 16 ·
  `--radius-pill` 999.
- Shadows: `--shadow-sm` · `--shadow-md` · `--shadow-lg`.
- Layout: `--header-h` 60 · `--sidebar-w` 280 · `--content-max` 1120.
- Motion: `--transition-fast` 120ms · `--transition` 160ms.
- Z-index: `--z-header` 30 · `--z-sidebar` 40 · `--z-overlay` 45 · `--z-modal` 60.

## 6. Component styling conventions

All primitives live in `components/ui/` and use BEM-ish classes
(`.btn`, `.btn--primary`, `.field__input`).

| Component | Purpose | Key props |
|---|---|---|
| `AppIcon` | Inline SVG icon registry | `name`, `size`, `strokeWidth` |
| `BaseButton` | Every button/link-button | `variant` (primary/secondary/ghost/danger), `size` (sm/md/lg), `to`, `icon`, `iconOnly`, `label`, `loading`, `disabled`, `block` |
| `BaseInput` | Labelled text field + error/hint | `modelValue`, `label`, `type`, `error`, `hint`, `required`, `icon` |
| `BaseAvatar` | Initials avatar, deterministic colour | `name`, `size` |
| `BaseCard` | Surface container | `as`, `interactive`, `padded`, `active` |
| `BaseBadge` | Status chip | `variant` |
| `EmptyState` | Zero-data screen | `icon`, `title`, `text` + default slot |
| `LoadingIndicator` | Section loader | `label` |
| `PageHeader` | Page title/description/actions | `title`, `description` + `actions` slot |

Conventions:
- Colours/spacing/radius are always tokens.
- Interactive elements are native `<button>`/`<a>`/`<input>` where possible so
  keyboard + screen-reader behaviour is inherited.
- Icon-only buttons require a `label` (becomes `aria-label`).

## 7. Theme implementation

A single **light theme** is implemented via `:root` tokens. `prefers-color-scheme`
is intentionally **not** honoured — the legacy `base.css` dark block was dead
and inconsistent. Because every surface goes through tokens, adding a
`[data-theme="dark"]` override later is a contained change (documented as
remaining technical debt in the refactoring report).

## 8. Responsive breakpoints

| Breakpoint | Behaviour |
|---|---|
| ≥ 1024px | Full shell: sidebar docked, header shows user menu with name |
| 768–1023px | Sidebar becomes an off-canvas drawer with overlay; header shows the toggle; user name hidden |
| ≤ 768px | Message bubbles widen to 85%; grids collapse to one column |
| ≤ 480px | Reduced page/card padding; smaller headings |

Spacing, flex/grid and `min-width: 0` guards (not fixed pixel shrinking) drive
responsiveness, so no horizontal overflow occurs on mobile.
