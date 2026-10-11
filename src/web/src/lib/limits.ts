// Input limits the server enforces. Keep in sync with the constants named here;
// the inputs use them as maxLength, so the server never sees a longer value.
export const limits = {
  /** AppUser.DisplayNameMaxLength */
  displayName: 40,
  /** Campaign.NameMaxLength */
  campaignName: 80,
  /** Character.NameMaxLength */
  characterName: 40,
  /** GameSession.TitleMaxLength */
  sessionTitle: 100,
  /** AccountInput.PasswordMinLength */
  passwordMin: 8,
} as const
