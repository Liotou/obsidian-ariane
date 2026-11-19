// Notes manuscrites : les cahiers de la Boox relus sur un WebDAV. Lecture
// des listes du serveur, des PDF de la Boox (traits identifiés, révisions,
// pages), séances, cahier renommé, et une synchronisation de bout en bout.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const BASE = 'https://serveur.exemple/dav.php/@Home/boox/';

const reponse = (href, o) => '<d:response><d:href>' + href + '</d:href><d:propstat><d:prop>'
  + (o.dossier ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/>')
  + (o.taille != null ? '<d:getcontentlength>' + o.taille + '</d:getcontentlength>' : '')
  + (o.modif ? '<d:getlastmodified>' + o.modif + '</d:getlastmodified>' : '')
  + (o.etag ? '<d:getetag>"' + o.etag + '"</d:getetag>' : '')
  + '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>';
const multistatus = (...r) => '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' + r.join('') + '</d:multistatus>';

// Un PDF à la manière de la Boox : un trait = une annotation Stamp portant
// son identifiant dans /onyxtag. revisions : objets ajoutés à la suite.
function pdfBoox(pages, opts) {
  const o = opts || {};
  let n = 10;
  const corps = [];
  const kids = [];
  for (const traits of pages) {
    const annots = [];
    for (const t of traits) {
      n += 1;
      annots.push(n + ' 0 R');
      corps.push(n + ' 0 obj\n<</Name/#ONYX-STROKE/Rect[ 10 ' + t.y + ' 20 ' + (t.y + 5) + ']/Subtype/Stamp/Type/Annot'
        + '/onyxtag(u:{"extra_attr":"{\\"x\\":1}","id":"' + t.id + '","layer_id":"0","type":"BrushStrokeV2"})>>\nendobj');
    }
    n += 1;
    const tab = n;
    corps.push(tab + ' 0 obj\n[ ' + annots.join(' ') + ' ]\nendobj');
    n += 1;
    kids.push(n + ' 0 R');
    corps.push(n + ' 0 obj\n<</Annots ' + tab + ' 0 R /MediaBox[ 0 0 595 842]/Parent 2 0 R /Type/Page>>\nendobj');
  }
  return '%PDF-1.7\n1 0 obj\n<</Pages 2 0 R /Type/Catalog>>\nendobj\n'
    + '2 0 obj\n<</Count ' + pages.length + '/Kids[ ' + kids.join(' ') + ' ]/Type/Pages>>\nendobj\n'
    + '3 0 obj\n<</CreationDate(D:20261119100000)/Creator(BOOX)/ModDate(' + (o.date || 'D:20261119102437') + ')>>\nendobj\n'
    + corps.join('\n') + '\n' + (o.suite || '') + 'trailer\n<</Root 1 0 R>>\n%%EOF\n';
}
const id = (k) => k.padStart(8, '0') + '-aaaa-bbbb-cccc-000000000000';

test('WebDAV : la liste du serveur, préfixes et entités compris, relative à la base', () => {
  const xml = multistatus(
    reponse('/dav.php/@Home/boox/', { dossier: true }),
    reponse('/dav.php/@Home/boox/onyx/', { dossier: true }),
    reponse('/dav.php/@Home/boox/onyx/NoteAir5C/Cahiers/Cahier%20infini-2.pdf',
      { taille: 45384363, modif: 'Thu, 19 Nov 2026 09:24:43 GMT', etag: 'abc' }),
    reponse('/dav.php/@Home/boox/onyx/R%C3%A9union%20&amp;%20suite.pdf', { taille: 10 }),
  ).replace(/d:/g, 'D:').replace('<D:multistatus xmlns:D', '<D:multistatus xmlns:D');
  const l = Ariane.listeWebdav(xml, BASE);
  assert.equal(l.length, 4);
  assert.deepEqual(l.map((x) => x.chemin), ['', 'onyx', 'onyx/NoteAir5C/Cahiers/Cahier infini-2.pdf', 'onyx/Réunion & suite.pdf']);
  assert.equal(l[1].dossier, true);
  assert.equal(l[2].dossier, false);
  assert.equal(l[2].taille, 45384363);
  assert.equal(l[2].etag, 'abc');
  assert.equal(l[2].modif, Date.parse('Thu, 19 Nov 2026 09:24:43 GMT'));
});

test('chemin : appareil, dossier de l’appli Notes, titre', () => {
  assert.deepEqual(Ariane.cheminCahierBoox('onyx/NoteAir5C/Cahiers/Cahier infini-2.pdf'),
    { titre: 'Cahier infini-2', appareil: 'NoteAir5C', dossier: 'Cahiers' });
  assert.deepEqual(Ariane.cheminCahierBoox('onyx/NoteAir5C/Thèse/Terrain/Mardi.pdf'),
    { titre: 'Mardi', appareil: 'NoteAir5C', dossier: 'Thèse/Terrain' });
});

test('nom : NM-AAAAMMJJHHMM en heure locale', () => {
  assert.equal(Ariane.nomNoteManuscrite(new Date(2026, 10, 19, 9, 5)), 'NM-202611190905');
  assert.equal(Ariane.isoLocalManuscrit(new Date(2026, 0, 2, 23, 7)), '2026-01-02T23:07');
});

test('PDF : arrivé en entier ou tronqué ; date de la Boox en heure locale', () => {
  const p = pdfBoox([[{ id: id('1'), y: 100 }]]);
  assert.ok(Ariane.pdfComplet(p));
  assert.ok(!Ariane.pdfComplet(p.slice(0, p.length - 30)));
  assert.ok(!Ariane.pdfComplet('<html>erreur</html>'));
  const d = Ariane.dateBoox('D:20261119102437');
  assert.deepEqual([d.getHours(), d.getMinutes(), d.getSeconds()], [10, 24, 37]);
});

test('traits : par page, dans l’ordre des pages, la dernière révision fait foi', () => {
  const p = pdfBoox([[{ id: id('1'), y: 100 }, { id: id('2'), y: 300 }], [{ id: id('3'), y: 50 }]]);
  const a = Ariane.traitsPdfBoox(p);
  assert.equal(a.pages.length, 2);
  assert.deepEqual(a.pages.map((x) => x.traits.length), [2, 1]);
  assert.equal(a.pages[0].traits[0].cle, Ariane.cleTrait(id('1')));
  assert.equal(a.pages[0].traits[1].y2, 305);
  assert.ok(a.vectoriel);
  assert.equal(a.date.getMinutes(), 24);
  // Une révision ajoutée réécrit le tableau des annotations de la page 2.
  const r = pdfBoox([[{ id: id('1'), y: 100 }], [{ id: id('3'), y: 50 }]],
    { suite: '90 0 obj\n<</Name/#ONYX-STROKE/Rect[ 0 700 9 720]/onyxtag(u:{"id":"' + id('9') + '"})>>\nendobj\n'
      + '15 0 obj\n[ 14 0 R 90 0 R ]\nendobj\n', date: 'D:20261120080000' });
  const b = Ariane.traitsPdfBoox(r);
  assert.deepEqual(b.pages.map((x) => x.traits.length), [1, 2]);
  assert.equal(b.date.getDate(), 20);
  // Un PDF bitmap : aucun trait, rien de vectoriel.
  assert.equal(Ariane.traitsPdfBoox('%PDF-1.7\n1 0 obj\n<</Type/Catalog>>\nendobj\n%%EOF').vectoriel, false);
});

test('séance : les traits nouveaux, leurs pages et la bande occupée', () => {
  const a = Ariane.traitsPdfBoox(pdfBoox([[{ id: id('1'), y: 100 }, { id: id('2'), y: 300 }], [{ id: id('3'), y: 50 }]]));
  const s = Ariane.seanceManuscrite(a, new Set([Ariane.cleTrait(id('1')), Ariane.cleTrait(id('3'))]));
  assert.deepEqual(s, { nouveaux: 1, pages: [{ page: 1, traits: 1, zone: [300, 305] }] });
  assert.equal(Ariane.seanceManuscrite(a, new Set(a.pages.flatMap((p) => p.traits.map((x) => x.cle)))).nouveaux, 0);
});

test('cahier renommé : reconnu à ses traits, au-delà de la moitié', () => {
  const cles = ['a', 'b', 'c', 'd'];
  assert.equal(Ariane.cahierReconnu(cles, [{ chemin: 'x', cles: new Set(['a']) }, { chemin: 'y', cles: new Set(['a', 'b', 'c']) }]), 'y');
  assert.equal(Ariane.cahierReconnu(cles, [{ chemin: 'x', cles: new Set(['a', 'b']) }]), null);
  assert.equal(Ariane.cahierReconnu([], [{ chemin: 'x', cles: new Set() }]), null);
});

test('envoi en cours : lu quand il ne bouge plus, ou deux minutes après sa modification', () => {
  const t = Date.parse('2026-11-19T10:00:00Z');
  const f = { taille: 10, etag: 'e', modif: t - 30000 };
  assert.equal(Ariane.cahierPret(f, null, t), false);
  assert.equal(Ariane.cahierPret(f, { taille: 10, etag: 'e', t: t - 70000 }, t), true);
  assert.equal(Ariane.cahierPret(f, { taille: 9, etag: 'e', t: t - 70000 }, t), false);
  assert.equal(Ariane.cahierPret(Object.assign({}, f, { modif: t - 130000 }), null, t), true);
  assert.equal(Ariane.cahierChange(f, null), true);
  assert.equal(Ariane.cahierChange(f, { etag: 'e', taille: 1 }), false);
  assert.equal(Ariane.cahierChange({ taille: 10, modif: 5 }, { taille: 10, modif: 5 }), false);
});

test('tableau des séances : la plus récente en tête, pages et nombres lisibles', () => {
  const b = Ariane.blocSeancesManuscrites([
    { quand: '2026-11-19T10:24', nouveaux: 5021, pages: [{ page: 1 }, { page: 2 }], premiere: true },
    { quand: '2026-11-20T08:05', nouveaux: 1, pages: [{ page: 3 }] },
  ]);
  const l = b.split('\n');
  assert.equal(l[0], '<!-- ariane:seances -->');
  assert.equal(l[3], '| Date | Heure | Séance | Traits | Pages |');
  assert.equal(l[5], '| 20 novembre 2026 | 8 h 05 | Écriture | 1 | 3 |');
  assert.ok(/^\| 19 novembre 2026 \| 10 h 24 \| Premier import \| 5\s021 \| 1, 2 \|$/.test(l[6]), l[6]);
  assert.equal(l[7], '', 'une ligne vide referme le tableau');
  assert.equal(Ariane.blocSeancesManuscrites([]), '');
});

// ── de bout en bout, avec un serveur et un coffre factices ──
function coffre() {
  const fichiers = new Map();
  const dossiers = new Set();
  const fm = new Map();
  const g = Object.create(Ariane.prototype);
  g.settings = { manuscritesUrl: BASE, manuscritesUtilisateur: 'moi', manuscritesDossier: '12 - Notes manuscrites',
    manuscritesTranscrire: false };
  g.ecrituresRecentes = new Map();
  const fichier = (path) => ({ path, name: path.slice(path.lastIndexOf('/') + 1), basename: path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '') });
  const yaml = (texte) => {
    const m = /^---\n([\s\S]*?)\n---/.exec(texte);
    const o = {};
    if (m) {
      for (const l of m[1].split('\n')) {
        const i = l.indexOf(': ');
        const v = l.slice(i + 2);
        try { o[l.slice(0, i)] = JSON.parse(v); } catch (e) { o[l.slice(0, i)] = v; }
      }
    }
    return o;
  };
  g.app = {
    secretStorage: { getSecret: () => 'secret', setSecret: () => {} },
    vault: {
      adapter: {
        exists: async (p) => fichiers.has(p) || dossiers.has(p),
        read: async (p) => fichiers.get(p),
        write: async (p, v) => { fichiers.set(p, v); },
        mkdir: async (p) => { dossiers.add(p); },
      },
      getAbstractFileByPath: (p) => (fichiers.has(p) ? fichier(p) : dossiers.has(p) ? { path: p } : null),
      createFolder: async (p) => { dossiers.add(p); },
      create: async (p, v) => { fichiers.set(p, v); fm.set(p, yaml(v)); },
      createBinary: async (p, v) => { fichiers.set(p, v); },
      modifyBinary: async (f, v) => { fichiers.set(f.path, v); },
      read: async (f) => fichiers.get(f.path),
      readBinary: async (f) => fichiers.get(f.path),
      modify: async (f, v) => { fichiers.set(f.path, v); },
    },
    fileManager: {
      getAvailablePathForAttachment: async (n) => '94 - Pièces jointes/' + n,
      processFrontMatter: async (f, fn) => { const x = fm.get(f.path) || {}; fn(x); fm.set(f.path, x); },
    },
    metadataCache: {
      getFirstLinkpathDest: (nom) => {
        for (const p of fichiers.keys()) if (p.endsWith('/' + nom) || p.endsWith('/' + nom + '.md')) return fichier(p);
        return null;
      },
    },
  };
  return { g, fichiers, fm };
}

