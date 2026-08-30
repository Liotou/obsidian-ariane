# Plan d'implémentation — Chantier 3a : la frise Gantt

> **Pour un exécutant agentique :** SOUS-COMPÉTENCE REQUISE — employer
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche.

**But :** voir le rétroplanning sur une frise, y déplacer et y étirer les barres
à la souris, y lire les dépendances et les jalons.

**Architecture :** l'arithmétique des jours, la disposition de l'arbre, la
remontée des dates sur les méta-tâches et le calcul des décalages sont des
**fonctions pures**, méthodes statiques de `Ariane`. La vue ne fait que
dessiner ce qu'elles rendent et écrire ce qu'elles décident.

**Pile technique :** identique. Barres en DOM pour que le glissé soit simple,
flèches de dépendance en SVG superposé.

**Spécification :** `docs/conception/2026-08-28-systeme-de-taches.md`, § 8.

## Contraintes globales

Celles des chantiers 1 et 2 restent en vigueur. S'y ajoutent :

- **Les dates sont des chaînes `AAAA-MM-JJ`**, jamais des objets `Date` en
  circulation. L'arithmétique passe par `Date.UTC`, faute de quoi un changement
  d'heure d'été décale une barre d'un jour.
- **Les flèches sont dessinées, jamais tracées ici.** Le canvas seul crée les
  liens. Un même geste ne doit pas exister à deux endroits.
- **Un jalon n'a pas de durée** : seule son `echeance` compte, `debut` est ignoré.
- **Une méta-tâche** est une tâche qui a des enfants. Sa barre couvre du premier
  début à la dernière échéance de sa descendance, et la déplacer décale tout le
  sous-arbre d'un bloc.
- **Aucune écriture qui ne change rien**, comme partout ailleurs.
- **Hors périmètre :** le pont Rappels, la capture par modèle, l'export, la
  reprise de l'existant, et le greffon de la vue canvas.

---

### Tâche 1 : L'arithmétique des jours

**Fichiers :** créer `tests/jours.test.js` ; modifier `main.js`.

**Interfaces :**
- `Ariane.jourValide(v) -> string` rend `'AAAA-MM-JJ'` ou `''` ;
- `Ariane.decalerJour(jour, n) -> string` ;
- `Ariane.ecartJours(a, b) -> number`, nombre de jours de `a` vers `b`,
  négatif si `b` précède `a`, et `0` si l'une des deux est invalide.

- [ ] **Étape 1 : écrire le test qui échoue**

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('une date valide est rendue telle quelle', () => {
  assert.equal(Ariane.jourValide('2026-09-01'), '2026-09-01');
});

test('une date horodatée est ramenée au jour', () => {
  assert.equal(Ariane.jourValide('2026-09-01T18:30:00'), '2026-09-01');
});

test('ce qui n est pas une date rend la chaîne vide', () => {
  assert.equal(Ariane.jourValide(''), '');
  assert.equal(Ariane.jourValide(null), '');
  assert.equal(Ariane.jourValide('bientôt'), '');
});

test('décaler de zéro ne change rien', () => {
  assert.equal(Ariane.decalerJour('2026-09-01', 0), '2026-09-01');
});

test('décaler franchit les mois', () => {
  assert.equal(Ariane.decalerJour('2026-08-30', 3), '2026-09-02');
});

test('décaler en arrière franchit les années', () => {
  assert.equal(Ariane.decalerJour('2026-01-02', -3), '2025-12-30');
});

test('décaler traverse le changement d heure sans perdre un jour', () => {
  // Le dernier dimanche d octobre en Europe : 25 octobre 2026.
  assert.equal(Ariane.decalerJour('2026-10-24', 2), '2026-10-26');
  assert.equal(Ariane.decalerJour('2026-03-28', 2), '2026-03-30');
});

test('une année bissextile est respectée', () => {
  assert.equal(Ariane.decalerJour('2028-02-28', 1), '2028-02-29');
  assert.equal(Ariane.decalerJour('2026-02-28', 1), '2026-03-01');
});

test('l écart se compte en jours, signé', () => {
  assert.equal(Ariane.ecartJours('2026-09-01', '2026-09-10'), 9);
  assert.equal(Ariane.ecartJours('2026-09-10', '2026-09-01'), -9);
  assert.equal(Ariane.ecartJours('2026-09-01', '2026-09-01'), 0);
});

