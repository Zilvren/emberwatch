---
name: vertical-slice
description: Define, build or assess a complete playable slice in an existing Pink/Cocos project. Use to validate game quality through native end-to-end play, rather than a new standalone prototype.
---

# Vertical slice for Pink/Cocos

Validate a representative playable loop at the requested quality. An existing tutorial can supply a regression slice without becoming a permanent limit on the production game.

## Establish the project context

Read AGENTS.md, current rules, art/UX decisions and implementation status. Use `tools/game-studios/pink-cocos.project.json` and `node tools/game-studios/inspect.cjs --project .` when present; otherwise verify native paths and commands.

Declare the slice's start/end, player actions, supported platform/input, quality questions and exclusions. Prefer an existing loop when the user asks for polish or unification. Do not add chapters, economy, failure costs or progression just to make the slice larger.

## Build or assess the slice

Trace the native loop through input, game command, rules, presentation and persistence. Identify the assets and UI required to answer the current quality questions. Reduce scope before lowering the agreed quality standard.

Use the installed Pink SDK, authored Scene/Prefab/Animation and the project's actual build script. Do not select a generic HTML/Web prototype because the export target is a browser. Keep native resource generation explicit and preserve existing identifiers.

Run appropriate logic checks, type checking and affected build/runtime checks. Play from the declared entry to exit through real controls. Exercise important cancellation, loss/risk, repeated-input and save/reload boundaries for the changed slice. Do not directly mutate game state to simulate a successful path.

Record commands, exit codes, platform, revision/dirty state, scenarios, screenshots/clips and failures. Historical reports are useful baselines but are not a fresh run. Check performance feel during real play; do not infer a frame-rate guarantee from zero runtime errors.

## Give a bounded verdict

Use one of:

- **PROCEED**: all critical questions have supporting play/evidence and the agreed acceptance is satisfied.
- **PIVOT**: specific evidence shows the approach needs a scoped design/implementation change.
- **KILL**: evidence supports stopping this candidate within the user's decision scope.
- **NOT ASSESSED**: no actual playthrough, critical evidence is missing, or required acceptance remains unresolved.

A critical failure prevents PROCEED. Report technical, UX, visual and production readiness separately where they differ. If final visual approval is outstanding, keep that gate open; a technically playable slice is not a signed-off final art direction. Do not invent a user's approval.

Write the verdict, evidence links and small next task list into the existing slice document. Archive/read back as required by AGENTS.md and use `$test-evidence-review` to audit claims. No Claude team orchestration, commit or release is required. See [source and adaptation notes](SOURCE.md).
