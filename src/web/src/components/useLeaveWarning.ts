// The sheet pages' guard against losing an edit (src/components/sheet.tsx).
import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import { de } from '../text/de'

/**
 * Leaving with typed-in changes asks first: closing the tab, and moving to another page.
 * `quiet` is asked at the moment of leaving, e.g. while saving or after a deliberate leave.
 */
export function useLeaveWarning(dirty: boolean, quiet: () => boolean) {
  const blocker = useBlocker(() => dirty && !quiet())
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(de.sheet.leave)) blocker.proceed()
    else blocker.reset()
  }, [blocker])
}
