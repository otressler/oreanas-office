---
type: Decision
title: Tech stack
description: .NET (ASP.NET Core) backend, chosen to fit Azure hosting; the frontend is a separate decision.
tags: [decision, architecture]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:10:00Z }
---

# Decision (set by the project owner)

Hosting is on Azure ([hosting](/decisions/hosting.md)), so the backend is **.NET**.

# Backend

| Concern | Choice |
|---------|--------|
| Runtime | .NET 10 (LTS), ASP.NET Core |
| Realtime | ASP.NET Core SignalR, in-process ([realtime sync](/decisions/realtime-sync.md)) |
| Sign-in | ASP.NET Core Identity with cookie auth, plus the Google handler ([auth](/decisions/auth.md)) |
| Data | EF Core with Azure SQL Database; SQL Server locally ([persistence](/decisions/persistence.md)) |
| API description | Built-in OpenAPI document, used to generate the frontend's types |
| Images | Azure Blob Storage SDK; Foundry through its OpenAI-compatible API |
| Packaging | One container that also serves the built frontend from `wwwroot` |

# Frontend

See [frontend stack](/decisions/frontend-stack.md) (proposed): a React + TypeScript PWA with a Konva canvas.

# Options that were considered

A Node/TypeScript backend was the alternative. With Azure hosting, ASP.NET Core has sign-in with Google, SignalR and SQL Server access built in, so it needs fewer extra libraries.
