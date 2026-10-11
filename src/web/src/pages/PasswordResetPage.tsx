import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { ApiRequestError, unwrap } from '../api/errors'
import { Button, ErrorAlert, PageTitle, TextField } from '../components/ui'
import { de } from '../text/de'
import type { SignInState } from './SignInPage'

const MIN_PASSWORD_LENGTH = 8

/** /passwort-zuruecksetzen?benutzer=<userId>&token=<token>, a link the admin sent. */
export function PasswordResetPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const userId = params.get('benutzer')
  const token = params.get('token')
  const [password, setPassword] = useState('')

  const reset = useMutation({
    mutationFn: async () => {
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new ApiRequestError(400, 'passwordTooShort', 'newPassword')
      }
      await unwrap(
        api.POST('/api/auth/password-reset', {
          body: { userId: userId!, token: token!, newPassword: password },
        }),
      )
    },
    onSuccess: () => {
      const state: SignInState = { passwordReset: true }
      void navigate('/anmelden', { replace: true, state })
    },
  })

  if (!userId || !token) {
    return (
      <div className="flex flex-col gap-3">
        <PageTitle>{de.passwordReset.title}</PageTitle>
        <ErrorAlert error={de.passwordReset.incompleteLink} />
      </div>
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    reset.mutate()
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 pb-8">
      <PageTitle>{de.passwordReset.title}</PageTitle>
      <p className="text-dim">{de.passwordReset.body}</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label={de.passwordReset.newPassword}
          hint={de.passwordReset.hint}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <ErrorAlert error={reset.error} />
        <Button type="submit" variant="primary" busy={reset.isPending}>
          {de.passwordReset.submit}
        </Button>
      </form>
    </div>
  )
}
