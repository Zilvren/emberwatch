---
name: ux-design
description: Design a Pink/Cocos game's screen flow, HUD information hierarchy and native interactions. Use for whole-screen layouts or component UX that must work inside the existing engine game.
---

# UX design for Pink/Cocos

Design around the player's current decision and scene, then choose the UI geometry. Reuse the game's native UI and command architecture.

## Establish the project context

Read AGENTS.md, existing UX/art decisions and the current playable scope. Use `tools/game-studios/pink-cocos.project.json` and `node tools/game-studios/inspect.cjs --project .` when available. Otherwise discover actual scene, prefab, input, build and preview paths.

Keep implemented rules, approved requirements and future proposals distinct. A Web desktop export does not authorize replacing the Cocos game with HTML controls. Write into the existing UX specification/URI instead of creating competing versions.

## Design the requested scope

For each screen or component, establish:

1. Player goal, entry condition and next meaningful action.
2. Must-show information, contextual information and information hidden until requested.
3. Attention order: scene/action focal point, immediate decision, supporting information.
4. Layout and layering at the project's design resolution and supported viewports.
5. Mouse/touch/keyboard behavior actually supported, focus, selection, drag/long-press, cancel and feedback.
6. Normal, hover/focus, pressed, disabled with reason, busy, empty, error and confirmation states as relevant.
7. Rule/read-model bindings, application commands, persistence effects and ownership of transient UI state.
8. Concrete acceptance scenarios and actual-engine evidence required.

Choose layout zones after information priorities. For scene-led play, preserve actor/action visibility and place supporting HUD where it does not compete. Derive component work from the whole composition; a tidy component sheet cannot prove the full screen works.

Use the current art bible for material, contrast and typography. Prefer readable content over distressed texture. Avoid invented rules or irreversible action semantics. Clarify consequences before inventory loss or progress reset; preserve already-confirmed risk choices.

## Map to native implementation

- Scene/Prefab owns authored hierarchy and fixed geometry; components own presentation and input behavior.
- Native Button/Card input produces interface intent, the router creates a game command, application/rules execute it, and the renderer reads the resulting state.
- Do not put a second rule engine in a UI component or store Node/SpriteFrame objects in saves.
- Preserve .meta UUIDs and prefab fileIds. Run explicit authoring tools only when the requested change needs them; ordinary builds must not regenerate layouts.

Do the reversible design/implementation work already authorized. Ask only about unresolved decisions that materially change scope or rules; do not force approval after every section.

Review an actual native screen at normal and supported smaller size. Check long text, busy input, overlays, cancellation and reduced-motion behavior where affected. Record unsupported input/platforms rather than claiming them.

Save the updated specification, archive and read back according to AGENTS.md. Use `$ux-review` for findings and `$test-evidence-review` for evidence completeness. See [source and adaptation notes](SOURCE.md).
