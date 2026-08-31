# Vue calendrier `ariane-calendrier` — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la vue de base `ariane-calendrier` (grille mois / semaine), le concept **liste de créneaux** avec sa section `## Créneaux` autoportée par la note et ses statistiques de durée, les gestes internes, et le glisser-déposer depuis la frise — SANS la synchronisation EventKit (plan séparé « synchro agenda »).

**Architecture:** Concept de tâche `creneaux` = **liste** de plages texte (`Tâche - Créneaux`). Helpers purs sur `Ariane` : `parseCreneau`, `formatCreneau`, `creneauxDeTache`, `evenementsDeTache`, `statsCreneaux`, `blocCreneaux`, `grilleMois`, `grilleSemaine`, `creneauDepuisDrop`. Le greffon entretient un bloc balisé `## Créneaux` dans chaque note de tâche (mécanique de `majBlocTache`). Classe moteur `MoteurCalendrier` (patron de `MoteurFrise`), fabrique `fabriquerVueCalendrierBase(greffon)` enregistrée via `registerBasesView('ariane-calendrier', …)`.

**Tech Stack:** `main.js` (un seul fichier, `'use strict'`, pas de build), `styles.css`, tests `node --test tests/*.test.js` avec `tests/obsidian-factice.js`. API Bases : `obsidian.BasesView`, `this.config.get/set`, `this.data.data`.

**Spec:** [docs/superpowers/specs/2026-09-01-calendrier-agenda-design.md](../specs/2026-09-01-calendrier-agenda-design.md) — §2 (modèle + section + stats), §3 (vue), §3.4 (DnD). Tranches 1-6. §4 (synchro EventKit) et §5 (réglages Agenda) : plan séparé — `agenda-id` / `agenda-sync` ne sont **pas** posés ici.

## Global Constraints

