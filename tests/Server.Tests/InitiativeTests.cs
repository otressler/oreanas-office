using OreanasOffice.Server.Api;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sync;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using Mode = OreanasOffice.Server.Encounters.InitiativeRollMode;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests;

// The initiative list (knowledge/features/initiative.md): the session DM rolls, saves and
// clears it on the table hub; it is saved on the encounter and reaches nobody else.
public sealed class InitiativeTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    // The goblins' type gets +2, and the ogre its own +5 with advantage, before the fight starts.
    private static async Task PrepareAsync(EncounterTable table)
    {
        var encounter = await table.Dm.FetchOneAsync(table.CampaignId, table.Encounter.Id);
        var data = encounter.Encounter!;
        var goblin = data.Tokens.Single(t => (t.X, t.Y) == (5, 1));
        var type = await table.Dm.FetchOneAsync(table.CampaignId, goblin.CreatureTypeId);
        var typed = await table.Dm.PushOneAsync(CreatureType(
            table.CampaignId, type.Id, type.CreatureType!.Name, type.CreatureType.Size, type.Version, initiativeModifier: 2));
        Assert.Equal(SyncOutcome.Saved, typed.Outcome);

        var tokens = data.Tokens
            .Select(t => (t.X, t.Y) == (1, 3) ? t with { InitiativeModifier = 5, InitiativeRollMode = Mode.Advantage } : t)
            .ToArray();
        var pushed = await table.Dm.PushOneAsync(Encounter(
            table.CampaignId, table.Session.Id, data.BattleMapId, encounter.Id, encounter.Version, data.Name, data.Status, data.ArchivedAt, tokens));
        Assert.Equal(SyncOutcome.Saved, pushed.Outcome);
    }

    private static Task<InitiativeRollResult> RollAsync(FogTestClient device, Guid encounterId) =>
        device.InvokeAsync<InitiativeRollResult>(nameof(ITableHub.RollInitiative), encounterId);

    private static Task<InitiativeResult> SetAsync(FogTestClient device, Guid encounterId, params InitiativeEntry[] entries) =>
        device.InvokeAsync<InitiativeResult>(nameof(ITableHub.SetInitiative), new SetInitiativeRequest(encounterId, [.. entries]));

    private static Task<InitiativeResult> ClearAsync(FogTestClient device, Guid encounterId) =>
        device.InvokeAsync<InitiativeResult>(nameof(ITableHub.ClearInitiative), encounterId);

    private static InitiativeEntry Character(Guid tokenId, int? value) => new(tokenId, value, 0, Mode.Normal, []);

    private static InitiativeEntry Creature(Guid tokenId, int roll, int modifier) => new(tokenId, roll + modifier, modifier, Mode.Normal, [roll]);

    // Aria 18, Goblin 15, Thorin (not told yet), Ogre 9: a list in an order the DM chose.
    private static InitiativeEntry[] SomeList(RunningFight fight) =>
        [Character(fight.Aria, 18), Creature(fight.Goblin, 13, 2), Character(fight.Thorin, null), Creature(fight.Ogre, 4, 5)];

    [Fact]
    public async Task A_roll_uses_each_creature_s_own_modifier_or_its_type_s_and_saves_nothing()
    {
        var fight = await App.StartFightAsync(PrepareAsync);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        var rolled = await RollAsync(dm, fight.EncounterId);

        Assert.Null(rolled.Error);
        var entries = rolled.Entries!;
        Assert.Equal([fight.Aria, fight.Thorin], entries.Take(2).Select(e => e.TokenId).Order());
        Assert.All(entries.Take(2), e => Assert.Equal((null, 0, Mode.Normal, 0), (e.Value, e.Modifier, e.Mode, e.Rolls.Count)));
        var goblin = entries.Single(e => e.TokenId == fight.Goblin);
        Assert.Equal((2, Mode.Normal), (goblin.Modifier, goblin.Mode));
        Assert.InRange(Assert.Single(goblin.Rolls), 1, 20);
        Assert.Equal(goblin.Rolls[0] + 2, goblin.Value);
        var ogre = entries.Single(e => e.TokenId == fight.Ogre);
        Assert.Equal((5, Mode.Advantage, 2), (ogre.Modifier, ogre.Mode, ogre.Rolls.Count));
        Assert.Equal(ogre.Rolls.Max() + 5, ogre.Value);

        var board = await fight.Table.Dm.BoardAsync(fight);
        Assert.Equal(new InitiativeView(0, null), board.Initiative);
    }

    [Fact]
    public async Task The_saved_list_reaches_the_session_DM_alone()
    {
        var fight = await App.StartFightAsync();
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        dm.FenceRow = 2;

        var result = await SetAsync(dm, fight.EncounterId, SomeList(fight));

        Assert.Null(result.Error);
        Assert.Equal(1, result.Change!.Initiative.Version);
        var changed = Assert.Single(await dm.WaitForAsync(nameof(ITableClient.InitiativeChanged)));
        Assert.Equal(1, changed.GetProperty("initiative").GetProperty("version").GetInt32());
        var board = await fight.Table.Dm.BoardAsync(fight);
        Assert.Equal(1, board.Initiative!.Version);
        Assert.Equal(SomeList(fight).Select(e => (e.TokenId, e.Value)), board.Initiative.Entries!.Select(e => (e.TokenId, e.Value)));

        // Nobody else hears of it or gets it with the board, not even another `dm` member or
        // the session DM's own players' view.
        await player.FenceAsync(dm, fight.Aria);
        Assert.Empty(player.Of(nameof(ITableClient.InitiativeChanged)));
        Assert.Null((await fight.Table.Player.BoardAsync(fight)).Initiative);
        Assert.Null((await fight.Table.SecondDm.BoardAsync(fight)).Initiative);
        Assert.Null((await fight.Table.Dm.PlayerBoardAsync(fight)).Initiative);
        Assert.Equal(ApiErrorCode.NotSessionDm, (await SetAsync(player, fight.EncounterId, SomeList(fight))).Error);
        Assert.Equal(ApiErrorCode.NotSessionDm, (await RollAsync(player, fight.EncounterId)).Error);
        Assert.Equal(ApiErrorCode.NotSessionDm, (await ClearAsync(player, fight.EncounterId)).Error);
    }

    [Fact]
    public async Task A_list_that_names_other_tokens_or_impossible_rolls_is_rejected()
    {
        var fight = await App.StartFightAsync();
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        InitiativeEntry[][] broken =
        [
            [Character(Guid.NewGuid(), 10)],
            [Character(fight.Aria, 10), Character(fight.Aria, 12)],
            [Character(fight.Aria, InitiativeRules.ValueMax + 1)],
            [new InitiativeEntry(fight.Goblin, 21, 0, Mode.Normal, [21])],
            [new InitiativeEntry(fight.Goblin, 30, InitiativeRules.ModifierMax + 1, Mode.Normal, [9])],
            [new InitiativeEntry(fight.Goblin, 12, 0, Mode.Normal, [12, 3])],
        ];

        foreach (var entries in broken)
        {
            Assert.Equal(ApiErrorCode.InitiativeInvalid, (await SetAsync(dm, fight.EncounterId, entries)).Error);
        }

        Assert.Equal(new InitiativeView(0, null), (await fight.Table.Dm.BoardAsync(fight)).Initiative);
    }

    [Fact]
    public async Task Clearing_switches_initiative_off_and_a_continued_session_keeps_the_list()
    {
        var fight = await App.StartFightAsync();
        await using (var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId))
        {
            Assert.Null((await SetAsync(dm, fight.EncounterId, SomeList(fight))).Error);
        }

        await fight.Table.Dm.EndSessionAsync(fight.CampaignId, fight.Table.Session.Id);
        await fight.Table.Dm.ActivateSessionAsync(fight.CampaignId, fight.Table.Session.Id);
        var continued = await fight.Table.Dm.BoardAsync(fight);
        Assert.Equal(SomeList(fight).Select(e => e.TokenId), continued.Initiative!.Entries!.Select(e => e.TokenId));

        await using var again = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        var cleared = await ClearAsync(again, fight.EncounterId);
        Assert.Equal(new InitiativeView(2, null), cleared.Change!.Initiative);
        Assert.Equal(new InitiativeView(2, null), (await fight.Table.Dm.BoardAsync(fight)).Initiative);
    }

    [Fact]
    public async Task Spawned_creatures_roll_and_slot_in_while_initiative_is_on()
    {
        var fight = await App.StartFightAsync();
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        dm.FenceRow = 2;
        var wolf = Guid.NewGuid();
        Assert.Equal(
            SyncOutcome.Created,
            (await fight.Table.Dm.PushOneAsync(CreatureType(fight.CampaignId, wolf, "Wolf", CreatureSize.Medium, initiativeModifier: 3, initiativeRollMode: Mode.Disadvantage))).Outcome);

        // Off: a spawn leaves initiative alone.
        Assert.Null((await dm.SpawnAsync(fight.EncounterId, false, (wolf, 2, 0))).Error);
        await dm.FenceAsync(dm, fight.Aria);
        Assert.Empty(dm.Of(nameof(ITableClient.InitiativeChanged)));

        var before = SomeList(fight);
        Assert.Null((await SetAsync(dm, fight.EncounterId, before)).Error);
        var spawned = await dm.SpawnAsync(fight.EncounterId, false, (wolf, 2, 1));

        var token = Assert.Single(spawned.TokenIds!);
        var board = await fight.Table.Dm.BoardAsync(fight);
        var entries = board.Initiative!.Entries!;
        Assert.Equal(2, board.Initiative.Version);
        var added = entries.Single(e => e.TokenId == token);
        Assert.Equal((3, Mode.Disadvantage, 2), (added.Modifier, added.Mode, added.Rolls.Count));
        Assert.Equal(added.Rolls.Min() + 3, added.Value);
        Assert.Equal(InitiativeRules.Insert(before, added).Select(e => e.TokenId), entries.Select(e => e.TokenId));
        Assert.Equal(2, (await dm.WaitForAsync(nameof(ITableClient.InitiativeChanged), 2)).Count);
    }

    [Fact]
    public async Task Initiative_settings_of_types_and_tokens_sync_and_are_checked()
    {
        var fight = await App.StartFightAsync(PrepareAsync);
        var encounter = await fight.Table.Dm.FetchOneAsync(fight.CampaignId, fight.EncounterId);
        var ogre = encounter.Encounter!.Tokens.Single(t => t.Id == fight.Ogre);
        var goblin = encounter.Encounter.Tokens.Single(t => t.Id == fight.Goblin);
        var type = await fight.Table.Dm.FetchOneAsync(fight.CampaignId, goblin.CreatureTypeId);

        Assert.Equal((5, (Mode?)Mode.Advantage), (ogre.InitiativeModifier, ogre.InitiativeRollMode));
        Assert.Equal(((int?)null, (Mode?)null), (goblin.InitiativeModifier, goblin.InitiativeRollMode));
        Assert.Equal((2, Mode.Normal), (type.CreatureType!.InitiativeModifier, type.CreatureType.InitiativeRollMode));

        var tooHigh = await fight.Table.Dm.PushOneAsync(CreatureType(
            fight.CampaignId, name: "Drache", initiativeModifier: InitiativeRules.ModifierMax + 1));
        Assert.Equal((SyncOutcome.Rejected, ApiErrorCode.CreatureTypeInvalid, "initiativeModifier"), (tooHigh.Outcome, tooHigh.Error!.Code, tooHigh.Error.Field));

        var table = await App.CreateEncounterTableAsync();
        var draft = await table.Dm.FetchOneAsync(table.CampaignId, table.Encounter.Id);
        var data = draft.Encounter!;
        var tooLow = await table.Dm.PushOneAsync(Encounter(
            table.CampaignId,
            table.Session.Id,
            data.BattleMapId,
            draft.Id,
            draft.Version,
            data.Name,
            data.Status,
            data.ArchivedAt,
            [.. data.Tokens.Select((t, i) => i == 0 ? t with { InitiativeModifier = InitiativeRules.ModifierMin - 1 } : t)]));
        Assert.Equal((SyncOutcome.Rejected, ApiErrorCode.TokenInvalid, "tokens[0]"), (tooLow.Outcome, tooLow.Error!.Code, tooLow.Error.Field));
    }
}

