// Short names for the API types generated from the server's OpenAPI document.
import type { components } from './schema'

type Schemas = components['schemas']

export type ApiErrorCode = Schemas['ApiErrorCode']
export type ApiErrorBody = Schemas['ApiError']
export type Me = Schemas['MeResponse']
export type CampaignRole = Schemas['CampaignRole']
export type CampaignSummary = Schemas['CampaignSummaryResponse']
export type Campaign = Schemas['CampaignResponse']
export type Member = Schemas['MemberResponse']
export type Character = Schemas['CharacterResponse']
export type CharacterRequest = Schemas['CharacterRequest']
export type CreatureSize = Schemas['CreatureSize']
export type Session = Schemas['SessionResponse']
export type SessionStatus = Schemas['SessionStatus']
export type Invite = Schemas['InviteResponse']
export type UserSummary = Schemas['UserSummaryResponse']