test('synchronisation : import d’un cahier, puis séance nouvelle, puis cahier renommé', async () => {
  const { g, fichiers, fm } = coffre();
  const ancien = Date.now() - 10 * 60000;
  let serveur = {};
  let auth = '';
  global.__arianeRequete = async (o) => {
    auth = o.headers.Authorization;
    if (o.method === 'PROPFIND') {
      const chemin = decodeURIComponent(new URL(o.url).pathname);
      const sous = Object.keys(serveur).filter((p) => ('/dav.php/@Home/boox/' + p).startsWith(chemin));
      const dossiers = new Set();
      const lignes = [reponse(chemin, { dossier: true })];
      for (const p of sous) {
        const reste = ('/dav.php/@Home/boox/' + p).slice(chemin.length);
        if (reste.includes('/')) dossiers.add(chemin + reste.slice(0, reste.indexOf('/') + 1));
        else lignes.push(reponse(encodeURI(chemin + reste), { taille: serveur[p].length, modif: new Date(ancien).toUTCString(), etag: String(serveur[p].length) }));
      }
      for (const d of dossiers) lignes.push(reponse(encodeURI(d), { dossier: true }));
      return { status: 207, text: multistatus(...lignes) };
    }
    const p = decodeURIComponent(new URL(o.url).pathname).slice('/dav.php/@Home/boox/'.length);
    const t = serveur[p];
    return t ? { status: 200, arrayBuffer: Uint8Array.from(Buffer.from(t, 'latin1')).buffer } : { status: 404 };
  };
  try {
    const traits1 = [{ id: id('1'), y: 100 }, { id: id('2'), y: 300 }];
    serveur = { 'onyx/NoteAir5C/Cahiers/Réunion.pdf': pdfBoox([traits1]) };
    const b1 = await g.synchroniserNotesManuscrites(false);
    assert.deepEqual(b1, { nouvelles: 1, majs: 0, attente: 0, erreurs: 0, transcrites: 0 });
    assert.equal(auth, 'Basic ' + Buffer.from('moi:secret').toString('base64'));
    const notes = [...fichiers.keys()].filter((p) => p.startsWith('12 - Notes manuscrites/'));
    assert.equal(notes.length, 1);
    assert.match(notes[0], /^12 - Notes manuscrites\/NM-\d{12}\.md$/);
    const nom = notes[0].slice(23, -3);
    assert.ok(fichiers.has('94 - Pièces jointes/' + nom + '.pdf'));
    const texte = fichiers.get(notes[0]);
    assert.ok(texte.includes('Type: note-manuscrite'));
    assert.ok(texte.includes('Titre: "Réunion"'));
    assert.ok(texte.includes('PDF: "[[' + nom + '.pdf]]"'));
    assert.ok(texte.includes('| Premier import | 2 | 1 |'));
    assert.ok(texte.includes('![[' + nom + '.pdf]]'));

    // Rien n'a changé : rien n'est relu.
    assert.deepEqual(await g.synchroniserNotesManuscrites(false), { nouvelles: 0, majs: 0, attente: 0, erreurs: 0, transcrites: 0 });

    // Une séance : un trait de plus en page 2.
    serveur['onyx/NoteAir5C/Cahiers/Réunion.pdf'] = pdfBoox([traits1, [{ id: id('5'), y: 40 }]], { date: 'D:20261120083000' });
    assert.deepEqual(await g.synchroniserNotesManuscrites(false), { nouvelles: 0, majs: 1, attente: 0, erreurs: 0, transcrites: 0 });
    assert.ok(fichiers.get(notes[0]).includes('| 20 novembre 2026 | 8 h 30 | Écriture | 1 | 2 |'));
    assert.equal(fm.get(notes[0]).Traits, 3);
    assert.equal(fm.get(notes[0])['Dernière écriture'], '2026-11-20T08:30');

    // Renommé sur la Boox : même note, nouveau titre, pas de doublon.
    serveur = { 'onyx/NoteAir5C/Terrain/Réunion du mardi.pdf': serveur['onyx/NoteAir5C/Cahiers/Réunion.pdf'] + ' ' };
    assert.deepEqual(await g.synchroniserNotesManuscrites(false), { nouvelles: 0, majs: 1, attente: 0, erreurs: 0, transcrites: 0 });
    assert.equal([...fichiers.keys()].filter((p) => p.startsWith('12 - Notes manuscrites/')).length, 1);
    assert.equal(fm.get(notes[0]).Titre, 'Réunion du mardi');
    assert.equal(fm.get(notes[0]).Cahier, 'Terrain/Réunion du mardi');
  } finally {
    delete global.__arianeRequete;
  }
});

