/**
 * The provider's details, baked into the build from IMPRINT_* (imprintDefines in
 * vite.config.ts) so they never enter the repository. Null when one is missing.
 * Each value is read as `import.meta.env.VITE_…` on purpose: the build replaces exactly
 * that text, not a destructured `import.meta.env`.
 */
export function imprintDetails() {
  const name = import.meta.env.VITE_IMPRINT_NAME
  const street = import.meta.env.VITE_IMPRINT_STREET
  const city = import.meta.env.VITE_IMPRINT_CITY
  const email = import.meta.env.VITE_IMPRINT_EMAIL
  if (!name || !street || !city || !email) return null
  return { name, street, city, email }
}
