const test = require('node:test');
const assert = require('node:assert');
const { poserAnnulation, annulerDernier, refaireDernier } = require('./obsidian-factice.js')._test;
const Ariane = require('./obsidian-factice.js');

// Zones thématiques de la vue articulation : statiques pures (règle
// d'adhésion) + motif des paires d'annulation, avec un faux moteur calqué
// sur _creerZone / glisserNoeud (cf. tests/annulation.test.js).

const zone = (id, nom, x, y, w, h) => ({ id, nom, x, y, w, h });

test('thematiqueDe : la dernière zone contenant le point gagne', () => {
  const zs = [zone('a', 'Alpha', 0, 0, 100, 100), zone('b', 'Bêta', 50, 0, 100, 100)];
  assert.equal(Ariane.thematiqueDe(zs, 10, 10), 'Alpha');
  assert.equal(Ariane.thematiqueDe(zs, 60, 10), 'Bêta');
  assert.equal(Ariane.thematiqueDe(zs, 200, 200), '');
});

test('thematiqueDe : bord inclus, zones mal formées ignorées', () => {
  const zs = [zone('a', 'Alpha', 0, 0, 100, 100), null, { id: 'x', nom: 'X' }];
  assert.equal(Ariane.thematiqueDe(zs, 0, 0), 'Alpha');   // bord inclus
  assert.equal(Ariane.thematiqueDe(zs, 100, 100), 'Alpha');
  assert.equal(Ariane.thematiqueDe([null], 5, 5), '');
  assert.equal(Ariane.thematiqueDe(null, 5, 5), '');
});

test('changementsThematique : ne propose que ce qui change', () => {
  const zs = [zone('a', 'Alpha', 0, 0, 100, 100)];
  const cartes = [
    { ref: 'T1', x: 50, y: 50, thematique: '' },        // → Alpha
    { ref: 'T2', x: 50, y: 50, thematique: 'Alpha' },   // inchangé
    { ref: 'T3', x: 500, y: 500, thematique: 'Alpha' }, // → ''
    { ref: 'T4', x: 500, y: 500, thematique: '' },      // inchangé
  ];
  assert.deepEqual(Ariane.changementsThematique(zs, cartes), [
    { ref: 'T1', thematique: 'Alpha' },
    { ref: 'T3', thematique: '' },
  ]);
  assert.deepEqual(Ariane.changementsThematique(zs, null), []);
});

test('le concept thematique est déclaré côté tâches et propriétés', () => {
  assert.ok(Ariane.CONCEPTS_TACHE.includes('thematique'));
  assert.ok(Ariane.PROPS_GENERIQUES.some((p) => p.cle === 'thematique'));
});

// Faux moteur : reproduit le flux de _creerZone — zones dans un plan,
// écriture des thématiques par paires { annule, retablit }.
function fauxMoteur() {
  const m = {
    plan: { zones: [] },
    cartes: new Set(),      // refs posées (équivaut à this._pos)
    thematiques: new Map(), // ref → valeur
    notes: [],              // écritures reçues
    greffon: {
      async majTache(ref, champs) {
        m.notes.push({ ref, ...champs });
        m.thematiques.set(ref, champs.thematique || '');
      },
    },
    ecrirePlan() {},
    zones() { return m.plan.zones || []; },
    centre(ref) { return m.centres.get(ref); },
    _recalcul(refs) {
      const liste = [...(refs || m.cartes)];
      return Ariane.changementsThematique(
        m.zones(), liste.map((r) => {
          const c = m.centre(r);
          return { ref: r, x: c.x, y: c.y, thematique: m.thematiques.get(r) || '' };
        }));
    },
    async _ecrire(chs) {
      for (const ch of chs) await m.greffon.majTache(ch.ref, { thematique: ch.thematique });
    },
    dessiner() { m.dessins++; },
    dessins: 0,
    centres: new Map(),
  };
  return m;
}

test('créer puis annuler une zone : plan et thématiques reviennent', async () => {
  const m = fauxMoteur();
  m.centres.set('T1', { x: 50, y: 50 });
  m.centres.set('T2', { x: 500, y: 500 });
  m.cartes.add('T1');
  m.cartes.add('T2');

  // — le geste : créer la zone « Alpha » (motif de _creerZone) —
  const themes0 = [...m.cartes].map((r) => [r, m.thematiques.get(r) || '']);
  const zones0 = JSON.parse(JSON.stringify(m.plan.zones));
  m.plan.zones.push(zone('z1', 'Alpha', 0, 0, 100, 100));
  const zones1 = JSON.parse(JSON.stringify(m.plan.zones));
  poserAnnulation(m, async () => {
    m.plan.zones = zones0.map((x) => ({ ...x }));
    await m._ecrire(themes0.map(([ref, thematique]) => ({ ref, thematique })));
    m.dessiner();
  }, async () => {
    m.plan.zones = zones1.map((x) => ({ ...x }));
    await m._ecrire(m._recalcul());
    m.dessiner();
  });
  await m._ecrire(m._recalcul());
  assert.deepEqual(m.thematiques.get('T1'), 'Alpha');
  // T2 est hors zone et n'a rien à changer : aucune écriture pour lui.
  assert.equal(m.notes.length, 1);
  assert.equal(m.notes[0].ref, 'T1');

  // — l'annulation : zone retirée, thématiques d'avant restaurées —
  await annulerDernier(m);
  assert.equal(m.plan.zones.length, 0);
  assert.equal(m.thematiques.get('T1'), '');

  // — le rétablissement rejoue la création —
  await refaireDernier(m);
  assert.equal(m.plan.zones.length, 1);
  assert.equal(m.thematiques.get('T1'), 'Alpha');
  assert.equal(m.dessins, 2);
});

test('glisser une carte hors de sa zone : l annulation remet les deux', async () => {
  const m = fauxMoteur();
  m.plan.zones.push(zone('z1', 'Alpha', 0, 0, 100, 100));
  m.centres.set('T1', { x: 50, y: 50 });
  m.cartes.add('T1');
  await m._ecrire(m._recalcul());
  assert.equal(m.thematiques.get('T1'), 'Alpha');

  // — le glissé : T1 quitte la zone (motif de glisserNoeud) —
  const refs = ['T1'];
  const themes0 = refs.map((r) => [r, m.thematiques.get(r) || '']);
  m.centres.set('T1', { x: 500, y: 500 });
  const chgTheme = m._recalcul(refs);
  assert.deepEqual(chgTheme, [{ ref: 'T1', thematique: '' }]);
  poserAnnulation(m, async () => {
    m.centres.set('T1', { x: 50, y: 50 });
    await m._ecrire(themes0.map(([ref, thematique]) => ({ ref, thematique })));
    m.dessiner();
  }, async () => {
    m.centres.set('T1', { x: 500, y: 500 });
    await m._ecrire(m._recalcul(refs));
    m.dessiner();
  });
  await m._ecrire(chgTheme);
  assert.equal(m.thematiques.get('T1'), '');

  // — annuler remet carte ET thématique —
  await annulerDernier(m);
  assert.deepEqual(m.centres.get('T1'), { x: 50, y: 50 });
  assert.equal(m.thematiques.get('T1'), 'Alpha');
});
