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
  assert.deepEqual(m.map((x) => [x.quoi, x.source, (x.fin - x.deb) / 1000]), [
    ['reddit.com', 'mac', 50], ['Mail', 'iphone', 40], ['WhatsApp', 'iphone', 120],
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

test('créneaux : un seuil plus fin pour les distractions', () => {
  const m = (h) => Date.parse('2026-10-08T' + h + ':00Z');
  const regles = Ariane.compilerReglesActivite('Personnel et distraction #999999 = reddit\nRédaction #333333 = Word');
  const segs = [
    { deb: m('10:00'), fin: m('10:03'), app: 'Safari', titre: '', url: 'https://reddit.com' },
    { deb: m('11:00'), fin: m('11:03'), app: 'Word', titre: '', url: '' },
  ];
  const b = Ariane.agregerActivite(segs, regles, { d0: m('00:00'), d1: m('23:59'), grainMin: 5, dureeMin: 10, dureeDistractionSec: 30 });
  assert.deepEqual(b.map((x) => x.categorie), ['Personnel et distraction'], 'la distraction de trois minutes reste, pas le travail');
});
