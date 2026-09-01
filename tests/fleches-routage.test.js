const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const MoteurArticulation = Ariane._test.MoteurArticulation;

// Batch 2, idées 8 et 9 : routage des flèches autour des cartes (jamais
// sur une carte, entrée jamais par le bord droit, réservé aux sorties) et
// repli quand aucun chemin n'existe. Les fonctions sont pures : on éprouve
// la géométrie hors Obsidian.

const W = 210;      // ARTIC_W
const H = 58;       // ARTIC_H
const M = 14;       // MARGE_FLECHE

const rect = (x, y) => ({ x0: x, y0: y, x1: x + W, y1: y + H });

// Distance minimale d'une polyligne à un rectangle (échantillonnage dense) :
// le tracé doit rester à la marge des cartes qu'il contourne (tolérance d'un
// demi-pixel pour les contacts au bord des lignes dégagées).
function ecartMin(pts, o) {
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n;
      const dx = Math.max(o.x0 - x, 0, x - o.x1);
      const dy = Math.max(o.y0 - y, 0, y - o.y1);
      min = Math.min(min, Math.hypot(dx, dy));
    }
  }
  return min;
}

// Moteur factice : juste ce que lit _traceArete.
function moteur(cartes, mode) {
  const pos = new Map(cartes.map((c) => [c.ref, { x: c.x, y: c.y }]));
  const noeuds = new Map(cartes.map((c) => [c.ref, { ref: c.ref, h: c.h || H }]));
  return {
    greffon: { settings: mode ? { articulationFleches: mode } : {} },
    _pt: (ref) => pos.get(ref) || { x: 0, y: 0 },
    _noeudsParRef: noeuds,
    _chemin: MoteurArticulation.prototype._chemin,
  };
}

/* ------------------------ routageOrtho ------------------------ */

test('routage : cible à droite et dégagée, la flèche est un segment droit', () => {
  const r = Ariane.routageOrtho(W, H / 2, 800, H / 2, 'gauche',
    [rect(0, 0), rect(800, 0)], M);
  assert.ok(r);
  assert.equal(r.pts.length, 2);
  assert.deepEqual(r.pts, [[W, H / 2], [800, H / 2]]);
});

test('routage : une carte dans l\'entre-deux, la flèche la contourne', () => {
  const r = Ariane.routageOrtho(W, H / 2, 900, H / 2, 'gauche',
    [rect(0, 0), rect(900, 0), { x0: 400, y0: -60, x1: 610, y1: -2 }], M);
  assert.ok(r);
  // Le tracé tient la marge devant la carte parasite, la source et la cible.
  assert.ok(ecartMin(r.pts, { x0: 400, y0: -60, x1: 610, y1: -2 }) >= M - 0.5);
  assert.ok(ecartMin(r.pts.slice(1), rect(0, 0)) >= M - 0.5);
  assert.ok(ecartMin(r.pts.slice(0, -1), rect(900, 0)) >= M - 0.5);
});

test('routage : passage par une brèche entre deux cartes du mur', () => {
  const murHaut = { x0: 400, y0: -220, x1: 610, y1: -20 };
  const murBas = { x0: 400, y0: 20, x1: 610, y1: 220 };
  const r = Ariane.routageOrtho(W, H / 2, 900, H / 2, 'gauche',
    [rect(0, 0), rect(900, 0), murHaut, murBas], M);
  assert.ok(r);
  assert.ok(ecartMin(r.pts, murHaut) >= M - 0.5);
  assert.ok(ecartMin(r.pts, murBas) >= M - 0.5);
  // Le tracé franchit l'axe du mur DANS la brèche (pas par-dessus).
  const croisements = [];
  for (let i = 1; i < r.pts.length; i++) {
    const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
    if (ax !== bx && (ax - 505) * (bx - 505) <= 0) {
      croisements.push(ay + (by - ay) * (505 - ax) / (bx - ax));
    }
  }
  assert.ok(croisements.some((y) => y > -20 && y < 20), JSON.stringify(r.pts));
});

test('routage : cible à gauche, la flèche ne repasse pas sur sa source', () => {
  const r = Ariane.routageOrtho(W, H / 2, -400, H / 2, 'gauche',
    [rect(0, 0), rect(-400, 0)], M);
  assert.ok(r);
  // Le point de départ (posé sur le bord de la source) écarté, plus aucun
  // sommet ne touche la source ni la cible.
  assert.ok(ecartMin(r.pts.slice(1), rect(0, 0)) >= M - 0.5);
  assert.ok(ecartMin(r.pts.slice(0, -1), rect(-400, 0)) >= M - 0.5);
});

