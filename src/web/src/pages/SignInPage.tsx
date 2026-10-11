import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import { googleLoginUrl, safeReturnPath, useAuthOptions, useMe, useSetSignedIn } from '../auth/auth'
import { GoogleButton } from '../auth/GoogleButton'
import { RedirectError } from '../auth/RedirectError'
import { Button, ErrorAlert, Note, PageTitle, TextField } from '../components/ui'
import { de } from '../text/de'

/** Where the password reset page sends people afterwards. */
export interface SignInState {
  passwordReset?: boolean
}

/** /anmelden?zurueck=<path>: email and password, or Google. */
export function SignInPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const returnPath = safeReturnPath(params.get('zurueck'))
  const me = useMe()
  const options = useAuthOptions()
  const setSignedIn = useSetSignedIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/login', { body: { email, password } })),
    // Signed in: the redirect below takes over.
    onSuccess: setSignedIn,
  })

  if (me.data) return <Navigate replace to={returnPath} />
  if (me.isPending) return null

  function submit(event: FormEvent) {
    event.preventDefault()
    login.mutate()
  }

  const passwordReset = (location.state as SignInState | null)?.passwordReset

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 pb-8">
      <PageTitle>{de.signIn.title}</PageTitle>
      {passwordReset && <Note>{de.signIn.resetDone}</Note>}
      <RedirectError />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label={de.signIn.email}
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label={de.signIn.password}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <ErrorAlert error={login.error} />
        <Button type="submit" variant="primary" busy={login.isPending}>
          {de.signIn.submit}
        </Button>
      </form>
      {options.data?.googleEnabled && (
        <>
          <p className="text-center text-sm text-dim">{de.common.or}</p>
          <GoogleButton href={googleLoginUrl(returnPath)}>{de.signIn.google}</GoogleButton>
        </>
      )}
      <p className="text-sm text-dim">{de.signIn.inviteNote}</p>
      <p className="text-sm text-dim">{de.signIn.forgotNote}</p>
    </div>
  )
}
