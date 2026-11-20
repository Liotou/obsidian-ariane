// Pièces jointes des événements : lecture sûre de ce que rend l'agenda,
// fichiers permis, bloc de la note, copie retrouvée, import sans accès.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const LOCAL = '/Users/moi/Library/Group Containers/group.com.apple.calendar/Attachments/A/B/Programme.pdf';
const champ = (...pieces) => pieces.map((p) => p.join('\u001d')).join('\u001e');

test('lecture : chemin gardé dans le dossier de Calendrier seulement, adresse iCloud écartée', () => {
  const l = Ariane.lirePiecesEvenement(champ(
    ['Programme.pdf', 'application/pdf', '674779', LOCAL, ''],
    ['Faux.pdf', 'application/pdf', '10', '/etc/passwd', 'https://gateway.icloud.com/caldav/x'],
    ['Lien.pdf', '', '', '', 'https://exemple.org/Lien.pdf'],
    ['', 'x', '1', LOCAL, ''],
  ));
  assert.equal(l.length, 3);
  assert.equal(l[0].local, LOCAL);
  assert.equal(l[0].taille, 674779);
  assert.equal(l[1].local, '');
  assert.equal(l[1].url, '');
  assert.equal(l[2].url, 'https://exemple.org/Lien.pdf');
  assert.deepEqual(Ariane.lirePiecesEvenement(''), []);
});

test('fichiers permis : documents oui, programmes, scripts et invitations non', () => {
  for (const n of ['a.pdf', 'b.DOCX', 'c.pptx', 'd.m4a']) assert.ok(Ariane.piecePermise(n), n);
  for (const n of ['a.app', 'b.command', 'c.sh', 'd.pkg', 'e.html', 'f.ics', 'sans-extension']) {
    assert.ok(!Ariane.piecePermise(n), n);
  }
  assert.ok(!Ariane.nomFichierPiece('../../a/b:c.pdf').includes('/'));
  assert.ok(!Ariane.nomFichierPiece('.cache.pdf').startsWith('.'));
});

test('libellé : type et taille lisibles', () => {
  assert.equal(Ariane.libellePiece({ nom: 'QUIRICONI.pdf', taille: 674779 }), 'QUIRICONI.pdf (PDF, 659 Ko)');
  assert.equal(Ariane.tailleLisible(1572864), '1,5 Mo');
  assert.equal(Ariane.libellePiece({ nom: 'lien', type: 'text/plain', taille: 0 }), 'lien (PLAIN)');
});

test('iCal : ATTACH par adresse retenu avec son nom, contenu encodé ignoré', () => {
  const ics = ['BEGIN:VEVENT', 'UID:u1', 'DTSTART:20261120T100000', 'DTEND:20261120T110000', 'SUMMARY:Réunion',
    'ATTACH;FILENAME=Ordre du jour.pdf;FMTTYPE=application/pdf:https://exemple.org/f?id=1',
    'ATTACH;ENCODING=BASE64;VALUE=BINARY:QUJD', 'END:VEVENT'].join('\r\n');
  const [e] = Ariane.evenementsIcs(ics, '2026-11-20', '2026-11-20', { nom: 'G' });
  assert.deepEqual(e.pieces, [{ nom: 'Ordre du jour.pdf', type: 'application/pdf', taille: 0, local: '',
    url: 'https://exemple.org/f?id=1' }]);
});

test('copie du coffre : même nom au numéro près, même taille', () => {
  const p = { nom: 'QUIRICONI.pdf', taille: 100 };
  const f = (name, size) => ({ name, stat: { size } });
  assert.ok(Ariane.fichierEstPiece(f('QUIRICONI.pdf', 100), p));
  assert.ok(Ariane.fichierEstPiece(f('QUIRICONI 1.pdf', 100), p));
  assert.ok(!Ariane.fichierEstPiece(f('QUIRICONI.pdf', 99), p));
  assert.ok(!Ariane.fichierEstPiece(f('QUIRICONI bis.pdf', 100), p));
});

