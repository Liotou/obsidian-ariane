// Micro-interruptions et concentration : fonctions pures.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const s = (h) => Date.parse('2026-10-08T' + h + 'Z');

test('distractions : clé d\'un segment, liste et sous-domaines', () => {
  assert.equal(Ariane.cleDistraction({ url: 'https://www.reddit.com/r/x', app: 'Safari' }), 'reddit.com');
  assert.equal(Ariane.cleDistraction({ app: 'WhatsApp (iPhone)' }), 'whatsapp');
  const l = Ariane.compilerListeDistractions('reddit.com\n# commentaire\nhttps://www.youtube.com/\nWhatsApp');
  assert.ok(l('old.reddit.com'));
  assert.ok(l('youtube.com'));
  assert.ok(l('whatsapp'));
  assert.ok(!l('notreddit.com'), 'un autre domaine qui finit pareil n\'en est pas un sous-domaine');
  assert.ok(Ariane.estCategorieDistraction('Personnel et distraction'));
  assert.ok(!Ariane.estCategorieDistraction('Rédaction'));
});

test('micro-interruptions : dès dix secondes, morceaux rejoints, téléphone pendant le Mac', () => {
  const distrait = (seg) => /reddit|whatsapp/i.test((seg.url || '') + (seg.app || ''));
  const segs = [
    { deb: s('10:00:00'), fin: s('10:20:00'), app: 'Word', titre: '', url: '' },
    { deb: s('10:05:00'), fin: s('10:05:25'), app: 'Safari', titre: '', url: 'https://reddit.com/a' },
    { deb: s('10:05:35'), fin: s('10:05:50'), app: 'Safari', titre: '', url: 'https://reddit.com/b' },
    { deb: s('10:09:00'), fin: s('10:09:05'), app: 'Safari', titre: '', url: 'https://reddit.com/c' },
    { deb: s('11:00:00'), fin: s('11:02:00'), app: 'WhatsApp (iPhone)', titre: '', url: '', appareil: 'iphone' },
  ];
  const inter = [{ deb: s('10:12:00'), fin: s('10:12:40'), app: 'Mail' }];
  const m = Ariane.microDistractions(segs, inter, distrait, { seuilSec: 10, fusionSec: 20 });
  assert.deepEqual(m.map((x) => [x.quoi, x.source, x.genre, (x.fin - x.deb) / 1000]), [
    ['reddit.com', 'mac', 'web', 50], ['Mail', 'iphone', 'iphone', 40], ['WhatsApp', 'iphone', 'iphone', 120],
  ]);
  assert.deepEqual(Ariane.principalesDistractions(m, 2).map((x) => [x.quoi, x.n]), [['WhatsApp', 1], ['reddit.com', 1]]);
});

test('concentration : le travail coupé à chaque interruption, le personnel ôté', () => {
  const rail = [
    { a: 540, b: 600, genre: 'obsidian' }, { a: 602, b: 660, genre: 'externe' }, { a: 700, b: 720, genre: 'personnel' },
  ];
  // Une interruption à 10 h 30 coupe 9 h-11 h en deux plages d'une heure et
  // demie et d'une demi-heure.
  const p = Ariane.plagesConcentration(rail, [{ a: 630, b: 631 }]);
  assert.equal(p.n, 2);
  assert.equal(p.longue, 90);
  assert.equal(Math.round(p.moyenne), 60);
  const c = Ariane.syntheseConcentration([{ rail, obsidian: 60, externe: 58,
    micro: [{ a: 630, b: 631, quoi: 'reddit.com', source: 'mac', deb: 0, fin: 60000 }] }]);
  assert.equal(c.n, 1);
  assert.equal(c.longue, 90);
  assert.ok(Math.abs(c.parHeure - 1 / (118 / 60)) < 1e-9);
});

