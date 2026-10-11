---
type: Decision
title: Auth
description: Users sign in with a local account or Google; new accounts need a time-limited invite link from the site admin; players join campaigns with a join code.
tags: [decision, auth, security]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-11T14:25:54Z }
---

# Decision (set by the project owner)

Users sign in with a **local account** (email and password) or with **Google**. There are no other providers.

**Registration is by invite only.** Nobody can create an account without a valid [registration invite](/domain/registration-invite.md):

- Only the site admin creates invite links.
- A link is valid for a fixed **4 hours** and can be used by any number of people in that time, so one link can be posted in a group chat. The admin can revoke it early.
- The link is needed for both kinds of account: registering locally, and the first Google sign-in that would create a new account. Signing in to an existing account never needs a link. The one exception is the configured admin address: its first Google sign-in creates the account without a link, otherwise nobody could create the first invite.
- An invite only creates the account. Joining a campaign still uses the campaign's join code.
- An expired or revoked link shows a German message asking the user to request a new one.

**Site admin.** The project owner's Google address is set in configuration (`Admin:Email`), never in the repository. A user gets `isAdmin` only when that address signs in through Google, which has verified it; a local account with the same address doesn't. Admin is site-wide and separate from campaign roles: it allows creating invite links and password-reset links, and gives no access to other people's campaigns.

# Details (confirmed by the project owner)

- **Local accounts**: ASP.NET Core Identity with its standard password hashing ([tech stack](/decisions/tech-stack.md)). Never write our own. Passwords need at least 8 characters and nothing else; Identity's standard lockout applies after repeated failures. No email confirmation, since there is no email service.
- **Sessions**: cookie auth. The frontend is served from the same address as the API ([frontend stack](/decisions/frontend-stack.md)), so no tokens are stored in the browser.
- **Staying signed in**: a sliding cookie valid for 180 days, renewed whenever the app is used, so on game night players only open the app. The cookie is protected with Data Protection keys in Blob Storage, so it survives restarts ([hosting](/decisions/hosting.md)).
- **Google**: OpenID Connect with an OAuth client from the Google Cloud Console, which is free. The callback path is `/api/auth/google/callback`, registered for `localhost`, the phone test address and production ([hosting](/decisions/hosting.md)). The client secret is a Container Apps secret, and locally a user secret.
- **Linking**: a signed-in user can connect Google to their local account from their profile. Accounts are never merged automatically by email address.
- **Password reset**: no email service at first. The site admin can create a one-time reset link and send it personally. If that gets tedious, add email through Azure Communication Services later.
- **Joining**: a user joins a campaign with its `joinCode` ([campaign](/domain/campaign.md)), which creates a [campaign member](/domain/campaign-member.md) with `role: player`. Leaving a campaign and removing members aren't supported yet.
