using Microsoft.AspNetCore.Http.HttpResults;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;

namespace OreanasOffice.Server.Campaigns;

// Campaigns and their members (knowledge/domain/campaign.md, campaign-member.md).
public static class CampaignEndpoints
{
    public static IEndpointRouteBuilder MapCampaignEndpoints(this IEndpointRouteBuilder app)
    {
        var campaigns = app.MapGroup("/api/campaigns").WithTags("Campaigns").RequireAuthorization();

        campaigns.MapGet("/", ListMyCampaigns);
        campaigns.MapPost("/", CreateCampaign);
        campaigns.MapPost("/join", JoinCampaign);

        var campaign = campaigns.MapGroup("/{campaignId:guid}");
        campaign.MapGet("/", GetCampaign).RequireAuthorization(Policies.CampaignMember);
        campaign.MapPost("/join-code", ReplaceJoinCode).RequireAuthorization(Policies.CampaignDm);
        campaign.MapPost("/members/{userId:guid}/promote", PromoteMember).RequireAuthorization(Policies.CampaignDm);

        return app;
    }

    private static Task<Ok<List<CampaignSummaryResponse>>> ListMyCampaigns() =>
        throw new NotImplementedException();

    // The creator becomes the default DM and a member with role `dm`.
    private static Task<Results<Created<CampaignResponse>, BadRequest<ApiError>>> CreateCampaign(CreateCampaignRequest request) =>
        throw new NotImplementedException();

    // Joins as `player`. Already a member: returns the campaign unchanged.
    private static Task<Results<Ok<CampaignSummaryResponse>, BadRequest<ApiError>>> JoinCampaign(JoinCampaignRequest request) =>
        throw new NotImplementedException();

    private static Task<Ok<CampaignResponse>> GetCampaign(Guid campaignId) =>
        throw new NotImplementedException();

    // The old code stops working at once.
    private static Task<Ok<JoinCodeResponse>> ReplaceJoinCode(Guid campaignId) =>
        throw new NotImplementedException();

    // Makes a member `dm`. Already `dm`: unchanged.
    private static Task<Results<Ok<MemberResponse>, NotFound>> PromoteMember(Guid campaignId, Guid userId) =>
        throw new NotImplementedException();
}
