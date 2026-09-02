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

test('épine dégagée à gauche de la mère ET de la première fille datée', () => {
  const b = { mx: 100, pBottom: 57, degage: DEGAGE, kids: [
    { ref: 'A', xg: 130, cy: 100 }, { ref: 'B', xg: 110, cy: 150 }] };
  // La mère (100) est plus à gauche que B (110) : c'est elle qui commande.
  assert.equal(Ariane._epineAccolade(b, 0, null), 100 - DEGAGE);
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

test('filles décalées : épine à gauche de la mère, un coude par fille', () => {
  const mx = 100, pBottom = 57;
  const kids = [
    { ref: 'A', xg: 130, cy: 100 },
    { ref: 'B', xg: 160, cy: 150 },
  ];
  const b = { mx, pBottom, R, degage: DEGAGE, kids };
  const d = Ariane._cheminAccolade(b, 0, null);
  const sx = mx - DEGAGE; // la mère est le point le plus à gauche
  // L'amorce quitte le coin inférieur gauche de la mère vers l'épine dégagée.
  assert.ok(d.startsWith('M ' + mx + ' ' + pBottom + ' Q ' + sx + ' ' + pBottom),
    'amorce au coin de la mère : ' + d);
  for (const k of kids) {
    assert.ok(d.includes(' Q ' + sx + ' ' + k.cy + ' '), 'coude arrondi pour ' + k.ref + ' : ' + d);
    assert.ok(d.includes('L ' + k.xg + ' ' + k.cy),
      'arrivée au centre du bord gauche de ' + k.ref + ' : ' + d);
  }
});

test('mère plus à gauche que ses filles : l épine ne la traverse jamais', () => {
  // Tri actif ou regroupement : la mère T020 démarre à gauche de ses filles ;
  // une épine calée sur les seules filles passait EN TRAVERS de sa barre.
  const b = { mx: 55, pBottom: 150, R, degage: DEGAGE, kids: [
    { ref: 'F', xg: 130, cy: 45 }, { ref: 'G', xg: 517, cy: 180 }] };
  const sx = Ariane._epineAccolade(b, 0, null);
  assert.ok(sx <= b.mx - DEGAGE, 'épine à gauche de la mère : ' + sx);
  const d = Ariane._cheminAccolade(b, 0, null);
  // Famille éparpillée des deux côtés : rail droit couvrant toute la famille…
  assert.ok(d.startsWith('M ' + sx + ' 45 L ' + sx + ' 180'),
    'rail couvrant la famille : ' + d);
  // …et la mère le rejoint au coin en trait droit (filles des deux côtés).
  assert.ok(d.includes('M 55 150 L ' + sx + ' 150'),
    'trait droit au coin de la mère : ' + d);
});

test('une fille sans date ne tire pas l épine et rejoint sa bande en direct', () => {
  const b = { mx: 100, pBottom: 150, R, degage: DEGAGE, kids: [
    { ref: 'D', xg: 300, cy: 100 },
    { ref: 'S', xg: 0, cy: 130, sansDate: true }] };
  const sx = Ariane._epineAccolade(b, 0, null);
  assert.equal(sx, 100 - DEGAGE,
    'la bande à x=0 ne doit pas attirer l épine (la mère commande)');
  const d = Ariane._cheminAccolade(b, 0, null);
  assert.ok(d.includes('M ' + sx + ' 130 L 0 130'),
    'trait direct vers la bande, à gauche de l épine : ' + d);
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

test('fille au-dessus de sa mère (frise éparpillée) : rail + trait droit, pas de grande courbe', () => {
  // Tri actif ou regroupement : l'ordre d'affichage ne suit plus l'arbre et
  // une fille peut se retrouver AU-DESSUS de sa mère (cas T010/T020). Le rail
  // doit couvrir toute la famille, mais la LIAISON reste le même petit coude
  // qu'ailleurs : une grande courbe balayée était jugée brouillonne.
  const mx = 100, pBottom = 150;
  const b = { mx, pBottom, R, degage: DEGAGE, kids: [
    { ref: 'Haute', xg: mx, cy: 45 },     // même début que la mère, plus haut
    { ref: 'Basse', xg: 560, cy: 180 },   // sous la mère, décalée à droite
  ] };
  const d = Ariane._cheminAccolade(b, 0, null);
  const sx = mx - DEGAGE;
  // Le rail couvre du haut de la famille au bas…
  assert.ok(d.startsWith('M ' + sx + ' 45 L ' + sx + ' 180'),
    'rail couvrant la famille : ' + d);
  // …la mère le rejoint en trait droit (filles des deux côtés)…
  assert.ok(d.includes('M ' + mx + ' ' + pBottom + ' L ' + sx + ' ' + pBottom),
    'trait droit au coin de la mère : ' + d);
  // …et chaque fille garde son arrivée au centre de son bord gauche.
  assert.ok(d.includes('L ' + mx + ' 45'), 'arrivée fille haute : ' + d);
  assert.ok(d.includes('L 560 180'), 'arrivée fille basse : ' + d);
  // Aucune courbe ne balaie plus qu'un rayon de coude (8 px) : tout coude Q
  // part d'à moins d'un rayon du point visé.
  for (const m of d.matchAll(/ Q (\S+) (\S+) (\S+) (\S+)/g)) {
    const delta = Math.abs(parseFloat(m[4]) - parseFloat(m[2]));
    assert.ok(delta <= R, 'coude de rayon ' + delta + ' px max attendu : ' + d);
  }
});

test('toutes les filles au-dessus de la mère : le même petit angle droit, tourné vers le haut', () => {
  // Cas qui produisait la grande courbe balayée : l'amorce ne grimpe plus
  // jusqu'à la fille haute, elle tourne au coin de la mère comme partout.
  const mx = 100, pBottom = 150;
  const b = { mx, pBottom, R, degage: DEGAGE, kids: [
    { ref: 'Haute', xg: 140, cy: 60 }, { ref: 'Basse', xg: 160, cy: 100 }] };
  const d = Ariane._cheminAccolade(b, 0, null);
  const sx = mx - DEGAGE;
  const rc = Math.min(R, DEGAGE);
  // Le rail part de la fille haute et descend jusqu'au coin de la mère…
  assert.ok(d.startsWith('M ' + sx + ' 60 L ' + sx + ' ' + (pBottom - rc)),
    'rail au-dessus du coin de la mère : ' + d);
  // …tourne au coin par le MÊME coude arrondi que dans l'autre sens…
  assert.ok(d.includes(' Q ' + sx + ' ' + pBottom + ' ' + (sx + rc) + ' ' + pBottom),
    'coude au coin de la mère, tourné vers le haut : ' + d);
  // …et chaque fille reçoit son coude habituel.
  assert.ok(d.includes(' Q ' + sx + ' 100 '), 'coude fille basse : ' + d);
  assert.ok(d.includes('L 140 60'), 'arrivée fille haute : ' + d);
});
