const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const carte = (x, y, w, h) => ({ x, y, w: w || 210, h: h || 58 });
const SORTIE = { x: 210, y: 29 };
const SOURCE = carte(0, 0);

// Cible franchement à droite de la source, même ligne.
const CIBLE = () => ({ x: 400, y: 0, w: 210, h: 58, ancreGauche: 29 });
const TRACE = (plus) => Object.assign({
  x1: 210, y1: 29, source: SOURCE, cible: CIBLE(),
  obstacles: [], mode: 'courbe', marge: 12, ecart: 22,
}, plus);

const jambesLibres = (pts, obstacles, marge) => {
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    if (Ariane.segmentFrappe(p.x, p.y, q.x, q.y, obstacles, marge)) return false;
    if (Ariane.segmentFrappe(p.x, p.y, q.x, q.y, [SOURCE, CIBLE()], 0)) return false;
  }
  return true;
};

test('sans obstacle, le tracé simple est gardé tel quel (courbe)', () => {
  const r = Ariane.traceFlecheArticulation(TRACE());
  assert.equal(r.detour, false);
  assert.equal(r.cote, 'gauche');
  assert.equal(r.d, Ariane._cheminFleche(210, 29, 400, 29));
});

test('sans obstacle, le tracé simple est gardé tel quel (angulaire)', () => {
  const r = Ariane.traceFlecheArticulation(TRACE({ mode: 'angulaire' }));
  assert.equal(r.detour, false);
  assert.equal(r.d, 'M 210 29 H 305 V 29 H 400');
});

test('une carte dans l entre-deux détourne et passe par-dessus', () => {
  const obst = carte(280, 14, 60, 30);
  const r = Ariane.traceFlecheArticulation(TRACE({ obstacles: [obst] }));
  assert.equal(r.detour, true);
  assert.equal(r.cote, 'gauche');
  assert.match(r.d, /Q/); // coins arrondis en mode courbe
  const route = Ariane.routeFlecheArticulation(SORTIE, CIBLE(), [obst],
    { marge: 12, ecart: 22, source: SOURCE });
  assert.ok(route, 'un routage existe');
  assert.ok(route.points.some((p) => p.y === 2), 'couloir au-dessus de la carte (14 − 12)');
  assert.ok(jambesLibres(route.points, [obst], 12), 'toutes les jambes évitent la carte');
});

test('le routage respecte la marge demandée', () => {
  const obst = carte(280, 14, 60, 30);
  const route = Ariane.routeFlecheArticulation(SORTIE, CIBLE(), [obst],
    { marge: 12, ecart: 22, source: SOURCE });
  for (let i = 1; i < route.points.length; i++) {
    const p = route.points[i - 1], q = route.points[i];
    assert.equal(Ariane.segmentFrappe(p.x, p.y, q.x, q.y, [obst], 6), false,
      'jamais à moins de 6 px d une carte quand la marge est 12');
  }
});

test('la cible au-dessus reçoit la flèche par le bas', () => {
  const cible = { x: 210, y: -200, w: 210, h: 58, ancreGauche: -171 };
  const r = Ariane.traceFlecheArticulation(TRACE({ cible }));
  assert.equal(r.detour, true);
  assert.equal(r.cote, 'bas');
  assert.deepEqual([r.x2, r.y2], [315, -142]);
});

test('la cible en dessous reçoit la flèche par le haut', () => {
  const cible = { x: 210, y: 300, w: 210, h: 58, ancreGauche: 329 };
  const r = Ariane.traceFlecheArticulation(TRACE({ cible }));
  assert.equal(r.detour, true);
  assert.equal(r.cote, 'haut');
  assert.deepEqual([r.x2, r.y2], [315, 300]);
});

test('la cible à gauche n est jamais entrée par la droite', () => {
  const cible = { x: -300, y: 0, w: 210, h: 58, ancreGauche: 29 };
  const r = Ariane.traceFlecheArticulation(TRACE({ cible }));
  assert.equal(r.detour, true);
  assert.equal(r.cote, 'gauche', 'contour par le couloir du haut, entrée au bord gauche');
  assert.notEqual(r.x2, cible.x + 210, 'le bord droit de la cible est réservé aux sorties');
  assert.deepEqual([r.x2, r.y2], [-300, 29]);
  const route = Ariane.routeFlecheArticulation(SORTIE, cible, [],
    { marge: 12, ecart: 22, source: SOURCE });
  assert.ok(route.points.some((p) => p.y === -12), 'le couloir passe au-dessus de la source');
  assert.ok(jambesLibres(route.points, [], 12), 'ni la source ni la cible ne sont frôlées');
});

