import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import { meQueryKey } from '../api/queryClient'
import { googleLinkUrl, useAuthOptions, useCurrentUser, useSetSignedIn } from '../auth/auth'
import { GoogleButton } from '../auth/GoogleButton'
import { useSignOutGuard } from '../auth/useSignOutGuard'
import { RedirectError } from '../auth/RedirectError'
import { Button, ButtonLink, ErrorAlert, Note, PageTitle, Panel, TextField } from '../components/ui'
import { de } from '../text/de'
import { limits } from '../lib/limits'
import { canVibrate, setVibrationEnabled, vibrationEnabled } from '../table/haptics'

/** /profil: display name, Google, sign out, and the way to the admin page. */
export function ProfilePage() {
  const me = useCurrentUser()
  const options = useAuthOptions()
  const navigate = useNavigate()
  const setSignedIn = useSetSignedIn()
  // Warns first when changes on this device are not synced.
  const signOutGuard = useSignOutGuard()

  const signOut = useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/logout')),
    onSuccess: () => {
      setSignedIn(null)
      void navigate('/anmelden', { replace: true })
    },
  })

  return (
    <div className="flex flex-col pb-8">
      <PageTitle>{de.profile.title}</PageTitle>
      <RedirectError />
      <DisplayNameForm initial={me.displayName} />

      {me.hasGoogle ? (
        <Panel title={de.profile.googleTitle}>
          <p className="text-dim">{de.profile.googleLinked}</p>
        </Panel>
      ) : (
        options.data?.googleEnabled && (
          <Panel title={de.profile.googleTitle}>
            <p className="text-dim">{de.profile.googleNotLinked}</p>
            <GoogleButton href={googleLinkUrl('/profil')}>{de.profile.googleLink}</GoogleButton>
          </Panel>
        )
      )}

      <VibrationSwitch />

      <div className="mt-6 flex flex-wrap gap-3">
        {me.isAdmin && <ButtonLink to="/admin">{de.profile.admin}</ButtonLink>}
        <Button
          onClick={() => void signOutGuard.request(() => signOut.mutate())}
          busy={signOut.isPending}
        >
          {de.profile.signOut}
        </Button>
      </div>
      <div className="mt-3">
        <ErrorAlert error={signOut.error} />
      </div>
      {signOutGuard.dialog}
    </div>
  )
}

/**
 * "Vibrieren" (knowledge/features/player-extras.md): remembered on this device, on by
 * default. Only where the device can vibrate; iPhones and iPads can't from a web app.
 */
function VibrationSwitch() {
  const [on, setOn] = useState(vibrationEnabled)
  if (!canVibrate()) return null
  return (
    <Panel title={de.playerExtras.vibrateTitle}>
      <label className="flex min-h-11 items-center gap-3 text-parchment">
        <input
          type="checkbox"
          role="switch"
          className="size-5 shrink-0 accent-candle"
          checked={on}
          onChange={(event) => {
            setOn(event.target.checked)
            setVibrationEnabled(event.target.checked)
          }}
        />
        {de.playerExtras.vibrate}
      </label>
      <p className="text-sm text-dim">{de.playerExtras.vibrateHint}</p>
    </Panel>
  )
}

function DisplayNameForm({ initial }: { initial: string }) {
  const me = useCurrentUser()
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(initial)

  const save = useMutation({
    mutationFn: () =>
      unwrap(api.PUT('/api/auth/me', { body: { displayName: displayName.trim() } })),
    onSuccess: (updated) => queryClient.setQueryData(meQueryKey, updated),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }

  return (
    <Panel title={de.profile.displayName}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextField
          label={de.profile.displayName}
          autoComplete="nickname"
          required
          maxLength={limits.displayName}
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value)
            save.reset()
          }}
        />
        <p className="text-sm text-dim">{de.profile.email(me.email)}</p>
        <ErrorAlert error={save.error} />
        {save.isSuccess && <Note>{de.common.saved}</Note>}
        <div>
          <Button type="submit" variant="primary" busy={save.isPending}>
            {de.common.save}
          </Button>
        </div>
      </form>
    </Panel>
  )
}