test('note : bloc posé sous le titre, remplacé sans doublon, retiré s’il n’y a plus rien', () => {
  const note = '---\nType: evenement\n---\n# Réunion\n\nMes notes.\n';
  const p = { nom: 'a.pdf', taille: 2048, url: '' };
  const b1 = Ariane.blocPiecesEvenement([p], new Map([[p, '[[a.pdf]]']]));
  const c1 = Ariane.corpsAvecPieces(note, b1);
  assert.ok(c1.includes('# Réunion\n\n<!-- ariane:pieces -->'));
  assert.ok(c1.includes('- [[a.pdf]] (PDF, 2 Ko)'));
  assert.ok(c1.endsWith('Mes notes.\n'));
  assert.equal(Ariane.corpsAvecPieces(c1, b1), c1);
  const c2 = Ariane.corpsAvecPieces(c1, Ariane.blocPiecesEvenement([p]));
  assert.equal((c2.match(/<!-- ariane:pieces -->/g) || []).length, 1, 'une seule ouverture');
  assert.ok(c2.includes('- a.pdf (PDF, 2 Ko)'));
  assert.ok(!Ariane.corpsAvecPieces(c2, '').includes('ariane:pieces'));
  assert.ok(Ariane.corpsAvecPieces(c2, '').includes('Mes notes.'));
});

test('import sans accès au dossier de Calendrier : rien n’est créé, l’avis est donné', async () => {
  const g = Object.create(Ariane.prototype);
  const crees = [];
  g.app = { vault: { getFiles: () => [], createBinary: async (c) => crees.push(c) },
    fileManager: { getAvailablePathForAttachment: async (n) => n } };
  g.noteEvenementAJour = async () => null;
  g._contenuPiece = async () => null;
  let avis = 0;
  g._avisAccesPieces = () => { avis++; };
  const n = await g.importerPiecesEvenement({ pieces: [{ nom: 'a.pdf', taille: 3, local: LOCAL, url: '' }] });
  assert.equal(n, 0);
  assert.deepEqual(crees, []);
  assert.equal(avis, 1);
});

test('import avec accès : la pièce va au dossier des pièces jointes ; un programme est ignoré', async () => {
  const g = Object.create(Ariane.prototype);
  const crees = [];
  const majs = [];
  g.app = { vault: { getFiles: () => [], createBinary: async (c, o) => crees.push([c, o.byteLength]) },
    fileManager: { getAvailablePathForAttachment: async (n) => 'Pièces jointes/' + n } };
  g.assurerDossier = async () => {};
  g.noteEvenementAJour = async () => ({ path: 'EV.md' });
  g.majPiecesNoteEvenement = async (f) => majs.push(f.path);
  g._contenuPiece = async () => Buffer.from('abc');
  const n = await g.importerPiecesEvenement({ pieces: [{ nom: 'a.pdf', taille: 3, local: LOCAL },
    { nom: 'b.command', taille: 3, local: LOCAL }] });
  assert.equal(n, 1);
  assert.deepEqual(crees, [['Pièces jointes/a.pdf', 3]]);
  assert.deepEqual(majs, ['EV.md']);
});

test('le script d’agenda demande les pièces en gardant le test du sélecteur', () => {
  const s = Ariane.genererJXAEvenementsFond(['Calendrier'], '2026-11-01', '2026-11-30');
  assert.ok(s.includes('respondsToSelector("attachments")'));
  assert.ok(s.includes('pj.join("\\u001e")'));
});

test('copie du coffre : le nom décomposé de Calendrier retrouve le nom composé du coffre', () => {
  const nfd = 'Programme détaillé.pdf'.normalize('NFD');
  const nfc = 'Programme détaillé.pdf'.normalize('NFC');
  assert.notEqual(nfd, nfc);
  assert.ok(Ariane.fichierEstPiece({ name: nfc, stat: { size: 10 } }, { nom: nfd, taille: 10 }));
  assert.equal(Ariane.nomFichierPiece(nfd), nfc);
});

test('une pièce importée s’ouvre dans un onglet d’Obsidian, sans copie temporaire', async () => {
  const nfd = 'Programme détaillé.pdf'.normalize('NFD');
  const copie = { name: nfd.normalize('NFC'), extension: 'pdf', path: 'PJ/x.pdf', stat: { size: 10 } };
  const ouverts = [];
  const g = Object.create(Ariane.prototype);
  g.app = { vault: { getFiles: () => [copie] },
    workspace: { getLeaf: (o) => ({ openFile: async (f) => ouverts.push([o, f]) }) } };
  g._contenuPiece = async () => { throw new Error('ne doit pas relire Calendrier'); };
  assert.equal(await g.ouvrirPieceEvenement({ nom: nfd, taille: 10, local: '/x', url: '' }), true);
  assert.deepEqual(ouverts, [['tab', copie]]);
});

