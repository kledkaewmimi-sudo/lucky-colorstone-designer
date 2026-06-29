# Design Philosophy

- Mobile First
- Elegant
- Luxury
- Jewelry Brand

# Brand Style

The current UI uses a premium jewelry-brand mood with soft luxury cues, rounded surfaces, and restrained contrast.

- Visual mood: warm, polished, soft, and ornamental rather than stark or minimal.
- Design language: rounded cards, gentle gradients, subtle glows, and soft shadows.
- Branding: `LUCKY.COLORSTONE` is presented with a serif logo treatment and a luxury-inspired purple/red palette in the customer app, with a matching cream/plum/velvet CRM theme.

# Color Palette

Current colors used in the implementation:

## Customer App

- `#F6F2FF` `--color-bg-cream`
- `#FCFBFF` `--color-card-cream`
- `#F6F6FF` `--color-lavender-light`
- `#E6E6FA` `--color-lavender`
- `#B5A9DB` `--color-lavender-dark`
- `rgba(230, 230, 250, 0.6)` `--color-lavender-glow`
- `rgba(181, 169, 219, 0.18)` `--color-lavender-shadow`
- `#8B0000` `--color-velvet-red`
- `#660000` `--color-velvet-red-dark`
- `#FFEAEA` `--color-velvet-red-light`
- `rgba(139, 0, 0, 0.15)` `--color-velvet-red-glow`
- `#40304D` `--color-navy-dark`
- `#554466` `--color-navy`
- `#7E6C90` `--color-navy-light`
- `#9E8DAE` `--color-navy-muted`
- `#E8DFF5` `--color-gray-border`
- `#F4EEFF` `--color-gray-bg`
- `#0A1128` page background for desktop framing
- `#1E293B` body text
- `#FFFFFF` appears in button text and some overlays
- `rgba(10, 17, 40, 0.6)` modal overlay
- `rgba(10, 17, 40, 0.4)` and similar dark overlay tones

## CRM

- `#FAF6EE` `--color-body-bg` / `--color-navy-darker`
- `#FFFDF9` `--color-card-bg`
- `#F9F7F2` `--color-card-hover`
- `#40304D` `--color-navy-dark`
- `#554466` `--color-navy`
- `#F3F1FB` `--color-navy-light`
- `#9E8DAE` `--color-navy-muted`
- `#E8E1D5` `--color-navy-border`
- `#6B1D2F` `--color-gold` and `--color-green`
- `#B2A4D4` `--color-gold-light`, `--color-yellow`, `--color-purple`
- `#4A0E1C` `--color-gold-dark` and `--color-red`
- `rgba(107, 29, 47, 0.08)` and similar glow values
- `#FFFFFF`

# Typography

Current typography uses:

- `Inter` for most UI text, controls, and body copy.
- `Playfair Display` for brand logo treatment and major headings.

## Headings

- Customer app headings use `Playfair Display` for the brand and step titles.
- CRM headings and section titles use semibold or bold weights, with brand elements also using `Playfair Display`.

## Body

- Body text uses `Inter`, with weights typically in the `400-600` range.
- Base line height is generally `1.5`.

## Buttons

- Buttons typically use `Inter`.
- Button text is usually `13px-16px`, `600-700` weight depending on context.

# Spacing

Spacing is generally built from a small set of repeating values:

- Small spacing: `4px`, `6px`, `8px`, `10px`, `12px`
- Medium spacing: `14px`, `15px`, `16px`, `18px`, `20px`, `24px`
- Large spacing: `28px`, `30px`, `32px`, `34px`, `40px`

The customer app tends to use tighter vertical spacing and a compact mobile rhythm. The CRM uses larger desktop spacing and more room between cards and sections.

# Border Radius

Current radius values used in the implementation:

- `50px` for the primary landing CTA
- `9999px` for pill-shaped controls
- `28px`, `26px`, `22px`, `20px`, `18px`, `16px`, `14px`, `12px`, `10px`, `8px`, `6px`, `4px`

The customer app uses larger radii on cards and pills. The CRM uses `8px-20px` radii depending on component type.

# Shadows

Current shadow styles used in the implementation:

- `0 2px 8px var(--color-lavender-shadow)`
- `0 8px 24px var(--color-lavender-shadow)`
- `0 16px 32px var(--color-lavender-shadow)`
- `0 8px 20px var(--color-lavender-shadow)`
- `0 24px 80px rgba(18, 16, 40, 0.34)`
- `0 0 40px rgba(0, 0, 0, 0.4)`
- `0 8px 24px rgba(196, 30, 58, 0.3)`
- `0 12px 32px rgba(196, 30, 58, 0.4)`
- `0 4px 12px rgba(0, 0, 0, 0.08)`
- `0 8px 30px rgba(178, 164, 212, 0.16)`
- `0 8px 24px rgba(107, 29, 47, 0.1)`

