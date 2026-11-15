# Source and Pink/Cocos adaptation

- Upstream: Donchitos/Claude-Code-Game-Studios, MIT, copyright (c) 2026 Donchitos.
- Pinned commit: `abc0de79d6ceb0b5d7aa693945849b3937afbe6a`.
- Source: https://github.com/Donchitos/Claude-Code-Game-Studios/blob/abc0de79d6ceb0b5d7aa693945849b3937afbe6a/.claude/skills/ux-design/SKILL.md
- Adapted for Codex and Pink/Cocos by the The end project on 2026-11-15.
- Scope: preserve the upstream workflow's substantive design/review decisions; replace Claude agent orchestration, Bash/config injection and generic engine paths with available Codex tools, the project adapter and native Pink resources.
- This package is a self-contained adaptation, not an unchanged upstream skill. It does not install the upstream studio configuration, agents, hooks or project templates.
- Project-specific confirmed choices and artifact paths belong in `tools/game-studios/pink-cocos.project.json`; inspect the current project rather than applying The end's rules to unrelated games.
- Updates: review a new upstream revision, revise the project-maintained package, validate it, and compare any existing installed copy before replacement.
