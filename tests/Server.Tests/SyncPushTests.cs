using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sync;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests;

// POST /api/sync/push (knowledge/decisions/offline-prep-pwa.md, "Sync protocol"): one
// answer per item, in its own transaction.
[Collection("App")]
public sealed class SyncPushTests(AppFixture fixture)
{
    private async Task<(Person Dm, Guid CampaignId)> DmWithCampaignAsync(string name = "Oreana")
    {
        var dm = await fixture.App.CreatePersonAsync(name);
        return (dm, (await dm.CreateCampaignAsync()).Id);
    }

    private static void AssertRejected(SyncItemResult result, ApiErrorCode code, string? field = null)
    {
        Assert.Equal(SyncOutcome.Rejected, result.Outcome);
        Assert.Equal(new ApiError(code, field), result.Error);
        Assert.Null(result.Server);
    }

    // Campaigns

    [Fact]
    public async Task A_campaign_made_offline_is_created_with_its_id_and_its_maker_as_dm()
    {
        var person = await fixture.App.CreatePersonAsync("Oreana");
        var id = Guid.NewGuid();

        var result = await person.PushOneAsync(NewCampaign(id, "  Die Gruft  "));

        Assert.Equal(SyncOutcome.Created, result.Outcome);
        Assert.Equal(new SyncServerItem(id, SyncItemKind.Campaign, id, 1, result.Server!.UpdatedAt, "Oreana", new SyncCampaignData("Die Gruft"), null, null, null), result.Server);
        var campaign = await person.GetCampaignAsync(id);
        Assert.Equal("Die Gruft", campaign.Name);
        Assert.Equal(6, campaign.JoinCode!.Length);
        Assert.Equal(person.Id, campaign.DefaultDmUserId);
        Assert.Equal([(person.Id, CampaignRole.Dm)], campaign.Members.Select(m => (m.UserId, m.Role)));
    }

    [Fact]
    public async Task Pushing_a_campaign_again_is_a_retry_and_changes_nothing()
    {
        var person = await fixture.App.CreatePersonAsync("Testperson");
        var id = Guid.NewGuid();
        var first = await person.PushOneAsync(NewCampaign(id, "Die Gruft"));

        var again = await person.PushOneAsync(NewCampaign(id, "Anderer Name"));

        Assert.Equal(SyncOutcome.Saved, again.Outcome);
        Assert.Equal(first.Server, again.Server);
        Assert.Equal("Die Gruft", (await person.GetCampaignAsync(id)).Name);
    }

    [Fact]
    public async Task A_campaign_id_of_someone_elses_campaign_is_taken()
    {
        var (_, campaignId) = await DmWithCampaignAsync();
        var stranger = await fixture.App.CreatePersonAsync("Yara");

        AssertRejected(await stranger.PushOneAsync(NewCampaign(campaignId)), ApiErrorCode.IdTaken);
    }

    [Fact]
    public async Task A_campaign_id_used_by_another_kind_is_taken()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var map = await dm.PushOneAsync(Map(campaignId));