Shadows are soft and layered. Heavy hard-edged shadows are not used.

# Buttons

## Primary Button

- Customer app primary CTA: the landing start button uses a velvet-red gradient, white text, pill radius, and a raised shadow.
- CRM primary button: uses a gold-to-dark gradient with cream text and a soft shadow.

## Secondary Button

- Customer app secondary controls use outlined or neutral buttons with navy text and lavender borders.
- CRM secondary buttons use the outline variant with transparent background and accent borders.

## Danger Button

- CRM danger actions use red/velvet styling, either as `btn-danger-outline` or red-toned action states.
- Customer app destructive or confirm-close behavior is handled with neutral modal buttons and red accent use where needed.

## Disabled State

- Disabled buttons remain visually muted and non-interactive.
- The customer app disables order/export actions until the required state is ready.
- The CRM uses the native disabled button state for actions that are not yet available.

# Cards

Card appearance is consistent across both apps:

- Rounded corners.
- White or off-white surfaces.
- Thin borders in lavender, cream, or warm gray.
- Soft shadows.
- Compact internal padding.

Customer cards are more decorative and layered. CRM cards are cleaner and more data-dense.

# Form Controls

## Inputs

- Customer inputs use rounded fields with soft lavender borders and gentle focus glows.
- CRM inputs use cream/dark-surfaces with plum borders and focus highlight states.

## Selectors

- CRM select controls use the same rounded input pattern as text fields.
- Status dropdowns keep a compact, dashboard-oriented appearance.

## Buttons

- Form buttons follow the same visual rules as the broader button system.
- Tap targets are kept large enough for mobile use in the customer app.

## Step Navigation

- The customer app uses a sticky footer with Back and Next buttons.
- The stepper at the top is part of the navigation system and uses numbered nodes with active/completed states.
- Step navigation is designed for mobile-first progression.

# Bracelet Preview

## Background

- The customer bracelet preview uses a soft cream/lavender UI environment.
- The preview canvas is centered inside a rounded card.
- The summary/export preview area uses a light circular framing treatment.

## Preview Area

- The preview is centered in a `250x250` SVG canvas in the designer view.
- The bracelet composition is rendered as a loop with the center occupied by a summary badge.

## Spacing

- The canvas card uses compact internal padding.
- The preview area keeps breathing room around the bracelet ring so the stones are visually distinct.

## Alignment

- The bracelet preview is centered both horizontally and vertically within its card.
- The design favors radial symmetry and balanced spacing around the loop.

# Responsive Rules

## Mobile

- Mobile is the primary target.
- The customer app is built as a mobile-first experience with a narrow app frame and stacked sections.
- Controls are sized for touch and the layout is optimized for a smartphone viewport around `390px`.

## Tablet

- The customer app remains largely centered and compact.
- The CRM collapses its sidebar and adjusts navigation for mid-sized screens.

## Desktop

- The customer app keeps its mobile-style frame centered within a dark desktop background.
- The CRM uses a full dashboard layout with a fixed sidebar and larger content surfaces.

# Animation Rules

Current animations include:

- Landing page fade, slide, and sparkle motion.
- Step view fade-in.
- Stepper line progress transition.
- Button hover and press transitions.
- Modal pop-in and backdrop fade.
- Toast show/hide transitions.
- Spinner rotation for LIFF loading.
- Bead pop-in and pulse effects in the bracelet designer.
- CRM pulse indicators and subtle hover transitions.

Avoid unnecessary animation. The existing motion is already sufficient for feedback, polish, and state change visibility.

# UI Constraints

The following should not change without explicit approval:

- Keep the mobile-first layout.
- Preserve branding.
- Preserve spacing rhythm.
- Preserve typography hierarchy.
- Preserve bracelet preview composition.
- Preserve the current color families and token usage.
- Preserve the current rounded, luxurious visual language.
- Preserve the existing customer step flow and CRM dashboard structure.
- Preserve current button hierarchy and footer navigation behavior.
- Preserve current responsiveness for mobile, tablet, and desktop.

# Summary

The current design system is a mobile-first luxury jewelry UI built from soft cream, lavender, navy, and velvet-red tones, with rounded cards, serif branding accents, and restrained motion. The customer app is more expressive and decorative, while the CRM is more structured and data-focused, but both follow the same visual family.