test('routage : porte d\'entrée engluée, aucun chemin -> null', () => {
  // La cible est collée contre une carte qui recouvre sa porte d'entrée
  // (bord gauche à la marge) : aucune approche n'est possible.
  const source = { x0: -W, y0: -H / 2, x1: 0, y1: H / 2 };
  const cible = { x0: 100, y0: -H / 2, x1: 100 + W, y1: H / 2 };
  const glue = { x0: 60, y0: -19, x1: 95, y1: 19 };
  const r = Ariane.routageOrtho(0, 0, 100, 0, 'gauche',
    [source, cible, glue], M);
  assert.equal(r, null);
});

/* ------------------------ cheminPolyligne ---------------------- */

test('cheminPolyligne : sommets alignés supprimés', () => {
  const d = Ariane.cheminPolyligne([[0, 0], [100, 0], [200, 0]], 0);
  assert.equal(d, 'M 0 0 L 200 0');
});

test('cheminPolyligne : angulaire, angles vifs', () => {
  const d = Ariane.cheminPolyligne([[0, 0], [100, 0], [100, 80]], 0);
  assert.equal(d, 'M 0 0 L 100 0 L 100 80');
});

test('cheminPolyligne : courbe, coude arrondi au rayon demandé', () => {
  const d = Ariane.cheminPolyligne([[0, 0], [100, 0], [100, 80]], 9);
  assert.ok(d.startsWith('M 0 0'));
  assert.ok(d.includes('Q 100 0, 100 9'));
  assert.ok(d.endsWith('L 100 80'));
});

test('cheminPolyligne : l\'arrondi plafonne sur les segments courts', () => {
  const d = Ariane.cheminPolyligne([[0, 0], [5, 0], [5, 3]], 9);
  assert.ok(d.includes('Q 5 0, 5 1.5'));
});

test('cheminPolyligne : polyligne dégénérée -> chaîne vide', () => {
  assert.equal(Ariane.cheminPolyligne([], 0), '');
  assert.equal(Ariane.cheminPolyligne([[1, 2]], 0), '');
});

/* ------------------------- pointMilieu ------------------------- */

test('pointMilieu : à mi-parcours de la polyligne, pas du rectangle englobant', () => {
  // Longueur totale 16 : moitié = 6 sur le premier segment, 2 sur le second.
  assert.deepEqual(Ariane.pointMilieu([[0, 0], [6, 0], [6, 10]]), { x: 6, y: 2 });
  assert.deepEqual(Ariane.pointMilieu([[0, 0], [10, 0]]), { x: 5, y: 0 });
});

/* ------------------------- _traceArete ------------------------- */

test('arête : l\'ancre d\'arrivée n\'est jamais sur le bord droit de la cible', () => {
  // Cible à l'aplomb (au-dessus) de la source : l'ancien tracé entrait par
  // la droite ; l'ancre doit être au gauche, en haut ou en bas.
  const m = moteur([{ ref: 'A', x: 0, y: 100 }, { ref: 'B', x: 0, y: -300 }]);
  const tr = MoteurArticulation.prototype._traceArete.call(m, 'A', 'B', 'hier');
  assert.notEqual(tr.x2, 0 + W); // bord droit interdit
  assert.ok(tr.x2 === 0 || tr.y2 === -300 || tr.y2 === -300 + H);
});

test('arête : entrée à gauche quand la cible est à droite et dégagée', () => {
  const m = moteur([{ ref: 'A', x: 0, y: 0 }, { ref: 'B', x: 500, y: 0 }]);
  const tr = MoteurArticulation.prototype._traceArete.call(m, 'A', 'B', 'hier');
  assert.equal(tr.x2, 500);
  assert.equal(tr.y2, 18); // ancre « hier » : H/2 - 11
  assert.equal(tr.d, 'M ' + W + ' 18 L 500 18');
});

test('arête : aucune chemin possible -> repli sur le tracé direct à gauche', () => {
  const origine = Ariane.routageOrtho;
  Ariane.routageOrtho = () => null;
  try {
    const m = moteur([{ ref: 'A', x: 0, y: 0 }, { ref: 'B', x: -500, y: 0 }]);
    const tr = MoteurArticulation.prototype._traceArete.call(m, 'A', 'B', 'bloque');
    assert.equal(tr.x2, -500);           // bord gauche de la cible
    assert.equal(tr.y2, 40);             // ancre « bloque » : H/2 + 11
    assert.ok(tr.d.startsWith('M '));    // tracé direct (Bézier)
  } finally {
    Ariane.routageOrtho = origine;
  }
});

test('arête : mode angulaire, le tracé ne comporte que des lignes', () => {
  const m = moteur(
    [{ ref: 'A', x: 0, y: 0 }, { ref: 'B', x: -500, y: 0 }], 'angulaire');
  const tr = MoteurArticulation.prototype._traceArete.call(m, 'A', 'B', 'hier');
  assert.ok(!tr.d.includes(' Q ') && !tr.d.includes(' C '));
  assert.ok(tr.d.startsWith('M '));
});
