using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Sessions;

// DmUserId null: the campaign's default DM. Otherwise it must be a `dm` member.
public record CreateSessionRequest(string Title, DateOnly Date, Guid? DmUserId);

public record ChangeSessionDmRequest(Guid UserId);

// The session DM changes the title and date.
public record UpdateSessionRequest(string Title, DateOnly Date);

// CanManage: the signed-in user is the session's DM or the campaign's default DM.
// IsSessionDm: the signed-in user runs this session (starts and ends encounters).
// ActiveEncounter: the running fight, if any. InterruptedEncounter: the fight that ending
// the session cut off; continuing brings it back. Encounters: the session's fights in the
// order they were added, archived ones included; empty for players, who see only the
// running one (knowledge/features/session-planning.md). PlayMode: Byod or Local.
// CharacterPlayers: the characters someone other than their owner plays in this session, by
// character name; every other character is played by its owner (knowledge/domain/session.md).
public record SessionResponse(
    Guid Id,
    string Title,
    DateOnly Date,
    SessionStatus Status,
    Guid DmUserId,
    string DmDisplayName,
    Guid CreatedByUserId,
    bool CanManage,
    bool IsSessionDm,
    ActiveEncounterSummary? ActiveEncounter,
    ActiveEncounterSummary? InterruptedEncounter,
    List<EncounterSummaryResponse> Encounters,
    PlayMode PlayMode,
    List<SessionCharacterPlayerResponse> CharacterPlayers);

public record SessionCharacterPlayerResponse(Guid CharacterId, Guid UserId, string DisplayName);

// UserId: the member who plays the character in this session. Null or the character's owner
// gives it back to the owner.
public record SetCharacterPlayerRequest(Guid? UserId);

// The session DM sets how the group plays (knowledge/features/shared-table.md).
public record SetPlayModeRequest(PlayMode PlayMode);
