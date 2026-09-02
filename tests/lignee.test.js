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
  const b = { mx: 100, pCy: 57, degage: DEGAGE, kids: [
    { ref: 'A', xg: 130, cy: 100 }, { ref: 'B', xg: 110, cy: 150 }] };
  // La mère (100) est plus à gauche que B (110) : c'est elle qui commande.
  assert.equal(Ariane._epineAccolade(b, 0, null), 100 - DEGAGE);
});

test('épine jamais négative (début de frise)', () => {
  const b = { mx: 0, pCy: 57, degage: DEGAGE, kids: [{ ref: 'A', xg: 3, cy: 100 }] };
  assert.equal(Ariane._epineAccolade(b, 0, null), 0);
});

test('fille au même début que la mère : petit angle droit à son bord gauche, épine dégagée', () => {
  const mx = 100, pCy = 57, cy = 100;
  const b = { mx, pCy, degage: DEGAGE, kids: [{ ref: 'A', xg: mx, cy }] };
  const d = Ariane._cheminAccolade(b, 0, null);
  // Le trait QUITTE le centre du bord gauche de la mère et tourne à angle
  // droit vers l'épine, dégagée À GAUCHE des barres…
  const sx = mx - DEGAGE;
  assert.ok(d.startsWith('M ' + mx + ' ' + pCy + ' L ' + sx + ' ' + pCy + ' L ' + sx),
    'angle droit au bord gauche de la mère attendu : ' + d);
  // …et l'arrivée se pose au CENTRE de l'extrémité gauche de la barre fille.
  assert.ok(d.includes('L ' + mx + ' ' + cy), 'arrivée au centre du bord gauche : ' + d);
});

test('filles décalées : épine à gauche de la mère, un coude par fille', () => {
  const mx = 100, pCy = 57;
  const kids = [
    { ref: 'A', xg: 130, cy: 100 },
    { ref: 'B', xg: 160, cy: 150 },
  ];
  const b = { mx, pCy, degage: DEGAGE, kids };
  const d = Ariane._cheminAccolade(b, 0, null);
  const sx = mx - DEGAGE; // la mère est le point le plus à gauche
  // Le trait quitte le centre du bord gauche de la mère vers l'épine dégagée.
  assert.ok(d.startsWith('M ' + mx + ' ' + pCy + ' L ' + sx + ' ' + pCy),
    'départ au bord gauche de la mère : ' + d);
  for (const k of kids) {
    // Chaque fille part du rail À SA HAUTEUR : le sommet de l'angle porte le
    // nœud, le trait arrive au centre du bord gauche de la barre.
    assert.ok(d.includes('M ' + sx + ' ' + k.cy + ' L ' + k.xg + ' ' + k.cy),
      'angle droit au niveau de ' + k.ref + ' : ' + d);
  }
});

test('mère plus à gauche que ses filles : l épine ne la traverse jamais', () => {
  // Tri actif ou regroupement : la mère T020 démarre à gauche de ses filles ;
  // une épine calée sur les seules filles passait EN TRAVERS de sa barre.
  const b = { mx: 55, pCy: 150, degage: DEGAGE, kids: [
    { ref: 'F', xg: 130, cy: 45 }, { ref: 'G', xg: 517, cy: 180 }] };
  const sx = Ariane._epineAccolade(b, 0, null);
  assert.ok(sx <= b.mx - DEGAGE, 'épine à gauche de la mère : ' + sx);
  const d = Ariane._cheminAccolade(b, 0, null);
  // Famille éparpillée des deux côtés : rail droit couvrant toute la famille…
  assert.ok(d.startsWith('M ' + sx + ' 45 L ' + sx + ' 180'),
    'rail couvrant la famille : ' + d);
  // …et la mère le rejoint en trait droit (filles des deux côtés).
  assert.ok(d.includes('M 55 150 L ' + sx + ' 150'),
    'trait droit au bord gauche de la mère : ' + d);
});

