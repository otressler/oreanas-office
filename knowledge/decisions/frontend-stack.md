---
type: Decision
title: Frontend stack
description: React + TypeScript single-page PWA built with Vite, with a Konva canvas board, served by the ASP.NET Core backend from the same container.
tags: [decision, architecture, frontend, pwa]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:30:00Z }
---

# Decision

The project owner accepted this stack on 2026-10-10. They know React, TypeScript and .NET.

# Stack

| Concern | Choice | Why |
|---------|--------|-----|
| UI | React + TypeScript | Largest ecosystem, the most mature canvas integration, widely known |
| Build | Vite, single-page app (no server rendering) | An offline PWA gains nothing from server rendering, and production stays one .NET container with no Node server |
| PWA | vite-plugin-pwa (Workbox) | Generates the service worker and manifest; caches the app shell so the app opens while the server wakes ([offline prep](/decisions/offline-prep-pwa.md)) |
| Board and editor canvas | Konva via react-konva | 2D scene graph with hit testing, layers, drag and touch events; plenty for a 40×40 grid with a few dozen tokens |
| Zoom and pan | Konva stage transforms with pointer events | Pinch-zoom and pan on phones ([playable map](/features/playable-map.md)) |
| Live sync | `@microsoft/signalr` | Official client for the backend hub ([realtime sync](/decisions/realtime-sync.md)) |
| Server data | TanStack Query | Caching, retries and "waking up" states |
| Board and editor state | Zustand | Small; the canvas can update without re-rendering the whole React tree |
| Offline drafts and sync | Dexie (IndexedDB) | Local drafts plus a queue of unsynced changes |
| API types | ASP.NET Core OpenAPI document → openapi-typescript | Request/response types are defined once, in C# |
| Styling | Tailwind CSS | Mobile-first |
| Tests | Vitest for logic, Playwright end-to-end | Playwright can drive two browser sessions to test live sync between "devices" |

# Hosting the frontend

- The build output is copied into the ASP.NET Core app's `wwwroot` and ships in the same container ([hosting](/decisions/hosting.md)). One address for site and API means sign-in cookies work without cross-site setup.
- The service worker caches only the app shell and static files. Map images and icons are cached by URL, because each asset's URL never changes. API calls, sign-in and SignalR are never cached.
- Locally, the Vite dev server forwards `/api` and `/hubs` to ASP.NET Core.

# Logic that runs only in the frontend

[Movement distance](/rules/movement-distance.md) is calculated only in the browser. The server never restricts movement, so there's no second C# implementation to keep in sync.

# Alternatives considered

| Option | Upside | Why not |
|--------|--------|---------|
| Blazor WebAssembly | C# on both ends, shared models | Every pan, drag and pinch on the canvas goes through JavaScript interop; heavy first download on phones; IndexedDB also needs interop |
| PixiJS instead of Konva | WebGL, fast with many sprites and effects | Lower-level for hit testing and editor tools; our boards are small |
| Svelte with svelte-konva | Smaller bundles, less boilerplate | Less mature canvas integration. A fine choice if the developers prefer Svelte |
| Next.js or SvelteKit with server rendering | — | Needs a Node server in production and doesn't help an offline PWA |
| Azure Static Web Apps for the frontend | Free | A separate address complicates cookie sign-in; one container is simpler |
