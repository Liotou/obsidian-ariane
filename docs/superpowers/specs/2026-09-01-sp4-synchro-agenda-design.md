# SP-4 — Synchronisation Apple Calendar (EventKit) & agenda de fond — conception

**Date :** 2026-09-01
**Statut :** validé en session (sections 1-2 approuvées ; 3-6 délégués)
**Plateforme :** vue calendrier partout ; synchronisation et agenda de fond macOS uniquement.
**Remplace**, pour la partie « événements », les §2.3–§6 de
`docs/superpowers/specs/2026-09-01-calendrier-agenda-design.md` (routage par vue,
import des événements inconnus, table d'événements complète → **abandonnés**).

---

## 0 · Ce qui existe déjà (P0-P5, ne pas reconstruire)

- Concept `creneaux` (liste) dans `CONCEPTS_TACHE` / `GROUPES_TACHE.planning`.
- `Ariane.parseCreneau` / `formatCreneau` / `creneauxDeTache` / `evenementsDeTache`
  / `statsCreneaux` / `blocCreneaux` / `disposerBlocsJour`.
- `greffon.majCreneau(ref, { avant, debut, fin })`, `majBlocCreneaux(file)`,
  bloc `## Créneaux` entre marqueurs.
- Vue `ariane-calendrier` (mois + semaine), rendu des créneaux en blocs horaires.
- Sous-système **Apple Rappels** : `Ariane._jxaEK()` (préambule EventKit entité 1),
  `_osascriptJXA`, `pousserRappels` / `releverRappels`, `rappel-id` / `rappel-sync`,
  `listeRappelsDe(familleId)` / `_listesSurveillees()` / `_familleParListe(nom)`,
  `chargerListesRappels()`, réglages `rappelsActif` / `rappelsAuto` /
  `rappelReleveMin`, câblage `onload` (push antirebondi + relève minutée).

SP-4 ajoute la **moitié « événements »** (entité EventKit `0`), calquée sur Rappels.

---

## 1 · Routage par famille & éligibilité

- Nouveau champ **`f.agendaCalendrier`** dans chaque famille (`settings.famillesTaches`),
  saisi à côté de « Liste Apple Rappels » dans l'onglet Tâches. Réglage global
  **`agendaCalendrierDefaut`**.
- Helper **`greffon.agendaCalendrierDe(familleId)`** : `f.agendaCalendrier` de la
  famille, sinon `agendaCalendrierDefaut`, sinon `''`. Miroir exact de
  `listeRappelsDe`.
- Plusieurs familles → même nom de calendrier = elles le partagent ; noms
  différents = calendriers séparés. Famille sans calendrier ni défaut → **jamais
  synchronisée**.
- **`greffon._agendasSurveilles()`** : union des `agendaCalendrier` de toutes les
  familles + le défaut (miroir de `_listesSurveillees`). Cibles de push, suivis à
  la relève.
- **`greffon._agendasAffiches()`** *(amendement 2026-09-01)* : `_agendasSurveilles()`
  ∪ **`agendaCalendriersAffiches`** (liste de noms, réglage à **cocher** parmi
  tous les calendriers Apple détectés — cf. `_agendasCoches()`). Ces calendriers
  cochés sont **seulement affichés en fond** de la vue calendrier
  (Apple → Obsidian, lecture seule ; clic → Calendar.app) — jamais poussés,
  jamais relevés, jamais liés à une tâche. `evenementsFond` s'appuie dessus.
- **Éligibilité au push** d'une tâche : elle a **≥ 1 créneau valide**
  (`Ariane.creneauxDeTache(t).length > 0`) **ET** `agendaCalendrierDe(t.famille)`
  non vide. Plus toute tâche portant déjà un `agenda-id` non vide (pour permettre
  le nettoyage après désaffectation). Les tâches datées **sans créneau** ne vont
  pas dans Apple Calendar.

---

## 2 · Données écrites dans la note

### 2.1 `agenda-id` — nouveau concept (liste alignée sur `creneaux`)

- Entre dans `Ariane.CONCEPTS_TACHE` (clé de frontmatter renommable via `cleT`,
  préfixable). Nouveau groupe `GROUPES_TACHE` :
  `{ id: 'agenda', nom: 'Agenda', concepts: ['agenda-id'] }`.
- `Ariane.defautsNoyau()` saute ce groupe comme il saute `rappel`
  (`if (g.id === 'rappel' || g.id === 'agenda') continue;`) → pas d'amorçage P0.
- `corpsNouvelleTache` : ligne `agenda-id: []` (comme `bloque-par`).
- Liste **alignée sur `creneaux` trié** : `agenda-id[i]` = **`eventIdentifier`**
  de l'EKEvent du créneau `i`, ou `''`. Écrite par `pousserAgenda`. Non affichée
  dans l'éditeur de propriétés de famille (usage interne).
  *(Amendement 2026-09-01 : `eventIdentifier`, pas `calendarItemIdentifier` —
  ce dernier n'est pas une identité stable pour un EKEvent. Résolution via
  `ST.eventWithIdentifier(id)` avec repli `calendarItemWithIdentifier`. En plus
  de l'exclusion par id, l'agenda de fond écarte tout événement dont le titre
  porte `[<ref connue>]`, pour couvrir un décalage d'identifiant ou les
  événements poussés avant l'amendement.)*

### 2.2 `agenda-sync` — clé interne (pas un concept)

Instantané du dernier accord note ↔ événements. Seuls les créneaux poussent :

```
agenda-sync: "<créneaux canoniques triés joints par ';'>|<statut>"
```

`greffon._instantAgenda(t)` → `Ariane.creneauxDeTache(t).map(c => Ariane.formatCreneau(c.debut, c.fin)).join(';') + '|' + (t.statut || '')`.

À la relève : `_instantAgenda(t)` ≠ `agenda-sync` de la note → la note a bougé,
elle fait foi (on ne touche pas la note, on repoussera au prochain `pousserAgenda`).

### 2.3 Ce qui est poussé, par tâche éligible

- `evs = Ariane.evenementsDeTache(t)` → uniquement les entrées `source:'creneau'`
  (l'éligibilité garantit qu'il y a des créneaux). Aligné sur `agenda-id` par `idx`.
- `agenda-id[i]` sans événement correspondant (créneau retiré de la note) →
  **suppression** de l'EKEvent + retrait de l'entrée de la liste `agenda-id`.
- **Titre** : `Ariane.formatModele(settings.agendaFormatTitre || '[{ref}] - {intitule}', …)`,
  suffixe ` (session N)` (N = `idx+1`) si la tâche a plus d'un créneau ; préfixe
  `✅ ` si `statut === 'terminée'`. Événement **jamais supprimé** pour cause de
  complétion (historique visible).
- **Notes** : extrait de la note (500 car.). Le lien `obsidian://open?vault=…&file=…`
  va dans le champ **URL** de l'EKEvent (`e.url = NSURL.URLWithString(…)`), pas
  dans les notes. *(Amendement 2026-09-01.)*
- **Horaires** : `comps(debut)` → `comps(fin)`, `isAllDay = false`.
- **Calendrier cible** : `agendaCalendrierDe(t.famille)`. EKEvent trouvé dans un
  autre calendrier → on le déplace (`ev.calendar = cal`).

---

## 3 · JXA EventKit (approche B : mutualisation minimale)

### 3.1 `Ariane._jxaEKCommun()` — utilitaires indépendants de l'entité

`ObjC.import("EventKit")` + `ObjC.import("CoreFoundation")`, `var ST = $.EKEventStore.alloc.init`,
`pompe(ms)`, `norm(x)`, `net(x)`, `titre(c)`, `comps(iso,heure)`, `isoDe(dc)`.
Ce sont les 8 lignes actuellement au début de `_jxaEK()` qui ne dépendent pas de
l'entité.

### 3.2 `Ariane._jxaEK()` — inchangé fonctionnellement (entité 1, Rappels)

`_jxaEKCommun()` + helpers propres : `acces()` (reminders),
`listes()` = `ST.calendarsForEntityType(1)`, `listeParNom` (défaut
`defaultCalendarForNewReminders`), `remById` (`isKindOfClass($.EKReminder)`),
`fetchListe` (predicate rappels). **La chaîne produite doit rester
fonctionnellement identique à aujourd'hui.**

### 3.3 `Ariane._jxaEKEvenements()` — entité 0 (événements)

`_jxaEKCommun()` + helpers propres :

- `acces()` : `ST.requestFullAccessToEventsWithCompletion(cb)`, repli
  `ST.requestAccessToEntityTypeCompletion(0, cb)`, boucle `CFRunLoopRunInMode`.
- `cals()` : `ST.calendarsForEntityType(0)`.
- `calParNom(nom)` : recherche par titre exact puis `norm`, défaut
  `ST.defaultCalendarForNewEvents`.
- `evById(id)` : `ST.calendarItemWithIdentifier(id)` + `isKindOfClass($.EKEvent)`.
- `couleurCal(cal)` : `cal.color` → `"#rrggbb"` depuis les composantes
  (`c.numberOfComponents`, `c.components`) ; `""` si échec.
- `fmtDate(dc)` : `$.NSCalendar.currentCalendar.dateFromComponents(dc)`.

### 3.4 Générateurs

- **`Ariane.genererJXAEvenementsPush(charge)`** — `charge` :
  `[{ ref, idx, id, titre, notes, calendrier, debut, fin, supprimer }]`.
  - `supprimer:true` + `id` → `evById(id)` puis
    `ST.removeEventSpanCommitError(e, 0, true, null)` ; émet `ref \t idx \t SUPPRIME`.
  - sinon : `evById(id)` ou `$.EKEvent.eventWithEventStore(ST)` ; `title`, `notes`,
    `startDate`/`endDate` (`fmtDate(comps(...))`), `isAllDay=false` ; calendrier
    différent → déplacement ; `ST.saveEventSpanCommitError(e, 0, true, null)`
    (`0` = `EKSpanThisEvent`) ; émet `ref \t idx \t nouvelId` (`nouvelId` vide si
    échec).
- **`Ariane.genererJXAEvenementsReleve(paires, fenetreJours)`** — `paires` :
  `[{ ref, idx, id }]` (événements liés seulement — pas d'import d'inconnus).
  Pour chaque : `evById(id)` → `ref \t idx \t isoDebut \t isoFin`
  (`isoDe(...)` avec heures) ou `ref \t idx \t MANQUANT`.
- **`Ariane.genererJXAEvenementsFond(calendriers, debutISO, finISO)`** — affichage.
  `predicateForEventsWithStartDateEndDateCalendars(d0, d1, [cals filtrés par nom])`,
  `eventsMatchingPredicate` (synchrone). Par événement :
  `id \t net(titre) \t isoDebut \t isoFin \t (allDay?1:0) \t couleurCal \t net(nomCalendrier)`.
  Aucun filtrage (tous les événements des calendriers surveillés s'affichent en
  fond).

---

## 4 · Orchestration

### 4.1 `greffon.pousserAgenda(silencieux)`

1. `if (!Platform.isMacOS || !settings.agendaActif) return 0`.
2. Cibles = tâches éligibles (§1) + tâches portant un `agenda-id`. Pour chacune :
   - `crs = Ariane.creneauxDeTache(t)` ; `ids = [].concat(_lireT(fm,'agenda-id')||[])`.
   - Une entrée de `charge` par créneau `i` : `{ ref, idx:i, id:ids[i]||'',
     titre, notes, calendrier: agendaCalendrierDe(t.famille), debut, fin }`.
   - Une entrée `{ ref, idx:i, id:ids[i], supprimer:true }` pour chaque `ids[i]`
     au-delà de `crs.length` (créneau disparu).
3. `sortie = _osascriptJXA(Ariane.genererJXAEvenementsPush(charge))`.
4. Reconstruire la liste `agenda-id` par `ref` depuis la sortie (indexée par `idx`,
   `SUPPRIME` → `''` puis compactage en fin), écrire via `majTache(ref, {'agenda-id': liste})`
   si elle change, puis `processFrontMatter` pour `agenda-sync = _instantAgenda(t)`
   (garde-fous `marquerEcriture`).
5. `sortie == null` → Notice « autorisation d'automatisation ? » (comme Rappels).

### 4.2 `greffon.releverAgenda(silencieux)`

1. macOS + `agendaActif`.
2. `paires` = pour chaque tâche portant un `agenda-id`, une `{ ref, idx, id }` par
   entrée non vide.
3. `sortie = _osascriptJXA(Ariane.genererJXAEvenementsReleve(paires, settings.agendaFenetreJours))`.
4. Par ligne :
   - `MANQUANT` : si `_instantAgenda(t)` == `agenda-sync` (note pas bougée) →
     **retrait du créneau `idx`** via `greffon.majCreneau(ref, { avant: crs[idx].brut,
     debut:'', fin:'' })`, puis rafraîchir `agenda-sync`. Sinon on laisse (repush).
   - horaires changés : si note pas bougée et `(isoDebut,isoFin)` ≠ créneau `idx` →
     `greffon.majCreneau(ref, { avant: crs[idx].brut, debut: isoDebut, fin: isoFin })`
     (la durée réelle revient dans la note et alimente les stats), puis
     `agenda-sync` rafraîchi. `majBlocCreneaux` est déjà déclenché par l'écoute
     `metadataCache.changed`.
5. Pas de branche `NOUVEAU` (décision : événements inconnus jamais importés).

### 4.3 `greffon.evenementsFond(debutISO, finISO)`

`if (!Platform.isMacOS || !settings.agendaActif) return []`. Lance
`Ariane.genererJXAEvenementsFond(_agendasSurveilles(), debutISO, finISO)` via
`_osascriptJXA`, parse en `[{ id, titre, debut, fin, allDay, couleur, calendrier }]`.
Cache mémoire à TTL court (≈ 60 s) clé sur `debut|fin`, invalidé après
`pousserAgenda` et à l'ouverture d'une vue calendrier.

### 4.4 Câblage `onload` (calqué sur Rappels)

- `metadataCache.on('changed')` sur une note de tâche →
  `antirebond('agenda:push', () => pousserAgenda(true), 2500)` si
  `agendaActif && agendaAuto`.
- `onLayoutReady` (macOS, `agendaActif && agendaAuto`) :
  `setTimeout(() => releverAgenda(true), 8000)` +
  `registerInterval(setInterval(() => releverAgenda(true), max(2, agendaReleveMin) * 60000))`.
- Commandes : `agenda-pousser` (« Tâches : synchroniser vers Apple Agenda »),
  `agenda-relever` (« Tâches : relever Apple Agenda »).

---

## 5 · Vue calendrier — agenda de fond & modèle visuel

### 5.1 Carte créneau (`source:'creneau'`) — **perd sa barre gauche**

`.zfa-cal-carte.est-horaire` : retirer `border-left: 3px solid var(--zfa-cal-coul)`
(le repère vertical). Garder le fond teinté, le fin liseré complet et la coche.

### 5.2 Carte événement — `.zfa-cal-evt` (événement Apple réel, fond)

- **Barre verticale gauche** `border-left: 3px solid <couleur du calendrier Apple>`
  (`ev.couleur`, repli `var(--text-muted)`).
- Fond discret (`--background-secondary`), `cursor: pointer`, pas de coche, non
  déplaçable / non redimensionnable.
- Contenu : `HH:MM Titre` sur deux lignes max + ellipse.
- **Clic** → ouvrir dans Calendar.app :
  `window.open('ical://ekevent/' + encodeURIComponent(ev.id) + '?method=show&options=more')`.
  Repli à confirmer à l'implémentation si le schéma ne s'ouvre pas (p. ex.
  `calshow:<secondes unix du jour>`).
- Événement `allDay` → chip `.zfa-cal-evt` dans le bandeau « journée entière ».

### 5.3 Chevauchement événement + créneau → colonne scindée

Dans `dessinerSemaine`, pour chaque jour, construire **une seule liste de blocs**
mêlant créneaux (`horaire.get(j)`) et événements de fond du jour, passée telle
quelle à `Ariane.disposerBlocsJour` → un événement et un créneau au même horaire
partagent la colonne (mécanique de packing déjà en place). Les cartes événement
utilisent le même placement `left/width` que les blocs créneau.

### 5.4 Vue mois

Événements de fond rendus en pastilles `.zfa-cal-evt` (liseré couleur du
calendrier) dans la case du jour, clic → Calendar.app. Pas de glisser.

### 5.5 `reminders-calendar-bridge`

Les événements poussés par Ariane n'ont pas de lien de rappel → le pont ne les
touche pas. Les événements du pont s'affichent comme n'importe quel événement de
fond ; la relève ne les importe pas (aucun import d'inconnus). Coexistence sans
règle spéciale.

---

## 6 · Réglages — section « Apple Agenda »

Dans `ongletTaches`, après « Apple Rappels ». Calquée dessus :

| Réglage | Défaut |
|---|---|
| Activer (`agendaActif`) | `false` |
| Synchroniser automatiquement (`agendaAuto`) | `true` |
| Intervalle de relève (minutes) (`agendaReleveMin`) | `10` |
| Fenêtre de relève (jours) (`agendaFenetreJours`) | `120` |
| Calendrier par défaut (`agendaCalendrierDefaut`) | `''` |
| Format du titre (`agendaFormatTitre`) | `[{ref}] - {intitule}` |
| Boutons : Pousser / Relever / Recharger les calendriers | — |

`greffon.chargerAgendas()` (garde 30 s) alimente un `<datalist id="zfa-dl-agendas">`
partagé par le réglage global et le champ `f.agendaCalendrier` de chaque famille.
`DEFAUTS` porte les nouvelles clés.

---

## 7 · Tranches de construction (exécution inline, lots avec points de contrôle)

1. **Refacto préambule** — `_jxaEKCommun()` ; `_jxaEK()` le concatène, sortie
   fonctionnellement identique. Test : le préambule Rappels contient toujours
   `acces`, `listeParNom`, `remById`, `fetchListe`, `comps`, `isoDe` et reste un
   `vm.Script` valide.
2. **Concept `agenda-id`** — `CONCEPTS_TACHE` + groupe `agenda` + `defautsNoyau`
   saute `agenda` + `corpsNouvelleTache` ligne `agenda-id: []` + `_instantAgenda`.
   Tests : `_instantAgenda` stable et sensible aux créneaux / au statut ;
   `defautsNoyau` n'inclut pas `agenda-id`.
3. **Préambule + générateurs Events** — `_jxaEKEvenements()`,
   `genererJXAEvenementsPush` / `…Releve` / `…Fond`. Tests : `vm.Script` valides ;
   présence de `EKEvent`, `saveEventSpanCommitError`, `removeEventSpanCommitError`,
   `calendarsForEntityType(0)`, `predicateForEventsWithStartDateEndDateCalendars` ;
   `couleurCal` ; quoting d'un nom de calendrier avec espaces ; `SUPPRIME`.
4. **`pousserAgenda`** — `agendaCalendrierDe`, `_agendasSurveilles`, éligibilité,
   construction de `charge`, réécriture `agenda-id` / `agenda-sync`. Test :
   `agendaCalendrierDe` et l'ensemble surveillé sur des familles factices.
5. **`releverAgenda`** — événements liés seulement ; `MANQUANT` → retrait du
   créneau (garde `agenda-sync`) ; horaires → `majCreneau`.
6. **Réglages + câblage** — section « Apple Agenda », champ `f.agendaCalendrier`
   (datalist), `chargerAgendas`, `DEFAUTS`, écoute `changed` antirebondie,
   `onLayoutReady` + minuterie, commandes.
7. **Agenda de fond + visuel** — `evenementsFond` (+ cache), `.zfa-cal-evt` en
   vue semaine et mois, fusion dans `disposerBlocsJour` (colonne scindée), carte
   créneau sans barre gauche, clic → Calendar.app.
8. **README** FR + EN (section « Apple Agenda »).

Chaque tranche : `node --check main.js`, `node --test tests/*.test.js`,
déploiement coffre (`cp main.js styles.css manifest.json …`), commit.

---

## 8 · Différé

- Récurrence (`EKRecurrenceRule`), alarmes d'événement.
- Import des événements ajoutés à la main (création de tâche) — écarté ici.
- Événements « fenêtre de planning » début→échéance (tâches datées sans créneau).
- Multi-calendrier pour une même tâche.
- Traits de lignée sur le calendrier (SP-3).