test('synchronisation : un cahier encore en cours d’envoi attend, rien n’est créé', async () => {
  const { g, fichiers } = coffre();
  g._relancerNotesManuscrites = () => {};
  const p = pdfBoox([[{ id: id('1'), y: 1 }]]);
  global.__arianeRequete = async (o) => {
    if (o.method === 'PROPFIND') {
      return { status: 207, text: multistatus(reponse('/dav.php/@Home/boox/', { dossier: true }),
        reponse('/dav.php/@Home/boox/a.pdf', { taille: 5, modif: new Date().toUTCString(), etag: 'x' })) };
    }
    return { status: 200, arrayBuffer: Uint8Array.from(Buffer.from(p.slice(0, 40), 'latin1')).buffer };
  };
  try {
    assert.deepEqual(await g.synchroniserNotesManuscrites(false), { nouvelles: 0, majs: 0, attente: 1, erreurs: 0, transcrites: 0 });
    assert.equal([...fichiers.keys()].filter((x) => x.endsWith('.md')).length, 0);
  } finally {
    delete global.__arianeRequete;
  }
});

test('synchronisation : un serveur qui refuse ne fait croire à aucune disparition', async () => {
  const { g, fichiers } = coffre();
  global.__arianeRequete = async () => ({ status: 401, text: '' });
  try {
    assert.equal(await g.synchroniserNotesManuscrites(false), null);
    assert.equal(fichiers.size, 0);
  } finally {
    delete global.__arianeRequete;
  }
});

