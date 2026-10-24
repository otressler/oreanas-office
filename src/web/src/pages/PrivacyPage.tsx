import { Link } from 'react-router'
import { PageTitle } from '../components/ui'
import { de } from '../text/de'
import { imprintDetails } from './imprintDetails'
import { LegalSection } from './LegalSection'

const t = de.privacy

/** /datenschutz: the privacy policy. Static like the Impressum, so it never wakes the server. */
export function PrivacyPage() {
  const details = imprintDetails()
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex flex-col gap-2">
        <PageTitle>{t.title}</PageTitle>
        <p className="text-parchment">{t.intro}</p>
        <p className="text-sm text-dim">{t.asOf}</p>
      </div>
      <LegalSection title={t.controller.title}>
        {details ? (
          <>
            <address className="not-italic">
              {details.name}
              <br />
              {details.street}
              <br />
              {details.city}
              <br />
              <a href={`mailto:${details.email}`} className="text-candle hover:underline">
                {details.email}
              </a>
            </address>
            <p>{t.controller.body}</p>
          </>
        ) : (
          <p>{de.imprint.missing}</p>
        )}
        <p>
          <Link to="/impressum" className="text-candle hover:underline">
            {t.controller.imprint}
          </Link>
        </p>
      </LegalSection>
      {t.sections.map((section) => (
        <LegalSection key={section.title} title={section.title}>
          {section.body.map((part) =>
            typeof part === 'string' ? (
              <p key={part}>{part}</p>
            ) : (
              <ul key={part[0]} className="flex list-disc flex-col gap-1 pl-5 marker:text-candle">
                {part.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ),
          )}
        </LegalSection>
      ))}
    </div>
  )
}