test('aucun chemin possible : repli sur le tracé historique', () => {
  const mur = carte(200, -600, 200, 1300);
  const r = Ariane.traceFlecheArticulation(TRACE({ obstacles: [mur] }));
  assert.equal(r.detour, false);
  assert.equal(r.cote, 'gauche');
  assert.match(r.d, /^M 210 29 C/);
  assert.equal(Ariane.routeFlecheArticulation(SORTIE, CIBLE(), [mur],
    { marge: 12, ecart: 22, source: SOURCE }), null);
});

test('le tracé routé en mode angulaire n a que des angles vifs', () => {
  const obst = carte(280, 14, 60, 30);
  const r = Ariane.traceFlecheArticulation(TRACE({ obstacles: [obst], mode: 'angulaire' }));
  assert.equal(r.detour, true);
  assert.doesNotMatch(r.d, /[CQ]/);
  assert.match(r.d, /L/);
});

test('segmentFrappe : jambes horizontales, verticales, obliques et marge', () => {
  const c = carte(40, 0, 20, 20);
  assert.equal(Ariane.segmentFrappe(0, 10, 100, 10, [c], 0), true);
  assert.equal(Ariane.segmentFrappe(0, 30, 100, 30, [c], 0), false);
  assert.equal(Ariane.segmentFrappe(0, 0, 100, 0, [c], 0), false, 'le bord ne compte pas');
  assert.equal(Ariane.segmentFrappe(50, -10, 50, 30, [c], 0), true);
  const diag = carte(40, 40, 20, 20);
  assert.equal(Ariane.segmentFrappe(0, 0, 100, 100, [diag], 0), true, 'oblique échantillonné');
  assert.equal(Ariane.segmentFrappe(0, 100, 100, 0, [diag], 0), true, 'oblique inverse');
  assert.equal(Ariane.segmentFrappe(0, 100, 100, 0, [carte(500, 500)], 0), false);
  assert.equal(Ariane.segmentFrappe(0, 25, 100, 25, [c], 0), false);
  assert.equal(Ariane.segmentFrappe(0, 25, 100, 25, [c], 6), true, 'la marge gonfle la carte');
  assert.equal(Ariane.segmentFrappe(0, 10, 100, 10, null, 0), false);
});

test('flecheEncombee : la Bézier échantillonnée voit la carte', () => {
  assert.equal(Ariane.flecheEncombee(210, 29, 305, 400, 29, [carte(280, 14, 60, 30)], 0), true);
  assert.equal(Ariane.flecheEncombee(210, 29, 305, 400, 29, [carte(280, 60, 60, 30)], 0), false);
  assert.equal(Ariane.flecheEncombee(210, 29, 305, 400, 29, [], 0), false);
});

test('cheminPolyligne : déduplication, coins arrondis, rayon borné', () => {
  assert.equal(Ariane.cheminPolyligne([{ x: 0, y: 0 }, { x: 100, y: 0 }], 12),
    'M 0 0 L 100 0');
  assert.equal(Ariane.cheminPolyligne(
    [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }], 12), 'M 0 0 L 100 0');
  const vif = Ariane.cheminPolyligne([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }], 0);
  assert.equal(vif, 'M 0 0 L 100 0 L 100 80');
  const rond = Ariane.cheminPolyligne([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }], 12);
  assert.match(rond, /L 88 0 Q 100 0 100 12/);
  const serre = Ariane.cheminPolyligne([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 80 }], 12);
  assert.match(serre, /L 2 0 Q 4 0 4 2/, 'rayon borné à la demi-longueur du côté');
  assert.equal(Ariane.cheminPolyligne([], 12), '');
  assert.equal(Ariane.cheminPolyligne(null, 12), '');
});
