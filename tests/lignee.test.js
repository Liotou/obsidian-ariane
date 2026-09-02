const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

// Ligne rendue minimale : ref, parent et point d'accroche (xg = début de la
// barre, cy = centre vertical de la barre).
const l = (ref, parent, xg, cy) => ({ ref, parent, _anc: { xg, xd: xg + 100, cy } });
const parRef = (lignes) => new Map(lignes.map((x) => [x.ref, x]));

/* ------------------------------ la lignée ------------------------------ */

test('survol de la mère : toute la descendance est dans la lignée', () => {
  const pr = parRef([
    l('M', '', 100, 50),
    l('A', 'M', 100, 100),
    l('B', 'M', 160, 150),
  ]);
  const lig = Ariane.ligneeDe('M', pr);
  assert.deepEqual([...lig].sort(), ['A', 'B', 'M']);
});

test('survol d une fille : ses sœurs sont comprises (trait sur toutes les filles)', () => {
  const pr = parRef([
    l('M', '', 100, 50),
    l('A', 'M', 100, 100),
    l('B', 'M', 160, 150),
    l('C', 'M', 120, 200),
  ]);
  const lig = Ariane.ligneeDe('B', pr);
  assert.deepEqual([...lig].sort(), ['A', 'B', 'C', 'M']);
});

test('survol d une petite-fille : la famille de la racine au complet', () => {
  const pr = parRef([
    l('G', '', 100, 50),
    l('M1', 'G', 100, 100),
    l('M2', 'G', 140, 150),
    l('F', 'M1', 120, 200),
  ]);
  const lig = Ariane.ligneeDe('F', pr);
  assert.deepEqual([...lig].sort(), ['F', 'G', 'M1', 'M2']);
});

test('tâche sans parent ni enfant : lignée réduite à elle-même', () => {
  const pr = parRef([l('Solo', '', 100, 50)]);
  assert.deepEqual([...Ariane.ligneeDe('Solo', pr)], ['Solo']);
});

test('parent absent du rendu : la lignée s arrête à la racine rendue', () => {
  const pr = parRef([l('F', 'Fantôme', 100, 100)]);
  assert.deepEqual([...Ariane.ligneeDe('F', pr)], ['F']);
});

/* ---------------------------- l'accolade ------------------------------- */

const R = 8;
const DEGAGE = 7;

test('épine dégagée à gauche du début de la première fille', () => {
  const b = { mx: 100, pBottom: 57, degage: DEGAGE, kids: [
    { ref: 'A', xg: 130, cy: 100 }, { ref: 'B', xg: 110, cy: 150 }] };
  assert.equal(Ariane._epineAccolade(b, 0, null), 110 - DEGAGE);
});

test('épine jamais négative (début de frise)', () => {
  const b = { mx: 0, pBottom: 57, degage: DEGAGE, kids: [{ ref: 'A', xg: 3, cy: 100 }] };
  assert.equal(Ariane._epineAccolade(b, 0, null), 0);
});

test('fille au même début que la mère : petit angle droit sous son coin, épine dégagée', () => {
  const mx = 100, pBottom = 57, cy = 100;
  const b = { mx, pBottom, R, degage: DEGAGE, kids: [{ ref: 'A', xg: mx, cy }] };
  const d = Ariane._cheminAccolade(b, 0, null);
  // Le trait QUITTE le coin inférieur gauche de la mère…
  assert.ok(d.startsWith('M ' + mx + ' ' + pBottom + ' Q'),
    'doit démarrer au coin inférieur gauche de la mère avec un coude : ' + d);
  // …l'épine est dégagée À GAUCHE des barres (plus de segment vertical collé)…
  const sx = mx - DEGAGE;
  assert.ok(d.includes(' Q ' + sx + ' ' + pBottom + ' ' + sx + ' ' + (pBottom + DEGAGE)),
    'coude vers l\'épine dégagée attendu : ' + d);
  // …et l'arrivée se pose au CENTRE de l'extrémité gauche de la barre fille.
  assert.ok(d.includes('L ' + mx + ' ' + cy), 'arrivée au centre du bord gauche : ' + d);
});

