---
type: Decision
title: Auth
description: Users sign in with a local account or Google; players join campaigns with a join code.
tags: [decision, auth, security]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:45:10Z }
---

# Decision (set by the project owner)

Users sign in with a **local account** (email and password) or with **Google**. There are no other providers.

# Proposed details

- **Local accounts**: ASP.NET Core Identity with its standard password hashing ([tech stack](/decisions/tech-stack.md)). Never write our own.
- **Sessions**: cookie auth. The frontend is served from the same address as the API ([frontend stack](/decisions/frontend-stack.md)), so no tokens are stored in the browser.
- **Google**: OpenID Connect with an OAuth client from the Google Cloud Console, which is free. It needs redirect URIs for production and for `localhost` ([hosting](/decisions/hosting.md)).
- **Linking**: a signed-in user can connect Google to their local account from their profile. Accounts are never merged automatically by email address.
- **Password reset**: no email service at first. The site admin (the project owner, `User.isAdmin`) can create a one-time reset link and send it personally. If that gets tedious, add email through Azure Communication Services later.
- **Joining**: a user joins a campaign with its `joinCode` ([campaign](/domain/campaign.md)), which creates a [campaign member](/domain/campaign-member.md) with `role: player`.
- **Staying signed in**: devices keep a long-lived session, so on game night players only open the app.
