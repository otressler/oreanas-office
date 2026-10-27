import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { CampaignSummary } from '../api/types'
import { ringColor } from '../board/palette'
import { CampaignCover } from '../campaigns/CampaignCover'
import { useLocalCampaigns } from '../campaigns/localCampaigns'
import { campaignKeys, useCampaigns } from '../campaigns/queries'
import {
  ChevronButton,
  ChevronLink,
  CoverLabel,
  Diamond,
  PicturePanel,
  Rule,
  SectionHeading,
} from '../components/ornaments'
import { ErrorAlert, LoadError, Loading, TextField } from '../components/ui'
import { formatDate } from '../lib/dates'
import { picture } from '../lib/pictures'
import { SyncMark } from '../maps/SyncMark'
import type { CampaignCopy } from '../offline/db'
import { cleanJoinCode } from '../spectator/joinCode'
import { useResumeScreen } from '../spectator/useResumeScreen'
import { joinPath } from '../sessions/paths'
import { de } from '../text/de'
import { TokenPicture } from '../tokenImages/TokenPicture'
import { limits } from '../lib/limits'

// Pictures in public/home/ (knowledge/features/campaign-overview.md).
const JOIN_PICTURE = picture('home/join')
const CREATE_PICTURE = picture('home/create')

/** How many characters a card shows before "+3". */
const CARD_CHARACTERS = 6

/**
 * Home: your campaigns as cards, then joining one by code or creating one, in the look of
 * the landing page (knowledge/features/campaign-overview.md). Uses a desktop's width.
 */
