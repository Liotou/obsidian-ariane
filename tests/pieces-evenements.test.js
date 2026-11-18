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
