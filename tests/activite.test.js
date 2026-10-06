// Activité réelle (ActivityWatch) : choix des seaux, découpe en segments,
// règles de classement, agrégation en créneaux. Le fuseau est fixé avant le
// chargement : les créneaux sont rendus en heure locale.
process.env.TZ = 'Europe/Paris';
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const MIN = 60000;
// 2026-10-05 00:00 à Paris (UTC+2).
const D0 = Date.parse('2026-10-04T22:00:00Z');
const D1 = D0 + 24 * 60 * MIN;
const a = (h, m) => D0 + (h * 60 + m) * MIN;
const evt = (deb, minutes, data) => ({ timestamp: new Date(deb).toISOString(), duration: minutes * 60, data });

test('choisirBucketsAW : fenêtres et absence de la même machine, navigateurs de toutes', () => {
  const tous = {
    'aw-watcher-window_mac': { id: 'aw-watcher-window_mac', type: 'currentwindow', hostname: 'mac', last_updated: '2026-10-05' },
    'aw-watcher-window_pc': { id: 'aw-watcher-window_pc', type: 'currentwindow', hostname: 'pc', last_updated: '2026-10-06' },
    'aw-watcher-afk_mac': { id: 'aw-watcher-afk_mac', type: 'afkstatus', hostname: 'mac' },
    'aw-watcher-afk_pc': { id: 'aw-watcher-afk_pc', type: 'afkstatus', hostname: 'pc' },
    'aw-watcher-web-chrome': { id: 'aw-watcher-web-chrome', type: 'web.tab.current', hostname: 'unknown' },
  };
  assert.deepEqual(Ariane.choisirBucketsAW(tous, 'mac'), {
    hote: 'mac', fenetre: ['aw-watcher-window_mac'], afk: ['aw-watcher-afk_mac'],
    web: ['aw-watcher-web-chrome'],
  });
  // Hôte inconnu du serveur : la machine dont les fenêtres ont bougé en dernier.
  assert.equal(Ariane.choisirBucketsAW(tous, 'autre').hote, 'pc');
  assert.deepEqual(Ariane.choisirBucketsAW({}, 'mac'), { hote: '', fenetre: [], afk: [], web: [] });
});

test('fusionnerIntervalles et couperParIntervalles', () => {
  assert.deepEqual(Ariane.fusionnerIntervalles([[5, 8], [1, 3], [2, 4], [8, 9], [7, 7]]),
    [[1, 4], [5, 9]]);
  assert.deepEqual(Ariane.couperParIntervalles(2, 10, [[0, 3], [5, 6], [9, 20]]),
    [[2, 3], [5, 6], [9, 10]]);
});

test('segmentsActivite : absence retirée, journée rognée, onglet du navigateur repris', () => {
  const fen = [
    evt(a(8, 0), 60, { app: 'Microsoft Word', title: 'Chapitre 2.docx' }),
    evt(a(9, 0), 30, { app: 'Safari', title: 'Google Scholar' }),
    evt(a(23, 50), 30, { app: 'Zotero', title: 'Lecture' }),       // déborde sur le lendemain
  ];
  const afk = [
    evt(a(8, 0), 20, { status: 'not-afk' }),
    evt(a(8, 20), 10, { status: 'afk' }),
    evt(a(8, 30), 16 * 60, { status: 'not-afk' }),
  ];
  const web = [evt(a(9, 10), 10, { url: 'https://scholar.google.com/x', title: 'Résultats' })];
  const s = Ariane.segmentsActivite(fen, afk, web, D0, D1);
  assert.deepEqual(s.map((x) => [(x.deb - D0) / MIN, (x.fin - D0) / MIN, x.app, x.url]), [
    [480, 500, 'Microsoft Word', ''],
    [510, 540, 'Microsoft Word', ''],
    [540, 550, 'Safari', ''],
    [550, 560, 'Safari', 'https://scholar.google.com/x'],
    [560, 570, 'Safari', ''],
    [1430, 1440, 'Zotero', ''],
  ]);
  assert.equal(s[3].titre, 'Résultats');
  // Sans seau d'absence, tout le temps des fenêtres compte.
  assert.equal(Ariane.segmentsActivite(fen.slice(0, 1), null, [], D0, D1)[0].fin - D0, 540 * MIN);
});

