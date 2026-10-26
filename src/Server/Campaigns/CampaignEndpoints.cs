using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Campaigns;

// Campaigns and their members (knowledge/domain/campaign.md, campaign-member.md).
public static class CampaignEndpoints
{
    // A collision among 31^6 codes is rare; a handful of tries makes a second one
    // in a row practically impossible.
    private const int JoinCodeAttempts = 5;

    public static IEndpointRouteBuilder MapCampaignEndpoints(this IEndpointRouteBuilder app)
    {
        var campaigns = app.MapGroup("/api/campaigns").WithTags("Campaigns").RequireAuthorization();

        campaigns.MapGet("/", ListMyCampaigns);
        campaigns.MapPost("/", CreateCampaign);
        campaigns.MapPost("/join", JoinCampaign);

        var campaign = campaigns.MapGroup("/{campaignId:guid}");
        campaign.MapGet("/", GetCampaign).RequireAuthorization(Policies.CampaignMember);
        campaign.MapPut("/", UpdateCampaign).RequireAuthorization(Policies.CampaignDm);
        campaign.MapPost("/join-code", ReplaceJoinCode).RequireAuthorization(Policies.CampaignDm);
        campaign.MapPost("/members/{userId:guid}/promote", PromoteMember).RequireAuthorization(Policies.CampaignDm);

        return app;
    }

    private static async Task<Ok<List<CampaignSummaryResponse>>> ListMyCampaigns(
        ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var rows = await Summaries(db.CampaignMembers.Where(m => m.UserId == userId).OrderBy(m => m.Campaign.Name))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(await WithCharactersAsync(db, rows, userId, cancellationToken));
    }

