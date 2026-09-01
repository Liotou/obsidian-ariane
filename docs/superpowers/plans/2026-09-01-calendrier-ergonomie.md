# Refonte ergonomique de la vue calendrier — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la vue de base `ariane-calendrier` réellement utilisable : cartes portant les propriétés visibles de la base, barre d'outils fine, navigation carrousel au trackpad, bandeau « tout le jour » compact, bouton « + Nouveau », menus contextuels, et fin du glisser cassé des barres SVG.

**Architecture:** Tout tient dans `main.js` (fichier unique, sans build), `styles.css`, `tests/calendrier.test.js`. On enrichit `MoteurCalendrier` (`main.js:20154`) et `fabriquerVueCalendrierBase` (`main.js:20491`) en copiant le pont Bases déjà écrit pour la frise (`fabriquerVueFriseBase`, `main.js:18327`). La logique non triviale est extraite en statiques purs `Ariane.*` testables ; le DOM est vérifié par relecture + `node --check` + déploiement, le visuel par l'utilisateur.

**Tech Stack:** JavaScript ES2020 sans transpilation, API Obsidian (`obsidian.BasesView`, `obsidian.Menu`, `obsidian.setIcon`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-01-calendrier-ergonomie-design.md`

## Global Constraints

- `main.js` : fichier unique ~20 k lignes, `'use strict'`, **sans build**, contient des octets NUL → `grep -a` obligatoire, jamais `sed` en place. Éditer par remplacement de chaîne exacte.
- Déploiement : `cp main.js styles.css manifest.json "/Users/equiriconi/Obsidian Vault/.obsidian/plugins/obsidian-ariane/"`. **Ne jamais toucher `data.json`.**
- Tests : `node --test tests/*.test.js`. Base de départ : **288 verts**. Aucun test ne doit disparaître.
- Commits : message écrit dans un fichier puis `git commit -F <fichier>`, dernière ligne exactement `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Un **dépôt** sur le calendrier crée toujours un `Créneau` ; il ne modifie jamais début/échéance. Les seules écritures de dates viennent des menus contextuels explicites (Task 9).
- Rendu DOM et vérification visuelle dans Obsidian : **différés à l'utilisateur**. Les tâches DOM se valident par `node --check main.js`, `node --test`, `cp` de déploiement, et relecture de code.
- `tr(...)` = fonction de traduction du greffon. Ne **jamais** nommer une variable locale `tr` (masque la fonction → exception au dessin). Utiliser `jr`, `li`, etc.
- Nouveaux statiques purs : les ajouter dans la région des statiques créneaux/gantt, juste après `Ariane.creneauxDeTache` (~`main.js:5040`).

---

### Task 1: Statiques purs (comparateurs, ancre carrousel, jour semé, lignes de propriétés)

**Files:**
- Modify: `main.js` — ajouter 5 statiques après `Ariane.creneauxDeTache` (~ligne 5040) ; repointer la branche `tri === 'multi'` de `disposerGantt` (`main.js:5254`-`5265`).
- Test: `tests/calendrier.test.js` (ajouts en fin de fichier).

**Interfaces:**
- Consumes: rien (statiques purs).
- Produces:
  - `Ariane.comparerMulti(ma, mb)` → `number`. `ma`/`mb` : `Array<{ v, s }>` (`s` = `1` ASC ou `-1` DESC). Valeur vide toujours en dernier. `0` si égal.
  - `Ariane.comparerEmpilement(x, y)` → `number`. `x`/`y` : `{ ev: { allDay:boolean, debut:string }, t: { ref:string, _multi?:Array<{v,s}> } }`. Ordre : tout-le-jour avant horaire, puis `ev.debut` croissant, puis `comparerMulti(t._multi)`, puis `t.ref` (numérique).
  - `Ariane.ancreCarrousel(ancre, mode, sens)` → `string` ISO `YYYY-MM-DD`. `mode` ∈ `'mois'|'semaine'`, `sens` ∈ `-1|0|1`. `0` → `ancre` inchangé.
  - `Ariane.jourSeme(jourSel, periodeDebut, periodeFin, aujourd)` → `string` ISO. `jourSel` s'il est non vide, sinon `aujourd` s'il est dans `[periodeDebut, periodeFin]`, sinon `periodeDebut`.
  - `Ariane.lignesProprietes(paires, intitule, maxLignes)` → `Array<{ nom, valeur }>`. `paires` : `Array<{ cle, nom, valeur }>`. Écarte `cle` ∈ `{file, file.name, file.link, file.path}`, `valeur` vide (après `trim`), `valeur === intitule` (après `trim`). Coupe à `maxLignes` ; `maxLignes <= 0` → `[]`.

- [ ] **Step 1: Écrire les tests (échouent)**

Ajouter en fin de `tests/calendrier.test.js` :

```js
// --- Task 1 : statiques purs de la refonte calendrier ---

test('comparerMulti : critère unique ASC / DESC, vide en dernier', () => {
  assert.ok(Ariane.comparerMulti([{ v: 'b', s: 1 }], [{ v: 'a', s: 1 }]) > 0);
  assert.ok(Ariane.comparerMulti([{ v: 'b', s: -1 }], [{ v: 'a', s: -1 }]) < 0);
  assert.ok(Ariane.comparerMulti([{ v: '', s: 1 }], [{ v: 'a', s: 1 }]) > 0);
  assert.equal(Ariane.comparerMulti([{ v: 'a', s: 1 }], [{ v: 'a', s: 1 }]), 0);
});

test('comparerMulti : le 2e critère départage le 1er égal', () => {
  const a = [{ v: 'x', s: 1 }, { v: '2', s: 1 }];
  const b = [{ v: 'x', s: 1 }, { v: '10', s: 1 }];
  assert.ok(Ariane.comparerMulti(a, b) < 0); // numeric: 2 < 10
});

test('comparerEmpilement : tout-le-jour avant horaire, puis heure, puis ref', () => {
  const jour = { ev: { allDay: true, debut: '2026-09-08' }, t: { ref: 'T-002' } };
  const tot = { ev: { allDay: false, debut: '2026-09-08T09:00' }, t: { ref: 'T-001' } };
  assert.ok(Ariane.comparerEmpilement(jour, tot) < 0);
  const a = { ev: { allDay: false, debut: '2026-09-08T09:00' }, t: { ref: 'T-002' } };
  const b = { ev: { allDay: false, debut: '2026-09-08T11:00' }, t: { ref: 'T-001' } };
  assert.ok(Ariane.comparerEmpilement(a, b) < 0);
  const m = { ev: { allDay: false, debut: '2026-09-08T09:00' }, t: { ref: 'T-002' } };
  const n = { ev: { allDay: false, debut: '2026-09-08T09:00' }, t: { ref: 'T-001' } };
  assert.ok(Ariane.comparerEmpilement(m, n) > 0); // T-002 après T-001
});

test('comparerEmpilement : respecte le tri natif (_multi) avant la ref', () => {
  const a = { ev: { allDay: false, debut: '2026-09-08T09:00' },
    t: { ref: 'T-001', _multi: [{ v: 'z', s: 1 }] } };
  const b = { ev: { allDay: false, debut: '2026-09-08T09:00' },
    t: { ref: 'T-999', _multi: [{ v: 'a', s: 1 }] } };
  assert.ok(Ariane.comparerEmpilement(a, b) > 0); // 'z' après 'a' malgré T-001 < T-999
});

test('ancreCarrousel : mois ±1, semaine ±1, sens 0', () => {
  assert.equal(Ariane.ancreCarrousel('2026-12-15', 'mois', 1), '2027-01-15');
  assert.equal(Ariane.ancreCarrousel('2026-01-15', 'mois', -1), '2025-12-15');
  assert.equal(Ariane.ancreCarrousel('2026-09-01', 'semaine', 1), '2026-09-08');
  assert.equal(Ariane.ancreCarrousel('2026-09-01', 'semaine', -1), '2026-08-25');
  assert.equal(Ariane.ancreCarrousel('2026-09-01', 'mois', 0), '2026-09-01');
});

test('jourSeme : jourSel > aujourd-dans-période > premier jour', () => {
  assert.equal(Ariane.jourSeme('2026-09-10', '2026-09-01', '2026-09-30', '2026-09-15'), '2026-09-10');
  assert.equal(Ariane.jourSeme('', '2026-09-01', '2026-09-30', '2026-09-15'), '2026-09-15');
  assert.equal(Ariane.jourSeme('', '2026-10-01', '2026-10-31', '2026-09-15'), '2026-10-01');
  assert.equal(Ariane.jourSeme('', '2026-09-01', '2026-09-30', '2026-09-01'), '2026-09-01');
});

test('lignesProprietes : écarte file*, vide, doublon du titre ; garde l\'ordre ; coupe', () => {
  const paires = [
    { cle: 'file.name', nom: 'Nom', valeur: 'T-001' },
    { cle: 'note.intitule', nom: 'Intitulé', valeur: 'Rédiger le rapport' },
    { cle: 'note.statut', nom: 'Statut', valeur: 'en cours' },
    { cle: 'note.priorite', nom: 'Priorité', valeur: '' },
    { cle: 'note.famille', nom: 'Famille', valeur: 'Édition' },
  ];
  assert.deepEqual(
    Ariane.lignesProprietes(paires, 'Rédiger le rapport', 5),
    [{ nom: 'Statut', valeur: 'en cours' }, { nom: 'Famille', valeur: 'Édition' }]);
  assert.deepEqual(Ariane.lignesProprietes(paires, 'Rédiger le rapport', 1),
    [{ nom: 'Statut', valeur: 'en cours' }]);
  assert.deepEqual(Ariane.lignesProprietes(paires, 'x', 0), []);
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `node --test tests/calendrier.test.js`
Expected: FAIL — `Ariane.comparerMulti is not a function`, etc.

- [ ] **Step 3: Implémenter les 5 statiques**

Insérer dans `main.js` juste après la fermeture de `static creneauxDeTache` (~ligne 5040, avant le commentaire du statique suivant) :

```js
  // Compare deux listes de critères de tri natif Bases : { v, s(ens 1|-1) }.
  // Valeur vide toujours après, quel que soit le sens. 0 si tout égal.
  // Reprend, en le mutualisant, le corps de la branche « multi » de disposerGantt.
  static comparerMulti(ma, mb) {
    const a = ma || [];
    const b = mb || [];
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const ka = String(a[i] && a[i].v != null ? a[i].v : '');
      const kb = String(b[i] && b[i].v != null ? b[i].v : '');
      if (!ka !== !kb) return ka ? -1 : 1;
      const c = ka.localeCompare(kb, 'fr', { sensitivity: 'base', numeric: true });
      if (c) return c * ((a[i] && a[i].s === -1) ? -1 : 1);
    }
    return 0;
  }

  // Ordre d'empilement des événements dans une cellule/colonne du calendrier :
  // tout-le-jour d'abord, puis heure de début, puis tri natif de la base, puis ref.
  static comparerEmpilement(x, y) {
    const ax = x.ev.allDay ? 0 : 1;
    const ay = y.ev.allDay ? 0 : 1;
    if (ax !== ay) return ax - ay;
    if (x.ev.debut !== y.ev.debut) return x.ev.debut < y.ev.debut ? -1 : 1;
    const r = Ariane.comparerMulti(x.t._multi, y.t._multi);
    if (r) return r;
    return String(x.t.ref).localeCompare(String(y.t.ref), 'fr', { numeric: true });
  }

  // Ancre voisine pour le carrousel : ±1 mois ou ±1 semaine. sens 0 = sur place.
  static ancreCarrousel(ancre, mode, sens) {
    if (!sens) return ancre;
    return mode === 'mois'
      ? Ariane.moisSuivantN(ancre, sens)
      : Ariane.decalerJour(ancre, sens * 7);
  }

  // Jour à pré-dater pour « + Nouveau » : le jour sélectionné s'il existe,
  // sinon aujourd'hui s'il tombe dans la période affichée, sinon son 1er jour.
  static jourSeme(jourSel, periodeDebut, periodeFin, aujourd) {
    if (jourSel) return jourSel;
    if (aujourd >= periodeDebut && aujourd <= periodeFin) return aujourd;
    return periodeDebut;
  }

  // Lignes de propriété à écrire sur une carte : on saute la colonne fichier,
  // les valeurs vides et celle qui répète l'intitulé ; on coupe à maxLignes.
  static lignesProprietes(paires, intitule, maxLignes) {
    if (!Array.isArray(paires) || maxLignes <= 0) return [];
    const exclues = new Set(['file', 'file.name', 'file.link', 'file.path']);
    const titre = String(intitule || '').trim();
    const out = [];
    for (const p of paires) {
      if (!p || exclues.has(p.cle)) continue;
      const v = p.valeur == null ? '' : String(p.valeur).trim();
      if (!v || v === titre) continue;
      out.push({ nom: p.nom, valeur: v });
      if (out.length >= maxLignes) break;
    }
    return out;
  }
```

- [ ] **Step 4: Repointer la branche « multi » de la frise**

Dans `main.js:5254`-`5265`, remplacer le bloc `} else if (tri === 'multi') { … }` par :

```js
      } else if (tri === 'multi') {
        // Tri natif de la base : critères { v, s } préparés par la vue.
        const r = Ariane.comparerMulti(a._multi, b._multi);
        if (r) return r;
      }
```

(But : une seule copie du comparateur. Les tests `gantt.test.js` couvrent déjà ce tri et doivent rester verts.)

- [ ] **Step 5: Lancer toute la suite**

Run: `node --test tests/*.test.js`
Expected: PASS — 288 + 7 = **295**. Vérifier qu'aucun test `gantt`/`regroupement` n'a régressé.

- [ ] **Step 6: node --check + commit**

```bash
node --check main.js
git add main.js tests/calendrier.test.js
git commit -F <message-file>
```

Message : `Calendrier : statiques purs (comparateurs, ancre carrousel, jour semé, lignes de propriétés)`

---

### Task 2: Retrait du `draggable` des barres SVG de la frise

**Files:**
- Modify: `main.js` — supprimer `groupe.setAttribute('draggable', 'true')` + son `dragstart` (`main.js:17564`-`17570`).

**Interfaces:**
- Consumes: rien.
- Produces: rien (suppression). Le glissé « frise → calendrier » passe désormais **uniquement** par la ligne de la colonne de gauche (`main.js:17045`-`17050`, inchangée).

- [ ] **Step 1: Vérifier qu'aucun test n'assoit le dragstart de la barre**

Run: `grep -an "x-ariane-tache\|dragstart" tests/*.js`
Expected: aucune assertion sur le `dragstart` d'un `<g>` SVG (seuls des tests de `_refDepuisDrop` / payload peuvent exister, ils lisent la charge, pas la source).

- [ ] **Step 2: Supprimer le bloc**

Dans `main.js`, retirer exactement ces lignes (aux alentours de 17561-17570), en gardant le commentaire réduit :

```js
      // Source de glissé vers le calendrier (mêmes charges utiles que la ligne du
      // tableau). On laisse passer les gestes sur les poignées et connecteurs :
      // ceux-là restent au glissé-pointeur de la frise (dates, liens de lignée).
      groupe.setAttribute('draggable', 'true');
      groupe.addEventListener('dragstart', (ev) => {
        if (ev.target.closest('.zfa-gantt-poignee, .zfa-gantt-connecteur')) { ev.preventDefault(); return; }
        ev.dataTransfer.setData('text/x-ariane-tache', l.ref);
        ev.dataTransfer.setData('text/plain', '[[' + l.ref + ']]');
        ev.dataTransfer.effectAllowed = 'copy';
      });
```

Remplacer par :

```js
      // Le glissé « frise → calendrier » part de la ligne de la colonne de
      // gauche (div HTML fiable) ; les barres SVG ne sont plus draggables :
      // saisir() fait preventDefault sur leur pointerdown, le dragstart ne
      // partait jamais, et <g draggable> est de toute façon inerte sous Electron.
```

- [ ] **Step 3: node --check + suite + déploiement**

Run:
```bash
node --check main.js
node --test tests/*.test.js
```
Expected: PASS — 295, inchangé.

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -F <message-file>
```
Message : `Frise : les barres SVG ne sont plus draggables (glissé via le lien de gauche)`

---

### Task 3: Pont Bases enrichi pour la vue calendrier

**Files:**
- Modify: `main.js` — `fabriquerVueCalendrierBase` (`main.js:20491`-`20527`) : ajouter au `ctx` les mêmes ponts que la frise ; tenir `this._parRef` ; `MoteurCalendrier` : lire `ctx.colonnes()` / `ctx.triNatif()`.

**Interfaces:**
- Consumes: rien de nouveau (copie de `fabriquerVueFriseBase`).
- Produces sur `ctx` (consommé par Tasks 4, 7, 9) :
  - `colonnes()` → `Array<{ cle, nom, valeur(ref), valeurBrute(ref), valeurBase(ref), chemin(ref) }>` — propriétés visibles, ordre `getOrder()`.
  - `triNatif()` → `null` ou `{ criteres: Array<{property, desc}>, preparer(taches) }` (pose `t._multi`).
  - `nomVue()` → `string`.
- Produces sur `MoteurCalendrier` : `this._parRef` (`Map<ref, entry>`), `this._colonnes` (cache par dessin), méthode `_prepareTri(taches)` qui appelle `ctx.triNatif().preparer` si présent.

- [ ] **Step 1: Copier `colonnes()` et les ponts de tri dans la fabrique calendrier**

Dans `fabriquerVueCalendrierBase`, étendre l'objet passé à `new MoteurCalendrier(...)` (`main.js:20500`-`20507`) :

```js
      this.moteur = new MoteurCalendrier(this.greffon, this.conteneur, {
        taches: () => this.tachesDeLaBase(),
        colonnes: () => this.colonnes(),
        nomVue: () => {
          try {
            const s = this.config.serialize ? this.config.serialize() : null;
            return (s && s.name) || (this.controller && this.controller.file
              && this.controller.file.basename) || tr('Calendrier');
          } catch (e) { return tr('Calendrier'); }
        },
        triNatif: () => {
          const criteres = this.sortNatif();
          if (!criteres.length) return null;
          return {
            criteres,
            preparer: (taches) => {
              for (const t of taches) {
                const e = this._parRef && this._parRef.get(t.ref);
                t._multi = criteres.map((c) => {
                  let v = null;
                  try { v = e ? e.getValue(c.property) : null; } catch (err) { v = null; }
                  const brut = (v && typeof v === 'object' && 'data' in v && v.data != null)
                    ? v.data : v;
                  return { v: brut == null ? '' : brut, s: c.desc ? -1 : 1 };
                });
              }
            },
          };
        },
        lire: (cle) => {
          const v = this.config.get(cle);
          return v === undefined || v === null ? DEFAUTS_CALENDRIER[cle] : v;
        },
        ecrire: async (cle, v) => { this.config.set(cle, v); },
      });
```

- [ ] **Step 2: Ajouter `sortNatif()` et `colonnes()` à `VueCalendrierBase`**

Copier depuis `VueFriseBase` (`main.js:18415`-`18423` et `main.js:18477`-`18520`) dans la classe rendue par `fabriquerVueCalendrierBase`, en remplaçant `VueFriseBase.texteValeur` par `VueCalendrierBase.texteValeur` **et** en ajoutant aussi la statique `texteValeur` (copie de `main.js:18528`-`18539`). Méthodes à coller :

```js
    static texteValeur(v) {
      if (v === null || v === undefined) return '';
      if (Array.isArray(v)) return v.map((x) => VueCalendrierBase.texteValeur(x)).filter(Boolean).join(', ');
      if (typeof v === 'object') {
        if (typeof v.toString === 'function') {
          const t = v.toString();
          return t === '[object Object]' ? '' : t;
        }
        return '';
      }
      return String(v);
    }

    sortNatif() {
      let s = [];
      try { s = (this.config.serialize() || {}).sort || this.config.getSort() || []; }
      catch (e) { s = []; }
      return (Array.isArray(s) ? s : [])
        .filter((x) => x && x.property)
        .map((x) => ({ property: String(x.property),
          desc: String(x.direction || 'ASC').toUpperCase() === 'DESC' }));
    }

    colonnes() {
      let props = [];
      try { props = this.config.getOrder() || []; } catch (e) { props = []; }
      if (!props.length) props = (this.data && this.data.properties) || [];
      let renoms = {};
      try { renoms = this.config.get('renoms') || {}; } catch (e) { renoms = {}; }
      const out = [];
      for (const id of props) {
        let nom = renoms[id] || '';
        if (!nom) {
          try { nom = this.greffon.libelleColonne(this.config.getDisplayName(id) || id); } catch (e) { nom = id; }
        }
        if (!nom) nom = id;
        const valeurDe = (ref) => {
          const e = this._parRef ? this._parRef.get(ref) : null;
          if (!e) return null;
          try { return e.getValue(id); } catch (err) { return null; }
        };
        out.push({
          cle: id,
          nom,
          chemin: (ref) => {
            const e = this._parRef ? this._parRef.get(ref) : null;
            return e && e.file ? e.file.path : '';
          },
          valeurBase: (ref) => valeurDe(ref),
          valeur: (ref) => {
            try { return VueCalendrierBase.texteValeur(valeurDe(ref)); } catch (err) { return ''; }
          },
          valeurBrute: (ref) => {
            const v = valeurDe(ref);
            if (v == null) return '';
            if (typeof v === 'object' && 'data' in v && v.data != null) return v.data;
            return VueCalendrierBase.texteValeur(v);
          },
        });
      }
      return out;
    }
```

- [ ] **Step 3: Peupler `_parRef` dans `tachesDeLaBase()`**

Remplacer `tachesDeLaBase()` (`main.js:20509`-`20517`) par la version qui tient `_parRef` (copie fidèle de la frise `main.js:20509` sans la remontée d'ancêtres, inutile ici — le calendrier ne dessine pas d'arbre) :

```js
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
```

- [ ] **Step 4: `MoteurCalendrier` lit colonnes + prépare le tri**

Dans `MoteurCalendrier.dessinerVraiment` (`main.js:20181`), juste après `this._taches = (this.ctx.taches && this.ctx.taches()) || [];` :

```js
    this._colonnes = (this.ctx.colonnes && this.ctx.colonnes()) || [];
    const tn = this.ctx.triNatif && this.ctx.triNatif();
    if (tn && tn.preparer) { try { tn.preparer(this._taches); } catch (e) { /* tri optionnel */ } }