test('un document Office s’ouvre dans Obsidian quand un greffon (ONLYOFFICE) le prend en charge', async () => {
  const pris = new Set(['docx', 'xlsx', 'pptx']);
  const app = { viewRegistry: { isExtensionRegistered: (e) => pris.has(e) } };
  for (const e of ['docx', 'XLSX', 'pptx', 'pdf', 'md', 'png']) assert.ok(Ariane.ouvrableDansObsidian(app, e), e);
  for (const e of ['doc', 'odt', 'zip']) assert.ok(!Ariane.ouvrableDansObsidian(app, e), e);
  assert.ok(!Ariane.ouvrableDansObsidian({}, 'docx'), 'sans greffon : l’application du système');
  const ouverts = [];
  const g = Object.create(Ariane.prototype);
  g.app = Object.assign({ workspace: { getLeaf: (o) => ({ openFile: async (f) => ouverts.push([o, f.path]) }) } }, app);
  await g.ouvrirFichierCoffre({ path: 'Livrables/Rapport.docx', extension: 'docx' });
  assert.deepEqual(ouverts, [['tab', 'Livrables/Rapport.docx']]);
});

test('Notes jointes : un onglet par famille, les tâches à la place de leur famille, puis les autres', () => {
  const fam = (nom, dossiers, icone) => ({ nom, dossiers, icone: icone || '', couleur: '' });
  const o = Ariane.ongletsNotesJointes([
    fam('Note conceptuelle', ['03 - Notes conceptuelles'], 'book'),
    fam('Tâches', ['08 - Tâches']),
    fam('Notes d\'événements', ['10 - Notes d\'événements']),
    fam('Notes manuscrites', ['12 - Notes manuscrites']),
  ], { dossierT: '08 - Tâches', dossierNE: '10 - Notes d\'événements', taches: true });
  assert.deepEqual(o.map((x) => x.id), ['famille:Note conceptuelle', 'taches', 'famille:Notes manuscrites', 'autres']);
  assert.equal(o[0].icone, 'book');
  assert.equal(o[1].icone, 'square-check');
  // Sans famille pour les tâches : l'onglet vient quand même ; sans le module, non.
  assert.deepEqual(Ariane.ongletsNotesJointes([], { dossierT: '08', dossierNE: '10', taches: true }).map((x) => x.id), ['taches', 'autres']);
  assert.deepEqual(Ariane.ongletsNotesJointes([], { dossierT: '08', dossierNE: '10', taches: false }).map((x) => x.id), ['autres']);
  assert.ok(Ariane.correspondRecherche('Journée d’études GT incertitude', 'gt etudes'));
  assert.ok(!Ariane.correspondRecherche('Journée', 'gt'));
});

