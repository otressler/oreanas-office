namespace OreanasOffice.Server.Statuses;

// Request and response types for statuses and status lists (knowledge/features/statuses.md,
// knowledge/domain/status.md). Every endpoint needs a connection; the app says so offline.

// A status as the app shows it. LibraryKey: one of the 15 condition keys, whose German
// name the app takes from its text file; null for custom statuses. IconUrl: the static
// /statuses/<key>.webp for library statuses, /api/assets/{id} for a custom status's picked
// icon, null for a custom status without one (the app shows its first letter).
// CharacterId: the character whose status list a custom status was made in; null for
// library statuses and those made in a DM status list.
public record StatusDefinitionView(
    Guid Id,
    string? LibraryKey,
    string Name,
    bool HasLevels,
    string? IconUrl,
    string? IconDescription,
    Guid? CharacterId);

// A character's or the caller's own DM status list, in its owner's order. Read on first
// use: a list read for the first time is made with all 15 conditions. CanEdit: the caller
// may change it (a character's owner and `dm` members; a DM their own).
public record StatusListResponse(Guid Id, Guid? CharacterId, List<StatusDefinitionView> Statuses, bool CanEdit);

// PUT a status list: the whole list in the new order. Every id must be a library status or
// a custom status of the campaign, each at most once (StatusNotFound, with Field
// "statusIds[i]"). Removing a custom status from a list only takes it out of the picker.
public record SetStatusListRequest(List<Guid> StatusIds);

// POST statuses: a custom status, added at the end of a status list: the character's
// (CharacterId set; whoever may edit the character) or the caller's own DM status list
// (CharacterId null; `dm` members only). Name: 1 to 40 characters (NameInvalid).
// IconDescription: what the icon should show, up to 300 characters (TextTooLong), may be
// empty; the icon is generated separately, after the person confirms the job.
public record CreateStatusRequest(string Name, string? IconDescription, bool HasLevels, Guid? CharacterId);

// GET the status picker of a running encounter (knowledge/features/statuses.md, "What the
// picker shows"). The session DM: their own DM status list first, then the status list of
// every character in the fight, by character name. Anyone else: the status lists of their
// own characters in the fight. Lists are made on first use, as in StatusListResponse.
public record StatusPickerResponse(List<StatusPickerList> Lists);

// CharacterId and CharacterName: set for a character's list, null for the DM's own.
public record StatusPickerList(StatusListKind Kind, Guid? CharacterId, string? CharacterName, List<StatusDefinitionView> Statuses);

public enum StatusListKind
{
    Dm,
    Character,
}
