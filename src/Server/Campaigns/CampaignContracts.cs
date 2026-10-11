namespace OreanasOffice.Server.Campaigns;

// Request and response types for /api/campaigns.

// The landing page: every campaign of the signed-in user and its active session.
public record CampaignSummaryResponse(Guid Id, string Name, CampaignRole MyRole, ActiveSessionSummary? ActiveSession);

public record ActiveSessionSummary(Guid Id, string Title, DateOnly Date, Guid DmUserId, string DmDisplayName);

public record CreateCampaignRequest(string Name);

// JoinCode is only sent to `dm` members; players get null.
public record CampaignResponse(
    Guid Id,
    string Name,
    Guid DefaultDmUserId,
    CampaignRole MyRole,
    string? JoinCode,
    Guid? ActiveSessionId,
    List<MemberResponse> Members);

public record MemberResponse(Guid UserId, string DisplayName, CampaignRole Role, DateTimeOffset JoinedAt);

public record JoinCampaignRequest(string Code);

public record JoinCodeResponse(string JoinCode);
