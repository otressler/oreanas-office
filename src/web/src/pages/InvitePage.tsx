import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../api/client'
import { ApiRequestError, unwrap } from '../api/errors'
import { googleLoginUrl, useAuthOptions, useMe, useSetSignedIn } from '../auth/auth'
import { GoogleButton } from '../auth/GoogleButton'
import { RedirectError } from '../auth/RedirectError'
import {
  Button,
  ButtonLink,
  ErrorAlert,
  LoadError,
  Loading,
  PageTitle,
  TextField,
} from '../components/ui'
import { formatDateTime } from '../lib/dates'
import { de } from '../text/de'
import { limits } from '../lib/limits'

/** /einladung/:token — registration through an admin's invite link. */
export function InvitePage() {
  const { token = '' } = useParams()
  const me = useMe()

  if (me.isPending) return null
  if (me.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <PageTitle>{de.invite.signedInTitle}</PageTitle>
        <p className="text-dim">{de.invite.signedInBody}</p>
        <ButtonLink to="/">{de.common.toHome}</ButtonLink>
      </div>
    )
  }
  return <Registration token={token} />
}

function Registration({ token }: { token: string }) {
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => unwrap(api.GET('/api/auth/invites/{token}', { params: { path: { token } } })),
  })
  const options = useAuthOptions()

  if (invite.isPending) return <Loading />
  if (invite.isError) {
    return <LoadError error={invite.error} onRetry={() => void invite.refetch()} />
  }
  if (!invite.data.valid) {
    return (
      <div className="flex flex-col gap-3">
        <PageTitle>{de.invite.invalidTitle}</PageTitle>
        <RedirectError />
        <p className="text-dim">{de.invite.invalidBody}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 pb-8">
      <PageTitle>{de.invite.title}</PageTitle>
      {invite.data.expiresAt && (
        <p className="text-sm text-dim">
          {de.invite.validUntil(formatDateTime(invite.data.expiresAt))}
        </p>
      )}
      <RedirectError />
      <RegistrationForm token={token} />
      {options.data?.googleEnabled && (
        <>
          <p className="text-center text-sm text-dim">{de.common.or}</p>
          <GoogleButton href={googleLoginUrl('/', token)}>{de.invite.google}</GoogleButton>
        </>
      )}
      <Link to="/anmelden" className="text-sm text-candle underline-offset-4 hover:underline">
        {de.invite.haveAccount}
      </Link>
    </div>
  )
}

function RegistrationForm({ token }: { token: string }) {
  const navigate = useNavigate()
  const setSignedIn = useSetSignedIn()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const register = useMutation({
    mutationFn: async () => {
      // The server checks this too; checking first saves a round trip.
      if (password.length < limits.passwordMin) {
        throw new ApiRequestError(400, 'passwordTooShort', 'password')
      }
      return unwrap(
        api.POST('/api/auth/register', {
          body: { inviteToken: token, displayName: displayName.trim(), email, password },
        }),
      )
    },
    onSuccess: (me) => {
      setSignedIn(me)
      void navigate('/', { replace: true })
    },
  })

  const field = register.error instanceof ApiRequestError ? register.error.field : null

  function submit(event: FormEvent) {
    event.preventDefault()
    register.mutate()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField
        label={de.invite.displayName}
        hint={de.invite.displayNameHint}
        autoComplete="nickname"
        required
        maxLength={limits.displayName}
        value={displayName}
        invalid={field === 'displayName'}
        onChange={(event) => setDisplayName(event.target.value)}
      />
      <TextField
        label={de.invite.email}
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        invalid={field === 'email'}
        onChange={(event) => setEmail(event.target.value)}
      />
      <TextField
        label={de.invite.password}
        hint={de.invite.passwordHint}
        type="password"
        autoComplete="new-password"
        required
        value={password}
        invalid={field === 'password'}
        onChange={(event) => setPassword(event.target.value)}
      />
      <ErrorAlert error={register.error} />
      <Button type="submit" variant="primary" busy={register.isPending}>
        {de.invite.submit}
      </Button>
    </form>
  )
}