test('Notes jointes : joindre et détacher une note ou une tâche ; l’échéance de la tâche ne bouge pas', async () => {
  const g = Object.create(Ariane.prototype);
  const fichier = (path, mtime) => ({ path, basename: path.split('/').pop().replace(/\.md$/, ''), extension: 'md', stat: { mtime }, parent: { path: path.slice(0, path.lastIndexOf('/')) } });
  const ev = fichier('10 - Notes d\'événements/EV-20261120-0900.md', 1);
  const nm = fichier('12 - Notes manuscrites/NM-202611201427.md', 50);
  const nc = fichier('03 - Notes conceptuelles/NC-1.md', 40);
  const libre = fichier('Brouillon.md', 45);
  const tache = fichier('08 - Tâches/T001.md', 60);
  const notes = [ev, nm, nc, libre, tache];
  const fms = new Map([
    ['EV-20261120-0900', { 'Événement ID': 'abc', Date: '2026-11-20' }],
    ['NM-202611201427', { Type: 'note-manuscrite', Titre: 'GT incertitude' }],
    ['NC-1', { aliases: ['Risque'] }],
  ]);
  g.settings = { famillesNotes: [
    { nom: 'Note conceptuelle', dossiers: ['03 - Notes conceptuelles'] },
    { nom: 'Notes manuscrites', dossiers: ['12 - Notes manuscrites'] },
  ] };
  g.ecrituresRecentes = new Map();
  Object.defineProperty(g, 'dossierT', { value: '08 - Tâches' });
  Object.defineProperty(g, 'dossierNE', { value: '10 - Notes d\'événements' });
  g.refDeChemin = (c) => (c.startsWith('08 - Tâches/') ? c.split('/').pop().replace('.md', '') : null);
  g.module = () => true;
  const t1 = { ref: 'T001', intitule: 'Préparer la journée', statut: 'à faire', fichier: tache, evenements: [], echeance: '2026-12-01' };
  g.tachesPourGantt = () => [t1];
  const maj = [];
  g.majTache = async (ref, champs) => { maj.push(champs); Object.assign(t1, champs); };
  g.marquerOrigineTache = () => {};
  g.app = {
    vault: { getMarkdownFiles: () => notes },
    metadataCache: {
      getFileCache: (f) => ({ frontmatter: fms.get(f.basename) }),
      getFirstLinkpathDest: (n) => notes.find((f) => f.basename === String(n).replace(/\.md$/, '').split('/').pop()) || null,
    },
    fileManager: { processFrontMatter: async (f, fn) => { const x = fms.get(f.basename) || {}; fn(x); fms.set(f.basename, x); } },
  };
  g._lienVers = (f) => '[[' + f.basename + ']]';
  g.tachesDeNoteEvenement = (note) => [t1].filter((t) => g._visePath(t.evenements, t.fichier.path, note.path))
    .map((t) => ({ tache: t, lien: t.evenements[0] }));
  const onglets = g.ongletsNotesJointes();
  const parId = (id) => onglets.find((o) => o.id === id);
  assert.deepEqual(onglets.map((o) => o.id), ['famille:Note conceptuelle', 'famille:Notes manuscrites', 'taches', 'autres']);
  // Rien de joint ; les notes de chaque onglet, sans l'événement ni les tâches.
  assert.deepEqual(g.notesJointesDe(ev), []);
  const manus = g.candidatsNotesJointes(ev, parId('famille:Notes manuscrites'), []);
  assert.deepEqual(manus.map((x) => x.titre), ['GT incertitude']);
  assert.deepEqual(g.candidatsNotesJointes(ev, parId('autres'), []).map((x) => x.f.basename), ['Brouillon']);
  // Joindre une note : « Événement » ; une tâche : son lien, échéance intacte.
  await g.joindreNoteEvenement(ev, manus[0]);
  assert.deepEqual(fms.get('NM-202611201427')['Événement'], ['[[EV-20261120-0900]]']);
  const taches = g.candidatsNotesJointes(ev, parId('taches'), []);
  await g.joindreNoteEvenement(ev, taches[0]);
  assert.deepEqual(maj, [{ evenements: ['[[EV-20261120-0900]]'] }]);
  assert.equal(t1.echeance, '2026-12-01');
  const jointes = g.notesJointesDe(ev);
  assert.deepEqual(jointes.map((j) => j.type + ':' + j.f.basename), ['note:NM-202611201427', 'tache:T001']);
  assert.equal(jointes[0].sous, 'Notes manuscrites');
  // Ce qui est joint ne se propose plus.
  assert.deepEqual(g.candidatsNotesJointes(ev, parId('famille:Notes manuscrites'), jointes), []);
  // Détacher la note : la propriété vidée disparaît.
  await g.detacherNoteEvenement(ev, jointes[0]);
  assert.ok(!('Événement' in fms.get('NM-202611201427')));
});

// Un élément d'affichage minimal, assez pour dessiner une fenêtre et y cliquer.
function elementFactice(tag, o) {
  const e = { tag, enfants: [], classes: new Set(String((o && o.cls) || '').split(' ').filter(Boolean)), texte: (o && o.text) || '',
    attrs: Object.assign({}, (o && o.attr) || {}), style: {}, ecoutes: {}, value: '' };
  const creer = (t) => (x) => { const c = elementFactice(t, typeof x === 'string' ? { cls: x } : x); e.enfants.push(c); return c; };
  Object.assign(e, {
    createDiv: creer('div'), createSpan: creer('span'), createEl: (t, x) => creer(t)(x),
    empty() { e.enfants = []; }, addClass(c) { e.classes.add(c); }, setText(t) { e.texte = t; },
    addEventListener(n, f) { e.ecoutes[n] = f; }, focus() {},
    tout() { return [e].concat(...e.enfants.map((c) => c.tout())); },
    texteTotal() { return [e.texte].concat(e.enfants.map((c) => c.texteTotal())).filter(Boolean).join(' | '); },
  });
  return e;
}

