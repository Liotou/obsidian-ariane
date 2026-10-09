// Temps d'écran de l'iPhone : fichiers SEGB (App.InFocus), plages, segments.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const MAC2001 = 978307200;
const enMac = (iso) => Date.parse(iso) / 1000 - MAC2001;

// Un message protobuf comme ceux d'App.InFocus : champ 3 (ouverture), 4
// (date en secondes depuis 2001), 6 (application).
function message(bundle, iso, ouvre) {
  const nom = Buffer.from(bundle, 'utf8');
  const date = Buffer.alloc(8);
  date.writeDoubleLE(enMac(iso));
  return Buffer.concat([
    Buffer.from([0x10, 0x01]),
    ouvre ? Buffer.from([0x18, 0x01]) : Buffer.alloc(0),
    Buffer.from([0x21]), date,
    Buffer.from([0x32, nom.length]), nom,
  ]);
}

// Un fichier SEGB : en-tête de 32 octets, enregistrements alignés sur 8
// (8 octets d'en-tête chacun), table de 16 octets par enregistrement à la
// fin, lue à rebours. `etats` : 1 valide, autre chose effacé.
function fichierSEGB(messages, etats) {
  const corps = [];
  const fins = [];
  let pos = 0;
  messages.forEach((m) => {
    const debut = Math.ceil(pos / 8) * 8;
    if (debut > pos) corps.push(Buffer.alloc(debut - pos));
    const tete = Buffer.alloc(8);
    tete.writeUInt32LE(0x12345678, 0);
    tete.writeUInt32LE(10, 4);
    corps.push(tete, m);
    pos = debut + 8 + m.length;
    fins.push(pos);
  });
  const donnees = Buffer.concat(corps);
  const table = Buffer.alloc(16 * messages.length);
  fins.forEach((f, i) => {
    const o = table.length - 16 * (i + 1);
    table.writeUInt32LE(f, o);
    table.writeUInt32LE(etats ? etats[i] : 1, o + 4);
  });
  const tete = Buffer.alloc(32);
  tete.write('SEGB', 0, 'ascii');
  tete.writeUInt32LE(messages.length, 4);
  return Buffer.concat([tete, donnees, Buffer.alloc(64), table]);
}

test('SEGB : les passages au premier plan, dans l\'ordre, sans les effacés', () => {
  const f = fichierSEGB([
    message('net.whatsapp.WhatsApp', '2026-10-08T14:55:07Z', true),
    message('net.whatsapp.WhatsApp', '2026-10-08T15:01:37Z', false),
    message('com.google.Maps', '2026-10-08T15:19:37Z', true),
    message('com.google.Maps', '2026-10-08T15:19:50Z', false),
  ], [1, 1, 3, 1]);
  const ev = Ariane.evenementsInFocus(f);
  assert.deepEqual(ev.map((e) => [e.bundle, new Date(e.t).toISOString().slice(11, 19), e.ouvre]), [
    ['net.whatsapp.WhatsApp', '14:55:07', true],
    ['net.whatsapp.WhatsApp', '15:01:37', false],
    ['com.google.Maps', '15:19:50', false],
  ]);
  assert.equal(Ariane.evenementsInFocus(Buffer.from('pas un fichier')), null);
});

test('iPhone : plages d\'applications, système écarté, durée bornée', () => {
  const t = (hm) => Date.parse('2026-10-08T' + hm + ':00Z');
  const ev = [
    { t: t('10:00'), bundle: 'com.apple.mobilemail', ouvre: true },
    { t: t('10:05'), bundle: 'com.apple.springboard.home-screen-open-folder', ouvre: true },
    { t: t('10:06'), bundle: 'net.whatsapp.WhatsApp', ouvre: true },
    { t: t('10:09'), bundle: 'net.whatsapp.WhatsApp', ouvre: false },
    { t: t('11:00'), bundle: 'com.google.ios.youtube', ouvre: true },
  ];
  const p = Ariane.plagesIphone(ev, { maxMin: 30 });
  assert.deepEqual(p.map((x) => [x.bundle, (x.fin - x.deb) / 60000]), [
    ['com.apple.mobilemail', 5], ['net.whatsapp.WhatsApp', 3], ['com.google.ios.youtube', 30],
  ]);
  assert.equal(Ariane.nomAppIphone('com.apple.mobilemail'), 'Mail');
  assert.equal(Ariane.nomAppIphone('lt.manodrabuziai.fr'), 'Vinted');
  assert.equal(Ariane.nomAppIphone('com.exemple.ios.SuperNotes'), 'Super Notes');
});

test('iPhone : le Mac d\'abord, le reste en segments, le recouvrement en interruptions', () => {
  const m = (h) => Date.parse('2026-10-08T' + h + ':00Z');
  const plages = [{ bundle: 'net.whatsapp.WhatsApp', deb: m('10:00'), fin: m('10:10') }];
  const mac = [{ deb: m('10:04'), fin: m('10:30'), app: 'Word' }];
  const r = Ariane.segmentsIphone(plages, mac, m('00:00'), m('23:59'));
  assert.deepEqual(r.segs.map((s) => [s.app, (s.fin - s.deb) / 60000, s.appareil]), [['WhatsApp (iPhone)', 4, 'iphone']]);
  assert.deepEqual(r.interruptions.map((x) => [x.app, (x.fin - x.deb) / 60000]), [['WhatsApp', 6]]);
  assert.deepEqual(Ariane.interruptionsDuBloc(r.interruptions, m('10:00'), m('10:30')), [{ app: 'WhatsApp', min: 6 }]);
});

test('iPhone : la part du téléphone dans un créneau agrégé', () => {
  const m = (h) => Date.parse('2026-10-08T' + h + ':00Z');
  const regles = Ariane.compilerReglesActivite('Distraction #999999 = whatsapp');
  const segs = [{ deb: m('10:00'), fin: m('10:12'), app: 'WhatsApp (iPhone)', titre: '', url: '', appareil: 'iphone' }];
  const b = Ariane.agregerActivite(segs, regles, { d0: m('00:00'), d1: m('23:59'), grainMin: 5, dureeMin: 1 });
  assert.equal(b.length, 1);
  assert.equal(b[0].categorie, 'Distraction');
  assert.equal(b[0].iphoneMin, 12);
});
