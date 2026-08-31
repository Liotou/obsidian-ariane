# Vue calendrier & synchronisation Apple Agenda (EventKit) — conception

**Date :** 2026-09-01
**Statut :** validé (échange en session)
**Plateforme :** vue calendrier partout ; synchronisation macOS uniquement.

---

## 1 · Contexte

Ariane gère des tâches (notes du dossier de tâches) avec `début`, `échéance`,
`heure`, `jalon`. Deux surfaces les affichent : la **frise** (Gantt, « quand »)
et l'**articulation** (graphe des liens). Une intégration **Apple Rappels**
existe déjà : `pousserRappels` / `releverRappels`, préambule EventKit partagé
`Ariane._jxaEK()`, exécution via `_osascriptJXA`, instantané par note
(`rappel-id` + `rappel-sync`), liste cible par famille, push à la sauvegarde +
relève sur minuterie.

Il manque :

- une **vue calendrier** dans Obsidian (grille mois / semaine) pour poser les
  tâches sur leurs dates ;
- la possibilité de **bloquer un créneau horaire** pour une tâche depuis
  Obsidian, et de l'ajuster ensuite dans Calendar.app (bidirectionnel) ;
- l'affichage, en fond, de l'**agenda macOS réel** (dont les sessions de
  travail créées par l'app tierce `reminders-calendar-bridge`, qui enrichit un
  événement glissé depuis Rappels d'un cumul de temps ; ces événements portent
  un lien de rappel, pas d'`agenda-id` Ariane, et ne sont donc jamais touchés
  par la synchro décrite ici).

Ce document couvre **la vue de base `ariane-calendrier` et la synchronisation
EventKit des événements** (`EKEntityTypeEvent`, entité `0` — distincte des
rappels, entité `1`).

---

## 2 · Modèle de données

### 2.1 Nouveau concept : `Créneau`

Une tâche se travaille en **plusieurs sessions** : `creneaux` est une **liste**.

`creneaux` entre dans `Ariane.CONCEPTS_TACHE` → clé de frontmatter préfixée
`Tâche - Créneaux`, type **liste**, renommable. Ajouté à `PROPS_GENERIQUES`
(`{ cle: 'creneaux', defaut: 'Créneaux', icone: 'calendar-clock' }`) et au groupe
`planning` de `GROUPES_TACHE`, après `heure`.

```yaml
Tâche - Créneaux:
  - 2026-09-08 14:00-16:00
  - 2026-09-10 09:00-11:00
  - 2026-09-08 22:00 / 2026-09-09 01:30   # passage de minuit explicite
```

Chaque entrée est une plage texte, éditable à la main dans l'éditeur de
propriétés d'Obsidian.

**Helpers purs :**

- `Ariane.parseCreneau(str)` → `{ debut, fin }` (ISO `YYYY-MM-DDTHH:MM`) ou
  `null`. Tolérant : séparateurs `-`, `–`, `—`, ` à `, ` / ` ; heures `H:MM` ou
  `HH:MM` ; fin ≤ début même jour → fin le lendemain.
- `Ariane.formatCreneau(debut, fin)` → chaîne canonique (réécriture après un
  geste). Compacte si même jour, `… / …` sinon.
- `Ariane.creneauxDeTache(fmOuTache)` → `[{ debut, fin, brut }]` triés par
  `debut`, entrées invalides écartées. `brut` = la chaîne d'origine (sert à
  retrouver et réécrire **l'entrée exacte** dans la liste après un geste).

### 2.2 Section `## Créneaux` dans la note + statistiques

Ariane entretient, dans le corps de chaque note de tâche portant au moins un
créneau, un bloc **régénéré** entre marqueurs `ZFA_CRENEAUX_DEBUT` /
`ZFA_CRENEAUX_FIN` (même mécanique que le bloc d'accès `majBlocTache` :
idempotent, pas d'écriture si rien ne change, inséré après le `# Titre` si
absent). Objectif : l'information est **autoportée par la note**, lisible sans
ouvrir les propriétés, et jamais perdue.

`Ariane.blocCreneaux(creneaux, stats)` → markdown :

```markdown
## Créneaux

| Session | Date | Heures | Durée |
|---|---|---|---|
| 1 | lun. 8 sept. | 14:00 – 16:00 | 2 h 00 |
| 2 | mar. 8 sept. | 22:00 – 01:00 | 3 h 00 |
| 3 | jeu. 10 sept. | 09:00 – 11:00 | 2 h 00 |

**3 sessions · 7 h 00 planifiées · 2 h 00 à venir · dernière : jeu. 10 sept.**
```

