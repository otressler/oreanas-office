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

  /** The stages of knowledge/implementation-plan.md, told for the people at the table. */
  roadmap: {
    title: 'Fahrplan',
    link: 'Fahrplan',
    intro:
      "So wächst Oreana's Office, Stufe für Stufe. Termine gibt es keine: Eine Stufe ist fertig, wenn sie am echten Tisch funktioniert.",
    stage: (number: number) => `Stufe ${number}`,
    done: 'Fertig',
    next: 'Als Nächstes',
    phases: [
      {
        title: 'Spielbarer Tisch',
        goal: 'Eine Karte, die alle am Tisch auf dem eigenen Handy sehen und bespielen.',
        stages: [
          {
            number: 1,
            title: 'Grundgerüst',
            items: [
              'Die App läuft im Browser und lässt sich auf dem Handy installieren.',
              'Zwischen den Spielabenden schläft der Server und wird beim Öffnen geweckt.',
              'Alles auf Deutsch, mit deutschen Zahlen und Datumsangaben.',
            ],
          },
          {
            number: 2,
            title: 'Konten und Kampagnen',
            items: [
              'Anmelden mit eigenem Konto oder mit Google, und lange angemeldet bleiben.',
              'Registrieren über einen Einladungslink.',
              'Kampagnen mit Beitrittscode, Mitgliedern und Spielleitung.',
              'Charaktere und Sitzungen.',
            ],
          },
          {
            number: 3,
            title: 'Das Spielfeld',
            items: [
              'Kampfkarten mit Raster, Gelände, Objekten und Figuren auf jedem Gerät.',
              'Mit zwei Fingern zoomen, verschieben, die ganze Karte zeigen.',
              'Ein Tipp auf ein Feld zeigt Gelände und Höhe in Metern.',
              'Die Spielleitung startet einen Kampf und stellt die Charaktere auf.',
            ],
          },
          {
            number: 4,
            title: 'Der lebendige Tisch',
            items: [
              'Figur antippen, Ziel wählen, bestätigen: Alle sehen den Zug sofort.',
              'Ein Pfeil zeigt den anderen, wohin jemand gerade ziehen will.',
              'Den eigenen letzten Zug rückgängig machen.',
              'Nach dem Entsperren des Handys verbindet sich die App von selbst wieder.',
            ],
          },
        ],
      },
      {
        title: 'Karteneditor',
        goal: 'Die Spielleitung baut ihre Kämpfe selbst, auch ohne Internet.',
        stages: [
          {
            number: 5,
            title: 'Karten bauen, auch offline',
            items: [
              'Karten am Laptop bauen, ganz ohne Verbindung.',
              'Gelände und Höhen malen, Objekte, Ein- und Ausgänge setzen, die Szene beschreiben.',
              'Rückgängig und Wiederholen, Karten an jedem Rand vergrößern oder verkleinern.',
              'Kartenliste: Karten duplizieren, archivieren und zurückholen.',
            ],
          },
          {
            number: 6,
            title: 'Kreaturen, Kampfvorbereitung und Abgleich',
            items: [
              'Kreaturenarten anlegen und auf der Karte platzieren, automatisch nummeriert: Goblin 1, Goblin 2 …',
              'Objektkatalog mit Symbolen und Suche: Brücken, Türen, Säulen, Lagerfeuer und mehr.',
              'Kämpfe offline vorbereiten und als Entwurf oder bereit speichern.',
              'Mit dem Server abgleichen. Bei Konflikten fragt die App, welche Fassung bleibt.',
              'Kämpfe direkt aus dem Editor starten.',
              'Karten aus anderen Kampagnen übernehmen.',
              'Kampagnen auch offline anlegen.',
            ],
          },
        ],
      },
      {
        title: 'KI-Bilder',
        goal: 'Karten und Figuren sehen gut aus.',
        stages: [
          {
            number: 7,
            title: 'Gemalte Hintergründe',
            items: [
              'Ein Bildmodell malt aus der Karte einen Hintergrund, passend zum Raster.',
              'Mehrere Fassungen erzeugen, vergleichen und eine auswählen.',
              'Ohne Bild bleibt die gezeichnete Karte: Der Kampf ist immer spielbar.',
            ],
          },
          {
            number: 8,
            title: 'Figurenbilder und Porträts',
            items: [
              'Jede Kreaturenart bekommt ein gemaltes Symbol, alle im gleichen Stil.',
              'Porträts für Charaktere: erzeugen lassen oder vom Handy hochladen.',
              'Figuren zeigen ihr Bild im farbigen Ring.',
            ],
          },
        ],
      },
      {
        title: 'Extras am Tisch',
        goal: 'Kämpfe laufen flüssiger.',
        stages: [
          {
            number: 9,
            title: 'Messen',
            items: [
              'Ein Lineal zwischen zwei Punkten, in Metern.',
              'Flächen für Zauber: Kegel, Kugel, Linie und Würfel.',
            ],
          },
          {
            number: 10,
            title: 'Spielleitung am Tisch',
            items: [
              'Ping: Lange drücken lässt die Stelle auf allen Bildschirmen aufleuchten.',
              'Verborgene Figuren, die nur die Spielleitung sieht, bis sie sie aufdeckt.',
              'Trefferpunkte und Zustände.',
            ],
          },
        ],
      },
    ],
    later: {
      title: 'Danach',
      intro: 'Gute Ideen, die noch keiner Stufe zugeordnet sind.',
      groups: [
        {
          title: 'Gemeinsamer Tisch',
          items: [
            'Ein Gerät in der Tischmitte zeigt die Karte für alle.',
            'Beitreten per QR-Code.',
            'Sehen, wer gerade dabei ist.',
          ],
        },
        {
          title: 'Mehr auf dem Spielfeld',
          items: [
            'Laufwege und Reichweite beim Ziehen.',
            'Freihand zeichnen, Statusringe an Figuren und auf Feldern.',
            'Teile der Karte nach und nach aufdecken.',
            'Kreaturen mitten im Kampf auftauchen lassen und Figuren vom Feld nehmen.',
          ],
        },
        {
          title: 'Die Sitzung leiten',
          items: [
            'Mehrere Kämpfe pro Sitzung, mit einem Tipp umschalten.',
            'Rückgängig für die Spielleitung.',
          ],
        },
        {
          title: 'Für Spielende',
          items: [
            'Eigene Farbe und eigenes Porträt.',
            'Ein Knopf, der die eigene Figur zeigt.',
            'Kurzes Vibrieren, wenn ein Zug bestätigt ist.',
          ],
        },
        {
          title: 'Kampagnenverwaltung',
          items: [
            'NPCs, Orte und Fraktionen.',
            'Sitzungsnotizen.',
            'Mehr zu den Charakteren als nur ihre Figur.',
          ],
        },
      ],
    },
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
    empty:
      'Noch keine Kämpfe. Lege mit „Neue Begegnung“ einen auf einer deiner Karten an, oder importiere eine Karte.',
    importMap: 'Karte importieren',
    /** "Neue Begegnung": pick a map of the campaign, then the editor opens the new encounter. */
    create: {
      button: 'Neue Begegnung',
      title: 'Neue Begegnung',
      help: 'Wähle die Karte, auf der gekämpft wird. Die Begegnung öffnet sich im Editor: Dort platzierst du Kreaturen, setzt sie auf bereit und startest sie. Der Hintergrund der Karte kommt mit.',
      pick: 'Auswählen',
      noMaps:
        'Diese Kampagne hat auf diesem Gerät noch keine Karten. Lege unter „Karten“ eine an, oder synchronisiere, um die Karten vom Server zu holen.',
      narrow:
        'Begegnungen bereitest du im Karteneditor vor. Öffne die Kampagne dafür auf einem größeren Bildschirm.',
    },
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
    /** The back link's visible text; `back` is its accessible name. */
    backShort: 'Karten',
    toolbar: 'Werkzeuge',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    undoKey: 'Strg+Z',
    redoKey: 'Strg+Umschalt+Z',
    /** Tooltip of a tool button: its name and shortcut key. */
    toolTitle: (label: string, key: string | undefined) =>
      key ? `${label} (${key.toUpperCase()})` : label,
    toolGroups: {
      terrain: 'Gelände',
      elevation: 'Höhe',
      features: 'Objekte',
      entrances: 'Ein- und Ausgänge',
      map: 'Karte',
      creatures: 'Kreaturen',
      encounter: 'Begegnung',
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
      gate: 'Tor',
      trapdoor: 'Falltür',
      ramp: 'Rampe',
      jetty: 'Steg',
      carpet: 'Teppich',
      rubble: 'Geröll',
      bushes: 'Gebüsch',
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
      ruin: 'Mauerrest',
      stalagmite: 'Stalagmit',
      log: 'Baumstamm',
      tent: 'Zelt',
      campfire: 'Lagerfeuer',
      brazier: 'Kohlenbecken',
      fireplace: 'Kamin',
      chest: 'Truhe',
      shelf: 'Regal',
      bed: 'Bett',
      bench: 'Bank',
      counter: 'Theke',
      throne: 'Thron',
      sarcophagus: 'Sarkophag',
      cage: 'Käfig',
    },
    kind: 'Art',
    kindHint: 'Frei wählbar oder aus der Liste. Die Art fließt auch ins Kartenbild ein.',
    /** The feature tool's kind field, filled from the catalog below it. */
    kindHintCatalog:
      'Aus dem Katalog oder frei eingetragen. Die Art fließt auch ins Kartenbild ein.',
    /** The feature tool's catalog of suggested kinds. */
    catalog: {
      title: 'Katalog',
      search: 'Objekt suchen',
      searchPlaceholder: 'Suchen, z. B. Fass',
      groups: {
        passage: 'Wege und Durchgänge',
        nature: 'Natur',
        structure: 'Bauwerke',
        furniture: 'Einrichtung und Lager',
        fire: 'Feuer',
      } satisfies Record<import('../editor/features/kinds').KindGroup, string>,
      passable: 'begehbar',
      blocks: 'blockiert',
      noMatch: (query: string) => `Kein Objekt im Katalog passt zu „${query}“.`,
      useCustom: (query: string) => `„${query}“ als eigene Art verwenden`,
    },
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
      'Ziehe am Kartenrand entlang. Übernommen werden nur Randfelder, auf denen eine Figur stehen kann und die noch zu keinem Ein- oder Ausgang gehören; rot markierte nicht. Ein Klick auf einen vorhandenen wählt ihn aus: Er erscheint dann unten zum Bearbeiten oder Löschen, Entf löscht ihn.',
    /** The entrance tool's section for the selected entrance. */
    selectedEntrance: 'Ausgewählter Ein- oder Ausgang',
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
    /** After an import whose layout breaks rules; the editor's Prüfung lists them. */
    importedWithProblems: (name: string, count: number) =>
      `„${name}“ ist importiert. Die Prüfung im Editor meldet ${count === 1 ? 'ein Problem' : `${count} Probleme`}.`,
    file: {
      /** The download's name when the map's name leaves nothing usable. */
      fallbackName: 'Karte',
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
    /** The "Hintergrund" tool (src/editor/background): generate, follow, compare and pick. */
    background: {
      tool: 'Hintergrund',
      help: 'Ein Bildmodell malt aus dem Layout und der Beschreibung ein Bild der Karte. Das Raster zeichnet die App darüber.',
      offline:
        'Hintergründe brauchen eine Verbindung: zum Erzeugen, für die Versionen und zum Auswählen.',
      notSynced:
        'Diese Karte ist noch nicht auf dem Server. Beim Erzeugen wird sie zuerst synchronisiert.',
      loadFailed: 'Die Hintergründe ließen sich nicht laden.',
      generate: 'Hintergrund erzeugen',
      regenerate: 'Neu erzeugen',
      running: 'Ein Hintergrund wird gerade erzeugt. Du kannst so lange weiterarbeiten.',
      budgetExhausted:
        'Das Bildbudget für diesen Monat ist aufgebraucht. Ab dem nächsten Monat lassen sich wieder Hintergründe erzeugen.',
      unavailable:
        'Auf dem Server ist gerade kein Bildmodell eingerichtet. Hintergründe lassen sich nicht erzeugen.',
      /** The month's spending, e.g. "Diesen Monat: 0,42 $ von 20,00 $". */
      spent: (spent: string, limit: string) => `Diesen Monat: ${spent} von ${limit}`,
      /** The picked background was made for another size. */
      pickedOutdated:
        'Der gewählte Hintergrund passt nicht mehr zur Kartengröße. Für die neue Größe braucht es ein neues Bild; bis dahin zeigt das Brett die einfache Darstellung.',
      syncing: 'Die Karte wird synchronisiert…',
      syncOffline:
        'Ohne Verbindung lässt sich die Karte nicht synchronisieren. Es wurde nichts erzeugt.',
      syncBlocked:
        'Die Karte ließ sich nicht synchronisieren. Kläre zuerst das Problem bei der Synchronisierung (oben „Sync“), dann versuch es noch einmal. Es wurde nichts erzeugt.',
      queued: 'Der Auftrag ist angenommen. Das Bild ist in etwa einer halben Minute fertig.',
      confirm: {
        title: 'Hintergrund erzeugen?',
        sync: 'Die Karte wird zuerst synchronisiert, denn der Server malt nach seiner Kopie.',
        quality:
          'Das Bildmodell malt den Hintergrund in hoher Qualität. Das dauert etwa eine halbe Minute; der Editor bleibt so lange benutzbar.',
        cost: 'Jedes Bild kostet ein paar Cent vom monatlichen Bildbudget.',
        ok: 'Erzeugen',
      },
      /** Refining a finished version with an instruction: a new version from it. */
      refine: {
        button: 'Überarbeiten',
        title: 'Version überarbeiten?',
        instruction: 'Was soll sich ändern?',
        placeholder: 'z. B. Die Brücke soll doppelt so breit sein, mit dickeren Seilen.',
        layoutHint:
          'Das Modell ändert nur, was du hier schreibst, und hält sich an die Karte. Wo Wände, Wasser und Objekte liegen und wie groß sie sind, bestimmt die Karte: Soll die Brücke im Spiel breiter werden, ändere sie im Editor und erzeuge neu.',
        result: 'Es entsteht eine neue Version; die alte bleibt.',
        ok: 'Überarbeiten',
        left: (count: number) => `noch ${count} Zeichen`,
      },
      /** A refinement's note in the gallery, with the DM's instruction. */
      refinedFrom: (instruction: string) => `Überarbeitet: „${instruction}“`,
      versions: 'Versionen',
      empty: 'Für diese Karte gibt es noch keinen Hintergrund.',
      /** The alt text of a version's picture. */
      versionAlt: (time: string) => `Hintergrund vom ${time}`,
      status: {
        queued: 'In der Warteschlange',
        running: 'Wird gemalt…',
        done: 'Fertig',
        failed: 'Fehlgeschlagen',
      },
      rejected:
        'Das Bildmodell hat diese Szene abgelehnt. Versuch es mit anderen Texten unter „Beschreibung“.',
      failed: 'Das hat nicht geklappt. Versuch es noch einmal.',
      outdated: 'Veraltet',
      outdatedHint: 'Für eine andere Kartengröße gemalt; lässt sich nicht mehr auswählen.',
      layoutChanged:
        'Das Layout hat sich seitdem geändert. Das Bild passt zur Größe, zeigt aber vielleicht nicht mehr alles richtig.',
      picked: 'Ausgewählt',
      pick: 'Auswählen',
      pickNone: 'Ohne Hintergrund',
      noneHint: 'Ohne Hintergrund zeigt das Brett die einfache Darstellung des Layouts.',
      enlarge: 'Größer ansehen',
      compare: {
        title: 'Hintergründe vergleichen',
        previous: 'Vorherige',
        next: 'Nächste',
        /** "2 von 5". */
        position: (index: number, count: number) => `${index} von ${count}`,
        grid: 'Mit dem Raster der Karte darüber, so wie das Brett es zeichnet.',
        close: 'Schließen',
      },
    },
    scene: {
      /** The toolbar entry with the scene, vibe and lighting texts. */
      tool: 'Beschreibung',
      help: 'Beschreibe den Ort in eigenen Worten. Aus diesen Texten entsteht später das Hintergrundbild.',
      /** The map's name in the editor header. */
      name: 'Name der Karte',
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
    syncOutdated: 'Diese App-Version ist zu alt zum Synchronisieren. Bitte neu laden.',
    idTaken: 'Diese Kennung ist schon vergeben, in einer anderen Kampagne oder für etwas anderes.',
    itemNotFound: 'Der Server kennt diesen Eintrag nicht (mehr).',
    dependencyRejected: 'Dafür wird ein Eintrag gebraucht, der nicht gespeichert werden konnte.',
    layoutInvalid: 'Die Karte verstößt gegen die Regeln für Kartenlayouts.',
    mapInvalid: 'Diese Karte gehört nicht zur Kampagne dieser Begegnung.',
    creatureTypeNameTaken: 'In dieser Kampagne gibt es schon eine Kreaturenart mit diesem Namen.',
    statusInvalid: 'Vom Gerät aus kann eine Begegnung nur Entwurf oder Bereit sein.',
    tokenInvalid:
      'Eine Kreatur der Begegnung ist fehlerhaft: Der Name fehlt oder ist zu lang, oder die Figur steht doppelt.',
    encounterArchived: 'Diese Begegnung ist archiviert und kann nicht gestartet werden.',
    creaturesMisplaced:
      'Eine Kreatur steht nicht gültig auf der Karte. Korrigiere die Aufstellung, bevor die Begegnung bereit ist oder startet.',
    mapNotInStore: 'Diese Karte wird im Kartenspeicher dieser Kampagne nicht angeboten.',
    imagesUnavailable:
      'Auf dem Server ist kein Bildmodell eingerichtet. Hintergründe können gerade nicht erzeugt werden.',
    imageBudgetExhausted:
      'Das Bildbudget für diesen Monat ist aufgebraucht. Ab dem nächsten Monat geht es wieder.',
    generationRunning: 'Für diese Karte wird schon ein Hintergrund erzeugt.',
    mapChanged:
      'Die Karte hat sich auf dem Server geändert. Synchronisiere und bestätige den Auftrag noch einmal.',
    backgroundNotFound: 'Diesen Hintergrund gibt es für diese Karte nicht.',
    backgroundOutdated: 'Dieser Hintergrund wurde für eine andere Kartengröße erzeugt.',
    instructionInvalid: 'Schreib in höchstens 500 Zeichen, was sich am Bild ändern soll.',
  } satisfies Record<ApiErrorCode, string>,

  /** Sync and the map store (lane: sync client). */
  sync: {
    title: 'Synchronisieren',
    close: 'Schließen',
    /** "<Name> (Kopie)" for the local copy kept next to the server's version. */
    copyName: (name: string) => `${name} (Kopie)`,
    kinds: {
      campaign: 'Kampagne',
      creatureType: 'Kreaturenart',
      battleMap: 'Karte',
      encounter: 'Begegnung',
    },

    /** The status next to the "Sync" button. */
    status: {
      syncing: 'Synchronisiere…',
      allSynced: 'Alles synchronisiert',
      pendingOne: '1 Änderung nicht synchronisiert',
      pending: (count: number) => `${count} Änderungen nicht synchronisiert`,
      offline: 'Offline',
      /** `pending` is the pending text, e.g. "3 Änderungen nicht synchronisiert". */
      offlinePending: (pending: string) => `Offline – ${pending}`,
      attentionOnly: 'Nicht synchronisiert',
      reviewOne: '1 Problem prüfen',
      review: (count: number) => `${count} Probleme prüfen`,
      outdated: 'Bitte neu laden',
      reload: 'Neu laden',
      signedOut: 'Bitte neu anmelden',
      signIn: 'Anmelden',
      failed: 'Synchronisieren hat nicht geklappt.',
      button: 'Sync',
    },

    /** Marks on lists, next to "Nur auf diesem Gerät" and "Nicht synchronisiert". */
    marks: {
      conflict: 'Konflikt',
      conflictTitle:
        'Dieser Eintrag wurde auch auf dem Server geändert. Du entscheidest, welche Version gilt.',
      rejected: 'Abgelehnt',
      rejectedTitle: 'Der Server hat diese Änderungen nicht angenommen.',
      vanished: 'Nicht mehr auf dem Server',
    },

    /** The dialogs for conflicts and rejections. */
    dialog: {
      title: 'Synchronisierung prüfen',
      allDone: 'Alles erledigt.',
      failed: 'Das hat nicht geklappt. Versuch es bitte noch einmal.',
      conflictTitle: (kind: string, name: string) => `Konflikt: ${kind} „${name}“`,
      conflictBody:
        'Dieser Eintrag wurde auf diesem Gerät und auf dem Server geändert. Es wird nichts zusammengeführt: Du entscheidest, welche Version gilt.',
      startedBody:
        'Diese Begegnung wurde auf dem Server schon gestartet oder beendet. Deine Version lässt sich dort nicht mehr speichern.',
      more: (count: number) =>
        count === 1 ? 'Danach wartet noch ein Konflikt.' : `Danach warten noch ${count} Konflikte.`,
      thisDevice: 'Auf diesem Gerät',
      thisDeviceWho: 'diesem Gerät',
      onServer: 'Auf dem Server',
      unknownPerson: 'unbekannt',
      /** `when` is formatted, e.g. "14.10., 18:30". */
      changedBy: (who: string, when: string) => `Zuletzt geändert von ${who}, ${when}`,
      sizeLine: (width: number, height: number) => `${width} × ${height} Felder`,
      sizeOf: (size: string) => `Größe: ${size}`,
      statusLine: (status: string) => `Status: ${status}`,
      creatures: (count: number) => (count === 1 ? '1 Kreatur' : `${count} Kreaturen`),
      archived: 'Archiviert',
      preview: (version: string) => `Vorschau des Layouts: ${version}`,
      keepMine: 'Meine behalten',
      takeServer: 'Server-Version übernehmen',
      keepBoth: 'Beide behalten',
      saveAsDraft: 'Als neuen Entwurf speichern',
      discard: 'Verwerfen',

      problemsTitle: 'Nicht synchronisiert',
      problemsBody:
        'Diese Änderungen sind nur auf diesem Gerät. Behebe das Problem und synchronisiere erneut, nimm die Server-Version oder exportiere die Karte.',
      vanished:
        'Der Server listet diesen Eintrag nicht mehr, zum Beispiel weil du nicht mehr zur Spielleitung der Kampagne gehörst. Deine Änderungen bleiben auf diesem Gerät.',
      layoutProblems: (count: number) =>
        count === 1 ? '(1 Problem im Layout)' : `(${count} Probleme im Layout)`,
      dependsOn: (name: string) => `Hängt ab von „${name}“, das nicht gespeichert werden konnte.`,
      unknownItem: 'einem anderen Eintrag',
      serverMissing: 'Der Server hat diesen Eintrag nicht (mehr).',
      open: 'Öffnen',
      openItem: (name: string) => `${name} öffnen`,
      exportMap: 'Kartendatei exportieren',
      syncAgain: 'Erneut synchronisieren',
      useExisting: 'Vorhandene Art verwenden',
      rename: 'Umbenennen',
      renameTitle: (name: string) => `„${name}“ umbenennen`,
      renameBody:
        'In dieser Kampagne gibt es schon eine Kreaturenart mit diesem Namen. Gib der Art auf diesem Gerät einen anderen Namen.',
      newName: 'Neuer Name',
      nameInvalid: 'Bitte gib einen Namen mit höchstens 40 Zeichen an.',
      renameAndSend: 'Umbenennen und erneut senden',
    },

    /** The warning before signing out. */
    signOut: {
      title: 'Ungesicherte Änderungen',
      body: (count: number) =>
        count === 1
          ? 'Auf diesem Gerät ist noch eine Änderung nicht synchronisiert.'
          : `Auf diesem Gerät sind noch ${count} Änderungen nicht synchronisiert.`,
      issuesBody: 'Außerdem warten Konflikte oder abgelehnte Änderungen auf dich.',
      keptNote:
        'Die Daten bleiben in diesem Browser für dich erhalten, auch wenn du dich abmeldest.',
      syncNow: 'Jetzt synchronisieren',
      anyway: 'Trotzdem abmelden',
    },

    /** Campaigns made offline. */
    localCampaign: {
      newTitle: 'Neue Kampagne',
      name: 'Name der Kampagne',
      hint: 'Auch ohne Verbindung. Sie wird synchronisiert, sobald du online bist.',
      nameRequired: 'Bitte gib der Kampagne einen Namen.',
      create: 'Anlegen',
      localBody:
        'Diese Kampagne gibt es nur auf diesem Gerät. Sie wird zuerst synchronisiert; danach gibt es Beitrittscode, Einladungen, Charaktere und Sitzungen.',
    },

    /** The map store on the map list. */
    store: {
      open: 'Aus dem Kartenspeicher',
      title: 'Kartenspeicher',
      intro: 'Karten aus anderen Kampagnen, die du hier als Kopie hinzufügen kannst.',
      offlineHint: 'Der Kartenspeicher braucht eine Verbindung.',
      localHint: 'Der Kartenspeicher geht erst, wenn die Kampagne synchronisiert ist.',
      empty: 'Im Kartenspeicher gibt es gerade nichts Neues für diese Kampagne.',
      add: 'Hinzufügen',
      addBack: 'Archivierte Kopie zurückholen',
      addBackHint: 'Diese Kampagne hat eine archivierte Kopie der Karte. Sie kommt zurück.',
      addLabel: (name: string) => `${name} hinzufügen`,
      fromCampaign: (name: string) => `Aus der Kampagne „${name}“`,
      added: (name: string) => `„${name}“ ist hinzugefügt.`,
      preview: (name: string) => `Vorschau von ${name}`,
    },
  },

  /** Creature types and the bestiary (lane: bestiary). */
  bestiary: {
    title: 'Bestiarium',
    empty: 'Noch keine Kreaturenarten. Lege die erste an.',
    newType: 'Neue Kreaturenart',
    newTitle: 'Neue Kreaturenart',
    /** The form's title when editing, e.g. "Goblin bearbeiten". */
    editTitle: (name: string) => `${name} bearbeiten`,
    /** Accessible name of a row's edit button, e.g. "Goblin bearbeiten". */
    edit: (name: string) => `${name} bearbeiten`,
    editShort: 'Ändern',
    /** Accessible name of a row's button that picks the type, e.g. "Goblin wählen". */
    pick: (name: string) => `${name} wählen`,
    name: 'Name',
    nameHint: 'Einmalig in der Kampagne, bis zu 40 Zeichen.',
    size: 'Größe',
    /** A size and its footprint, e.g. "Groß (2 × 2 Felder)". */
    sizeOption: (size: string, cells: number) => `${size} (${cells} × ${cells} Felder)`,
    appearance: 'Aussehen',
    appearanceHint: 'Kurze Beschreibung, aus der später das Symbol gemalt wird.',
    notes: 'Notizen der Spielleitung',
    notesHint: 'Nur für die Spielleitung sichtbar.',
    create: 'Anlegen',
    save: 'Speichern',
    cancel: 'Abbrechen',
    archive: 'Archivieren',
    restore: 'Zurückholen',
    /** Accessible name of the button that brings an archived type back, e.g. "Goblin zurückholen". */
    restoreLabel: (name: string) => `${name} zurückholen`,
    /** The collapsed part with archived types, e.g. "Archiviert (2)". */
    archived: (count: number) => `Archiviert (${count})`,
    saveFailed: 'Speichern auf diesem Gerät hat nicht geklappt. Versuch es bitte noch einmal.',
    problems: {
      nameMissing: 'Gib einen Namen an.',
      nameTooLong: 'Der Name darf höchstens 40 Zeichen haben.',
      nameTaken: 'Diese Kampagne hat schon eine Kreaturenart mit diesem Namen.',
      appearanceTooLong: 'Das Aussehen darf höchstens 500 Zeichen haben.',
      notesTooLong: 'Die Notizen dürfen höchstens 2000 Zeichen haben.',
    } satisfies Record<import('../bestiary/creatureTypes').CreatureTypeProblem, string>,
  },

  /** The editor's encounter mode: creatures, placement, ready (lane: bestiary). */
  encounterEditor: {
    title: 'Begegnung',
    tools: {
      place: 'Platzieren',
      select: 'Auswählen',
    },
    // The map mode's list of encounters, opened from the header.
    listTitle: 'Begegnungen',
    /** The header button, e.g. "Begegnungen (2)"; the count leaves out archived ones. */
    menu: (count: number) => (count === 0 ? 'Begegnungen' : `Begegnungen (${count})`),
    menuFlagged: 'Auf einer Begegnung steht eine Kreatur nicht mehr gültig.',
    listEmpty: 'Noch keine Begegnung auf dieser Karte.',
    newEncounter: 'Neue Begegnung',
    archive: 'Archivieren',
    restore: 'Zurückholen',
    /** Accessible names of the list's archive and restore buttons. */
    archiveLabel: (name: string) => `${name} archivieren`,
    restoreLabel: (name: string) => `${name} zurückholen`,
    /** The collapsed part with archived encounters, e.g. "Archiviert (1)". */
    archived: (count: number) => `Archiviert (${count})`,
    misplacedMark: 'Eine Kreatur steht auf dieser Karte nicht mehr gültig.',
    // The header in encounter mode.
    encounterName: 'Name der Begegnung',
    encounterNameInvalid: 'Der Name braucht 1 bis 80 Zeichen.',
    /** The map's name in the header, e.g. "Karte: Klamm". */
    mapOf: (name: string) => `Karte: ${name}`,
    backToMap: 'Zur Karte',
    backToMapShort: 'Karte',
    notFoundTitle: 'Diese Begegnung gibt es hier nicht',
    notFoundBody:
      'Sie liegt nicht auf diesem Gerät, gehört zu einer anderen Karte, oder der Link stimmt nicht.',
    // The placement tool.
    placePickFirst:
      'Wähle eine Kreaturenart oder lege eine neue an. Ein Klick auf ein Feld stellt sie dorthin.',
    /** `name` is the picked type, e.g. "Goblin". */
    placeHelp: (name: string) =>
      `${name}: Ein Klick auf ein Feld stellt eine Kreatur dorthin (oben links ihrer Fläche). Rot heißt: Dort kann sie nicht stehen.`,
    // The select tool.
    selectHelp: 'Klicke eine Kreatur an, um sie zu bearbeiten. Ziehen verschiebt sie.',
    selectKeys: 'Entf entfernt die Kreatur, Esc hebt die Auswahl auf.',
    label: 'Bezeichnung',
    labelInvalid: 'Die Bezeichnung braucht 1 bis 40 Zeichen.',
    type: 'Art',
    size: 'Größe',
    position: 'Feld',
    /** A cell, e.g. "3, 4". */
    cell: (x: number, y: number) => `${x}, ${y}`,
    remove: 'Entfernen',
    // The encounter itself.
    archivedBadge: 'Archiviert',
    ready: 'Bereit',
    readyHint: 'Setze die Begegnung von Hand auf bereit, wenn sie gespielt werden kann.',
    readyArchived: 'Eine archivierte Begegnung kann nicht bereit sein. Hol sie zuerst zurück.',
    /** `labels` lists the creatures, e.g. "Goblin 2, Goblin 3". */
    readyMisplaced: (labels: string) =>
      `Bereit geht erst, wenn alle Kreaturen gültig stehen. Nicht gültig: ${labels}.`,
    readyBroken: (labels: string) =>
      `Die Karte hat sich geändert: ${labels} steht nicht mehr gültig. Die Begegnung bleibt bereit, lässt sich aber erst starten, wenn das behoben ist.`,
    /** `status` is the encounter's, e.g. "Läuft". */
    readOnly: (status: string) =>
      `Diese Begegnung ist ${status.toLowerCase()} und gehört dem Server. Hier lässt sie sich nur ansehen, auf der Karte von damals.`,
    // Starting.
    start: 'Starten',
    startNeedsReady: 'Zum Starten muss die Begegnung bereit sein.',
    startOffline: 'Zum Starten brauchst du eine Verbindung zum Server.',
    startNeedsSession: 'Zum Starten muss eine Sitzung laufen, in der du die Spielleitung bist.',
    startArchived: 'Eine archivierte Begegnung lässt sich nicht starten.',
    startMisplaced: 'Starten geht erst, wenn alle Kreaturen gültig stehen.',
    startBlocked:
      'Erst muss ein Konflikt oder eine abgelehnte Änderung gelöst werden. Schau in den Synchronisierungsstatus.',
  },

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