test('distractions : la consigne pour l\'IA', () => {
  const p = Ariane.promptDistractions(['reddit.com', 'zotero'], 'doctorant');
  assert.match(p, /- reddit\.com\n- zotero$/);
  assert.match(p, /Contexte : doctorant/);
  assert.match(p, /\{"cle": true ou false/);
});

test('créneaux : une distraction courte n\'a pas de créneau à elle', () => {
  const m = (h) => Date.parse('2026-10-08T' + h + ':00Z');
  const regles = Ariane.compilerReglesActivite('Personnel et distraction #999999 = reddit\nRédaction #333333 = Word');
  const segs = [
    { deb: m('10:00'), fin: m('10:03'), app: 'Safari', titre: '', url: 'https://reddit.com' },
    { deb: m('11:00'), fin: m('11:15'), app: 'Word', titre: '', url: '' },
  ];
  const b = Ariane.agregerActivite(segs, regles, { d0: m('00:00'), d1: m('23:59'), grainMin: 5, dureeMin: 10 });
  assert.deepEqual(b.map((x) => x.categorie), ['Rédaction'], 'trois minutes de distraction : un trou, pas une pastille');
});

test('micro-interruptions : seulement pendant le travail, et leur libellé', () => {
  const rail = [{ a: 540, b: 600, genre: 'obsidian' }, { a: 600, b: 640, genre: 'personnel' }, { a: 700, b: 760, genre: 'externe' }];
  const micro = [{ a: 550, b: 551 }, { a: 610, b: 611 }, { a: 680, b: 681 }, { a: 759.5, b: 760.2 }];
  assert.deepEqual(Ariane.microPendantTravail(micro, rail).map((m) => m.a), [550, 759.5],
    'ni dans un créneau personnel, ni hors de tout travail');
  const d = new Date(2026, 9, 8, 10, 42, 0).getTime();
  assert.equal(Ariane.libelleMicro({ deb: d, fin: d + 40000, quoi: 'reddit.com', source: 'mac' }), '10:42 reddit.com, 40 s');
  assert.equal(Ariane.libelleMicro({ deb: d, fin: d + 180000, quoi: 'WhatsApp', source: 'iphone', aussi: ['Messages'] }), '10:42 WhatsApp et Messages, 3 min');
  assert.equal(Ariane.iconeMicro({ source: 'iphone' }), 'smartphone');
  assert.equal(Ariane.iconeMicro({ source: 'mac', genre: 'web' }), 'globe');
  assert.equal(Ariane.iconeMicro({ source: 'mac', genre: 'app' }), 'monitor');
});

test('micro-interruptions : une même chose reprise de près, même entrecoupée, ne compte qu\'une fois', () => {
  const t = (h) => Date.parse('2026-10-08T' + h + 'Z');
  const segs = [
    { deb: t('19:49:00'), fin: t('19:49:16'), app: 'WhatsApp (iPhone)', appareil: 'iphone' },
    { deb: t('19:49:30'), fin: t('19:49:53'), app: 'Messages', titre: '', url: '' },
    { deb: t('19:50:00'), fin: t('19:54:00'), app: 'WhatsApp (iPhone)', appareil: 'iphone' },
    { deb: t('19:54:10'), fin: t('20:00:00'), app: 'WhatsApp (iPhone)', appareil: 'iphone' },
  ];
  const m = Ariane.microDistractions(segs, [], () => true);
  assert.deepEqual(m.map((x) => [x.quoi, x.genre, x.aussi, (x.fin - x.deb) / 1000]), [
    ['WhatsApp', 'iphone', ['Messages'], 660],
  ], 'WhatsApp de 19 h 49 à 20 h, Messages glissé au milieu');
});

test('rail : sessions réunies en plages continues, tâche dominante', () => {
  const x = (chemin, a, b) => ({ chemin, debut: '2026-10-08T' + a, fin: '2026-10-08T' + b });
  const T53 = { ref: 'T053' };
  // Jeudi 8, de 12 h 30 à 12 h 56 : la note préparatoire et T053 en alternance.
  const obs = [
    { a: 750, b: 753, t: null, x: x('NP.md', '12:30', '12:33') },
    { a: 753, b: 754, t: T53, x: x('T053.md', '12:33', '12:34') },
    { a: 754, b: 755, t: null, x: x('NP.md', '12:34', '12:35') },
    { a: 756, b: 758, t: null, x: x('NP.md', '12:36', '12:38') },
    { a: 758, b: 761, t: T53, x: x('T053.md', '12:38', '12:41') },
    { a: 763, b: 776, t: null, x: x('NP.md', '12:43', '12:56') },
    { a: 790, b: 795, t: T53, x: x('T053.md', '13:10', '13:15') },
  ];
  const r = Ariane.reunirSessionsRail(obs, 3);
  assert.deepEqual(r.map((p) => [p.a, p.b, p.t ? p.t.ref : '', p.notes.length]), [[750, 776, '', 2], [790, 795, 'T053', 1]]);
  assert.equal(r[0].x.chemin, 'NP.md', 'la note la plus travaillée');
  assert.equal(r[0].minutes, 23);
  assert.deepEqual(r[0].taches.map((y) => [y.t ? y.t.ref : '', y.min]), [['', 19], ['T053', 4]]);
  assert.equal(r[0].x.fin, '2026-10-08T12:56');
});

test('règles d\'Ariane : Obsidian hors note, organisation ; draw.io, travail sur les notes', () => {
  const regles = Ariane.reglesIntegrees([{ nom: 'Organisation', couleur: '#7c5cbf' }]).concat(Ariane.compilerReglesActivite('Notes #111111 = app:Obsidian'));
  const cat = (app, titre) => Ariane.classerActivite({ app, titre, url: '' }, regles).categorie;
  assert.equal(cat('Obsidian', 'Tâches - Obsidian Vault - Obsidian 1.14.4'), 'Organisation');
  assert.equal(cat('Obsidian', 'FS001 - Rivière.drawio.svg - Obsidian Vault - Obsidian 1.14.4'), 'Travail sur les notes');
  assert.equal(Ariane.classerActivite({ app: 'draw.io', titre: 'x.drawio', url: '' }, regles), undefined, 'draw.io hors d\'Obsidian : vos règles décident');
});
