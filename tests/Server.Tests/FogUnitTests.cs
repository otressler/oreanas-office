using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Tests;

// The numbering at first sight and the fan-out decisions of stage 10 (knowledge/features/
// fog-of-war.md). Pure functions, no database.
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class FogUnitTests
{
    private static readonly Guid Goblin = Guid.NewGuid();
    private static readonly Guid Wolf = Guid.NewGuid();
    private static readonly DateTimeOffset Start = new(2026, 10, 17, 12, 0, 0, TimeSpan.Zero);

    private static Token Creature(Guid type, int x, int tick, bool hidden = false, int? number = null, string? label = null) => new()
    {
        Id = Guid.NewGuid(),
        Kind = TokenKind.Creature,
        CreatureTypeId = type,
        Size = CreatureSize.Medium,
        X = x,
        Y = 0,
        Hidden = hidden,
        Number = number,
        Label = label,
        CreatedAt = Start.AddTicks(tick),
    };

    [Fact]
    public void Numbers_go_after_the_highest_of_the_type_and_in_placement_order()
    {
        var late = new CreatureNumbers.Candidate(Guid.NewGuid(), Goblin, Start.AddTicks(5));
        var early = new CreatureNumbers.Candidate(Guid.NewGuid(), Goblin, Start.AddTicks(1));
        var wolf = new CreatureNumbers.Candidate(Guid.NewGuid(), Wolf, Start.AddTicks(3));

        var numbers = CreatureNumbers.Assign(new Dictionary<Guid, int> { [Goblin] = 3 }, [late, early, wolf]);

        Assert.Equal(4, numbers[early.Id]);
        Assert.Equal(5, numbers[late.Id]);
        Assert.Equal(1, numbers[wolf.Id]);
    }

    [Fact]
    public void Equal_placement_times_are_broken_by_the_id()
    {
        var a = new CreatureNumbers.Candidate(new Guid("00000000-0000-0000-0000-000000000001"), Goblin, Start);
        var b = new CreatureNumbers.Candidate(new Guid("00000000-0000-0000-0000-000000000002"), Goblin, Start);

        var numbers = CreatureNumbers.Assign(new Dictionary<Guid, int>(), [b, a]);

        Assert.Equal((1, 2), (numbers[a.Id], numbers[b.Id]));
    }

    [Fact]
    public void Renamed_and_numbered_creatures_and_characters_need_no_number()
    {
        Assert.True(CreatureNumbers.Needs(Creature(Goblin, 0, 0)));
        Assert.False(CreatureNumbers.Needs(Creature(Goblin, 0, 0, number: 2)));
        Assert.False(CreatureNumbers.Needs(Creature(Goblin, 0, 0, label: "Häuptling")));
        Assert.False(CreatureNumbers.Needs(new Token { Kind = TokenKind.Character }));
    }

    [Fact]
    public void At_the_start_with_fog_only_the_visible_creatures_are_numbered_in_placement_order()
    {
        // Cells 2 and 3 are hidden. The goblin placed first stands in the fog.
        var fog = new FogDocument([[2, 0], [3, 0]], []);
        var inFog = Creature(Goblin, 2, 1, number: 1);
        var open = Creature(Goblin, 0, 2, number: 2);
        var hidden = Creature(Goblin, 1, 3, hidden: true, number: 3);
        var renamed = Creature(Goblin, 0, 4, label: "Häuptling");
        var second = Creature(Goblin, 1, 5, number: 4);

        CreatureNumbers.NumberAtStart([second, hidden, open, inFog, renamed], fog);

        Assert.Equal([null, 1, null, null, 2], new[] { inFog, open, hidden, renamed, second }.Select(t => t.Number));
    }

    [Fact]
    public void At_the_start_without_fog_the_editors_labels_stay()
    {
        var goblin = Creature(Goblin, 0, 1, number: 3);

        CreatureNumbers.NumberAtStart([goblin], fog: null);

        Assert.Equal(3, goblin.Number);
    }

    [Fact]
    public void A_creature_with_a_revealed_cell_is_numbered_even_when_part_of_it_stands_in_fog()
    {
        var fog = new FogDocument([[1, 0]], []);
        var large = Creature(Goblin, 0, 1);
        large.Size = CreatureSize.Large;

        CreatureNumbers.NumberAtStart([large], fog);

        Assert.Equal(1, large.Number);
    }

    [Theory]
    [InlineData(true, true, TableFanOut.MoveView.Moved)]
    [InlineData(false, true, TableFanOut.MoveView.Revealed)]
    [InlineData(true, false, TableFanOut.MoveView.Hidden)]
    [InlineData(false, false, TableFanOut.MoveView.Nothing)]
    public void A_move_is_a_move_a_reveal_a_hide_or_nothing_for_players(bool before, bool after, TableFanOut.MoveView expected) =>
        Assert.Equal(expected, TableFanOut.MoveFor(before, after));

    [Fact]
    public void A_preview_needs_a_visible_token_and_a_target_without_fog()
    {
        HashSet<(int X, int Y)> fog = [(3, 0), (4, 0)];
        var creature = new TableFanOut.TokenFacts(TokenKind.Creature, false, CreatureSize.Medium, 0, 0, Guid.NewGuid(), fog);
        var hidden = creature with { Hidden = true };
        var character = new TableFanOut.TokenFacts(TokenKind.Character, false, CreatureSize.Medium, 3, 0, Guid.NewGuid(), fog);
        var large = creature with { Size = CreatureSize.Large };

        Assert.True(TableFanOut.PreviewVisible(fog, creature, 2, 0));
        Assert.False(TableFanOut.PreviewVisible(fog, creature, 3, 0));
        Assert.False(TableFanOut.PreviewVisible(fog, hidden, 2, 0));
        Assert.True(TableFanOut.PreviewVisible(fog, character, 0, 0));
        Assert.False(TableFanOut.PreviewVisible(fog, character, 3, 0));
        Assert.False(TableFanOut.PreviewVisible(fog, large, 2, 0));
        Assert.True(TableFanOut.PreviewVisible([], hidden with { Hidden = false }, 3, 0));
    }
}
