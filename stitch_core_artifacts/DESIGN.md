---
name: Warm Minimalist
colors:
  surface: '#fbf9f6'
  surface-dim: '#dbdad7'
  surface-bright: '#fbf9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f0'
  surface-container: '#efeeeb'
  surface-container-high: '#eae8e5'
  surface-container-highest: '#e4e2df'
  on-surface: '#1b1c1a'
  on-surface-variant: '#4d4540'
  inverse-surface: '#30312f'
  inverse-on-surface: '#f2f0ed'
  outline: '#7e756f'
  outline-variant: '#cfc4bd'
  surface-tint: '#635d5a'
  primary: '#181512'
  on-primary: '#ffffff'
  primary-container: '#2d2926'
  on-primary-container: '#96908b'
  inverse-primary: '#cdc5c0'
  secondary: '#635e56'
  on-secondary: '#ffffff'
  secondary-container: '#e6ded5'
  on-secondary-container: '#67625a'
  tertiary: '#161613'
  on-tertiary: '#ffffff'
  tertiary-container: '#2b2a27'
  on-tertiary-container: '#94918c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e9e1dc'
  primary-fixed-dim: '#cdc5c0'
  on-primary-fixed: '#1e1b18'
  on-primary-fixed-variant: '#4b4642'
  secondary-fixed: '#e9e1d8'
  secondary-fixed-dim: '#cdc5bc'
  on-secondary-fixed: '#1e1b16'
  on-secondary-fixed-variant: '#4b463f'
  tertiary-fixed: '#e6e2dd'
  tertiary-fixed-dim: '#cac6c1'
  on-tertiary-fixed: '#1c1b19'
  on-tertiary-fixed-variant: '#484743'
  background: '#fbf9f6'
  on-background: '#1b1c1a'
  surface-variant: '#e4e2df'
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 12px
  sidebar-width: 240px
---

## Brand & Style
The design system is rooted in a philosophy of "quiet precision." It targets high-end productivity and specialized professional tools where clarity and calm are paramount. The aesthetic merges **warm minimalism** with a **systematic, compact density**. 

The UI avoids the sterility of pure white/black by utilizing a sepia-influenced neutral palette, evoking the quality of premium stationery or architectural stone. Visual hierarchy is established not through loudness, but through rhythmic spacing, subtle tonal shifts, and razor-sharp typographic alignment. The emotional response should be one of focused composure and technical reliability.

## Colors
The palette is a sophisticated range of "Grey-Sepia" tones. 
- **Primary (#2D2926):** A deep, warm charcoal used for text and high-contrast actions. 
- **Secondary (#8C867E):** A muted stone tone for secondary information and icons.
- **Tertiary (#D6D2CD):** A soft parchment-grey for dividers, borders, and disabled states.
- **Neutral (#F2F0ED):** The foundational "Stone" background color, providing a warm, tactile base that reduces eye strain compared to pure white.

Surface variations are achieved by shifting between these tones rather than using traditional shadows.

## Typography
This design system utilizes **Inter** for its neutral, systematic clarity. The type scale is optimized for high information density. 
- Use **Display** and **Headline-LG** sparingly for top-level navigation headers.
- **Body-MD** is the workhorse for most interface text, providing a balance of legibility and compactness.
- **Label-SM** (all-caps) should be used for metadata, category headers in sidebars, and small functional triggers to create a distinct visual "texture" compared to body text.

## Layout & Spacing
The layout relies on a **Compact Fluid Grid**. 
- **Density:** We prioritize a tighter 4px base unit to allow for more data on screen without feeling cluttered.
- **Sidebar:** A fixed 240px slim sidebar on desktop, collapsing to a bottom-bar or drawer on mobile.
- **Panes:** Content is organized into borderless panes. Separation is achieved through subtle background color shifts (e.g., a Sidebar in `Tertiary` vs. a Main Stage in `Neutral`).
- **Margins:** Desktop margins are fixed at 40px (XL) to provide "breathing room" for the eyes, while internal component spacing remains tight (Gutter 12px).

## Elevation & Depth
This design system avoids traditional box-shadows. Depth is purely **tonal and structural**:
- **Level 0 (Background):** Base neutral tone (`#F2F0ED`).
- **Level 1 (Panes/Cards):** Achieved by a 1px solid stroke in `Tertiary` or a slight shift to a lighter/darker tint.
- **Interaction:** Hover states use a very subtle shift in background color (2-4% darker) rather than an elevation lift.
- **Nodes:** For spatial elements (node-based views), use razor-thin (1px) lines to connect items, maintaining a "blueprint" aesthetic.

## Shapes
The shape language is "Soft-Square." We use a minimal **0.25rem (4px)** radius for most elements (buttons, input fields, panes). This provides just enough softness to feel modern and approachable without losing the professional, architectural "edge" of a precision tool. 
- Large containers may scale to **0.5rem (8px)**, but never further. 
- Avoid pills or circles unless used for status indicators.

## Components
- **Buttons:** Primary buttons use the Primary color with white text. Secondary buttons are transparent with a 1px Tertiary border. Padding is compact: `8px 12px`.
- **Node-Based Elements:** Spatial nodes should be simple 1px-bordered boxes with a white background. Connection lines should be `Secondary` color, 1px wide.
- **List Rows:** Slim, 40px height rows. Use a 1px bottom border in `Tertiary`. On hover, the entire row background shifts slightly.
- **Input Fields:** Borderless with a bottom-only 1px stroke in `Secondary`, or a full 1px border in `Tertiary`. Use `Label-SM` for floating labels.
- **Sidebars:** Slim typography and low-contrast icons. Active states are indicated by a subtle vertical bar on the left edge rather than a full background fill.
- **Chips:** Small, rectangular with `Label-SM` text. Background is `Tertiary` with 20% opacity.