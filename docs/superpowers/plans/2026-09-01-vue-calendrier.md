# Vue calendrier `ariane-calendrier` — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la vue de base `ariane-calendrier` (grille mois / semaine des tâches d'une base), ses gestes internes, et le glisser-déposer depuis la frise qui pose un créneau — SANS la synchronisation EventKit (plan séparé).

**Architecture:** Une classe moteur `MoteurCalendrier` (sur le patron de `MoteurFrise`), une fabrique `fabriquerVueCalendrierBase(greffon)` enregistrée via `registerBasesView('ariane-calendrier', …)`. Helpers purs sur `Ariane` : `parseCreneau`, `formatCreneau`, `evenementDeTache`, `grilleMois`, `grilleSemaine`, `creneauDepuisDrop`. Nouveau concept de tâche `creneau` (+ `agenda-id`, posé mais inutilisé ici). Le rendu réutilise les conventions de la frise (couleur de famille, `Ariane.tachesEnRetard`, report d'index `_enAttente`).

**Tech Stack:** `main.js` (un seul fichier, `'use strict'`, pas de build), `styles.css`, tests `node --test tests/*.test.js` avec `tests/obsidian-factice.js`. API Bases : `obsidian.BasesView`, `this.config.get/set/serialize/getOrder`, `this.data.data`.

**Spec:** [docs/superpowers/specs/2026-09-01-calendrier-agenda-design.md](../specs/2026-09-01-calendrier-agenda-design.md) — §2, §3, §3.4. La §4 (synchro EventKit) et §5 (réglages Agenda) sont hors de ce plan.

## Global Constraints

- Déploiement : `cp main.js styles.css manifest.json` vers `/Users/equiriconi/Obsidian Vault/.obsidian/plugins/obsidian-ariane/`. Ne jamais toucher `data.json` du coffre.
- `main.js` contient des octets NUL → `grep -a`.
- Messages de commit en français, terminés par `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, via `git commit -F <fichier>` (les accents sont mangés par `-m` avec heredoc).
- Ne pas fusionner de branche ni taguer sans demande explicite.
- `creneau` est un concept renommable (comme `echeance`) : sa clé de frontmatter passe par `greffon.cleT('creneau')`, jamais en dur.
- `type`, `aliases`, `cree`, `modifie`, `rappel-sync`, `agenda-sync` ne sont PAS des concepts.
- Ne pas toucher aux clés `famillesNotes` / `zotflow-*` (autre greffon).
- Chaque tâche finit par : `node --check main.js`, `node --test tests/*.test.js` (236+ verts), déploiement coffre, commit.

---

## File Structure

- **`main.js`** — tout le code. Zones touchées :
  - `Ariane.PROPS_GENERIQUES` / `CONCEPTS_TACHE` / `GROUPES_TACHE` — ajout de `creneau`, `agenda-id`.
  - `Ariane` statics (région « frise / gantt » ou nouvelle sous-région « calendrier ») — `parseCreneau`, `formatCreneau`, `evenementDeTache`, `grilleMois`, `grilleSemaine`, `creneauDepuisDrop`.
  - `Ariane.corpsNouvelleTache` — ligne `creneau`.
  - Constantes de module — `TYPE_VUE_BASE_CALENDRIER`, `DEFAUTS_CALENDRIER`.
  - `class MoteurCalendrier` — nouvelle, après `MoteurFrise` / sa fabrique.
  - `fabriquerVueCalendrierBase(greffon)` — nouvelle, après `fabriquerVueFriseBase`.
  - `onload` (`registerBasesView`) — enregistrement de la vue.
  - greffon — `ecrireCreneau(ref, debut, fin)`.
  - `MoteurFrise.dessinerBarres` + `dessinerColonneGauche` — source de glisser-déposer (`draggable`, `dragstart`).
  - dictionnaire `tr` — libellés FR→EN.
- **`styles.css`** — bloc `.zfa-cal-*`.
- **`tests/calendrier.test.js`** — NOUVEAU : `parseCreneau`, `formatCreneau`, `evenementDeTache`, `grilleMois`, `grilleSemaine`, `creneauDepuisDrop`.
- **`README.md` / `README.fr.md`** — sous-section « Vue calendrier ».

---

## Task 1 : Concept `creneau` + parse / format

**Files:**
- Modify: `main.js` — `PROPS_GENERIQUES` (~ligne 4235), `CONCEPTS_TACHE` (~4254), `GROUPES_TACHE` (~4264), `corpsNouvelleTache` (~4712), + nouveaux statics près de `disposerGantt`.
- Create: `tests/calendrier.test.js`

**Interfaces:**
- Produces :
  - `Ariane.parseCreneau(str) -> { debut: 'YYYY-MM-DDTHH:MM', fin: 'YYYY-MM-DDTHH:MM' } | null`
  - `Ariane.formatCreneau(debut, fin) -> string` (forme canonique)
  - `Ariane.CONCEPTS_TACHE` inclut `'creneau'` et `'agenda-id'`
  - `Ariane.PROPS_GENERIQUES` inclut `{ cle: 'creneau', defaut: 'Créneau', icone: 'calendar-clock' }`

- [ ] **Step 1 — test qui échoue**

Créer `tests/calendrier.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

/* --------------------- parseCreneau / formatCreneau ---------------- */

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

test('parseCreneau : fin avant début même jour → +1 jour sur la fin', () => {
  assert.deepEqual(Ariane.parseCreneau('2026-09-08 23:00-01:00'),
    { debut: '2026-09-08T23:00', fin: '2026-09-09T01:00' });
});

test('parseCreneau : passage de minuit explicite', () => {
  assert.deepEqual(Ariane.parseCreneau('2026-09-08 22:00 / 2026-09-09 01:30'),
    { debut: '2026-09-08T22:00', fin: '2026-09-09T01:30' });
});

test('parseCreneau : entrées invalides → null', () => {
  for (const s of ['', 'demain', '2026-09-08', '2026-09-08 14:00', null, '2026-13-01 10:00-11:00']) {
    assert.equal(Ariane.parseCreneau(s), null, JSON.stringify(s));
  }
});

test('formatCreneau : même jour compact, cross-day explicite', () => {
  assert.equal(Ariane.formatCreneau('2026-09-08T14:00', '2026-09-08T16:00'),
    '2026-09-08 14:00-16:00');
  assert.equal(Ariane.formatCreneau('2026-09-08T22:00', '2026-09-09T01:30'),
    '2026-09-08 22:00 / 2026-09-09 01:30');
});

test('formatCreneau ∘ parseCreneau = identité', () => {
  for (const s of ['2026-09-08 14:00-16:00', '2026-09-08 22:00 / 2026-09-09 01:30']) {
    const p = Ariane.parseCreneau(s);
    assert.equal(Ariane.formatCreneau(p.debut, p.fin), s);
  }
});

test('CONCEPTS_TACHE et PROPS_GENERIQUES portent creneau', () => {
  assert.ok(Ariane.CONCEPTS_TACHE.includes('creneau'));
  assert.ok(Ariane.CONCEPTS_TACHE.includes('agenda-id'));
  assert.ok(Ariane.PROPS_GENERIQUES.some((p) => p.cle === 'creneau'));
});
```

- [ ] **Step 2 — lancer, vérifier l'échec**

`node --test tests/calendrier.test.js` → FAIL (`parseCreneau` non défini).

- [ ] **Step 3 — constantes**

Dans `PROPS_GENERIQUES`, après l'entrée `heure` :

```js
      { cle: 'sans-echeance', defaut: 'Sans échéance', icone: 'calendar-off' },
      { cle: 'creneau', defaut: 'Créneau', icone: 'calendar-clock' },
```

(garder l'ordre existant ; `creneau` juste après `sans-echeance`.)

Dans `CONCEPTS_TACHE`, ajouter `'creneau'` après `'sans-echeance'` et `'agenda-id'` après `'rappel-id'` :

```js
    return ['famille', 'statut', 'terminee', 'priorite', 'jalon',
            'debut', 'echeance', 'heure', 'sans-echeance', 'creneau', 'avancement', 'parent',
            'bloque-par', 'termine-le',
            'source', 'livrable', 'fichier', 'liste', 'rappel-id', 'agenda-id'];
```

Dans `GROUPES_TACHE`, groupe `planning`, ajouter `'creneau'` après `'heure'` :

```js
      { id: 'planning', nom: 'Planning', concepts: ['debut', 'echeance', 'heure', 'creneau', 'jalon', 'termine-le'] },
```

- [ ] **Step 4 — `parseCreneau` / `formatCreneau`**

À placer dans la région `//#region Ariane · static · frise / gantt`, juste avant `static disposerGantt` :

```js
  // Analyse un créneau texte -> { debut, fin } en ISO « YYYY-MM-DDTHH:MM ».
  // Accepte « 2026-09-08 14:00-16:00 » (même jour) et
  // « 2026-09-08 22:00 / 2026-09-09 01:30 » (passage de minuit explicite).
  // Séparateurs tolérés : - – — / « à ». Heures H:MM ou HH:MM.
  static parseCreneau(str) {
    const s = String(str == null ? '' : str).trim();
    if (!s) return null;
    const jhm = (d, h) => {
      const m = String(h).match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const H = Number(m[1]);
      const M = Number(m[2]);
      if (H > 23 || M > 59 || !Ariane.jourValide(d)) return null;
      return d + 'T' + String(H).padStart(2, '0') + ':' + m[2];
    };
    // Forme explicite : deux dates.
    let m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*(?:[-–—/]|à)\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/);
    if (m) {
      const a = jhm(m[1], m[2]);
      const b = jhm(m[3], m[4]);
      return (a && b && b > a) ? { debut: a, fin: b } : null;
    }
    // Forme compacte : une date, deux heures.
    m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*(?:[-–—/]|à)\s*(\d{1,2}:\d{2})$/);
    if (!m) return null;
    const a = jhm(m[1], m[2]);
    let b = jhm(m[1], m[3]);
    if (!a || !b) return null;
    if (b <= a) b = jhm(Ariane.decalerJour(m[1], 1), m[3]); // fin le lendemain
    return b > a ? { debut: a, fin: b } : null;
  }

  // Forme canonique inverse de parseCreneau.
  static formatCreneau(debut, fin) {
    const d = String(debut || '');
    const f = String(fin || '');
    const jd = d.slice(0, 10);
    const hd = d.slice(11, 16);
    const jf = f.slice(0, 10);
    const hf = f.slice(11, 16);
    if (!jd || !hd || !jf || !hf) return '';
    return jd === jf ? jd + ' ' + hd + '-' + hf : jd + ' ' + hd + ' / ' + jf + ' ' + hf;
  }
```

- [ ] **Step 5 — `corpsNouvelleTache`**

Après la ligne `heure` dans `corpsNouvelleTache` (là où `sans-echeance` est déjà émis) :

```js
    l.push(ligne(K('creneau'), c.creneau));
```

(insérer juste après la ligne `K('sans-echeance')`.)

- [ ] **Step 6 — `tachesPourGantt` porte `creneau`**

Dans `greffon.tachesPourGantt()` (~ligne 11970), dans l'objet poussé, après `heure:` :

```js
        heure: String(this._lireT(fm, 'heure') || '').trim(),
        creneau: String(this._lireT(fm, 'creneau') || '').trim(),
```

(Ne PAS ajouter `agenda-id` ici : la vue calendrier ne s'en sert pas ; le plan
synchro l'ajoutera au besoin.)

Vérifier qu'aucun test existant sur `tachesPourGantt` ne casse (`node --test`).

- [ ] **Step 7 — lancer les tests**

`node --test tests/*.test.js` → tout vert (les nouveaux inclus).

- [ ] **Step 8 — commit**

```
git add main.js tests/calendrier.test.js
git commit -F <message>
```
Message : « Tâches : concept Créneau (parse/format, constantes) ».

---

## Task 2 : `evenementDeTache`

**Files:**
- Modify: `main.js` — nouveau static près de `parseCreneau`.
- Modify: `tests/calendrier.test.js`

**Interfaces:**
- Consumes : `Ariane.parseCreneau`, `Ariane.jourValide`, `Ariane.decalerJour`.
- Produces : `Ariane.evenementDeTache(t) -> { genre: 'horaire'|'jour', debut, fin, allDay } | null`
  - `genre 'jour'` : `debut`/`fin` sont des dates ISO `YYYY-MM-DD`, `allDay: true`, `fin` = **borne exclusive** (échéance + 1 jour).
  - `genre 'horaire'` : `debut`/`fin` sont des datetimes `YYYY-MM-DDTHH:MM`, `allDay: false`.

- [ ] **Step 1 — test qui échoue**

Ajouter à `tests/calendrier.test.js` :

```js
/* --------------------- evenementDeTache -------------------------- */

const T = (o) => Object.assign(
  { ref: 'T-1', debut: '', echeance: '', heure: '', creneau: '', jalon: false }, o);

test('evenementDeTache : créneau prioritaire', () => {
  assert.deepEqual(
    Ariane.evenementDeTache(T({ debut: '2026-09-01', echeance: '2026-09-10',
      creneau: '2026-09-08 14:00-16:00' })),
    { genre: 'horaire', debut: '2026-09-08T14:00', fin: '2026-09-08T16:00', allDay: false });
});

test('evenementDeTache : début + échéance → journée entière, borne exclusive', () => {
  assert.deepEqual(
    Ariane.evenementDeTache(T({ debut: '2026-09-01', echeance: '2026-09-03' })),
    { genre: 'jour', debut: '2026-09-01', fin: '2026-09-04', allDay: true });
});

test('evenementDeTache : échéance seule + heure → 1 h', () => {
  assert.deepEqual(
    Ariane.evenementDeTache(T({ echeance: '2026-09-03', heure: '09:30' })),
    { genre: 'horaire', debut: '2026-09-03T09:30', fin: '2026-09-03T10:30', allDay: false });
});

test('evenementDeTache : échéance seule sans heure → journée', () => {
  assert.deepEqual(
    Ariane.evenementDeTache(T({ echeance: '2026-09-03' })),
    { genre: 'jour', debut: '2026-09-03', fin: '2026-09-04', allDay: true });
});

test('evenementDeTache : jalon → journée de l’échéance', () => {
  assert.deepEqual(
    Ariane.evenementDeTache(T({ echeance: '2026-09-03', jalon: true, heure: '09:00' })),
    { genre: 'jour', debut: '2026-09-03', fin: '2026-09-04', allDay: true });
});

test('evenementDeTache : aucune date → null', () => {
  assert.equal(Ariane.evenementDeTache(T({})), null);
  assert.equal(Ariane.evenementDeTache(T({ heure: '09:00' })), null);
});

test('evenementDeTache : créneau invalide retombe sur les dates', () => {
  assert.deepEqual(
    Ariane.evenementDeTache(T({ echeance: '2026-09-03', creneau: 'n’importe quoi' })),
    { genre: 'jour', debut: '2026-09-03', fin: '2026-09-04', allDay: true });
});
```

- [ ] **Step 2 — lancer, vérifier l'échec**

`node --test tests/calendrier.test.js` → FAIL.

- [ ] **Step 3 — implémentation**

Après `formatCreneau` :

```js
  // Quel événement de calendrier une tâche produit-elle ? Voir la spec §2.4.
  // « jour » : dates nues, fin = borne exclusive (échéance + 1). « horaire » :
  // datetimes. null si la tâche n'a aucune date exploitable.
  static evenementDeTache(t) {
    if (!t) return null;
    const cr = Ariane.parseCreneau(t.creneau);
    if (cr) return { genre: 'horaire', debut: cr.debut, fin: cr.fin, allDay: false };
    const deb = Ariane.jourValide(t.debut);
    const ech = Ariane.jourValide(t.echeance);
    if (deb && ech) {
      return { genre: 'jour', debut: deb, fin: Ariane.decalerJour(ech, 1), allDay: true };
    }
    if (ech) {
      const h = String(t.heure || '').match(/^(\d{1,2}):(\d{2})$/);
      if (h && !t.jalon) {
        const H = String(h[1]).padStart(2, '0');
        const fin = (Number(h[1]) + 1) % 24;
        const jourFin = Number(h[1]) === 23 ? Ariane.decalerJour(ech, 1) : ech;
        return {
          genre: 'horaire',
          debut: ech + 'T' + H + ':' + h[2],
          fin: jourFin + 'T' + String(fin).padStart(2, '0') + ':' + h[2],
          allDay: false,
        };
      }
      return { genre: 'jour', debut: ech, fin: Ariane.decalerJour(ech, 1), allDay: true };
    }
    return null;
  }
```

- [ ] **Step 4 — lancer les tests**

`node --test tests/*.test.js` → vert.

- [ ] **Step 5 — commit**

Message : « Tâches : evenementDeTache (règle tâche → événement) ».

---

## Task 3 : Grilles mois / semaine + `creneauDepuisDrop` (purs)

**Files:**
- Modify: `main.js` — statics près de `evenementDeTache`.
- Modify: `tests/calendrier.test.js`

**Interfaces:**
- Consumes : `Ariane.decalerJour`, `Ariane.jourValide`.
- Produces :
  - `Ariane.grilleMois(ancreISO) -> { moisDebut, moisFin, semaines: string[6][7] }` — jours ISO, lundi en tête, 42 cases (semaines qui débordent incluses).
  - `Ariane.grilleSemaine(ancreISO) -> { lundi, jours: string[7] }`
  - `Ariane.creneauDepuisDrop({ yRel, hauteurHeure, heureDebut, jourISO, dureeMin }) -> { debut, fin } | null` — `yRel` px depuis le haut de la zone horaire ; heure calée sur 15 min ; `dureeMin` défaut 60.

- [ ] **Step 1 — test qui échoue**

```js
/* --------------------- grilles & drop --------------------------- */

test('grilleMois : 6×7, lundi en tête, contient le mois', () => {
  const g = Ariane.grilleMois('2026-09-15');
  assert.equal(g.semaines.length, 6);
  assert.ok(g.semaines.every((s) => s.length === 7));
  // 2026-09-01 est un mardi → la 1re case est lundi 2026-08-31
  assert.equal(g.semaines[0][0], '2026-08-31');
  assert.ok(g.semaines.flat().includes('2026-09-15'));
  assert.equal(g.moisDebut, '2026-09-01');
  assert.equal(g.moisFin, '2026-09-30');
});

test('grilleSemaine : lundi de la semaine + 7 jours', () => {
  const g = Ariane.grilleSemaine('2026-09-03'); // jeudi
  assert.equal(g.lundi, '2026-08-31');
  assert.deepEqual(g.jours, ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
    '2026-09-04', '2026-09-05', '2026-09-06']);
});

test('creneauDepuisDrop : yRel → heure calée sur 15 min, +1 h', () => {
  const r = Ariane.creneauDepuisDrop({
    yRel: 130, hauteurHeure: 40, heureDebut: 8, jourISO: '2026-09-08' });
  // 130/40 = 3.25 h après 8:00 → 11:15
  assert.deepEqual(r, { debut: '2026-09-08T11:15', fin: '2026-09-08T12:15' });
});

test('creneauDepuisDrop : durée réglable, minuit franchi', () => {
  const r = Ariane.creneauDepuisDrop({
    yRel: 15.5 * 40, hauteurHeure: 40, heureDebut: 8, jourISO: '2026-09-08', dureeMin: 90 });
  // 8 + 15.5 = 23:30 ; +90 min → 01:00 le lendemain
  assert.deepEqual(r, { debut: '2026-09-08T23:30', fin: '2026-09-09T01:00' });
});

test('creneauDepuisDrop : jour invalide → null', () => {
  assert.equal(Ariane.creneauDepuisDrop({ yRel: 40, hauteurHeure: 40, heureDebut: 8, jourISO: 'x' }), null);
});
```

- [ ] **Step 2 — lancer, vérifier l'échec**

- [ ] **Step 3 — implémentation**

```js
  // Lundi (ISO) de la semaine contenant `iso`. (Identique à _lundiDe côté
  // MoteurFrise ; exposé ici en statique pur pour les grilles.)
  static lundiDeSemaine(iso) {
    const j = Ariane.jourValide(iso);
    if (!j) return null;
    const dow = new Date(j + 'T00:00:00Z').getUTCDay(); // 0 = dimanche
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

  // Position verticale du lâcher -> créneau. yRel : px sous le haut de la zone
  // horaire ; hauteurHeure : px d'une heure ; heureDebut : 1re heure affichée.
  static creneauDepuisDrop(opts) {
    const o = opts || {};
    const jour = Ariane.jourValide(o.jourISO);
    if (!jour || !(o.hauteurHeure > 0)) return null;
    const minutes = Math.max(0, (o.yRel / o.hauteurHeure) + (o.heureDebut || 0)) * 60;
    const cale = Math.round(minutes / 15) * 15;              // pas de 15 min
    const duree = o.dureeMin || 60;
    const iso = (base, min) => {
      const dec = Math.floor(min / 1440);
      const r = min - dec * 1440;
      const hh = String(Math.floor(r / 60)).padStart(2, '0');
      const mm = String(r % 60).padStart(2, '0');
      return (dec ? Ariane.decalerJour(base, dec) : base) + 'T' + hh + ':' + mm;
    };
    return { debut: iso(jour, cale), fin: iso(jour, cale + duree) };
  }
```

- [ ] **Step 4 — lancer les tests** → vert.

- [ ] **Step 5 — commit** : « Calendrier : grilles mois/semaine et creneauDepuisDrop (purs) ».

---

## Task 4 : `MoteurCalendrier` squelette + vue de base enregistrée

**Files:**
- Modify: `main.js` — constantes de module (~15623), nouvelle classe après `fabriquerVueFriseBase` (~fin région 14), `onload` `registerBasesView` (~3702), greffon `ecrireCreneau`.
- Modify: `styles.css` — bloc `.zfa-cal-*` (coquille).

**Interfaces:**
- Consumes : `obsidian.BasesView`, `MoteurFrise` (pour le patron), `greffon.tachesPourGantt`, `greffon.refDeChemin`.
- Produces :
  - `TYPE_VUE_BASE_CALENDRIER = 'ariane-calendrier'`
  - `class MoteurCalendrier` avec `constructor(greffon, racine, ctx)`, `dessiner()`, `detruire()`, `recentrer()`.
  - `fabriquerVueCalendrierBase(greffon)` → classe `BasesView` avec `onload`/`onunload`/`onResize`/`onDataUpdated`.
  - `greffon.ecrireCreneau(ref, debut, fin)` — écrit/efface `Tâche - Créneau`.

- [ ] **Step 1 — constantes**

Après `const TYPE_VUE_BASE_ARTIC = 'ariane-articulation';` :

```js
const TYPE_VUE_BASE_CALENDRIER = 'ariane-calendrier';
```

Après `DEFAUTS_FRISE = { ... }` :

```js
const DEFAUTS_CALENDRIER = {
  calMode: 'mois',            // 'mois' | 'semaine'
  agendaCalendrier: '',       // calendrier macOS cible (utilisé par le plan synchro)
  agendaFond: true,
  calHeureDebut: '07:00',
  calHeureFin: '21:00',
};
```

- [ ] **Step 2 — `greffon.ecrireCreneau`**

À côté de `ecrireDatesTaches` dans le greffon :

```js
  // Écrit (ou efface si debut/fin nuls) le créneau d'une tâche.
  async ecrireCreneau(ref, debut, fin) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === ref);
    if (!f) return false;
    const cle = this.cleT('creneau');
    const val = (debut && fin) ? Ariane.formatCreneau(debut, fin) : '';
    this.marquerEcriture(f.path);
    await this.app.fileManager.processFrontMatter(f, (x) => {
      if (val) x[cle] = val; else delete x[cle];
      x.modifie = new Date().toISOString().slice(0, 10);
    });
    return true;
  }
```

- [ ] **Step 3 — `MoteurCalendrier` squelette**

Après la fabrique de la frise (`fabriquerVueFriseBase` se termine), ajouter :

```js
class MoteurCalendrier {
  constructor(greffon, racine, contexte) {
    this.greffon = greffon;
    this.app = greffon.app;
    this.racine = racine;
    this.ctx = contexte;
    this._ancre = new Date().toISOString().slice(0, 10); // jour de référence
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
    this.dessinerBarreOutils(c);
    const grille = c.createDiv({ cls: 'zfa-cal-grille zfa-cal-' + this.mode });
    if (this.mode === 'semaine') this.dessinerSemaine(grille);
    else this.dessinerMois(grille);
  }

  dessinerBarreOutils(c) {
    const b = c.createDiv({ cls: 'zfa-cal-barre' });
    const nav = (delta, unite) => {
      this._ancre = unite === 'mois'
        ? Ariane.moisSuivantN(this._ancre, delta)
        : Ariane.decalerJour(this._ancre, delta * 7);
      this.dessiner();
    };
    const prec = b.createEl('button', { cls: 'zfa-cal-nav', text: '‹' });
    prec.onclick = () => nav(-1, this.mode === 'mois' ? 'mois' : 'sem');
    const auj = b.createEl('button', { cls: 'zfa-cal-nav', text: tr('Aujourd\'hui') });
    auj.onclick = () => { this._ancre = new Date().toISOString().slice(0, 10); this.dessiner(); };
    const suiv = b.createEl('button', { cls: 'zfa-cal-nav', text: '›' });
    suiv.onclick = () => nav(1, this.mode === 'mois' ? 'mois' : 'sem');
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
    return g.jours[0].slice(8) + '–' + g.jours[6].slice(8) + ' ' + (MOIS_COURTS[m - 1] || '') + ' ' + a;
  }

  dessinerMois(grille) { grille.createDiv({ cls: 'zfa-cal-vide', text: '…' }); }   // Task 5
  dessinerSemaine(grille) { grille.createDiv({ cls: 'zfa-cal-vide', text: '…' }); } // Task 6
}
```

Ajouter le helper `Ariane.moisSuivantN` près de `moisSuivant` (MoteurFrise a `moisSuivant` en méthode ; il faut un statique) :

```js
  static moisSuivantN(iso, n) {
    let [a, m] = String(iso).slice(0, 7).split('-').map(Number);
    m += n;
    a += Math.floor((m - 1) / 12);
    m = ((m - 1) % 12 + 12) % 12 + 1;
    return a + '-' + String(m).padStart(2, '0') + '-01';
  }
```

- [ ] **Step 4 — fabrique de vue**

Après `fabriquerVueFriseBase` :

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
        groupes: () => this.groupesParTache ? this.groupesParTache() : null,
        triNatif: () => (this.sortNatif ? this.sortNatif() : []),
      });
    }

    // Mêmes tâches que la frise : celles de la base + les ancêtres hors filtre.
    tachesDeLaBase() {
      const dedans = new Set();
      this._parRef = new Map();
      for (const e of (this.data && this.data.data) || []) {
        const chemin = e && e.file ? e.file.path : null;
        const ref = chemin ? this.greffon.refDeChemin(chemin) : null;
        if (!ref) continue;
        dedans.add(ref);
        this._parRef.set(ref, e);
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

- [ ] **Step 5 — enregistrement**

Dans `onload`, après le bloc `registerBasesView(TYPE_VUE_BASE_ARTIC, …)`, avant la `}` qui ferme `if (typeof this.registerBasesView === 'function')` :

```js
      const VueCal = fabriquerVueCalendrierBase(this);
      this.registerBasesView(TYPE_VUE_BASE_CALENDRIER, {
        name: tr('Calendrier'),
        icon: 'calendar-days',
        factory: (controleur, conteneur) => new VueCal(controleur, conteneur),
        options: () => [
          {
            type: 'dropdown', key: 'calMode', displayName: tr('Vue'), default: 'mois',
            options: { mois: tr('Mois'), semaine: tr('Semaine') },
          },
          { type: 'text', key: 'agendaCalendrier', displayName: tr('Calendrier macOS') },
          { type: 'toggle', key: 'agendaFond', displayName: tr('Afficher l’agenda macOS'), default: true },
          { type: 'text', key: 'calHeureDebut', displayName: tr('Heure de début (semaine)'), default: '07:00' },
          { type: 'text', key: 'calHeureFin', displayName: tr('Heure de fin (semaine)'), default: '21:00' },
        ],
      });
```

- [ ] **Step 6 — CSS coquille**

```css
/* ===================== Vue calendrier ============================== */
.zfa-cal { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.zfa-cal-barre {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-bottom: 1px solid var(--background-modifier-border); flex: none;
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
```

- [ ] **Step 7 — traductions**

Ajouter au dict `tr` (avant la `},` de fermeture) :

```js
    "Calendrier": "Calendar",
    "Le calendrier n’a pas pu se dessiner : ": "The calendar could not be drawn: ",
    "Calendrier macOS": "macOS calendar",
    "Afficher l’agenda macOS": "Show the macOS agenda",
    "Heure de début (semaine)": "Start hour (week)",
    "Heure de fin (semaine)": "End hour (week)",
    "Mois": "Month",
    "Semaine": "Week",
    "Vue": "View",
```

- [ ] **Step 8 — vérifier**

`node --check main.js` OK ; `node --test tests/*.test.js` vert ; déployer. Dans le coffre : ouvrir un `.base`, « Ajouter une vue » → **Calendrier** apparaît ; la vue montre la barre d'outils (‹ Aujourd'hui ›, titre, Mois/Semaine) et une grille vide. Naviguer change le titre.

- [ ] **Step 9 — commit** : « Calendrier : vue de base enregistrée + squelette du moteur ».

---

## Task 5 : Rendu mois — pastilles de tâches

**Files:** `main.js` (`MoteurCalendrier.dessinerMois` + aides), `styles.css`.

**Interfaces:**
- Consumes : `Ariane.grilleMois`, `Ariane.evenementDeTache`, `Ariane.tachesEnRetard`, `greffon.familleDe`, `greffon.settings.friseBarreCouleur`.
- Produces : `dessinerMois(grille)` complet ; clic sur pastille → `this.ouvrir(ref)`.

- [ ] **Step 1 — `ouvrir` + couleur (aides communes)**

Dans `MoteurCalendrier`, ajouter :

```js
  ouvrir(ref, nouveau) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === ref);
    if (f) this.app.workspace.getLeaf(!!nouveau).openFile(f);
  }

  couleurTache(t) {
    const parStatut = (this.greffon.settings.friseBarreCouleur || 'famille') === 'statut';
    if (parStatut) return Ariane.COULEURS_GANTT[t.statut] || 'var(--text-faint)';
    return (this.greffon.familleDe(t.famille) || {}).couleur || 'var(--text-faint)';
  }
```

- [ ] **Step 2 — `dessinerMois`**

Remplacer le stub par :

```js
  dessinerMois(hote) {
    const g = Ariane.grilleMois(this._ancre);
    const auj = new Date().toISOString().slice(0, 10);
    const enRetard = Ariane.tachesEnRetard(this._taches, auj);
    // Événement par tâche, indexé par jour touché.
    const parJour = new Map();       // jourISO -> [{ t, ev }]
    for (const t of this._taches) {
      const ev = Ariane.evenementDeTache(t);
      if (!ev) continue;
      let j = ev.debut.slice(0, 10);
      const finEx = ev.allDay ? ev.fin.slice(0, 10) : Ariane.decalerJour(ev.fin.slice(0, 10), 1);
      let garde = 0;
      while (j < finEx && garde < 400) {
        if (!parJour.has(j)) parJour.set(j, []);
        parJour.get(j).push({ t, ev });
        j = Ariane.decalerJour(j, 1);
        garde += 1;
      }
    }

    const grille = hote.createDiv({ cls: 'zfa-cal-mois-grille' });
    const jj = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    for (const d of jj) grille.createDiv({ cls: 'zfa-cal-jour-entete', text: tr(d) });
    for (const semaine of g.semaines) {
      for (const jour of semaine) {
        const cell = grille.createDiv({ cls: 'zfa-cal-cellule' });
        if (jour === auj) cell.addClass('est-aujourdhui');
        if (jour.slice(0, 7) !== g.moisDebut.slice(0, 7)) cell.addClass('hors-mois');
        cell.dataset.jour = jour;
        cell.createDiv({ cls: 'zfa-cal-quantieme', text: String(Number(jour.slice(8, 10))) });
        for (const { t, ev } of (parJour.get(jour) || [])) {
          const p = cell.createDiv({ cls: 'zfa-cal-pastille' + (ev.allDay ? ' est-jour' : ' est-horaire') });
          if (enRetard.has(t.ref)) p.addClass('est-retard');
          p.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
          const h = ev.allDay ? '' : ev.debut.slice(11, 16) + ' ';
          p.createSpan({ text: h + (t.intitule || t.ref) });
          p.title = t.ref + ' · ' + (t.intitule || '');
          p.addEventListener('click', (e) => { e.stopPropagation(); this.ouvrir(t.ref, e.metaKey || e.ctrlKey); });
          p.dataset.ref = t.ref;
        }
      }
    }
  }
```

- [ ] **Step 3 — CSS**

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

- [ ] **Step 4 — vérifier** : sur un `.base` de tâches réel, la grille du mois montre les tâches sur leurs jours ; une plage `début→échéance` apparaît sur chaque jour couvert ; clic ouvre la note ; navigation OK ; le filtre de la base restreint bien les tâches.

- [ ] **Step 5 — commit** : « Calendrier : rendu de la vue mois ».

---

## Task 6 : Rendu semaine — axe horaire

**Files:** `main.js` (`dessinerSemaine` + aides), `styles.css`.

**Interfaces:**
- Consumes : `Ariane.grilleSemaine`, `Ariane.evenementDeTache`, `this.couleurTache`.
- Produces : `dessinerSemaine(grille)` : bandeau « journée entière » + colonnes horaires ; blocs `horaire` positionnés ; clic → `ouvrir`.

- [ ] **Step 1 — `dessinerSemaine`**

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
    const PXH = 42;                                   // px par heure
    this._pxHeure = PXH; this._hDeb = hDeb; this._joursSemaine = g.jours;

    const jour = new Map(g.jours.map((j) => [j, []]));      // jourISO -> events horaires
    const toutJour = new Map(g.jours.map((j) => [j, []]));  // jourISO -> events journée
    for (const t of this._taches) {
      const ev = Ariane.evenementDeTache(t);
      if (!ev) continue;
      if (ev.allDay) {
        let j = ev.debut.slice(0, 10);
        while (j < ev.fin.slice(0, 10)) {
          if (toutJour.has(j)) toutJour.get(j).push({ t, ev });
          j = Ariane.decalerJour(j, 1);
        }
      } else {
        const j = ev.debut.slice(0, 10);
        if (jour.has(j)) jour.get(j).push({ t, ev });
      }
    }

    // Bandeau journée entière
    const bandeau = hote.createDiv({ cls: 'zfa-cal-bandeau' });
    bandeau.createDiv({ cls: 'zfa-cal-gouttiere' });
    for (const j of g.jours) {
      const col = bandeau.createDiv({ cls: 'zfa-cal-bandeau-jour' + (j === auj ? ' est-aujourdhui' : '') });
      col.dataset.jour = j;
      for (const { t } of toutJour.get(j)) {
        const p = col.createDiv({ cls: 'zfa-cal-pastille est-jour' });
        p.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
        p.textContent = t.intitule || t.ref;
        p.addEventListener('click', (e) => this.ouvrir(t.ref, e.metaKey || e.ctrlKey));
        p.dataset.ref = t.ref;
      }
    }

    // Corps horaire
    const corps = hote.createDiv({ cls: 'zfa-cal-corps' });
    const axe = corps.createDiv({ cls: 'zfa-cal-axe' });
    for (let h = Math.ceil(hDeb); h < hFin; h += 1) {
      const l = axe.createDiv({ cls: 'zfa-cal-axe-heure' });
      l.style.top = ((h - hDeb) * PXH) + 'px';
      l.textContent = String(h) + ' h';
    }
    axe.style.height = ((hFin - hDeb) * PXH) + 'px';
    for (const j of g.jours) {
      const col = corps.createDiv({ cls: 'zfa-cal-col' + (j === auj ? ' est-aujourdhui' : '') });
      col.dataset.jour = j;
      col.style.height = ((hFin - hDeb) * PXH) + 'px';
      for (let h = Math.ceil(hDeb); h < hFin; h += 1) {
        const t = col.createDiv({ cls: 'zfa-cal-trait' });
        t.style.top = ((h - hDeb) * PXH) + 'px';
      }
      for (const { t, ev } of jour.get(j)) {
        const y0 = (Number(ev.debut.slice(11, 13)) + Number(ev.debut.slice(14, 16)) / 60 - hDeb) * PXH;
        const finH = ev.fin.slice(0, 10) === j
          ? Number(ev.fin.slice(11, 13)) + Number(ev.fin.slice(14, 16)) / 60
          : 24;
        const y1 = (finH - hDeb) * PXH;
        const bloc = col.createDiv({ cls: 'zfa-cal-bloc' });
        bloc.style.top = Math.max(0, y0) + 'px';
        bloc.style.height = Math.max(14, y1 - y0) + 'px';
        bloc.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
        bloc.createSpan({ text: ev.debut.slice(11, 16) + ' ' + (t.intitule || t.ref) });
        bloc.dataset.ref = t.ref;
        bloc.addEventListener('click', (e) => this.ouvrir(t.ref, e.metaKey || e.ctrlKey));
      }
    }
  }
