---
name: art-bible
description: Establish or revise art direction for a Pink/Cocos game, including character, environment, material and native HUD coherence. Use for an art bible or a cross-scene style unification task.
---

# Art bible for Pink/Cocos

Turn an approved visual direction into production decisions that can be checked in the real engine. Preserve approved character identity and distinguish it from a proposed environment or UI treatment.

## Establish the project context

- Read the applicable AGENTS.md and existing art/UX decisions, including the project's knowledge store when required.
- If present, read `tools/game-studios/pink-cocos.project.json`. It maps artifact locations, confirmed constraints and native commands. Run `node tools/game-studios/inspect.cjs --project .` for current engine/resource facts.
- Otherwise inspect `.pink/settings.json`, `package.json`, build configuration and native assets before choosing paths or commands. A browser export is still a Cocos game; keep its Scene/Prefab/Animation workflow.
- Reuse the existing art bible URI/path. Do not create a parallel design authority. Record project, date, draft/confirmed status, source references and relevant asset/code paths.

## Make the direction actionable

Start with the requested scope and approved references. For each decision, identify whether it is user-confirmed, observed in current assets, or a proposed production rule.

Cover the sections needed by the task:

1. Visual promise and reading priorities at actual play size.
2. Palette roles, value structure, lighting direction and saturation limits.
3. Shape language, line weight and texture scale.
4. Character silhouettes, proportions, equipment and invariant identity.
5. Environment scale, playable ground, contact shadows and quiet regions behind actors/text.
6. Material relationships across characters, environments, items and HUD.
7. UI art direction: diegetic vs screen-space elements, type/icon treatment and motion restraint.
8. Export/import requirements, native resource references and known technical limits.

Work on characters and backgrounds together. Check actor readability against environment texture density, contrast and scale. A shared brown palette alone does not establish coherence. Separate UI material direction from UX interaction/readability and record conflicts between them.

Use actual asset dimensions and on-screen scale. Do not resize or regenerate approved artwork merely to make a sheet tidy. For generation/editing, use an available image tool under the user's authorization and retain source provenance; writing prompts is not producing assets.

## Validate and hand off

- Review an actual Cocos screen at the normal viewport and a supported smaller viewport. Inspect a neutral state, an action state and any overlay affected by the change.
- Check silhouette, ground contact, perspective, edges, text protection, material density and attention order. A source sheet cannot substitute for an in-engine composition.
- Capture identified screenshots or clips with build/scene/viewport context. State what was visually inspected and what remains unreviewed.
- Provide a short decision table and concrete next asset/UX tasks. Hand dimensions/animation constraints to `$asset-spec`, layout requirements to `$ux-design`, and evidence to `$test-evidence-review` when relevant.
- Preserve .meta UUIDs and prefab fileIds on existing assets. Import new resources with the installed Pink SDK before using their assigned references. Keep explicit authoring tools separate from ordinary builds.
- Save project documents and read back the actual knowledge-store URI when AGENTS.md requires it. Do not label a draft as approved or infer visual approval from tests.

This Codex adaptation runs in the current session with available tools. It does not require Claude agents, Bash hooks, an additional team, a commit, or repeated section approvals. See [source and adaptation notes](SOURCE.md).