// ── transcription ──

test('bandes : de haut en bas, 1 000 points au plus, chevauchées, dans la page', () => {
  assert.deepEqual(Ariane.bandesZone([100, 400], 842), [[80, 420]]);
  const b = Ariane.bandesZone([726, 6323], 6327);
  assert.equal(b[0][1], 6327);
  assert.equal(b[b.length - 1][0], 706);
  for (let i = 0; i < b.length; i += 1) {
    assert.ok(b[i][1] - b[i][0] <= 1000);
    if (i) assert.equal(b[i - 1][0] + 30, b[i][1], 'chevauchement');
  }
  assert.equal(b.length, 6);
});

test('tâches : une séance très haute se coupe, les pages suivent', () => {
  const t = Ariane.tachesTranscription({ pages: [{ page: 1, zone: [0, 15000] }, { page: 2, zone: [10, 20] }] }, '2026-11-19T10:24', true);
  assert.deepEqual(t.map((x) => [x.page, x.zone]), [[1, [8000, 15000]], [1, [1000, 8000]], [1, [0, 1000]], [2, [10, 20]]]);
  assert.ok(t.every((x) => x.premiere && x.quand === '2026-11-19T10:24'));
});

test('note : la transcription s’ajoute après le PDF, page par page, sans rien remplacer', () => {
  const note = '---\nType: note-manuscrite\n---\n# Réunion\n\nbloc\n\n![[NM-1.pdf]]\n\nMes notes.\n';
  const c1 = Ariane.corpsAvecTranscription(note, 1, 'Première ligne.');
  assert.ok(c1.includes('![[NM-1.pdf]]\n\n<!-- ariane:transcription-p1 -->\n**Transcription, page 1**\n\nPremière ligne.\n<!-- /ariane:transcription-p1 -->\n\nMes notes.\n'), c1);
  // L'utilisateur corrige ; la séance suivante s'ajoute après sa correction.
  const corrige = c1.replace('Première ligne.', 'Première ligne, corrigée.');
  const c2 = Ariane.corpsAvecTranscription(corrige, 1, 'Ajout.', 'Séance du 20 novembre 2026, 8 h 30');
  assert.ok(c2.includes('Première ligne, corrigée.\n\n*Séance du 20 novembre 2026, 8 h 30*\n\nAjout.\n<!-- /ariane:transcription-p1 -->'));
  assert.equal(Ariane.transcriptionDePage(c2, 1), 'Première ligne, corrigée.\n\n*Séance du 20 novembre 2026, 8 h 30*\n\nAjout.');
  // Une page nouvelle : son bloc juste après celui de la page 1, avant le texte de l'utilisateur.
  const c3 = Ariane.corpsAvecTranscription(c2, 2, 'Page deux.');
  assert.ok(c3.indexOf('transcription-p2') > c3.indexOf('/ariane:transcription-p1'));
  assert.ok(c3.indexOf('transcription-p2') > c3.indexOf('![[NM-1.pdf]]'));
  assert.ok(c3.indexOf('transcription-p2') < c3.indexOf('Mes notes.'));
  // Sans PDF intégré : à la fin.
  assert.ok(Ariane.corpsAvecTranscription('# A\n', 1, 'x').endsWith('<!-- /ariane:transcription-p1 -->\n'));
  assert.equal(Ariane.corpsAvecTranscription(c3, 1, '  '), c3);
  assert.ok(Ariane.transcriptionVide('Rien de nouveau.'));
  assert.ok(!Ariane.transcriptionVide('Rien à signaler sur le site.'));
});