```

- [ ] **Step 2 — CSS**

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

- [ ] **Step 3 — vérifier** : bascule Semaine → colonnes L→D, axe horaire, blocs `créneau` (créer un `Tâche - Créneau: 2026-09-08 14:00-16:00` à la main dans une note pour tester), tâches `début→échéance` dans le bandeau du haut, colonne du jour teintée.

- [ ] **Step 4 — commit** : « Calendrier : rendu de la vue semaine ».

---

## Task 7 : Gestes internes (déplacer / redimensionner)

**Files:** `main.js` (`MoteurCalendrier`).

**Interfaces:**
- Consumes : `greffon.ecrireCreneau`, `greffon.ecrireDatesTaches`, `Ariane.creneauDepuisDrop`.
- Produces : gestes souris sur pastilles / blocs.

- [ ] **Step 1 — report d'index + redraw**

Ajouter à `MoteurCalendrier` :

```js
  async _apresEcriture(ref, apercu) {
    if (!this._enAttente) this._enAttente = new Map();
    if (apercu) this._enAttente.set(ref, apercu);
    this.dessiner();
  }
```

Et dans `dessinerVraiment`, après `this._taches = …`, appliquer le report comme la frise :

```js
    if (this._enAttente && this._enAttente.size) {
      for (const t of this._taches) {
        const p = this._enAttente.get(t.ref);
        if (!p) continue;
        if (JSON.stringify([t.debut, t.echeance, t.creneau]) === JSON.stringify(p.cible)) {
          this._enAttente.delete(t.ref);
        } else {
          if (p.debut !== undefined) t.debut = p.debut;
          if (p.echeance !== undefined) t.echeance = p.echeance;
          if (p.creneau !== undefined) t.creneau = p.creneau;
        }
      }
    }
