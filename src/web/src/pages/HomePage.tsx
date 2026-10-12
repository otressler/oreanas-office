import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { CampaignSummary } from '../api/types'
import { campaignKeys, useCampaigns } from '../campaigns/queries'
import {
  Badge,
  Button,
  ButtonLink,
  ErrorAlert,
  LoadError,
  Loading,
  PageTitle,
  Panel,
  TextField,
} from '../components/ui'
import { formatDate } from '../lib/dates'
import { de } from '../text/de'
import { limits } from '../lib/limits'

/** The landing page: your campaigns, joining one by code, creating one. */
export function HomePage() {
  const campaigns = useCampaigns()
  useLandOnFight(campaigns.data)

  return (
    <div className="flex flex-col pb-8">
      <PageTitle>{de.home.title}</PageTitle>
      {campaigns.isPending ? (
        <Loading />
      ) : campaigns.isError ? (
        <LoadError error={campaigns.error} onRetry={() => void campaigns.refetch()} />
      ) : campaigns.data.length === 0 ? (
        <p className="text-dim">{de.home.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {campaigns.data.map((campaign) => (
            <li key={campaign.id}>
              <CampaignCard campaign={campaign} />
            </li>
          ))}
        </ul>
      )}
      <JoinForm />
      <CreateForm />
    </div>
  )
}

const LANDED_KEY = 'oreana.landedOnFight'

/**
 * Players opening the app land on the running fight (knowledge/implementation-plan.md,
 * stage 3): when exactly one campaign has one, go there. Once per browser tab, so
 * the back button and later visits to the landing page stay here.
 */
function useLandOnFight(campaigns: CampaignSummary[] | undefined) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!campaigns) return
    const fights = campaigns.flatMap((c) => {
      const fight = c.activeSession?.activeEncounter
      return fight ? [`/kampagnen/${c.id}/kampf/${fight.id}`] : []
    })
    if (fights.length !== 1) return
    try {
      if (sessionStorage.getItem(LANDED_KEY)) return
      sessionStorage.setItem(LANDED_KEY, '1')
    } catch {
      // Without storage (private mode, blocked site data) there is no "once": stay here.
      return
    }
    void navigate(fights[0]!)
  }, [campaigns, navigate])
}

function CampaignCard({ campaign }: { campaign: CampaignSummary }) {
  const session = campaign.activeSession
  const fight = session?.activeEncounter
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 has-[>a:hover]:border-candle">
      <CampaignCardLink campaign={campaign} />
      {fight && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-candle pl-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-semibold tracking-wide text-candle uppercase">
              {de.encounters.running}
            </span>
            <span className="text-parchment">{fight.name}</span>
          </div>
          <ButtonLink
            variant="primary"
            className="ml-auto"
            to={`/kampagnen/${campaign.id}/kampf/${fight.id}`}
          >
            {de.encounters.toFight}
          </ButtonLink>
        </div>
      )}
    </div>
  )
}

/** The card's main part; the fight link sits beside it, since links can't nest. */
function CampaignCardLink({ campaign }: { campaign: CampaignSummary }) {
  const session = campaign.activeSession
  return (
    <Link to={`/kampagnen/${campaign.id}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold text-parchment">{campaign.name}</span>
        <Badge>{de.roles[campaign.myRole]}</Badge>
      </div>
      {session && (
        <div className="flex flex-col gap-0.5 border-l-2 border-candle pl-3">
          <span className="text-xs font-semibold tracking-wide text-candle uppercase">
            {de.home.activeSession}
          </span>
          <span className="text-parchment">{session.title}</span>
          <span className="text-sm text-dim">
            {formatDate(session.date)} · {de.sessions.dmName(session.dmDisplayName)}
          </span>
        </div>
      )}
    </Link>
  )
}

function JoinForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')

  const join = useMutation({
    mutationFn: () => unwrap(api.POST('/api/campaigns/join', { body: { code: code.trim() } })),
    onSuccess: (campaign) => {
      void queryClient.invalidateQueries({ queryKey: campaignKeys.list })
      void navigate(`/kampagnen/${campaign.id}`)
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    join.mutate()
  }

  return (
    <Panel title={de.home.joinTitle}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextField
          label={de.home.joinCode}
          hint={de.home.joinHint}
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          className="[&_input]:font-mono [&_input]:tracking-widest [&_input]:uppercase"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <ErrorAlert error={join.error} />
        <div>
          <Button type="submit" variant="primary" busy={join.isPending}>
            {de.home.join}
          </Button>
        </div>
      </form>
    </Panel>
  )
}

function CreateForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: () => unwrap(api.POST('/api/campaigns', { body: { name: name.trim() } })),
    onSuccess: (campaign) => {
      queryClient.setQueryData(campaignKeys.detail(campaign.id), campaign)
      void queryClient.invalidateQueries({ queryKey: campaignKeys.list })
      void navigate(`/kampagnen/${campaign.id}`)
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <Panel title={de.home.createTitle}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextField
          label={de.home.createName}
          hint={de.home.createHint}
          required
          maxLength={limits.campaignName}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <ErrorAlert error={create.error} />
        <div>
          <Button type="submit" variant="primary" busy={create.isPending}>
            {de.common.create}
          </Button>
        </div>
      </form>
    </Panel>
  )
}