test('consigne : bandes successives, et le déjà transcrit pour ne rendre que l’ajout', () => {
  assert.match(Ariane.promptTranscription(3, ''), /ces 3 images/);
  assert.doesNotMatch(Ariane.promptTranscription(1, ''), /déjà transcrite/);
  assert.match(Ariane.promptTranscription(1, 'Ligne connue.'), /déjà transcrite[\s\S]*Ligne connue\./);
});

test('Claude : le texte de la ligne « result » du flux, rien si échec', () => {
  const flux = ['{"type":"system"}', '{"type":"assistant","message":{}}',
    '{"type":"result","subtype":"success","is_error":false,"result":"  Texte lu. "}'].join('\n');
  assert.equal(Ariane.resultatClaudeFlux(flux), 'Texte lu.');
  assert.equal(Ariane.resultatClaudeFlux('{"type":"result","subtype":"error_max_turns","is_error":true}'), null);
  assert.equal(Ariane.resultatClaudeFlux('pas du json'), null);
});

test('synchronisation : un cahier importé est transcrit, par l’IA de « Transcrire les cahiers »', async () => {
  const { g, fichiers } = coffre();
  g.settings.manuscritesTranscrire = true;
  const vues = [];
  g._ouvrirPdfManuscrit = async () => ({ destroy: () => {} });
  g._rendreBandesPdf = async (doc, page, zone) => { vues.push([page, zone]); return [{ type: 'image/png', base64: 'AAAA' }]; };
  const demandes = [];
  g.genererImagesPour = async (id, prompt, images) => { demandes.push(id); return 'Ligne transcrite.'; };
  const p = pdfBoox([[{ id: id('1'), y: 100 }]]);
  global.__arianeRequete = async (o) => {
    if (o.method === 'PROPFIND') {
      return { status: 207, text: multistatus(reponse('/dav.php/@Home/boox/', { dossier: true }),
        reponse('/dav.php/@Home/boox/onyx/NoteAir5C/Cahiers/A.pdf', { taille: p.length, modif: new Date(Date.now() - 600000).toUTCString(), etag: 'x' })) };
    }
    return { status: 200, arrayBuffer: Uint8Array.from(Buffer.from(p, 'latin1')).buffer };
  };
  try {
    const b = await g.synchroniserNotesManuscrites(false);
    assert.deepEqual(b, { nouvelles: 1, majs: 0, attente: 0, erreurs: 0, transcrites: 1 });
    assert.deepEqual(demandes, ['manuscrites-transcrire']);
    assert.deepEqual(vues, [[1, [100, 105]]]);
    const note = [...fichiers.keys()].find((x) => x.startsWith('12 - Notes manuscrites/'));
    assert.ok(fichiers.get(note).includes('**Transcription, page 1**\n\nLigne transcrite.'));
    const etat = JSON.parse(fichiers.get('.ariane/notes-manuscrites.json'));
    assert.equal(Object.values(etat.cahiers)[0].aTranscrire, 0);
  } finally {
    delete global.__arianeRequete;
  }
});

