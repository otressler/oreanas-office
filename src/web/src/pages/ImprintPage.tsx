import { PageTitle } from '../components/ui'
import { de } from '../text/de'
import { imprintDetails } from './imprintDetails'
import { LegalSection as Section } from './LegalSection'

const t = de.imprint

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