- Déploiement : `cp main.js styles.css manifest.json` vers `/Users/equiriconi/Obsidian Vault/.obsidian/plugins/obsidian-ariane/`. Ne jamais toucher `data.json`.
- `main.js` contient des octets NUL → `grep -a`.
- Commits en français, terminés par `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, via `git commit -F <fichier>` (accents mangés par `-m`).
- Ne pas fusionner de branche ni taguer sans demande explicite.
- `creneaux` est un concept renommable : clé via `greffon.cleT('creneaux')`, jamais en dur.
- `type`, `aliases`, `cree`, `modifie`, `rappel-sync` ne sont PAS des concepts. Idem `agenda-sync` (hors périmètre).
- Ne pas toucher `famillesNotes` / `zotflow-*`.
- Chaque tâche finit par : `node --check main.js`, `node --test tests/*.test.js` (263+ verts), déploiement coffre, commit.

---

## File Structure

- **`main.js`** :
  - `PROPS_GENERIQUES` (~4235) / `CONCEPTS_TACHE` (~4254) / `GROUPES_TACHE` (~4264) — ajout `creneaux`.
  - `Ariane` statics (région « frise / gantt ») — `parseCreneau`, `formatCreneau`, `creneauxDeTache`, `evenementsDeTache`, `statsCreneaux`, `blocCreneaux`, `grilleMois`, `grilleSemaine`, `creneauDepuisDrop`, `lundiDeSemaine`, `moisSuivantN`.
  - `corpsNouvelleTache` (~4712) — ligne `creneaux` + section `## Créneaux` vide.
  - Constantes de module (~15623) — `ZFA_CRENEAUX_DEBUT` / `ZFA_CRENEAUX_FIN`, `TYPE_VUE_BASE_CALENDRIER`, `DEFAUTS_CALENDRIER`.
  - greffon — `tachesPourGantt` (+`creneaux`), `majCreneau`, `majBlocCreneaux`, écoute `metadataCache.changed`.
  - `class MoteurCalendrier` + `fabriquerVueCalendrierBase` — après `fabriquerVueFriseBase`.
  - `onload` `registerBasesView` (~3702).
  - `MoteurFrise.dessinerBarres` (~17060) + `dessinerColonneGauche` (~16447) — source DnD.
  - dict `tr`.
- **`styles.css`** — bloc `.zfa-cal-*`.
- **`tests/calendrier.test.js`** — NOUVEAU.
- **`README.md` / `README.fr.md`** — sous-section « Vue calendrier ».

---

## Task 1 : Concept `creneaux` (liste) + parse / format / `creneauxDeTache`

**Files:** Modify `main.js` (constantes, statics, `corpsNouvelleTache`, `tachesPourGantt`). Create `tests/calendrier.test.js`.

**Interfaces produites :**
- `Ariane.parseCreneau(str) -> { debut:'YYYY-MM-DDTHH:MM', fin:'…' } | null`
- `Ariane.formatCreneau(debut, fin) -> string`
- `Ariane.creneauxDeTache(v) -> [{ debut, fin, brut }]` triés, `v` = tableau/chaîne/tâche (`.creneaux`).
- `Ariane.CONCEPTS_TACHE` inclut `'creneaux'` ; `PROPS_GENERIQUES` inclut `{ cle:'creneaux', defaut:'Créneaux', icone:'calendar-clock' }`.
- objet de `greffon.tachesPourGantt()` porte `creneaux: string[]`.

- [ ] **Step 1 — test qui échoue** — créer `tests/calendrier.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('parseCreneau : même jour, séparateur tiret', () => {
  assert.deepEqual(Ariane.parseCreneau('2026-09-08 14:00-16:00'),
    { debut: '2026-09-08T14:00', fin: '2026-09-08T16:00' });
});

test('parseCreneau : tolère –, —, « à », « / » et H:MM', () => {
  const attendu = { debut: '2026-09-08T09:05', fin: '2026-09-08T10:30' };
  for (const s of ['2026-09-08 9:05–10:30', '2026-09-08 9:05 — 10:30',
                   '2026-09-08 9:05 à 10:30', '2026-09-08 09:05 / 10:30']) {
    assert.deepEqual(Ariane.parseCreneau(s), attendu, s);
  }
});

test('parseCreneau : fin ≤ début même jour → fin le lendemain', () => {
  assert.deepEqual(Ariane.parseCreneau('2026-09-08 23:00-01:00'),
    { debut: '2026-09-08T23:00', fin: '2026-09-09T01:00' });
});

test('parseCreneau : passage de minuit explicite', () => {
  assert.deepEqual(Ariane.parseCreneau('2026-09-08 22:00 / 2026-09-09 01:30'),
    { debut: '2026-09-08T22:00', fin: '2026-09-09T01:30' });
});

test('parseCreneau : invalides → null', () => {
  for (const s of ['', 'demain', '2026-09-08', '2026-09-08 14:00', null,
                   '2026-13-01 10:00-11:00', '2026-09-08 25:00-26:00']) {
    assert.equal(Ariane.parseCreneau(s), null, JSON.stringify(s));
  }
});

test('formatCreneau : compact même jour, explicite sinon ; aller-retour', () => {
  assert.equal(Ariane.formatCreneau('2026-09-08T14:00', '2026-09-08T16:00'),
    '2026-09-08 14:00-16:00');
  assert.equal(Ariane.formatCreneau('2026-09-08T22:00', '2026-09-09T01:30'),
    '2026-09-08 22:00 / 2026-09-09 01:30');
  for (const s of ['2026-09-08 14:00-16:00', '2026-09-08 22:00 / 2026-09-09 01:30']) {
    const p = Ariane.parseCreneau(s);
    assert.equal(Ariane.formatCreneau(p.debut, p.fin), s);
  }
});

test('creneauxDeTache : liste triée, invalides écartées, brut conservé', () => {
  const l = Ariane.creneauxDeTache({ creneaux: [
    '2026-09-10 09:00-11:00', 'n’importe quoi', '2026-09-08 14:00-16:00'] });
  assert.deepEqual(l.map((c) => c.debut), ['2026-09-08T14:00', '2026-09-10T09:00']);
  assert.equal(l[0].brut, '2026-09-08 14:00-16:00');
  assert.deepEqual(Ariane.creneauxDeTache({}), []);
  assert.deepEqual(Ariane.creneauxDeTache('2026-09-08 14:00-16:00').map((c) => c.debut),
    ['2026-09-08T14:00']);
});

test('CONCEPTS_TACHE / PROPS_GENERIQUES portent creneaux', () => {
  assert.ok(Ariane.CONCEPTS_TACHE.includes('creneaux'));
  assert.ok(Ariane.PROPS_GENERIQUES.some((p) => p.cle === 'creneaux'));
});
```

- [ ] **Step 2 — lancer, vérifier l'échec** : `node --test tests/calendrier.test.js` → FAIL.

- [ ] **Step 3 — constantes** — dans `PROPS_GENERIQUES` après `sans-echeance` :

```js
      { cle: 'sans-echeance', defaut: 'Sans échéance', icone: 'calendar-off' },
      { cle: 'creneaux', defaut: 'Créneaux', icone: 'calendar-clock' },
```

`CONCEPTS_TACHE` — `'creneaux'` après `'sans-echeance'` :

```js
    return ['famille', 'statut', 'terminee', 'priorite', 'jalon',
            'debut', 'echeance', 'heure', 'sans-echeance', 'creneaux', 'avancement', 'parent',
            'bloque-par', 'termine-le',
            'source', 'livrable', 'fichier', 'liste', 'rappel-id'];
```

`GROUPES_TACHE` groupe `planning` — `'creneaux'` après `'heure'` :

```js
      { id: 'planning', nom: 'Planning', concepts: ['debut', 'echeance', 'heure', 'creneaux', 'jalon', 'termine-le'] },
```

- [ ] **Step 4 — helpers** — dans la région frise, avant `static disposerGantt` :

```js
  // Une plage texte -> { debut, fin } ISO « YYYY-MM-DDTHH:MM », ou null.
  // « 2026-09-08 14:00-16:00 » (même jour) ; « 2026-09-08 22:00 / 2026-09-09 01:30 »
  // (minuit explicite). Séparateurs : - – — / « à ». Heures H:MM ou HH:MM.
  static parseCreneau(str) {
    const s = String(str == null ? '' : str).trim();
    if (!s) return null;
    const jhm = (d, h) => {
      const m = String(h).match(/^(\d{1,2}):(\d{2})$/);
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || !Ariane.jourValide(d)) return null;
      return d + 'T' + String(Number(m[1])).padStart(2, '0') + ':' + m[2];
    };
    let m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*(?:[-–—/]|à)\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/);
    if (m) {
      const a = jhm(m[1], m[2]);
      const b = jhm(m[3], m[4]);
      return (a && b && b > a) ? { debut: a, fin: b } : null;
    }
    m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*(?:[-–—/]|à)\s*(\d{1,2}:\d{2})$/);
    if (!m) return null;
    const a = jhm(m[1], m[2]);
    let b = jhm(m[1], m[3]);
    if (!a || !b) return null;
    if (b <= a) b = jhm(Ariane.decalerJour(m[1], 1), m[3]);
    return b > a ? { debut: a, fin: b } : null;
  }

  static formatCreneau(debut, fin) {
    const d = String(debut || '');
    const f = String(fin || '');
    const [jd, hd] = [d.slice(0, 10), d.slice(11, 16)];
    const [jf, hf] = [f.slice(0, 10), f.slice(11, 16)];
    if (!jd || !hd || !jf || !hf) return '';
    return jd === jf ? jd + ' ' + hd + '-' + hf : jd + ' ' + hd + ' / ' + jf + ' ' + hf;
  }

  // Liste de créneaux d'une valeur (tableau, chaîne, ou tâche avec `.creneaux`).
  // Trié par début, entrées invalides écartées, `brut` = chaîne d'origine.
  static creneauxDeTache(v) {
    let brut = v;
    if (v && !Array.isArray(v) && typeof v === 'object') brut = v.creneaux;
    const arr = Array.isArray(brut) ? brut : (brut ? [brut] : []);
    const out = [];
    for (const s of arr) {
      const p = Ariane.parseCreneau(s);
      if (p) out.push({ debut: p.debut, fin: p.fin, brut: String(s) });
    }
    out.sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));
    return out;
  }
```

- [ ] **Step 5 — `corpsNouvelleTache`** — après la ligne `K('sans-echeance')` :

```js
    l.push(K('creneaux') + ': []');
```

(Pas de section `## Créneaux` à la création : `majBlocCreneaux` l'ajoutera dès qu'un créneau existe.)

- [ ] **Step 6 — `tachesPourGantt` porte `creneaux`** — après `heure:` dans l'objet poussé (~ligne 11977) :

```js
        heure: String(this._lireT(fm, 'heure') || '').trim(),
        creneaux: [].concat(this._lireT(fm, 'creneaux') || []).map(String).filter(Boolean),
```

- [ ] **Step 7 — lancer les tests** → `node --test tests/*.test.js` vert.

- [ ] **Step 8 — commit** : « Tâches : concept Créneaux (liste, parse/format) ».

---

## Task 2 : `evenementsDeTache`

**Files:** Modify `main.js` (static près de `creneauxDeTache`), `tests/calendrier.test.js`.

**Interfaces :**
- Consumes : `parseCreneau`, `creneauxDeTache`, `jourValide`, `decalerJour`.
- Produces : `Ariane.evenementsDeTache(t) -> Array<{ genre:'horaire'|'jour', debut, fin, allDay, source:'creneau'|'dates', idx? }>` (vide si rien).
  - `genre:'jour'` : `debut`/`fin` dates ISO `YYYY-MM-DD`, `allDay:true`, `fin` = **borne exclusive** (échéance + 1).
  - `genre:'horaire'` : datetimes, `allDay:false`. `source:'creneau'` porte `idx` (position dans la liste triée) et `brut`.

- [ ] **Step 1 — test qui échoue** :

```js
const T = (o) => Object.assign(
  { ref: 'T-1', debut: '', echeance: '', heure: '', creneaux: [], jalon: false }, o);

test('evenementsDeTache : un événement par créneau, avec idx/brut', () => {
  const evs = Ariane.evenementsDeTache(T({ debut: '2026-09-01', echeance: '2026-09-30',
    creneaux: ['2026-09-10 09:00-11:00', '2026-09-08 14:00-16:00'] }));
  assert.deepEqual(evs.map((e) => [e.genre, e.debut, e.idx, e.source]), [
    ['horaire', '2026-09-08T14:00', 0, 'creneau'],
    ['horaire', '2026-09-10T09:00', 1, 'creneau'],
  ]);
  assert.equal(evs[0].brut, '2026-09-08 14:00-16:00');
});

test('evenementsDeTache : sans créneau, début+échéance → un jour, borne exclusive', () => {
  assert.deepEqual(Ariane.evenementsDeTache(T({ debut: '2026-09-01', echeance: '2026-09-03' })),
    [{ genre: 'jour', debut: '2026-09-01', fin: '2026-09-04', allDay: true, source: 'dates' }]);
});

test('evenementsDeTache : échéance seule + heure → horaire 1 h', () => {
  assert.deepEqual(Ariane.evenementsDeTache(T({ echeance: '2026-09-03', heure: '09:30' })),
    [{ genre: 'horaire', debut: '2026-09-03T09:30', fin: '2026-09-03T10:30', allDay: false, source: 'dates' }]);
});

test('evenementsDeTache : échéance seule sans heure / jalon → un jour', () => {
  assert.deepEqual(Ariane.evenementsDeTache(T({ echeance: '2026-09-03' })),
    [{ genre: 'jour', debut: '2026-09-03', fin: '2026-09-04', allDay: true, source: 'dates' }]);
  assert.deepEqual(Ariane.evenementsDeTache(T({ echeance: '2026-09-03', jalon: true, heure: '09:00' })),
    [{ genre: 'jour', debut: '2026-09-03', fin: '2026-09-04', allDay: true, source: 'dates' }]);
});

test('evenementsDeTache : rien → []', () => {
  assert.deepEqual(Ariane.evenementsDeTache(T({})), []);
});
```

- [ ] **Step 2 — vérifier l'échec.**

- [ ] **Step 3 — implémentation** — après `creneauxDeTache` :

```js
  // Voir spec §2.5. Rend un TABLEAU d'événements. Les créneaux priment : quand
  // il y en a, la « fenêtre de planning » début→échéance n'est pas émise.
  static evenementsDeTache(t) {
    if (!t) return [];
    const crs = Ariane.creneauxDeTache(t);
    if (crs.length) {
      return crs.map((c, i) => ({
        genre: 'horaire', debut: c.debut, fin: c.fin, allDay: false,
        source: 'creneau', idx: i, brut: c.brut,
      }));
    }
    const deb = Ariane.jourValide(t.debut);
    const ech = Ariane.jourValide(t.echeance);
    if (deb && ech) {
      return [{ genre: 'jour', debut: deb, fin: Ariane.decalerJour(ech, 1),
                allDay: true, source: 'dates' }];
    }
    if (ech) {
      const h = String(t.heure || '').match(/^(\d{1,2}):(\d{2})$/);
      if (h && !t.jalon) {
        const H = Number(h[1]);
        const fh = (H + 1) % 24;
        const jf = H === 23 ? Ariane.decalerJour(ech, 1) : ech;
        return [{ genre: 'horaire', allDay: false, source: 'dates',
          debut: ech + 'T' + String(H).padStart(2, '0') + ':' + h[2],
          fin: jf + 'T' + String(fh).padStart(2, '0') + ':' + h[2] }];
      }
      return [{ genre: 'jour', debut: ech, fin: Ariane.decalerJour(ech, 1),
                allDay: true, source: 'dates' }];
    }
    return [];
  }
```

- [ ] **Step 4 — tests** → vert. **Step 5 — commit** : « Tâches : evenementsDeTache (tâche → événements) ».

---

## Task 3 : Section `## Créneaux` + statistiques

**Files:** Modify `main.js` (statics `statsCreneaux`/`blocCreneaux`, constantes marqueurs, greffon `majCreneau`/`majBlocCreneaux` + écoute), `tests/calendrier.test.js`.

**Interfaces :**
- `Ariane.statsCreneaux(creneaux, maintenantISO) -> { nb, totalMin, passeMin, futurMin, premier, dernier }` (`creneaux` = tableau de chaînes ou de `{debut,fin}`).
- `Ariane.blocCreneaux(creneaux, stats) -> string` (markdown, sans les marqueurs).
- `greffon.majCreneau(ref, { avant, debut, fin })` — édite la liste `Tâche - Créneaux` puis `majBlocCreneaux`.
- `greffon.majBlocCreneaux(file)` — splice le bloc balisé (idempotent).

- [ ] **Step 1 — test qui échoue** :

```js
test('statsCreneaux : compte, total, passé/futur, premier/dernier', () => {
  const s = Ariane.statsCreneaux(
    ['2026-09-08 14:00-16:00', '2026-09-10 09:00-11:00', '2026-09-20 08:00-12:00'],
    '2026-09-12T00:00');
  assert.equal(s.nb, 3);
  assert.equal(s.totalMin, 120 + 120 + 240);
  assert.equal(s.passeMin, 240);          // les deux premiers
  assert.equal(s.futurMin, 240);          // le dernier
  assert.equal(s.premier, '2026-09-08T14:00');
  assert.equal(s.dernier, '2026-09-20T12:00');
});

test('statsCreneaux : liste vide', () => {
  const s = Ariane.statsCreneaux([], '2026-09-12T00:00');
  assert.deepEqual([s.nb, s.totalMin, s.passeMin, s.futurMin], [0, 0, 0, 0]);
});

test('blocCreneaux : markdown stable, contient le résumé', () => {
  const cr = ['2026-09-08 14:00-16:00', '2026-09-10 09:00-11:00'];
  const a = Ariane.blocCreneaux(cr, Ariane.statsCreneaux(cr, '2026-09-01T00:00'));
  const b = Ariane.blocCreneaux(cr, Ariane.statsCreneaux(cr, '2026-09-01T00:00'));
  assert.equal(a, b);
  assert.ok(a.startsWith('## Créneaux'));
  assert.ok(/2 sessions/.test(a));
  assert.ok(/4 h 00/.test(a));            // total planifié
});

test('blocCreneaux : aucune ligne → chaîne vide', () => {
  assert.equal(Ariane.blocCreneaux([], Ariane.statsCreneaux([], '2026-09-01T00:00')), '');
});
```

- [ ] **Step 2 — vérifier l'échec.**

- [ ] **Step 3 — statics** — après `evenementsDeTache` :

```js
  static statsCreneaux(creneaux, maintenantISO) {
    const now = String(maintenantISO || new Date().toISOString());
    const list = Ariane.creneauxDeTache(Array.isArray(creneaux) ? creneaux
      : (creneaux ? [creneaux] : []));
    let total = 0;
    let passe = 0;
    let futur = 0;
    for (const c of list) {
      const min = (Date.parse(c.fin + ':00') - Date.parse(c.debut + ':00')) / 60000;
      total += min;
      if (c.fin < now) passe += min;
      else if (c.debut >= now) futur += min;
      else { passe += (Date.parse(now) - Date.parse(c.debut + ':00')) / 60000;
             futur += (Date.parse(c.fin + ':00') - Date.parse(now)) / 60000; }
    }
    return {
      nb: list.length, totalMin: Math.round(total),
      passeMin: Math.round(passe), futurMin: Math.round(futur),
      premier: list.length ? list[0].debut : '',
      dernier: list.length ? list[list.length - 1].fin : '',
    };
  }

  static _dureeHumaine(min) {
    const h = Math.floor(min / 60);
    return h + ' h ' + String(min % 60).padStart(2, '0');
  }

  static _jourHumain(iso) {
    // « lun. 8 sept. » — sans dépendance à la locale de la machine.
    const JS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const MS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.',
      'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const d = String(iso).slice(0, 10);
    if (!Ariane.jourValide(d)) return d;
    const [a, m, j] = d.split('-').map(Number);
    const dow = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
    return JS[dow] + ' ' + j + ' ' + MS[m - 1];
  }

  static blocCreneaux(creneaux, stats) {
    const list = Ariane.creneauxDeTache(Array.isArray(creneaux) ? creneaux
      : (creneaux ? [creneaux] : []));
    if (!list.length) return '';
    const s = stats || Ariane.statsCreneaux(list, new Date().toISOString());
    const lignes = list.map((c, i) => {
      const min = Math.round((Date.parse(c.fin + ':00') - Date.parse(c.debut + ':00')) / 60000);
      return '| ' + (i + 1) + ' | ' + Ariane._jourHumain(c.debut) + ' | '
        + c.debut.slice(11, 16) + ' – ' + c.fin.slice(11, 16) + ' | '
        + Ariane._dureeHumaine(min) + ' |';
    });
    const resume = '**' + s.nb + ' session' + (s.nb > 1 ? 's' : '')
      + ' · ' + Ariane._dureeHumaine(s.totalMin) + ' planifiées'
      + (s.futurMin ? ' · ' + Ariane._dureeHumaine(s.futurMin) + ' à venir' : '')
      + (s.dernier ? ' · dernière : ' + Ariane._jourHumain(s.dernier) : '') + '**';
    return ['## Créneaux', '',
      '| Session | Date | Heures | Durée |', '|---|---|---|---|',
      ...lignes, '', resume].join('\n');
  }
```

- [ ] **Step 4 — marqueurs de module** — près de `const ZFA_TACHE_DEBUT` (chercher `grep -a "ZFA_TACHE_DEBUT" main.js`) :

```js
const ZFA_CRENEAUX_DEBUT = '<!-- ariane:creneaux -->';
const ZFA_CRENEAUX_FIN = '<!-- /ariane:creneaux -->';
```

- [ ] **Step 5 — greffon `majCreneau`** — à côté de `ecrireDatesTaches` :

```js
  // Édite la liste des créneaux d'une tâche. { avant } = chaîne de l'entrée
  // ciblée (vide = ajout). { debut, fin } nuls = suppression de `avant`.
  async majCreneau(ref, { avant, debut, fin }) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === ref);
    if (!f) return false;
    const cle = this.cleT('creneaux');
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    let liste = [].concat(this._lireT(fm, 'creneaux') || []).map(String).filter(Boolean);
    const nouv = (debut && fin) ? Ariane.formatCreneau(debut, fin) : '';
    if (avant) {
      liste = liste.filter((x) => x.trim() !== String(avant).trim());
      if (nouv) liste.push(nouv);
    } else if (nouv) {
      liste.push(nouv);
    }
    // Dédoublonnage + tri par début.
    liste = Ariane.creneauxDeTache(liste).map((c) => c.brut);
    this.marquerEcriture(f.path);
    await this.app.fileManager.processFrontMatter(f, (x) => {
      if (liste.length) x[cle] = liste; else delete x[cle];
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    await this.majBlocCreneaux(f);
    return true;
  }
```

- [ ] **Step 6 — greffon `majBlocCreneaux`** — sur le modèle exact de `majBlocTache` :

```js
  async majBlocCreneaux(file) {
    if (!this.refDeChemin(file.path)) return false;
    const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
    const liste = [].concat(this._lireT(fm, 'creneaux') || []).map(String).filter(Boolean);
    const stats = Ariane.statsCreneaux(liste, new Date().toISOString());
    const interieur = Ariane.blocCreneaux(liste, stats);
    const bloc = interieur ? ZFA_CRENEAUX_DEBUT + '\n' + interieur + '\n' + ZFA_CRENEAUX_FIN : '';
    const avant = await this.app.vault.read(file);
    let texte = avant;
    const d = texte.indexOf(ZFA_CRENEAUX_DEBUT);
    const f = texte.indexOf(ZFA_CRENEAUX_FIN);
    if (d !== -1 && f > d) {
      texte = texte.slice(0, d) + bloc + texte.slice(f + ZFA_CRENEAUX_FIN.length);
      // Bloc vidé : retirer aussi la ligne blanche résiduelle.
      if (!bloc) texte = texte.replace(/\n{3,}/g, '\n\n');
    } else if (bloc) {
      // Après le bloc d'accès s'il existe, sinon après le # Titre.
      if (texte.indexOf(ZFA_TACHE_FIN) !== -1) {
        texte = texte.replace(ZFA_TACHE_FIN, ZFA_TACHE_FIN + '\n\n' + bloc);
      } else {
        texte = texte.replace(/^(# .*\n)/m, '$1\n' + bloc + '\n');
      }
    }
    if (texte === avant) return false;
    this.marquerEcriture(file.path);
    await this.app.vault.modify(file, texte);
    return true;
  }
```

- [ ] **Step 7 — écoute** — dans `onload`, là où `majBlocTache` est déjà câblé sur `metadataCache.on('changed')` (`grep -a "majBlocTache(fichier)" main.js`), ajouter juste après, dans le même handler ou un handler jumeau :

```js
    this.registerEvent(this.app.metadataCache.on('changed', (fichier) => {
      if (!this.refDeChemin(fichier.path)) return;
      this.antirebond('creneaux:' + fichier.path, () => this.majBlocCreneaux(fichier), 600);
    }));
```

- [ ] **Step 8 — tests** → `node --test tests/*.test.js` vert. Vérif manuelle : dans le coffre, ajouter à la main `Tâche - Créneaux` avec deux plages sur une note de tâche → un bloc `## Créneaux` (tableau + résumé) apparaît sous le bloc d'accès ; retirer les plages → le bloc disparaît.

- [ ] **Step 9 — commit** : « Tâches : section « ## Créneaux » et statistiques de durée ».

---

## Task 4 : Grilles mois / semaine + `creneauDepuisDrop` (purs)

**Files:** Modify `main.js` (statics), `tests/calendrier.test.js`.

**Interfaces :**
- `Ariane.lundiDeSemaine(iso) -> 'YYYY-MM-DD' | null`
- `Ariane.grilleMois(ancreISO) -> { moisDebut, moisFin, semaines: string[6][7] }` (lundi en tête, 42 jours)
- `Ariane.grilleSemaine(ancreISO) -> { lundi, jours: string[7] }`
- `Ariane.moisSuivantN(iso, n) -> 'YYYY-MM-01'`
- `Ariane.creneauDepuisDrop({ yRel, hauteurHeure, heureDebut, jourISO, dureeMin }) -> { debut, fin } | null` (heure calée 15 min, `dureeMin` défaut 60, minuit franchi géré)

- [ ] **Step 1 — test qui échoue** :

```js
test('grilleMois : 6×7, lundi en tête, contient le mois', () => {
  const g = Ariane.grilleMois('2026-09-15');
  assert.equal(g.semaines.length, 6);
  assert.ok(g.semaines.every((s) => s.length === 7));
  assert.equal(g.semaines[0][0], '2026-08-31'); // 1er sept. = mardi
  assert.ok(g.semaines.flat().includes('2026-09-15'));
  assert.equal(g.moisDebut, '2026-09-01');
  assert.equal(g.moisFin, '2026-09-30');
});

test('grilleSemaine : lundi + 7 jours', () => {
  const g = Ariane.grilleSemaine('2026-09-03');
  assert.equal(g.lundi, '2026-08-31');
  assert.equal(g.jours.length, 7);
  assert.equal(g.jours[6], '2026-09-06');
});

test('moisSuivantN : avance / recule sur l’année', () => {
  assert.equal(Ariane.moisSuivantN('2026-11-10', 3), '2027-02-01');
  assert.equal(Ariane.moisSuivantN('2026-02-10', -3), '2025-11-01');
});

test('creneauDepuisDrop : yRel → heure calée 15 min, +1 h', () => {
  assert.deepEqual(Ariane.creneauDepuisDrop({
    yRel: 130, hauteurHeure: 40, heureDebut: 8, jourISO: '2026-09-08' }),
    { debut: '2026-09-08T11:15', fin: '2026-09-08T12:15' });
});

test('creneauDepuisDrop : durée réglable, minuit franchi', () => {
  assert.deepEqual(Ariane.creneauDepuisDrop({
    yRel: 15.5 * 40, hauteurHeure: 40, heureDebut: 8, jourISO: '2026-09-08', dureeMin: 90 }),
    { debut: '2026-09-08T23:30', fin: '2026-09-09T01:00' });
});

test('creneauDepuisDrop : jour invalide → null', () => {
  assert.equal(Ariane.creneauDepuisDrop({ yRel: 40, hauteurHeure: 40, heureDebut: 8, jourISO: 'x' }), null);
});
```

- [ ] **Step 2 — vérifier l'échec.**

- [ ] **Step 3 — implémentation** — après `blocCreneaux` :

```js
  static lundiDeSemaine(iso) {
    const j = Ariane.jourValide(iso);
    if (!j) return null;
    const dow = new Date(j + 'T00:00:00Z').getUTCDay();
    return Ariane.decalerJour(j, -((dow + 6) % 7));
  }

  static grilleMois(ancreISO) {
    const j = Ariane.jourValide(ancreISO) || new Date().toISOString().slice(0, 10);
    const moisDebut = j.slice(0, 8) + '01';
    const [a, m] = moisDebut.split('-').map(Number);
    const moisFin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    let cur = Ariane.lundiDeSemaine(moisDebut);
    const semaines = [];
    for (let s = 0; s < 6; s += 1) {
      const ligne = [];
      for (let d = 0; d < 7; d += 1) { ligne.push(cur); cur = Ariane.decalerJour(cur, 1); }
      semaines.push(ligne);
    }
    return { moisDebut, moisFin, semaines };
  }

  static grilleSemaine(ancreISO) {
    const lundi = Ariane.lundiDeSemaine(ancreISO)
      || Ariane.lundiDeSemaine(new Date().toISOString().slice(0, 10));
    const jours = [];
    for (let d = 0; d < 7; d += 1) jours.push(Ariane.decalerJour(lundi, d));
    return { lundi, jours };
  }

  static moisSuivantN(iso, n) {
    let [a, m] = String(iso).slice(0, 7).split('-').map(Number);
    m += n;
    a += Math.floor((m - 1) / 12);
    m = ((m - 1) % 12 + 12) % 12 + 1;
    return a + '-' + String(m).padStart(2, '0') + '-01';
  }

  static creneauDepuisDrop(opts) {
    const o = opts || {};
    const jour = Ariane.jourValide(o.jourISO);
    if (!jour || !(o.hauteurHeure > 0)) return null;
    const minutes = Math.max(0, (o.yRel / o.hauteurHeure) + (o.heureDebut || 0)) * 60;
    const cale = Math.round(minutes / 15) * 15;
    const duree = o.dureeMin || 60;
    const iso = (base, min) => {
      const dec = Math.floor(min / 1440);
      const r = min - dec * 1440;
      return (dec ? Ariane.decalerJour(base, dec) : base) + 'T'
        + String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0');
    };
    return { debut: iso(jour, cale), fin: iso(jour, cale + duree) };
  }
```

- [ ] **Step 4 — tests** → vert. **Step 5 — commit** : « Calendrier : grilles mois/semaine et creneauDepuisDrop (purs) ».

---

## Task 5 : `MoteurCalendrier` squelette + vue de base enregistrée

**Files:** Modify `main.js` (constantes, classe, fabrique, `onload`), `styles.css`.

**Interfaces :**
- `TYPE_VUE_BASE_CALENDRIER = 'ariane-calendrier'`, `DEFAUTS_CALENDRIER`.
- `class MoteurCalendrier(greffon, racine, ctx)` : `dessiner`, `detruire`, barre d'outils, grille vide.
- `fabriquerVueCalendrierBase(greffon)`.

- [ ] **Step 1 — constantes** — après `TYPE_VUE_BASE_ARTIC` :

```js
const TYPE_VUE_BASE_CALENDRIER = 'ariane-calendrier';
```

Après `DEFAUTS_FRISE = { … }` :

```js
const DEFAUTS_CALENDRIER = {
  calMode: 'mois',
  agendaCalendrier: '',
  agendaFond: true,
  calHeureDebut: '07:00',
  calHeureFin: '21:00',
};
```

- [ ] **Step 2 — `MoteurCalendrier`** — après la fabrique de la frise :

```js
class MoteurCalendrier {
  constructor(greffon, racine, contexte) {
    this.greffon = greffon;
    this.app = greffon.app;
    this.racine = racine;
    this.ctx = contexte;
    this._ancre = new Date().toISOString().slice(0, 10);
    racine.addClass('zfa-cal');
  }

  lire(cle) {
    const v = this.ctx.lire ? this.ctx.lire(cle) : undefined;
    return v === undefined || v === null ? DEFAUTS_CALENDRIER[cle] : v;
  }
  get mode() { return this.lire('calMode') === 'semaine' ? 'semaine' : 'mois'; }

  detruire() { this.racine.empty(); }

  dessiner() {
    try { this.dessinerVraiment(); } catch (e) {
      console.error('[Ariane] calendrier :', e);
      this.racine.empty();
      this.racine.createDiv({ cls: 'zfa-refs-vide',
        text: tr('Le calendrier n’a pas pu se dessiner : ') + (e && e.message ? e.message : e) });
    }
  }

  dessinerVraiment() {
    const c = this.racine;
    c.empty();
    this._taches = (this.ctx.taches && this.ctx.taches()) || [];
    if (this._enAttente && this._enAttente.size) {
      for (const t of this._taches) {
        const p = this._enAttente.get(t.ref);
        if (!p) continue;
        const cle = JSON.stringify([t.debut, t.echeance, (t.creneaux || []).slice().sort()]);
        if (cle === JSON.stringify(p.cible)) this._enAttente.delete(t.ref);
        else {
          if (p.debut !== undefined) t.debut = p.debut;
          if (p.echeance !== undefined) t.echeance = p.echeance;
          if (p.creneaux !== undefined) t.creneaux = p.creneaux;
        }
      }
    }
    this.dessinerBarreOutils(c);
    const grille = c.createDiv({ cls: 'zfa-cal-grille zfa-cal-' + this.mode });
    if (this.mode === 'semaine') this.dessinerSemaine(grille);
    else this.dessinerMois(grille);
  }

  dessinerBarreOutils(c) {
    const b = c.createDiv({ cls: 'zfa-cal-barre' });
    const nav = (d) => {
      this._ancre = this.mode === 'mois'
        ? Ariane.moisSuivantN(this._ancre, d) : Ariane.decalerJour(this._ancre, d * 7);
      this.dessiner();
    };
    b.createEl('button', { cls: 'zfa-cal-nav', text: '‹' }).onclick = () => nav(-1);
    b.createEl('button', { cls: 'zfa-cal-nav', text: tr('Aujourd\'hui') }).onclick = () => {
      this._ancre = new Date().toISOString().slice(0, 10); this.dessiner();
    };
    b.createEl('button', { cls: 'zfa-cal-nav', text: '›' }).onclick = () => nav(1);
    b.createSpan({ cls: 'zfa-cal-titre', text: this.titrePeriode() });
    for (const m of ['mois', 'semaine']) {
      const o = b.createEl('button', {
        cls: 'zfa-cal-mode' + (this.mode === m ? ' is-active' : ''),
        text: m === 'mois' ? tr('Mois') : tr('Semaine') });
      o.onclick = async () => { await this.ctx.ecrire('calMode', m); this.dessiner(); };
    }
  }

  titrePeriode() {
    const [a, m] = this._ancre.split('-').map(Number);
    if (this.mode === 'mois') return (MOIS_COURTS[m - 1] || m) + ' ' + a;
    const g = Ariane.grilleSemaine(this._ancre);
    return Number(g.jours[0].slice(8)) + '–' + Number(g.jours[6].slice(8))
      + ' ' + (MOIS_COURTS[m - 1] || '') + ' ' + a;
  }

  ouvrir(ref, nouveau) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === ref);
    if (f) this.app.workspace.getLeaf(!!nouveau).openFile(f);
  }
  couleurTache(t) {
    if ((this.greffon.settings.friseBarreCouleur || 'famille') === 'statut') {
      return Ariane.COULEURS_GANTT[t.statut] || 'var(--text-faint)';
    }
    return (this.greffon.familleDe(t.famille) || {}).couleur || 'var(--text-faint)';
  }
  async _apres(ref, apercu) {
    if (!this._enAttente) this._enAttente = new Map();
    if (apercu) this._enAttente.set(ref, apercu);
    this.dessiner();
  }

  dessinerMois(g) { g.createDiv({ cls: 'zfa-cal-vide', text: '…' }); }   // Task 6
  dessinerSemaine(g) { g.createDiv({ cls: 'zfa-cal-vide', text: '…' }); } // Task 7
}
```

- [ ] **Step 3 — fabrique de vue** — après `fabriquerVueFriseBase` :

```js
function fabriquerVueCalendrierBase(greffon) {
  return class VueCalendrierBase extends obsidian.BasesView {
    constructor(controleur, conteneur) {
      super(controleur);
      this.type = TYPE_VUE_BASE_CALENDRIER;
      this.greffon = greffon;
      this.conteneur = conteneur;
    }
    onload() {
      this.moteur = new MoteurCalendrier(this.greffon, this.conteneur, {
        taches: () => this.tachesDeLaBase(),
        lire: (cle) => {
          const v = this.config.get(cle);
          return v === undefined || v === null ? DEFAUTS_CALENDRIER[cle] : v;
        },
        ecrire: async (cle, v) => { this.config.set(cle, v); },
      });
    }
    tachesDeLaBase() {
      const dedans = new Set();
      for (const e of (this.data && this.data.data) || []) {
        const ref = e && e.file ? this.greffon.refDeChemin(e.file.path) : null;
        if (ref) dedans.add(ref);
      }
      if (!dedans.size) return [];
      return this.greffon.tachesPourGantt().filter((t) => dedans.has(t.ref));
    }
    onunload() { if (this.moteur) this.moteur.detruire(); }
    onResize() { if (this.moteur) this.moteur.dessiner(); }
    async onDataUpdated() {
      if (this.greffon.settings.famillesTaches && this.greffon.settings.famillesTaches.length) {
        try { await this.greffon.rattraperProprietesFamilles(); } catch (e) { /* rien */ }
      }
      if (this.moteur) this.moteur.dessiner();
    }
  };
}
```

- [ ] **Step 4 — enregistrement** — dans `onload`, après le bloc `registerBasesView(TYPE_VUE_BASE_ARTIC, …)` :

```js
      const VueCal = fabriquerVueCalendrierBase(this);
      this.registerBasesView(TYPE_VUE_BASE_CALENDRIER, {
        name: tr('Calendrier'),
        icon: 'calendar-days',
        factory: (controleur, conteneur) => new VueCal(controleur, conteneur),
        options: () => [
          { type: 'dropdown', key: 'calMode', displayName: tr('Vue'), default: 'mois',
            options: { mois: tr('Mois'), semaine: tr('Semaine') } },
          { type: 'text', key: 'calHeureDebut', displayName: tr('Heure de début (semaine)'), default: '07:00' },
          { type: 'text', key: 'calHeureFin', displayName: tr('Heure de fin (semaine)'), default: '21:00' },
        ],
      });
