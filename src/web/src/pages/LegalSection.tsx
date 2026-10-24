import { useId, type ReactNode } from 'react'

/** A titled section of the Impressum or the privacy policy. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
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
