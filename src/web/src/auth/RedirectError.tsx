import { useSearchParams } from 'react-router'
import { isApiErrorCode } from '../api/errors'
import { ErrorAlert } from '../components/ui'
import { de } from '../text/de'

/**
 * Shows the error the server sent with a redirect, e.g. after Google sign-in:
 * `?fehler=googleNoInvite`. An unknown value gets the general message.
 */
export function RedirectError() {
  const [params] = useSearchParams()
  const code = params.get('fehler')
  if (!code) return null
  return <ErrorAlert error={isApiErrorCode(code) ? de.errors[code] : de.requestErrors.unknown} />
}
