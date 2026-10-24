import { useId, type ReactNode } from 'react'
import { PageTitle } from '../components/ui'
import { de } from '../text/de'

const t = de.imprint

/**
 * The provider's details, baked into the build from IMPRINT_* (imprintDefines in
 * vite.config.ts) so they never enter the repository. Null when one is missing.
 * Each value is read as `import.meta.env.VITE_…` on purpose: the build replaces exactly
 * that text, not a destructured `import.meta.env`.
 */
function imprintDetails() {
  const name = import.meta.env.VITE_IMPRINT_NAME
  const street = import.meta.env.VITE_IMPRINT_STREET
  const city = import.meta.env.VITE_IMPRINT_CITY
  const email = import.meta.env.VITE_IMPRINT_EMAIL
  if (!name || !street || !city || !email) return null
  return { name, street, city, email }
}

/** /impressum: who runs the app. Static like the roadmap, so it never wakes the server. */
export function ImprintPage() {
  const details = imprintDetails()
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <PageTitle>{t.title}</PageTitle>
        <p className="text-dim">{t.legalBasis}</p>
      </div>
      <Section title={t.provider}>
        {details ? (
          <address className="not-italic">
            {details.name}
            <br />
            {details.street}
            <br />
            {details.city}
          </address>
        ) : (
          <p>{t.missing}</p>
        )}
      </Section>
      {details && (
        <Section title={t.contact}>
          <p>
            {t.email}{' '}
            <a href={`mailto:${details.email}`} className="text-candle hover:underline">
              {details.email}
            </a>
          </p>
        </Section>
      )}
      <Section title={t.project.title}>
        <p>{t.project.body}</p>
      </Section>
      <Section title={t.trademarks.title}>
        <p>{t.trademarks.body}</p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 text-parchment">
      <h2 id={id} className="text-xl font-semibold text-parchment">
        {title}
      </h2>
      {children}
    </section>
  )
}
