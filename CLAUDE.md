# CLAUDE.md — Application Dock

Project-level conventions for AI agents working in this repo. Read this before touching any files.

## Story organisation

Stories live under `docs/stories/` in **per-app subfolders**, each with three status buckets:

```
docs/stories/
├── application-dock-general/   ← shell / platform stories (Epics 1.x)
│   ├── for-review/             ← status: Ready for Review
│   ├── done/                   ← status: Done
│   └── *.story.md              ← status: Draft (not yet started — stays in app root)
├── archery-tracker/            ← Archery Score Counter stories (Epics 2.x–9.x)
│   ├── for-review/
│   ├── done/
│   └── *.story.md
├── flash-cards/                ← Flash Cards app (future)
│   ├── for-review/
│   └── done/
└── <app-name>/                 ← one folder per new app; same three-bucket layout
    ├── for-review/
    ├── done/
    └── *.story.md
```

### Rules

- **Draft** stories (not yet started) sit directly in the app folder root.
- **Ready for Review** stories move to `for-review/`.
- **Done** stories move to `done/`.
- When adding a new app, create `docs/stories/<app-name>/` with empty `for-review/` and `done/` subfolders.
- Never place stories in `docs/stories/` root — always inside an app subfolder.

## Authoritative references

| Topic | File |
|-------|------|
| Full source tree + layer rules | `docs/architecture/source-tree.md` |
| Tech stack decisions | `docs/architecture/tech-stack.md` |
| Coding standards | `docs/architecture/coding-standards.md` |
| PRD | `docs/prd.md` |
| Epics | `docs/epics.md` |
| UX design | `docs/ux/DESIGN.md`, `docs/ux/EXPERIENCE.md` |