```

(`agendaCalendrier` / `agendaFond` : ajoutés par le plan synchro.)

- [ ] **Step 5 — CSS coquille** :

```css
/* ===================== Vue calendrier ============================== */
.zfa-cal { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.zfa-cal-barre {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; flex: none;
  border-bottom: 1px solid var(--background-modifier-border);
}
.zfa-cal-nav, .zfa-cal-mode {
  background: transparent; border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s); padding: 2px 8px; cursor: pointer;
  color: var(--text-muted); font-size: var(--font-ui-smaller);
}
.zfa-cal-mode.is-active { color: var(--text-normal); border-color: var(--interactive-accent); }
.zfa-cal-titre { font-weight: 600; margin: 0 6px; }
.zfa-cal-grille { flex: 1 1 auto; overflow: auto; }
.zfa-cal-vide { color: var(--text-faint); padding: 24px; text-align: center; }
.zfa-cal-cible { box-shadow: inset 0 0 0 2px var(--interactive-accent); }
```

- [ ] **Step 6 — traductions** :

```js
    "Calendrier": "Calendar",
    "Le calendrier n’a pas pu se dessiner : ": "The calendar could not be drawn: ",
    "Heure de début (semaine)": "Start hour (week)",
    "Heure de fin (semaine)": "End hour (week)",
    "Mois": "Month",
    "Semaine": "Week",
    "Vue": "View",
