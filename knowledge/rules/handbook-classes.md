---
type: Game Rule
title: Handbook classes and spell lists
description: The 12 classes and 48 subclasses of the 2024 Player's Handbook with German names, its 391 spells, which class lists each spell is on, and the spells subclasses grant from a class level on.
tags: [rules, characters, spells]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-24T08:10:23Z }
---

# What it is

The project owner asked on 2026-11-24 to limit the spells to the 2024 Player's Handbook, to know which classes may use each spell so players can filter, and to pick a character's classes and subclasses from the Handbook instead of typing them ([character](/domain/character.md), [spell](/domain/spell.md)). Only the Handbook's classes count; the Artificer and the classes and spells of other books are left out.

The app automates nothing with it ("show, don't enforce", [overview](/overview.md)): a player may still give a character any spell. The lists only drive filters.

# Where the data lives

- `src/Server/Rules/handbook.json`, embedded in the server. It is the source of truth: corrections go there, by hand.
- On startup, after the migrations, the server copies it into the database when the file changed (`HandbookSync`, a hash in `ReferenceDataVersions`). Spells are matched by English name, so a spell keeps its id and cards.
- Made on 2026-11-24 from dnd2024.wikidot.com: its list of all spells, each spell's page for its source (391 have "Player's Handbook"), and the 48 subclass pages for the spells they grant. Each spell keeps the wiki's page name (`slug`, e.g. `hunter-s-mark`), which spell import reads.

# Classes

| Field | Notes |
|-------|-------|
| `id` | The wiki's slug: `wizard` |
| `nameEn`, `nameDe` | "Wizard", "Magier" |
| `caster` | `full` (spell levels up to 9), `half` (up to 5), `pact` (Warlock), or none |

| Class | Deutsch | Spellcasting | Spells on its list |
|-------|---------|--------------|--------------------|
| Barbarian | Barbar | none | 0 |
| Bard | Barde | full | 140 |
| Cleric | Kleriker | full | 117 |
| Druid | Druide | full | 135 |
| Fighter | Kämpfer | none | 0 |
| Monk | Mönch | none | 0 |
| Paladin | Paladin | half | 51 |
| Ranger | Waldläufer | half | 61 |
| Rogue | Schurke | none | 0 |
| Sorcerer | Zauberer | full | 150 |
| Warlock | Hexenmeister | pact | 91 |
| Wizard | Magier | full | 242 |

The class names in German come from the German SRD 5.2.1 (the official 2024 translation, CC-BY 4.0).

# Subclasses

| Field | Notes |
|-------|-------|
| `id` | The wiki's slug, unique across classes: `evoker`, `circle-of-the-moon` |
| `classId` | Its class |
| `nameEn`, `nameDe` | |
| `spellListClassId` | The class whose list it casts from: `wizard` for the Eldritch Knight and the Arcane Trickster, else none |

The German subclass names are the German Player's Handbook 2024's, as the project owner gave them on 2026-11-24.

