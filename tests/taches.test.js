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

test('note de travail : tout ce qui suit le titre, jusqu’au journal ou aux blocs d’Ariane', () => {
  const t = ['---', 'Type: tache', '---', '# Rédiger le cadrage', '', 'Mon texte.', '', '## Mes idées', 'Suite.', '', '## Journal', '', '<!-- ariane:creneaux -->'];
  const z = Ariane.zoneNoteTravail(t);
  assert.equal(t.slice(z.debut, z.fin).join('\n').trim(), 'Mon texte.\n\n## Mes idées\nSuite.');
  // Sans journal : jusqu'au bloc d'Ariane.
  const u = ['# Titre', 'A', '<!-- ariane:creneaux -->', 'x'];
  assert.deepEqual(Ariane.zoneNoteTravail(u), { debut: 1, fin: 2 });
  // Les blocs qu'Ariane pose sous le titre ne coupent pas la note de travail.
  const v = ['# Titre', '', '%% ariane:tache %%', 'accès', '%% /ariane:tache %%', '',
    '<!-- ariane:creneaux -->', '## Sessions', '| 1 |', '<!-- /ariane:creneaux -->', '', 'Mon texte.', '', '## Journal'];
  const zv = Ariane.zoneNoteTravail(v);
  assert.equal(v.slice(zv.debut, zv.fin).join('\n').trim(), 'Mon texte.');
});

test('sansTitreNoteTravail : l’ancien titre disparaît, le contenu suit le titre de la note', () => {
  assert.equal(Ariane.sansTitreNoteTravail('---\na: 1\n---\n\n# Titre\n\n## Note de travail\n\n## Journal\n'),
    '---\na: 1\n---\n\n# Titre\n\n## Journal\n');
  assert.equal(Ariane.sansTitreNoteTravail('# Titre\n\n## Note de travail\nMon texte.\n\n## Journal\n'),
    '# Titre\n\nMon texte.\n\n## Journal\n');
  assert.equal(Ariane.sansTitreNoteTravail('# Titre\nRien à retirer.'), '# Titre\nRien à retirer.');
});
