---
name: Nether Council
description: An intimate Halloween performance on a warm black-box stage.
colors:
  stage: "#11100f"
  bone: "#eee7d9"
  ash: "#bcb0a0"
  ember: "#f6a15d"
  seam: "#39342d"
  encounter: "#171410"
  field: "#1b1814"
  encounter-line: "#5b5144"
  light-action: "#874015"
typography:
  display-latin:
    fontFamily: '"Bodoni Moda", Georgia, serif'
    fontSize: "clamp(54px, 6.5vw, 96px)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  display-han:
    fontFamily: '"Ma Shan Zheng", cursive'
    fontSize: "clamp(64px, 7vw, 96px)"
    fontWeight: 400
    lineHeight: 1.16
    letterSpacing: "0"
  cast-name:
    fontFamily: '"Bodoni Moda", "Ma Shan Zheng", serif'
    fontSize: "clamp(22px, 2.2vw, 34px)"
    lineHeight: 1.2
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    lineHeight: 1.75
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "13px"
rounded:
  square: "0px"
spacing:
  compact: "8px"
  small: "12px"
  inset: "16px"
  group: "24px"
  paragraph: "32px"
components:
  entry-link:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    rounded: "{rounded.square}"
    padding: "12px 0"
  entry-link-hover:
    textColor: "{colors.ember}"
  language-button:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    rounded: "{rounded.square}"
    padding: "10px"
  language-button-hover:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.stage}"
  button-primary:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.field}"
    rounded: "{rounded.square}"
    padding: "14px 20px"
  button-primary-hover:
    backgroundColor: "{colors.ember}"
    textColor: "{colors.stage}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    rounded: "{rounded.square}"
    padding: "14px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.field}"
    textColor: "{colors.bone}"
  button-stop:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.field}"
    rounded: "{rounded.square}"
    padding: "14px 20px"
  button-stop-hover:
    backgroundColor: "{colors.field}"
    textColor: "{colors.bone}"
  navigation:
    backgroundColor: "{colors.stage}"
    textColor: "{colors.bone}"
    height: "112px"
    padding: "0 4.2vw"
  nickname-input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.bone}"
    rounded: "{rounded.square}"
    padding: "10px 12px"
  character-choice:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    rounded: "{rounded.square}"
    padding: "12px 0"
  character-choice-selected:
    backgroundColor: "transparent"
    textColor: "{colors.ember}"
  conversation:
    backgroundColor: "{colors.encounter}"
    textColor: "{colors.bone}"
    rounded: "{rounded.square}"
    padding: "40px 42px 0"
  cast-row:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    padding: "25px 0"
  audio-line:
    backgroundColor: "transparent"
    height: "36px"
---

# Design System: Nether Council

## Overview

**Creative North Star: "The Midnight Black-Box Theatre"**

A Chinese spirit welcomes a Halloween guest onto a near-black stage. Warm ivory type, pumpkin footlights and a freestanding character make the encounter intimate and lightly theatrical. The humor stays gentle and the ending warm; spacious display lettering invites a story while quiet instructions keep the conversation usable.

Continuous fields, open cast rows and a deliberately lit object establish the visual world. Native scrolling carries the home narrative; the encounter turns the same materials into a compact operating surface. The warm light finale marks a change in the story without introducing another visual identity.

**Key Characteristics:**
- Near-black stage, warm bone lettering and restrained pumpkin signals.
- Bodoni Moda Latin display paired with Ma Shan Zheng Chinese display.
- Real Meng Po geometry, existing character posters and an architectural light field.
- Open lists, fine seams and square interaction surfaces.
- Scroll-linked staging with small, separate interaction feedback.
- Readable preparation, captions, microphone controls and recovery messages.

This is a scan of the implemented home and encounter system in `apps/web/src/features/landing/`, `apps/web/src/app/globals.css` and `apps/web/src/features/voice/VoiceTrial.tsx`, following the approved direction in `docs/design/halloween-scroll-brief.md`. The frontmatter describes active theatre tokens and their encounter aliases. Legacy root CSS variables remain in the source; they have not all been migrated. Host received limited ground, shape and stage alignment, retaining its operational layout, Bungee character display and semantic accent colors. Those retained host choices are not a new global palette. This source-backed visual record does not establish real-device, conversation or performance acceptance.

## Colors

Warm dark neutrals carry the scene; pumpkin identifies the invitation, selection and direct feedback. The frontmatter owns exact color values.

### Primary

- **Pumpkin Footlight** (`ember`): the last hero line, entry rules and arrows, interactive emphasis, selected encounter character, live state and playback bars.
- **Burnished Action** (`light-action`): entry hover and keyboard focus within the bone finale, where the normal light-stage accent needs a darker partner.

### Neutral