```

- [ ] **Step 7 — vérifier** : `node --check` OK, tests verts, déployer. Coffre → `.base` → « Ajouter une vue » → **Calendrier** ; barre d'outils (‹ Aujourd'hui ›, titre, Mois/Semaine) + grille vide ; navigation change le titre.

- [ ] **Step 8 — commit** : « Calendrier : vue de base enregistrée + squelette du moteur ».

---

## Task 6 : Rendu vue mois

**Files:** `main.js` (`MoteurCalendrier.dessinerMois`), `styles.css`.

- [ ] **Step 1 — `dessinerMois`** — remplacer le stub :

```js
  dessinerMois(hote) {
    const g = Ariane.grilleMois(this._ancre);
    const auj = new Date().toISOString().slice(0, 10);
    const enRetard = Ariane.tachesEnRetard(this._taches, auj);
    const parJour = new Map();
    for (const t of this._taches) {
      for (const ev of Ariane.evenementsDeTache(t)) {
        let j = ev.debut.slice(0, 10);
        const finEx = ev.allDay ? ev.fin.slice(0, 10) : Ariane.decalerJour(ev.fin.slice(0, 10), 1);
        let garde = 0;
        while (j < finEx && garde < 400) {
          if (!parJour.has(j)) parJour.set(j, []);
          parJour.get(j).push({ t, ev });
          j = Ariane.decalerJour(j, 1); garde += 1;
        }
      }
    }
    const grille = hote.createDiv({ cls: 'zfa-cal-mois-grille' });
    for (const d of ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']) {
      grille.createDiv({ cls: 'zfa-cal-jour-entete', text: tr(d) });
    }
    for (const semaine of g.semaines) {
      for (const jour of semaine) {
        const cell = grille.createDiv({ cls: 'zfa-cal-cellule' });
        cell.dataset.jour = jour;
        if (jour === auj) cell.addClass('est-aujourdhui');
        if (jour.slice(0, 7) !== g.moisDebut.slice(0, 7)) cell.addClass('hors-mois');
        cell.createDiv({ cls: 'zfa-cal-quantieme', text: String(Number(jour.slice(8, 10))) });
        for (const { t, ev } of (parJour.get(jour) || [])) {
          const p = cell.createDiv({
            cls: 'zfa-cal-pastille ' + (ev.allDay ? 'est-jour' : 'est-horaire')
              + (enRetard.has(t.ref) ? ' est-retard' : '') });
          p.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
          p.dataset.ref = t.ref;
          if (ev.source === 'creneau') p.dataset.brut = ev.brut;
          p.createSpan({ text: (ev.allDay ? '' : ev.debut.slice(11, 16) + ' ') + (t.intitule || t.ref) });
          p.title = t.ref + ' · ' + (t.intitule || '');
          p.addEventListener('click', (e) => { e.stopPropagation();
            this.ouvrir(t.ref, e.metaKey || e.ctrlKey); });
        }
      }
    }
  }
