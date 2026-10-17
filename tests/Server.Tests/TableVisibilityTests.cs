using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Statuses;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Tests;

// The per-viewer filter, the connection permissions and the creature label split of stage 10
// (knowledge/features/fog-of-war.md, shared-table.md). Pure functions, no database.
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class TableVisibilityTests
{
    private static readonly Guid Dm = Guid.NewGuid();
    private static readonly Guid Player = Guid.NewGuid();

    // A 4x1 corridor: cells 0 and 1 revealed, 2 and 3 in the fog.
    private static BoardStateResponse Board(params BoardToken[] tokens) => new(
        Guid.NewGuid(),
        Guid.NewGuid(),
        Guid.NewGuid(),
        "Gang",
        EncounterStatus.Active,
        new BoardMap(
            Guid.NewGuid(),
            "Gang",
            4,
            1,
            new MapLayout(
                1,
                [.. Enumerable.Range(0, 4).Select(x => new LayoutCell(x, 0, Terrain.Floor, x))],
                [new LayoutFeature("f1", "bridge", "Brücke", 1, 0, 2, 1, 0, false), new LayoutFeature("f2", "pillar", "Säule", 3, 0, 1, 1, 0, true)],
                [new LayoutEntrance("e1", EntranceKind.Entrance, "Tür", [[0, 0], [3, 0]])]),
            null),
        [.. tokens],
        true,
        null,
        [],
        [],
        [],
        BoardViewer.Dm,
        new FogView(7, [new BoardCell(2, 0), new BoardCell(3, 0)], [new FogArea("a1", "Ost", [[2, 0], [3, 0]])]),
        PlayMode.Byod,
        new PresenceState([], false));

    private static BoardToken Creature(string label, int x, bool hidden = false) => new(
        Guid.NewGuid(), TokenKind.Creature, null, Guid.NewGuid(), null, label, x, 0, x, CreatureSize.Medium, null, 0, null, null, [], null, hidden);

    private static BoardToken Character(int x) => new(
        Guid.NewGuid(), TokenKind.Character, Guid.NewGuid(), null, Player, "Eli", x, 0, x, CreatureSize.Medium, 0, 0, null, null, [], null);

    [Fact]
    public void Players_do_not_get_hidden_creatures_or_creatures_standing_in_fog()
    {
        var visible = Creature("Goblin 1", 1);
        var board = Board(visible, Creature("Goblin 2", 1, hidden: true), Creature("Goblin 3", 2), Character(3));

        var forPlayers = TableVisibility.ForPlayers(board);

        Assert.Equal(["Goblin 1", "Eli"], forPlayers.Tokens.Select(t => t.Label).Order(StringComparer.Ordinal).Reverse());
        Assert.DoesNotContain(forPlayers.Tokens, t => t.Hidden);
        Assert.Equal(BoardViewer.Player, forPlayers.Viewer);
        Assert.False(forPlayers.IsSessionDm);
    }

    [Fact]
    public void A_layout_for_players_leaves_out_hidden_cells_but_keeps_those_under_characters()
    {
        var forPlayers = TableVisibility.ForPlayers(Board(Character(3)));

        Assert.Equal([0, 1, 3], forPlayers.Map.Layout.Cells.Select(c => c.X));
        Assert.Equal([[0, 0], [3, 0]], forPlayers.Map.Layout.Entrances.Single().Cells);
    }

    [Fact]
    public void A_feature_is_sent_whole_once_one_of_its_cells_is_revealed_and_not_before()
    {
        var forPlayers = TableVisibility.ForPlayers(Board());

        Assert.Equal(["f1"], forPlayers.Map.Layout.Features.Select(f => f.Id));
        Assert.Equal((1, 2), (forPlayers.Map.Layout.Features.Single().X, forPlayers.Map.Layout.Features.Single().W));
    }

    [Fact]
    public void Players_get_the_hidden_cells_without_areas_and_the_dm_gets_everything()
    {
        var board = Board(Creature("Goblin 1", 2, hidden: true));

        var forPlayers = TableVisibility.ForPlayers(board);

        Assert.Equal(2, forPlayers.Fog!.HiddenCells.Count);
        Assert.Empty(forPlayers.Fog.Areas);
        Assert.Equal(7, forPlayers.Fog.Version);
        Assert.Single(board.Fog!.Areas);
        Assert.Single(board.Tokens);
    }

    [Fact]
    public void Without_fog_a_hidden_creature_is_still_hidden_and_the_layout_is_whole()
    {
        var board = Board(Creature("Goblin 1", 0, hidden: true), Creature("Goblin 2", 1)) with { Fog = null };

        var forPlayers = TableVisibility.ForPlayers(board);

        Assert.Equal(["Goblin 2"], forPlayers.Tokens.Select(t => t.Label));
        Assert.Equal(4, forPlayers.Map.Layout.Cells.Count);
    }

    [Fact]
    public void A_large_creature_is_visible_when_one_cell_of_it_is_revealed()
    {
        var fog = new HashSet<(int X, int Y)> { (2, 0), (3, 0), (2, 1), (3, 1) };

        Assert.True(TableVisibility.TokenVisible(fog, TokenKind.Creature, false, CreatureSize.Large, 1, 0));
        Assert.False(TableVisibility.TokenVisible(fog, TokenKind.Creature, false, CreatureSize.Large, 2, 0));
        Assert.True(TableVisibility.TokenVisible(fog, TokenKind.Character, false, CreatureSize.Medium, 2, 0));
    }

    [Fact]
    public void Statuses_of_tokens_players_cannot_see_are_left_out()
    {
        var shown = Guid.NewGuid();
        var secret = Guid.NewGuid();
        var visibleToken = Creature("Goblin 1", 0) with { Statuses = [new BoardTokenStatus(shown, null, Dm, DateTimeOffset.UnixEpoch)] };
        var hiddenToken = Creature("Goblin 2", 1, hidden: true) with { Statuses = [new BoardTokenStatus(secret, null, Dm, DateTimeOffset.UnixEpoch)] };
        var board = Board(visibleToken, hiddenToken) with
        {
            Statuses = [Definition(shown), Definition(secret)],
        };

        var forPlayers = TableVisibility.ForPlayers(board);

        Assert.Equal([shown], forPlayers.Statuses.Select(s => s.Id));
    }

    [Theory]
    [InlineData(ConnectionMode.Player, PlayMode.Byod, ConnectionMode.Player)]
    [InlineData(ConnectionMode.Spectator, PlayMode.Local, ConnectionMode.Spectator)]
    [InlineData(ConnectionMode.SharedScreen, PlayMode.Local, ConnectionMode.SharedScreen)]
    [InlineData(ConnectionMode.SharedScreen, PlayMode.Byod, ConnectionMode.Spectator)]
    public void A_shared_screen_outside_local_mode_only_watches(ConnectionMode mode, PlayMode playMode, ConnectionMode expected) =>
        Assert.Equal(expected, TablePermissions.Effective(mode, playMode));

    [Fact]
    public void A_shared_screen_moves_every_character_but_no_creature_and_a_spectator_nothing()
    {
        Assert.True(TablePermissions.MayMove(ConnectionMode.SharedScreen, Dm, Dm, TokenKind.Character, Player));
        Assert.False(TablePermissions.MayMove(ConnectionMode.SharedScreen, Dm, Dm, TokenKind.Creature, null));
        Assert.False(TablePermissions.MayMove(ConnectionMode.Spectator, Dm, Dm, TokenKind.Character, Dm));
        Assert.True(TablePermissions.MayMove(ConnectionMode.Player, Dm, Dm, TokenKind.Creature, null));
        Assert.True(TablePermissions.MayMove(ConnectionMode.Player, Player, Dm, TokenKind.Character, Player));
        Assert.False(TablePermissions.MayMove(ConnectionMode.Player, Player, Dm, TokenKind.Character, Dm));
    }

    [Fact]
    public void The_session_dm_acts_as_the_session_dm_only_from_a_player_connection()
    {
        Assert.True(TablePermissions.ActsAsSessionDm(ConnectionMode.Player, Dm, Dm));
        Assert.False(TablePermissions.ActsAsSessionDm(ConnectionMode.Spectator, Dm, Dm));
        Assert.False(TablePermissions.ActsAsSessionDm(ConnectionMode.SharedScreen, Dm, Dm));
        Assert.False(TablePermissions.ActsAsSessionDm(ConnectionMode.Player, Player, Dm));
    }

    [Theory]
    [InlineData("Goblin", "Goblin 3", 3, null)]
    [InlineData("Goblin", "goblin 12", 12, null)]
    [InlineData("Goblin", "Goblin", null, null)]
    [InlineData("Goblin", "Häuptling", null, "Häuptling")]
    [InlineData("Goblin", "Wolf 2", null, "Wolf 2")]
    [InlineData("Goblin", "Goblin 0", null, "Goblin 0")]
    public void A_label_splits_into_a_number_or_the_dms_own_name(string type, string label, int? number, string? name) =>
        Assert.Equal((number, name), CreatureLabels.Split(type, label));

    [Fact]
    public void A_long_type_name_is_shortened_so_the_number_fits_and_survives_a_round_trip()
    {
        var type = new string('x', 50);
        var shown = CreatureLabels.Display(type, 4, null);

        Assert.Equal(Token.LabelMaxLength, shown.Length);
        Assert.Equal((4, (string?)null), CreatureLabels.Split(type, shown));
    }

    [Fact]
    public void Fog_is_checked_against_the_map_and_tidied()
    {
        var fog = new FogDocument([[2, 0], [1, 0], [2, 0]], [new FogArea("a", " Ost ", [[2, 0]])]);

        Assert.Null(FogCells.Check(fog, 4, 1));
        Assert.Equal("fog.hiddenCells[0]", FogCells.Check(fog, 2, 1));
        Assert.Equal("fog.areas[0]", FogCells.Check(fog with { Areas = [new FogArea("a", " ", [])] }, 4, 1));

        var tidy = FogCells.Normalize(fog);
        Assert.Equal([[1, 0], [2, 0]], tidy.HiddenCells);
        Assert.Equal("Ost", tidy.Areas.Single().Name);
    }

    private static StatusDefinitionView Definition(Guid id) => new(id, null, "x", false, null, null, null);
}
