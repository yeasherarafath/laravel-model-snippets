# 0.0.1 - Initial Release

- **Version detection**: Auto-detects Laravel version from `composer.json`. Shows only relevant snippets, badges deprecated ones with replacement hints.
- **82 snippets**: Everything from properties to polymorphic relations, pivot helpers, events, and change tracking.
- **Deprecation badges**: Old accessor/mutator, property casts, dates property now show `[Deprecated in X → Use Y]` when detected version matches.
- **Settings**: `laravelModelSnippets.laravelVersion` to override auto-detection.
- **Tech**: TypeScript, compiled to `out/`.