```

- [ ] **Step 2 — vue mois : déplacer une pastille**

Dans `dessinerMois`, sur chaque `p` (pastille), après le `click` :

```js
          p.setAttribute('draggable', 'true');
          p.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.setData('text/x-ariane-cal-interne', t.ref + '|' + jour);
            ev.dataTransfer.effectAllowed = 'move';
          });
```

Sur chaque `cell` :

```js
        cell.addEventListener('dragover', (ev) => {
          if (ev.dataTransfer.types.includes('text/x-ariane-cal-interne')) { ev.preventDefault(); cell.addClass('zfa-cal-cible'); }
        });
        cell.addEventListener('dragleave', () => cell.removeClass('zfa-cal-cible'));
        cell.addEventListener('drop', async (ev) => {
          cell.removeClass('zfa-cal-cible');
          const brut = ev.dataTransfer.getData('text/x-ariane-cal-interne');
          if (!brut) return;
          ev.preventDefault();
          const [ref, jourSrc] = brut.split('|');
          const n = Ariane.ecartJours(jourSrc, cell.dataset.jour);
          if (!n) return;
          const t = this._taches.find((x) => x.ref === ref);
          if (!t) return;
          const ch = [];
          const nd = t.debut ? Ariane.decalerJour(t.debut, n) : '';
          const ne = t.echeance ? Ariane.decalerJour(t.echeance, n) : '';
          if (t.creneau) {
            const cr = Ariane.parseCreneau(t.creneau);
            if (cr) {
              await this.greffon.ecrireCreneau(ref,
                Ariane.decalerJour(cr.debut.slice(0, 10), n) + 'T' + cr.debut.slice(11),
                Ariane.decalerJour(cr.fin.slice(0, 10), n) + 'T' + cr.fin.slice(11));
            }
          }
          if (nd || ne) {
            ch.push({ ref, debut: nd, echeance: ne });
            await this.greffon.ecrireDatesTaches(ch);
          }
          this._apresEcriture(ref, { debut: nd, echeance: ne,
            cible: [nd, ne, t.creneau] });
        });
