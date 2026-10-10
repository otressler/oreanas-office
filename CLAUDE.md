# Oreana's Office

A D&D battle map app: the DM builds a fight layout, an AI image model paints it, and players move tokens on their own devices in real time.

## Project knowledge lives in `knowledge/`

`knowledge/` is an Open Knowledge Format (OKF v0.2) bundle that holds the spec: domain model, features, game rules and decisions.

- Start at `knowledge/index.md`. Read the concepts relevant to a task before implementing it.
- If code and knowledge disagree, ask which one is right. Don't silently pick one.
- When a decision is made or changes, update its concept in `knowledge/decisions/` (the `decision:` field and the body), and add a dated entry to `knowledge/log.md`.
- Concepts you write get `status: draft` and `generated: { by: claude-code/<model>, at: <UTC time> }`. Only add `verified: { by: human:oliver.langschede, ... }` once the project owner has actually confirmed the content.
- Every concept needs YAML frontmatter with a `type`. `index.md` and `log.md` have no frontmatter, except `okf_version` in the root `index.md`. Keep each folder's `index.md` in sync when you add or rename concepts.
