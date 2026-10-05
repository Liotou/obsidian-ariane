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
  assert.equal(t, 'Lecture · 09:00–10:15\nActif : 1 h 10\n• Zotero · A (40 min)');
});

test('couleurActivite : stable et prise dans la palette', () => {
  assert.equal(Ariane.couleurActivite('Lecture'), Ariane.couleurActivite('Lecture'));
  assert.match(Ariane.couleurActivite('Lecture'), /^#[0-9a-f]{6}$/);
});