test('transcription : un échec reste en file et se retente, abandonné au troisième', async () => {
  const { g, fichiers } = coffre();
  g.settings.manuscritesTranscrire = true;
  g._ouvrirPdfManuscrit = async () => ({});
  g._rendreBandesPdf = async () => [{ type: 'image/png', base64: 'AAAA' }];
  g.genererImagesPour = async () => null;
  fichiers.set('12 - Notes manuscrites/NM-1.md', '# A\n');
  fichiers.set('94 - Pièces jointes/NM-1.pdf', new ArrayBuffer(1));
  fichiers.set('.ariane/notes-manuscrites/NM-1.json', JSON.stringify({ cles: [], seances: [],
    aTranscrire: [{ page: 1, zone: [0, 10], quand: '2026-11-19T10:00', premiere: true }] }));
  const etat = { cahiers: { a: { note: 'NM-1', pdf: 'NM-1.pdf', aTranscrire: 1 } } };
  const bilan = { transcrites: 0 };
  for (let i = 1; i <= 3; i += 1) {
    await g._transcrireEnAttente(etat, bilan, false);
    const file = JSON.parse(fichiers.get('.ariane/notes-manuscrites/NM-1.json')).aTranscrire;
    assert.equal(file.length, i < 3 ? 1 : 0, 'passe ' + i);
  }
  assert.equal(etat.cahiers.a.aTranscrire, 0);
  assert.equal(fichiers.get('12 - Notes manuscrites/NM-1.md'), '# A\n');
});