test('filles décalées : un coude par fille, arrivée perpendiculaire au bord gauche', () => {
  const mx = 100, pBottom = 57;
  const kids = [
    { ref: 'A', xg: 130, cy: 100 },
    { ref: 'B', xg: 160, cy: 150 },
  ];
  const b = { mx, pBottom, R, degage: DEGAGE, kids };
  const d = Ariane._cheminAccolade(b, 0, null);
  const sx = 130 - DEGAGE;
  // L'épine démarre sous la mère (son début est sous son emprise, pas un coude).
  assert.ok(d.startsWith('M ' + sx + ' ' + pBottom), 'épine sous la mère : ' + d);
  for (const k of kids) {
    assert.ok(d.includes(' Q ' + sx + ' ' + k.cy + ' '), 'coude arrondi pour ' + k.ref + ' : ' + d);
    assert.ok(d.includes('L ' + k.xg + ' ' + k.cy),
      'arrivée au centre du bord gauche de ' + k.ref + ' : ' + d);
  }
});

test('première fille décalée de moins du dégagement : coude de départ quand même', () => {
  const mx = 100, pBottom = 57;
  const b = { mx, pBottom, R, degage: DEGAGE,
    kids: [{ ref: 'A', xg: 103, cy: 100 }] };
  const d = Ariane._cheminAccolade(b, 0, null);
  assert.ok(d.startsWith('M ' + mx + ' ' + pBottom + ' Q'),
    'la 1re fille démarre presque avec la mère : coude attendu : ' + d);
  assert.ok(d.includes('L 103 100'), 'arrivée au centre du bord gauche : ' + d);
});

test('glissé : la fille déplacée emporte son coude, l\'épine suit le minimum', () => {
  const mx = 100, pBottom = 57;
  const kids = [
    { ref: 'A', xg: 130, cy: 100 },
    { ref: 'B', xg: 160, cy: 150 },
  ];
  const b = { mx, pBottom, R, degage: DEGAGE, kids };
  const d = Ariane._cheminAccolade(b, -60, 'B'); // B repart à gauche
  const sx = 100 - DEGAGE; // B (100) passe devant A (130)
  assert.ok(d.includes(' Q ' + sx + ' 100 '), 'coude de A suit la nouvelle épine : ' + d);
  assert.ok(d.includes('L 100 150'), 'arrivée de B déplacée : ' + d);
});

test('fille collée à l\'épine (x=0) : trait direct sans coude négatif', () => {
  const b = { mx: 0, pBottom: 57, R, degage: DEGAGE,
    kids: [{ ref: 'A', xg: 0, cy: 100 }] };
  const d = Ariane._cheminAccolade(b, 0, null);
  assert.ok(d.includes('M 0 100 L 0 100'), 'trait direct attendu : ' + d);
});

test('fille au-dessus de sa mère (frise éparpillée) : l\'épine monte jusqu à elle', () => {
  // Tri actif ou regroupement : l'ordre d'affichage ne suit plus l'arbre et
  // une fille peut se retrouver AU-DESSUS de sa mère (cas T010/T020). Le
  // sommet de l'épine doit atteindre la première fille, sans quoi son coude
  // flotte déconnecté du trait.
  const mx = 100, pBottom = 150;
  const b = { mx, pBottom, R, degage: DEGAGE, kids: [
    { ref: 'Haute', xg: mx, cy: 45 },     // même début que la mère, plus haut
    { ref: 'Basse', xg: 560, cy: 180 },   // sous la mère, décalée à droite
  ] };
  const d = Ariane._cheminAccolade(b, 0, null);
  const sx = mx - DEGAGE;
  // La courbe d'amorce quitte le coin de la mère et grimpe jusqu'à la fille
  // haute : l'épine démarre à sa hauteur, plus bas elle la laisserait flotte.
  assert.ok(d.startsWith('M ' + mx + ' ' + pBottom + ' Q ' + sx + ' ' + pBottom
      + ' ' + sx + ' 45'),
    'l amorce doit monter jusqu à la fille haute : ' + d);
  // L'épine redescend jusqu'à la fille la plus basse…
  assert.ok(d.includes('L ' + sx + ' 180'), 'épine jusqu à la plus basse : ' + d);
  // …et chaque fille reçoit son arrivée au centre de son bord gauche.
  assert.ok(d.includes('L ' + mx + ' 45'), 'arrivée fille haute : ' + d);
  assert.ok(d.includes('L 560 180'), 'arrivée fille basse : ' + d);
});