```

- [ ] **Step 3 — vue semaine : déplacer / redimensionner un bloc**

Dans `dessinerSemaine`, sur chaque `bloc` :

```js
        bloc.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t, ev, j));
        const poignee = bloc.createDiv({ cls: 'zfa-cal-poignee' });
        poignee.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t, ev, j, 'fin'));
```

Nouvelle méthode :

```js
  _saisirBloc(e, bloc, t, ev, jourCol, mode) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const PXH = this._pxHeure;
    const y0 = e.clientY;
    const topDep = parseFloat(bloc.style.top) || 0;
    const hDep = parseFloat(bloc.style.height) || 20;
    let bouge = false;
    const cal = (v) => Math.round(v / (PXH / 4)) * (PXH / 4);   // pas de 15 min
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
      const minDeb = (top / PXH + this._hDeb) * 60;
      const debut = Ariane.creneauDepuisDrop({ yRel: top, hauteurHeure: PXH,
        heureDebut: this._hDeb, jourISO: jourCol, dureeMin: Math.max(15, (haut / PXH) * 60) });
      if (!debut) { this.dessiner(); return; }
      await this.greffon.ecrireCreneau(t.ref, debut.debut, debut.fin);
      this._apresEcriture(t.ref, { creneau: Ariane.formatCreneau(debut.debut, debut.fin),
        cible: [t.debut, t.echeance, Ariane.formatCreneau(debut.debut, debut.fin)] });
    };
    document.addEventListener('pointermove', bouger);
    document.addEventListener('pointerup', lacher);
  }
