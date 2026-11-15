---
name: test-evidence-review
description: Audit the evidence behind a Pink/Cocos game change or delivery claim, separating logic, native integration, UI behavior and visual or animation acceptance. Use before declaring a game task complete or reviewing supplied validation records.
---

# Evidence review for Pink/Cocos

Decide whether the recorded evidence supports the stated outcome. Do not rerun everything by default; fill the material gaps for the actual change.

## Establish the project context

Read AGENTS.md, the requested acceptance criteria and active art/UX/slice decisions. Use `tools/game-studios/pink-cocos.project.json` and `node tools/game-studios/inspect.cjs --project .` when available. Verify actual engine/platform and distinguish current-run from historical evidence.

## Match claims to evidence

| Claim | Evidence to inspect |
| --- | --- |
| Rules/data | Observable assertions at the application/rules boundary, including relevant risk/cancel/save cases |
| Native integration | Actual Pink/Cocos build and scene/prefab/clip/import behavior; a TypeScript pass alone is insufficient |
| UI behavior | Real input, visible states, appropriate screenshots and resulting state; no second HTML implementation |
| Visual/feel | Actual engine images and timed motion/play evidence, plus explicit status for each required reviewer/signoff |
| Persistence | Dedicated QA storage, reload/resume behavior and no duplicate actions or loss of unrelated user saves |
| Performance | Measured conditions and results; no-error logs alone do not establish frame time or memory budgets |

For ordinary UI changes, screenshots and real interaction may be enough. When the task asks for art coherence, immersion, natural motion or game feel, classify it as **Visual/Feel** and keep the relevant visual acceptance explicit. Never downgrade that work to ordinary UI just to close it with screenshots.

Check evidence paths exist, timestamps/revision/platform are attributable, command exits are known, and screenshots were actually viewed. A clip file's existence does not prove somebody watched it. Frame counts and `sample: 60` do not prove smooth animation.

Separate these outcomes:

- **SUPPORTED**: the stated, bounded claim has sufficient evidence.
- **NEEDS EVIDENCE**: a material check, artifact, supported-platform run or explicit acceptance is absent.
- **FAILED**: observed results contradict the claim.
- **NOT APPLICABLE**: the criterion is outside the declared change, with a reason.

Report status per claim and an overall outcome; do not average away a failed or missing critical criterion. Record whose approval is present or pending and its source. Technical completion and final visual approval can have different statuses.

For existing assets preserve .meta/UUID/fileIds; compare protected hashes when the task promises not to change approved art or rules. Native references may live in serialized assets, not only code. Do not delete an apparently unused resource on this review's authority.

Write a concise evidence matrix and unresolved items to the configured verification record. Archive/read back according to AGENTS.md. Do not create an approval flow for unrelated low-impact work or claim an unobserved action completed. No Claude-specific hooks or agent tools are required. See [source and adaptation notes](SOURCE.md).
