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
    owner: (name: string) => `Gehört ${name}`,
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

  board: {
    /** Accessible name of the board; the name is the encounter's. */
    label: (name: string) => `Kampfkarte: ${name}`,
    /** Zooms out until the whole map fits on the screen. */
    fit: 'Ganze Karte',
    /** `meters` is already formatted, e.g. "1,5 m". */
    elevation: (meters: string) => `Höhe ${meters}`,
    /** The other tokens on a tapped token's cell, e.g. "Auch hier: Goblin 1, Brom". */
    alsoHere: (labels: string) => `Auch hier: ${labels}`,
    terrain: {
      void: 'Abgrund',
      floor: 'Boden',
      difficult: 'Schwieriges Gelände',
      water: 'Wasser',
      wall: 'Wand',
    } satisfies Record<import('../api/types').Terrain, string>,
    entranceKinds: {
      entrance: 'Eingang',
      exit: 'Ausgang',
      both: 'Ein- und Ausgang',
    } satisfies Record<import('../api/types').LayoutEntrance['kind'], string>,
    /** An entrance cell, e.g. "Eingang: Waldweg". */
    entrance: (kind: string, label: string) => (label ? `${kind}: ${label}` : kind),
  },

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

  encounterStatus: {
    draft: 'Entwurf',
    ready: 'Bereit',
    active: 'Läuft',
    ended: 'Vorbei',
    // Inline import keeps the shared import line untouched for parallel lanes.
  } satisfies Record<import('../api/types').EncounterStatus, string>,

  encounters: {
    title: 'Kämpfe',
    empty: 'Noch keine Kämpfe. Importiere eine Karte, um einen vorzubereiten.',
    importMap: 'Karte importieren',
    /** Grid size in squares, then meters, e.g. "20 × 12 Felder (30 m × 18 m)". */
    gridSize: (width: number, height: number, widthMeters: string, heightMeters: string) =>
      `${width} × ${height} Felder (${widthMeters} × ${heightMeters})`,
    creatures: (count: number) => (count === 1 ? '1 Kreatur' : `${count} Kreaturen`),
    setUp: 'Aufstellen und starten',
    needsSession:
      'Bereite Kämpfe startet die Spielleitung der laufenden Sitzung. Läuft keine, starte zuerst eine Sitzung.',
    oneAtATime:
      'In der laufenden Sitzung läuft schon ein Kampf. Beende ihn, bevor du den nächsten startest.',
    toFight: 'Zum Kampf',
    running: 'Kampf läuft',
    end: 'Kampf beenden',
    endQuestion: 'Kampf für alle beenden?',
    endConfirm: 'Ja, beenden',
    back: 'Zur Kampagne',
    overTitle: 'Dieser Kampf ist vorbei',
    overBody:
      'Die Spielleitung hat ihn beendet. Auf der Kampagnenseite siehst du, wie es weitergeht.',
    notRunningTitle: 'Dieser Kampf läuft gerade nicht',
    notRunningBody:
      'Er hat noch nicht begonnen, ist schon vorbei, oder der Link stimmt nicht. Auf der Kampagnenseite siehst du den laufenden Kampf.',

    import: {
      title: 'Karte importieren',
      samplesTitle: 'Beispielkarten',
      samplesBody: 'Fertige Karten mit Gegnern, gut zum Ausprobieren.',
      sampleSize: (width: number, height: number) => `${width} × ${height} Felder`,
      sampleNames: {
        'gorge-crossing': 'Schluchtübergang',
        crypt: 'Alte Gruft',
        'river-ford': 'Furt am Fluss',
        'open-field': 'Weite Ebene',
      },
      fileTitle: 'Eigene Datei',
      fileBody: 'Eine Kartendatei im JSON-Format, wie sie die Beispielkarten nutzen.',
      fileLabel: 'Datei wählen',
      fileDrop: 'oder hierher ziehen',
      importing: (name: string) => `${name} wird importiert…`,
      unreadable: 'Diese Datei lässt sich nicht lesen. Ist es wirklich eine JSON-Datei?',
      notAMap: 'Diese Datei ist keine Kartendatei.',
      /** Where in the file the server found the problem; `place` comes from `field`. */
      where: (place: string) => `Stelle in der Datei: ${place}`,
      field: {
        name: 'Name der Karte',
        width: 'Breite',
        height: 'Höhe',
        scene: 'Szene',
        vibe: 'Stimmung',
        lighting: 'Licht',
        layout: 'Layout',
        schemaVersion: 'Version des Layouts',
        cell: (n: number) => `Feld ${n} in der Liste der Felder`,
        feature: (n: number) => `Objekt ${n} in der Liste der Objekte`,
        entrance: (n: number) => `Eingang ${n} in der Liste der Ein- und Ausgänge`,
        creature: (n: number) => `Kreatur ${n} in der Liste der Kreaturen`,
      },
    },

    setup: {
      title: (name: string) => `Aufstellen: ${name}`,
      charactersTitle: 'Wer kämpft mit?',
      noCharacters: 'Die Kampagne hat noch keine Charaktere.',
      takesPart: (name: string) => `${name} kämpft mit`,
      placed: 'Steht',
      notPlaced: 'Noch nicht aufgestellt',
      pickCharacter:
        'Hake die Charaktere an, die mitkämpfen, und tippe einen an, um ihn aufzustellen.',
      pickCell: (name: string) => `Tippe auf ein markiertes Feld, um ${name} dorthin zu stellen.`,
      noRoom: (name: string) => `Für ${name} ist dort kein Platz.`,
      autoPlace: 'Automatisch aufstellen',
      autoPlaceFull: 'Für einige Charaktere ist kein freier Platz mehr.',
      start: 'Kampf starten',
      noneTicked: 'Hake mindestens einen Charakter an.',
      unplaced: (names: string) => `Noch nicht aufgestellt: ${names}`,
      /** The server rejected one character; `name` is that character. */
      concerns: (name: string) => `Betrifft: ${name}`,
      notSessionDm: 'Diesen Kampf startet die Spielleitung der laufenden Sitzung.',
      notReady: 'Dieser Kampf läuft schon oder ist vorbei.',
    },
  },

  /** The live table on the fight page: moving tokens, undo and the connection. */
  table: {
    /** The connection indicator in the top bar; visible text only while not connected. */
    status: {
      connecting: 'Verbinde…',
      connected: 'Verbunden',
      reconnecting: 'Verbindung weg – verbinde neu…',
      offline: 'Offline – Bewegen geht gerade nicht',
      paused: 'Pausiert',
      idle: 'Pausiert – tippe, um weiterzuspielen',
      // Inline import keeps the shared import line untouched for parallel lanes.
    } satisfies Record<import('../table/connection').TableStatus, string>,
    /** A token is selected; `name` is its label. */
    pickTarget: (name: string) => `${name}: Tippe auf das Feld, auf das die Figur soll.`,
    /** The preview is shown. */
    confirmHint: (name: string) => `${name} hierhin? Tippe noch einmal darauf zum Bestätigen.`,
    confirm: 'Hierhin',
    cancel: 'Abbrechen',
    undo: 'Rückgängig',
    invalidTarget: 'Dort kann die Figur nicht stehen. Wähle ein anderes Feld.',
    movingOff: 'Ohne Verbindung zum Tisch lassen sich keine Figuren bewegen.',
    /** The move got no answer (the connection broke); the token is back. */
    moveFailed: 'Der Zug ist nicht angekommen. Die Figur steht wieder auf ihrem Feld.',
    undoFailed: 'Das Rückgängigmachen ist nicht angekommen. Versuch es bitte noch einmal.',
  },

  /** The map editor's frame (src/editor). */
  editor: {
    /** Accessible name of the canvas; the name is the map's. */
    canvasLabel: (name: string) => `Karteneditor: ${name}`,
    back: 'Zur Kartenliste',
    toolbar: 'Werkzeuge',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    /** Tooltip of a tool button: its name and shortcut key. */
    toolTitle: (label: string, key: string | undefined) =>
      key ? `${label} (${key.toUpperCase()})` : label,
    toolGroups: {
      terrain: 'Gelände',
      elevation: 'Höhe',
      features: 'Objekte',
      entrances: 'Ein- und Ausgänge',
    } satisfies Record<import('../editor/tools').ToolGroup, string>,
    edit: 'Bearbeiten',
    preview: 'Vorschau',
    saving: 'Speichert…',
    saved: 'Auf diesem Gerät gespeichert',
    saveFailed:
      'Speichern auf diesem Gerät hat nicht geklappt. Bleib auf der Seite und versuch es gleich noch einmal.',
    notFoundTitle: 'Diese Karte gibt es hier nicht',
    notFoundBody:
      'Sie liegt nicht auf diesem Gerät, oder der Link stimmt nicht. Karten vom Server kommen mit der Synchronisierung.',
    notDmTitle: 'Nur für die Spielleitung',
    notDmBody: 'Karten bearbeiten nur Mitglieder der Spielleitung dieser Kampagne.',
    narrowTitle: 'Der Karteneditor ist für Laptops gedacht',
    narrowBody: 'Öffne die Karte auf einem größeren Bildschirm, um sie zu bearbeiten.',
    /** The status bar for the cell under the pointer, e.g. "12, 4". */
    cell: (x: number, y: number) => `${x}, ${y}`,
    /** The status bar's help line. */
    help: 'Ziehen mit rechter Maustaste oder Leertaste verschiebt, Mausrad zoomt.',
  },

  /** Terrain, elevation, resizing and the preview (src/editor/terrain, src/editor/preview). */
  editorTerrain: {
    tools: {
      brush: 'Pinsel',
      rect: 'Rechteck',
      fill: 'Füllen',
      elevationBrush: 'Höhenpinsel',
      elevationRect: 'Höhenrechteck',
    },
    /** What the terrain tools paint; "Leer" takes cells out of the map. */
    terrains: {
      floor: 'Boden',
      difficult: 'Schwieriges Gelände',
      water: 'Wasser',
      wall: 'Wand',
      void: 'Leer',
    } satisfies Record<import('../api/types').Terrain, string>,
    terrainChoice: 'Gelände',
    toolHints: {
      brush: 'Ziehen malt jedes Feld unter dem Zeiger.',
      rect: 'Ein Rechteck aufziehen, beim Loslassen wird es gemalt.',
      fill: 'Ein Klick füllt die zusammenhängende Fläche mit gleichem Gelände.',
      elevationBrush: 'Ziehen setzt die Höhe auf jedes Feld unter dem Zeiger.',
      elevationRect: 'Ein Rechteck aufziehen, beim Loslassen bekommt es die Höhe.',
    },
    terrainKeys: 'Tasten 1–5 wählen das Gelände, Alt+Klick übernimmt es von einem Feld.',
    voidHint: '„Leer“ nimmt Felder aus der Karte, ihre Höhe mit.',
    elevation: 'Höhe in Metern',
    /** `max` is already formatted, e.g. "10.000 m". */
    elevationInvalid: (max: string) =>
      `Eine Zahl mit höchstens einer Nachkommastelle wie „1,5“ oder „-3“, unter ${max}.`,
    elevationQuick: 'Schnellwahl',
    elevationKeys:
      'Tasten 1–5 wählen die Schnellwahl, Alt+Klick übernimmt die Höhe eines Feldes. Leere Felder gehören nicht zur Karte und bekommen keine Höhe.',
    resize: {
      title: 'Größe',
      /** The size in cells, e.g. "20 × 15 Felder". */
      cells: (width: number, height: number) => `${width} × ${height} Felder`,
      /** The size in meters; both are already formatted, e.g. "30 m × 22,5 m". */
      meters: (width: string, height: string) => `${width} × ${height}`,
      edges: 'Spalten und Zeilen hinzufügen oder entfernen',
      left: 'Links',
      right: 'Rechts',
      top: 'Oben',
      bottom: 'Unten',
      hint: 'Plus fügt hinzu, Minus nimmt weg. Neue Felder sind leer.',
      after: (width: number, height: number) => `Danach: ${width} × ${height} Felder`,
      notWhole: 'Bitte nur ganze Zahlen eingeben.',
      outOfRange: (max: number) => `Jede Seite braucht 1 bis ${max} Felder.`,
      /** What the resize removes, e.g. "Dabei fallen 2 Objekte und 1 Eingang weg." */
      losses: (features: number, entrances: number) => {
        const parts = [
          features > 0 ? (features === 1 ? '1 Objekt' : `${features} Objekte`) : '',
          entrances > 0
            ? entrances === 1
              ? '1 Ein- oder Ausgang'
              : `${entrances} Ein- und Ausgänge`
            : '',
        ].filter(Boolean)
        return `Dabei ${features + entrances === 1 ? 'fällt' : 'fallen'} ${parts.join(' und ')} weg. Rückgängig holt sie zurück.`
      },
      apply: 'Größe ändern',
    },
    preview: {
      bar: 'Testfigur',
      size: 'Größe',
      hint: 'Klicke auf ein Feld, um die Testfigur mit ihrer linken oberen Ecke dort hinzustellen. Markierte Felder sind erlaubt. Nichts davon wird gespeichert.',
      token: 'Testfigur',
      blocked: 'Dort kann die Testfigur nicht stehen.',
      /** Where the test token stands; `elevation` is already formatted, e.g. "Höhe 1,5 m". */
      placed: (x: number, y: number, elevation: string) =>
        `Die Testfigur steht auf ${x}, ${y} (${elevation}).`,
      sizeDoesNotFit: 'In dieser Größe passt die Testfigur dort nicht hin.',
      remove: 'Testfigur entfernen',
    },
  },

  /** Features, entrances and layout checks (src/editor/features). */
  editorFeatures: {
    tools: {
      select: 'Auswählen',
      feature: 'Objekt',
      entrance: 'Ein- und Ausgang',
    },
    /** Suggested feature kinds; editor/features/kinds.ts says which block movement. */
    kinds: {
      bridge: 'Brücke',
      door: 'Tür',
      stairs: 'Treppe',
      ladder: 'Leiter',
      platform: 'Podest',
      pillar: 'Säule',
      tree: 'Baum',
      rock: 'Felsen',
      crate: 'Kiste',
      barrel: 'Fass',
      table: 'Tisch',
      altar: 'Altar',
      well: 'Brunnen',
      wagon: 'Wagen',
      statue: 'Statue',
    },
    kind: 'Art',
    kindHint: 'Frei wählbar oder aus der Liste. Die Art fließt auch ins Kartenbild ein.',
    kindMissing: 'Gib an, was für ein Objekt es ist.',
    label: 'Beschriftung',
    featureLabelHint: 'Optional, z. B. „Hängebrücke“. Ohne Beschriftung zeigt die Karte die Art.',
    entranceLabelHint: 'Optional, z. B. „Waldweg“.',
    elevation: 'Höhe in Metern',
    elevationHint: 'Eine Nachkommastelle, auch unter null, z. B. 2,5 oder -1.',
    elevationInvalid: 'Bitte eine Höhe in Metern, z. B. 2,5 oder -1, unter 10.000 m.',
    blocksMovement: 'Versperrt den Weg',
    blocksMovementHint:
      'Figuren können nicht darauf stehen (Säule, Baum). Brücke, Tür und Treppe sind begehbar.',
    featureHelp:
      'Ziehe ein Rechteck auf der Karte. Objekte dürfen über Abgrund und Wand liegen, aber nicht über anderen Objekten.',
    entranceKind: 'Art',
    entranceHelp:
      'Ziehe am Kartenrand entlang. Übernommen werden nur Randfelder, auf denen eine Figur stehen kann und die noch zu keinem Ein- oder Ausgang gehören; rot markierte nicht. Ein Klick auf einen vorhandenen wählt ihn aus.',
    selectHelp:
      'Klick auf ein Objekt oder einen Ein- oder Ausgang, um es zu bearbeiten. Ziehen verschiebt ein Objekt. Entf löscht, Esc hebt die Auswahl auf.',
    /** Heading of the selected feature's properties. */
    featureTitle: (name: string) => `Objekt: ${name}`,
    /** Position and size of the selected feature. */
    footprint: 'Lage und Größe in Feldern',
    x: 'Spalte',
    y: 'Zeile',
    w: 'Breite',
    h: 'Länge',
    wholeNumber: 'Bitte eine ganze Zahl.',
    footprintOutside: 'So ragt das Objekt über den Kartenrand.',
    footprintOverlap: 'So läge das Objekt über einem anderen Objekt.',
    cellCount: (count: number) => (count === 1 ? '1 Feld' : `${count} Felder`),
    delete: 'Löschen',

    checks: {
      title: 'Prüfung',
      none: 'Keine Probleme',
      /** Above the list, e.g. "3 Probleme". */
      count: (count: number) => (count === 1 ? '1 Problem' : `${count} Probleme`),
      /** Clicking a problem about a feature or an entrance selects it. */
      selectHint: 'Klick auf ein Problem wählt das Objekt oder den Ein- oder Ausgang aus.',
      map: 'Karte',
      /** A feature in a message, e.g. "Objekt „Hängebrücke“". */
      feature: (name: string) => `Objekt „${name}“`,
      /** A feature without kind or label, by its top-left cell. */
      featureAt: (cell: string) => `Objekt bei Feld ${cell}`,
      /** An entrance in a message, e.g. "Eingang „Waldweg“", or "Ausgang bei Feld 0, 4". */
      entrance: (kind: string, label: string) => `${kind} „${label}“`,
      entranceAt: (kind: string, cell: string) => `${kind} bei Feld ${cell}`,
      cell: (cell: string) => `Feld ${cell}`,
      fields: {
        name: 'der Name',
        scene: 'die Szene',
        vibe: 'die Stimmung',
        lighting: 'das Licht',
        id: 'die Kennung',
        kind: 'die Art',
        label: 'die Beschriftung',
      } satisfies Record<import('../editor/validation').LayoutTextField, string>,
      problems: {
        mapSizeInvalid: () => 'Eine Karte ist 1 bis 40 Felder breit und hoch.',
        layoutVersionUnsupported: () => 'Diese Karte stammt aus einer neueren Version der App.',
        nameMissing: () => 'Die Karte hat keinen Namen.',
        textTooLong: (what: string, field: string, max: number) =>
          `${what}: Hier ist ${field} länger als ${max} Zeichen.`,
        cellOutside: (what: string) => `${what} liegt außerhalb der Karte.`,
        cellDuplicate: (what: string) => `${what} steht doppelt in der Karte.`,
        terrainInvalid: (what: string) => `${what} hat ein unbekanntes Gelände.`,
        elevationInvalid: (what: string) =>
          `${what}: Die Höhe muss zwischen -10.000 m und 10.000 m liegen.`,
        idMissing: (what: string) => `${what} hat keine Kennung.`,
        featureIdDuplicate: (what: string) =>
          `${what} hat dieselbe Kennung wie ein anderes Objekt.`,
        featureKindMissing: (what: string) => `${what}: Es fehlt, was für ein Objekt es ist.`,
        featureSizeInvalid: (what: string) => `${what} ist kleiner als ein Feld.`,
        featureOutside: (what: string) => `${what} ragt über den Rand der Karte.`,
        featureOverlap: (what: string, other: string) => `${what} liegt über ${other}.`,
        entranceIdDuplicate: (what: string) =>
          `${what} hat dieselbe Kennung wie ein anderer Ein- oder Ausgang.`,
        entranceKindInvalid: (what: string) => `${what} hat eine unbekannte Art.`,
        entranceEmpty: (what: string) => `${what} hat keine Felder.`,
        entranceCellOutside: (what: string, cell: string) =>
          `${what}: Feld ${cell} liegt außerhalb der Karte.`,
        entranceCellNotOnEdge: (what: string, cell: string) =>
          `${what}: Feld ${cell} liegt nicht am Kartenrand.`,
        entranceCellNotWalkable: (what: string, cell: string) =>
          `${what}: Auf Feld ${cell} kann keine Figur stehen.`,
        entranceCellDuplicate: (what: string, cell: string) =>
          `${what}: Feld ${cell} steht doppelt darin.`,
        entranceCellShared: (what: string, cell: string, other: string) =>
          `${what}: Feld ${cell} gehört schon zu ${other}.`,
      },
    },
  },

  /** The map list, scene text, offline pages and file export (src/editor/scene, src/maps). */
  maps: {
    /** The map list's heading; `campaign` is the campaign's name. */
    title: (campaign: string) => `Karten – ${campaign}`,
    back: 'Zur Kampagne',
    intro: 'Karten entstehen in diesem Browser und lassen sich auch ohne Verbindung bearbeiten.',
    /** The link on the campaign page. */
    campaignLink: 'Karten',
    campaignLinkHint: 'Karten anlegen und bearbeiten, auch ohne Verbindung.',
    activeTitle: 'Karten',
    empty: 'Noch keine Karten. Lege eine neue an oder importiere eine Kartendatei.',
    archivedTitle: (count: number) => `Archiviert (${count})`,
    archivedHint: 'Archivierte Karten werden nicht zum Auswählen angeboten. Gelöscht wird nichts.',
    /** Size in cells, then meters, e.g. "20 × 15 Felder (30 m × 22,5 m)". */
    size: (width: number, height: number, widthMeters: string, heightMeters: string) =>
      `${width} × ${height} Felder (${widthMeters} × ${heightMeters})`,
    /** `when` is formatted, e.g. "14.10., 18:30". */
    changedAt: (when: string) => `Geändert ${when}`,
    /** A map the server has never seen (stage 5: every map). */
    localOnly: 'Nur auf diesem Gerät',
    localOnlyTitle: 'Diese Karte liegt nur in diesem Browser und ist noch nicht synchronisiert.',
    /** A synced map with local changes (from stage 6 on). */
    notSynced: 'Nicht synchronisiert',
    edit: 'Bearbeiten',
    duplicate: 'Duplizieren',
    archive: 'Archivieren',
    restore: 'Zurückholen',
    /** Accessible names of a row's buttons, which repeat for every map. */
    editMap: (name: string) => `${name} bearbeiten`,
    duplicateMap: (name: string) => `${name} duplizieren`,
    archiveMap: (name: string) => `${name} archivieren`,
    restoreMap: (name: string) => `${name} zurückholen`,
    copyName: (name: string) => `${name} (Kopie)`,
    duplicated: (name: string) => `„${name}“ ist angelegt.`,
    archived: (name: string) => `„${name}“ ist archiviert.`,
    restored: (name: string) => `„${name}“ ist zurück.`,
    actionFailed: 'Das hat auf diesem Gerät nicht geklappt. Versuch es bitte noch einmal.',

    newTitle: 'Neue Karte',
    name: 'Name',
    namePlaceholder: 'z. B. Schluchtübergang',
    nameRequired: 'Bitte gib der Karte einen Namen.',
    width: 'Breite in Feldern',
    height: 'Höhe in Feldern',
    /** Under the size fields: `meters` is formatted, e.g. "30 m × 22,5 m". */
    sizeHint: (meters: string) => `Ein Feld ist 1,5 m breit, die Karte also ${meters} groß.`,
    sizeInvalid: (max: number) => `Breite und Höhe sind ganze Zahlen von 1 bis ${max}.`,
    create: 'Anlegen',

    importTitle: 'Kartendatei importieren',
    importBody:
      'Eine Kartendatei im JSON-Format, etwa eine exportierte Karte. Kreaturen in der Datei werden hier nicht übernommen.',
    importLabel: 'Datei wählen',
    imported: (name: string) => `„${name}“ ist importiert.`,
    file: {
      unreadable: 'Diese Datei lässt sich nicht lesen. Ist es wirklich eine JSON-Datei?',
      notAMap: 'Diese Datei ist keine Kartendatei.',
      noName: 'Die Karte in der Datei hat keinen Namen.',
      nameTooLong: (max: number) => `Der Name der Karte ist länger als ${max} Zeichen.`,
      textTooLong: (field: string, max: number) => `${field} ist länger als ${max} Zeichen.`,
      tooLarge: (max: number) =>
        `Die Karte ist zu groß. Breite und Höhe sind ganze Zahlen von 1 bis ${max}.`,
      newerVersion:
        'Diese Datei stammt aus einer neueren Version der App. Lade die Seite neu und versuch es dann noch einmal.',
      badLayout: (place: string) => `Das Layout der Datei stimmt nicht: ${place}.`,
      cell: (n: number) => `Feld ${n}`,
      feature: (n: number) => `Objekt ${n}`,
      entrance: (n: number) => `Eingang ${n}`,
      layout: 'Felder, Objekte oder Eingänge fehlen',
      fields: { scene: 'Die Szene', vibe: 'Die Stimmung', lighting: 'Das Licht' },
    },

    notDmTitle: 'Nur für die Spielleitung',
    notDmBody: 'Die Karten einer Kampagne sehen und bearbeiten nur Mitglieder der Spielleitung.',
    unknownTitle: 'Diese Kampagne kennt das Gerät nicht',
    unknownBody:
      'Öffne die Liste deiner Kampagnen einmal mit Verbindung. Danach lassen sich ihre Karten auch ohne Verbindung bearbeiten.',

    offlineTitle: 'Deine Karten',
    offlineIntro:
      'Kampagnen, in denen du Spielleitung bist, so wie dieses Gerät sie zuletzt mit Verbindung gesehen hat.',
    offlineEmpty:
      'Auf diesem Gerät ist noch keine Kampagne gespeichert, in der du Spielleitung bist. Öffne die Liste deiner Kampagnen einmal mit Verbindung.',
    mapCount: (count: number) => (count === 1 ? '1 Karte' : `${count} Karten`),
    home: 'Zur Startseite',

    /** Links on the server gate's screens. */
    gateOffline: 'Karten ohne Verbindung bearbeiten',
    gateWaking: 'Inzwischen Karten bearbeiten',

    /** The editor's side panel and header (src/editor/scene). */
    scene: {
      panel: 'Karte',
      name: 'Name',
      nameEmpty: (previous: string) =>
        `Eine Karte braucht einen Namen. Gespeichert bleibt „${previous}“.`,
      scene: 'Szene',
      sceneHint: 'Was ist das für ein Ort? z. B. „Hängebrücke über einer nebligen Schlucht“',
      vibe: 'Stimmung',
      vibeHint: 'Wie fühlt es sich an? z. B. „angespannt, windig, grau“',
      lighting: 'Licht',
      lightingHint: 'z. B. „Abenddämmerung“, „Fackelschein“, „bewölkter Morgen“',
      /** Characters left, shown near the limit. */
      left: (count: number) => `Noch ${count} Zeichen`,
      export: 'Exportieren',
      exportTitle: 'Karte als Kartendatei (JSON) herunterladen',
    },
  },

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
    dateInvalid: 'Bitte wähle ein Datum.',
    notADm: 'Diese Person gehört nicht zur Spielleitung der Kampagne.',
    anotherSessionActive: 'In dieser Kampagne läuft schon eine Sitzung. Beende sie zuerst.',
    sessionEnded: 'Diese Sitzung ist schon beendet.',
    textTooLong: 'Ein Text in der Datei ist zu lang.',
    mapSizeInvalid: 'Eine Karte ist 1 bis 40 Felder breit und hoch.',
    layoutVersionUnsupported: 'Diese Kartendatei stammt aus einer neueren Version der App.',
    cellInvalid: 'Ein Feld liegt außerhalb der Karte oder steht doppelt in der Datei.',
    featureInvalid: 'Ein Objekt auf der Karte ist unvollständig oder ragt über den Rand.',
    entranceInvalid: 'Ein Ein- oder Ausgang liegt nicht am Rand der Karte.',
    creatureTypeInvalid: 'Für eine neue Kreaturenart fehlt die Größe, oder ihr Name ist zu lang.',
    placementInvalid:
      'Dort ist kein Platz: Die Figur stünde außerhalb der Karte, auf Wand oder Abgrund oder auf einer anderen Figur.',
    characterInvalid: 'Dieser Charakter gehört nicht zur Kampagne oder ist doppelt dabei.',
    sessionNotActive: 'Diese Sitzung läuft gerade nicht. Starte sie zuerst.',
    encounterNotReady: 'Dieser Kampf kann nicht gestartet werden. Er läuft schon oder ist vorbei.',
    encounterNotActive: 'Dieser Kampf läuft gerade nicht.',
    anotherEncounterActive: 'In dieser Sitzung läuft schon ein Kampf. Beende ihn zuerst.',
    tokenNotFound: 'Diese Figur oder diesen Kampf gibt es hier nicht mehr.',
    notYourToken: 'Diese Figur darfst du nicht bewegen.',
    targetInvalid:
      'Dort kann die Figur nicht stehen: außerhalb der Karte, auf einer Wand oder über einem Abgrund.',
    nothingToUndo:
      'Da gibt es nichts mehr rückgängig zu machen. Vielleicht hat jemand die Figur inzwischen bewegt.',
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