```

CSS :

```css
.zfa-cal-poignee { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; cursor: ns-resize; }
.zfa-cal-cible { box-shadow: inset 0 0 0 2px var(--interactive-accent); }
```

- [ ] **Step 4 — vérifier** : mois → glisser une pastille d'un jour à l'autre décale les dates (et le créneau s'il existe) ; semaine → glisser un bloc le repositionne à l'heure calée, tirer la poignée du bas change la fin ; pas de rebond (report d'index).

- [ ] **Step 5 — commit** : « Calendrier : gestes de déplacement et de redimensionnement ».

---

## Task 8 : Glisser-déposer depuis la frise (créer un créneau)

**Files:** `main.js` — `MoteurFrise.dessinerBarres` (~17060) et `dessinerColonneGauche` (~16447), `MoteurCalendrier` (cibles de drop), `styles.css`.

**Interfaces:**
- Consumes : `Ariane.creneauDepuisDrop`, `greffon.ecrireCreneau`, `greffon.ecrireDatesTaches`, `greffon.refDeChemin`, `Ariane.refDeLien`.
- Produces : barres de frise `draggable` posant `text/x-ariane-tache` ; grille calendrier acceptant ce type + un lien de note.

- [ ] **Step 1 — source côté frise**

Dans `dessinerBarres`, sur le `groupe` de chaque barre (après le câblage `contextmenu`) :

```js
      groupe.setAttribute('draggable', 'true');
      groupe.addEventListener('dragstart', (ev) => {
        // Ne pas armer si le geste part d'une poignée / d'un connecteur : ceux-ci
        // ont leur propre pointerdown qui appelle preventDefault trop tard pour
        // le drag natif, d'où ce test explicite.
        if (ev.target.closest('.zfa-gantt-poignee, .zfa-gantt-connecteur')) { ev.preventDefault(); return; }
        ev.dataTransfer.setData('text/x-ariane-tache', l.ref);
        ev.dataTransfer.setData('text/plain', '[[' + l.ref + ']]');
        ev.dataTransfer.effectAllowed = 'copy';
      });