test('commande : toute la note ouverte, une page déjà transcrite n’est que complétée', async () => {
  const { g, fichiers } = coffre();
  const vues = [];
  g._ouvrirPdfManuscrit = async () => ({});
  g._rendreBandesPdf = async (doc, page, zone) => { vues.push(page); return [{ type: 'image/png', base64: 'AAAA' }]; };
  const consignes = [];
  g.genererImagesPour = async (id, prompt) => { consignes.push(prompt); return 'Texte ' + consignes.length + '.'; };
  const pdf = pdfBoox([[{ id: id('1'), y: 100 }], [{ id: id('2'), y: 200 }]]);
  fichiers.set('12 - Notes manuscrites/NM-1.md', '---\nType: note-manuscrite\n---\n# A\n\n![[NM-1.pdf]]\n\n<!-- ariane:transcription-p1 -->\n**Transcription, page 1**\n\nDéjà là.\n<!-- /ariane:transcription-p1 -->\n');
  fichiers.set('94 - Pièces jointes/NM-1.pdf', Uint8Array.from(Buffer.from(pdf, 'latin1')).buffer);
  fichiers.set('.ariane/notes-manuscrites.json', JSON.stringify({ cahiers: { 'onyx/X/C/A.pdf': { note: 'NM-1', pdf: 'NM-1.pdf' } }, attente: {} }));
  g.app.workspace = { getActiveFile: () => ({ path: '12 - Notes manuscrites/NM-1.md', basename: 'NM-1' }) };
  g.app.metadataCache.getFileCache = () => ({ frontmatter: { Type: 'note-manuscrite' } });
  const n = await g.transcrireNoteManuscriteActive();
  assert.equal(n, 2);
  assert.deepEqual(vues, [1, 2]);
  assert.match(consignes[0], /déjà transcrite[\s\S]*Déjà là\./);
  assert.doesNotMatch(consignes[1], /déjà transcrite/);
  const note = fichiers.get('12 - Notes manuscrites/NM-1.md');
  assert.match(note, /Déjà là\.\n\n\*Complément du \d+ \S+ \d{4}\*\n\nTexte 1\./);
  assert.ok(note.includes('**Transcription, page 2**\n\nTexte 2.'));
  assert.ok(note.indexOf('transcription-p2') > note.indexOf('![[NM-1.pdf]]'));
  assert.equal(JSON.parse(fichiers.get('.ariane/notes-manuscrites.json')).cahiers['onyx/X/C/A.pdf'].aTranscrire, 0);
});
