using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Sessions;

// DmUserId null: the campaign's default DM. Otherwise it must be a `dm` member.
public record CreateSessionRequest(string Title, DateOnly Date, Guid? DmUserId);

public record ChangeSessionDmRequest(Guid UserId);

// CanManage: the signed-in user is the session's DM or the campaign's default DM.
// IsSessionDm: the signed-in user runs this session (starts and ends encounters).
// ActiveEncounter: the running fight, if any.
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
    ActiveEncounterSummary? ActiveEncounter);