test('une fille sans date ne tire pas l épine et rejoint sa bande en direct', () => {
  const b = { mx: 100, pCy: 150, degage: DEGAGE, kids: [
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
  const mx = 100, pCy = 57;
  const b = { mx, pCy, degage: DEGAGE,
    kids: [{ ref: 'A', xg: 103, cy: 100 }] };
  const d = Ariane._cheminAccolade(b, 0, null);
  assert.ok(d.startsWith('M ' + mx + ' ' + pCy + ' L ' + (mx - DEGAGE) + ' ' + pCy),
    'la 1re fille démarre presque avec la mère : angle droit attendu : ' + d);
  assert.ok(d.includes('L 103 100'), 'arrivée au centre du bord gauche : ' + d);
});

test('glissé : la fille déplacée emporte son coude, l\'épine suit le minimum', () => {
  const mx = 100, pCy = 57;
  const kids = [
    { ref: 'A', xg: 130, cy: 100 },
    { ref: 'B', xg: 160, cy: 150 },
  ];
  const b = { mx, pCy, degage: DEGAGE, kids };
  const d = Ariane._cheminAccolade(b, -60, 'B'); // B repart à gauche
  const sx = 100 - DEGAGE; // B (100) passe devant A (130)
  assert.ok(d.includes('M ' + sx + ' 100 L 130 100'), 'branche de A suit la nouvelle épine : ' + d);
  assert.ok(d.includes('M ' + sx + ' 150 L 100 150'), 'branche de B déplacée : ' + d);
});

test('fille collée à l\'épine (x=0) : trait direct sans coude négatif', () => {
  const b = { mx: 0, pCy: 57, degage: DEGAGE,
    kids: [{ ref: 'A', xg: 0, cy: 100 }] };
  const d = Ariane._cheminAccolade(b, 0, null);
  assert.ok(d.includes('M 0 100 L 0 100'), 'trait direct attendu : ' + d);
});

test('fille au-dessus de sa mère (frise éparpillée) : rail + trait droit, pas de grande courbe', () => {
  // Tri actif ou regroupement : l'ordre d'affichage ne suit plus l'arbre et
  // une fille peut se retrouver AU-DESSUS de sa mère (cas T010/T020). Le rail
  // doit couvrir toute la famille, mais la LIAISON reste le même petit coude
  // qu'ailleurs : une grande courbe balayée était jugée brouillonne.
  const mx = 100, pCy = 150;
  const b = { mx, pCy, degage: DEGAGE, kids: [
    { ref: 'Haute', xg: mx, cy: 45 },     // même début que la mère, plus haut
    { ref: 'Basse', xg: 560, cy: 180 },   // sous la mère, décalée à droite
  ] };
  const d = Ariane._cheminAccolade(b, 0, null);
  const sx = mx - DEGAGE;
  // Le rail couvre du haut de la famille au bas…
  assert.ok(d.startsWith('M ' + sx + ' 45 L ' + sx + ' 180'),
    'rail couvrant la famille : ' + d);
  // …la mère le rejoint en trait droit (filles des deux côtés)…
  assert.ok(d.includes('M ' + mx + ' ' + pCy + ' L ' + sx + ' ' + pCy),
    'trait droit au bord gauche de la mère : ' + d);
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

test('toutes les filles au-dessus de la mère : le rail descend jusqu à elle, angles droits partout', () => {
  // Cas qui produisait la grande courbe balayée : le rail descend simplement
  // de la fille haute jusqu'à la mère, où il tourne à angle droit vers elle.
  const mx = 100, pCy = 150;
  const b = { mx, pCy, degage: DEGAGE, kids: [
    { ref: 'Haute', xg: 140, cy: 60 }, { ref: 'Basse', xg: 160, cy: 100 }] };
  const d = Ariane._cheminAccolade(b, 0, null);
  const sx = mx - DEGAGE;
  // Rail de la fille haute jusqu'à la mère, puis angle droit vers son bord…
  assert.ok(d.startsWith('M ' + sx + ' 60 L ' + sx + ' ' + pCy + ' L ' + mx + ' ' + pCy),
    'rail descendant jusqu à la mère : ' + d);
  // …et chaque fille part du rail à sa hauteur.
  assert.ok(d.includes('M ' + sx + ' 60 L 140 60'), 'branche fille haute : ' + d);
  assert.ok(d.includes('M ' + sx + ' 100 L 160 100'), 'branche fille basse : ' + d);
});
