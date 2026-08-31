const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const cle = (concept, opts) => Ariane.cleTache(concept, opts);

test('sans réglage : la clé est le nom lisible du concept', () => {
  assert.equal(cle('statut', {}), 'Statut');
  assert.equal(cle('echeance', {}), 'Échéance');
  assert.equal(cle('parent', {}), 'Rattachée à');
  assert.equal(cle('bloque-par', {}), 'Bloquée par');
  assert.equal(cle('rappel-id', {}), 'Rappel ID');
});

test('le préfixe s applique à TOUTES les propriétés, de la même façon', () => {
  const o = { prefixe: 'Tâche - ' };
  assert.equal(cle('famille', o), 'Tâche - Famille');
  assert.equal(cle('statut', o), 'Tâche - Statut');
  assert.equal(cle('echeance', o), 'Tâche - Échéance');
  assert.equal(cle('avancement', o), 'Tâche - Avancement');
  assert.equal(cle('parent', o), 'Tâche - Rattachée à');
  assert.equal(cle('termine-le', o), 'Tâche - Terminée le');
  assert.equal(cle('source', o), 'Tâche - Source');
  assert.equal(cle('rappel-id', o), 'Tâche - Rappel ID');
});

test('une personnalisation remplace le nom lisible ; le préfixe reste devant', () => {
  assert.equal(
    cle('parent', { prefixe: 'Tâche - ', cles: { parent: 'Rattachement' } }),
    'Tâche - Rattachement');
  assert.equal(
    cle('liste', { prefixe: 'Tâche - ', cles: { liste: 'Rappels' } }),
    'Tâche - Rappels');
  // sans préfixe : juste le label personnalisé
  assert.equal(cle('statut', { cles: { statut: 'État' } }), 'État');
});

test('une personnalisation vide, blanche, ou égale au défaut = pas de personnalisation', () => {
  assert.equal(cle('statut', { prefixe: 'Tâche - ', cles: { statut: '' } }), 'Tâche - Statut');
  assert.equal(cle('statut', { prefixe: 'Tâche - ', cles: { statut: '   ' } }), 'Tâche - Statut');
  // (la normalisation au chargement retire ce genre d'entrée ; cleTache la tolère)
  assert.equal(cle('statut', { prefixe: 'Tâche - ', cles: { statut: 'Statut' } }), 'Tâche - Statut');
});

test('« intitule » n est jamais préfixé ni renommé', () => {
  assert.equal(cle('intitule', { prefixe: 'Tâche - ', cles: { intitule: 'Titre' } }), 'intitule');
});

test('libelleConcept couvre tous les concepts de tâche', () => {
  for (const con of Ariane.CONCEPTS_TACHE) {
    const l = Ariane.libelleConcept(con);
    assert.ok(l && typeof l === 'string' && l.length, 'libellé pour ' + con);
  }
});

