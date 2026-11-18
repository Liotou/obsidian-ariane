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

test('sansJournalTache : le titre part, le contenu rejoint le texte, la bibliographie reste', () => {
  assert.equal(Ariane.sansJournalTache('---\na: 1\n---\n# T\n\n## Journal\n'), '---\na: 1\n---\n# T\n');
  assert.equal(Ariane.sansJournalTache('# T\n\nTexte.\n\n## Journal\n\n- Remarque\n'), '# T\n\nTexte.\n\n- Remarque\n');
  const bib = '---\n## Bibliographie\n%% ariane:biblio %%\n- A\n%% /ariane:biblio %%';
  assert.equal(Ariane.sansJournalTache('# T\n\nTexte.\n\n## Journal\n\n' + bib + '\n'), '# T\n\nTexte.\n\n' + bib + '\n');
  const sans = '# T\n\nJournal de bord\n';
  assert.equal(Ariane.sansJournalTache(sans), sans);
});

test('zoneNoteTravail : sans Journal, le texte s’arrête avant le filet de la bibliographie', () => {
  const l = ['# T', '', 'Texte.', '', '---', '## Bibliographie', '%% ariane:biblio %%', '- A', '%% /ariane:biblio %%', ''];
  const z = Ariane.zoneNoteTravail(l);
  assert.equal(l.slice(z.debut, z.fin).join('\n').trim(), 'Texte.');
  assert.equal(l[z.fin], '---');
});

test('migrerJournalTaches : une seule fois, dans le dossier des tâches seulement', async () => {
  const notes = { 'T/T1.md': '# A\n\n## Journal\n\nNote.\n', 'T/T2.md': '# B\n', 'N/x.md': '# C\n\n## Journal\n' };
  const g = Object.create(Ariane.prototype);
  let sauve = 0;
  g.settings = { dossierTaches: 'T' };
  g.saveSettings = async () => { sauve += 1; };
  g.marquerEcriture = () => {};
  g.app = { vault: {
    getMarkdownFiles: () => Object.keys(notes).map((path) => ({ path })),
    cachedRead: async (f) => notes[f.path],
    process: async (f, fn) => { notes[f.path] = fn(notes[f.path]); },
  } };
  assert.equal(await g.migrerJournalTaches(), 1);
  assert.equal(notes['T/T1.md'], '# A\n\nNote.\n');
  assert.ok(notes['N/x.md'].includes('## Journal'));
  assert.equal(g.settings._journalTacheRetire, true);
  assert.equal(await g.migrerJournalTaches(), 0);
  assert.equal(sauve, 1);
});
