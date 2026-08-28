const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('une saisie vide ne désigne rien', () => {
  assert.equal(Ariane.livrableOuFichier('').champ, null);
  assert.equal(Ariane.livrableOuFichier('   ').champ, null);
});

test('un chemin absolu désigne un fichier externe', () => {
  const r = Ariane.livrableOuFichier('/Users/x/soutenance.pptx');
  assert.equal(r.champ, 'fichier');
  assert.equal(r.valeur, '/Users/x/soutenance.pptx');
});

test('un chemin en tilde désigne aussi un fichier externe', () => {
  assert.equal(Ariane.livrableOuFichier('~/Bureau/plan.pptx').champ, 'fichier');
});

test('un nom de note devient un lien', () => {
  const r = Ariane.livrableOuFichier('NC-202607081912');
  assert.equal(r.champ, 'livrable');
  assert.equal(r.valeur, '[[NC-202607081912]]');
});

test('un chemin dans le coffre reste une note, malgré ses barres obliques', () => {
  const r = Ariane.livrableOuFichier('3 - Notes conceptuelles/NC-202607081912');
  assert.equal(r.champ, 'livrable');
  assert.equal(r.valeur, '[[3 - Notes conceptuelles/NC-202607081912]]');
});

test('un lien déjà écrit avec ses crochets n en reçoit pas deux fois', () => {
  assert.equal(Ariane.livrableOuFichier('[[NC-202607081912]]').valeur, '[[NC-202607081912]]');
});

test('le libellé d une source réunit auteur, année, titre et clé', () => {
  const l = Ariane.libelleSource({
    citationKey: 'perrowNormalAccidentsLiving2011',
    title: 'Normal Accidents: Living with High Risk Technologies',
    creators: ['[[Charles Perrow]]'],
    year: 2011,
  }, '@perrowNormalAccidentsLiving2011');
  assert.ok(l.includes('Charles Perrow'));
  assert.ok(l.includes('2011'));
  assert.ok(l.includes('Normal Accidents'));
  assert.ok(l.includes('@perrowNormalAccidentsLiving2011'));
});

test('une fiche sans auteur ni année reste cherchable par son titre', () => {
  const l = Ariane.libelleSource({ title: 'Sans auteur' }, '@sansAuteur2020');
  assert.ok(l.includes('Sans auteur'));
  assert.ok(l.includes('@sansAuteur2020'));
  assert.ok(!l.includes('undefined'));
});

test('le libellé d une note met l alias en avant et garde le nom de fichier', () => {
  const l = Ariane.libelleNote({ aliases: ['Science formelle'] }, 'NC-202607081912');
  assert.ok(l.startsWith('Science formelle'));
  assert.ok(l.includes('NC-202607081912'));
});

test('une note sans alias reste cherchable par son nom', () => {
  const l = Ariane.libelleNote({}, 'Chapitre 3');
  assert.equal(l, 'Chapitre 3');
});

test('un alias écrit en chaîne plutôt qu en liste est accepté', () => {
  assert.ok(Ariane.libelleNote({ aliases: 'Science formelle' }, 'NC-1').startsWith('Science formelle'));
});

test('plusieurs alias sont tous cherchables', () => {
  const l = Ariane.libelleNote({ aliases: ['Science formelle', 'Formal science'] }, 'NC-1');
  assert.ok(l.includes('Science formelle'));
  assert.ok(l.includes('Formal science'));
});
