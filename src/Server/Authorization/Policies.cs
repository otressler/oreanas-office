namespace OreanasOffice.Server.Authorization;

// Policy names for RequireAuthorization(...). The campaign policies read the
// `campaignId` route value, and the session policies also `sessionId`; a session
// from another campaign fails them.
public static class Policies
{
    // The site admin (User.isAdmin): invites and password-reset links.
    public const string Admin = nameof(Admin);

    // Any member of the campaign, in any role.
    public const string CampaignMember = nameof(CampaignMember);

    // A member with role `dm`: create sessions, replace the join code, promote members.
    public const string CampaignDm = nameof(CampaignDm);

    // The session's DM or the campaign's default DM: make the session active, end
    // it, hand it to another DM.
    public const string SessionManager = nameof(SessionManager);

    // Only the session's DM: run encounters (stage 3 on).
    public const string SessionDm = nameof(SessionDm);

    // A member of the session's campaign, or a session spectator of that session: reads the
    // spectator screen's data. Reads the `sessionId` route value (SessionWatcherHandler).
    public const string SessionWatcher = nameof(SessionWatcher);
}