test('Notes jointes : la fenêtre s’ouvre, joint d’un clic, change d’onglet', async () => {
  const obs = require('obsidian');
  const proto = obs.Modal.prototype;
  const avant = { open: proto.open, setTitle: proto.setTitle, close: proto.close };
  proto.open = function () { this.app = this.app || global.__appModale; this.contentEl = elementFactice('div'); this.modalEl = elementFactice('div'); this.onOpen(); global.__modale = this; };
  proto.setTitle = function (t) { this.titre = t; };
  proto.close = function () {};
  const ancienSetTimeout = global.setTimeout;
  try {
    const g = Object.create(Ariane.prototype);
    const fichier = (path, mtime) => ({ path, basename: path.split('/').pop().replace(/\.md$/, ''), extension: 'md', stat: { mtime }, parent: { path: path.slice(0, path.lastIndexOf('/')) } });
    const ev = fichier('10/EV-20261120-0900.md', 1);
    const nm = fichier('12 - Notes manuscrites/NM-1.md', 50);
    const nc = fichier('03 - Notes conceptuelles/NC-1.md', 40);
    const notes = [ev, nm, nc];
    const fms = new Map([['EV-20261120-0900', { 'Événement ID': 'abc', Titre: 'Journée du GT', 'Début': '2026-11-20T09:00', Fin: '2026-11-20T18:00' }],
      ['NM-1', { Titre: 'GT incertitude' }], ['NC-1', { aliases: ['Risque'] }]]);
    g.settings = { famillesNotes: [{ nom: 'Notes manuscrites', dossiers: ['12 - Notes manuscrites'], icone: 'pen' },
      { nom: 'Note conceptuelle', dossiers: ['03 - Notes conceptuelles'] }] };
    g.ecrituresRecentes = new Map();
    Object.defineProperty(g, 'dossierT', { value: '08' });
    Object.defineProperty(g, 'dossierNE', { value: '10' });
    g.refDeChemin = () => null;
    g.module = () => false;
    g.tachesPourGantt = () => [];
    g.tachesDeNoteEvenement = () => [];
    g._lienVers = (f) => '[[' + f.basename + ']]';
    g.app = {
      vault: { getMarkdownFiles: () => notes },
      metadataCache: { getFileCache: (f) => ({ frontmatter: fms.get(f.basename) }),
        getFirstLinkpathDest: (n) => notes.find((f) => f.basename === String(n)) || null },
      fileManager: { processFrontMatter: async (f, fn) => fn(fms.get(f.basename)) },
    };
    global.__appModale = g.app;
    g.ouvrirNotesJointes(ev);
    const m = global.__modale;
    assert.equal(m.titre, 'Notes jointes');
    const texte = m.contentEl.texteTotal();
    assert.match(texte, /Journée du GT \| vendredi 20 novembre 2026, 9 h 00 à 18 h 00/);
    assert.match(texte, /Aucune note jointe pour l’instant\./);
    assert.match(texte, /Notes manuscrites \| .*Note conceptuelle \| .*Autres notes/);
    // L'onglet des notes manuscrites (le premier) : un clic joint la note.
    const ligne = m.contentEl.tout().find((x) => x.classes.has('est-candidate'));
    assert.match(ligne.texteTotal(), /GT incertitude/);
    await ligne.ecoutes.click();
    assert.deepEqual(fms.get('NM-1')['Événement'], ['[[EV-20261120-0900]]']);
    assert.match(m.contentEl.texteTotal(), /Jointes \(1\) \| GT incertitude \| Notes manuscrites/);
    // Changer d'onglet : les notes conceptuelles.
    const onglet = m.contentEl.tout().find((x) => x.classes.has('zfa-nj-onglet') && x.texteTotal().includes('Note conceptuelle'));
    onglet.ecoutes.click();
    assert.ok(m.contentEl.tout().some((x) => x.classes.has('est-candidate') && x.texteTotal().includes('Risque')));
  } finally {
    Object.assign(proto, avant);
    global.setTimeout = ancienSetTimeout;
    delete global.__modale;
    delete global.__appModale;
  }
});