```

- [ ] **Step 2 — CSS** :

```css
.zfa-cal-mois-grille {
  display: grid; grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(92px, 1fr); min-height: 100%;
}
.zfa-cal-jour-entete {
  text-align: center; font-size: var(--font-ui-smaller); color: var(--text-muted);
  padding: 4px 0; border-bottom: 1px solid var(--background-modifier-border);
}
.zfa-cal-cellule {
  border-right: 1px solid var(--background-modifier-border);
  border-bottom: 1px solid var(--background-modifier-border);
  padding: 3px 4px; overflow: hidden; display: flex; flex-direction: column; gap: 2px;
}
.zfa-cal-cellule.hors-mois { background: var(--background-secondary); }
.zfa-cal-cellule.est-aujourdhui { box-shadow: inset 0 0 0 2px var(--interactive-accent); }
.zfa-cal-quantieme { font-size: var(--font-ui-smaller); color: var(--text-muted); align-self: flex-end; }
.zfa-cal-pastille {
  font-size: var(--font-ui-smaller); line-height: 1.3; border-radius: var(--radius-s);
  padding: 1px 5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-left: 3px solid var(--zfa-cal-coul, var(--text-faint));
  background: color-mix(in srgb, var(--zfa-cal-coul, var(--text-faint)) 16%, transparent);
}
.zfa-cal-pastille.est-horaire { border-left-style: dashed; }
.zfa-cal-pastille.est-retard { outline: 1px solid var(--color-red); }
```

- [ ] **Step 3 — traductions** : `"Lun"`→`"Mon"`, `"Mar"`→`"Tue"`, `"Mer"`→`"Wed"`, `"Jeu"`→`"Thu"`, `"Ven"`→`"Fri"`, `"Sam"`→`"Sat"`, `"Dim"`→`"Sun"`.

- [ ] **Step 4 — vérifier** sur un `.base` de tâches : plages `début→échéance` sur chaque jour couvert, créneaux avec l'heure, clic ouvre la note, le filtre de la base restreint.

- [ ] **Step 5 — commit** : « Calendrier : rendu de la vue mois ».

---

## Task 7 : Rendu vue semaine

**Files:** `main.js` (`dessinerSemaine` + `_plageHoraire`), `styles.css`.

- [ ] **Step 1 — `_plageHoraire` + `dessinerSemaine`** :

```js
  _plageHoraire() {
    const h = (s, def) => {
      const m = String(this.lire(s) || '').match(/^(\d{1,2}):(\d{2})$/);
      return m ? Number(m[1]) + Number(m[2]) / 60 : def;
    };
    let d = h('calHeureDebut', 7);
    let f = h('calHeureFin', 21);
    if (f <= d) { d = 7; f = 21; }
    return { debut: d, fin: f };
  }

  dessinerSemaine(hote) {
    const g = Ariane.grilleSemaine(this._ancre);
    const auj = new Date().toISOString().slice(0, 10);
    const { debut: hDeb, fin: hFin } = this._plageHoraire();
    const PXH = 42;
    this._pxHeure = PXH; this._hDeb = hDeb; this._joursSemaine = g.jours;
    const horaire = new Map(g.jours.map((j) => [j, []]));
    const toutJour = new Map(g.jours.map((j) => [j, []]));
    for (const t of this._taches) {
      for (const ev of Ariane.evenementsDeTache(t)) {
        if (ev.allDay) {
          let j = ev.debut.slice(0, 10);
          while (j < ev.fin.slice(0, 10)) {
            if (toutJour.has(j)) toutJour.get(j).push({ t, ev });
            j = Ariane.decalerJour(j, 1);
          }
        } else {
          const j = ev.debut.slice(0, 10);
          if (horaire.has(j)) horaire.get(j).push({ t, ev });
        }
      }
    }
    const bandeau = hote.createDiv({ cls: 'zfa-cal-bandeau' });
    bandeau.createDiv({ cls: 'zfa-cal-gouttiere' });
    for (const j of g.jours) {
      const col = bandeau.createDiv({ cls: 'zfa-cal-bandeau-jour' + (j === auj ? ' est-aujourdhui' : '') });
      col.dataset.jour = j;
      for (const { t } of toutJour.get(j)) {
        const p = col.createDiv({ cls: 'zfa-cal-pastille est-jour' });
        p.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
        p.textContent = t.intitule || t.ref;
        p.dataset.ref = t.ref;
        p.addEventListener('click', (e) => this.ouvrir(t.ref, e.metaKey || e.ctrlKey));
      }
    }
    const corps = hote.createDiv({ cls: 'zfa-cal-corps' });
    const axe = corps.createDiv({ cls: 'zfa-cal-axe' });
    axe.style.height = ((hFin - hDeb) * PXH) + 'px';
    for (let h = Math.ceil(hDeb); h < hFin; h += 1) {
      const l = axe.createDiv({ cls: 'zfa-cal-axe-heure' });
      l.style.top = ((h - hDeb) * PXH) + 'px';
      l.textContent = h + ' h';
    }
    for (const j of g.jours) {
      const col = corps.createDiv({ cls: 'zfa-cal-col' + (j === auj ? ' est-aujourdhui' : '') });
      col.dataset.jour = j;
      col.style.height = ((hFin - hDeb) * PXH) + 'px';
      for (let h = Math.ceil(hDeb); h < hFin; h += 1) {
        const tr = col.createDiv({ cls: 'zfa-cal-trait' });
        tr.style.top = ((h - hDeb) * PXH) + 'px';
      }
      for (const { t, ev } of horaire.get(j)) {
        const y0 = (Number(ev.debut.slice(11, 13)) + Number(ev.debut.slice(14, 16)) / 60 - hDeb) * PXH;
        const finH = ev.fin.slice(0, 10) === j
          ? Number(ev.fin.slice(11, 13)) + Number(ev.fin.slice(14, 16)) / 60 : 24;
        const y1 = (finH - hDeb) * PXH;
        const bloc = col.createDiv({ cls: 'zfa-cal-bloc' });
        bloc.style.top = Math.max(0, y0) + 'px';
        bloc.style.height = Math.max(14, y1 - y0) + 'px';
        bloc.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
        bloc.dataset.ref = t.ref;
        if (ev.source === 'creneau') bloc.dataset.brut = ev.brut;
        bloc.createSpan({ text: ev.debut.slice(11, 16) + ' ' + (t.intitule || t.ref) });
        bloc.addEventListener('click', (e) => { e.stopPropagation();
          this.ouvrir(t.ref, e.metaKey || e.ctrlKey); });
      }
    }
  }
