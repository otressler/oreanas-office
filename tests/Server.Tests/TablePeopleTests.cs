using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Tests;

// Ping colours and the ping rate limit, without the app (knowledge/features/pings-and-arrows.md).
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class TablePeopleTests
{
    private static readonly Guid Dm = Guid.NewGuid();
    private static readonly Guid Player = Guid.NewGuid();
    private static readonly Guid Encounter = Guid.NewGuid();

    [Fact]
    public void The_session_DM_pings_in_gold_even_with_a_character()
    {
        TablePeople.FightCharacter[] characters = [new(Dm, 0, null)];

        Assert.Equal("#f5b81c", TablePeople.PingColor(Dm, Dm, characters));
    }

    [Fact]
    public void A_player_pings_in_the_ring_of_their_first_character_in_the_fight()
    {
        TablePeople.FightCharacter[] defaults = [new(Player, 4, null), new(Player, 2, null), new(Guid.NewGuid(), 1, "#123456")];
        TablePeople.FightCharacter[] picked = [new(Player, 9, "#abcdef"), new(Player, 10, null)];

        Assert.Equal("#2fc4c0", TablePeople.PingColor(Player, Dm, [defaults[0]]));
        Assert.Equal("#f28c38", TablePeople.PingColor(Player, Dm, defaults));
        Assert.Equal("#abcdef", TablePeople.PingColor(Player, Dm, picked));
    }

    [Fact]
    public void Someone_without_a_character_in_the_fight_pings_in_white()
    {
        Assert.Equal("#ffffff", TablePeople.PingColor(Player, Dm, [new(Guid.NewGuid(), 0, null)]));
    }

    // The ninth character starts the eight colours of src/web/src/board/palette.ts again.
    [Fact]
    public void Default_rings_repeat_from_the_ninth_character()
    {
        Assert.Equal(8, TablePeople.CharacterRings.Count);
        Assert.Equal(TablePeople.RingColor(0, null), TablePeople.RingColor(8, null));
        Assert.Equal("#4da3ff", TablePeople.RingColor(0, null));
        Assert.Equal("#e8e4dc", TablePeople.RingColor(7, null));
    }

    [Fact]
    public void At_most_three_pings_go_out_in_any_two_seconds()
    {
        var time = new ManualTime();
        var limiter = new TablePingLimiter(time);

        bool[] first = [limiter.TryTake(Player, Encounter), limiter.TryTake(Player, Encounter), limiter.TryTake(Player, Encounter)];
        var fourth = limiter.TryTake(Player, Encounter);
        time.Advance(TimeSpan.FromMilliseconds(1999));
        var stillTooSoon = limiter.TryTake(Player, Encounter);
        time.Advance(TimeSpan.FromMilliseconds(1));
        var afterTwoSeconds = limiter.TryTake(Player, Encounter);
        var fifth = limiter.TryTake(Player, Encounter);

        Assert.Equal([true, true, true], first);
        Assert.False(fourth);
        Assert.False(stillTooSoon);
        Assert.True(afterTwoSeconds);

        // The window slides: the three from the start have gone, but the one just now counts.
        Assert.True(fifth);
        Assert.True(limiter.TryTake(Player, Encounter));
        Assert.False(limiter.TryTake(Player, Encounter));
    }

    [Fact]
    public void Each_person_and_encounter_has_their_own_limit()
    {
        var limiter = new TablePingLimiter(new ManualTime());
        for (var i = 0; i < 3; i++)
        {
            Assert.True(limiter.TryTake(Player, Encounter));
        }

        Assert.False(limiter.TryTake(Player, Encounter));
        Assert.True(limiter.TryTake(Dm, Encounter));
        Assert.True(limiter.TryTake(Player, Guid.NewGuid()));
    }

    private sealed class ManualTime : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 10, 16, 20, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;
    }
}