```

Idem dans `dessinerColonneGauche`, sur chaque `rangee` (`.bases-tr.zfa-gantt-libelle`) :

```js
      rangee.setAttribute('draggable', 'true');
      rangee.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/x-ariane-tache', l.ref);
        ev.dataTransfer.setData('text/plain', '[[' + l.ref + ']]');
        ev.dataTransfer.effectAllowed = 'copy';
      });
```

Vérifier que `saisir`/`saisirJalon` (pointerdown) ne cassent pas : le drag HTML5 démarre après un mouvement, `pointerdown` a déjà `preventDefault` sur les poignées ; sur le corps de la barre, un vrai glissé souris déclenche `saisir` (déplacement de dates) tandis qu'un glissé « natif » (drag) déclenche `dragstart`. Les deux coexistent dans la pratique ; si un conflit apparaît, n'armer `draggable` que sur `dessinerColonneGauche` (la ligne du tableau) et retirer de `dessinerBarres`. **Décision par défaut : garder les deux, retirer de `dessinerBarres` seulement si le test manuel montre un blocage du déplacement horizontal.**

- [ ] **Step 2 — résolution d'un lâcher externe**

Dans `MoteurCalendrier`, helper :

```js
  _refDepuisDrop(dt) {
    let ref = dt.getData('text/x-ariane-tache');
    if (ref) return ref.trim();
    const txt = (dt.getData('text/plain') || '').trim();
    if (!txt) return '';
    const lien = Ariane.refDeLien(txt);                 // « [[T-1|x]] » -> « T-1 »
    if (this._taches.some((t) => t.ref === lien)) return lien;
    const m = txt.match(/([^/\\]+)\.md/);               // chemin
    if (m && this._taches.some((t) => t.ref === m[1])) return m[1];
    return this.greffon.refDeChemin(txt) || '';
  }
