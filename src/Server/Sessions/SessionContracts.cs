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
// running one (knowledge/features/session-planning.md).
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
    List<EncounterSummaryResponse> Encounters);