test('motifsActivite : texte, champ, expression, virgule dans une expression', () => {
  const m = Ariane.motifsActivite(' app:Zotero, .PDF ,/chap(itre)? \\d{1,2}/, url: hal.science');
  assert.equal(m.length, 4);
  assert.deepEqual(m[0], { champ: 'app', txt: 'zotero' });
  assert.deepEqual(m[1], { champ: '', txt: '.pdf' });
  assert.ok(m[2].re.test('CHAPITRE 12'));
  assert.deepEqual(m[3], { champ: 'url', txt: 'hal.science' });
  // Expression invalide : ignorée, le reste demeure.
  assert.deepEqual(Ariane.motifsActivite('/(/, word'), [{ champ: '', txt: 'word' }]);
});

test('compilerReglesActivite et classerActivite : première règle, couleur, exclusion', () => {
  const r = Ariane.compilerReglesActivite([
    '# commentaire',
    'Lecture #4f9d69 = app:Zotero, .pdf',
    'Rédaction = app:Word',
    '- = app:loginwindow',
    'sans égal',
    'Vide = ',
  ].join('\n'));
  assert.deepEqual(r.map((x) => [x.categorie, x.couleur, x.ignorer]),
    [['Lecture', '#4f9d69', false], ['Rédaction', '', false], ['', '', true]]);
  assert.equal(Ariane.classerActivite({ app: 'Zotero', titre: '' }, r).categorie, 'Lecture');
  assert.equal(Ariane.classerActivite({ app: 'Safari', titre: 'article.PDF' }, r).categorie, 'Lecture');
  assert.equal(Ariane.classerActivite({ app: 'Microsoft Word', titre: 'x' }, r).categorie, 'Rédaction');
  // « app: » ne regarde que l'application.
  assert.equal(Ariane.classerActivite({ app: 'Safari', titre: 'Zotero forums' }, r), undefined);
  assert.equal(Ariane.classerActivite({ app: 'loginwindow', titre: '' }, r), null);
});

test('libelleActivite : domaine pour une page, application et titre sinon', () => {
  assert.equal(Ariane.libelleActivite({ app: 'Safari', titre: 'x', url: 'https://www.cairn.info/revue' }), 'cairn.info');
  assert.equal(Ariane.libelleActivite({ app: 'Word', titre: 'Chapitre 2.docx', url: '' }), 'Word · Chapitre 2.docx');
  assert.equal(Ariane.libelleActivite({ app: 'Finder', titre: '', url: '' }), 'Finder');
});

test('agregerActivite : grains, interruption courte absorbée, créneau court écarté', () => {
  const regles = Ariane.compilerReglesActivite('Lecture #111111 = app:Zotero\nCourriel = app:Mail');
  const seg = (h, m, minutes, app, titre) => ({ deb: a(h, m), fin: a(h, m) + minutes * MIN, app, titre: titre || '', url: '' });
  const segs = [
    seg(9, 0, 40, 'Zotero', 'Article A'),
    seg(9, 40, 4, 'Mail', 'Boîte'),              // un grain de courriel au milieu
    seg(9, 45, 30, 'Zotero', 'Article B'),
    seg(11, 0, 6, 'Mail', 'Boîte'),               // trop court : écarté
    seg(14, 0, 30, 'Finder', ''),                 // non classé
  ];
  const opts = { d0: D0, d1: D1, grainMin: 5, dureeMin: 10, autre: '' };
  const b = Ariane.agregerActivite(segs, regles, opts);
  assert.equal(b.length, 1);
  assert.equal(b[0].categorie, 'Lecture');
  assert.equal(b[0].couleur, '#111111');
  assert.equal(b[0].debut, '2026-10-05T09:00');
  assert.equal(b[0].fin, '2026-10-05T10:15');
  assert.equal(b[0].actifMin, 70);
  assert.deepEqual(b[0].details.map((d) => d.libelle), ['Zotero · Article A', 'Zotero · Article B']);
  // Catégorie par défaut : le temps non classé apparaît, couleur neutre.
  const b2 = Ariane.agregerActivite(segs, regles, Object.assign({}, opts, { autre: 'Autre' }));
  const autre = b2.find((x) => x.categorie === 'Autre');
  assert.ok(autre);
  assert.equal(autre.debut, '2026-10-05T14:00');
  assert.equal(autre.fin, '2026-10-05T14:30');
  assert.equal(autre.couleur, '#8a8a8a');
});