[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class InitiativeRulesTests
{
    private static readonly Guid A = Guid.NewGuid();
    private static readonly Guid B = Guid.NewGuid();
    private static readonly Guid C = Guid.NewGuid();
    private static readonly Guid New = Guid.NewGuid();

    private static Func<int> Dice(params int[] rolls)
    {
        var queue = new Queue<int>(rolls);
        return queue.Dequeue;
    }

    [Fact]
    public void A_roll_adds_the_modifier_to_the_d20_and_advantage_keeps_the_higher_of_two_disadvantage_the_lower()
    {
        var plain = InitiativeRules.Roll(A, -2, Mode.Normal, Dice(11));
        Assert.Equal((A, 9, -2, Mode.Normal), (plain.TokenId, plain.Value, plain.Modifier, plain.Mode));
        Assert.Equal([11], plain.Rolls);
        var advantage = InitiativeRules.Roll(A, 3, Mode.Advantage, Dice(4, 17));
        Assert.Equal((20, Mode.Advantage), (advantage.Value, advantage.Mode));
        Assert.Equal([4, 17], advantage.Rolls);
        var disadvantage = InitiativeRules.Roll(A, 3, Mode.Disadvantage, Dice(4, 17));
        Assert.Equal((7, Mode.Disadvantage), (disadvantage.Value, disadvantage.Mode));
        Assert.Equal([4, 17], disadvantage.Rolls);
    }

    [Theory]
    [InlineData(20, 0)]
    [InlineData(15, 1)]
    [InlineData(12, 2)]
    [InlineData(1, 2)]
    public void A_newcomer_goes_before_the_first_lower_or_missing_value(int value, int index)
    {
        // 15, 12, (no value yet).
        List<InitiativeEntry> entries = [new(A, 15, 0, Mode.Normal, []), new(B, 12, 0, Mode.Normal, []), new(C, null, 0, Mode.Normal, [])];

        var inserted = InitiativeRules.Insert(entries, new InitiativeEntry(New, value, 0, Mode.Normal, []));

        Assert.Equal(index, inserted.FindIndex(e => e.TokenId == New));
        Assert.Equal([A, B, C], inserted.Where(e => e.TokenId != New).Select(e => e.TokenId));
    }

    [Fact]
    public void A_list_is_valid_only_with_the_encounter_s_tokens_once_and_in_range()
    {
        HashSet<Guid> tokens = [A, B];

        Assert.True(InitiativeRules.IsValid([new(A, 21, 3, Mode.Advantage, [18, 2]), new(B, null, 0, Mode.Normal, [])], tokens));
        Assert.True(InitiativeRules.IsValid([], tokens));
        Assert.False(InitiativeRules.IsValid([new(C, 3, 0, Mode.Normal, [])], tokens));
        Assert.False(InitiativeRules.IsValid([new(A, 3, 0, Mode.Normal, []), new(A, 4, 0, Mode.Normal, [])], tokens));
        Assert.False(InitiativeRules.IsValid([null], tokens));
        Assert.False(InitiativeRules.IsValid([new(A, 3, 0, Mode.Normal, [0])], tokens));
        Assert.False(InitiativeRules.IsValid([new(A, 3, 0, Mode.Normal, [1, 2])], tokens));
        Assert.False(InitiativeRules.IsValid([new(A, 3, 0, Mode.Disadvantage, [1, 2, 3])], tokens));
        Assert.False(InitiativeRules.IsValid([new(A, InitiativeRules.ValueMin - 1, 0, Mode.Normal, [])], tokens));
        Assert.False(InitiativeRules.IsValid([new(A, 3, InitiativeRules.ModifierMin - 1, Mode.Normal, [])], tokens));
    }
}