```

- [ ] **Step 3 — cible côté calendrier (mois)**

Étendre le `drop` des cellules mois (Task 7 Step 2) : si pas de `text/x-ariane-cal-interne`, tenter `_refDepuisDrop` et reprogrammer `début`+`échéance` sur `cell.dataset.jour` :

```js
        cell.addEventListener('dragover', (ev) => { ev.preventDefault(); cell.addClass('zfa-cal-cible'); });
        // dans le drop, avant le return final :
          if (!brut) {
            const ref = this._refDepuisDrop(ev.dataTransfer);
            if (!ref) return;
            ev.preventDefault();
            const t = this._taches.find((x) => x.ref === ref);
            const j = cell.dataset.jour;
            await this.greffon.ecrireDatesTaches([{ ref, debut: j, echeance: j }]);
            this._apresEcriture(ref, { debut: j, echeance: j, cible: [j, j, t ? t.creneau : ''] });
            return;
          }
```

- [ ] **Step 4 — cible côté calendrier (semaine)**

Sur chaque `col` de `dessinerSemaine` :

```js
      col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.addClass('zfa-cal-cible'); });
      col.addEventListener('dragleave', () => col.removeClass('zfa-cal-cible'));
      col.addEventListener('drop', async (ev) => {
        col.removeClass('zfa-cal-cible');
        const ref = this._refDepuisDrop(ev.dataTransfer);
        if (!ref) return;
        ev.preventDefault();
        const r = col.getBoundingClientRect();
        const cr = Ariane.creneauDepuisDrop({ yRel: ev.clientY - r.top,
          hauteurHeure: this._pxHeure, heureDebut: this._hDeb, jourISO: col.dataset.jour });
        if (!cr) return;
        await this.greffon.ecrireCreneau(ref, cr.debut, cr.fin);
        this._apresEcriture(ref, { creneau: Ariane.formatCreneau(cr.debut, cr.fin),
          cible: [undefined, undefined, Ariane.formatCreneau(cr.debut, cr.fin)] });
      });
