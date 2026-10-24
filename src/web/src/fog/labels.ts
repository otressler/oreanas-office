// Labels without numbers (knowledge/features/fog-of-war.md, "Creature numbers"): numbers
// only come at the table, when players first see a creature, so in an encounter with fog the
// editor shows a creature as its type ("Goblin"), and a token's middle shows its plain
// letter. At the table the server already sends unseen creatures without a number.

/**
 * The label without its automatic number: "Goblin 3" → "Goblin". A label the DM renamed
 * (it doesn't start with the type's name) stays as it is. Without the type's name, any
 * label ending in a number loses it.
 */
export function labelWithoutNumber(label: string, typeName?: string): string {
  const match = /^(.+) \d+$/.exec(label)
  if (!match) return label
  const prefix = match[1]!
  if (typeName !== undefined && !typeName.trim().startsWith(prefix)) return label
  return prefix
}

/** A label that still carries a number the DM or the server gave it. */
export function hasNumber(label: string): boolean {
  return /^.+ \d+$/.test(label)
}