```

Ajouter la méthode utilitaire dans `MoteurCalendrier` (près de `couleurTache`) :

```js
  // Paires { cle, nom, valeur } d'une tâche, pour rendreCarte (Task 4).
  _pairesProps(ref) {
    return (this._colonnes || []).map((c) => ({
      cle: c.cle, nom: c.nom, valeur: c.valeur ? c.valeur(ref) : '',
    }));
  }
```

- [ ] **Step 5: node --check + suite + déploiement**

Run:
```bash
node --check main.js
node --test tests/*.test.js
```
Expected: PASS — 295, inchangé (aucun test ne touche encore ce pont).
Déployer avec `cp`. Vérification visuelle utilisateur : la vue calendrier s'ouvre toujours, mois et semaine se dessinent comme avant.

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -F <message-file>
```
Message : `Calendrier : pont Bases enrichi (colonnes visibles, tri natif, _parRef)`

---

### Task 4: `rendreCarte` — cartes portant les propriétés visibles de la base

**Files:**
- Modify: `main.js` — `MoteurCalendrier` : nouvelle méthode `rendreCarte`, appelée depuis `dessinerMois` (`main.js:20374`-`20391`) et `dessinerSemaine` (`main.js:20460`-`20486`). `dessinerSemaine` : ajouter le calcul `enRetard`.
- Modify: `styles.css` — `.zfa-cal-carte`, lignes de propriété, `.zfa-cal-bloc-tronque-bas/-haut`.

**Interfaces:**
- Consumes: `Ariane.lignesProprietes` (Task 1), `this._pairesProps(ref)` (Task 3), `Ariane.tachesEnRetard`, `this.couleurTache`.
- Produces: `MoteurCalendrier.rendreCarte(hote, t, ev, opts)` où `opts = { maxLignes:number, avecHeure:boolean, enRetard:boolean }` → l'élément carte créé. Utilisée par les deux vues.

- [ ] **Step 1: Écrire `rendreCarte`**

Dans `MoteurCalendrier`, après `couleurTache` :

```js
  // Une carte d'événement : ligne 1 = heure + intitulé ; lignes suivantes =
  // propriétés visibles de la base (Task 3), coupées à opts.maxLignes selon la
  // hauteur disponible. Survol → aperçu de page natif. Retour : l'élément.
  rendreCarte(hote, t, ev, opts) {
    const o = opts || {};
    const carte = hote.createDiv({ cls: 'zfa-cal-carte'
      + (ev.allDay ? ' est-jour' : ' est-horaire')
      + (o.enRetard ? ' est-retard' : '') });
    carte.style.setProperty('--zfa-cal-coul', this.couleurTache(t));
    carte.dataset.ref = t.ref;
    if (ev.source === 'creneau') carte.dataset.brut = ev.brut;

    const titre = (o.avecHeure && !ev.allDay ? ev.debut.slice(11, 16) + ' ' : '')
      + (t.intitule || t.ref);
    carte.createDiv({ cls: 'zfa-cal-carte-titre', text: titre });

    const lignes = Ariane.lignesProprietes(
      this._pairesProps(t.ref), t.intitule, Math.max(0, (o.maxLignes || 1) - 1));
    for (const li of lignes) {
      const row = carte.createDiv({ cls: 'zfa-cal-carte-prop' });
      row.createSpan({ cls: 'zfa-cal-carte-prop-nom', text: li.nom + ' ' });
      row.createSpan({ cls: 'zfa-cal-carte-prop-val', text: li.valeur });
    }

    // title= = toutes les propriétés, même quand la carte n'en montre qu'une.
    const toutes = Ariane.lignesProprietes(this._pairesProps(t.ref), t.intitule, 99);
    carte.title = t.ref + ' · ' + (t.intitule || '')
      + (toutes.length ? '\n' + toutes.map((x) => x.nom + ' : ' + x.valeur).join('\n') : '');

    carte.addEventListener('mouseover', (e) => {
      this.app.workspace.trigger('hover-link', { event: e, source: 'zfa-calendrier',
        hoverParent: this, targetEl: carte, linktext: t.ref, sourcePath: '' });
    });
    carte.addEventListener('click', (e) => { e.stopPropagation();
      this.ouvrir(t.ref, e.metaKey || e.ctrlKey); });
    return carte;
  }
```

- [ ] **Step 2: Brancher `dessinerMois` sur `rendreCarte`**

Dans `dessinerMois`, remplacer le bloc `for (const { t, ev } of (parJour.get(jour) || [])) { … }` (`main.js:20374`-`20391`) par :

```js
        const evs = (parJour.get(jour) || []).slice().sort(Ariane.comparerEmpilement);
        for (const { t, ev } of evs) {
          this.rendreCarte(cell, t, ev, { maxLignes: 1, avecHeure: true,
            enRetard: enRetard.has(t.ref) });
        }
```

Conserver l'`addEventListener('dragstart', …)` interne (`text/x-ariane-cal`) : le rajouter à la fin, sur l'élément retourné — remplacer la boucle ci-dessus par la variante qui garde le glissé interne :

```js
        const evs = (parJour.get(jour) || []).slice().sort(Ariane.comparerEmpilement);
        for (const { t, ev } of evs) {
          const carte = this.rendreCarte(cell, t, ev, { maxLignes: 1, avecHeure: true,
            enRetard: enRetard.has(t.ref) });
          carte.setAttribute('draggable', 'true');
          carte.addEventListener('dragstart', (de) => {
            de.dataTransfer.setData('text/x-ariane-cal',
              JSON.stringify({ ref: t.ref, jour, brut: ev.source === 'creneau' ? ev.brut : '' }));
            de.dataTransfer.effectAllowed = 'move';
          });
        }
```

(Les anciennes classes `.zfa-cal-pastille` disparaissent du mois ; le CSS les garde le temps de la semaine, migré en Task 8.)

- [ ] **Step 3: Brancher `dessinerSemaine` sur `rendreCarte` + calcul retard**

Dans `dessinerSemaine`, après `const auj = new Date().toISOString().slice(0, 10);` (`main.js:20408`) :

```js
    const enRetard = Ariane.tachesEnRetard(this._taches, auj);
```

Remplacer, dans la boucle des blocs horaires (`main.js:20460`-`20486`), la création du `bloc` + `bloc.createSpan(...)` + `click` par un appel à `rendreCarte`, en gardant les poignées / pointerdown / keydown de créneau :

```js
      for (const { t, ev } of horaire.get(j).slice().sort(Ariane.comparerEmpilement)) {
        const y0 = (Number(ev.debut.slice(11, 13)) + Number(ev.debut.slice(14, 16)) / 60 - hDeb) * PXH;
        const finH = ev.fin.slice(0, 10) === j
          ? Number(ev.fin.slice(11, 13)) + Number(ev.fin.slice(14, 16)) / 60 : 24;
        const y1 = (finH - hDeb) * PXH;
        const haut = Math.max(14, y1 - Math.max(0, y0));
        const maxLignes = Math.max(1, Math.floor((haut - 6) / 16));
        const bloc = this.rendreCarte(col, t, ev,
          { maxLignes, avecHeure: true, enRetard: enRetard.has(t.ref) });
        bloc.classList.add('zfa-cal-bloc');
        bloc.style.top = Math.max(0, y0) + 'px';
        bloc.style.height = haut + 'px';
        if (y0 < 0) bloc.classList.add('zfa-cal-bloc-tronque-haut');
        if (y1 > (hFin - hDeb) * PXH) bloc.classList.add('zfa-cal-bloc-tronque-bas');
        if (ev.source === 'creneau') {
          bloc.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t.ref, ev.brut, j));
          const poi = bloc.createDiv({ cls: 'zfa-cal-poignee' });
          poi.addEventListener('pointerdown', (e) => this._saisirBloc(e, bloc, t.ref, ev.brut, j, 'fin'));
          bloc.tabIndex = 0;
          bloc.addEventListener('keydown', async (de) => {
            if (de.key === 'Delete' || de.key === 'Backspace') {
              de.preventDefault();
              await this.greffon.majCreneau(t.ref, { avant: ev.brut, debut: '', fin: '' });
              this._apres(t.ref, { cible: [t.debut, t.echeance, null], creneaux: undefined });
            }
          });
        }
      }
```

(Note : `rendreCarte` pose déjà le `click` d'ouverture ; ne pas le redoubler. Le `_saisirBloc` fait `stopPropagation` sur le pointeur, il n'y a pas de conflit.)

- [ ] **Step 4: CSS**

Dans `styles.css`, section `.zfa-cal-*`, ajouter / ajuster :

```css
.zfa-cal-carte {
  --zfa-cal-coul: var(--text-faint);
  overflow: hidden;
  border-radius: var(--radius-s);
  border: 1px solid color-mix(in srgb, var(--zfa-cal-coul) 55%, transparent);
  background: color-mix(in srgb, var(--zfa-cal-coul) 14%, var(--background-primary));
  padding: 2px 5px;
  font-size: var(--font-ui-smaller);
  line-height: 1.25;
  cursor: pointer;
}
.zfa-cal-carte-titre { font-weight: var(--font-medium); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.zfa-cal-carte-prop { display: flex; gap: 3px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zfa-cal-carte-prop-nom { color: var(--text-faint); }
.zfa-cal-carte.est-retard { border-color: var(--text-error);
  box-shadow: inset 2px 0 0 0 var(--text-error); }
.zfa-cal-bloc-tronque-bas { border-bottom-style: dashed; border-bottom-width: 2px;
  border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.zfa-cal-bloc-tronque-haut { border-top-style: dashed; border-top-width: 2px;
  border-top-left-radius: 0; border-top-right-radius: 0; }
```

(Si `color-mix` pose problème dans la version d'Electron ciblée, replier sur `background: var(--background-secondary)` + `border-left: 3px solid var(--zfa-cal-coul)` — à trancher à la relecture ; garder une seule variante.)

- [ ] **Step 5: node --check + suite + déploiement**

Run:
```bash
node --check main.js
node --test tests/*.test.js
```
Expected: PASS — 295.
Déployer. Vérification visuelle utilisateur : cartes mois = 1 ligne (heure + titre) ; blocs semaine hauts = titre + propriétés (Statut, Famille…) ; blocs courts = titre seul ; survol → aperçu de page ; retard = liseré rouge ; bloc qui déborde = bord bas tireté.

- [ ] **Step 6: Commit**

```bash
git add main.js styles.css
git commit -F <message-file>
```
Message : `Calendrier : cartes portant les propriétés visibles de la base`

---

### Task 5: Barre d'outils allégée + emplacement « + Nouveau »

**Files:**
- Modify: `main.js` — `MoteurCalendrier.dessinerBarreOutils` (`main.js:20211`-`20230`).
- Modify: `styles.css` — `.zfa-cal-barre`, `.zfa-cal-nav`, `.zfa-cal-mode`, `.zfa-cal-neuf`.

**Interfaces:**
- Consumes: `obsidian.setIcon`.
- Produces: `MoteurCalendrier._surNouveau()` — méthode **stub** ici (`() => {}`), remplie en Task 7. Bouton `.zfa-cal-neuf` présent dans le DOM.

- [ ] **Step 1: Réécrire `dessinerBarreOutils`**

```js
  dessinerBarreOutils(c) {
    const b = c.createDiv({ cls: 'zfa-cal-barre' });
    const nav = (sens) => this.naviguer(sens); // Task 6 fournit naviguer(); ici : voir Step 2

    const gauche = b.createDiv({ cls: 'zfa-cal-barre-gauche' });
    const bPrec = gauche.createEl('button', { cls: 'zfa-cal-nav', attr: { 'aria-label': tr('Précédent') } });
    obsidian.setIcon(bPrec, 'chevron-left');
    bPrec.onclick = () => nav(-1);
    const bAuj = gauche.createEl('button', { cls: 'zfa-cal-nav zfa-cal-nav-auj', text: tr('Aujourd\'hui') });
    bAuj.onclick = () => { this._ancre = new Date().toISOString().slice(0, 10); this.dessiner(); };
    const bSuiv = gauche.createEl('button', { cls: 'zfa-cal-nav', attr: { 'aria-label': tr('Suivant') } });
    obsidian.setIcon(bSuiv, 'chevron-right');
    bSuiv.onclick = () => nav(1);

    const titre = b.createSpan({ cls: 'zfa-cal-titre', text: this.titrePeriode() });
    titre.setAttribute('role', 'button');
    titre.onclick = () => { this._ancre = new Date().toISOString().slice(0, 10); this.dessiner(); };

    const droite = b.createDiv({ cls: 'zfa-cal-barre-droite' });
    const seg = droite.createDiv({ cls: 'zfa-cal-mode-seg' });
    for (const m of ['mois', 'semaine']) {
      const o = seg.createEl('button', {
        cls: 'zfa-cal-mode' + (this.mode === m ? ' is-active' : ''),
        text: m === 'mois' ? tr('Mois') : tr('Semaine') });
      o.onclick = async () => { await this.ctx.ecrire('calMode', m); this.dessiner(); };
    }
    const neuf = droite.createEl('button', { cls: 'zfa-cal-neuf', attr: { 'aria-label': tr('Nouvelle tâche') } });
    obsidian.setIcon(neuf, 'plus');
    neuf.createSpan({ text: tr('Nouveau') });
    neuf.onclick = () => this._surNouveau();
  }
```

- [ ] **Step 2: Ajouter `naviguer()` provisoire + `_surNouveau()` stub**

Tant que Task 6 n'a pas livré le carrousel, `naviguer` fait le pas simple actuel. Ajouter dans `MoteurCalendrier` :

```js
  naviguer(sens) {
    this._ancre = Ariane.ancreCarrousel(this._ancre, this.mode, sens);
    this.dessiner();
  }
  _surNouveau() { /* rempli en Task 7 */ }
