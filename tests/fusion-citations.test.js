// Citations d'une même source : le nom une fois, les pages à la suite.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { fusionnerCitations: f } = Ariane._test;

const notes = {
  '2N6LMK5K': { source: '@amsterdamski1990', libelle: 'Amsterdamski et al., 1990, p. 164' },
  K5L9HRN5: { source: '@amsterdamski1990', libelle: 'Amsterdamski et al., 1990, p. 156' },
  ABC: { source: '@beck1986', libelle: 'Beck, 1986, p. 12' },
  '@beck1986': { source: '@beck1986', libelle: 'Beck, 1986' },
};
const info = (c) => notes[c] || null;

test('le cas de Monsieur : la source une fois, les pages dans l’ordre, chaque lien gardé', () => {
  const r = f('Texte ([[2N6LMK5K|Amsterdamski et al., 1990, p. 164]] ; [[K5L9HRN5|Amsterdamski et al., 1990, p. 156]]).', info);
  assert.equal(r.texte, 'Texte ([[K5L9HRN5|Amsterdamski et al., 1990, p. 156]], [[2N6LMK5K|p. 164]]).');
  assert.equal(r.changements.length, 1);
  assert.equal(f(r.texte, info).changements.length, 0, 'une seconde passe ne change rien');
});

test('plusieurs sources : chacune réunie, à la place de sa première citation', () => {
  const r = f('([[ABC|Beck, 1986, p. 12]] ; [[2N6LMK5K|Amsterdamski et al., 1990, p. 164]] ; [[K5L9HRN5|Amsterdamski et al., 1990, p. 156]])', info);
  assert.equal(r.texte, '([[ABC|Beck, 1986, p. 12]] ; [[K5L9HRN5|Amsterdamski et al., 1990, p. 156]], [[2N6LMK5K|p. 164]])');
});

test('rien à fusionner, autre chose qu’une citation, narratif, tableau', () => {
  const seul = '([[ABC|Beck, 1986, p. 12]] ; [[K5L9HRN5|Amsterdamski et al., 1990, p. 156]])';
  assert.equal(f(seul, info).changements.length, 0);
  const texteLibre = '(voir [[2N6LMK5K|Amsterdamski et al., 1990, p. 164]] et [[K5L9HRN5|Amsterdamski et al., 1990, p. 156]])';
  assert.equal(f(texteLibre, info).changements.length, 0, 'un groupe qui contient du texte n’est pas touché');
  const inconnus = '([[X|X, 2000, p. 1]] ; [[Y|Y, 2000, p. 2]])';
  assert.equal(f(inconnus, info).changements.length, 0);
  const tableau = '| ([[2N6LMK5K\\|Amsterdamski et al., 1990, p. 164]] ; [[K5L9HRN5\\|Amsterdamski et al., 1990, p. 156]]) |';
  assert.equal(f(tableau, info).texte, '| ([[K5L9HRN5\\|Amsterdamski et al., 1990, p. 156]], [[2N6LMK5K\\|p. 164]]) |');
});

test('une page restée seule après suppression d’une citation retrouve son libellé complet', () => {
  const r = f('([[2N6LMK5K|p. 164]] ; [[ABC|Beck, 1986, p. 12]])', info);
  assert.equal(r.texte, '([[2N6LMK5K|Amsterdamski et al., 1990, p. 164]] ; [[ABC|Beck, 1986, p. 12]])');
  assert.equal(f('Il le dit ([[2N6LMK5K|p. 164]]).', info).texte, 'Il le dit ([[2N6LMK5K|Amsterdamski et al., 1990, p. 164]]).');
  assert.equal(f('([[ABC|Beck, 1986, p. 12]])', info).changements.length, 0);
});
