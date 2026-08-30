const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const FAM = [
  { id: 'lecture', nom: 'Lecture', couleur: '#4c78c9', icone: 'book-open',
    proprietes: [{ cle: 'source', libelle: 'Source', type: 'lien' }] },
  { id: 'production', nom: 'Production', couleur: '#e0873d', icone: 'file-pen',
    proprietes: [{ cle: 'livrable', libelle: 'Livrable', type: 'lien' },
                 { cle: 'fichier', libelle: 'Fichier', type: 'texte' }] },
  { id: 'action', nom: 'Action', couleur: '#6aa84f', icone: 'zap', proprietes: [] },
];

/* ---------------------- familleTache ---------------------- */

test('champ famille explicite et connu : renvoyé tel quel', () => {
  assert.equal(Ariane.familleTache({ famille: 'production' }, FAM, 'action'), 'production');
});

test('champ famille explicite mais inconnu : repli sur la déduction/défaut', () => {
  assert.equal(Ariane.familleTache({ famille: 'zephyr' }, FAM, 'action'), 'action');
});

test('sans champ famille : source deduit lecture', () => {
  assert.equal(Ariane.familleTache({ source: '[[@x]]' }, FAM, 'action'), 'lecture');
});

test('sans champ famille : livrable deduit production', () => {
  assert.equal(Ariane.familleTache({ livrable: 'Article' }, FAM, 'action'), 'production');
});

test('rien de rien : famille par defaut', () => {
  assert.equal(Ariane.familleTache({}, FAM, 'action'), 'action');
});

test('appel historique sans familles : comportement inchange', () => {
  assert.equal(Ariane.familleTache({ source: 'x' }), 'lecture');
  assert.equal(Ariane.familleTache({ livrable: 'x' }), 'production');
  assert.equal(Ariane.familleTache({}), 'action');
});

/* ------------------- proprietesManquantes ------------------- */

test('fm vide : toutes les proprietes de la famille manquent', () => {
  const m = Ariane.proprietesManquantes({}, FAM[1]);
  assert.deepEqual(m, [{ cle: 'livrable', type: 'lien' }, { cle: 'fichier', type: 'texte' }]);
});

test('fm complet : aucune propriete manquante', () => {
  assert.deepEqual(Ariane.proprietesManquantes({ livrable: 'a', fichier: 'b' }, FAM[1]), []);
});

test('fm partiel : seules les clés absentes', () => {
  assert.deepEqual(Ariane.proprietesManquantes({ livrable: 'a' }, FAM[1]), [{ cle: 'fichier', type: 'texte' }]);
});

test('clé présente mais valeur vide : considérée présente', () => {
  assert.deepEqual(Ariane.proprietesManquantes({ livrable: '', fichier: null }, FAM[1]), []);
});

test('famille sans proprietes : liste vide', () => {
  assert.deepEqual(Ariane.proprietesManquantes({}, FAM[2]), []);
});

/* ----------------- TYPE_FR_VERS_OBSIDIAN ------------------ */

test('table de correspondance des types', () => {
  assert.deepEqual(Ariane.TYPE_FR_VERS_OBSIDIAN, {
    texte: 'text', nombre: 'number', date: 'date',
    case: 'checkbox', liste: 'multitext', lien: 'link',
  });
});