```

(Task 6 remplacera le corps de `naviguer` par le calage animé.)

- [ ] **Step 3: CSS barre fine**

```css
.zfa-cal-barre { display: flex; align-items: center; gap: var(--size-4-2);
  padding: var(--size-2-2) var(--size-4-2); font-size: var(--font-ui-small); }
.zfa-cal-barre-gauche, .zfa-cal-barre-droite { display: flex; align-items: center; gap: var(--size-2-1); }
.zfa-cal-barre-droite { margin-left: auto; }
.zfa-cal-titre { font-weight: var(--font-medium); color: var(--text-muted); cursor: pointer; }
.zfa-cal-nav { padding: 2px 6px; box-shadow: none; }
.zfa-cal-nav-auj { font-size: var(--font-ui-smaller); }
.zfa-cal-mode-seg { display: flex; }
.zfa-cal-mode { padding: 2px 8px; box-shadow: none; border-radius: 0; }
.zfa-cal-mode:first-child { border-radius: var(--radius-s) 0 0 var(--radius-s); }
.zfa-cal-mode:last-child { border-radius: 0 var(--radius-s) var(--radius-s) 0; }
.zfa-cal-mode.is-active { background: var(--interactive-accent); color: var(--text-on-accent); }
.zfa-cal-neuf { display: flex; align-items: center; gap: 4px; padding: 2px 8px; }
```

Retirer les anciennes règles `.zfa-cal-barre`/`.zfa-cal-nav`/`.zfa-cal-mode` obsolètes si elles entrent en conflit.

- [ ] **Step 4: node --check + suite + déploiement**

Run:
```bash
node --check main.js
node --test tests/*.test.js
```
Expected: PASS — 295.
Déployer. Visuel utilisateur : barre nettement plus fine, flèches en icônes, titre cliquable ramène à aujourd'hui, segment Mois/Semaine compact, bouton « + Nouveau » à droite (encore inactif).

- [ ] **Step 5: Commit**

```bash
git add main.js styles.css
git commit -F <message-file>
```
Message : `Calendrier : barre d'outils allégée + emplacement « + Nouveau »`

---

### Task 6: Carrousel continu (navigation gestuelle)

**Files:**
- Modify: `main.js` — `MoteurCalendrier` : `dessinerVraiment` construit un ruban à 3 grilles ; nouveaux gestionnaires `wheel` / `pointerdown` horizontaux ; `naviguer(sens)` devient un calage animé ; nouvelle méthode `_rendreGrille(hote, ancre)`.
- Modify: `styles.css` — `.zfa-cal-ruban`, transition.

**Interfaces:**
- Consumes: `Ariane.ancreCarrousel` (Task 1).
- Produces: `MoteurCalendrier._rendreGrille(hote, ancre)` — dessine mois **ou** semaine pour une ancre donnée dans `hote` (extrait de l'actuel `dessinerVraiment`). `naviguer(sens)` anime puis réancre.

- [ ] **Step 1: Extraire `_rendreGrille`**

Refactoriser la fin de `dessinerVraiment` (`main.js:20205`-`20208`). Aujourd'hui :

```js
    this.dessinerBarreOutils(c);
    const grille = c.createDiv({ cls: 'zfa-cal-grille zfa-cal-' + this.mode });
    if (this.mode === 'semaine') this.dessinerSemaine(grille);
    else this.dessinerMois(grille);
```

Devient :

```js
    this.dessinerBarreOutils(c);
    const ruban = c.createDiv({ cls: 'zfa-cal-ruban' });
    this._ruban = ruban;
    this._decalGeste = 0;
    for (const sens of [-1, 0, 1]) {
      const g = ruban.createDiv({ cls: 'zfa-cal-grille zfa-cal-' + this.mode });
      g.dataset.sens = String(sens);
      this._rendreGrille(g, Ariane.ancreCarrousel(this._ancre, this.mode, sens));
    }
    ruban.style.transform = 'translateX(-100%)';
    this._brancherCarrousel(ruban);
```

Nouvelle méthode (le corps déplacé depuis les deux branches actuelles, qui prenaient `this._ancre` implicitement — il faut le passer) :

```js
  _rendreGrille(hote, ancre) {
    const prev = this._ancre;
    this._ancre = ancre;
    try {
      if (this.mode === 'semaine') this.dessinerSemaine(hote);
      else this.dessinerMois(hote);
    } finally { this._ancre = prev; }
  }
```

(Contrainte : `dessinerMois` / `dessinerSemaine` doivent lire `this._ancre` — c'est déjà le cas via `Ariane.grilleMois(this._ancre)` / `grilleSemaine(this._ancre)`. Ils écrivent aussi `this._pxHeure` etc. : sans danger, la grille centrale est rendue en dernier n'est pas garanti → rendre l'ordre `[0, -1, 1]` pour que la grille centrale fixe ces champs en premier. Ajuster la boucle : `for (const sens of [0, -1, 1])` et insérer chaque grille à la bonne place avec `ruban.insertBefore`.)

Version corrigée de la boucle :

```js
    const grilles = {};
    for (const sens of [0, -1, 1]) {
      const g = document.createElement('div');
      g.className = 'zfa-cal-grille zfa-cal-' + this.mode;
      g.dataset.sens = String(sens);
      this._rendreGrille(g, Ariane.ancreCarrousel(this._ancre, this.mode, sens));
      grilles[sens] = g;
    }
    ruban.appendChild(grilles[-1]);
    ruban.appendChild(grilles[0]);
    ruban.appendChild(grilles[1]);
```

- [ ] **Step 2: `_brancherCarrousel` — molette + glissé pointeur**

```js
  _brancherCarrousel(ruban) {
    const largeur = () => ruban.clientWidth || 1;
    const appliquer = () => {
      ruban.style.transition = 'none';
      ruban.style.transform = 'translateX(calc(-100% + ' + this._decalGeste + 'px))';
    };
    let minuterie = null;
    const finDeGeste = () => {
      const w = largeur();
      const sens = this._decalGeste <= -w / 4 ? 1 : (this._decalGeste >= w / 4 ? -1 : 0);
      this._calerCarrousel(sens);
    };
    ruban.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical : laisser défiler
      e.preventDefault();
      this._decalGeste -= e.deltaX;
      appliquer();
      if (minuterie) clearTimeout(minuterie);
      minuterie = setTimeout(finDeGeste, 140);
    }, { passive: false });

    ruban.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.zfa-cal-carte, .zfa-cal-cellule, .zfa-cal-bloc, .zfa-cal-poignee, button')) return;
      const x0 = e.clientX;
      let bouge = false;
      const move = (mv) => {
        const d = mv.clientX - x0;
        if (Math.abs(d) > 4) bouge = true;
        if (bouge) { this._decalGeste = d; appliquer(); }
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (bouge) finDeGeste();
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  // Anime le ruban jusqu'à la grille voisine (sens ±1) ou le recentre (0),
  // puis réancre et redessine.
  _calerCarrousel(sens) {
    const ruban = this._ruban;
    if (!ruban) return;
    const cible = sens === 1 ? '-200%' : (sens === -1 ? '0%' : '-100%');
    ruban.style.transition = 'transform 180ms ease-out';
    ruban.style.transform = 'translateX(' + cible + ')';
    const apres = () => {
      ruban.removeEventListener('transitionend', apres);
      this._decalGeste = 0;
      if (sens) this._ancre = Ariane.ancreCarrousel(this._ancre, this.mode, sens);
      this.dessiner();
    };
    if (sens) ruban.addEventListener('transitionend', apres);
    else setTimeout(apres, 190);
  }
```

- [ ] **Step 3: `naviguer(sens)` = calage animé**

Remplacer la `naviguer` provisoire de Task 5 :

```js
  naviguer(sens) {
    if (this._ruban && sens) this._calerCarrousel(sens);
    else { this._ancre = Ariane.ancreCarrousel(this._ancre, this.mode, sens); this.dessiner(); }
  }
```

- [ ] **Step 4: CSS ruban**

```css
.zfa-cal-ruban { display: flex; width: 300%; overflow: hidden; will-change: transform; }
.zfa-cal-ruban > .zfa-cal-grille { flex: 0 0 33.3333%; width: 33.3333%; }
```

Vérifier que `.zfa-cal-grille` existant n'impose pas une largeur qui casse le `flex-basis`.

- [ ] **Step 5: node --check + suite + déploiement**

Run:
```bash
node --check main.js
node --test tests/*.test.js
```
Expected: PASS — 295 (les tests couvrent `ancreCarrousel`, pas le DOM).
Déployer. Visuel utilisateur : deux doigts horizontalement sur la grille → elle suit et se cale au mois/semaine voisin au relâchement ; défilement vertical des heures intact en semaine ; flèches `‹` `›` animent le même calage ; clic sur une carte / cellule non capté par le geste.

- [ ] **Step 6: Commit**

```bash
git add main.js styles.css
git commit -F <message-file>
```
Message : `Calendrier : navigation carrousel continue (molette + glissé)`

---

### Task 7: Bouton « + Nouveau » + sélection de jour

**Files:**
- Modify: `main.js` — `MoteurCalendrier` : `_surNouveau` réel ; `_jourSel` posé au clic sur un quantième (`dessinerMois`, `main.js:20373`) et sur un en-tête de jour (`dessinerSemaine`, bandeau — `main.js:20431`) ; classe `est-selection`.
- Modify: `styles.css` — `.zfa-cal-cellule.est-selection`, `.zfa-cal-bandeau-jour.est-selection`.

**Interfaces:**
- Consumes: `Ariane.jourSeme` (Task 1), `Ariane.grilleMois` / `Ariane.grilleSemaine`, `this.greffon.creerTache` (`main.js:13512`).
- Produces: rien de public.

- [ ] **Step 1: `_bornesPeriode()` + `_surNouveau()`**

```js
  _bornesPeriode() {
    if (this.mode === 'semaine') {
      const g = Ariane.grilleSemaine(this._ancre);
      return { debut: g.jours[0], fin: g.jours[6] };
    }
    const g = Ariane.grilleMois(this._ancre);
    // moisDebut = 1er du mois ; fin = dernier jour affiché du mois courant
    const dernier = Ariane.decalerJour(Ariane.moisSuivantN(g.moisDebut, 1), -1);
    return { debut: g.moisDebut, fin: dernier };
  }

  async _surNouveau() {
    const auj = new Date().toISOString().slice(0, 10);
    const { debut, fin } = this._bornesPeriode();
    const jour = Ariane.jourSeme(this._jourSel || '', debut, fin, auj);
    const chemin = await this.greffon.creerTache({ debut: jour, echeance: jour });
    if (chemin) this.ouvrir(chemin.split('/').pop().replace(/\.md$/, ''), false);
  }
```

(Vérifier que `Ariane.grilleMois(...)` expose bien `moisDebut` — spec §3 du plan `vue-calendrier` le garantit. Si le nom diffère, l'adapter et le noter.)

- [ ] **Step 2: Sélection au clic sur un quantième (vue mois)**

Dans `dessinerMois`, la cellule (`main.js:20342`-`20373`). Après `cell.createDiv({ cls: 'zfa-cal-quantieme', … })`, ajouter sur la cellule :

```js
        if (this._jourSel === jour) cell.addClass('est-selection');
        cell.addEventListener('click', (e) => {
          if (e.target.closest('.zfa-cal-carte')) return;
          this._jourSel = (this._jourSel === jour) ? '' : jour;
          this.dessiner();
        });
```

- [ ] **Step 3: Sélection au clic sur un en-tête de jour (vue semaine)**

Dans `dessinerSemaine`, la colonne de bandeau (`main.js:20430`-`20440`). Après `col.dataset.jour = j;` :

```js
      if (this._jourSel === j) col.addClass('est-selection');
      col.addEventListener('click', (e) => {
        if (e.target.closest('.zfa-cal-carte')) return;
        this._jourSel = (this._jourSel === j) ? '' : j;
        this.dessiner();
      });
```

- [ ] **Step 4: CSS sélection**

```css
.zfa-cal-cellule.est-selection,
.zfa-cal-bandeau-jour.est-selection {
  box-shadow: inset 0 0 0 2px var(--interactive-accent);
}
```

- [ ] **Step 5: node --check + suite + déploiement**

Run:
```bash
node --check main.js
node --test tests/*.test.js
```
Expected: PASS — 295.
Déployer. Visuel utilisateur : clic sur un quantième → contour accent ; « + Nouveau » crée une tâche datée du jour sélectionné (sinon aujourd'hui si visible, sinon 1er jour de la période) et ouvre la note ; re-clic sur le même jour déselectionne.

- [ ] **Step 6: Commit**

```bash
git add main.js styles.css
git commit -F <message-file>
```
Message : `Calendrier : bouton « + Nouveau » et sélection de jour`

---

### Task 8: Bandeau « tout le jour » compact et repliable

**Files:**
- Modify: `main.js` — `DEFAUTS_CALENDRIER` (`main.js:15940`) ; `MoteurCalendrier.dessinerSemaine` bandeau (`main.js:20428`-`20440`) ; ajout `Ariane.replierListe`.
- Modify: `styles.css` — `.zfa-cal-bandeau`, `.zfa-cal-bandeau-plus`, `.zfa-cal-bandeau-chevron`.
- Test: `tests/calendrier.test.js`.

**Interfaces:**
- Consumes: `this.ctx.lire('calBandeauReplie')`, `this.ctx.ecrire`.
- Produces: `Ariane.replierListe(items, plafond)` → `{ montres: Array, reste: number }`.

- [ ] **Step 1: Test de `Ariane.replierListe`**

Ajouter à `tests/calendrier.test.js` :

```js
test('replierListe : sous le plafond → tout ; au-dessus → coupé + reste', () => {
  assert.deepEqual(Ariane.replierListe([1, 2], 3), { montres: [1, 2], reste: 0 });
  assert.deepEqual(Ariane.replierListe([1, 2, 3, 4, 5], 2), { montres: [1, 2], reste: 3 });
  assert.deepEqual(Ariane.replierListe([], 2), { montres: [], reste: 0 });
  assert.deepEqual(Ariane.replierListe([1, 2, 3], 0), { montres: [1, 2, 3], reste: 0 });
});
```

Run: `node --test tests/calendrier.test.js` → FAIL (`replierListe is not a function`).

- [ ] **Step 2: Implémenter `Ariane.replierListe`**

Après `Ariane.lignesProprietes` (Task 1) :

```js
  // Coupe une liste à `plafond` éléments et dit combien restent cachés.
  // plafond <= 0 → aucun repli.
  static replierListe(items, plafond) {
    const arr = Array.isArray(items) ? items : [];
    if (plafond <= 0 || arr.length <= plafond) return { montres: arr.slice(), reste: 0 };
    return { montres: arr.slice(0, plafond), reste: arr.length - plafond };
  }
```

- [ ] **Step 3: `DEFAUTS_CALENDRIER` gagne `calBandeauReplie`**

```js
const DEFAUTS_CALENDRIER = {
  calMode: 'mois',
  calHeureDebut: '07:00',
  calHeureFin: '21:00',
  calBandeauReplie: false,
};
```

- [ ] **Step 4: Bandeau compact dans `dessinerSemaine`**

Remplacer la construction du bandeau (`main.js:20428`-`20440`) par :

```js
    const total = [...toutJour.values()].reduce((n, l) => n + l.length, 0);
    const replie = !!this.ctx.lire('calBandeauReplie');
    const bandeau = hote.createDiv({ cls: 'zfa-cal-bandeau' + (replie ? ' est-replie' : '')
      + (total ? '' : ' est-vide') });
    const goutt = bandeau.createDiv({ cls: 'zfa-cal-gouttiere' });
    const chev = goutt.createEl('button', { cls: 'zfa-cal-bandeau-chevron',
      attr: { 'aria-label': tr('Replier / déplier') } });
    obsidian.setIcon(chev, replie ? 'chevron-right' : 'chevron-down');
    chev.onclick = async () => { await this.ctx.ecrire('calBandeauReplie', !replie); this.dessiner(); };
    if (replie && total) goutt.createSpan({ cls: 'zfa-cal-bandeau-compte', text: String(total) });

    const PLAFOND = 2;
    for (const j of g.jours) {
      const col = bandeau.createDiv({ cls: 'zfa-cal-bandeau-jour' + (j === auj ? ' est-aujourdhui' : '') });
      col.dataset.jour = j;
      if (this._jourSel === j) col.addClass('est-selection');
      col.addEventListener('click', (e) => {
        if (e.target.closest('.zfa-cal-carte')) return;
        this._jourSel = (this._jourSel === j) ? '' : j;
        this.dessiner();
      });
      if (replie) continue;
      const liste = toutJour.get(j).slice().sort(Ariane.comparerEmpilement);
      let deplie = false;
      const rendre = () => {
        col.findAll('.zfa-cal-carte, .zfa-cal-bandeau-plus').forEach((n) => n.remove());
        const { montres, reste } = deplie
          ? { montres: liste, reste: 0 }
          : Ariane.replierListe(liste, PLAFOND);
        for (const { t, ev } of montres) this.rendreCarte(col, t, ev, { maxLignes: 1, avecHeure: false });
        if (reste) {
          const plus = col.createDiv({ cls: 'zfa-cal-bandeau-plus', text: '+' + reste });
          plus.onclick = (e) => { e.stopPropagation(); deplie = true; rendre(); };
        }
      };
      rendre();
    }
```

(Note : `col.findAll` est l'API Obsidian sur `HTMLElement`. Si indisponible dans le contexte de test, elle ne l'est pas — c'est du DOM runtime, non testé.)

- [ ] **Step 5: CSS bandeau**

```css
.zfa-cal-bandeau { display: flex; border-bottom: 1px solid var(--background-modifier-border); }
.zfa-cal-bandeau.est-vide { display: none; }
.zfa-cal-bandeau.est-replie { min-height: 0; }
.zfa-cal-gouttiere { flex: 0 0 var(--zfa-cal-gouttiere-w, 44px); display: flex; align-items: flex-start;
  gap: 2px; padding: 2px; }
.zfa-cal-bandeau-chevron { padding: 0 2px; box-shadow: none; background: transparent; }
.zfa-cal-bandeau-compte { font-size: var(--font-ui-smaller); color: var(--text-muted); }
.zfa-cal-bandeau-jour { flex: 1 1 0; display: flex; flex-direction: column; gap: 2px; padding: 2px;
  min-width: 0; border-left: 1px solid var(--background-modifier-border); }
.zfa-cal-bandeau-plus { font-size: var(--font-ui-smaller); color: var(--text-muted); cursor: pointer; }
```

Retirer toute ancienne règle fixant une `height`/`min-height` sur `.zfa-cal-bandeau`.

- [ ] **Step 6: node --check + suite + déploiement**

Run:
```bash
node --check main.js
node --test tests/*.test.js
```
Expected: PASS — 295 + 1 = **296**.
Déployer. Visuel utilisateur : semaine sans événement « tout le jour » → pas de bandeau du tout ; avec 1-2 → hauteur juste ; avec plus → « +N » qui déplie ; chevron dans la gouttière replie/déplie et l'état survit au changement de semaine.

- [ ] **Step 7: Commit**

```bash
git add main.js styles.css tests/calendrier.test.js
git commit -F <message-file>
```
Message : `Calendrier : bandeau « tout le jour » compact et repliable`

---

### Task 9: Menus contextuels (carte + cellule)

**Files:**
- Modify: `main.js` — `MoteurCalendrier` : `menuCarte(e, t, ev)`, `menuCellule(e, jourISO)` ; câblage `contextmenu` dans `rendreCarte`, `dessinerMois` (cellule), `dessinerSemaine` (colonne).

**Interfaces:**
- Consumes: `obsidian.Menu`, `this.greffon.majTache(ref, champs)` (utilisé par `MoteurFrise.menuTache`, `main.js:17647`), `this.greffon.majCreneau`, `this.greffon.ecrireDatesTaches`, `Ariane.jourSeme`, `Ariane.creneauDepuisDrop`.
- Produces: rien de public.

- [ ] **Step 1: `menuCarte`**

```js
  menuCarte(e, t, ev) {
    e.preventDefault(); e.stopPropagation();
    const m = new obsidian.Menu();
    const poser = async (champs) => { await this.greffon.majTache(t.ref, champs); this.dessiner(); };

    m.addItem((i) => i.setTitle(tr('Ouvrir')).setIcon('file-text').onClick(() => this.ouvrir(t.ref, false)));
    m.addItem((i) => i.setTitle(tr('Ouvrir dans un nouveau volet')).setIcon('separator-vertical')
      .onClick(() => this.ouvrir(t.ref, true)));
    m.addSeparator();

    for (const st of ['à faire', 'en cours', 'en attente', 'terminée', 'abandonnée']) {
      m.addItem((i) => i.setTitle(tr('Statut : ') + st).setChecked(t.statut === st)
        .onClick(() => poser({ statut: st })));
    }
    m.addItem((i) => i.setTitle(tr('Marquer terminée')).setIcon('check')
      .onClick(() => poser({ statut: 'terminée' })));
    m.addSeparator();
    for (const [lib, val] of [[tr('(aucune)'), ''], [tr('basse'), 'basse'],
                              [tr('moyenne'), 'moyenne'], [tr('haute'), 'haute']]) {
      m.addItem((i) => i.setTitle(tr('Priorité : ') + lib).setChecked(String(t.priorite || '') === val)
        .onClick(() => poser({ priorite: val })));
    }
    m.addSeparator();

    if (ev.source === 'creneau') {
      m.addItem((i) => i.setTitle(tr('Supprimer ce créneau')).setIcon('trash-2')
        .onClick(async () => {
          await this.greffon.majCreneau(t.ref, { avant: ev.brut, debut: '', fin: '' });
          this._apres(t.ref, { cible: [t.debut, t.echeance, null], creneaux: undefined });
        }));
    }
    m.addItem((i) => i.setTitle(tr('Retirer du calendrier')).setIcon('calendar-off')
      .onClick(async () => {
        await this.greffon.ecrireDatesTaches([{ ref: t.ref, debut: '', echeance: '' }]);
        this._apres(t.ref, { debut: '', echeance: '', cible: ['', '', []] });
      }));
    m.showAtMouseEvent(e);
  }
```

- [ ] **Step 2: `menuCellule`**

```js
  menuCellule(e, jourISO) {
    e.preventDefault(); e.stopPropagation();
    const m = new obsidian.Menu();
    m.addItem((i) => i.setTitle(tr('Nouvelle tâche ce jour-là')).setIcon('plus')
      .onClick(async () => {
        const chemin = await this.greffon.creerTache({ debut: jourISO, echeance: jourISO });
        if (chemin) this.ouvrir(chemin.split('/').pop().replace(/\.md$/, ''), false);
      }));
    m.addItem((i) => i.setTitle(tr('Coller le lien en créneau')).setIcon('clipboard-paste')
      .onClick(async () => {
        let txt = '';
        try { txt = await navigator.clipboard.readText(); } catch (err) { txt = ''; }
        const ref = this._refDepuisDrop({ getData: (k) => (k === 'text/plain' ? txt : '') });
        if (!ref) { new obsidian.Notice(tr('Aucun lien de tâche dans le presse-papier.')); return; }
        const cr = Ariane.creneauDepuisDrop({ yRel: 0, hauteurHeure: this._pxHeure || 42,
          heureDebut: this._hDeb || 9, jourISO, dureeMin: 60 })
          || { debut: jourISO + 'T09:00', fin: jourISO + 'T10:00' };
        await this.greffon.majCreneau(ref, { avant: '', debut: cr.debut, fin: cr.fin });
        this._apres(ref, { cible: [undefined, undefined, null], creneaux: undefined });
      }));
    m.showAtMouseEvent(e);
  }
```

- [ ] **Step 3: Câbler `contextmenu`**

Dans `rendreCarte` (Task 4), avant le `return carte;` :

```js
    carte.addEventListener('contextmenu', (e) => this.menuCarte(e, t, ev));
```

Dans `dessinerMois`, sur la cellule (après le `click` de sélection de Task 7) :

```js
        cell.addEventListener('contextmenu', (e) => {
          if (e.target.closest('.zfa-cal-carte')) return;
          this.menuCellule(e, jour);
        });
```

Dans `dessinerSemaine`, sur la colonne horaire `col` (`main.js:20450`-`20455`) :

```js
      col.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.zfa-cal-carte')) return;
        this.menuCellule(e, col.dataset.jour);
      });
```

- [ ] **Step 4: node --check + suite + déploiement**

Run:
```bash
node --check main.js
node --test tests/*.test.js
```
Expected: PASS — 296.
Déployer. Visuel utilisateur : clic droit sur une carte → Ouvrir / Statut / Priorité / (Supprimer ce créneau) / Retirer du calendrier ; clic droit sur une case vide → Nouvelle tâche ce jour / Coller le lien en créneau.

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -F <message-file>
```
Message : `Calendrier : menus contextuels carte et cellule`

---

### Task 10: README (FR + EN)

**Files:**
- Modify: `README.fr.md` — section « Vue calendrier » (créée par le plan `vue-calendrier`, à retrouver par `grep -n "Vue calendrier" README.fr.md`).
- Modify: `README.md` — section « Calendar view ».

**Interfaces:** aucune.

- [ ] **Step 1: Mettre à jour `README.fr.md`**

Dans la section « Vue calendrier », ajouter après le paragraphe existant :

```markdown
Les cartes reprennent les **propriétés visibles de la base** (comme la frise) :
intitulé, heure, puis une ligne par propriété selon la hauteur du bloc. La
**barre d'outils** est réduite (flèches en icônes, titre cliquable qui ramène à
aujourd'hui, segment Mois/Semaine, bouton **« + Nouveau »**). On **navigue au
trackpad** : deux doigts à l'horizontale font glisser la grille d'une période à
l'autre, calage au relâchement. Le **bandeau « tout le jour »** de la vue
semaine se replie et disparaît quand il est vide. **Clic droit** sur une carte
(statut, priorité, supprimer le créneau, retirer du calendrier) ou sur une case
vide (nouvelle tâche ce jour, coller un lien en créneau). Un clic sur un jour le
sélectionne : « + Nouveau » date alors la tâche sur ce jour.

Pour poser un créneau depuis la frise, on **glisse le lien de la colonne de
gauche** d'une ligne vers un jour du calendrier (les barres SVG ne sont plus
elles-mêmes glissables).
```

- [ ] **Step 2: Mettre à jour `README.md`** (équivalent anglais fidèle)

```markdown
Cards carry the **base's visible properties** (like the timeline): title, time,
then one line per property as the block's height allows. The **toolbar** is
slimmed down (icon arrows, a clickable title that jumps to today, a Month/Week
segment, a **"+ New"** button). **Trackpad navigation**: a two-finger
horizontal swipe slides the grid from one period to the next, snapping on
release. The week view's **all-day band** collapses and disappears when empty.
**Right-click** a card (status, priority, delete the créneau, remove from the
calendar) or an empty cell (new task that day, paste a link as a créneau).
Clicking a day selects it: "+ New" then dates the task on that day.

To drop a créneau from the timeline, **drag the left-column link** of a row
onto a calendar day (the SVG bars themselves are no longer draggable).
```

- [ ] **Step 3: Suite + commit**

Run: `node --test tests/*.test.js`
Expected: PASS — 296 (docs seules).

```bash
git add README.fr.md README.md
git commit -F <message-file>
```
Message : `README : refonte ergonomique de la vue calendrier`

---

## Self-Review

**Spec coverage :**
- §3 pont Bases enrichi → Task 3 (+ `comparerMulti` Task 1).
- §4 cartes = propriétés visibles → Task 4 (+ `lignesProprietes`, `comparerEmpilement` Task 1).
- §5 barre d'outils allégée → Task 5.
- §6 carrousel continu → Task 6 (+ `ancreCarrousel` Task 1).
- §7 bandeau compact/repliable → Task 8 (+ `replierListe`).
- §8 bouton « + Nouveau » + sélection jour → Task 7 (+ `jourSeme` Task 1).
- §9 menus contextuels → Task 9.
- §10 retrait draggable barres SVG → Task 2.
- §11 tests purs → répartis (Task 1 : 4 des 5 items ; Task 8 : bandeau).
- §12 différé → non planifié, volontairement.

**Placeholder scan :** `_surNouveau` est un stub explicite en Task 5, rempli en Task 7 (dépendance déclarée). `naviguer` est provisoire en Task 5, définitif en Task 6. Aucun « TODO » nu, chaque étape de code porte son code.

**Type consistency :**
- `ctx.colonnes()` : forme `{ cle, nom, valeur(ref), valeurBrute(ref), valeurBase(ref), chemin(ref) }` — produite Task 3, consommée Task 4 via `_pairesProps` qui n'utilise que `cle`, `nom`, `valeur`.
- `Ariane.comparerEmpilement(x, y)` attend `{ ev:{allDay,debut}, t:{ref,_multi?} }` — les sites d'appel (Tasks 4, 8) trient des `{ t, ev }`, ordre des clés sans importance.
- `_multi` posé par `ctx.triNatif().preparer` (Task 3) et lu par `comparerMulti` (Task 1) : `Array<{ v, s }>`, cohérent.
- `creerTache(champs)` → `Promise<string>` (chemin) ; `_surNouveau` / `menuCellule` en tirent le basename par `split('/').pop().replace(/\.md$/, '')`. Cohérent avec `main.js:13522`.
- `Ariane.ancreCarrousel` utilisée par Task 5 (`naviguer` provisoire), Task 6 (`_calerCarrousel`, `_rendreGrille` boucle) — même signature partout.

**Numérotation des tests :** 288 → 295 (Task 1 : +7) → 296 (Task 8 : +1). Task 1 Step 5 vérifie qu'aucun test gantt/regroupement ne régresse après le repointage `comparerMulti`.
