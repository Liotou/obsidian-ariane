const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('une lecture offre les accès quand les URI sont connus', () => {
  const s = Ariane.blocTache({ source: '[[@perrow1984]]' }, {
    uriPdf: 'obsidian://zotflow?type=open-attachment&libraryID=1&key=ABCD1234',
    uriZotero: 'zotero://select/library/items/WXYZ9876',
  });
  assert.ok(s.includes('[[@perrow1984]]'));
  assert.ok(s.includes('obsidian://zotflow?type=open-attachment'));
  assert.ok(s.includes('zotero://select/library/items/WXYZ9876'));
});

test('une lecture sans PDF attaché n offre pas de lien mort', () => {
  const s = Ariane.blocTache({ source: '[[@perrow1984]]' },
    { uriZotero: 'zotero://select/library/items/W' });
  assert.ok(s.includes('[[@perrow1984]]'));
  assert.ok(!s.includes('obsidian://zotflow'));
  assert.ok(!s.includes('undefined'));
});

test('une production interne renvoie vers la note produite', () => {
  const s = Ariane.blocTache({ livrable: '[[NC-202607081912]]' }, null);
  assert.ok(s.includes('[[NC-202607081912]]'));
});

test('une production externe affiche les deux dates connues', () => {
  const s = Ariane.blocTache(
    { fichier: '/Users/x/soutenance.pptx' },
    { modifie: '2026-08-20', ouvert: '2026-08-26' },
  );
  assert.ok(s.includes('2026-08-20'));
  assert.ok(s.includes('2026-08-26'));
  assert.ok(s.includes('soutenance.pptx'));
});

test('une production externe sans métadonnées ne prétend rien', () => {
  const s = Ariane.blocTache({ fichier: '/Users/x/absent.pptx' }, null);
  assert.ok(!s.includes('undefined'));
  assert.ok(!s.includes('null'));
});

test('une action ne produit aucun bloc', () => {
  assert.equal(Ariane.blocTache({ statut: 'à faire' }, null), '');
});

test('un conflit de champs est signalé dans le bloc', () => {
  const s = Ariane.blocTache({ source: '[[@a]]', fichier: '/x.pptx' }, null);
  assert.ok(s.toLowerCase().includes('conflit'));
});
