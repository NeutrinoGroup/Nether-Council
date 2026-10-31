---
name: Nether Council
description: Warm afterlife encounters in the confident color blocks of a festival wristband.
colors:
  ink: "#351a40"
  ground: "#f4c6ba"
  paper: "#fff3df"
  pumpkin: "#ffab5c"
  muted: "#d9b7d1"
  line: "#86637f"
typography:
  display-latin:
    fontFamily: "Bungee, sans-serif"
    fontSize: "60px"
    fontWeight: 400
    lineHeight: 1.06
    letterSpacing: "-0.025em"
  display-han:
    fontFamily: "Ma Shan Zheng, cursive"
    fontSize: "96px"
    fontWeight: 400
    lineHeight: 1.06
  opening:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "clamp(23px, 2.3vw, 34px)"
    lineHeight: 1.4
  caption:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "clamp(19px, 1.7vw, 26px)"
    lineHeight: 1.65
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 650
rounded:
  bar: "2px"
  control: "12px"
  conversation: "16px"
  conversation-mobile: "14px"
spacing:
  compact: "8px"
  small: "12px"
  inset: "16px"
  control-inline: "20px"
  group: "24px"
  section: "30px"
  column: "36px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "14px 20px"
  button-primary-hover:
    backgroundColor: "{colors.pumpkin}"
    textColor: "{colors.ink}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "14px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  button-stop:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "14px 20px"
  conversation:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.conversation}"
    padding: "40px 42px 0"
  notice:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "16px"
  audio-band:
    backgroundColor: "{colors.pumpkin}"
    height: "68px"
    padding: "12px 24px"
---

# Design System: Nether Council

## Overview

**Creative North Star: "The Festival Wristband"**

Broad aubergine, peach and pumpkin regions give Nether Council a warm party identity. Expressive Chinese and Latin character names carry the personality; conventional controls and readable system body text support a conversation in a dim room. The visual tone is playful and confident, with gentle teasing rather than menace.

This record describes the implemented web system in `apps/web/src/app/globals.css` and `apps/web/src/features/voice/VoiceTrial.tsx`. The voice trial is its first expression. Its particular two-column composition is a surface pattern, not a requirement for future roster, 3D or identity-card screens.

**Key Characteristics:**
- Broad, flat color regions with rounded conversation containers.
- Self-hosted expressive display lettering paired with readable bilingual body text.
- Plain controls with explicit state text, visible keyboard focus and recovery messages.
- A horizontal audio wristband whose movement reflects actual playback.

## Colors

The palette combines warm pale surfaces with aubergine structure and a pumpkin signal accent. Frontmatter values are normative; the source exposes the same names as CSS custom properties.

### Primary

- **Aubergine Ink** (`ink`): body text, navigation divider, primary and stop actions, conversation background, radio accent and waveform bars.
- **Pumpkin Signal** (`pumpkin`): the audio wristband, live-state text on the dark field, selection highlight and primary-action hover.

### Neutral

- **Peach Ground** (`ground`): page background and the mobile action strip.
- **Warm Paper** (`paper`): conversation text, primary-action text, notices and secondary-action hover.
- **Lilac Caption** (`muted`): supporting role descriptions, caption labels and the participant's transcript on aubergine.
- **Plum Line** (`line`): scrollbars within the dark transcript field; not the general border color.

### Named Rules

**The Paired Contrast Rule.** Use paper or lilac text on aubergine; use aubergine text on peach, paper and pumpkin. The live-state pumpkin text belongs on the aubergine conversation field.

## Typography

**Display Font:** Bungee for Latin character names; Ma Shan Zheng for Chinese character names. Both are self-hosted through Fontsource imports.

**Body Font:** the system sans-serif stack in the frontmatter, including PingFang SC and Microsoft YaHei for Chinese.

**Character:** the display pairing makes each language feel deliberate. Body text remains familiar and readable, including transcripts, controls and operational feedback.

### Hierarchy

- **Character display:** the `display-latin` and `display-han` roles share normal weight and tight leading. At the tablet breakpoint they become 44px and 80px; on phones they become 43px and 78px.
- **Opening:** fluid invitation text, balanced within a maximum width of 26ch; phones use 23px.
- **Caption:** fluid source-language transcript text, a maximum width of 65ch and a scrollable maximum height of 180px. Phones use 20px with 1.6 leading.
- **Body:** the body token describes participant captions and explanatory copy. Setup introductions use a larger 20px/1.7 treatment, becoming 16px/1.6 on phones.
- **Label:** field legends use the label token. Caption labels and permission details use 13px; live state uses 14px. Timing values use tabular numerals.

### Named Rules

**The Two Scripts Rule.** Match the character-name display face to the selected language; keep instructions, transcripts and buttons in the system body stack.

## Layout

