import { Link } from 'react-router'
import { de } from '../text/de'

export function NotFoundPage() {
  return (
    <section className="flex flex-col items-start gap-3 py-12">
      <h1 className="text-2xl font-semibold text-parchment">{de.notFound.title}</h1>
      <p className="text-base text-dim">{de.notFound.body}</p>
      <Link
        to="/"
        className="mt-2 rounded-lg border border-line px-4 py-2 text-candle hover:border-candle"
      >
        {de.notFound.backHome}
      </Link>
    </section>
  )
}
