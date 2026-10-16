# Oreana's Office

A D&D battle map app: the DM builds a fight layout, an AI image model paints it, and players move tokens on their own devices in real time.

## Stack

- Backend: .NET 10, ASP.NET Core, SignalR (in-process), ASP.NET Core Identity (local + Google), EF Core with Azure SQL. Decided.
- Frontend: React + TypeScript single-page PWA (Vite, vite-plugin-pwa), Konva canvas, served from the backend's `wwwroot`. Decided.

## Units

The app uses meters, never feet. One square is 1.5 m. Store distances and speeds as whole squares and convert to meters only for display. Elevation is stored in meters. See `knowledge/rules/movement-distance.md`.

## Environments

There is only one deployed environment: production, which scales to zero between sessions. Development happens locally. See `knowledge/decisions/hosting.md`. Never assume the server is always running: nothing important lives only in memory, and nothing polls the database.

## Project knowledge lives in `knowledge/`

`knowledge/` is an Open Knowledge Format (OKF v0.2) bundle that holds the spec: domain model, features, game rules and decisions.

- Start at `knowledge/index.md`. Read the concepts relevant to a task before implementing it.
- If code and knowledge disagree, ask which one is right. Don't silently pick one.
- When a decision is made or changes, update its concept in `knowledge/decisions/` (the `decision:` field and the body), and add a dated entry to `knowledge/log.md`.
- Concepts you write get `status: draft` and `generated: { by: claude-code/<model>, at: <UTC time> }`. Only add `verified: { by: human:oliver.langschede, ... }` once the project owner has actually confirmed the content.
- Every concept needs YAML frontmatter with a `type`. `index.md` and `log.md` have no frontmatter, except `okf_version` in the root `index.md`. Keep each folder's `index.md` in sync when you add or rename concepts.

## Repository layout and commands

- `src/Server`: ASP.NET Core app (`OreanasOffice.Server`). Features register through extension methods called from `Program.cs`.
- `src/web`: Vite + React app. Its build goes into the server's `wwwroot` inside the container.
- `tests/Server.Tests`: xUnit v3 tests on Microsoft Testing Platform (`global.json` sets the runner); integration tests use Testcontainers, so Docker must run.
- `infra/`: Bicep templates. Only the project owner provisions Azure; Claude writes templates and summarises resources and cost first (`knowledge/decisions/hosting.md`).
- Local development: `pwsh scripts/dev.ps1` (SQL Server and Azurite in Docker, backend on :5080, Vite on :5173 forwarding `/api` and `/hubs`).
- Phone tests: `pwsh scripts/phone.ps1` runs the production container behind a local Traefik at `https://dev.oreanas-office.otressler.de` (home network only, INWX credentials in `.env`); `-Stop` stops it.
- Test tiers: `pwsh scripts/test.ps1 -Tier unit|quick|full`. `unit` needs no Docker (about a minute), `quick` (default) skips the backend's real-time waits, and `full` is what CI runs. Use `unit` or `quick` while iterating and `full` once before handing work back. Backend classes that don't take `AppFixture` get `[Trait(TestCategory.Name, TestCategory.Unit)]`, and tests that wait on real time get `TestCategory.Slow`.
- Backend tests: `dotnet test` (filter with `dotnet test --filter-class "*.TableHubTests"` or `--filter-method`, not VSTest's `--filter`). Frontend: `npm test` and `npm run test:e2e` in `src/web`; `npm run test:e2e:backend` runs the `*.backend.spec.ts` specs against the real backend (E2E environment, Docker needed). Playwright gives each checkout its own ports and never reuses a server it didn't start, so a run that overlaps another in the same checkout fails at once; wait and rerun. Backend test classes run in parallel on one shared app: make your own users and campaigns, and put tests that depend on site-wide state (the image pipeline) in the `Images` collection.
- API types: building the server writes `src/web/src/api/openapi.json`; `npm run gen:api` turns it into `schema.d.ts`.
- EF migrations: `dotnet ef migrations add <Name> --project src/Server --output-dir Data/Migrations`.
- All interface text is German and lives in `src/web/src/text/de.ts`.
- Work happens on `stage/<n>-<name>` branches per `knowledge/implementation-plan.md`.