```

- [ ] **Step 2 — CSS** :

```css
.zfa-cal-bandeau, .zfa-cal-corps { display: grid; grid-template-columns: 52px repeat(7, 1fr); }
.zfa-cal-bandeau { border-bottom: 1px solid var(--background-modifier-border); }
.zfa-cal-bandeau-jour { border-left: 1px solid var(--background-modifier-border); padding: 2px; min-height: 20px; display: flex; flex-direction: column; gap: 2px; }
.zfa-cal-corps { position: relative; }
.zfa-cal-axe { position: relative; }
.zfa-cal-axe-heure { position: absolute; right: 4px; font-size: 10px; color: var(--text-faint); transform: translateY(-50%); }
.zfa-cal-col { position: relative; border-left: 1px solid var(--background-modifier-border); }
.zfa-cal-col.est-aujourdhui, .zfa-cal-bandeau-jour.est-aujourdhui { background: color-mix(in srgb, var(--interactive-accent) 6%, transparent); }
.zfa-cal-trait { position: absolute; left: 0; right: 0; border-top: 1px solid var(--background-modifier-border); opacity: 0.5; }
.zfa-cal-bloc {
  position: absolute; left: 2px; right: 2px; border-radius: var(--radius-s);
  padding: 1px 4px; font-size: var(--font-ui-smaller); overflow: hidden; cursor: pointer;
  background: color-mix(in srgb, var(--zfa-cal-coul) 22%, var(--background-primary));
  border-left: 3px solid var(--zfa-cal-coul);
}
```

- [ ] **Step 3 — vérifier** : sur une note, `Tâche - Créneaux: [2026-09-08 14:00-16:00, 2026-09-10 09:00-11:00]` → deux blocs distincts aux bons jours/heures ; tâches `début→échéance` dans le bandeau ; colonne du jour teintée.

- [ ] **Step 4 — commit** : « Calendrier : rendu de la vue semaine ».

---

## Task 8 : Gestes internes

**Files:** `main.js` (`MoteurCalendrier`).

- [ ] **Step 1 — vue mois : déplacer une pastille** — dans `dessinerMois`, sur chaque `p`, après le `click` :

```js
          p.setAttribute('draggable', 'true');
          p.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.setData('text/x-ariane-cal',
              JSON.stringify({ ref: t.ref, jour, brut: ev.target.dataset.brut || '', allDay: ev.allDay }));
            ev.dataTransfer.effectAllowed = 'move';
          });