```

- [ ] **Step 5 — CSS** : `.zfa-cal-cible` déjà posé en Task 7.

- [ ] **Step 6 — vérifier** : deux volets (frise en haut, calendrier en bas via scission native). Glisser une barre de la frise dans une colonne de la vue semaine → `Tâche - Créneau` apparaît dans la note, un bloc s'affiche à l'heure du lâcher. Glisser sur la vue mois → `début`/`échéance` calés sur le jour. Glisser un `[[T-…]]` depuis l'explorateur → même effet. Le déplacement horizontal d'une barre dans la frise fonctionne toujours.

- [ ] **Step 7 — commit** : « Calendrier : glisser une tâche de la frise pour poser un créneau ».

---

## Task 9 : README

**Files:** `README.md`, `README.fr.md`.

- [ ] **Step 1 — FR** : dans la section « ✅ Tâches », après le paragraphe « Frise (Gantt) et Articulation », ajouter :

```markdown
### Vue calendrier

Une troisième vue de base, `ariane-calendrier` : grille **mois** ou **semaine**.
Les tâches s'y posent sur leurs dates — plage `début → échéance` en journée
entière, ou **bloc horaire** si la tâche porte un `Créneau` (`2026-09-08
14:00-16:00`). Glisser une pastille la reprogramme ; en vue semaine, glisser ou
redimensionner un bloc réécrit le créneau. **Glisser une barre depuis la frise**
(ou un lien `[[T26-001]]` depuis n'importe où) sur le calendrier crée un créneau
à l'heure du lâcher. Empilez frise et calendrier en scindant un volet.
```

- [ ] **Step 2 — EN** : équivalent dans `README.md`.

- [ ] **Step 3 — commit** : « README : vue calendrier ».

---

## Self-Review (à faire après rédaction — déjà passé)

- **Couverture spec** : §2 (creneau, evenementDeTache) → T1/T2 ; §3.1 options → T4 ; §3.2 rendu → T5/T6 ; §3.3 gestes → T7 ; §3.4 DnD → T8. §4 (EventKit) et §5 (réglages Agenda) : **hors périmètre, plan séparé** — `agenda-id` est posé (T1) mais inutilisé ici.
- **Placeholders** : les stubs `dessinerMois`/`dessinerSemaine` de T4 sont explicitement remplacés en T5/T6.
- **Cohérence des types** : `evenementDeTache` rend `{genre, debut, fin, allDay}` partout ; `creneauDepuisDrop` rend `{debut, fin}` ISO datetime partout ; `ecrireCreneau(ref, debut, fin)` signature unique.
- **Risque connu** (T8 Step 1) : cohabitation `draggable` natif / `pointerdown` `saisir` sur la même barre — décision de repli documentée (ne garder `draggable` que sur la ligne du tableau).

## Execution Handoff

Plan enregistré. Deux options d'exécution :
1. **Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre chaque.
2. **Inline** — exécution en session avec points de contrôle.
