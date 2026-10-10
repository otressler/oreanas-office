import { de } from '../text/de'

export function HomePage() {
  return (
    <section className="flex flex-col gap-3 py-12">
      <h1 className="text-2xl font-semibold text-parchment">{de.home.title}</h1>
      <p className="text-base text-dim">{de.home.body}</p>
    </section>
  )
}
