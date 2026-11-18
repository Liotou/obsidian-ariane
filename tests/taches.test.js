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

test('ressources : sans doublon, quel que soit l’alias ; retrait par la cible', () => {
  assert.equal(Ariane.cibleRessource('![[Dossier/a.pdf|Mon PDF]]'), 'Dossier/a.pdf');
  let l = Ariane.ressourcesAvec([], '[[a.pdf]]');
  l = Ariane.ressourcesAvec(l, '[[a.pdf|autre nom]]');
  l = Ariane.ressourcesAvec(l, '[[Note]]');
  assert.deepEqual(l, ['[[a.pdf]]', '[[Note]]']);
  assert.deepEqual(Ariane.ressourcesSans(l, '[[a.pdf|x]]'), ['[[Note]]']);
});

test('ajouterRessourcesTache : lien sans .md pour une note, avec extension pour un fichier', async () => {
  const fm = { ressources: ['[[a.pdf]]'] };
  const note = { path: 'T/T1.md' };
  const g = Object.create(Ariane.prototype);
  g.fichierDeRef = () => note;
  g.cleT = (c) => c;
  g._lireT = (x, c) => x[c];
  g.marquerOrigineTache = () => {};
  g.app = {
    metadataCache: { fileToLinktext: (f, s, sansMd) => (sansMd ? f.path.replace(/\.md$/, '') : f.path) },
    fileManager: { processFrontMatter: async (f, fn) => fn(fm) },
  };
  const n = await g.ajouterRessourcesTache('T1', [{ path: 'Note.md', extension: 'md' }, { path: 'a.pdf', extension: 'pdf' }, note]);
  assert.equal(n, 1);
  assert.deepEqual(fm.ressources, ['[[a.pdf]]', '[[Note]]']);
});

test('champ Fichier : retiré des familles, ses liens passent aux ressources, un chemin reste', () => {
  const fam = [{ id: 'p', proprietes: [{ cle: 'Livrable' }, { cle: 'Tâche - Fichier' }, { cle: 'Fichier' }] }];
  assert.deepEqual(Ariane.famillesSansFichier(fam, 'Tâche - ')[0].proprietes, [{ cle: 'Livrable' }]);
  assert.deepEqual(Ariane.repriseChampFichier(['[[a]]', '', '/x/y.pptx'], ['[[b]]']),
    { ressources: ['[[b]]', '[[a]]'], reste: ['/x/y.pptx'] });
  assert.deepEqual(Ariane.repriseChampFichier('', []), { ressources: [], reste: [] });
});

test('champs de famille : vide d’une autre famille caché, rempli toujours visible', () => {
  const lecture = { proprietes: [{ cle: 'Source' }] };
  assert.equal(Ariane.champFamilleVisible('source', '', lecture, 'Tâche - '), true);
  assert.equal(Ariane.champFamilleVisible('livrable', '', lecture, 'Tâche - '), false);
  assert.equal(Ariane.champFamilleVisible('livrable', '[[x]]', lecture, 'Tâche - '), true);
  assert.equal(Ariane.champFamilleVisible('source', null, { proprietes: [] }, 'Tâche - '), false);
});

test('migrerChampFichier : note nettoyée, liens repris, une seule fois', async () => {
  const fm = { 'Tâche - Fichier': '[[Plan]]', Fichier: '', 'Tâche - Ressources': [] };
  const g = Object.create(Ariane.prototype);
  let sauve = 0;
  g.settings = { dossierTaches: 'T', prefixeTaches: 'Tâche - ', famillesTaches: [{ id: 'p', proprietes: [{ cle: 'Fichier' }] }] };
  g.saveSettings = async () => { sauve += 1; };
  g.marquerEcriture = () => {};
  g.cleT = (c) => ({ fichier: 'Tâche - Fichier', ressources: 'Tâche - Ressources' })[c];
  g._lireT = (x, c) => x[g.cleT(c)];
  g.app = { vault: { getMarkdownFiles: () => [{ path: 'T/T1.md' }], cachedRead: async () => '---\nTâche - Fichier: "[[Plan]]"\n---\n' },
    metadataCache: { getFileCache: () => ({ frontmatter: fm }) },
    fileManager: { processFrontMatter: async (f, fn) => fn(fm) } };
  assert.equal(await g.migrerChampFichier(), 1);
  assert.deepEqual(fm, { 'Tâche - Ressources': ['[[Plan]]'] });
  assert.deepEqual(g.settings.famillesTaches[0].proprietes, []);
  assert.equal(await g.migrerChampFichier(), 0);
  assert.equal(sauve, 1);
});