The current voice surface uses a centered flex shell with a maximum width of 1600px and a minimum height of 100svh. Default horizontal padding is 40px. A flexible conversation region sits beside a 330px setup column with a 36px gap. The navigation is 82px tall with a single aubergine bottom rule. Conversation padding is asymmetric toward its flush audio band; content has 40px top and 42px horizontal insets.

At widths of at least 1500px the shell uses 64px horizontal padding, a 360px setup column and a 48px gap. At 900px and below, shell padding becomes 22px, setup width 260px and gap 22px; navigation becomes 70px tall and conversation insets shrink to 28px by 26px. Actions stack vertically.

At 640px and below, shell padding becomes 16px and navigation height 62px. Setup precedes the conversation in a vertical flow with a 24px gap. The conversation has 26px top and 24px horizontal padding and a final minimum height of 430px. Story examples move into a disclosure; the microphone permission note stays visible. Trial measurements are hidden. The action strip sticks to the viewport bottom on peach ground, and the start button fills the width. Live controls wrap and retain a 90px minimum width.

Spacing is grouped by purpose rather than a strict arithmetic scale: compact inline gaps, 12–16px small insets, 24px groups and 30–36px larger separations. Preserve clear separation between setup, transcript and actions when extending this surface.

## Elevation & Depth

The implemented system is flat: no box shadows, gradients, blur or raised panels. Broad color changes, a navigation divider, corner shape and whitespace establish hierarchy. Notices are paper patches on peach; the conversation is one large aubergine field. Hover uses a fill change rather than a lift.

### Named Rules

**The Flat Color Rule.** Build depth with the established color regions and spacing; keep controls and conversation containers free of decorative elevation.

## Shapes

Controls and notices share the control radius; the larger conversation container has its own gentler radius, reduced on phones. The microphone icon uses an inline stroked SVG. The live-state marker is a small outlined circle, filled during an active session. Waveform bars have only a slight rounding. Borders are thin and use the current foreground color; the navigation divider uses aubergine.

## Components

### Buttons

Plain, readable and large enough to operate during a conversation. Standard buttons have a one-pixel border and minimum height of 50px. The start action pairs its label with a 22px microphone SVG, has a 330px desktop minimum width and uses the primary tokens. Its hover changes to pumpkin. Secondary controls are transparent with paper hover. The stop action uses the dark fill, a separate horizontal margin and paper hover; it remains visually distinct from mute and interrupt.

Buttons, links and inputs receive a three-pixel aubergine focus outline with a five-pixel offset. Disabled buttons use 0.55 opacity and a not-allowed cursor. Mobile live controls use 12px padding and 13px text; their group wraps. Do not hide the stop action inside another control.

### Language Fields

Native radio inputs sit within a labelled fieldset. Each radio is 18px square with an aubergine accent; labels have at least 44px height on larger screens and 40px on phones. Language selection is disabled while the session is active. Keep native semantics and keyboard interaction.

### Conversation Container

One broad aubergine field groups the character heading, opening, live status, character transcript and optional participant transcript. Labels use lilac; the source transcript uses paper. Long transcripts wrap and scroll within their own limits. Status always includes words alongside the outlined or filled dot; do not rely on its color alone.

### Notices and Disclosures

Invitation and recovery messages share a paper container and the control radius. Recovery text is semibold; error content has alert semantics. Desktop notices use 16px padding; phones use 12px. Mobile opening-line suggestions and desktop trial measurements use native details/summary controls. Summaries receive the same three-pixel focus outline with a four-pixel offset.

### Navigation

A single horizontal row pairs a bold wordmark with a small contextual label. It has no raised background or navigation pills. The wordmark is text in the current implementation, not a fabricated link or logo asset.

### Audio Wristband

A full-width pumpkin band anchors the conversation field. Thirty-nine aubergine bars share the available width; their vertical scale follows measured playback RMS with individual amplitudes. Zero playback returns them to the same short baseline. The desktop band is 68px tall with a six-pixel gap; phones use 54px and a four-pixel gap. It is decorative and hidden from assistive technology because the adjacent status text provides the state.

Reduced motion fixes every bar at the baseline scale of 0.09. The playback sampler also supplies zero level when the preference is active. Preserve this behavior; no ambient or fabricated motion is part of this system.

## Do's and Don'ts

### Do:

- **Do** use the paired contrast assignments for text and its surrounding color field.
- **Do** match the character-name face to Chinese or Latin while keeping operational copy in the system body stack.
- **Do** retain native field, disclosure and button semantics with visible keyboard focus.
- **Do** represent live audio with measured playback and hold the wristband still for reduced motion.
- **Do** keep permission and error recovery copy visible where the participant needs it.

### Don't:

- **Don't** use lilac caption text as body copy on peach or paper.
- **Don't** replace descriptive status text with color or waveform movement alone.
- **Don't** add decorative shadows or glow to the flat color containers.
- **Don't** treat the voice trial's two-column arrangement as the required composition of every future screen.
- **Don't** substitute invented character portraits or glowing placeholders for unavailable assets.
