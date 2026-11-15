---
name: ux-review
description: Review a Pink/Cocos game's UX specification and native interface for readability, interaction states, input feedback and consistency with implemented rules. Use for a scoped UX review or an in-engine usability audit.
---

# UX review for Pink/Cocos

Give evidence-backed findings about the requested experience. Distinguish a specification review from an actual playthrough and from art-direction approval.

## Establish the project context

Read AGENTS.md, the active UX/art specifications and current implementation boundaries. Use `tools/game-studios/pink-cocos.project.json` and `node tools/game-studios/inspect.cjs --project .` when available; otherwise verify actual engine/assets/commands.

Record reviewed revision, build/scene, viewport, input method and available evidence. Use a separate QA browser profile and the game's temporary/no-save mode when available. Do not clear the user's saves to prepare a review.

## Review specification and actual behavior

Check the relevant items:

- The player can identify the current goal, valid action and consequence.
- Must-show information is legible, contextual information arrives at the right time, and overlays do not hide required action context.
- Native hit areas, hover/focus, pressed/selected, disabled reasons, busy locking and error feedback agree with what is visible.
- Drag, long-press, release outside, Escape/back, focus return and repeated input behave predictably where supported.
- Text and icons remain readable on the actual background and at supported smaller sizes; include long/localized text if affected.
- Destructive consequences are explicit, cancellation is free of unintended rule mutations, and confirmed risk choices remain possible.
- UX data and commands agree with the read model, active content, save behavior and confirmed gameplay. Do not validate an unimplemented formal system as shipped.
- Reduced-motion behavior and the scope of keyboard/touch/controller support are stated accurately.

For visual coherence, inspect the whole Cocos composition, not only documentation. Check actor/background scale, ground contact, contrast, line/texture density and HUD material against the art bible. Describe these as visual-review observations, not automatic accessibility or aesthetic certification.

## Report actionable findings

For each finding provide severity, exact screen/state or reproduction, evidence path, consequence, implementation owner and acceptance condition. Separate observed defects, open design decisions and improvements. Do not manufacture defects to fill a quota.

State reviewed and unreviewed paths. A passing test or screenshot existence is not a visual verdict. Retest corrected behavior and retain before/after evidence when the change is visible.

Use available tools in the current session; no specialist agent team is required. Changes within the user's authorized scope can proceed, but a review request alone does not authorize a new product direction or publication.

Write to the project's configured review location and archive/read back according to AGENTS.md. Hand evidence to `$test-evidence-review`; if the reviewed slice was not played, say so. See [source and adaptation notes](SOURCE.md).
