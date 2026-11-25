using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Statuses;

namespace OreanasOffice.Server.Spells;

// Statuses offered when a spell is added to a character (knowledge/features/spell-cards.md,
// "Statuses when a spell is added"): what the character's variant of the spell offers (the
// spell itself, the conditions it causes, Konzentration) that the character's status list
// doesn't have yet. A spell status is one per campaign and spell, made the first time it's
// taken, with the variant's German name and the card's icon.
public static class SpellStatuses
{
    // The key of the spell's own status in offers and requests; the others are library keys.
    public const string SpellKey = "spell";

    private const int SaveAttempts = 3;

    // The offers in the order shown: the spell, Konzentration, then the conditions. Null when
    // the spell isn't on the character. Makes the character's status list if it doesn't exist
    // yet (StatusLists.EnsureAsync), so call it before tracking anything else.
    public static async Task<(Guid ListId, List<SpellStatusOffer> Offers)?> OffersAsync(
        AppDbContext db, Guid campaignId, Guid characterId, Guid spellId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var card = await db.CharacterSpells.AsNoTracking()
            .Where(e => e.CharacterId == characterId && e.SpellId == spellId)
            .Select(e => e.Variant.Card)
            .SingleOrDefaultAsync(cancellationToken);
        if (card is null)
        {
            return null;
        }

        var listId = await StatusLists.EnsureAsync(db, campaignId, characterId, null, now, cancellationToken);
        var listed = (await db.StatusListEntries.AsNoTracking()
                .Where(e => e.StatusListId == listId)
                .Select(e => e.StatusId)
                .ToListAsync(cancellationToken))
            .ToHashSet();

        var offers = new List<SpellStatusOffer>();
        if (card.OfferStatus)
        {
            var existing = await db.StatusDefinitions.AsNoTracking()
                .SingleOrDefaultAsync(s => s.CampaignId == campaignId && s.SpellId == spellId, cancellationToken);
            if (existing is null)
            {
                offers.Add(new SpellStatusOffer(SpellKey, null, StatusName(card), null, card.Icon));
            }
            else if (!listed.Contains(existing.Id))
            {
                var view = StatusViews.ToView(existing);
                offers.Add(new SpellStatusOffer(SpellKey, null, view.Name, view.IconUrl, view.SpellIcon));
            }
        }

        if (card.Concentration && !listed.Contains(StatusLibrary.Concentration.Id))
        {
            offers.Add(LibraryOffer(StatusLibrary.Concentration.Key, StatusLibrary.Concentration.Name));
        }

        foreach (var (key, name, id) in StatusLibrary.Conditions)
        {
            if (card.Statuses.Contains(key) && !listed.Contains(id))
            {
                offers.Add(LibraryOffer(key, name));
            }
        }

        return (listId, offers);
    }

    // Adds the offered statuses with these keys at the end of the character's list and returns
    // the list's id; keys that aren't offered (any more) are skipped. Null when the spell isn't
    // on the character.
    public static async Task<Guid?> AddAsync(
        AppDbContext db,
        Guid campaignId,
        Guid characterId,
        Guid spellId,
        IReadOnlyCollection<string> keys,
        Guid userId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            db.ChangeTracker.Clear();
            if (await OffersAsync(db, campaignId, characterId, spellId, now, cancellationToken) is not { } found)
            {
                return null;
            }

            var (listId, offers) = found;
            var take = offers.Where(o => keys.Contains(o.Key)).ToList();
            if (take.Count == 0)
            {
                return listId;
            }

            var last = await db.StatusListEntries.Where(e => e.StatusListId == listId).MaxAsync(e => (int?)e.Position, cancellationToken) ?? -1;
            foreach (var offer in take)
            {
                var statusId = offer.Key == SpellKey
                    ? await SpellStatusAsync(db, campaignId, characterId, spellId, userId, now, cancellationToken)
                    : StatusLibrary.All.Single(s => s.Key == offer.LibraryKey).Id;
                db.StatusListEntries.Add(new StatusListEntry { StatusListId = listId, StatusId = statusId, Position = ++last });
            }

            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return listId;
            }
            catch (DbUpdateException ex) when (UniqueIndex.IsViolation(ex) && attempt < SaveAttempts)
            {
                // Someone else made the spell's status or added one of these at the same time:
                // offer again from what is saved now.
            }
        }
    }

    // The campaign's status for the spell, made (tracked, not saved) from the character's
    // variant if there is none yet.
    private static async Task<Guid> SpellStatusAsync(
        AppDbContext db, Guid campaignId, Guid characterId, Guid spellId, Guid userId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (await db.StatusDefinitions
                .Where(s => s.CampaignId == campaignId && s.SpellId == spellId)
                .Select(s => (Guid?)s.Id)
                .SingleOrDefaultAsync(cancellationToken) is { } id)
        {
            return id;
        }

        var card = await db.CharacterSpells
            .Where(e => e.CharacterId == characterId && e.SpellId == spellId)
            .Select(e => e.Variant.Card)
            .SingleAsync(cancellationToken);
        var status = new StatusDefinition
        {
            Id = Guid.NewGuid(),
            CampaignId = campaignId,
            Name = StatusName(card),
            SpellId = spellId,
            SpellIcon = card.Icon,
            CharacterId = characterId,
            CreatedByUserId = userId,
            CreatedAt = now,
        };
        db.StatusDefinitions.Add(status);
        return status.Id;
    }

    // The card's German name without break points, cut to a status name's length.
    private static string StatusName(SpellCard card)
    {
        var name = SpellCards.WithoutBreakPoints(card.Name).Trim();
        return name.Length > StatusDefinition.NameMaxLength ? name[..StatusDefinition.NameMaxLength].TrimEnd() : name;
    }

    private static SpellStatusOffer LibraryOffer(string key, string name) => new(key, key, name, StatusLibrary.IconUrl(key), null);
}
