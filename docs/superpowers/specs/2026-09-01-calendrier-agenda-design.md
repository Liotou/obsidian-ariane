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

`creneau` entre dans `Ariane.CONCEPTS_TACHE` → clé de frontmatter préfixée
`Tâche - Créneau`, type **texte**, renommable dans les réglages. Ajouté aussi à
`PROPS_GENERIQUES` (`{ cle: 'creneau', defaut: 'Créneau', icone: 'calendar-clock' }`)
et au groupe `planning` de `GROUPES_TACHE`, après `heure`.

**Format écrit :**

- même jour : `2026-09-08 14:00-16:00`
- passage de minuit : `2026-09-08 22:00 / 2026-09-09 01:30`

**`Ariane.parseCreneau(str)` → `{ debut, fin }` (ISO `YYYY-MM-DDTHH:MM`) ou
`null`.** Tolérant : accepte `-`, `–`, `—`, ` à `, ` / ` comme séparateur ;
heures `H:MM` ou `HH:MM` ; si la fin est avant le début (même jour), on ajoute
un jour à la fin.

**`Ariane.formatCreneau(debut, fin)`** → chaîne canonique (pour réécrire depuis
la vue après un glissé).

### 2.2 Concept : `agenda-id`

`agenda-id` entre dans `CONCEPTS_TACHE` (comme `rappel-id`). Contient le
`calendarItemIdentifier` de l'EKEvent lié. Écrit par `pousserAgenda`.

### 2.3 Clé interne : `agenda-sync`

**Pas** un concept (comme `rappel-sync`, `cree`, `modifie`). Instantané des
champs pertinents au dernier accord note ↔ événement :

```
agenda-sync: "<début>|<échéance>|<heure>|<créneau canonique>|<statut>"
```

`greffon._instantAgenda(t)` le construit. Sert à `releverAgenda` pour trancher :
si l'instantané ≠ l'état actuel de la note, **la note a bougé → elle fait foi**,
on ne répercute pas le changement venu de l'événement.

### 2.4 Règle : quelle tâche → quel événement

`Ariane.evenementDeTache(t)` → `{ genre: 'horaire'|'jour'|null, debut, fin, allDay }`
ou `null` :

| La tâche a… | Événement |
|---|---|
| `creneau` valide | **horaire** : `debut`/`fin` du créneau, `allDay=false` |
| pas de `creneau`, `début` **et** `échéance` | **jour** : `allDay=true`, du `début` (00:00) à la **fin de l'échéance** (échéance + 1 jour, 00:00 — EventKit exclut la borne haute) |
| pas de `creneau`, `échéance` seule, avec `heure` | **horaire** : `échéance` `heure` → +1 h |
| pas de `creneau`, `échéance` seule, sans `heure` | **jour** : `allDay=true`, journée de l'échéance |
| jalon (`jalon`), `échéance` | **jour** : journée de l'échéance |
| aucune date | `null` — pas au calendrier |

`début`/`échéance` ne sont **jamais** modifiés par la présence d'un `creneau` :
la frise continue d'afficher la fenêtre de planning, le calendrier montre le
bloc concret.

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
| Glisser un bloc « horaire » (semaine) | réécrit `creneau` (jour + heures translatés) |
| Redimensionner un bloc « horaire » | réécrit la fin du `creneau` |
| Glisser sur une plage vide (semaine) | propose de créer un `creneau` sur la tâche active, ou une nouvelle tâche |

Écritures via un `greffon.ecrireCreneau(ref, debut, fin)` (efface `creneau` si
`debut`/`fin` nuls) et le `ecrireDatesTaches` existant. Après écriture :
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
  - **vue semaine** : `Ariane.creneauDepuisDrop({ x, y, jourColonne, heureAxe })`
    → `{ debut, fin }` (fin = début + 1 h, minutes calées sur 15) →
    `greffon.ecrireCreneau(ref, debut, fin)` ;
  - **vue mois** : `drop` sur une cellule-jour → `ecrireDatesTaches` pour caler
    `début` **et** `échéance` sur ce jour (reprogrammation, comme la frise) ;
    pas de `creneau`.
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
   `ev = Ariane.evenementDeTache(t)`. `ev == null` **et** pas d'`agenda-id` →
   ignorer. `ev == null` **et** `agenda-id` présent → **supprimer** l'événement
   (la tâche a perdu ses dates), effacer `agenda-id`/`agenda-sync`.
3. Charge par tâche : `{ ref, id: agenda-id, titre: '[T26-001] - Intitulé'
   (gabarit `rappelsFormatTitre` réutilisé), notes: extrait note de travail +
   `obsidian://…`, calendrier, debut, fin, allDay, termine: statut === 'terminée' }`.
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
   - Ligne `ref` connue : si `_instantAgenda(t)` == `agenda-sync` de la note
     (la note n'a pas bougé) **et** l'événement a changé →
     - `termine` passé à 1 → `majTache(ref, {statut:'terminée'})` ;
     - dates changées → si `allDay` : réécrire `début`/`échéance` ; sinon
       réécrire `creneau`. Puis rafraîchir `agenda-sync`.
     Sinon (la note a bougé) → on **repoussera** au prochain `pousserAgenda`,
     rien ici.
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
- **Frise** : `creneau` n'entre pas dans `disposerGantt` — la frise ignore le
  concept dans son rendu. Seul ajout : ses barres deviennent **source de
  glisser-déposer** (`text/x-ariane-tache`), sans gêner les gestes existants
  (voir §3.4).
- **`heure`** : conservé ; sert au cas « échéance seule + heure ».

---

## 7 · Tranches de construction

1. **Modèle** — `creneau` dans les constantes, `parseCreneau` / `formatCreneau`
   / `evenementDeTache`, `corpsNouvelleTache`, tests purs. Aucune UI.
2. **Vue mois (lecture)** — `MoteurCalendrier`, grille mois, rendu des tâches,
   toolbar, ouverture au clic. Pas d'agenda de fond, pas de gestes.
3. **Vue semaine (lecture)** — axe horaire, bandeau journée entière.
4. **Gestes internes** — glisser/redimensionner → `ecrireCreneau` / `ecrireDatesTaches`.
5. **Glisser-déposer inter-vues** — `Ariane.creneauDepuisDrop` (pur, testé) ;
   frise : barres `draggable` + `dragstart` ; calendrier : `drop` → `ecrireCreneau`
   (semaine) ou `ecrireDatesTaches` (mois) ; résolution d'un lien de note glissé.
6. **Agenda de fond** — `_jxaEKEvents`, `genererJXAEvenements`, rendu grisé.
7. **Push** — `evenementDeTache` → `genererJXAEvenements` (push), `agenda-id` /
   `agenda-sync`, carte `ref → calendrier`, réglages, câblage sauvegarde.
8. **Relève** — `genererJXAReleveAgenda`, réconciliation, `NOUVEAU`, minuterie.
9. **README** FR + EN.

Chaque tranche : `node --check`, `node --test`, déploiement coffre, commit.

## 8 · Tests

- `parseCreneau` / `formatCreneau` : formats, séparateurs, fin < début, minuit,
  aller-retour.
- `evenementDeTache` : les six lignes du tableau §2.4, bornes allDay (échéance +1).
- `creneauDepuisDrop` : position + géométrie → `{ debut, fin }`, calage 15 min,
  jour hors grille rejeté.
- `_instantAgenda` : stabilité, sensibilité à chaque champ.
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