        AssertRejected(await dm.PushOneAsync(NewCampaign(map.Id)), ApiErrorCode.IdTaken);
    }

    [Theory]
    [InlineData("   ")]
    [InlineData("Eine Kampagne mit einem viel zu langen Namen, der weit über achtzig Zeichen hinausgeht, ja")]
    public async Task A_campaign_needs_a_name_of_1_to_80_characters(string name)
    {
        var person = await fixture.App.CreatePersonAsync("Testperson");

        AssertRejected(await person.PushOneAsync(NewCampaign(Guid.NewGuid(), name)), ApiErrorCode.NameInvalid, "name");
    }

    [Fact]
    public async Task A_new_campaign_with_a_base_version_is_not_found()
    {
        var person = await fixture.App.CreatePersonAsync("Testperson");

        AssertRejected(await person.PushOneAsync(NewCampaign(Guid.NewGuid()) with { BaseVersion = 1 }), ApiErrorCode.ItemNotFound);
    }

    [Fact]
    public async Task A_campaign_its_map_and_an_encounter_go_in_one_push()
    {
        var person = await fixture.App.CreatePersonAsync("Oreana");
        var campaignId = Guid.NewGuid();
        var typeId = Guid.NewGuid();
        var mapId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();
        var token = Token(typeId, 1, 1);

        var results = await person.PushAsync(
            NewCampaign(campaignId),
            CreatureType(campaignId, typeId),
            Map(campaignId, mapId),
            Encounter(campaignId, mapId, encounterId, status: EncounterStatus.Ready, tokens: [token]));

        Assert.All(results, r => Assert.Equal(SyncOutcome.Created, r.Outcome));
        Assert.Equal([1, 1, 1, 1], results.Select(r => r.Server!.Version));
        var versions = await person.VersionsAsync(campaignId);
        Assert.Equal([typeId], versions.CreatureTypes.Select(v => v.Id));
        Assert.Equal([mapId], versions.BattleMaps.Select(v => v.Id));
        Assert.Equal([encounterId], versions.Encounters.Select(v => v.Id));
    }

    [Fact]
    public async Task Items_of_a_rejected_campaign_depend_on_it()
    {
        var person = await fixture.App.CreatePersonAsync("Testperson");
        var campaignId = Guid.NewGuid();
        var typeId = Guid.NewGuid();
        var mapId = Guid.NewGuid();

        var results = await person.PushAsync(
            NewCampaign(campaignId, " "),
            CreatureType(campaignId, typeId),
            Map(campaignId, mapId),
            Encounter(campaignId, mapId, tokens: [Token(typeId, 1, 1)]));

        AssertRejected(results[0], ApiErrorCode.NameInvalid, "name");
        Assert.All(results.Skip(1), r =>
        {
            AssertRejected(r, ApiErrorCode.DependencyRejected);
            Assert.Equal(campaignId, r.DependsOnId);
        });
    }

    [Fact]
    public async Task An_encounter_depends_on_its_map_and_creature_types_rejected_in_the_same_push()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var badMapId = Guid.NewGuid();
        var badTypeId = Guid.NewGuid();
        var goodMapId = Guid.NewGuid();
        var goodTypeId = Guid.NewGuid();
        var badMap = HallData() with { Width = 0 };

        var results = await dm.PushAsync(
            Map(campaignId, badMapId, data: badMap),
            CreatureType(campaignId, badTypeId, name: " "),
            Map(campaignId, goodMapId),
            CreatureType(campaignId, goodTypeId),
            Encounter(campaignId, badMapId),
            Encounter(campaignId, goodMapId, tokens: [Token(goodTypeId, 0, 0), Token(badTypeId, 1, 1)]));

        Assert.Equal(ApiErrorCode.LayoutInvalid, results[0].Error!.Code);
        Assert.Equal(ApiErrorCode.NameInvalid, results[1].Error!.Code);
        Assert.Equal([SyncOutcome.Created, SyncOutcome.Created], results[2..4].Select(r => r.Outcome));
        AssertRejected(results[4], ApiErrorCode.DependencyRejected);
        Assert.Equal(badMapId, results[4].DependsOnId);
        AssertRejected(results[5], ApiErrorCode.DependencyRejected);
        Assert.Equal(badTypeId, results[5].DependsOnId);
    }

    // Rights

    [Fact]
    public async Task Only_dm_members_of_the_campaign_may_push_its_items()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var player = await fixture.App.CreatePersonAsync("Brom");
        await player.JoinAsync((await dm.GetCampaignAsync(campaignId)).JoinCode!);
        var stranger = await fixture.App.CreatePersonAsync("Yara");

        var asPlayer = await player.PushOneAsync(CreatureType(campaignId));
        var asStranger = await stranger.PushOneAsync(Map(campaignId));
        var unknownCampaign = await dm.PushOneAsync(Map(Guid.NewGuid()));

        AssertRejected(asPlayer, ApiErrorCode.NotADm);
        AssertRejected(asStranger, ApiErrorCode.NotADm);
        AssertRejected(unknownCampaign, ApiErrorCode.NotADm);
    }

    [Fact]
    public async Task Rights_are_checked_at_the_moment_of_the_push()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var typeId = Guid.NewGuid();
        Assert.Equal(SyncOutcome.Created, (await dm.PushOneAsync(CreatureType(campaignId, typeId))).Outcome);
        await using (var scope = fixture.App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var promoted = await fixture.App.CreatePersonAsync("Yara");
            db.CampaignMembers.Add(new CampaignMember { CampaignId = campaignId, UserId = promoted.Id, Role = CampaignRole.Dm, JoinedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
            Assert.Equal(SyncOutcome.Saved, (await promoted.PushOneAsync(CreatureType(campaignId, typeId, size: CreatureSize.Large, baseVersion: 1))).Outcome);

            // The promoted DM leaves; offline edits made before are now refused.
            await db.CampaignMembers.Where(m => m.CampaignId == campaignId && m.UserId == promoted.Id).ExecuteDeleteAsync();
            AssertRejected(await promoted.PushOneAsync(CreatureType(campaignId, typeId, baseVersion: 2)), ApiErrorCode.NotADm);
        }
    }

    [Fact]
    public async Task Ids_of_another_campaign_are_taken()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var (otherDm, otherCampaignId) = await DmWithCampaignAsync("Yara");
        var typeId = Guid.NewGuid();
        var mapId = Guid.NewGuid();
        await otherDm.PushAsync(CreatureType(otherCampaignId, typeId), Map(otherCampaignId, mapId));

        var results = await dm.PushAsync(CreatureType(campaignId, typeId, baseVersion: 1), Map(campaignId, mapId), Map(campaignId, typeId));

        Assert.All(results, r => AssertRejected(r, ApiErrorCode.IdTaken));
    }

    [Fact]
    public async Task A_new_id_that_exists_as_another_kind_is_taken()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var typeId = (await dm.PushOneAsync(CreatureType(campaignId))).Id;

        AssertRejected(await dm.PushOneAsync(Map(campaignId, typeId)), ApiErrorCode.IdTaken);
        AssertRejected(await dm.PushOneAsync(Encounter(campaignId, Guid.NewGuid(), typeId)), ApiErrorCode.IdTaken);
    }

    [Fact]
    public async Task A_base_version_for_an_unknown_id_is_not_found()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();

        var results = await dm.PushAsync(
            CreatureType(campaignId, baseVersion: 2), Map(campaignId, baseVersion: 1), Encounter(campaignId, Guid.NewGuid(), baseVersion: 3));

        Assert.All(results, r => AssertRejected(r, ApiErrorCode.ItemNotFound));
    }

    // Creature types

    [Fact]
    public async Task A_creature_type_is_created_saved_and_versioned()
    {
        var (dm, campaignId) = await DmWithCampaignAsync("Oreana");
        var id = Guid.NewGuid();
        var archivedAt = new DateTimeOffset(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);

        var created = await dm.PushOneAsync(CreatureType(campaignId, id, "  Goblin ", CreatureSize.Small, 0, "grün", "feige"));
        var saved = await dm.PushOneAsync(CreatureType(campaignId, id, "Goblin", CreatureSize.Medium, 1, "grünlich", "mutig", archivedAt));

        Assert.Equal(SyncOutcome.Created, created.Outcome);
        Assert.Equal(1, created.Server!.Version);
        Assert.Equal(new SyncCreatureTypeData("Goblin", CreatureSize.Small, "grün", "feige", null), created.Server.CreatureType);
        Assert.Equal("Oreana", created.Server.UpdatedByDisplayName);
        Assert.Equal(SyncOutcome.Saved, saved.Outcome);
        Assert.Equal(2, saved.Server!.Version);
        Assert.Equal(new SyncCreatureTypeData("Goblin", CreatureSize.Medium, "grünlich", "mutig", archivedAt), saved.Server.CreatureType);
        Assert.True(saved.Server.UpdatedAt >= created.Server.UpdatedAt);
    }

    [Fact]
    public async Task A_stale_base_version_is_a_conflict_with_the_server_copy()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var id = (await dm.PushOneAsync(CreatureType(campaignId))).Id;
        var saved = await dm.PushOneAsync(CreatureType(campaignId, id, "Goblin", CreatureSize.Medium, 1, notes: "Gerät 1"));

        var stale = await dm.PushOneAsync(CreatureType(campaignId, id, "Hobgoblin", baseVersion: 1, notes: "Gerät 2"));
        var ahead = await dm.PushOneAsync(CreatureType(campaignId, id, "Hobgoblin", baseVersion: 5));

        Assert.Equal(SyncOutcome.Conflict, stale.Outcome);
        Assert.Equal(saved.Server, stale.Server);
        Assert.Equal(SyncOutcome.Conflict, ahead.Outcome);
        Assert.Equal("Goblin", (await dm.FetchOneAsync(campaignId, id)).CreatureType!.Name);
    }

    [Fact]
    public async Task A_creature_type_name_is_unique_per_campaign_ignoring_case()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var (otherDm, otherCampaignId) = await DmWithCampaignAsync("Yara");
        var goblin = await dm.PushOneAsync(CreatureType(campaignId, name: "Goblin"));
        var other = await dm.PushOneAsync(CreatureType(campaignId, name: "Ork"));

        var taken = await dm.PushOneAsync(CreatureType(campaignId, name: "gOBLIN"));
        var renamed = await dm.PushOneAsync(CreatureType(campaignId, other.Id, "GOBLIN", baseVersion: 1));
        var recased = await dm.PushOneAsync(CreatureType(campaignId, goblin.Id, "GOBLIN", baseVersion: 1));
        var elsewhere = await otherDm.PushOneAsync(CreatureType(otherCampaignId, name: "Goblin"));

        AssertRejected(taken, ApiErrorCode.CreatureTypeNameTaken, "name");
        Assert.Equal(goblin.Id, taken.ExistingCreatureTypeId);
        AssertRejected(renamed, ApiErrorCode.CreatureTypeNameTaken, "name");
        Assert.Equal(goblin.Id, renamed.ExistingCreatureTypeId);
        Assert.Equal(SyncOutcome.Saved, recased.Outcome);
        Assert.Equal(SyncOutcome.Created, elsewhere.Outcome);
    }

    [Fact]
    public async Task A_creature_type_needs_a_valid_name_and_short_texts()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();

        var results = await dm.PushAsync(
            CreatureType(campaignId, name: "  "),
            CreatureType(campaignId, name: new string('a', 41)),
            CreatureType(campaignId, name: "A", appearance: new string('a', 501)),
            CreatureType(campaignId, name: "B", notes: new string('a', 2001)),
            CreatureType(campaignId, name: new string('c', 40), appearance: new string('a', 500), notes: new string('a', 2000)));

        AssertRejected(results[0], ApiErrorCode.NameInvalid, "name");
        AssertRejected(results[1], ApiErrorCode.NameInvalid, "name");
        AssertRejected(results[2], ApiErrorCode.TextTooLong, "appearance");
        AssertRejected(results[3], ApiErrorCode.TextTooLong, "notes");
        Assert.Equal(SyncOutcome.Created, results[4].Outcome);
    }

    // Maps

    [Fact]
    public async Task A_map_is_stored_exactly_as_pushed()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var sourceId = Guid.NewGuid();
        var data = HallData("Halle", sourceId, new DateTimeOffset(2026, 10, 1, 12, 0, 0, TimeSpan.Zero));

        var created = await dm.PushOneAsync(Map(campaignId, data: data));

        Assert.Equal(SyncOutcome.Created, created.Outcome);
        Assert.Equal(ToJson(data), ToJson(created.Server!.Map));
    }

    [Fact]
    public async Task A_map_that_breaks_the_layout_rules_is_rejected_with_every_problem()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var layout = Hall() with
        {
            Features =
            [
                new LayoutFeature("f1", "Säule", "", 0, 0, 2, 2, 0, true),
                new LayoutFeature("f2", "Säule", "", 1, 1, 2, 2, 0, true),
            ],
            Entrances =
            [
                new LayoutEntrance("e1", EntranceKind.Entrance, "", [[0, 3]]),
            ],
        };

        var result = await dm.PushOneAsync(Map(campaignId, data: HallData("  ") with { Layout = layout }));

        AssertRejected(result, ApiErrorCode.LayoutInvalid);
        Assert.Equal(
            [LayoutProblemCode.NameMissing, LayoutProblemCode.FeatureOverlap],
            result.Problems!.Select(p => p.Code));
        Assert.Equal("f1", result.Problems![1].OtherId);
    }

    [Fact]
    public async Task A_map_is_saved_keeps_its_origin_and_trims_its_texts()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var id = Guid.NewGuid();
        var origin = Guid.NewGuid();
        await dm.PushOneAsync(Map(campaignId, id, data: HallData(copiedFromMapId: origin)));

        var saved = await dm.PushOneAsync(Map(campaignId, id, 1, HallData(" Große Halle ", Guid.NewGuid()) with { Scene = " Eine Halle " }));

        Assert.Equal(SyncOutcome.Saved, saved.Outcome);
        Assert.Equal(2, saved.Server!.Version);
        Assert.Equal(("Große Halle", "Eine Halle", origin), (saved.Server.Map!.Name, saved.Server.Map.Scene, saved.Server.Map.CopiedFromMapId));
    }

    // Encounters

    private sealed record Prepared(Person Dm, Guid CampaignId, Guid MapId, Guid TypeId);

    private async Task<Prepared> PreparedAsync()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var results = await dm.PushAsync(Map(campaignId), CreatureType(campaignId));
        return new Prepared(dm, campaignId, results[0].Id, results[1].Id);
    }

    [Fact]
    public async Task An_encounter_with_creatures_is_stored_in_the_pushed_order_with_elevations_from_the_map()
    {
        var p = await PreparedAsync();
        var tokens = new[] { Token(p.TypeId, 6, 1, "Goblin 1"), Token(p.TypeId, 0, 0, "Goblin 2"), Token(p.TypeId, 2, 3, "Ogre", CreatureSize.Large) };

        var created = await p.Dm.PushOneAsync(Encounter(p.CampaignId, p.MapId, status: EncounterStatus.Ready, tokens: tokens));

        Assert.Equal(SyncOutcome.Created, created.Outcome);
        var data = created.Server!.Encounter!;
        Assert.Equal((EncounterStatus.Ready, p.MapId, (Guid?)null, (EncounterMapCopy?)null), (data.Status, data.BattleMapId, data.SessionId, data.MapCopy));
        Assert.Equal(ToJson(tokens), ToJson(data.Tokens));
        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var stored = await db.Tokens.Where(t => t.EncounterId == created.Id).ToListAsync();
        Assert.Equal(1.5m, stored.Single(t => t.Label == "Goblin 1").Elevation);
        Assert.Equal(0m, stored.Single(t => t.Label == "Goblin 2").Elevation);
        Assert.All(stored, t => Assert.Equal(TokenKind.Creature, t.Kind));
    }

    [Fact]
    public async Task A_draft_may_have_misplaced_creatures_but_a_ready_encounter_may_not()
    {
        var p = await PreparedAsync();
        var onPillar = Token(p.TypeId, 4, 3);
        var offMap = Token(p.TypeId, 8, 0);
        var fine = Token(p.TypeId, 0, 0);
        var overlap = Token(p.TypeId, 0, 0);
        var halfOut = Token(p.TypeId, 7, 4, size: CreatureSize.Large);

        // A token id belongs to one encounter, so each push gets fresh ids.
        static SyncCreatureToken[] Fresh(params SyncCreatureToken[] tokens) => [.. tokens.Select(t => t with { Id = Guid.NewGuid() })];
        Task<SyncItemResult> Push(EncounterStatus status, params SyncCreatureToken[] tokens) =>
            p.Dm.PushOneAsync(Encounter(p.CampaignId, p.MapId, status: status, tokens: Fresh(tokens)));

        var draft = await Push(EncounterStatus.Draft, onPillar, offMap, overlap, fine, halfOut);
        var onPillarReady = await Push(EncounterStatus.Ready, fine, onPillar);
        var offMapReady = await Push(EncounterStatus.Ready, offMap);
        var overlapReady = await Push(EncounterStatus.Ready, fine, overlap);
        var halfOutReady = await Push(EncounterStatus.Ready, halfOut);
        var ready = await Push(EncounterStatus.Ready, fine, Token(p.TypeId, 1, 0));

        Assert.Equal(SyncOutcome.Created, draft.Outcome);
        AssertRejected(onPillarReady, ApiErrorCode.CreaturesMisplaced, "tokens[1]");
        AssertRejected(offMapReady, ApiErrorCode.CreaturesMisplaced, "tokens[0]");
        AssertRejected(overlapReady, ApiErrorCode.CreaturesMisplaced, "tokens[1]");
        AssertRejected(halfOutReady, ApiErrorCode.CreaturesMisplaced, "tokens[0]");
        Assert.Equal(SyncOutcome.Created, ready.Outcome);
    }

    [Fact]
    public async Task A_draft_becomes_ready_when_the_creatures_stand_validly()
    {
        var p = await PreparedAsync();
        var id = Guid.NewGuid();
        var goblin = Token(p.TypeId, 4, 3);
        await p.Dm.PushOneAsync(Encounter(p.CampaignId, p.MapId, id, tokens: [goblin]));

        var stillBad = await p.Dm.PushOneAsync(Encounter(p.CampaignId, p.MapId, id, 1, status: EncounterStatus.Ready, tokens: [goblin]));
        var moved = await p.Dm.PushOneAsync(Encounter(p.CampaignId, p.MapId, id, 1, status: EncounterStatus.Ready, tokens: [goblin with { X = 3 }]));

        AssertRejected(stillBad, ApiErrorCode.CreaturesMisplaced, "tokens[0]");
        Assert.Equal(SyncOutcome.Saved, moved.Outcome);
        Assert.Equal((2, EncounterStatus.Ready), (moved.Server!.Version, moved.Server.Encounter!.Status));
    }

    [Fact]
    public async Task The_token_set_is_replaced_and_ids_are_kept()
    {
        var p = await PreparedAsync();
        var id = Guid.NewGuid();
        var a = Token(p.TypeId, 0, 0, "A");
        var b = Token(p.TypeId, 1, 0, "B");
        var c = Token(p.TypeId, 2, 0, "C");
        await p.Dm.PushOneAsync(Encounter(p.CampaignId, p.MapId, id, tokens: [a, b]));

        var saved = await p.Dm.PushOneAsync(Encounter(p.CampaignId, p.MapId, id, 1, "Neuer Name", tokens: [c, b with { X = 5, Label = " B2 " }]));

        Assert.Equal(SyncOutcome.Saved, saved.Outcome);
        Assert.Equal(["C", "B2"], saved.Server!.Encounter!.Tokens.Select(t => t.Label));
        Assert.Equal([c.Id, b.Id], saved.Server.Encounter.Tokens.Select(t => t.Id));
        Assert.Equal(5, saved.Server.Encounter.Tokens[1].X);
        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.DoesNotContain(a.Id, await db.Tokens.Select(t => t.Id).ToListAsync());
    }

    [Fact]
    public async Task An_encounter_with_a_bad_name_status_map_or_token_is_rejected()
    {
        var p = await PreparedAsync();
        var (otherDm, otherCampaignId) = await DmWithCampaignAsync("Yara");
        var foreign = await otherDm.PushAsync(Map(otherCampaignId), CreatureType(otherCampaignId));
        var taken = Token(p.TypeId, 0, 0);
        await p.Dm.PushOneAsync(Encounter(p.CampaignId, p.MapId, tokens: [taken]));
        var sameTwice = Token(p.TypeId, 1, 0);

        var results = await p.Dm.PushAsync(
            Encounter(p.CampaignId, p.MapId, name: " "),
            Encounter(p.CampaignId, p.MapId, name: new string('a', 81)),
            Encounter(p.CampaignId, p.MapId, status: EncounterStatus.Active),
            Encounter(p.CampaignId, p.MapId, status: EncounterStatus.Ended),
            Encounter(p.CampaignId, foreign[0].Id),
            Encounter(p.CampaignId, Guid.NewGuid()),
            Encounter(p.CampaignId, p.MapId, tokens: [Token(p.TypeId, 0, 0), Token(foreign[1].Id, 1, 0)]),
            Encounter(p.CampaignId, p.MapId, tokens: [Token(Guid.NewGuid(), 1, 0)]),
            Encounter(p.CampaignId, p.MapId, tokens: [Token(p.TypeId, 0, 0, label: " ")]),
            Encounter(p.CampaignId, p.MapId, tokens: [Token(p.TypeId, 0, 0, label: new string('a', 41))]),
            Encounter(p.CampaignId, p.MapId, tokens: [sameTwice, sameTwice with { X = 2 }]),
            Encounter(p.CampaignId, p.MapId, tokens: [Token(p.TypeId, 3, 0, id: taken.Id)]),
            Encounter(p.CampaignId, p.MapId, tokens: [Token(p.TypeId, 3, 0, id: Guid.Empty)]));

        AssertRejected(results[0], ApiErrorCode.NameInvalid, "name");
        AssertRejected(results[1], ApiErrorCode.NameInvalid, "name");
        AssertRejected(results[2], ApiErrorCode.StatusInvalid, "status");
        AssertRejected(results[3], ApiErrorCode.StatusInvalid, "status");
        AssertRejected(results[4], ApiErrorCode.MapInvalid, "battleMapId");
        AssertRejected(results[5], ApiErrorCode.MapInvalid, "battleMapId");
        AssertRejected(results[6], ApiErrorCode.CreatureTypeInvalid, "tokens[1]");
        AssertRejected(results[7], ApiErrorCode.CreatureTypeInvalid, "tokens[0]");
        AssertRejected(results[8], ApiErrorCode.TokenInvalid, "tokens[0]");
        AssertRejected(results[9], ApiErrorCode.TokenInvalid, "tokens[0]");
        AssertRejected(results[10], ApiErrorCode.TokenInvalid, "tokens[1]");
        AssertRejected(results[11], ApiErrorCode.TokenInvalid, "tokens[0]");
        AssertRejected(results[12], ApiErrorCode.TokenInvalid, "tokens[0]");
    }

    [Fact]
    public async Task Archived_maps_and_types_are_accepted_by_a_new_encounter()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var archivedAt = DateTimeOffset.UtcNow;
        var results = await dm.PushAsync(
            Map(campaignId, data: HallData(archivedAt: archivedAt)), CreatureType(campaignId, archivedAt: archivedAt));

        var created = await dm.PushOneAsync(Encounter(campaignId, results[0].Id, status: EncounterStatus.Ready, tokens: [Token(results[1].Id, 0, 0)]));

        Assert.Equal(SyncOutcome.Created, created.Outcome);
    }

    [Fact]
    public async Task An_encounter_archived_on_the_device_is_stored_as_archived()
    {
        var p = await PreparedAsync();
        var id = Guid.NewGuid();
        var archivedAt = new DateTimeOffset(2026, 10, 2, 8, 30, 0, TimeSpan.Zero);
        await p.Dm.PushOneAsync(Encounter(p.CampaignId, p.MapId, id));

        var saved = await p.Dm.PushOneAsync(Encounter(p.CampaignId, p.MapId, id, 1, archivedAt: archivedAt));

        Assert.Equal(archivedAt, saved.Server!.Encounter!.ArchivedAt);
        var versions = await p.Dm.VersionsAsync(p.CampaignId);
        Assert.Contains(versions.Encounters, e => e.Id == id && e.Version == 2);
    }

    [Fact]
    public async Task An_active_or_ended_encounter_is_always_a_conflict()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var copy = await table.Dm.FetchOneAsync(table.CampaignId, table.Encounter.Id);
        var data = copy.Encounter!;
        SyncPushItem Push(int baseVersion, EncounterStatus status) => new(
            copy.Id, SyncItemKind.Encounter, table.CampaignId, baseVersion, null, null, null,
            new SyncEncounterData(data.Name + "!", data.BattleMapId, status, null, data.Tokens));
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        var active = await table.Dm.FetchOneAsync(table.CampaignId, copy.Id);

        var whileActive = await table.Dm.PushOneAsync(Push(active.Version, EncounterStatus.Draft));
        await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        var ended = await table.Dm.FetchOneAsync(table.CampaignId, copy.Id);
        var afterEnd = await table.Dm.PushOneAsync(Push(ended.Version, EncounterStatus.Ready));

        Assert.Equal(SyncOutcome.Conflict, whileActive.Outcome);
        Assert.Equal(EncounterStatus.Active, whileActive.Server!.Encounter!.Status);
        Assert.Equal(table.Session.Id, whileActive.Server.Encounter.SessionId);
        Assert.NotNull(whileActive.Server.Encounter.MapCopy);
        Assert.Equal(SyncOutcome.Conflict, afterEnd.Outcome);
        Assert.Equal(EncounterStatus.Ended, afterEnd.Server!.Encounter!.Status);
        Assert.Equal(ended.Version, afterEnd.Server.Version);
    }

    // Retries and races

    [Fact]
    public async Task A_push_repeated_after_a_lost_answer_is_a_conflict_that_equals_what_was_pushed()
    {
        var p = await PreparedAsync();
        var typeItem = CreatureType(p.CampaignId, name: "Ork");
        var mapItem = Map(p.CampaignId, data: HallData(copiedFromMapId: Guid.NewGuid()));
        var encounterItem = Encounter(p.CampaignId, p.MapId, status: EncounterStatus.Ready, tokens: [Token(p.TypeId, 3, 0, "B"), Token(p.TypeId, 1, 0, "A"), Token(p.TypeId, 2, 2, "C", CreatureSize.Large)]);
        var items = new[] { typeItem, mapItem, encounterItem };

        var first = await p.Dm.PushAsync(items);
        var second = await p.Dm.PushAsync(items);

        Assert.Equal([SyncOutcome.Created, SyncOutcome.Created, SyncOutcome.Created], first.Select(r => r.Outcome));
        Assert.Equal([SyncOutcome.Conflict, SyncOutcome.Conflict, SyncOutcome.Conflict], second.Select(r => r.Outcome));
        Assert.Equal(first.Select(r => ToJson(r.Server)), second.Select(r => ToJson(r.Server)));
        Assert.Equal(ToJson(typeItem.CreatureType), ToJson(second[0].Server!.CreatureType));
        Assert.Equal(ToJson(mapItem.Map), ToJson(second[1].Server!.Map));
        Assert.Equal(ToJson(encounterItem.Encounter!.Tokens), ToJson(second[2].Server!.Encounter!.Tokens));
    }

    [Fact]
    public async Task A_saved_push_repeated_after_a_lost_answer_shows_the_pushed_data_at_the_next_version()
    {
        var p = await PreparedAsync();
        var save = CreatureType(p.CampaignId, p.TypeId, "Goblin", CreatureSize.Medium, 1, "neu", "neu");

        var saved = await p.Dm.PushOneAsync(save);
        var again = await p.Dm.PushOneAsync(save);

        Assert.Equal(SyncOutcome.Saved, saved.Outcome);
        Assert.Equal(SyncOutcome.Conflict, again.Outcome);
        Assert.Equal(2, again.Server!.Version);
        Assert.Equal(ToJson(save.CreatureType), ToJson(again.Server.CreatureType));
    }

    [Fact]
    public async Task Two_pushes_on_the_same_base_version_cannot_both_save()
    {
        var p = await PreparedAsync();
        var encounterId = Guid.NewGuid();
        await p.Dm.PushOneAsync(Encounter(p.CampaignId, p.MapId, encounterId, tokens: [Token(p.TypeId, 0, 0)]));

        for (var round = 0; round < 3; round++)
        {
            var typeVersion = round + 1;
            var mapVersion = round + 1;
            var encounterVersion = round + 1;
            var pushes = await Task.WhenAll(
                Enumerable.Range(0, 2).Select(i => p.Dm.PushAsync(
                    CreatureType(p.CampaignId, p.TypeId, "Goblin", CreatureSize.Small, typeVersion, notes: $"Gerät {i}"),
                    Map(p.CampaignId, p.MapId, mapVersion, HallData($"Halle {i}")),
                    Encounter(p.CampaignId, p.MapId, encounterId, encounterVersion, $"Überfall {i}", tokens: [Token(p.TypeId, i, 0)]))));

            for (var item = 0; item < 3; item++)
            {
                var outcomes = pushes.Select(r => r[item].Outcome).Order().ToList();
                Assert.Equal([SyncOutcome.Saved, SyncOutcome.Conflict], outcomes);
            }
        }

        var encounter = await p.Dm.FetchOneAsync(p.CampaignId, encounterId);
        Assert.Equal(4, encounter.Version);
        Assert.Single(encounter.Encounter!.Tokens);
    }

    [Fact]
    public async Task The_same_new_item_pushed_twice_at_once_is_created_once()
    {
        var p = await PreparedAsync();
        var campaignId = Guid.NewGuid();
        var typeId = Guid.NewGuid();
        var tokenId = Guid.NewGuid();
        SyncPushItem[] items = [NewCampaign(campaignId), CreatureType(campaignId, typeId, "Wolf"), Map(campaignId, Guid.NewGuid())];

        var pushes = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => p.Dm.PushAsync(items)));

        Assert.Equal([SyncOutcome.Created, SyncOutcome.Saved], pushes.Select(r => r[0].Outcome).Order());
        Assert.Equal([SyncOutcome.Created, SyncOutcome.Conflict], pushes.Select(r => r[1].Outcome).Order());
        Assert.Equal([SyncOutcome.Created, SyncOutcome.Conflict], pushes.Select(r => r[2].Outcome).Order());

        // A token id pushed with two new encounters at once ends up in one of them.
        var tokenItems = new[] { Guid.NewGuid(), Guid.NewGuid() }
            .Select(id => Encounter(p.CampaignId, p.MapId, id, tokens: [Token(p.TypeId, 0, 0, id: tokenId)]))
            .ToArray();
        var tokenPushes = await Task.WhenAll(tokenItems.Select(item => p.Dm.PushOneAsync(item)));
        Assert.Equal([SyncOutcome.Created, SyncOutcome.Rejected], tokenPushes.Select(r => r.Outcome).Order());
        Assert.Contains(tokenPushes, r => r.Error?.Code == ApiErrorCode.TokenInvalid);
    }

    [Fact]
    public async Task The_same_creature_type_name_pushed_twice_at_once_is_taken_once()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();

        var pushes = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => dm.PushOneAsync(CreatureType(campaignId, name: "Troll"))));

        Assert.Equal(1, pushes.Count(r => r.Outcome == SyncOutcome.Created));
        Assert.All(
            pushes.Where(r => r.Outcome != SyncOutcome.Created),
            r => Assert.Equal(ApiErrorCode.CreatureTypeNameTaken, r.Error!.Code));
        var winner = pushes.Single(r => r.Outcome == SyncOutcome.Created);
        Assert.All(pushes.Where(r => r.Outcome != SyncOutcome.Created), r => Assert.Equal(winner.Id, r.ExistingCreatureTypeId));
    }

    // Partial success

    [Fact]
    public async Task One_conflict_does_not_stop_the_other_items()
    {
        var p = await PreparedAsync();
        await p.Dm.PushOneAsync(CreatureType(p.CampaignId, p.TypeId, "Goblin", CreatureSize.Medium, 1));
        var newMap = Guid.NewGuid();

        var results = await p.Dm.PushAsync(
            CreatureType(p.CampaignId, p.TypeId, "Goblin", CreatureSize.Large, 1),
            Map(p.CampaignId, newMap),
            CreatureType(p.CampaignId, name: " "),
            Encounter(p.CampaignId, newMap));

        Assert.Equal(
            [SyncOutcome.Conflict, SyncOutcome.Created, SyncOutcome.Rejected, SyncOutcome.Created],
            results.Select(r => r.Outcome));
    }

    // Auth and the version gate

    [Fact]
    public async Task Pushing_needs_a_signed_in_user()
    {
        var anonymous = fixture.App.CreateClient();
        var message = new HttpRequestMessage(HttpMethod.Post, "/api/sync/push")
        {
            Content = System.Net.Http.Json.JsonContent.Create(new SyncPushRequest([]), options: Json),
        };
        message.Headers.Add(SyncProtocol.VersionHeader, "1");

        var response = await anonymous.SendAsync(message);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