- **Midnight Stage** (`stage`): the continuous home ground and encounter shell.
- **Warm Bone** (`bone`): main lettering on dark ground, the light finale and the filled encounter start action.
- **Soft Ash** (`ash`): narrative support, labels and secondary captions on dark ground.
- **Stage Seam** (`seam`): home dividers, cast rows, language control border and encounter navigation divider.
- **Conversation Shade** (`encounter`): the square encounter field and aligned host stage/caption regions.
- **Control Shade** (`field`): encounter input fill and secondary-control hover.
- **Encounter Line** (`encounter-line`): encounter separators and transcript scrollbars.

Home exposes `--stage`, `--bone`, `--ash`, `--ember` and `--seam` on its main element. The encounter maps the same material roles to scoped `--ground`, `--ink`, `--muted`, `--pumpkin`, `--paper` and `--line`. In that scope, `--ink` is light and `--paper` is dark; their legacy names must not be interpreted as color roles outside their scope. Existing GLB and poster colors remain asset content.

**The Stage Pairing Rule.** Use bone or ash text on the dark stage; use stage text on bone. Keep the light finale's dark focus and hover treatment.

## Typography

**Display Font:** self-hosted Bodoni Moda for Latin and Ma Shan Zheng for Chinese. **Body Font:** the system sans-serif stack in the frontmatter, including Chinese system fallbacks.

The serif's high contrast and the brush face provide two deliberate language voices. Operational text stays familiar and readable. Bodoni's italic file is imported, but the current display does not establish italic as a hierarchy role.

- **Display:** the frontmatter records home desktop sizes. The Chinese hero has looser leading than the Latin hero. Story and finale headings adapt the display size rather than introducing a new face.
- **Cast name:** display type on a single open row, with a quiet system-text role description.
- **Body:** home paragraphs use the body role and a maximum line length of 65ch; story and finale copy use 1.9 leading. Encounter transcripts retain their larger fluid 19–26px scale and 1.65 leading.
- **Label:** language choice and small operational text use system typography. Home season text is 12px with 0.08em tracking; tiny stage metadata stays subordinate to the actual invitation.
- **Responsive display:** at 900px, home Latin display is 52–70px and Chinese is 60–76px. At 600px, the hero uses 44–68px Latin or 64–84px Chinese; story and finale headings use 52px. Encounter Latin display retains its 60px / 44px / 31px desktop/tablet/phone scale with 1.1 leading; Chinese retains 96px / 80px / 64px with 1.06 leading.

**The Two Scripts Rule.** Match display type to the selected language; keep instructions, captions and controls in the system body stack. Retained host Bungee display is a scoped operational exception.

## Layout

Home uses a continuous, full-width stage with fluid horizontal insets (4.2vw). The desktop navigation is 112px tall. A sticky character stage sits to the right of the opening and story text, with a 49% width, 47% left margin, 84vh height and 6vh top offset. The opening and story use viewport-related vertical space; these measurements describe this home composition, not a required layout for future screens.

The cast pairs a 40% portrait column with open text rows and a 5vw gap. The finale uses two unequal columns and a 12vw gap on the bone field. At 900px, navigation and portrait dimensions reduce and cast role text moves beneath its name. At 600px, home becomes a single flow: invitation, inline 440px character stage, story, cast rows, finale. The auxiliary cast portrait disappears. Mobile narrative insets are 24px, with 22px navigation insets. At 1600px and above, opening/story left padding grows to 8vw and the stage narrows to 43%.

The encounter retains its centered 1600px maximum shell, two-column conversation/setup layout and 40px shell insets. Its 900px adaptation reduces insets and setup width. At 640px, a 100svh shell contains a scrollable middle and a separate normal-flow action footer. Compact character/language/nickname preparation precedes the idle stage; setup hides during an active session. Character choices become a horizontal scrolling text strip. Invitation requirements and runtime errors appear in the action footer alongside the microphone action.

The spacing tokens are observed recurring gaps and insets, not an invented arithmetic scale. Host retains its fixed control deck and its existing responsive constraints; this document does not certify that layout as fully redesigned.

## Elevation & Depth

Depth belongs primarily to the lit character and stage architecture. A radial warm field, an arched outline and an elliptical plinth establish the landing's physical setting. The plinth uses `0 22px 35px #0006`; this is a stage-object shadow, not a default surface elevation. Encounter controls and content rely on dark tonal differences and fine rules. The former blanket ban on gradients and shadows no longer describes this world.

GSAP ScrollTrigger drives the character's turn and lowering, the halo's contraction and a one-time story entrance on native scroll. Its scroll scrub is 0.6; the story enters over 1.1 seconds with `expo.out`. Framer Motion supplies entry-link hover/tap feedback. CSS sticky provides the anchoring; scrolling itself remains native. Reduced motion removes those decorative transitions and fixes the staged composition; the source requests demand rendering for the reduced-motion scene and pauses rendering offscreen. These are implementation behaviors, not a performance certification.

**The Physical Stage Rule.** Reserve atmospheric gradients and cast shadows for the character's setting; preserve flat, readable operating controls.