export function HomePage() {
  const campaigns = useCampaigns()
  // A device that is a session's spectator screen goes back to it before anything else.
  const resuming = useResumeScreen()
  useLandOnFight(resuming ? undefined : campaigns.data)
  // Campaigns made offline that the server doesn't list yet.
  const listed = new Set(campaigns.data?.map((campaign) => campaign.id))
  const local = (useLocalCampaigns() ?? []).filter((copy) => !listed.has(copy.id))
  const newId = useId()

  return (
    <div className="relative isolate flex flex-col gap-16 pt-8 pb-12 sm:pt-12">
      <img
        src="/landing/backdrop-1536.webp"
        srcSet="/landing/backdrop-768.webp 768w, /landing/backdrop-1536.webp 1536w"
        sizes="(min-width: 1024px) 60vw, 100vw"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 right-0 -z-10 h-80 w-full object-cover opacity-25 [mask-image:radial-gradient(70%_70%_at_75%_25%,black,transparent)] sm:-top-12 lg:w-3/5"
      />
      <section>
        <SectionHeading kicker={de.home.kicker} level={1}>
          {de.home.title}
        </SectionHeading>
        <div className="mt-10">
          {campaigns.isPending ? (
            <Loading />
          ) : campaigns.isError ? (
            <LoadError error={campaigns.error} onRetry={() => void campaigns.refetch()} />
          ) : campaigns.data.length === 0 && local.length === 0 ? (
            <p className="max-w-xl rounded-sm border border-candle/25 bg-panel/70 p-5 text-dim">
              {de.home.empty}
            </p>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {local.map((copy) => (
                <li key={copy.id} className="flex">
                  <LocalCampaignCard copy={copy} />
                </li>
              ))}
              {campaigns.data.map((campaign) => (
                <li key={campaign.id} className="flex">
                  <CampaignCard campaign={campaign} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section aria-labelledby={newId}>
        <SectionHeading id={newId} kicker={de.home.newKicker} level={2}>
          {de.home.newTitle}
        </SectionHeading>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <JoinForm />
          <CreateForm />
        </div>
      </section>
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

/**
 * A card's frame: the cover on top fading into the panel, a double gold edge, and the
 * title as a link that covers the whole card, cover included. Links can't nest, so the
 * fight's button sits above that link (z-10).
 */
function CardFrame({
  to,
  name,
  coverUrl,
  corner,
  children,
}: {
  to: string
  name: string
  coverUrl: string | null
  /** Over the cover's top: the role and the sync state. */
  corner: ReactNode
  children: ReactNode
}) {
  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-sm border border-candle/25 bg-panel shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] transition-colors focus-within:border-candle/70 hover:border-candle/60">
      <div className="relative aspect-[3/2] overflow-hidden">
        <CampaignCover
          url={coverUrl}
          alt=""
          className="size-full transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-panel via-panel/60 to-transparent"
        />
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">{corner}</div>
      </div>
      {/* Over the cover by z-index, which a flex item takes without `relative`: positioned,
          it would hold the title's link to this part of the card and leave the cover dead. */}
      <div className="z-[1] -mt-14 flex flex-1 flex-col gap-4 px-5 pb-5">
        {/* A text shadow, not drop-shadow: a filter would hold the link to the title, too. */}
        <h2 className="font-display text-2xl leading-tight font-semibold text-parchment text-shadow-[0_2px_8px_rgb(0_0_0/0.9)]">
          <Link
            to={to}
            className="outline-none after:absolute after:inset-0 after:content-[''] hover:text-candle-strong"
          >
            {name}
          </Link>
        </h2>
        <Rule className="-mt-2 w-32" />
        {children}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-1.5 rounded-sm border border-candle/10"
      />
    </article>
  )
}

/** A campaign made on this device: no fight, no join code until it is synced. */
function LocalCampaignCard({ copy }: { copy: CampaignCopy }) {
  return (
    <CardFrame
      to={`/kampagnen/${copy.id}`}
      name={copy.name}
      coverUrl={null}
      corner={
        <>
          <CoverLabel>{de.roles[copy.myRole]}</CoverLabel>
          {copy.sync && <SyncMark sync={copy.sync} />}
        </>
      }
    >
      <p className="text-sm text-dim">{de.sync.localCampaign.localBody}</p>
    </CardFrame>
  )
}

function CampaignCard({ campaign }: { campaign: CampaignSummary }) {
  return (
    <CardFrame
      to={`/kampagnen/${campaign.id}`}
      name={campaign.name}
      coverUrl={campaign.coverUrl}
      corner={<CoverLabel>{de.roles[campaign.myRole]}</CoverLabel>}
    >
      {campaign.description && (
        <p className="line-clamp-3 text-sm text-parchment/80">{campaign.description}</p>
      )}
      <CardCharacters characters={campaign.characters} />
      <ActiveSession campaign={campaign} />
    </CardFrame>
  )
}

/** The campaign's characters, the viewer's own first, in their ring colours. */
function CardCharacters({ characters }: { characters: CampaignSummary['characters'] }) {
  if (characters.length === 0) {
    return <p className="text-sm text-dim italic">{de.home.noCharacters}</p>
  }
  const shown = characters.slice(0, CARD_CHARACTERS)
  const more = characters.length - shown.length
  return (
    <ul aria-label={de.home.characters} className="flex flex-wrap gap-x-3 gap-y-2">
      {shown.map((character) => (
        <li key={character.id} className="flex min-w-0 items-center gap-1.5">
          <TokenPicture
            url={character.portraitUrl}
            label={character.name}
            ring={ringColor({ kind: 'character', ...character })}
            alt=""
            className="h-8 w-8 text-sm"
          />
          <span
            className={`max-w-[8rem] truncate text-sm ${character.mine ? 'font-semibold text-parchment' : 'text-dim'}`}
          >
            {character.name}
          </span>
        </li>
      ))}
      {more > 0 && (
        <li className="flex items-center text-sm text-dim">
          <span aria-hidden="true">{de.home.moreCharacters(more)}</span>
          <span className="sr-only">{de.home.moreCharactersLabel(more)}</span>
        </li>
      )}
    </ul>
  )
}

/** The running session and, if one is on, its fight with a way in. */
function ActiveSession({ campaign }: { campaign: CampaignSummary }) {
  const session = campaign.activeSession
  if (!session) return null
  const fight = session.activeEncounter
  return (
    <div className="mt-auto flex flex-col gap-3 border-t border-candle/15 pt-4">
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 font-display text-[0.65rem] font-semibold tracking-[0.25em] text-candle uppercase">
          <Diamond className="bg-candle motion-safe:animate-pulse" />
          {de.home.activeSession}
        </span>
        <span className="text-parchment">{session.title}</span>
        <span className="text-sm text-dim">
          {formatDate(session.date)} · {de.sessions.dmName(session.dmDisplayName)}
        </span>
      </div>
      {fight && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-semibold tracking-wide text-candle uppercase">
              {de.encounters.running}
            </span>
            <span className="text-parchment">{fight.name}</span>
          </div>
          <ChevronLink
            variant="light"
            small
            className="z-10 ml-auto"
            to={`/kampagnen/${campaign.id}/kampf/${fight.id}`}
          >
            {de.encounters.toFight}
          </ChevronLink>
        </div>
      )}
    </div>
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
    <PicturePanel title={de.home.joinTitle} body={de.home.joinBody} image={JOIN_PICTURE}>
      <form onSubmit={submit} className="mt-2 flex flex-1 flex-col gap-4">
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
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-5 pt-2">
          <ChevronButton type="submit" variant="light" busy={join.isPending}>
            {de.home.join}
          </ChevronButton>
          {/* The same choice as the QR code's join page: "Mitspielen" or "Nur zuschauen". */}
          <ChevronButton
            disabled={!code.trim()}
            onClick={() => void navigate(joinPath(cleanJoinCode(code)))}
          >
            {de.spectator.joinFormWatch}
          </ChevronButton>
        </div>
      </form>
    </PicturePanel>
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
    <PicturePanel title={de.home.createTitle} body={de.home.createBody} image={CREATE_PICTURE}>
      <form onSubmit={submit} className="mt-2 flex flex-1 flex-col gap-4">
        <TextField
          label={de.home.createName}
          hint={de.home.createHint}
          required
          maxLength={limits.campaignName}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <ErrorAlert error={create.error} />
        <div className="mt-auto pt-2">
          <ChevronButton type="submit" variant="light" busy={create.isPending}>
            {de.common.create}
          </ChevronButton>
        </div>
      </form>
    </PicturePanel>
  )
}