`Ariane.statsCreneaux(creneaux, maintenantISO)` → `{ nb, totalMin, passeMin,
futurMin, premier, dernier }`. « passé » = fin < maintenant, « à venir » =
début ≥ maintenant. (La durée **réellement travaillée**, distincte de la durée
planifiée, arrivera avec la synchro : un événement redimensionné dans Calendar
renverra sa vraie durée — plan §4. Ici, planifié = travaillé.)

`greffon.majBlocCreneaux(file)`, appelée depuis l'écoute `metadataCache.changed`
des notes de tâche (antirebond, à côté de `majBlocTache`).

### 2.3 Concept : `agenda-id` (liste parallèle)

`agenda-id` entre dans `CONCEPTS_TACHE`. Comme il y a plusieurs créneaux, c'est
une **liste** alignée sur `creneaux` (même longueur, même ordre après tri) :
`agenda-id[i]` = `calendarItemIdentifier` de l'EKEvent du créneau `i`, ou vide.
Écrit par `pousserAgenda` (plan §4). Type liste, non affiché dans l'éditeur de
famille (usage interne).

### 2.4 Clé interne : `agenda-sync`

**Pas** un concept. Instantané du dernier accord note ↔ événements :

```
agenda-sync: "<début>|<échéance>|<heure>|<créneaux canoniques joints par ';'>|<statut>"
```

`greffon._instantAgenda(t)`. Sert à `releverAgenda` : instantané ≠ état actuel
→ **la note a bougé, elle fait foi**.

### 2.5 Règle : quelle tâche → quels événements

`Ariane.evenementsDeTache(t)` → **tableau** d'événements
`{ genre: 'horaire'|'jour', debut, fin, allDay, source: 'creneau'|'dates', idx }` :

| La tâche a… | Événement(s) |
|---|---|
| ≥ 1 `creneau` valide | **un événement horaire par créneau** (`source:'creneau'`, `idx` = position dans la liste triée) |
| aucun créneau, `début` **et** `échéance` | **un** événement jour, `allDay`, du `début` à **échéance + 1 jour** (borne haute exclue par EventKit) |
| aucun créneau, `échéance` seule + `heure` | **un** événement horaire, `échéance` `heure` → +1 h |
| aucun créneau, `échéance` seule sans `heure` | **un** événement jour sur l'échéance |
| jalon + `échéance` | **un** événement jour sur l'échéance |
| aucune date, aucun créneau | `[]` |

Les créneaux **priment** : quand il y en a, l'événement « fenêtre de planning »
(`début→échéance`) n'est **pas** émis — la frise garde cette fenêtre, le
calendrier montre les blocs concrets. `début`/`échéance` ne sont jamais modifiés
par les créneaux.

---

## 3 · Vue de base `ariane-calendrier`

Fabrique `fabriquerVueCalendrierBase(greffon)` → `class extends obsidian.BasesView`,
enregistrée sous `TYPE_VUE_BASE_CALENDRIER` (`'ariane-calendrier'`), icône
`calendar-days`. Même patron que `VueFriseBase` : `onload` instancie un moteur
`MoteurCalendrier(greffon, conteneur, ctx)` ; `ctx` expose `taches()`,
`lire/ecrire`, `colonnes()` (pour le libellé des pastilles), `groupes()`,
`triNatif()`, etc. — repris de `VueFriseBase`.

### 3.1 Réglages de vue (`options: () => [...]`)

| clé | type | rôle |
|---|---|---|
| `calMode` | dropdown `mois` / `semaine` | grille affichée (défaut `mois`) |
| `agendaCalendrier` | text (suggestions = vrais calendriers) | calendrier macOS cible pour la synchro **et** source de l'agenda de fond |
| `agendaFond` | toggle | afficher les vrais événements macOS en fond (défaut `true`) |
| `calHeureDebut` / `calHeureFin` | text `HH:MM` | plage horaire de la vue semaine (défaut `07:00` / `21:00`) |

`DEFAUTS_CALENDRIER` porte ces valeurs, lues via `ctx.lire` comme pour la frise.

### 3.2 Rendu

