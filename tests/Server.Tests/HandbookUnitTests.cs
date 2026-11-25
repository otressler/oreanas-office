using OreanasOffice.Server.Api;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Spells;

namespace OreanasOffice.Server.Tests;

// knowledge/rules/handbook-classes.md: the embedded 2024 Player's Handbook data and the rules
// for a character's classes.
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class HandbookUnitTests
{
    private static HandbookData Data => Handbook.Data;

    [Fact]
    public void The_handbook_has_its_12_classes_48_subclasses_and_390_spells()
    {
        Assert.Equal(
            ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"],
            Data.Classes.Select(c => c.Id));
        Assert.All(Data.Classes, c => Assert.Equal(4, c.Subclasses.Count));
        Assert.Equal(48, Data.Classes.SelectMany(c => c.Subclasses).Select(s => s.Id).Distinct().Count());
        Assert.Equal(390, Data.Spells.Count);
        Assert.Equal(390, Data.Spells.Select(s => Spell.KeyOf(s.NameEn)).Distinct().Count());
        Assert.All(Data.Spells, s => Assert.InRange(s.Level, 0, Spell.MaxLevel));
    }

    [Fact]
    public void Classes_and_subclasses_have_german_names()
    {
        var wizard = Data.Classes.Single(c => c.Id == "wizard");
        Assert.Equal(("Wizard", "Magier", SpellcastingKind.Full), (wizard.NameEn, wizard.NameDe, wizard.Caster));
        Assert.Equal("Hervorrufer", wizard.Subclasses.Single(s => s.Id == "evoker").NameDe);
        Assert.Equal("Hexenmeister", Data.Classes.Single(c => c.Id == "warlock").NameDe);
        Assert.All(Data.Classes.SelectMany(c => c.Subclasses), s => Assert.False(string.IsNullOrWhiteSpace(s.NameDe)));
    }

    [Fact]
    public void Every_spell_is_on_a_handbook_class_list_and_every_grant_is_a_handbook_spell()
    {
        var classIds = Data.Classes.Select(c => c.Id).ToHashSet();
        var spells = Data.Spells.Select(s => Spell.KeyOf(s.NameEn)).ToHashSet();
        Assert.All(Data.Spells, s => Assert.NotEmpty(s.Classes));
        Assert.All(Data.Spells.SelectMany(s => s.Classes), c => Assert.Contains(c, classIds));
        Assert.All(
            Data.Classes.SelectMany(c => c.Subclasses).SelectMany(s => s.Spells ?? []).SelectMany(l => l.Value),
            name => Assert.Contains(Spell.KeyOf(name), spells));
    }

    [Fact]
    public void Spells_know_their_lists_and_wiki_pages()
    {
        var moonbeam = Data.Spells.Single(s => s.NameEn == "Moonbeam");
        Assert.Equal((2, SpellSchool.Evocation, "moonbeam"), (moonbeam.Level, moonbeam.School, moonbeam.Slug));
        Assert.Equal(["druid"], moonbeam.Classes);
        // The wiki keeps a dash for the apostrophe.
        Assert.Equal("hunter-s-mark", Data.Spells.Single(s => s.NameEn == "Hunter's Mark").Slug);

        var moon = Data.Classes.Single(c => c.Id == "druid").Subclasses.Single(s => s.Id == "circle-of-the-moon");
        Assert.Contains("Moonbeam", moon.Spells![3]);
        var knight = Data.Classes.Single(c => c.Id == "fighter").Subclasses.Single(s => s.Id == "eldritch-knight");
        Assert.Equal("wizard", knight.SpellListClass);
    }

    [Fact]
    public void Classes_are_checked_in_order_with_levels_and_subclasses()
    {
        Assert.Null(CharacterClasses.Validate(
            [new("wizard", 5, " evoker "), new("fighter", 2)], out var classes));
        Assert.Equal([new CharacterClassView("wizard", 5, "evoker"), new CharacterClassView("fighter", 2, null)], classes);
        Assert.Null(CharacterClasses.Validate(null, out var none));
        Assert.Empty(none);
        Assert.Null(CharacterClasses.Validate([new("rogue", 17), new("wizard", 3, "")], out _));
    }

    // "class level subclass" per class, separated by ";".
    [Theory]
    [InlineData("artificer 3")]
    [InlineData("wizard 0")]
    [InlineData("wizard 21")]
    [InlineData("wizard 3; wizard 4")]
    [InlineData("wizard 12; cleric 9")]
    [InlineData("wizard 2 evoker")]
    [InlineData("wizard 5 life-domain")]
    [InlineData("wizard 5 nonsense")]
    public void Classes_breaking_a_rule_are_refused(string classes)
    {
        var request = classes.Split(';')
            .Select(entry => entry.Trim().Split(' '))
            .Select(parts => new CharacterClassRequest(parts[0], int.Parse(parts[1]), parts.Length > 2 ? parts[2] : null))
            .ToList();

        var error = CharacterClasses.Validate(request, out _);

        Assert.Equal(new ApiError(ApiErrorCode.CharacterClassInvalid, "classes"), error);
    }

    [Fact]
    public void The_portrait_prompt_names_classes_in_english_without_levels()
    {
        Assert.Equal("Wizard (Evoker), Fighter", CharacterClasses.PromptText([("Wizard", "Evoker"), ("Fighter", null)]));
        Assert.Equal("", CharacterClasses.PromptText([]));
    }
}