test('agregerActivite : un créneau est borné par l\'activité réelle, pas par les grains', () => {
  const regles = Ariane.compilerReglesActivite('Lecture = app:Zotero');
  const segs = [{ deb: a(9, 2), fin: a(9, 33), app: 'Zotero', titre: '', url: '' }];
  const b = Ariane.agregerActivite(segs, regles, { d0: D0, d1: D1, grainMin: 5, dureeMin: 10 });
  assert.deepEqual([b[0].debut, b[0].fin, b[0].actifMin], ['2026-10-05T09:02', '2026-10-05T09:33', 31]);
});

test('agregerActivite : un grain trop peu actif reste vide', () => {
  const regles = Ariane.compilerReglesActivite('Lecture = app:Zotero');
  const segs = [{ deb: a(9, 0), fin: a(9, 0) + 30000, app: 'Zotero', titre: '', url: '' }];
  assert.deepEqual(Ariane.agregerActivite(segs, regles,
    { d0: D0, d1: D1, grainMin: 5, dureeMin: 0 }), []);
});

test('infobulleActivite : catégorie, horaires, actif, détails', () => {
  const t = Ariane.infobulleActivite({ categorie: 'Lecture', debut: '2026-10-05T09:00',
    fin: '2026-10-05T10:15', actifMin: 70, details: [{ libelle: 'Zotero · A', min: 40 }, { libelle: 'x', min: 0 }] });
  assert.equal(t, 'Lecture · 09:00 → 10:15\nActif : 1 h 10\n• Zotero · A (40 min)');
});

test('couleurActivite : stable et prise dans la palette', () => {
  assert.equal(Ariane.couleurActivite('Lecture'), Ariane.couleurActivite('Lecture'));
  assert.match(Ariane.couleurActivite('Lecture'), /^#[0-9a-f]{6}$/);
});

test('segmentsActivite : sans extension, l’adresse notée par le relevé des fenêtres est reprise (Safari)', () => {
  const D0 = Date.parse('2026-10-05T00:00:00Z');
  const D1 = D0 + 24 * 3600000;
  const fen = [{ timestamp: '2026-10-05T09:00:00Z', duration: 600,
    data: { app: 'Safari', title: 'Article', url: 'https://www.cairn.info/revue.htm' } }];
  const s = Ariane.segmentsActivite(fen, null, [], D0, D1);
  assert.equal(s.length, 1);
  assert.equal(s[0].url, 'https://www.cairn.info/revue.htm');
});

test('relevé Safari : lignes lues, onglets changés en événements de navigateur', () => {
  assert.deepEqual(Ariane.lireLigneSafari('T\t1000\thttps://a.fr/x\tTitre\tavec tab'),
    { ms: 1000, url: 'https://a.fr/x', titre: 'Titre\tavec tab' });
  assert.deepEqual(Ariane.lireLigneSafari('-\t2000'), { ms: 2000, url: '' });
  assert.deepEqual(Ariane.lireLigneSafari('E\tREFUS'), { erreur: 'REFUS' });
  assert.equal(Ariane.lireLigneSafari('bruit'), null);
  const D0 = Date.parse('2026-10-05T00:00:00Z');
  const ev = Ariane.ongletsEnEvenements([
    { debut: D0 - 60000, fin: D0 + 60000, url: 'https://a.fr', titre: 'A' },
    { debut: D0 + 1000, fin: D0 + 1000, url: 'https://vide.fr' },
    { debut: D0 + 5000, fin: D0 + 9000, url: '' },
  ], D0, D0 + 86400000);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].duration, 60);
  assert.equal(ev[0].data.url, 'https://a.fr');
});

test('segmentsActivite : les onglets Safari relevés par Ariane découpent la fenêtre Safari', () => {
  const D0 = Date.parse('2026-10-05T00:00:00Z');
  const fen = [{ timestamp: '2026-10-05T09:00:00Z', duration: 600, data: { app: 'Safari', title: 'Cairn', url: '' } }];
  const web = Ariane.ongletsEnEvenements([{ debut: D0 + 9 * 3600000, fin: D0 + 9 * 3600000 + 300000,
    url: 'https://www.cairn.info/x', titre: 'Cairn' }], D0, D0 + 86400000);
  const s = Ariane.segmentsActivite(fen, null, web, D0, D0 + 86400000);
  assert.equal(s[0].url, 'https://www.cairn.info/x');
  assert.equal(s[0].fin - s[0].deb, 300000);
});

