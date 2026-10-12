// Tâches : le temps estimé.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('temps estimé : les formes qu\'on écrit à la main, rangées en minutes', () => {
  const D = Ariane.dureeEstimeeMin;
  assert.equal(D(90), 90);
  assert.equal(D('90'), 90);
  assert.equal(D('1 h 30'), 90);
  assert.equal(D('1h30'), 90);
  assert.equal(D('1,5 h'), 90);
  assert.equal(D('2 h'), 120);
  assert.equal(D('2 heures'), 120);
  assert.equal(D('45 min'), 45);
  assert.equal(D('1:15'), 75);
  assert.equal(D(''), 0);
  assert.equal(D(null), 0);
  assert.equal(D('beaucoup'), 0);
  assert.equal(D(-5), 0);
});

test('temps estimé : Claude peut le proposer, en minutes ou en clair, et le journal le raconte', () => {
  const taches = [{ ref: 'T1', intitule: 'Lire', statut: 'à faire', tempsEstime: 60, creneaux: [] }];
  const r = Ariane.validerPropositions([
    { ref: 'T1', champs: { 'temps-estime': '2 h' } },
    { ref: 'T1', champs: { 'temps-estime': 'demain' } },
  ], taches);
  assert.deepEqual(r.valides[0].operations, [{ genre: 'champ', champ: 'temps-estime', avant: 60, apres: 120 }]);
  assert.match(r.erreurs[0].erreur, /temps estimé invalide/);
  assert.equal(Ariane.instantaneTache({ tempsEstime: 45 })['temps-estime'], 45);
});
