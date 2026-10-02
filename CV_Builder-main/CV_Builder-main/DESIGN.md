# CV Builders design language

Warm, calm and tactile: a thoughtful productivity tool, not recruitment software.
All values live as CSS custom properties at the top of `static/light_style.css`.

## Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FAF8F4` | Page background (warm off-white, never pure white) |
| `--surface` | `#FFFFFF` | Cards, panels, the CV paper |
| `--surface-warm` | `#F4EEE6` | Tinted sections, hover warmth, footer |
| `--fg` | `#252525` | Primary text |
| `--muted` | `#706D68` | Secondary text (4.9:1 on `--bg`) |
| `--accent` | `#E9785B` | Soft coral: decoration only (sparkles, pills, dots, focus glow) |
| `--accent-strong` | `#BF5232` | Terracotta: primary buttons and accent text (4.7:1 with white) |
| `--accent-soft` | `#FCEDE7` | AI chips, selected states |
| `--sage` | `#9AAA91` | Completion checks and calm secondary marks; never body text (2.3:1) |

`#E9785B` with white text is only 2.9:1, so buttons use `--accent-strong`. Use accent sparingly: one primary CTA per screen.

## Type

- Headings: Plus Jakarta Sans 600, tight line-height (1.05–1.15), slight negative tracking. Never 800+.
- Body: Inter 400/500, 16px, line-height 1.65.
- Hero headline: `clamp(2.6rem, 5.4vw, 4.4rem)`.

## Shape and depth

| Element | Radius |
|---|---|
| Inputs | 12px |
| Buttons | 14px |
| Cards | 22px |
| Large containers | 28–32px |
| Pills | 999px |

Shadows are warm and soft, not borders: `--shadow: 0 8px 30px rgba(40,32,25,0.06)`, deeper on hover `--shadow-lift: 0 16px 40px rgba(40,32,25,0.10)`. Borders, where needed, are `rgba(40,32,25,0.08)`.

## Motion

- Durations 180–350ms; easing `--ease: cubic-bezier(0.22, 1, 0.36, 1)` and a soft spring `--spring: cubic-bezier(0.34, 1.4, 0.64, 1)`.
- Page entrance: `[data-reveal]` fades up 16px, staggered by `--i`.
- Buttons press to `scale(0.98)`. Cards rise 5px on hover; preview image scales to 1.015.
- AI: sparkle breathes while waiting, then text reveals word by word.
- Everything respects `prefers-reduced-motion: reduce`.

## Layout

- Home: max content width 1180px, sections padded 112px (72px on mobile).
- Editor: three columns on desktop (section nav 220px · paper canvas · contextual panel 440px). Under 1100px the nav becomes step pills and the preview opens in a drawer.
