const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

// Un faux gestionnaire de types, dans l'esprit de celui d'Obsidian 1.12 :
// « properties » porte le widget assigné, « getTypeInfo » sert de repli.
const gestionnaire = (proprietes, infos) => ({
  properties: proprietes || {},
  getTypeInfo: (nom) => (infos && infos[nom]) || null,
});

test('une colonne de fichier n a pas de type de propriété', () => {
  assert.equal(Ariane.typeProprieteBase(gestionnaire(), 'file.name'), '');
});

test('une colonne de formule n a pas de type de propriété', () => {
  assert.equal(Ariane.typeProprieteBase(gestionnaire(), 'formula.reste'), '');
});

test('le widget assigné est rendu, préfixe note. retiré', () => {
  const g = gestionnaire({ echeance: { name: 'echeance', widget: 'date' } });
  assert.equal(Ariane.typeProprieteBase(g, 'note.echeance'), 'date');
});

test('le nom nu fonctionne aussi', () => {
  const g = gestionnaire({ echeance: { widget: 'date' } });
  assert.equal(Ariane.typeProprieteBase(g, 'echeance'), 'date');
});

test('sans widget assigné, on retombe sur getTypeInfo', () => {
  const g = gestionnaire({}, { temps: { expected: { type: 'number' } } });
  assert.equal(Ariane.typeProprieteBase(g, 'note.temps'), 'number');
});

test('le widget assigné l emporte sur getTypeInfo', () => {
  const g = gestionnaire(
    { x: { widget: 'text' } },
    { x: { expected: { type: 'number' } } });
  assert.equal(Ariane.typeProprieteBase(g, 'x'), 'text');
});

test('une propriété inconnue rend une chaîne vide', () => {
  assert.equal(Ariane.typeProprieteBase(gestionnaire(), 'note.rien'), '');
});

test('un gestionnaire absent ne fait pas tomber la fonction', () => {
  assert.equal(Ariane.typeProprieteBase(null, 'note.echeance'), '');
});

test('un gestionnaire qui lève est neutralisé', () => {
  const g = { get properties() { throw new Error('boum'); } };
  assert.equal(Ariane.typeProprieteBase(g, 'note.echeance'), '');
});
