# Accepted

- [OKF knowledge base](okf-knowledge-base.md) - Project knowledge lives in this OKF bundle and is read before building
- [Hosting](hosting.md) - Scale-to-zero on Azure Container Apps with the free Azure SQL offer, about $1–2 a month before images
- [Tech stack](tech-stack.md) - .NET (ASP.NET Core) backend, chosen to fit Azure hosting
- [Frontend stack](frontend-stack.md) - React + TypeScript PWA built with Vite, Konva canvas, served from the backend container
- [Auth](auth.md) - Users sign in with a local account or Google; players join campaigns with a join code
- [Rules edition](rules-edition.md) - The group plays D&D 5e (2024): every step costs one square (1.5 m), no corner cutting
- [Play setting](play-setting.md) - In person, remote, and mixed sessions are all supported
- [UI language](ui-language.md) - The interface is German only; more languages are a backlog idea
- [Persistence](persistence.md) - Azure SQL Database (free offer) with EF Core, map layout as a JSON document, images in Blob Storage
- [Realtime sync](realtime-sync.md) - The server holds the board state and pushes confirmed moves over in-process SignalR in a single, scale-to-zero instance

# Proposed

- [Offline prep and PWA](offline-prep-pwa.md) - Installable PWA; the DM preps offline and syncs on demand, live play needs the server
- [Image generation approach](image-generation-approach.md) - The grid is the source of truth; AI paints from a colour-coded guide image
- [Backward compatibility](backward-compatibility.md) - Not enforced yet; once the project owner says so, releases keep working with older open app versions and existing data

# Open

- [Image budget](image-budget.md) - How much image generation may cost per map
