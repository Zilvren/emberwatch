---
name: asset-spec
description: "Specify production assets for a Pink/Cocos game: dimensions, stable animation registration, native import references and acceptance checks. Use after an art direction is established or when commissioning an individual asset."
---

# Asset specifications for Pink/Cocos

Translate the active art bible into producible assets. This workflow creates specifications; a prompt or frame count is not a delivered drawing or a smooth animation.

## Establish the project context

Read AGENTS.md, the active art bible and existing asset specifications. Read `tools/game-studios/pink-cocos.project.json` when present and run `node tools/game-studios/inspect.cjs --project .` for current dimensions, native resource counts and protected asset hashes. Without that adapter, inspect the project's installed engine, paths and package scripts before choosing commands.

Preserve approved artwork, proportions and existing native identifiers. Keep user-confirmed constraints separate from suggested production values. Reuse the configured specification path/URI.

## Specify the requested assets

For each asset or genuinely shared family, provide:

| Field | Required decision |
| --- | --- |
| Identity and use | Asset ID, scene/prefab consumer, role in play, current vs proposed status |
| Visual contract | Approved reference, silhouette, palette/material, line treatment and forbidden identity changes |
| Geometry | Source size, frame/cell size, transparent padding, pivot/foot baseline, fixed scale and target display size |
| Delivery | Format, alpha, atlas/gutter/filter requirements based on the actual platform, filename and source location |
| Native integration | Import order, .meta/SpriteFrame/atlas UUIDs, prefab/clip consumer and explicit authoring command if needed |
| Acceptance | In-engine tests, contact sheet/clip evidence, reviewer and outstanding visual approval |

For character motion, specify intent, anticipation/contact/recovery, duration, sample timing, loop behavior, interruption and gameplay event timing. Frame count is a production choice, not a quality claim.

- Register the whole sequence to one canvas, foot baseline and scale. Do not normalize each frame by its own silhouette height.
- Keep face, hands, clothing and equipment consistent across frames. Check first/last loop continuity at normal speed and half speed.
- Distinguish drawn sprite frames from animated float keys, mesh breathing or transforms. Do not describe interpolated keys as separately drawn frames.
- Idle should avoid head/foot drift and whole-body squash unless the approved direction calls for it. Protect stable source art when correcting motion.
- Attack damage stays in application/rules commands; native animation events signal contact once. Validate completion, cancellation, pause and death terminal states.

For environments, specify camera/projection, actor scale, usable ground, quiet silhouette areas, horizon and crop behavior. For UI/items, specify actual play-size readability and all relevant interaction states rather than only a large illustration.

## Import and validate

Use Pink's installed SDK/import pipeline for new assets and assigned UUIDs. Preserve existing .meta and prefab fileIds. Do not assume power-of-two textures or Godot naming is universally required. Retain editable source/provenance where available.

Run the affected native scene and capture the result. For animation, inspect a timed clip; still images and a clip's `sample` field do not establish fluidity. Report exactly which assets were produced, imported, played and visually reviewed.

Write specifications to the project's existing location, archive/read back according to AGENTS.md, and hand real evidence to `$test-evidence-review`. Use available image/animation tools only when asset production is authorized; do not silently call a new paid service.

No Claude tool, Bash hook or separate agent team is required. See [source and adaptation notes](SOURCE.md).
