// All interface text, in German (knowledge/decisions/ui-language.md).
// Components import from here; no user-facing strings in components.
import type { ApiErrorCode, CampaignRole, CreatureSize, SessionStatus } from '../api/types'

export const de = {
  appName: "Oreana's Office",

  notFound: {
    title: 'Diese Seite gibt es nicht',
    body: 'Vielleicht ist der Link veraltet oder falsch geschrieben.',
    backHome: 'Zur Startseite',
  },

  serverGate: {
    wakingTitle: 'Der Tisch wird geweckt…',
    wakingBody:
      'Zwischen den Spielabenden schläft der Server. Das Aufwachen kann bis zu einer Minute dauern.',
    offlineTitle: 'Keine Verbindung',
    offlineBody:
      'Dein Gerät ist gerade offline. Sobald die Verbindung zurück ist, geht es von selbst weiter.',
    errorTitle: 'Der Tisch kann nicht starten',
    errorBody:
      'Der Server hat ein Problem, das sich nicht durch Warten löst. Sag bitte deiner Spielleitung Bescheid.',
    retry: 'Erneut versuchen',
  },

  install: {
    button: 'App installieren',
    iosTitle: 'Als App installieren',
    /** Followed by the share symbol. */
    iosShare: 'Tippe auf „Teilen“',
    iosShareMenu: 'Je nach Ansicht steckt es im Menü „…“.',
    iosAdd: 'Wähle „Zum Home-Bildschirm“ und dann „Hinzufügen“.',
    close: 'Schließen',
  },

  update: {
    message: 'Eine neue Version ist bereit.',
    reload: 'Neu laden',
    later: 'Später',
  },

  units: {
    /** A distance in meters, e.g. "7,5 m". The number is already formatted. */
    meters: (value: string) => `${value} m`,
  },

  common: {
    save: 'Speichern',
    saved: 'Gespeichert.',
    cancel: 'Abbrechen',
    edit: 'Bearbeiten',
    create: 'Anlegen',
    loading: 'Wird geladen…',
    retry: 'Erneut versuchen',
    copy: 'Kopieren',
    copied: 'Kopiert',
    share: 'Teilen',
    link: 'Link',
    or: 'oder',
    toHome: 'Zur Startseite',
    /** After the display name of the signed-in user in lists. */
    you: '(du)',
  },

  header: {
    /** Accessible name of the profile link; the visible text is the display name. */
    profile: (name: string) => `Profil von ${name}`,
  },

  signIn: {
    title: 'Anmelden',
    email: 'E-Mail-Adresse',
    password: 'Passwort',
    submit: 'Anmelden',
    google: 'Mit Google anmelden',
    inviteNote: 'Neu hier? Ein Konto bekommst du nur über einen Einladungslink vom Admin.',
    forgotNote: 'Passwort vergessen? Der Admin kann dir einen Link zum Zurücksetzen schicken.',
    resetDone: 'Dein Passwort ist geändert. Melde dich jetzt mit dem neuen an.',
  },

  invite: {
    title: 'Konto erstellen',
    checking: 'Einladung wird geprüft…',
    invalidTitle: 'Link abgelaufen',
    invalidBody:
      'Dieser Einladungslink ist abgelaufen oder wurde zurückgezogen. Frag beim Admin nach einem neuen.',
    validUntil: (time: string) => `Der Link gilt bis ${time} Uhr.`,
    displayName: 'Anzeigename',
    displayNameHint: 'So sehen dich die anderen am Tisch.',
    email: 'E-Mail-Adresse',
    password: 'Passwort',
    passwordHint: 'Mindestens 8 Zeichen.',
    submit: 'Konto erstellen',
    google: 'Mit Google registrieren',
    haveAccount: 'Schon ein Konto? Hier anmelden',
    signedInTitle: 'Du bist schon angemeldet',
    signedInBody:
      'Auf diesem Gerät bist du bereits angemeldet. Für ein weiteres Konto melde dich zuerst im Profil ab.',
  },

  passwordReset: {
    title: 'Neues Passwort',
    body: 'Leg ein neues Passwort für dein Konto fest.',
    newPassword: 'Neues Passwort',
    hint: 'Mindestens 8 Zeichen.',
    submit: 'Passwort speichern',
    incompleteLink:
      'Dieser Link ist unvollständig. Kopier ihn bitte ganz oder frag beim Admin nach einem neuen.',
  },

  profile: {
    title: 'Profil',
    displayName: 'Anzeigename',
    email: (address: string) => `Angemeldet als ${address}`,
    googleTitle: 'Google',
    googleLinked: 'Dein Google-Konto ist verknüpft. Du kannst dich damit anmelden.',
    googleNotLinked: 'Verknüpfe dein Google-Konto, dann kannst du dich ohne Passwort anmelden.',
    googleLink: 'Google verknüpfen',
    signOut: 'Abmelden',
    admin: 'Zur Verwaltung',
  },

  admin: {
    title: 'Verwaltung',
    invitesTitle: 'Einladungslinks',
    invitesBody:
      'Ein Link gilt 4 Stunden und funktioniert für mehrere Leute, du kannst ihn also in eure Gruppe schicken.',
    createInvite: 'Einladungslink erstellen',
    newInviteNote: 'Dieser Link wird nur jetzt angezeigt. Kopier oder teil ihn gleich.',
    inviteShareTitle: "Einladung zu Oreana's Office",
    validUntil: (time: string) => `Gültig bis ${time} Uhr`,
    createdAt: (time: string) => `Erstellt ${time} Uhr`,
    inviteLabel: (time: string) => `Einladungslink, gültig bis ${time} Uhr`,
    noInvites: 'Gerade gibt es keinen gültigen Einladungslink.',
    revoke: 'Widerrufen',
    usersTitle: 'Konten',
    noUsers: 'Noch keine Konten.',
    resetLink: 'Reset-Link erstellen',
    resetLinkNote: 'Schick diesen Link nur dieser Person. Er funktioniert ein Mal.',
    resetShareTitle: "Neues Passwort für Oreana's Office",
    resetLinkLabel: (name: string) => `Reset-Link für ${name}`,
    hasPassword: 'Passwort',
    hasGoogle: 'Google',
  },

  home: {
    title: 'Deine Kampagnen',
    empty:
      'Du bist noch in keiner Kampagne. Tritt mit dem Code deiner Spielleitung bei oder leg selbst eine an.',
    activeSession: 'Läuft gerade',
    joinTitle: 'Kampagne beitreten',
    joinCode: 'Beitrittscode',
    joinHint: 'Sechs Zeichen, die dir deine Spielleitung gibt.',
    join: 'Beitreten',
    createTitle: 'Neue Kampagne',
    createName: 'Name der Kampagne',
    createHint: 'Du wirst ihre Spielleitung.',
  },

  roles: {
    dm: 'Spielleitung',
    player: 'Spieler',
  } satisfies Record<CampaignRole, string>,

  campaign: {
    back: 'Alle Kampagnen',
    membersTitle: 'Mitglieder',
    promote: 'Zur Spielleitung machen',
    defaultDm: 'Standard-Spielleitung',
    joinCodeTitle: 'Beitrittscode',
    joinCodeBody: 'Mit diesem Code treten andere der Kampagne bei.',
    joinCodeShareTitle: (name: string) => `Beitrittscode für ${name}`,
    replaceJoinCode: 'Neuen Code erstellen',
    replaceJoinCodeNote: 'Der alte Code funktioniert danach nicht mehr.',
  },

  characters: {
    title: 'Charaktere',
    empty: 'Noch keine Charaktere.',
    add: 'Neuer Charakter',
    name: 'Name',
    size: 'Größe',
    speed: 'Geschwindigkeit in Metern',
    speedHint: 'Zum Beispiel 9 oder 7,5.',
    /** The input isn't a multiple of 1.5 m; `meters` is already formatted, e.g. "9 m". */
    speedRounded: (meters: string) => `Wird auf ${meters} abgerundet.`,
    owner: (name: string) => `Gehört ${name}`,
    speedValue: (meters: string) => `Geschwindigkeit ${meters}`,
    editTitle: (name: string) => `${name} bearbeiten`,
  },

  sizes: {
    tiny: 'Winzig',
    small: 'Klein',
    medium: 'Mittelgroß',
    large: 'Groß',
    huge: 'Riesig',
    gargantuan: 'Gigantisch',
  } satisfies Record<CreatureSize, string>,

  sessions: {
    title: 'Sitzungen',
    empty: 'Noch keine Sitzungen.',
    add: 'Neue Sitzung',
    titleLabel: 'Titel',
    titlePlaceholder: 'z. B. Sitzung 12 – Die Hängebrücke',
    date: 'Datum',
    dm: 'Spielleitung',
    defaultDm: (name: string) => `Standard (${name})`,
    dmName: (name: string) => `Spielleitung: ${name}`,
    activate: 'Starten',
    end: 'Beenden',
    changeDm: 'Spielleitung wechseln',
    applyDm: 'Übernehmen',
  },

  sessionStatus: {
    planned: 'Geplant',
    active: 'Läuft',
    ended: 'Beendet',
  } satisfies Record<SessionStatus, string>,

  /** One text per error code the API can send. A new code is a type error here. */
  errors: {
    inviteInvalid:
      'Dieser Einladungslink ist abgelaufen oder wurde zurückgezogen. Frag beim Admin nach einem neuen.',
    emailInvalid: 'Diese E-Mail-Adresse sieht nicht richtig aus.',
    emailTaken: 'Mit dieser E-Mail-Adresse gibt es schon ein Konto. Melde dich damit an.',
    passwordTooShort: 'Das Passwort braucht mindestens 8 Zeichen.',
    displayNameInvalid: 'Bitte gib einen Anzeigenamen an.',
    invalidCredentials: 'E-Mail-Adresse oder Passwort stimmen nicht.',
    lockedOut: 'Zu viele Fehlversuche. Warte ein paar Minuten und versuch es dann noch einmal.',
    resetLinkInvalid:
      'Dieser Link zum Zurücksetzen ist abgelaufen oder wurde schon benutzt. Frag beim Admin nach einem neuen.',
    googleFailed: 'Die Anmeldung mit Google hat nicht geklappt. Versuch es bitte noch einmal.',
    googleNoInvite:
      'Zu diesem Google-Konto gibt es hier noch kein Konto. Für ein neues brauchst du einen Einladungslink vom Admin.',
    googleEmailTaken:
      'Mit der Adresse dieses Google-Kontos gibt es schon ein Konto. Melde dich mit Passwort an und verknüpfe Google im Profil.',
    googleAccountInUse: 'Dieses Google-Konto ist schon mit einem anderen Konto verknüpft.',
    googleAlreadyLinked: 'Mit deinem Konto ist schon ein Google-Konto verknüpft.',
    nameInvalid: 'Bitte gib einen Namen an.',
    joinCodeInvalid:
      'Diesen Code gibt es nicht. Prüf ihn oder frag deine Spielleitung nach dem aktuellen.',
    speedInvalid: 'Gib die Geschwindigkeit in Metern an, zum Beispiel 9.',
    notADm: 'Diese Person gehört nicht zur Spielleitung der Kampagne.',
    anotherSessionActive: 'In dieser Kampagne läuft schon eine Sitzung. Beende sie zuerst.',
    sessionEnded: 'Diese Sitzung ist schon beendet.',
  } satisfies Record<ApiErrorCode, string>,

  /** Failures without an error code. */
  requestErrors: {
    unknown: 'Das hat nicht geklappt. Versuch es bitte noch einmal.',
    network: 'Keine Verbindung zum Server. Prüf dein Netz und versuch es noch einmal.',
    signedOut: 'Du bist nicht mehr angemeldet. Melde dich bitte neu an.',
    forbidden: 'Dafür fehlt dir die Berechtigung.',
    notFound: 'Das gibt es nicht (mehr).',
  },
} as const

export type Messages = typeof de