    // The creator becomes the default DM and a member with role `dm`.
    private static async Task<Results<Created<CampaignResponse>, BadRequest<ApiError>>> CreateCampaign(
        CreateCampaignRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > Campaign.NameMaxLength)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.NameInvalid, "name"));
        }

        var userId = user.GetUserId();
        var now = time.GetUtcNow();
        var campaign = new Campaign
        {
            Name = name,
            DefaultDmUserId = userId,
            JoinCode = JoinCodes.Create(),
            CreatedAt = now,
        };
        campaign.Members.Add(new CampaignMember { UserId = userId, Role = CampaignRole.Dm, JoinedAt = now });
        db.Campaigns.Add(campaign);
        await SaveWithUniqueJoinCodeAsync(db, campaign, cancellationToken);

        var response = await LoadCampaignAsync(db, campaign.Id, userId, cancellationToken);
        return TypedResults.Created($"/api/campaigns/{campaign.Id}", response);
    }

    // Joins as `player`. Already a member: returns the campaign unchanged.
    private static async Task<Results<Ok<CampaignSummaryResponse>, BadRequest<ApiError>>> JoinCampaign(
        JoinCampaignRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var code = JoinCodes.Normalize(request.Code);
        var campaignId = code is null
            ? (Guid?)null
            : await db.Campaigns.Where(c => c.JoinCode == code).Select(c => (Guid?)c.Id).SingleOrDefaultAsync(cancellationToken);
        if (campaignId is not { } id)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.JoinCodeInvalid, "code"));
        }

        var userId = user.GetUserId();
        if (!await db.CampaignMembers.AnyAsync(m => m.CampaignId == id && m.UserId == userId, cancellationToken))
        {
            db.CampaignMembers.Add(new CampaignMember
            {
                CampaignId = id,
                UserId = userId,
                Role = CampaignRole.Player,
                JoinedAt = time.GetUtcNow(),
            });

            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException ex) when (UniqueIndex.IsViolation(ex))
            {
                // The same person joined twice at once (a double tap); the other
                // request added the membership, which is all this one wanted.
                db.ChangeTracker.Clear();
            }
        }

        var row = await Summaries(db.CampaignMembers.Where(m => m.CampaignId == id && m.UserId == userId))
            .SingleAsync(cancellationToken);
        return TypedResults.Ok((await WithCharactersAsync(db, [row], userId, cancellationToken))[0]);
    }

    private static async Task<Ok<CampaignResponse>> GetCampaign(
        Guid campaignId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await LoadCampaignAsync(db, campaignId, user.GetUserId(), cancellationToken));

    // Name and description; the cover has its own endpoints (CampaignCoverEndpoints).
    private static async Task<Results<Ok<CampaignResponse>, BadRequest<ApiError>>> UpdateCampaign(
        Guid campaignId,
        UpdateCampaignRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > Campaign.NameMaxLength)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.NameInvalid, "name"));
        }

        var description = request.Description?.Trim();
        if (description?.Length > Campaign.DescriptionMaxLength)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.DescriptionInvalid, "description"));
        }

        var campaign = await db.Campaigns.SingleAsync(c => c.Id == campaignId, cancellationToken);
        campaign.Name = name;
        campaign.Description = string.IsNullOrEmpty(description) ? null : description;
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(await LoadCampaignAsync(db, campaignId, user.GetUserId(), cancellationToken));
    }

    // The old code stops working at once.
    private static async Task<Ok<JoinCodeResponse>> ReplaceJoinCode(
        Guid campaignId, AppDbContext db, CancellationToken cancellationToken)
    {
        var campaign = await db.Campaigns.SingleAsync(c => c.Id == campaignId, cancellationToken);
        campaign.JoinCode = JoinCodes.Create();
        await SaveWithUniqueJoinCodeAsync(db, campaign, cancellationToken);
        return TypedResults.Ok(new JoinCodeResponse(campaign.JoinCode));
    }

    // Makes a member `dm`. Already `dm`: unchanged.
    private static async Task<Results<Ok<MemberResponse>, NotFound>> PromoteMember(
        Guid campaignId, Guid userId, AppDbContext db, CancellationToken cancellationToken)
    {
        var member = await db.CampaignMembers
            .Include(m => m.User)
            .SingleOrDefaultAsync(m => m.CampaignId == campaignId && m.UserId == userId, cancellationToken);
        if (member is null)
        {
            return TypedResults.NotFound();
        }

        if (member.Role != CampaignRole.Dm)
        {
            member.Role = CampaignRole.Dm;
            await db.SaveChangesAsync(cancellationToken);
        }

        return TypedResults.Ok(new MemberResponse(member.UserId, member.User.DisplayName, member.Role, member.JoinedAt));
    }

    // The join code is unique in the database; on the rare collision the save is
    // repeated with a fresh code. The campaign stays tracked as added or modified
    // after a failed save, so changing the code and saving again is enough.
    private static async Task SaveWithUniqueJoinCodeAsync(
        AppDbContext db, Campaign campaign, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return;
            }
            catch (DbUpdateException ex) when (UniqueIndex.IsViolation(ex) && attempt < JoinCodeAttempts)
            {
                campaign.JoinCode = JoinCodes.Create();
            }
        }
    }

    // Constructor projections can't be filtered or sorted afterwards, so callers
    // narrow the memberships first. WithCharactersAsync completes the rows.
    private static IQueryable<SummaryRow> Summaries(IQueryable<CampaignMember> memberships) =>
        memberships
            .Select(m => new SummaryRow(
                m.CampaignId,
                m.Campaign.Name,
                m.Role,
                m.Campaign.Description,
                m.Campaign.CoverAssetId,
                m.Campaign.Sessions
                    .Where(s => s.Status == SessionStatus.Active)
                    .Select(s => new ActiveSessionSummary(
                        s.Id,
                        s.Title,
                        s.Date,
                        s.DmUserId,
                        s.Dm.DisplayName,
                        s.Encounters
                            .Where(e => e.Status == EncounterStatus.Active)
                            .Select(e => new ActiveEncounterSummary(e.Id, e.Name))
                            .FirstOrDefault()))
                    .FirstOrDefault()));

    private sealed record SummaryRow(
        Guid Id, string Name, CampaignRole MyRole, string? Description, Guid? CoverAssetId, ActiveSessionSummary? ActiveSession);

    // The rows with their cards' characters, in one query for all campaigns. The colour index
    // counts in the order characters were added, like CampaignQueries.CharacterColorIndexesAsync.
    private static async Task<List<CampaignSummaryResponse>> WithCharactersAsync(
        AppDbContext db, List<SummaryRow> rows, Guid userId, CancellationToken cancellationToken)
    {
        var ids = rows.Select(r => r.Id).ToList();
        var characters = (await db.Characters.AsNoTracking()
                .Where(c => ids.Contains(c.CampaignId))
                .OrderBy(c => c.CreatedAt)
                .ThenBy(c => c.Id)
                .Select(c => new { c.CampaignId, c.Id, c.Name, c.Color, c.TokenAssetId, c.OwnerUserId })
                .ToListAsync(cancellationToken))
            .ToLookup(c => c.CampaignId);

        return
        [
            .. rows.Select(row => new CampaignSummaryResponse(
                row.Id,
                row.Name,
                row.MyRole,
                row.ActiveSession,
                row.Description,
                row.CoverAssetId is { } cover ? MapBackgrounds.Url(cover) : null,
                [
                    .. characters[row.Id]
                        .Select((c, index) => new CampaignCharacterSummary(
                            c.Id,
                            c.Name,
                            index,
                            c.Color,
                            c.TokenAssetId is { } portrait ? MapBackgrounds.Url(portrait) : null,
                            c.OwnerUserId == userId))
                        .OrderBy(c => c.Mine ? 0 : 1),
                ])),
        ];
    }

    // Only for members; the CampaignMember policy has checked that.
    private static async Task<CampaignResponse> LoadCampaignAsync(
        AppDbContext db, Guid campaignId, Guid userId, CancellationToken cancellationToken)
    {
        var campaign = await db.Campaigns
            .Where(c => c.Id == campaignId)
            .Select(c => new
            {
                c.Id,
                c.Name,
                c.DefaultDmUserId,
                c.JoinCode,
                c.Description,
                c.CoverAssetId,
                MyRole = c.Members.Where(m => m.UserId == userId).Select(m => m.Role).First(),
                ActiveSessionId = c.Sessions
                    .Where(s => s.Status == SessionStatus.Active)
                    .Select(s => (Guid?)s.Id)
                    .FirstOrDefault(),
            })
            .SingleAsync(cancellationToken);

        var members = await db.CampaignMembers
            .Where(m => m.CampaignId == campaignId)
            .OrderBy(m => m.Role == CampaignRole.Dm ? 0 : 1)
            .ThenBy(m => m.User.DisplayName)
            .Select(m => new MemberResponse(m.UserId, m.User.DisplayName, m.Role, m.JoinedAt))
            .ToListAsync(cancellationToken);

        return new CampaignResponse(
            campaign.Id,
            campaign.Name,
            campaign.DefaultDmUserId,
            campaign.MyRole,
            campaign.MyRole == CampaignRole.Dm ? campaign.JoinCode : null,
            campaign.ActiveSessionId,
            members,
            campaign.Description,
            campaign.CoverAssetId is { } cover ? MapBackgrounds.Url(cover) : null);
    }
}