## Shapes

Square corners govern home controls and the encounter's buttons, fields, conversation and disclosures. One-pixel rules divide open rows and regions. The landing's arch and elliptical plinth are intentional architectural silhouettes, not rounded container styles. Encounter character selection is text with a two-pixel selected underline, not a filled card. Host deck controls are square, while retained badges, QR backing and celebration treatments retain their incumbent rounding.

## Components

### Entry Links and Buttons

Home entry links are full-width text actions with a fine pumpkin bottom rule and a thin authored SVG arrow. The baseline minimum height is 62px, becoming 54px on phones; hover changes the lettering to pumpkin. The finale inverts the treatment for its light ground. Framer Motion shifts the opening action 5px horizontally and the final action 3px vertically on hover, with a 0.98 tap scale; reduced motion removes these transforms.

The language button is an outlined square control with a bone fill and dark text on hover. Home keyboard focus is a two-pixel pumpkin outline with a seven-pixel offset; the finale uses the darker action color.

Encounter buttons retain a 50px minimum height and 14px by 20px padding. Start is bone-filled with dark text, changing to pumpkin on hover. Secondary actions are transparent with a dark hover fill. Stop remains a separately labelled filled action. Disabled buttons have 0.55 opacity and a not-allowed cursor. Encounter focus is a three-pixel pumpkin outline with a five-pixel offset. Phone controls wrap with 13px text and 12px padding.

### Navigation

Home navigation pairs a bilingual typographic wordmark with season text and a language control; the season text hides at 900px. The encounter keeps a compact single row with a fine seam divider and a Bodoni/Ma Shan Zheng wordmark. No fabricated logo asset or floating navigation panel is required.

### Cast Rows and Character Choices

The cast is a linked list with fine rules, a display name, a supporting role and an SVG arrow. Desktop hover or keyboard focus updates the existing portrait; phones retain the linked text rows. Rows are at least 88px tall on desktop and 86px on phones. Seven roles support voice; only Meng Po currently has real 3D geometry.

Encounter selection uses native radio semantics inside the underlined text strip. A selected item turns pumpkin and gains a two-pixel underline; focus receives an outline around its visible label. Each label retains a 44px minimum height. Language radios remain native, with pumpkin accents, and session-active fields are disabled.

### Fields and Feedback

The optional nickname field uses a square dark fill, bone text and a thin bone border; its type is 16px and its minimum height is 48px, becoming 44px on phones. Invitation and error copy are plain text with rules where appropriate, rather than colored notice cards. The footer version removes extra borders and padding to keep the reason for an unavailable microphone close to the action; runtime errors use pumpkin text and alert semantics.

### Conversation and Playback Line

The square conversation field groups display name, role, real character or existing poster, opening, worded live status and readable captions. Its desktop insets remain 40px by 42px, reducing at the encounter breakpoints. Captions wrap and scroll within bounded areas. The transparent 36px playback line has a fine top rule and square pumpkin bars; their scale follows measured playback rather than fabricated activity. Reduced motion holds the bars at baseline while direct speech-mouth feedback remains available in the voice scene.

### Character Stage and Fallback

Home loads the existing Meng Po GLB on a transparent canvas with warm directional lighting. A matching existing poster remains while loading or after a boundary failure, with a visible localized loading/failure label. The encounter remains accessible when home 3D is unavailable. Other cast images are posters; do not imply additional models exist. The landing turns the whole model as a staged object; voice playback uses the existing independently driven mouth. Do not describe this as a facial rig.

### Exported Identity and Host Exceptions

The identity card remains an exportable story artifact with PNG and QR output; it is not the container grammar for the surrounding interface. Host keeps its dense operating deck, status badges, semantic action colors, larger captions and Bungee display. Its ground, square stage regions and square deck controls align with the new world; retained operational patterns are documented exceptions, not a reason to spread them through the home narrative.

## Do's and Don'ts

### Do:

- **Do** preserve the stage, bone and pumpkin pairing, including the dark focus treatment on the light finale.
- **Do** use Bodoni Moda and Ma Shan Zheng for their respective display scripts and system text for operation.
- **Do** build new narrative regions with continuous fields, open rows and deliberate whitespace.
- **Do** retain native scrolling, keyboard focus, reduced-motion alternatives and useful poster/error states.
- **Do** keep microphone permission, unavailable-action reasons and recovery text close to the action.
- **Do** state seven voice roles and one current real 3D character accurately.
- **Do** treat host operational typography and accents as limited retained exceptions.

### Don't:

- **Don't** reintroduce a card-grid scaffold or icon-feature boxes into the approved home narrative.
- **Don't** interpret legacy root token names as the active theatre palette or claim all globals were migrated.
- **Don't** replace unavailable character geometry with invented portraits or imply posters are 3D.
- **Don't** move display lettering into long captions or operating instructions.
- **Don't** substitute movement or color alone for worded session state and error recovery.