- **Grille mois** : 6 semaines × 7 jours. Chaque tâche « jour » = une **barre
  horizontale** qui traverse les jours de sa plage (coupée en fin de semaine,
  reprise la semaine suivante). Tâche « horaire » = une pastille avec l'heure.
  Couleur = famille (ou statut, selon `friseBarreCouleur`). Échéance dépassée
  non terminée = liseré rouge (réutilise `Ariane.tachesEnRetard`).
- **Grille semaine** : colonne par jour, axe horaire vertical
  (`calHeureDebut`→`calHeureFin`). Tâches « horaire » positionnées et
  redimensionnables. Tâches « jour » dans un bandeau « journée entière » en haut.
- **Agenda de fond** (`agendaFond` + `agendaCalendrier` renseigné, macOS) :
  `MoteurCalendrier` demande au greffon `evenementsAgenda(calendrier, debut, fin)`
  qui lance `Ariane.genererJXAEvenements(calendrier, debutISO, finISO)` via
  `_osascriptJXA` et renvoie `[{ id, titre, debut, fin, allDay }]`. Rendus en
  gris, `pointer-events: none` **sauf** ceux dont `id` figure dans un
  `agenda-id` de tâche connue (ceux-là ouvrent la note).
  Rafraîchi à l'ouverture de la vue et après chaque `pousserAgenda`.
- Respecte le **filtre / tri / regroupement** natifs de la base comme la frise
  (regroupement → un bandeau de couleur par groupe, ou une pastille de groupe).
- Barre d'outils légère : bascule mois/semaine, « Aujourd'hui », bouton
  « Synchroniser » (si `agendaActif`).

### 3.3 Gestes internes

| Geste | Effet |
|---|---|
| Clic sur une pastille | ouvre la note |
| Glisser une pastille « jour » sur un autre jour | décale `début` **et** `échéance` du même nombre de jours (`Ariane.decalerSousArbre` comme la frise) |
| Glisser un bord d'une barre « jour » (mois) | réécrit `début` ou `échéance` |
| Glisser un bloc « horaire » (semaine) | réécrit **l'entrée** de créneau visée (jour + heures translatés) |
| Redimensionner un bloc « horaire » | réécrit la fin de **cette entrée** |
| Supprimer un bloc (touche Suppr sur un bloc sélectionné) | retire l'entrée de la liste |
| Glisser sur une plage vide (semaine) | ajoute une entrée de créneau à la tâche active |

Chaque bloc « horaire » porte `dataset.brut` = la chaîne d'origine de son entrée.
Écritures via **`greffon.majCreneau(ref, { avant, debut, fin })`** :

- `avant` = la chaîne de l'entrée à remplacer ; vide → **ajout** en fin de liste ;
- `debut`/`fin` nuls → **suppression** de l'entrée `avant` ;
- sinon → remplacement de `avant` par `Ariane.formatCreneau(debut, fin)`, liste
  re-triée, `Tâche - Créneaux` réécrit, puis `majBlocCreneaux(file)`.

