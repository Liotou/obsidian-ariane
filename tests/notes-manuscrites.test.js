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

test('bloc des séances : la plus récente en tête, pages et nombres lisibles', () => {
  const b = Ariane.blocSeancesManuscrites([
    { quand: '2026-11-19T10:24', nouveaux: 5021, pages: [{ page: 1 }], premiere: true },
    { quand: '2026-11-20T08:05', nouveaux: 1, pages: [{ page: 2 }, { page: 3 }] },
  ]);
  const l = b.split('\n');
  assert.equal(l[0], '<!-- ariane:seances -->');
  assert.ok(l[3].startsWith('- 20 novembre 2026 à 8 h 05 : 1 trait nouveau, pages 2, 3'), l[3]);
  assert.ok(/^- 19 novembre 2026 à 10 h 24 : premier import, 5\s021 traits, page 1$/.test(l[4]), l[4]);
  assert.equal(Ariane.blocSeancesManuscrites([]), '');
});

// ── de bout en bout, avec un serveur et un coffre factices ──
function coffre() {
  const fichiers = new Map();
  const dossiers = new Set();
  const fm = new Map();
  const g = Object.create(Ariane.prototype);
  g.settings = { manuscritesUrl: BASE, manuscritesUtilisateur: 'moi', manuscritesDossier: '12 - Notes manuscrites' };
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
    assert.deepEqual(b1, { nouvelles: 1, majs: 0, attente: 0, erreurs: 0 });
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
    assert.ok(texte.includes('premier import, 2 traits, page 1'));
    assert.ok(texte.includes('![[' + nom + '.pdf]]'));

    // Rien n'a changé : rien n'est relu.
    assert.deepEqual(await g.synchroniserNotesManuscrites(false), { nouvelles: 0, majs: 0, attente: 0, erreurs: 0 });

    // Une séance : un trait de plus en page 2.
    serveur['onyx/NoteAir5C/Cahiers/Réunion.pdf'] = pdfBoox([traits1, [{ id: id('5'), y: 40 }]], { date: 'D:20261120083000' });
    assert.deepEqual(await g.synchroniserNotesManuscrites(false), { nouvelles: 0, majs: 1, attente: 0, erreurs: 0 });
    assert.ok(fichiers.get(notes[0]).includes('20 novembre 2026 à 8 h 30 : 1 trait nouveau, page 2'));
    assert.equal(fm.get(notes[0]).Traits, 3);
    assert.equal(fm.get(notes[0])['Dernière écriture'], '2026-11-20T08:30');

    // Renommé sur la Boox : même note, nouveau titre, pas de doublon.
    serveur = { 'onyx/NoteAir5C/Terrain/Réunion du mardi.pdf': serveur['onyx/NoteAir5C/Cahiers/Réunion.pdf'] + ' ' };
    assert.deepEqual(await g.synchroniserNotesManuscrites(false), { nouvelles: 0, majs: 1, attente: 0, erreurs: 0 });
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
    assert.deepEqual(await g.synchroniserNotesManuscrites(false), { nouvelles: 0, majs: 0, attente: 1, erreurs: 0 });
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