test('propriétés techniques : repliées ; les champs de travail restent visibles', () => {
  for (const [c, k] of [['terminee', 'terminée'], ['rappel-id', 'rappel id'], ['', 'synchro agenda'], ['', 'modifie'], ['', 'événement id']]) {
    assert.equal(Ariane.proprieteTechnique(c, k), true, k);
  }
  for (const [c, k] of [['statut', 'statut'], ['echeance', 'échéance'], ['ressources', 'ressources'], ['evenements', 'événement(s) lié(s)']]) {
    assert.equal(Ariane.proprieteTechnique(c, k), false, k);
  }
});

test('survol d’un créneau : source, livrable et ressources, avec leur titre', () => {
  const fichiers = { '@a': { path: 'R/@a.md', extension: 'md', basename: '@a' }, L: { path: 'L.md', extension: 'md', basename: 'L' },
    'p.pdf': { path: 'p.pdf', extension: 'pdf', name: 'p.pdf' } };
  const fm = { source: '[[@a]]', livrable: '[[L]]', ressources: ['[[p.pdf]]', '[[Absente]]'] };
  const g = Object.create(Ariane.prototype);
  g.fichierDeRef = () => ({ path: 'T1.md' });
  g.tachesPourGantt = () => [];
  g._lireT = (x, c) => x[c];
  g.app = { metadataCache: {
    getFileCache: (f) => ({ frontmatter: f.path === 'T1.md' ? fm : (f.basename === 'L' ? { aliases: ['Mon livrable'] } : {}) }),
    getFirstLinkpathDest: (c) => fichiers[c] || null } };
  assert.deepEqual(g.liensAssociesTache('T1').map((x) => [x.genre, x.libelle, !!x.f]),
    [['Source', '@a', true], ['Livrable', 'Mon livrable', true], ['Ressource', 'p.pdf', true], ['Ressource', 'Absente', false]]);
});

test('survol d’un créneau : événements et tâches liés, dans les deux sens', () => {
  const ev = { path: 'EV/E.md', extension: 'md', basename: 'E' };
  const mere = { path: 'T/T0.md', extension: 'md', basename: 'T0' };
  const fille = { path: 'T/T2.md', extension: 'md', basename: 'T2' };
  const fm = { evenements: ['[[E]]'], parent: '[[T0]]' };
  const g = Object.create(Ariane.prototype);
  g.fichierDeRef = () => ({ path: 'T/T1.md' });
  g._lireT = (x, c) => x[c];
  g.tachesPourGantt = () => [{ ref: 'T0', intitule: 'Mère', fichier: mere, statut: 'à faire' },
    { ref: 'T1', intitule: 'Moi', fichier: {}, statut: 'à faire', parent: '[[T0]]' },
    { ref: 'T2', intitule: 'Fille', fichier: fille, statut: 'à faire', parent: '[[T1]]', bloquePar: ['[[T1]]'] },
    { ref: 'T3', intitule: 'Abandonnée', fichier: {}, statut: 'abandonnée', parent: '[[T1]]' }];
  g.app = { metadataCache: {
    getFileCache: (f) => ({ frontmatter: f.path === 'T/T1.md' ? fm : (f === ev ? { 'Événement ID': 'A', Titre: 'Réunion', 'Début': '2026-11-20T10:00' } : {}) }),
    getFirstLinkpathDest: (c) => ({ E: ev, T0: mere })[c] || null } };
  assert.deepEqual(g.liensAssociesTache('T1').map((x) => x.genre + ' : ' + x.libelle), [
    'Événement lié : Réunion, 20/11/2026', 'Tâche mère : Mère (T0)', 'Sous-tâche : Fille (T2)', 'Bloque : Fille (T2)']);
});

test('tâche close : terminée ou abandonnée', () => {
  assert.equal(Ariane.tacheClose({ statut: 'terminée' }), true);
  assert.equal(Ariane.tacheClose({ statut: 'abandonnée' }), true);
  assert.equal(Ariane.tacheClose({ statut: 'à faire', terminee: true }), true);
  assert.equal(Ariane.tacheClose({ statut: 'en cours' }), false);
  assert.equal(Ariane.tacheClose(null), false);
});