```

Sur chaque `cell` :

```js
        cell.addEventListener('dragover', (ev) => { ev.preventDefault(); cell.addClass('zfa-cal-cible'); });
        cell.addEventListener('dragleave', () => cell.removeClass('zfa-cal-cible'));
        cell.addEventListener('drop', async (ev) => {
          cell.removeClass('zfa-cal-cible');
          const brut = ev.dataTransfer.getData('text/x-ariane-cal');
          if (!brut) return this._dropExterne(ev, cell.dataset.jour, 'mois');
          ev.preventDefault();
          const d = JSON.parse(brut);
          const n = Ariane.ecartJours(d.jour, cell.dataset.jour);
          if (!n) return;
          const t = this._taches.find((x) => x.ref === d.ref);
          if (!t) return;
          if (d.brut) {
            const cr = Ariane.parseCreneau(d.brut);
            if (cr) await this.greffon.majCreneau(d.ref, { avant: d.brut,
              debut: Ariane.decalerJour(cr.debut.slice(0, 10), n) + 'T' + cr.debut.slice(11),
              fin: Ariane.decalerJour(cr.fin.slice(0, 10), n) + 'T' + cr.fin.slice(11) });
            this._apres(d.ref, { cible: [t.debut, t.echeance, null], creneaux: undefined });
            return;
          }
          const nd = t.debut ? Ariane.decalerJour(t.debut, n) : '';
          const ne = t.echeance ? Ariane.decalerJour(t.echeance, n) : '';
          if (nd || ne) {
            await this.greffon.ecrireDatesTaches([{ ref: d.ref, debut: nd, echeance: ne }]);
            this._apres(d.ref, { debut: nd, echeance: ne, cible: [nd, ne, []] });
          }
        });
```

- [ ] **Step 2 — vue semaine : déplacer / redimensionner / supprimer un bloc** — dans `dessinerSemaine`, sur chaque `bloc` (créneau seulement, `if (ev.source === 'creneau')`) :

```js
        bloc.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t.ref, ev.brut, j));
        const poi = bloc.createDiv({ cls: 'zfa-cal-poignee' });
        poi.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t.ref, ev.brut, j, 'fin'));
        bloc.tabIndex = 0;
        bloc.addEventListener('keydown', async (e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            await this.greffon.majCreneau(t.ref, { avant: ev.brut, debut: '', fin: '' });
            this._apres(t.ref, { cible: [t.debut, t.echeance, null], creneaux: undefined });
          }
        });
```

Méthode :

```js
  _saisirBloc(e, bloc, ref, brut, jourCol, mode) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const PXH = this._pxHeure;
    const y0 = e.clientY;
    const topDep = parseFloat(bloc.style.top) || 0;
    const hDep = parseFloat(bloc.style.height) || 20;
    let bouge = false;
    const cal = (v) => Math.round(v / (PXH / 4)) * (PXH / 4);
    const bouger = (mv) => {
      const d = mv.clientY - y0;
      if (Math.abs(d) > 3) bouge = true;
      if (mode === 'fin') bloc.style.height = Math.max(PXH / 4, cal(hDep + d)) + 'px';
      else bloc.style.top = Math.max(0, cal(topDep + d)) + 'px';
    };
    const lacher = async () => {
      document.removeEventListener('pointermove', bouger);
      document.removeEventListener('pointerup', lacher);
      if (!bouge) return;
      const top = parseFloat(bloc.style.top) || 0;
      const haut = parseFloat(bloc.style.height) || PXH;
      const cr = Ariane.creneauDepuisDrop({ yRel: top, hauteurHeure: PXH,
        heureDebut: this._hDeb, jourISO: jourCol, dureeMin: Math.max(15, (haut / PXH) * 60) });
      if (!cr) { this.dessiner(); return; }
      await this.greffon.majCreneau(ref, { avant: brut, debut: cr.debut, fin: cr.fin });
      this._apres(ref, { cible: [undefined, undefined, null], creneaux: undefined });
    };
    document.addEventListener('pointermove', bouger);
    document.addEventListener('pointerup', lacher);
  }
