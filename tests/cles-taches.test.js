const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const cle = (concept, opts) => Ariane.cleTache(concept, opts);
const LISIBLE = { parent: 'Rattachée à', echeance: 'Échéance', statut: 'Statut' };
const libelle = (c) => LISIBLE[c] || c;

test('sans réglage : la clé est le concept nu', () => {
  assert.equal(cle('statut', {}), 'statut');
  assert.equal(cle('echeance', {}), 'echeance');
});

test('un préfixe s applique aux concepts sans clé précise', () => {
  assert.equal(cle('statut', { prefixe: 'Tâche - ' }), 'Tâche - statut');
  assert.equal(cle('echeance', { prefixe: 'T ' }), 'T echeance');
});

test('« noms lisibles » remplace le concept par son libellé sous le préfixe', () => {
  assert.equal(cle('echeance', { prefixe: 'Tâche - ', nomsLisibles: true, libelle }), 'Tâche - Échéance');
  assert.equal(cle('parent', { nomsLisibles: true, libelle }), 'Rattachée à');
});

test('une clé précise est prise TELLE QUELLE, préfixe ou pas', () => {
  // le cas qui échouait : juste une majuscule, sans préfixe
  assert.equal(cle('statut', { prefixe: 'Tâche - ', cles: { statut: 'Statut' } }), 'Statut');
  // renommage complet
  assert.equal(cle('parent', { prefixe: 'Tâche - ', cles: { parent: 'Tâche - Rattachement' } }), 'Tâche - Rattachement');
  // une clé qui ne commence pas par le préfixe est quand même honorée
  assert.equal(cle('debut', { prefixe: 'Tâche - ', cles: { debut: 'start' } }), 'start');
});

test('la clé précise l emporte sur « noms lisibles »', () => {
  assert.equal(cle('echeance', { prefixe: 'Tâche - ', nomsLisibles: true, libelle, cles: { echeance: 'deadline' } }), 'deadline');
});

test('un champ vide ou blanc est ignoré (retombe sur préfixe + défaut)', () => {
  assert.equal(cle('statut', { prefixe: 'Tâche - ', cles: { statut: '' } }), 'Tâche - statut');
  assert.equal(cle('statut', { prefixe: 'Tâche - ', cles: { statut: '   ' } }), 'Tâche - statut');
});

test('« intitule » n est jamais préfixé ni renommé', () => {
  assert.equal(cle('intitule', { prefixe: 'Tâche - ', cles: { intitule: 'Titre' } }), 'intitule');
});
