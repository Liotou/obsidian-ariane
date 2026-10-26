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
  const r = f('([[ABC|Beck, 1986, p. 12]] ; [[2N6LMK5K|p. 164]])', info);
  assert.equal(r.texte, '([[ABC|Beck, 1986, p. 12]] ; [[2N6LMK5K|Amsterdamski et al., 1990, p. 164]])');
  assert.equal(f('Il le dit ([[2N6LMK5K|p. 164]]).', info).texte, 'Il le dit ([[2N6LMK5K|Amsterdamski et al., 1990, p. 164]]).');
  assert.equal(f('([[ABC|Beck, 1986, p. 12]])', info).changements.length, 0);
});

test('ordre chronologique : le cas de Monsieur, puis alphabétique à année égale', () => {
  const sources = {
    '@rummensDeterminismParadoxPredictability2010': { source: '@rummensDeterminismParadoxPredictability2010', libelle: 'Rummens et Cuypers, 2010' },
    '@bertalanffyTheorieGeneraleSystemes1973': { source: '@bertalanffyTheorieGeneraleSystemes1973', libelle: 'Bertalanffy, 1973' },
    A: { source: '@a', libelle: 'Morin, 1990, p. 3' }, B: { source: '@b', libelle: 'Luhmann, 1990, p. 9' },
    S: { source: '@s', libelle: 'Anonyme, s. d.' },
  };
  const g = (c) => sources[c] || notes[c] || null;
  assert.equal(f('([[@rummensDeterminismParadoxPredictability2010|Rummens et Cuypers, 2010]] ; [[@bertalanffyTheorieGeneraleSystemes1973|Bertalanffy, 1973]])', g).texte,
    '([[@bertalanffyTheorieGeneraleSystemes1973|Bertalanffy, 1973]] ; [[@rummensDeterminismParadoxPredictability2010|Rummens et Cuypers, 2010]])');
  assert.equal(f('([[A|Morin, 1990, p. 3]] ; [[B|Luhmann, 1990, p. 9]])', g).texte, '([[B|Luhmann, 1990, p. 9]] ; [[A|Morin, 1990, p. 3]])', 'à année égale, l’ordre alphabétique');
  assert.equal(f('([[B|Luhmann, 1990, p. 9]] ; [[A|Morin, 1990, p. 3]])', g).changements.length, 0);
  // Réunion et tri ensemble.
  assert.equal(f('([[2N6LMK5K|Amsterdamski et al., 1990, p. 164]] ; [[ABC|Beck, 1986, p. 12]] ; [[K5L9HRN5|Amsterdamski et al., 1990, p. 156]])', g).texte,
    '([[ABC|Beck, 1986, p. 12]] ; [[K5L9HRN5|Amsterdamski et al., 1990, p. 156]], [[2N6LMK5K|p. 164]])');
  // Une référence sans année passe après les autres.
  assert.equal(f('([[S|Anonyme, s. d.]] ; [[@bertalanffyTheorieGeneraleSystemes1973|Bertalanffy, 1973]])', g).texte,
    '([[@bertalanffyTheorieGeneraleSystemes1973|Bertalanffy, 1973]] ; [[S|Anonyme, s. d.]])');
  // Des liens qui ne sont pas des citations : l'ordre ne bouge pas.
  assert.equal(f('([[Note 2020|Bilan 2020]] ; [[Note 1999|Bilan 1999]])', g).changements.length, 0);
});