```

CSS :

```css
.zfa-cal-poignee { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; cursor: ns-resize; }
.zfa-cal-bloc:focus { outline: 2px solid var(--interactive-accent); outline-offset: 1px; }
```

- [ ] **Step 3 — note** : le report d'index `_enAttente` avec `creneaux: undefined` + `cible` avec `null` en 3ᵉ position force un redraw complet au prochain `onDataUpdated` (la comparaison échoue toujours tant que l'index n'a pas rattrapé) — acceptable pour un premier jet ; affiner si scintillement.

- [ ] **Step 4 — vérifier** : mois → glisser une pastille change les dates (ou décale le créneau) ; semaine → glisser un bloc le repositionne, tirer la poignée change la fin, Suppr sur un bloc focalisé le retire ; le bloc `## Créneaux` de la note se met à jour.

- [ ] **Step 5 — commit** : « Calendrier : gestes (déplacer / redimensionner / supprimer un créneau) ».

---

## Task 9 : Glisser-déposer depuis la frise

**Files:** `main.js` — `MoteurFrise.dessinerBarres` (~17060), `dessinerColonneGauche` (~16447), `MoteurCalendrier` (`_dropExterne`, `_refDepuisDrop`), `styles.css`.

- [ ] **Step 1 — source côté frise** — dans `dessinerColonneGauche`, sur chaque `rangee` (`.bases-tr.zfa-gantt-libelle`) :

```js
      rangee.setAttribute('draggable', 'true');
      rangee.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/x-ariane-tache', l.ref);
        ev.dataTransfer.setData('text/plain', '[[' + l.ref + ']]');
        ev.dataTransfer.effectAllowed = 'copy';
      });
```

Dans `dessinerBarres`, sur le `groupe` de chaque barre, après le câblage `contextmenu` :

```js
      groupe.setAttribute('draggable', 'true');
      groupe.addEventListener('dragstart', (ev) => {
        if (ev.target.closest('.zfa-gantt-poignee, .zfa-gantt-connecteur')) { ev.preventDefault(); return; }
        ev.dataTransfer.setData('text/x-ariane-tache', l.ref);
        ev.dataTransfer.setData('text/plain', '[[' + l.ref + ']]');
        ev.dataTransfer.effectAllowed = 'copy';
      });
```

**Décision de repli** (si le glissé horizontal de barre casse au test manuel) : retirer le bloc de `dessinerBarres`, ne garder `draggable` que sur la ligne du tableau.

- [ ] **Step 2 — résolution + `_dropExterne`** — dans `MoteurCalendrier` :

```js
  _refDepuisDrop(dt) {
    const direct = dt.getData('text/x-ariane-tache');
    if (direct) return direct.trim();
    const txt = (dt.getData('text/plain') || '').trim();
    if (!txt) return '';
    const lien = Ariane.refDeLien(txt);
    if (this._taches.some((t) => t.ref === lien)) return lien;
    const m = txt.match(/([^/\\]+)\.md/);
    if (m && this._taches.some((t) => t.ref === m[1])) return m[1];
    return this.greffon.refDeChemin ? (this.greffon.refDeChemin(txt) || '') : '';
  }

  async _dropExterne(ev, jourISO, mode) {
    const ref = this._refDepuisDrop(ev.dataTransfer);
    if (!ref) return;
    ev.preventDefault();
    if (mode === 'mois') {
      await this.greffon.ecrireDatesTaches([{ ref, debut: jourISO, echeance: jourISO }]);
      this._apres(ref, { debut: jourISO, echeance: jourISO, cible: [jourISO, jourISO, []] });
      return;
    }
    const r = ev.currentTarget.getBoundingClientRect();
    const cr = Ariane.creneauDepuisDrop({ yRel: ev.clientY - r.top,
      hauteurHeure: this._pxHeure, heureDebut: this._hDeb, jourISO });
    if (!cr) return;
    await this.greffon.majCreneau(ref, { avant: '', debut: cr.debut, fin: cr.fin });
    this._apres(ref, { cible: [undefined, undefined, null], creneaux: undefined });
  }
```

- [ ] **Step 3 — cible côté calendrier (semaine)** — dans `dessinerSemaine`, sur chaque `col` :

```js
      col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.addClass('zfa-cal-cible'); });
      col.addEventListener('dragleave', () => col.removeClass('zfa-cal-cible'));
      col.addEventListener('drop', (ev) => { col.removeClass('zfa-cal-cible'); this._dropExterne(ev, col.dataset.jour, 'semaine'); });
```

En vue mois, le `drop` des cellules (Task 8 Step 1) appelle déjà `_dropExterne(ev, cell.dataset.jour, 'mois')` quand il n'y a pas de payload interne.

- [ ] **Step 4 — vérifier** : deux volets (frise / calendrier via scission native). Glisser une barre de la frise dans une colonne de la vue semaine → `Tâche - Créneaux` gagne une entrée, un bloc apparaît, le bloc `## Créneaux` de la note se met à jour. Glisser sur la vue mois → dates calées sur le jour. Glisser un `[[T-…]]` depuis l'explorateur → idem. Le déplacement horizontal d'une barre dans la frise fonctionne toujours (sinon appliquer le repli Step 1).

- [ ] **Step 5 — commit** : « Calendrier : glisser une tâche de la frise pour poser un créneau ».

---

## Task 10 : README

**Files:** `README.md`, `README.fr.md`.

- [ ] **Step 1 — FR** — dans « ✅ Tâches », après « Frise (Gantt) et Articulation » :

```markdown
### Vue calendrier

Une troisième vue de base, `ariane-calendrier` : grille **mois** ou **semaine**.
Les tâches s'y posent sur leurs dates — plage `début → échéance` en journée
entière, ou un **bloc par créneau** si la tâche porte des `Créneaux`. `Créneaux`
est une **liste** (`2026-09-08 14:00-16:00`, …) : une tâche se travaille en
plusieurs sessions. Ariane entretient dans la note un tableau `## Créneaux` avec
les statistiques de durée (sessions, temps planifié, à venir), pour que
l'information reste **autoportée par la note**.

Glisser une pastille la reprogramme ; en vue semaine, glisser ou redimensionner
un bloc réécrit ce créneau, Suppr le retire. **Glisser une barre depuis la
frise** (ou un lien `[[T26-001]]` depuis n'importe où) sur le calendrier ajoute
un créneau à l'heure du lâcher. Empilez frise et calendrier en scindant un volet.
```

- [ ] **Step 2 — EN** — équivalent dans `README.md`.

- [ ] **Step 3 — commit** : « README : vue calendrier ».

---

## Self-Review

- **Couverture spec** : §2.1 → T1 ; §2.2 (section + stats) → T3 ; §2.5 (`evenementsDeTache`) → T2 ; §3.1 options → T5 ; §3.2 rendu → T6/T7 ; §3.3 gestes → T8 ; §3.4 DnD → T9 ; §2.3/§2.4 (`agenda-*`) : **hors périmètre** (plan synchro).
- **Placeholders** : stubs `dessinerMois`/`dessinerSemaine` de T5, remplacés en T6/T7.
- **Cohérence des types** : `evenementsDeTache` → tableau `{genre,debut,fin,allDay,source,idx?,brut?}` partout ; `creneauDepuisDrop` → `{debut,fin}` datetime ; `majCreneau(ref, {avant,debut,fin})` signature unique ; `ecrireDatesTaches([{ref,debut,echeance}])` inchangé.
- **Risque connu** (T9 Step 1) : cohabitation `draggable` natif / `pointerdown` `saisir` — repli documenté.
- **Risque** (T8 Step 3) : le report d'index `_enAttente` pour les créneaux est grossier (redraw forcé). Acceptable ; à affiner si scintillement au test.

## Execution Handoff

Plan enregistré. Deux options :
1. **Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre chaque.
2. **Inline** — exécution en session avec points de contrôle.
