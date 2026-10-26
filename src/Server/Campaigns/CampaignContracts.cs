using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Campaigns;

// Request and response types for /api/campaigns.

// The home page: every campaign of the signed-in user, its card (description, cover and
// characters) and its active session. CoverUrl: the picked cover (/api/assets/{id}), null for
// the app's default picture. Characters: all of the campaign's characters, the signed-in
// user's own first, each group in the order they were added.
public record CampaignSummaryResponse(
    Guid Id,
    string Name,
    CampaignRole MyRole,
    ActiveSessionSummary? ActiveSession,
    string? Description,
    string? CoverUrl,
    List<CampaignCharacterSummary> Characters);

// A character on a campaign's card. ColorIndex and Color pick its ring colour as on the board
// (CharacterResponse); PortraitUrl: its picked portrait, null for the letter. Mine: the
// signed-in user owns it.
public record CampaignCharacterSummary(Guid Id, string Name, int ColorIndex, string? Color, string? PortraitUrl, bool Mine);

// ActiveEncounter: the fight players land on, if one is running.
public record ActiveSessionSummary(
    Guid Id, string Title, DateOnly Date, Guid DmUserId, string DmDisplayName, ActiveEncounterSummary? ActiveEncounter);

public record CreateCampaignRequest(string Name);

// PUT: `dm` members change the name and the description. Description: up to
// Campaign.DescriptionMaxLength characters; null or blank removes it.
public record UpdateCampaignRequest(string Name, string? Description = null);

// JoinCode is only sent to `dm` members; players get null. Description and CoverUrl as in
// CampaignSummaryResponse.
public record CampaignResponse(
    Guid Id,
    string Name,
    Guid DefaultDmUserId,
    CampaignRole MyRole,
    string? JoinCode,
    Guid? ActiveSessionId,
    List<MemberResponse> Members,
    string? Description,
    string? CoverUrl);

public record MemberResponse(Guid UserId, string DisplayName, CampaignRole Role, DateTimeOffset JoinedAt);

public record JoinCampaignRequest(string Code);

public record JoinCodeResponse(string JoinCode);