Plus `ecrireDatesTaches` pour les gestes sur les barres « jour ». Après écriture :
`_enAttente` (report d'index) comme la frise, puis `dessiner()`.

### 3.4 Glisser-déposer entre vues (frise → calendrier)

L'utilisateur empile lui-même les deux vues via la disposition native
d'Obsidian (scinder un volet : frise au-dessus, calendrier en dessous). Ariane
ne fabrique pas de volet fusionné — mais **rend le glisser-déposer HTML5
possible d'une vue à l'autre** (même fenêtre) :

- **Source (frise)** : chaque barre / ligne devient `draggable="true"` ; au
  `dragstart`, `dataTransfer.setData('text/x-ariane-tache', ref)` (+ un
  `text/plain` avec `[[ref]]` pour les cibles génériques). Le geste de
  redimensionnement / déplacement horizontal existant reste prioritaire :
  le `draggable` ne s'arme que si le `pointerdown` n'a pas touché une poignée.
- **Cible (calendrier)** : `dragover` / `drop` sur la grille. Au `drop` :
  - `getData('text/x-ariane-tache')`, sinon un lien de note (`text/plain`
    `[[…]]` ou un chemin `.md`, ou l'URI `obsidian://open`) résolu en `ref`
    via `greffon.refDeChemin` ;
  - `ref` inconnu comme tâche → ignoré ;
  - **vue semaine** : `Ariane.creneauDepuisDrop({ yRel, hauteurHeure, heureDebut, jourISO })`
    → `{ debut, fin }` (fin = début + 1 h, minutes calées sur 15) →
    `greffon.majCreneau(ref, { avant: '', debut, fin })` (**ajout** d'une entrée) ;
  - **vue mois** : `drop` sur une cellule-jour → `ecrireDatesTaches` pour caler
    `début` **et** `échéance` sur ce jour (reprogrammation, comme la frise) ;
    pas de créneau créé.
- Accepte aussi un **lien de note glissé depuis n'importe où** (explorateur,
  `[[wikilink]]`) : même résolution `text/plain` → `ref`.
- `Ariane.creneauDepuisDrop(opts)` est un **helper pur testable** : position
  du curseur + géométrie de la grille (origine, `pxParJour`, `pxParHeure`,
  `heureDebut`) → `{ debut, fin }` ISO. Aucune dépendance DOM.

---

## 4 · Synchronisation EventKit

### 4.1 Routage : par vue

Le greffon construit une **carte `ref → calendrier`** en scannant les fichiers
`.base` du coffre (`app.vault.getFiles()` filtrés `.base`, `obsidian.parseYaml`),
en y cherchant les vues `type: ariane-calendrier` portant un
`agendaCalendrier`. Pour chaque telle vue, on résout les tâches de sa base
(mêmes filtres) et on les associe à ce calendrier. Conflit (2 vues, 2
calendriers pour une même tâche) → la première rencontrée, avec un `console.warn`.
Cache invalidé sur `metadataCache.on('resolved')` et à l'activation d'une vue
calendrier.

**Ajouter une vue `ariane-calendrier` avec un calendrier cible = activer la
synchro pour cette base.** Aucune vue → rien n'est poussé.

### 4.2 `greffon.pousserAgenda(silencieux)`

1. `if (!Platform.isMacOS || !settings.agendaActif) return 0`.
2. Carte `ref → calendrier`. Pour chaque tâche concernée :
   `evs = Ariane.evenementsDeTache(t)` (tableau). On aligne `evs` sur la liste
   `agenda-id` (par `idx` pour les créneaux, index 0 pour un événement
   « dates »). Un `agenda-id` sans événement correspondant → **suppression** de
   cet EKEvent, entrée retirée de la liste `agenda-id`.
3. Charge : **une entrée par événement** `{ ref, idx, id: agenda-id[idx], titre,
   notes, calendrier, debut, fin, allDay, termine }`. Le titre d'un créneau
   numéroté : `'[T26-001] - Intitulé (session 2)'` ; celui d'un événement
   « dates » : sans suffixe.
4. `Ariane.genererJXAEvenements(...)` **push** : pour chaque entrée, `remById`
   (via `calendarItemWithIdentifier` + `isKindOfClass($.EKEvent)`), sinon
   `$.EKEvent.eventWithEventStore(ST)` ; si le calendrier diffère, on déplace ;
   `title`, `notes`, `startDate`/`endDate` (NSDate via `comps`+`dateFromComponents`),
   `isAllDay`, `calendar` ; `ST.saveEventSpanCommitError(e, 0, true, null)`
   (`0` = `EKSpanThisEvent`) ; suppression via `ST.removeEventSpanCommitError(e, 0, true, null)` ;
   émet `ref \t nouvelId`.
5. Retour → `majTache(ref, {'agenda-id': id})` si nouveau, puis
   `processFrontMatter` pour `agenda-sync = _instantAgenda(t)`
   (garde-fous `marquerEcriture` / `ecritePlugin`).

Statut `terminée` : préfixe `✅ ` sur le titre (comme le pont). Pas de
suppression — l'historique reste visible.

### 4.3 `greffon.releverAgenda(silencieux)`

1. macOS + `agendaActif`.
2. `avecId` = tâches portant un `agenda-id` ; `calendriersSurveilles` = union
   des `agendaCalendrier` des vues.
3. `Ariane.genererJXAReleveAgenda(paires, calendriers, fenetreJours)` :
   - pour chaque `{ref,id}` : `remById(id)` → `ref \t (termine?1:0) \t isoDebut \t isoFin \t allDay` ou `ref \t MANQUANT`.
   - pour chaque calendrier surveillé : `predicateForEventsWithStartDateEndDateCalendars(debut, fin, [cal])`, `eventsMatchingPredicate` (synchrone) ; pour un événement dont l'`id` n'est pas dans `connus` **et** qui n'a pas de lien de rappel `x-apple-...` dans ses notes (pour ne pas ré-avaler une session du pont) → `NOUVEAU \t id \t titre \t (termine?1:0) \t isoDebut \t isoFin \t allDay \t nomCalendrier`.
4. Traitement des retours :
   - `MANQUANT` → l'événement a été supprimé côté macOS : effacer `agenda-id` /
     `agenda-sync` de la note (la tâche reste, sans événement).
   - Ligne `ref`+`idx` connue : si `_instantAgenda(t)` == `agenda-sync` de la
     note (la note n'a pas bougé) **et** l'événement a changé →
     - `termine` passé à 1 → `majTache(ref, {statut:'terminée'})` ;
     - dates changées → événement « dates » (`idx` absent) : réécrire
       `début`/`échéance` ; événement de créneau : réécrire **l'entrée `idx`** de
       `Tâche - Créneaux` (via `majCreneau`), donc la durée réellement passée
       dans Calendar revient dans la note et alimente les stats. Puis rafraîchir
       `agenda-sync` et `majBlocCreneaux`.
     Sinon (la note a bougé) → on **repoussera** au prochain `pousserAgenda`.
   - `NOUVEAU` : titre `[T26-…]` d'une tâche connue → relier (`agenda-id`).
     Sinon `creerTache({ intitule, ... , famille: _familleParCalendrier(nom) })`
     avec `début`/`échéance` (allDay) ou `creneau` (horaire), puis `agenda-id` +
     `agenda-sync`.

### 4.4 Câblage (`onload`), calqué sur Rappels

- `metadataCache.on('changed')` sur une note de tâche → `antirebond('agenda:push', () => pousserAgenda(true), 2500)` si `agendaActif && agendaAuto`.
- `onLayoutReady` (macOS, `agendaActif && agendaAuto`) : `setTimeout(releverAgenda(true), 8000)` + `registerInterval(setInterval(releverAgenda(true), max(2, agendaReleveMin)*60000))`.
- Commandes : `agenda-pousser` (« Tâches : synchroniser vers Apple Agenda »),
  `agenda-relever` (« Tâches : relever l'agenda »).

### 4.5 Accès EventKit

`Ariane._jxaEK()` reçoit un paramètre d'entité (défaut `1` = rappels) ou une
seconde fonction d'accès. On généralise :
`acces()` essaie `requestFullAccessToRemindersWithCompletion` **et**
`requestFullAccessToEventsWithCompletion` selon le besoin — ou plus simple, un
`Ariane._jxaEKEvents()` jumeau qui appelle `requestFullAccessToEventsWithCompletion`
et `calendarsForEntityType(0)`. Retenu : **fonction jumelle `_jxaEKEvents()`**
pour ne pas fragiliser le préambule Rappels éprouvé.

---

## 5 · Réglages — section « Apple Agenda »

Dans `ongletTaches`, après « Apple Rappels ». Calquée dessus :

| Réglage | Défaut |
|---|---|
| Activer (`agendaActif`) | `false` |
| Synchroniser automatiquement (`agendaAuto`) | `true` |
| Intervalle de relève (minutes) (`agendaReleveMin`) | `10` |
| Fenêtre de relève (jours) (`agendaFenetreJours`) | `120` |
| Synchroniser maintenant → Pousser / Relever + recharger la liste des calendriers | — |

`greffon.chargerCalendriersAgenda()` (30 s de garde) alimente un
`<datalist id="zfa-dl-calendriers">` partagé par le réglage de vue et l'éventuel
choix par famille. `_familleParCalendrier(nom)` : réciproque, pour la relève.

---

## 6 · Interactions avec l'existant

- **Rappels** : indépendant. Une tâche peut être à la fois dans Rappels et dans
  l'Agenda ; `rappel-*` et `agenda-*` ne se croisent pas.
- **`reminders-calendar-bridge`** : ses événements portent un lien de rappel
  dans leurs notes et pas d'`agenda-id` ; `releverAgenda` les ignore (test §4.3).
  Un événement poussé par Ariane n'a pas de lien de rappel → le pont ne le
  touche pas non plus. Les deux coexistent.
- **Frise** : `creneaux` n'entre pas dans `disposerGantt` — la frise ignore le
  concept dans son rendu. Seul ajout : ses barres deviennent **source de
  glisser-déposer** (`text/x-ariane-tache`), sans gêner les gestes existants
  (voir §3.4).
- **Bloc d'accès de la tâche** (`majBlocTache`) : inchangé. Le bloc `## Créneaux`
  est un **second** bloc balisé, indépendant, entretenu par `majBlocCreneaux`.
- **`heure`** : conservé ; sert au cas « échéance seule + heure ».
- **Note de travail** : le bloc `## Créneaux` s'insère après le `# Titre` comme
  le bloc d'accès ; il ne touche ni `## Note de travail` ni `## Journal`.

---

## 7 · Tranches de construction

1. **Modèle** — `creneaux` (liste) dans les constantes, `parseCreneau` /
   `formatCreneau` / `creneauxDeTache` / `evenementsDeTache`, `corpsNouvelleTache`,
   `tachesPourGantt.creneaux`, tests purs. Aucune UI.
2. **Section `## Créneaux`** — `statsCreneaux`, `blocCreneaux`, marqueurs,
   `majBlocCreneaux` + écoute `metadataCache.changed`. Tests purs.
3. **Vue mois (lecture)** — `MoteurCalendrier`, grille mois (N pastilles / tâche),
   toolbar, ouverture au clic. Pas d'agenda de fond, pas de gestes.
4. **Vue semaine (lecture)** — axe horaire, bandeau journée entière, un bloc par
   créneau.
5. **Gestes internes** — déplacer / redimensionner / supprimer un bloc →
   `majCreneau({ avant, debut, fin })` ; barres « jour » → `ecrireDatesTaches`.
6. **Glisser-déposer inter-vues** — `Ariane.creneauDepuisDrop` (pur, testé) ;
   frise : barres `draggable` + `dragstart` ; calendrier : `drop` semaine →
   `majCreneau({ avant:'', … })` (ajout), `drop` mois → `ecrireDatesTaches` ;
   résolution d'un lien de note glissé.
7. **Agenda de fond** — `_jxaEKEvents`, `genererJXAEvenements`, rendu grisé.
8. **Push** — `evenementsDeTache` → `genererJXAEvenements`, `agenda-id` (liste) /
   `agenda-sync`, carte `ref → calendrier`, réglages, câblage sauvegarde.
9. **Relève** — `genererJXAReleveAgenda`, réconciliation par `idx`, `NOUVEAU`,
   minuterie ; durée redimensionnée dans Calendar → `majCreneau` → stats.
10. **README** FR + EN.

Tranches 1-6 = **plan « vue calendrier »** (aucun macOS). Tranches 7-9 = **plan
« synchro agenda »** (EventKit). Chaque tranche : `node --check`, `node --test`,
déploiement coffre, commit.

## 8 · Tests

- `parseCreneau` / `formatCreneau` : formats, séparateurs, fin ≤ début, minuit,
  aller-retour.
- `creneauxDeTache` : liste triée, entrées invalides écartées, `brut` conservé.
- `evenementsDeTache` : ≥ 1 créneau → un horaire par entrée avec `idx` ; sans
  créneau, les lignes du tableau §2.5 ; bornes allDay (échéance + 1).
- `statsCreneaux` : `nb`, `totalMin`, `passeMin`/`futurMin` autour de
  `maintenant`, `premier`/`dernier`.
- `blocCreneaux` : markdown attendu, stable (deux appels identiques).
- `creneauDepuisDrop` : position + géométrie → `{ debut, fin }`, calage 15 min,
  jour hors grille rejeté.
- `_instantAgenda` : stabilité, sensibilité à chaque champ (dont la liste de créneaux).
- `genererJXAEvenements` (push + relève) : `vm.Script` valide, présence de
  `EKEvent`, `saveEventSpanCommitError`, `calendarsForEntityType(0)`,
  `predicateForEventsWithStartDateEndDateCalendars`, filtrage lien-de-rappel,
  quoting d'un nom de calendrier avec espaces.
- `_familleParCalendrier`, carte `ref → calendrier` sur des `.base` factices.

## 9 · Différé

- Récurrence (`EKRecurrenceRule`).
- Alarmes / rappels d'événement.
- Multi-calendrier pour une même tâche.
- Fusion visuelle des sessions du pont avec la plage Ariane (aujourd'hui juste
  affichées côte à côte).