test('un écart sur une date invalide vaut zéro', () => {
  assert.equal(Ariane.ecartJours('', '2026-09-01'), 0);
  assert.equal(Ariane.ecartJours('2026-09-01', 'bientôt'), 0);
});

test('décaler une date invalide rend la chaîne vide', () => {
  assert.equal(Ariane.decalerJour('', 3), '');
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

`node --test "tests/jours.test.js"`

- [ ] **Étape 3 : écrire les trois méthodes**

```js
  /* ----------------------------- Frise Gantt ----------------------------- */

  // Les dates circulent en chaînes « AAAA-MM-JJ » et l'arithmétique passe par
  // UTC. Un Date local franchissant un changement d'heure décale d'un jour, ce
  // qui déplacerait des barres deux fois par an sans qu'on comprenne pourquoi.
  static jourValide(v) {
    const s = String(v == null ? '' : v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const [a, m, j] = s.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1, j));
    // Écarte le 31 février et consorts, que Date.UTC reporterait en silence.
    return (d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j) ? s : '';
  }

  static _versUTC(jour) {
    const s = Ariane.jourValide(jour);
    if (!s) return null;
    const [a, m, j] = s.split('-').map(Number);
    return Date.UTC(a, m - 1, j);
  }

  static decalerJour(jour, n) {
    const t = Ariane._versUTC(jour);
    if (t === null) return '';
    return new Date(t + (Number(n) || 0) * 86400000).toISOString().slice(0, 10);
  }

  static ecartJours(a, b) {
    const ta = Ariane._versUTC(a);
    const tb = Ariane._versUTC(b);
    if (ta === null || tb === null) return 0;
    return Math.round((tb - ta) / 86400000);
  }
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

`node --test "tests/**/*.test.js" && node --check main.js`

- [ ] **Étape 5 : engager**

```bash
git add tests main.js && git commit -m "Arithmétique des jours pour la frise

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 2 : La disposition de l'arbre et la remontée des dates

**Fichiers :** créer `tests/gantt.test.js` ; modifier `main.js`.

**Interfaces :**
- `Ariane.disposerGantt(taches) -> lignes[]` où `taches` est un tableau
  de `{ ref, intitule, parent, debut, echeance, statut, avancement, jalon }`,
  `parent` étant une référence nue ou un lien `[[…]]`, et où chaque ligne rend
  `{ ref, intitule, niveau, debut, echeance, statut, avancement, jalon,
  aDesEnfants, propre: {debut, echeance} }`.

`debut` et `echeance` sont les dates **effectives** : celles de la tâche pour une
feuille, celles de sa descendance pour une méta-tâche. `propre` conserve les
dates écrites dans la note, dont le glissé a besoin.

L'ordre est celui d'un parcours en profondeur, les racines triées sur la date de
début puis sur la référence, pour que la frise se lise de haut en bas comme le
temps de gauche à droite.

- [ ] **Étape 1 : écrire le test qui échoue**

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const t = (ref, o) => Object.assign(
  { ref, intitule: ref, parent: '', debut: '', echeance: '', statut: 'à faire',
    avancement: 0, jalon: false }, o);

test('des tâches sans parent restent au premier niveau', () => {
  const l = Ariane.disposerGantt([t('T26-001'), t('T26-002')]);
  assert.deepEqual(l.map((x) => x.niveau), [0, 0]);
});

test('un enfant suit son parent et descend d un niveau', () => {
  const l = Ariane.disposerGantt([
    t('T26-001'), t('T26-002', { parent: '[[T26-001]]' })]);
  assert.deepEqual(l.map((x) => x.ref), ['T26-001', 'T26-002']);
  assert.deepEqual(l.map((x) => x.niveau), [0, 1]);
});

test('un parent écrit avec un alias est reconnu', () => {
  const l = Ariane.disposerGantt([
    t('T26-001'), t('T26-002', { parent: '[[T26-001|partie 2]]' })]);
  assert.equal(l[1].niveau, 1);
});

test('la barre d une méta-tâche couvre sa descendance', () => {
  const l = Ariane.disposerGantt([
    t('T26-001'),
    t('T26-002', { parent: 'T26-001', debut: '2026-09-05', echeance: '2026-09-20' }),
    t('T26-003', { parent: 'T26-001', debut: '2026-09-01', echeance: '2026-09-10' }),
  ]);
  const meta = l.find((x) => x.ref === 'T26-001');
  assert.equal(meta.debut, '2026-09-01');
  assert.equal(meta.echeance, '2026-09-20');
  assert.equal(meta.aDesEnfants, true);
});

test('la remontée traverse deux niveaux', () => {
  const l = Ariane.disposerGantt([
    t('T26-001'),
    t('T26-002', { parent: 'T26-001' }),
    t('T26-003', { parent: 'T26-002', debut: '2026-09-01', echeance: '2026-09-10' }),
  ]);
  assert.equal(l.find((x) => x.ref === 'T26-001').echeance, '2026-09-10');
});

test('les dates propres de la méta-tâche sont conservées à part', () => {
  const l = Ariane.disposerGantt([
    t('T26-001', { debut: '2026-08-01', echeance: '2026-08-02' }),
    t('T26-002', { parent: 'T26-001', debut: '2026-09-01', echeance: '2026-09-10' }),
  ]);
  const meta = l.find((x) => x.ref === 'T26-001');
  assert.equal(meta.debut, '2026-08-01');
  assert.equal(meta.propre.echeance, '2026-08-02');
  assert.equal(meta.echeance, '2026-09-10');
});

test('un parent inconnu ne fait pas disparaître la tâche', () => {
  const l = Ariane.disposerGantt([t('T26-002', { parent: 'T26-999' })]);
  assert.equal(l.length, 1);
  assert.equal(l[0].niveau, 0);
});

test('un cycle de parenté ne fait pas tourner la disposition à l infini', () => {
  const l = Ariane.disposerGantt([
    t('T26-001', { parent: 'T26-002' }), t('T26-002', { parent: 'T26-001' })]);
  assert.equal(l.length, 2);
});

test('un jalon n a pas de début, quelle que soit la note', () => {
  const l = Ariane.disposerGantt([
    t('T26-001', { jalon: true, debut: '2026-09-01', echeance: '2026-09-30' })]);
  assert.equal(l[0].debut, '');
  assert.equal(l[0].echeance, '2026-09-30');
});

test('les racines sont triées sur la date puis sur la référence', () => {
  const l = Ariane.disposerGantt([
    t('T26-003', { debut: '2026-09-10' }),
    t('T26-002', { debut: '2026-09-01' }),
    t('T26-001'),
  ]);
  assert.deepEqual(l.map((x) => x.ref), ['T26-002', 'T26-003', 'T26-001']);
});

test('une liste vide rend une liste vide', () => {
  assert.deepEqual(Ariane.disposerGantt([]), []);
  assert.deepEqual(Ariane.disposerGantt(null), []);
});
```

Une tâche sans date passe **après** celles qui en ont : elle n'a pas sa place sur
la frise et ira au tiroir des non planifiées.

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

- [ ] **Étape 3 : écrire la méthode**

```js
  // Référence nue d'un lien, alias compris : « [[T26-001|partie 2]] » rend
  // « T26-001 ».
  static refDeLien(v) {
    return String(v == null ? '' : v).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
  }

  // Disposition de la frise : parcours en profondeur, dates remontées sur les
  // méta-tâches. Les dates propres sont conservées à part, le glissé d'une
  // barre devant écrire celles de la note et non celles de sa descendance.
  // Un parent inconnu ou un cycle ne fait pas disparaître la tâche : elle
  // remonte à la racine, ce qui la rend visible plutôt que perdue.
  static disposerGantt(taches) {
    const liste = (taches || []).filter((x) => x && x.ref);
    const parRef = new Map(liste.map((x) => [x.ref, x]));
    const enfants = new Map();
    const racines = [];
    const parentDe = new Map();
    for (const x of liste) {
      const p = Ariane.refDeLien(x.parent);
      // Un cycle se casse à la remontée : dès qu'on repasse par la tâche
      // elle-même, on la traite comme une racine.
      let valide = p && parRef.has(p) && p !== x.ref;
      if (valide) {
        const vus = new Set([x.ref]);
        let cur = p;
        while (cur && parRef.has(cur)) {
          if (vus.has(cur)) { valide = false; break; }
          vus.add(cur);
          cur = Ariane.refDeLien(parRef.get(cur).parent);
        }
      }
      if (valide) {
        parentDe.set(x.ref, p);
        if (!enfants.has(p)) enfants.set(p, []);
        enfants.get(p).push(x);
      } else {
        racines.push(x);
      }
    }
    const trier = (a, b) => {
      const da = Ariane.jourValide(a.debut) || Ariane.jourValide(a.echeance);
      const db = Ariane.jourValide(b.debut) || Ariane.jourValide(b.echeance);
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.ref.localeCompare(b.ref);
    };
    const lignes = [];
    const descendre = (x, niveau) => {
      const fils = (enfants.get(x.ref) || []).slice().sort(trier);
      const jalon = !!x.jalon;
      const propre = {
        debut: jalon ? '' : Ariane.jourValide(x.debut),
        echeance: Ariane.jourValide(x.echeance),
      };
      const ligne = {
        ref: x.ref, intitule: x.intitule || x.ref, niveau,
        statut: x.statut || 'à faire', avancement: Number(x.avancement) || 0,
        jalon, aDesEnfants: fils.length > 0, propre,
        debut: propre.debut, echeance: propre.echeance,
      };
      lignes.push(ligne);
      const posees = [];
      for (const f of fils) posees.push(descendre(f, niveau + 1));
      if (fils.length) {
        const debuts = posees.map((p) => p.debut).filter(Boolean);
        const fins = posees.map((p) => p.echeance).filter(Boolean);
        if (!jalon && debuts.length) {
          ligne.debut = [ligne.debut, ...debuts].filter(Boolean).sort()[0];
        }
        if (fins.length) {
          const toutes = [ligne.echeance, ...fins].filter(Boolean).sort();
          ligne.echeance = toutes[toutes.length - 1];
        }
      }
      return ligne;
    };
    for (const r of racines.slice().sort(trier)) descendre(r, 0);
    return lignes;
  }
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

- [ ] **Étape 5 : engager**

---

### Tâche 3 : Décaler un sous-arbre, réordonner l'aval

**Fichiers :** créer `tests/decalage.test.js` ; modifier `main.js`.

**Interfaces :**
- `Ariane.decalerSousArbre(lignes, ref, jours) -> [{ref, debut, echeance}]`
- `Ariane.cascadeAval(lignes, bloquants, ref, jours) -> [{ref, debut, echeance}]`
  où `bloquants` est un tableau de `{de, vers}`.

Décaler une méta-tâche décale tout son sous-arbre. Réordonner l'aval décale la
tâche et tout ce qu'elle bloque, transitivement. Ni l'un ni l'autre ne touche
une date absente : une tâche non planifiée ne se planifie pas par ricochet.

- [ ] **Étape 1 : écrire le test qui échoue**

```js
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const lignes = [
  { ref: 'A', niveau: 0, propre: { debut: '2026-09-01', echeance: '2026-09-10' } },
  { ref: 'B', niveau: 1, propre: { debut: '2026-09-02', echeance: '2026-09-06' } },
  { ref: 'C', niveau: 1, propre: { debut: '', echeance: '' } },
  { ref: 'D', niveau: 0, propre: { debut: '2026-10-01', echeance: '2026-10-05' } },
];

test('décaler une méta-tâche emporte son sous-arbre', () => {
  const r = Ariane.decalerSousArbre(lignes, 'A', 3);
  assert.deepEqual(r.map((x) => x.ref).sort(), ['A', 'B']);
  assert.equal(r.find((x) => x.ref === 'A').debut, '2026-09-04');
  assert.equal(r.find((x) => x.ref === 'B').echeance, '2026-09-09');
});

test('une tâche du sous-arbre sans dates n est pas planifiée par ricochet', () => {
  assert.ok(!Ariane.decalerSousArbre(lignes, 'A', 3).some((x) => x.ref === 'C'));
});

test('décaler une feuille ne touche qu elle', () => {
  assert.deepEqual(Ariane.decalerSousArbre(lignes, 'B', 1).map((x) => x.ref), ['B']);
});

test('une tâche voisine de même niveau n est pas emportée', () => {
  assert.ok(!Ariane.decalerSousArbre(lignes, 'A', 3).some((x) => x.ref === 'D'));
});

test('décaler de zéro ne rend rien à écrire', () => {
  assert.deepEqual(Ariane.decalerSousArbre(lignes, 'A', 0), []);
});

test('la cascade suit les blocages, transitivement', () => {
  const l = [
    { ref: 'A', niveau: 0, propre: { debut: '2026-09-01', echeance: '2026-09-10' } },
    { ref: 'B', niveau: 0, propre: { debut: '2026-09-11', echeance: '2026-09-20' } },
    { ref: 'C', niveau: 0, propre: { debut: '2026-09-21', echeance: '2026-09-30' } },
  ];
  const r = Ariane.cascadeAval(l, [{ de: 'A', vers: 'B' }, { de: 'B', vers: 'C' }], 'A', 5);
  assert.deepEqual(r.map((x) => x.ref).sort(), ['A', 'B', 'C']);
  assert.equal(r.find((x) => x.ref === 'C').debut, '2026-09-26');
});

test('la cascade ne boucle pas sur un cycle de blocage', () => {
  const l = [
    { ref: 'A', niveau: 0, propre: { debut: '2026-09-01', echeance: '2026-09-10' } },
    { ref: 'B', niveau: 0, propre: { debut: '2026-09-11', echeance: '2026-09-20' } },
  ];
  const r = Ariane.cascadeAval(l, [{ de: 'A', vers: 'B' }, { de: 'B', vers: 'A' }], 'A', 5);
  assert.equal(r.length, 2);
});

test('une branche aval déjà à l écart n est pas oubliée pour autant', () => {
  const l = [
    { ref: 'A', niveau: 0, propre: { debut: '2026-09-01', echeance: '2026-09-10' } },
    { ref: 'B', niveau: 0, propre: { debut: '2027-01-01', echeance: '2027-01-05' } },
  ];
  const r = Ariane.cascadeAval(l, [{ de: 'A', vers: 'B' }], 'A', 5);
  assert.equal(r.find((x) => x.ref === 'B').debut, '2027-01-06');
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

- [ ] **Étape 3 : écrire les deux méthodes**

```js
  // Le sous-arbre d'une ligne, déduit des niveaux : tout ce qui suit et qui est
  // plus profond, jusqu'à retomber au niveau de départ.
  static _sousArbre(lignes, ref) {
    const i = (lignes || []).findIndex((x) => x.ref === ref);
    if (i === -1) return [];
    const out = [lignes[i]];
    for (let k = i + 1; k < lignes.length && lignes[k].niveau > lignes[i].niveau; k++) {
      out.push(lignes[k]);
    }
    return out;
  }

  // Décaler une barre emporte sa descendance : quand un chantier glisse d'un
  // mois, tout ce qu'il contient glisse avec lui.
  // Une tâche sans dates n'est pas planifiée par ricochet : ce serait décider à
  // la place de Monsieur.
  static decalerSousArbre(lignes, ref, jours) {
    const n = Number(jours) || 0;
    if (!n) return [];
    const out = [];
    for (const l of Ariane._sousArbre(lignes, ref)) {
      const d = Ariane.decalerJour(l.propre.debut, n);
      const e = Ariane.decalerJour(l.propre.echeance, n);
      if (!d && !e) continue;
      out.push({ ref: l.ref, debut: d, echeance: e });
    }
    return out;
  }

  // Réordonnancement de l'aval : la tâche et tout ce qu'elle bloque, de proche
  // en proche, du même nombre de jours. Le parcours retient les tâches déjà
  // vues, sans quoi un cycle de blocage le ferait tourner sans fin.
  static cascadeAval(lignes, bloquants, ref, jours) {
    const n = Number(jours) || 0;
    if (!n) return [];
    const suivants = new Map();
    for (const b of bloquants || []) {
      if (!b || !b.de || !b.vers) continue;
      if (!suivants.has(b.de)) suivants.set(b.de, []);
      suivants.get(b.de).push(b.vers);
    }
    const vus = new Set();
    const file = [ref];
    while (file.length) {
      const cur = file.shift();
      if (vus.has(cur)) continue;
      vus.add(cur);
      for (const s of suivants.get(cur) || []) file.push(s);
    }
    const out = [];
    for (const r of vus) {
      for (const l of Ariane._sousArbre(lignes, r)) {
        if (out.some((x) => x.ref === l.ref)) continue;
        const d = Ariane.decalerJour(l.propre.debut, n);
        const e = Ariane.decalerJour(l.propre.echeance, n);
        if (!d && !e) continue;
        out.push({ ref: l.ref, debut: d, echeance: e });
      }
    }
    return out;
  }
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

- [ ] **Étape 5 : engager**

---

### Tâche 4 : La vue, en lecture seule

**Fichiers :** modifier `main.js` (nouvelle vue `VueGanttTaches`), `styles.css`.

Cette tâche n'a pas de test automatisé : elle dessine. Elle est éprouvée à l'œil.

**Ce qu'elle rend :** deux colonnes. À gauche l'arbre, indenté sur le niveau,
chaque ligne repliable si elle a des enfants. À droite la frise, avec l'échelle
en tête, un trait vertical sur le jour même, et une barre par ligne.

**Barres :** de `debut` à `echeance`, remplies à hauteur de `avancement`,
teintées par `statut` avec les mêmes couleurs que les nœuds du canvas. Une
méta-tâche se dessine en barre de synthèse, plus fine et sans remplissage.

**Jalons :** un losange à l'échéance, et un trait vertical sur toute la hauteur.

**Zoom :** quatre crans, `semaine` 24 px par jour, `mois` 8, `trimestre` 3,
`année` 1. Le cran se garde dans les réglages sous `ganttZoom`.

**Tiroir :** au-dessus de la frise, les tâches sans aucune date, en pastilles.

**Repli :** cliquer une méta-tâche masque sa descendance. Les références repliées
se gardent en mémoire de la vue, pas dans les réglages.

- [ ] **Étape 1 : écrire la vue**, en suivant la structure de
  `VueIncoherencesTaches` : `getViewType` rendant `'zfa-taches-gantt'`,
  `getDisplayText`, `getIcon` rendant `'gantt-chart'`, `onOpen`, `dessiner`.
- [ ] **Étape 2 : styler** dans `styles.css`, classes préfixées `zfa-gantt-`.
- [ ] **Étape 3 : enregistrer la vue**, la commande « Tâches : frise », et une
  icône de ruban.
- [ ] **Étape 4 : éprouver dans le coffre** : créer trois tâches datées dont une
  méta-tâche et un jalon, ouvrir la frise, changer de zoom, replier.
- [ ] **Étape 5 : engager**

---

### Tâche 5 : Les gestes

**Fichiers :** modifier `main.js`.

- **Déplacer** une barre change les deux dates. **Tirer un bord** n'en change
  qu'une. L'écriture a lieu au lâcher, jamais pendant.
- Déplacer une **méta-tâche** appelle `decalerSousArbre`.
- Le glissé arrondit au jour : le décalage est
  `Math.round(pixels / pixelsParJour)`.
- **Tirer une pastille du tiroir sur la frise** donne à la tâche `debut` au jour
  du dépôt et `echeance` six jours plus tard. Pour un jalon, seule `echeance`.
- Quand le lâcher crée une incohérence de dates, un bouton **« décaler l'aval »**
  apparaît sur la barre et appelle `cascadeAval`.

- [ ] **Étape 1 : brancher les gestes** par `pointerdown`, `pointermove`,
  `pointerup`, en capturant le pointeur sur la barre.
- [ ] **Étape 2 : écrire au lâcher** par `processFrontMatter`, en une passe pour
  toutes les tâches rendues par la fonction pure.
- [ ] **Étape 3 : éprouver dans le coffre** : déplacer une feuille, étirer un
  bord, déplacer une méta-tâche et vérifier que les enfants suivent, déposer une
  pastille du tiroir.
- [ ] **Étape 4 : engager**

---

### Tâche 6 : Les flèches de dépendance

**Fichiers :** modifier `main.js`, `styles.css`.

Un calque SVG superposé à la frise, tracé après les barres. Chaque `bloque-par`
donne une flèche coudée du bord droit du bloquant au bord gauche du bloqué, avec
son libellé au milieu si elle en a un. Une flèche dont les dates se contredisent
est **rouge**, comme dans le canvas.

Les flèches ne se tracent pas ici : le canvas seul crée les liens.

- [ ] **Étape 1 : dessiner le calque**, redessiné à chaque changement de zoom,
  de repli et à la fin d'un glissé.
- [ ] **Étape 2 : éprouver dans le coffre** contre un canvas portant deux
  flèches, dont une fautive.
- [ ] **Étape 3 : engager**

---

## Après le chantier

Documenter dans les deux README, puis publier `2.77.0`. Le chantier 6, l'export
en CSV, devient alors trivial et peut suivre immédiatement.
