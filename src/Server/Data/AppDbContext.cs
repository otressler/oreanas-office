using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Bestiary;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Spells;
using OreanasOffice.Server.Statuses;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Data;

// IdentityUserContext: users, logins, claims and tokens, without Identity's role
// tables. Roles are per campaign (CampaignMember.Role), not site-wide.
public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityUserContext<AppUser, Guid>(options)
{
    public DbSet<RegistrationInvite> RegistrationInvites => Set<RegistrationInvite>();

    public DbSet<Campaign> Campaigns => Set<Campaign>();

    public DbSet<CampaignMember> CampaignMembers => Set<CampaignMember>();

    public DbSet<Character> Characters => Set<Character>();

    public DbSet<GameSession> Sessions => Set<GameSession>();

    public DbSet<BattleMap> BattleMaps => Set<BattleMap>();

    public DbSet<CreatureType> CreatureTypes => Set<CreatureType>();

    public DbSet<Encounter> Encounters => Set<Encounter>();

    public DbSet<Token> Tokens => Set<Token>();

    public DbSet<TokenMove> TokenMoves => Set<TokenMove>();

    public DbSet<Asset> Assets => Set<Asset>();

    public DbSet<StatusDefinition> StatusDefinitions => Set<StatusDefinition>();

    public DbSet<StatusList> StatusLists => Set<StatusList>();

    public DbSet<StatusListEntry> StatusListEntries => Set<StatusListEntry>();

    public DbSet<TokenStatus> TokenStatuses => Set<TokenStatus>();

    public DbSet<EncounterChange> EncounterChanges => Set<EncounterChange>();

    public DbSet<SessionSpectator> SessionSpectators => Set<SessionSpectator>();

    public DbSet<SessionCharacterPlayer> SessionCharacterPlayers => Set<SessionCharacterPlayer>();

    public DbSet<Spell> Spells => Set<Spell>();

    public DbSet<SpellVariant> SpellVariants => Set<SpellVariant>();

    public DbSet<CharacterSpell> CharacterSpells => Set<CharacterSpell>();

    public DbSet<SpellArtPrompt> SpellArtPrompts => Set<SpellArtPrompt>();

    public DbSet<SpellArtEvent> SpellArtEvents => Set<SpellArtEvent>();

    public DbSet<TextModelCall> TextModelCalls => Set<TextModelCall>();

    public DbSet<SpellJob> SpellJobs => Set<SpellJob>();

    public DbSet<SpellCardDraft> SpellCardDrafts => Set<SpellCardDraft>();

    public DbSet<SpellCardRevision> SpellCardRevisions => Set<SpellCardRevision>();

    public DbSet<CharacterClass> CharacterClasses => Set<CharacterClass>();

    public DbSet<CharacterSubclass> CharacterSubclasses => Set<CharacterSubclass>();

    public DbSet<SpellListEntry> SpellListEntries => Set<SpellListEntry>();

    public DbSet<CharacterClassLevel> CharacterClassLevels => Set<CharacterClassLevel>();

    public DbSet<ReferenceDataVersion> ReferenceDataVersions => Set<ReferenceDataVersion>();

    public DbSet<GlossaryEntry> GlossaryEntries => Set<GlossaryEntry>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
        builder.Entity<AppUser>().Property(u => u.DisplayName).HasMaxLength(AppUser.DisplayNameMaxLength);
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configuration)
    {
        // Enums as readable strings ("Active", "Dm"), not numbers.
        configuration.Properties<Enum>().HaveConversion<string>().HaveMaxLength(20);
    }
}