| Subclass | Deutsch | Spells it grants, by class level |
|----------|---------|----------------------------------|
| Barbarian: Path of the Berserker | Pfad des Berserkers | none |
| Barbarian: Path of the Wild Heart | Pfad des Wilden Herzens | 3: Beast Sense, Speak with Animals; 10: Commune with Nature |
| Barbarian: Path of the World Tree | Pfad des Weltenbaums | none |
| Barbarian: Path of the Zealot | Pfad des Eiferers | none |
| Bard: College of Dance | Schule des Tanzes | none |
| Bard: College of Glamour | Schule des Zauberbanns | 3: Charm Person, Mirror Image; 6: Command |
| Bard: College of Lore | Schule des Wissens | none |
| Bard: College of Valor | Schule des Wagemuts | none |
| Cleric: Life Domain | Domäne des Lebens | 3: Aid, Bless, Cure Wounds, Lesser Restoration; 5: Mass Healing Word, Revivify; 7: Aura of Life, Death Ward; 9: Greater Restoration, Mass Cure Wounds |
| Cleric: Light Domain | Domäne des Lichts | 3: Burning Hands, Faerie Fire, Scorching Ray, See Invisibility; 5: Daylight, Fireball; 7: Arcane Eye, Wall of Fire; 9: Flame Strike, Scrying |
| Cleric: Trickery Domain | Domäne der List | 3: Charm Person, Disguise Self, Invisibility, Pass without Trace; 5: Hypnotic Pattern, Nondetection; 7: Confusion, Dimension Door; 9: Dominate Person, Modify Memory |
| Cleric: War Domain | Domäne des Krieges | 3: Guiding Bolt, Magic Weapon, Shield of Faith, Spiritual Weapon; 5: Crusader's Mantle, Spirit Guardians; 7: Fire Shield, Freedom of Movement; 9: Hold Monster, Steel Wind Strike |
| Druid: Circle of the Land | Zirkel des Landes | 3: Blur, Burning Hands, Fire Bolt, Fog Cloud, Hold Person, Ray of Frost, Misty Step, Shocking Grasp, Sleep, Acid Splash, Ray of Sickness, Web; 5: Fireball, Sleet Storm, Lightning Bolt, Stinking Cloud; 7: Blight, Ice Storm, Freedom of Movement, Polymorph; 9: Wall of Stone, Cone of Cold, Tree Stride, Insect Plague |
| Druid: Circle of the Moon | Zirkel des Mondes | 3: Cure Wounds, Moonbeam, Starry Wisp; 5: Conjure Animals; 7: Fount of Moonlight; 9: Mass Cure Wounds |
| Druid: Circle of the Sea | Zirkel des Meeres | 3: Fog Cloud, Gust of Wind, Ray of Frost, Thunderwave; 5: Lightning Bolt, Water Breathing; 7: Control Water, Ice Storm; 9: Conjure Elemental, Hold Monster |
| Druid: Circle of the Stars | Zirkel der Sterne | 3: Guidance, Guiding Bolt |
| Fighter: Battle Master | Kampfmeister | none |
| Fighter: Champion | Champion | none |
| Fighter: Eldritch Knight | Mystischer Ritter | casts from the Wizard list |
| Fighter: Psi Warrior | Psi-Krieger | 18: Telekinesis |
| Monk: Warrior of Mercy | Krieger der Gnade | none |
| Monk: Warrior of Shadow | Krieger der Schatten | 3: Darkness, Minor Illusion |
| Monk: Warrior of the Elements | Krieger der Elemente | 3: Elementalism |
| Monk: Warrior of the Open Hand | Krieger der Offenen Hand | none |
| Paladin: Oath of Devotion | Schwur der Hingabe | 3: Protection from Evil and Good, Shield of Faith; 5: Aid, Zone of Truth; 9: Beacon of Hope, Dispel Magic; 13: Freedom of Movement, Guardian of Faith; 17: Commune, Flame Strike |
| Paladin: Oath of Glory | Schwur des Ruhmes | 3: Guiding Bolt, Heroism; 5: Enhance Ability, Magic Weapon; 9: Haste, Protection from Energy; 13: Compulsion, Freedom of Movement; 17: Legend Lore, Yolande's Regal Presence |
| Paladin: Oath of the Ancients | Schwur der Alten | 3: Ensnaring Strike, Speak with Animals; 5: Misty Step, Moonbeam; 9: Plant Growth, Protection from Energy; 13: Ice Storm, Stoneskin; 17: Commune with Nature, Tree Stride |
| Paladin: Oath of Vengeance | Schwur der Rache | 3: Bane, Hunter's Mark; 5: Hold Person, Misty Step; 9: Haste, Protection from Energy; 13: Banishment, Dimension Door; 17: Hold Monster, Scrying |
| Ranger: Beast Master | Herr der Tiere | none |
| Ranger: Fey Wanderer | Feenwanderer | 3: Charm Person; 5: Misty Step; 9: Summon Fey; 13: Dimension Door; 17: Mislead |
| Ranger: Gloom Stalker | Düsterpirscher | 3: Disguise Self; 5: Rope Trick; 9: Fear; 13: Greater Invisibility; 17: Seeming |
| Ranger: Hunter | Jäger | none |
| Rogue: Arcane Trickster | Arkaner Betrüger | casts from the Wizard list; 3: Mage Hand |
| Rogue: Assassin | Assassine | none |
| Rogue: Soulknife | Seelenmesser | none |
| Rogue: Thief | Dieb | none |
| Sorcerer: Aberrant Sorcery | Aberrante Zauberei | 3: Arms of Hadar, Calm Emotions, Detect Thoughts, Dissonant Whispers, Mind Sliver; 5: Hunger of Hadar, Sending; 7: Evard's Black Tentacles, Summon Aberration; 9: Rary's Telepathic Bond, Telekinesis |
| Sorcerer: Clockwork Sorcery | Uhrwerk-Zauberei | 3: Aid, Alarm, Lesser Restoration, Protection from Evil and Good; 5: Dispel Magic, Protection from Energy; 7: Freedom of Movement, Summon Construct; 9: Greater Restoration, Wall of Force |
| Sorcerer: Draconic Sorcery | Drakonische Zauberei | 3: Alter Self, Chromatic Orb, Command, Dragon's Breath; 5: Fear, Fly; 7: Arcane Eye, Charm Monster; 9: Legend Lore, Summon Dragon |
| Sorcerer: Wild Magic Sorcery | Wilde-Magie-Zauberei | none |
| Warlock: Archfey Patron | Erzfee-Schutzherr | 3: Calm Emotions, Faerie Fire, Misty Step, Phantasmal Force, Sleep; 5: Blink, Plant Growth; 7: Dominate Beast, Greater Invisibility; 9: Dominate Person, Seeming |
| Warlock: Celestial Patron | Celestischer Schutzherr | 3: Aid, Cure Wounds, Guiding Bolt, Lesser Restoration, Light, Sacred Flame; 5: Daylight, Revivify; 7: Guardian of Faith, Wall of Fire; 9: Greater Restoration, Summon Celestial |
| Warlock: Fiend Patron | Unhold-Schutzherr | 3: Burning Hands, Command, Scorching Ray, Suggestion; 5: Fireball, Stinking Cloud; 7: Fire Shield, Wall of Fire; 9: Geas, Insect Plague |
| Warlock: Great Old One Patron | Großer-Alter-Schutzherr | 3: Detect Thoughts, Dissonant Whispers, Phantasmal Force, Tasha's Hideous Laughter; 5: Clairvoyance, Hunger of Hadar; 7: Confusion, Summon Aberration; 9: Modify Memory, Telekinesis; 10: Hex |
| Wizard: Abjurer | Bannmagier | 10: Counterspell, Dispel Magic |
| Wizard: Diviner | Seher | 10: See Invisibility |
| Wizard: Evoker | Hervorrufer | none |
| Wizard: Illusionist | Illusionist | 3: Minor Illusion; 6: Summon Beast, Summon Fey |

