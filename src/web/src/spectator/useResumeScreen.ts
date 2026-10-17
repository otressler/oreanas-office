// Reopening the app on a device that is a session's spectator screen brings that screen back
// (knowledge/features/spectator-view.md, "The screen"), until someone leaves the view. Once per
// browser tab, so the back button from the screen doesn't bounce straight back to it.
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useCurrentUser } from '../auth/auth'
import { screenPath, screenToResume } from './remember'

const RESUMED_KEY = 'oreana.resumedSpectator'

/** Opens the remembered screen from the landing page. True while that is going to happen. */
export function useResumeScreen(): boolean {
  const me = useCurrentUser()
  const navigate = useNavigate()
  const screen = screenToResume(me.id)
  const resume = screen !== null && !resumedInThisTab()
  useEffect(() => {
    if (!resume || !screen) return
    try {
      sessionStorage.setItem(RESUMED_KEY, '1')
    } catch {
      return
    }
    void navigate(screenPath(screen), { replace: true })
    // The remembered screen is read once, when the landing page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return resume
}

function resumedInThisTab(): boolean {
  try {
    return sessionStorage.getItem(RESUMED_KEY) !== null
  } catch {
    // Without storage there is no "once": stay on the landing page.
    return true
  }
}
