const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('racinesArborescence : remonte jusqu à l ancêtre le plus haut', () => {
  const lignes = [
    { ref: 'A', parent: '' },
    { ref: 'B', parent: 'A' },
    { ref: 'C', parent: 'B' },
    { ref: 'D', parent: '' },
  ];
  const r = Ariane.racinesArborescence(lignes);
  assert.equal(r.get('A'), 'A');
  assert.equal(r.get('B'), 'A');
  assert.equal(r.get('C'), 'A');
  assert.equal(r.get('D'), 'D');
});

test('racinesArborescence : parent hors filtre → la tâche est sa propre racine', () => {
  const lignes = [
    { ref: 'X', parent: 'ABSENT' },
    { ref: 'Y', parent: 'X' },
  ];
  const r = Ariane.racinesArborescence(lignes);
  assert.equal(r.get('X'), 'X');
  assert.equal(r.get('Y'), 'X');
});

test('racinesArborescence : cycle de parenté sans boucle infinie', () => {
  const lignes = [
    { ref: 'A', parent: 'B' },
    { ref: 'B', parent: 'A' },
  ];
  const r = Ariane.racinesArborescence(lignes);
  assert.ok(r.get('A'));
  assert.ok(r.get('B'));
});

test('couleurRacine : déterministe et dans la palette', () => {
  const a1 = Ariane.couleurRacine('T26-001');
  const a2 = Ariane.couleurRacine('T26-001');
  assert.equal(a1, a2);
  assert.ok(Ariane.COULEURS_RACINES.includes(a1));
  assert.ok(Ariane.COULEURS_RACINES.includes(Ariane.couleurRacine('')));
});

test('couleurAvancement : 0 % atténué, 100 % vert, extrêmes bornés', () => {
  assert.equal(Ariane.couleurAvancement(0), 'var(--text-faint)');
  assert.equal(Ariane.couleurAvancement(''), 'var(--text-faint)');
  assert.equal(Ariane.couleurAvancement(100), 'rgb(47, 158, 91)');
  assert.equal(Ariane.couleurAvancement(50), 'rgb(93, 153, 128)');
  assert.equal(Ariane.couleurAvancement(-20), 'var(--text-faint)');
  assert.equal(Ariane.couleurAvancement(250), 'rgb(47, 158, 91)');
});

test('MODES_COULEUR_FRISE : les cinq modes, défauts compris', () => {
  const modes = Ariane.MODES_COULEUR_FRISE.map(([v]) => v);
  assert.deepEqual(modes, ['famille', 'statut', 'racine', 'priorite', 'avancement']);
  assert.ok(Ariane.COULEURS_PRIORITE.haute);
  assert.ok(Ariane.COULEURS_PRIORITE.moyenne);
  assert.ok(Ariane.COULEURS_PRIORITE.basse);
});