Granted spells are the ones a subclass's table or feature says a character "always has prepared", "knows" or "can cast", from the class level of that table row or feature. Circle of the Land lists all four lands, since the druid picks one at each long rest. The Wild Heart's spells are rituals only. Features that only change how a spell works (the Hunter's Hunter's Mark, the Devotion's Divine Smite) don't count.

# German spell names

`handbook.json` gives each spell a `nameDe`, the German Player's Handbook 2024's name, as the project owner gave them on 2026-11-24 (390 of the 391). Claude matched them to the English names by hand; every German name is used exactly once. The sync stores it as the spell's `nameDe` ([spell](/domain/spell.md)). The library and the spell page show it for a spell that has no card yet; once a spell has a card, the card's own `name` wins.

Summon Elemental has no `nameDe`: the project owner's note says the German "Elementar beschwören" belongs to Conjure Elemental, which already has it, so Summon Elemental's own name is still missing (or the spell isn't in the German book). Conjure Celestial and Conjure Fey are "Celestisches Wesen beschwören" and "Feenwesen beschwören", Summon Celestial and Summon Fey are "… herbeirufen". Claude's judgement calls: Bane is "Verderben" and Blight "Dürre"; Enthrall is "Fesseln" and Sending "Verständigung"; Mislead is "Ablenkung", Sequester "Verbergen", Mirage Arcane "Arkane Spiegelung", Befuddlement "Wirrnis", Prismatic Spray "Regenbogenspiel" and Weird "Unheimliches Schicksal".

# Spell lists

Each spell has the classes whose list it is on ("Spell lists" on the wiki, without Artificer and species), and the subclasses that grant it with the class level (`SpellListEntry`: `spellId`, `classId`, `subclassId`, `classLevel`). A class list has no level: which spell levels a class level reaches depends on `caster`.

# Filters

A filter by classes (`src/web/src/rules/classes.ts`) lets a spell through when it is on one of the classes' lists, on the list a subclass casts from, or granted by one of the subclasses. Levels aren't checked yet (project owner, 2026-11-24): `caster` and `classLevel` are there for a later filter by what a character of given class levels can cast.

- Library: by class, and then by subclass (the class's list plus what the subclass grants).
- "Zauber hinzufügen" on a character: the character's classes and subclasses by default, switched off with one checkbox.

# Open

- A filter by class level (the groundwork above).
- The German name of Summon Elemental, and a check of the judgement calls above.