/* -------------------------- résumés par l'IA -------------------------- */

test('catégories IA : nom, couleur, description ; commentaires et doublons écartés', () => {
  const c = Ariane.compilerCategoriesIA('# commentaire\nLecture #4f9d69 : lire des articles\nPersonnel et distraction : achats, vidéos\nLecture : doublon\n\n');
  assert.deepEqual(c.map((x) => x.nom), ['Lecture', 'Personnel et distraction']);
  assert.equal(c[0].couleur, '#4f9d69');
  assert.equal(c[0].description, 'lire des articles');
  assert.match(c[1].couleur, /^#[0-9a-f]{6}$/);
});

test('contenu d’un créneau : regroupé par application, titre et site, du plus long au plus court', () => {
  const M = 60000;
  const segs = [
    { deb: 0, fin: 20 * M, app: 'Microsoft Teams', titre: 'Cours HEG - TD1', url: '' },
    { deb: 20 * M, fin: 25 * M, app: 'Safari', titre: 'Personnel — Pantalon', url: 'https://www.vinted.fr/x' },
    { deb: 25 * M, fin: 40 * M, app: 'Microsoft Teams', titre: 'Cours HEG - TD1', url: '' },
    { deb: 50 * M, fin: 90 * M, app: 'Hors', titre: '', url: '' },
  ];
  const c = Ariane.contenuActivite(segs, 0, 45 * M, 10);
  assert.deepEqual(c, [
    { app: 'Microsoft Teams', titre: 'Cours HEG - TD1', domaine: '', min: 35 },
    { app: 'Safari', titre: 'Personnel — Pantalon', domaine: 'vinted.fr', min: 5 },
  ]);
});

test('invite : catégories, règles, créneaux avec leur contenu', () => {
  const p = Ariane.promptResumeActivite([{ id: 1, debut: '2026-10-06T09:00', fin: '2026-10-06T10:00', actifMin: 50,
    contenu: [{ app: 'Zotero', titre: 'Zotero', domaine: '', min: 50 }] }],
  [{ nom: 'Lecture', description: 'lire' }], 'Doctorant.');
  assert.match(p, /- Lecture : lire/);
  assert.match(p, /id 1 · 09:00 à 10:00 · 50 min actives/);
  assert.match(p, /50 min \| Zotero$/m);
  assert.match(p, /Contexte : Doctorant\./);
});

test('réponse de l’IA : catégorie reconnue sans égard aux accents, inconnue écartée, tirets remplacés', () => {
  const cats = Ariane.compilerCategoriesIA('Réunions #6c8ead : visios\nPersonnel et distraction #b5527a : loisirs');
  const r = Ariane.lireResumesActivite([
    { id: 1, categorie: 'reunions', resume: 'TD1 — échanges avec les groupes', personnel: false },
    { id: 2, categorie: 'Inconnue', resume: 'x' },
    { id: 3, categorie: 'Personnel et distraction', resume: 'Achats', personnel: 'true' },
  ], cats);
  assert.deepEqual(r.get(1), { categorie: 'Réunions', couleur: '#6c8ead', resume: 'TD1 : échanges avec les groupes', personnel: false });
  assert.equal(r.has(2), false);
  assert.equal(r.get(3).personnel, true);
});

/* ------------------ temps réel rattaché aux tâches ------------------ */

test('temps réel : empreinte, écriture et relecture d’une ligne', () => {
  assert.equal(Ariane.empreinteActivite('2026-10-05T17:31'), 'aw-261005-1731');
  const l = Ariane.formatTempsReel({ debut: '2026-10-05T17:31', fin: '2026-10-05T17:50', min: 19, quoi: 'Enseignement, Teams (TD)' });
  assert.equal(l, '2026-10-05 17:31-17:50 = 19 min (Enseignement, Teams TD) aw-261005-1731');
  assert.deepEqual(Ariane.lireTempsReel(l), { debut: '2026-10-05T17:31', fin: '2026-10-05T17:50', min: 19,
    quoi: 'Enseignement, Teams TD', id: 'aw-261005-1731' });
  assert.equal(Ariane.lireTempsReel('n’importe quoi'), null);
  assert.equal(Ariane.tempsReelDeTache([l, 'x', '2026-10-01 09:00-10:00 = 50 min aw-261001-0900'])[0].id, 'aw-261001-0900');
});

test('temps réel : section « Hors Obsidian » des Sessions, même sans créneau prévu', () => {
  const r = ['2026-10-05 17:31-17:50 = 19 min (Enseignement) aw-261005-1731'];
  const sans = Ariane.blocCreneaux([], null, {}, r);
  assert.match(sans, /^## Sessions\n\n### Hors Obsidian/);
  assert.match(sans, /17:31 → 17:50 \| 0 h 19 \| Enseignement \|/);
  assert.match(sans, /1 créneau hors Obsidian/);
  assert.equal(Ariane.blocCreneaux([], null, {}, []), '');
  const avec = Ariane.blocCreneaux(['2026-10-06 09:00-10:00'], Ariane.statsCreneaux(['2026-10-06 09:00-10:00'], '2026-10-01T00:00'), {}, r);
  assert.match(avec, /\| Session \|[\s\S]*### Hors Obsidian/);
});

test('rattachement : créneau prévu recouvrant, sans IA', () => {
  const bloc = { debut: '2026-10-05T17:30', fin: '2026-10-05T18:30', actifMin: 50 };
  const c = Ariane.candidatsParCreneauPrevu(bloc, [
    { ref: 'T001', creneaux: ['2026-10-05 17:00-18:00'] },
    { ref: 'T002', creneaux: ['2026-10-05 18:28-19:00'] },
    { ref: 'T003', creneaux: [] },
  ]);
  assert.deepEqual(c.map((x) => [x.ref, x.min]), [['T001', 30]]);
});

test('rattachement : réponse de l’IA vérifiée (refs connues, parts bornées puis normalisées)', () => {
  const r = Ariane.lireRattachements([
    { id: 1, taches: [{ ref: 'T054', part: 0.8, raison: 'document — ASNR' }, { ref: 'T999', part: 0.5 }, { ref: 'T020', part: 0.6 }] },
    { id: 2, taches: [] },
  ], ['T054', 'T020']);
  assert.deepEqual(r.get(1).map((x) => x.ref), ['T054', 'T020']);
  assert.ok(Math.abs(r.get(1).reduce((s, x) => s + x.part, 0) - 1) < 1e-9);
  assert.equal(r.get(1)[0].raison, 'document : ASNR');
  assert.deepEqual(r.get(2), []);
});

test('éditeur des réglages : règles et catégories, aller-retour texte ↔ lignes', () => {
  const D = Ariane._test.DEFAULT_SETTINGS;
  const r = Ariane.lignesReglesActivite(D.activiteRegles);
  assert.equal(Ariane.texteReglesActivite(r), D.activiteRegles);
  assert.deepEqual(r[r.length - 1], { categorie: '-', couleur: '', motifs: 'app:loginwindow, app:ScreenSaverEngine' });
  const c = Ariane.compilerCategoriesIA(D.activiteCategoriesIA);
  assert.deepEqual(Ariane.compilerCategoriesIA(Ariane.texteCategoriesIA(c)), c);
  assert.equal(Ariane.texteCategoriesIA([{ nom: 'A: #b', couleur: '#123456', description: '' }, { nom: '', couleur: '#000' }]), 'A b #123456');
});

test('rail du réel : Obsidian prime, ActivityWatch comble le reste, miettes écartées', () => {
  const obs = [{ a: 540, b: 600 }, { a: 630, b: 630.5 }];
  const ext = [{ a: 520, b: 640, bloc: 'X' }, { a: 700, b: 760, bloc: 'Y' }];
  const r = Ariane.fusionnerRailReel(obs, ext);
  assert.deepEqual(r.map((p) => [p.source, p.a, p.b]), [
    ['externe', 520, 540], ['obsidian', 540, 600], ['externe', 600, 630], ['obsidian', 630, 630.5],
    ['externe', 630.5, 640], ['externe', 700, 760]]);
  assert.equal(r[0].item.bloc, 'X');
  assert.deepEqual(Ariane.fusionnerRailReel([], []), []);
  assert.deepEqual(Ariane.couperParIntervallesInverses(0, 10, [[2, 4], [6, 12]]), [[0, 2], [4, 6]]);
});
