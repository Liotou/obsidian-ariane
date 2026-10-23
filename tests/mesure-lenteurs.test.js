// Mesure des ralentissements : un gel est rapproché du travail qui le
// recouvre, ou compté hors Ariane.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { MesureLenteurs } = Ariane._test;

test('rapport : gels attribués (certain, possible, hors Ariane), travaux triés par blocage', () => {
  const m = new MesureLenteurs(0);
  m.noter('suggestions', 1000, 180, 400);   // bloque 180 ms
  m.noter('biblio', 5000, 4, 900);          // presque rien de bloquant, mais long
  m.noter('éditeur aparté', 9000, 2, 2);
  m.frappe(990);
  m.gel(1010, 170);                         // pendant suggestions (synchrone) et la frappe
  m.gel(5300, 80);                          // pendant biblio (asynchrone)
  m.gel(20000, 120);                        // personne
  const r = m.rapport(300000);
  assert.match(r, /Mesure de 5 min, 1 frappes\./);
  assert.match(r, /Gels de l’interface \(plus de 50 ms\) : 3, 370 ms au total, dont 1 pendant la frappe\./);
  assert.match(r, /Sans travail d’Ariane en cours \(Obsidian ou un autre greffon\) : 1 gel\(s\), 120 ms\./);
  const lignes = r.split('\n').filter((l) => / \| /.test(l)).slice(1);
  assert.equal(lignes[0], 'suggestions | 1 | 180 ms | 180 ms | 400 ms | 1 (170 ms) | 0');
  assert.equal(lignes[1], 'biblio | 1 | 4 ms | 4 ms | 900 ms | 0 | 1');
  assert.equal(lignes[2].split(' | ')[0], 'éditeur aparté');
});
