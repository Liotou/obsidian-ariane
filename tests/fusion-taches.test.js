// Fusionner deux tâches : la gardée reçoit les créneaux, séances, temps et
// liens de l'absorbée, qui part ensuite à la corbeille.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const obsidian = require('obsidian');

test('fusionCreneaux : créneaux réunis et triés, événements Agenda alignés, doublon renvoyé à la suppression', () => {
  const p = Ariane.fusionCreneaux(
    { creneaux: ['2026-11-04 15:00-16:00', '2026-11-02 10:45-12:00'], agendaIds: ['E2', 'E4'],
      coms: { '11-02T10:45': 'Plan' }, tempsReel: ['a'] },
    { creneaux: ['2026-11-03 09:00-10:00', '2026-11-04 15:00-16:00'], agendaIds: ['E3', 'X4', 'VIEUX'],
      coms: { '11-02T10:45': 'Relu', '11-03T09:00': 'Lecture' }, tempsReel: ['a', 'b'] });
  assert.deepEqual(p.creneaux, ['2026-11-02 10:45-12:00', '2026-11-03 09:00-10:00', '2026-11-04 15:00-16:00']);
  // Les ids suivent l'ordre trié des créneaux de chaque côté (E4 → 02 nov., E2 → 04 nov.) ;
  // VIEUX (en trop) et X4 (créneau déjà chez la gardée) seront supprimés.
  assert.deepEqual(p.agendaIds, ['E2', 'E3', 'E4', 'VIEUX', 'X4']);
  assert.deepEqual(p.coms, { '11-02T10:45': 'Plan\nRelu', '11-03T09:00': 'Lecture' });
  assert.deepEqual(p.tempsReel, ['a', 'b']);
  // Un événement partagé (doublon venu du même événement) n'est jamais supprimé.
  const q = Ariane.fusionCreneaux({ creneaux: ['2026-11-04 15:00-16:00'], agendaIds: ['E'] },
    { creneaux: ['2026-11-04 15:00-16:00'], agendaIds: ['E'] });
  assert.deepEqual(q.agendaIds, ['E']);
  // Rien d'Agenda des deux côtés : pas de liste de vides.
  assert.deepEqual(Ariane.fusionCreneaux({ creneaux: ['2026-11-04 15:00-16:00'] }, { creneaux: ['2026-11-05 15:00-16:00'] }).agendaIds, []);
});

const fichier = (path) => Object.assign(new obsidian.TFile(), { path, basename: path.split('/').pop().replace(/\.md$/, '') });

function greffon() {
  const g = Object.create(Ariane.prototype);
  const fG = fichier('08 - Tâches/T066.md');
  const fA = fichier('08 - Tâches/T067.md');
  const fm = {
    'T066.md': { aliases: ['Plan'], creneaux: ['2026-11-02 10:45-12:00'], 'agenda-id': ['E1'], 'rappel-id': 'R1', 'bloque-par': [] },
    'T067.md': { aliases: ['Plan (doublon)'], creneaux: ['2026-11-04 15:00-16:00'], 'agenda-id': ['E2'], 'rappel-id': 'R1',
      echeance: '2026-11-06', parent: '[[T045]]', 'bloque-par': ['[[T010]]'] },
  };
  const journal = [];
  Object.assign(g, {
    settings: { tempsTotalSecondes: {} },
    app: {
      metadataCache: { getFileCache: (f) => ({ frontmatter: fm[f.basename + '.md'] }), resolvedLinks: {} },
      vault: { read: async () => '' },
    },
    fichierDeRef: (r) => ({ T066: fG, T067: fA }[r]),
    _lireT: (x, c) => x[c],
    marquerEcriture() {},
    lireNoteTache: async (r) => (r === 'T067' ? 'Idées du doublon' : 'Ma note'),
    ecrireNoteTache: async (r, t) => journal.push(['note', r, t]),
    majTache: async (r, c) => { journal.push(['maj', r, c]); if (r === 'T066' && c.creneaux) fm['T066.md'].creneaux = c.creneaux; },
    majBlocCreneaux: async (f, o) => journal.push(['bloc', f.basename, o]),
    tachesPourGantt: () => [
      { ref: 'T066' }, { ref: 'T067' },
      { ref: 'T070', parent: '[[T067]]', bloquePar: [] },
      { ref: 'T071', parent: '', bloquePar: ['[[T067]]', '[[T066]]'] },
    ],
    rattacher: async (e, p) => journal.push(['rattacher', e, p]),
    _lienFermeCycle: () => false,
    _transfererTemps: async (a, f) => journal.push(['temps', a, f.basename]),
    _reciblerLiens: async (a, b) => journal.push(['liens', a, b]),
    supprimerTache: async (r) => journal.push(['corbeille', r]),
  });
  return { g, journal };
}

test('fusionnerTaches : la gardée reçoit, l\'absorbée part en dernier, le rappel partagé est épargné', async () => {
  const { g, journal } = greffon();
  assert.equal(await g.fusionnerTaches('T066', 'T067'), true);
  const maj = journal.find((x) => x[0] === 'maj' && x[1] === 'T066')[2];
  assert.deepEqual(maj.creneaux, ['2026-11-02 10:45-12:00', '2026-11-04 15:00-16:00']);
  assert.deepEqual(maj['agenda-id'], ['E1', 'E2']);
  assert.equal(maj.echeance, '2026-11-06', 'la date qui manquait à la gardée');
  assert.equal(maj.parent, '[[T045]]');
  assert.deepEqual(maj['bloque-par'], ['[[T010]]']);
  assert.equal(maj['rappel-id'], undefined, 'la gardée garde son rappel');
  assert.ok(g._rappelsEpargnes.has('R1'), 'le rappel partagé ne sera pas retiré d\'Apple Rappels');
  const note = journal.find((x) => x[0] === 'note');
  assert.match(note[2], /^Ma note\n\n---\n\n\*Repris de T067 \(Plan \(doublon\)\)/);
  assert.match(note[2], /Idées du doublon$/);
  assert.ok(journal.some((x) => x[0] === 'rattacher' && x[1] === 'T070' && x[2] === 'T066'));
  const t071 = journal.find((x) => x[0] === 'maj' && x[1] === 'T071');
  assert.deepEqual(t071[2]['bloque-par'], ['[[T066]]'], 'bloquée par l\'absorbée : par la gardée, sans doublon');
  assert.ok(journal.some((x) => x[0] === 'temps' && x[1] === '08 - Tâches/T067.md' && x[2] === 'T066'));
  assert.ok(journal.some((x) => x[0] === 'liens' && x[1] === 'T067' && x[2] === 'T066'));
  assert.deepEqual(journal[journal.length - 1], ['corbeille', 'T067']);
  // Une tâche ne fusionne pas avec elle-même.
  assert.equal(await g.fusionnerTaches('T066', 'T066'), false);
});

test('fusionnerTaches : le rappel de l\'absorbée passe à la gardée qui n\'en a pas', async () => {
  const { g, journal } = greffon();
  g.app.metadataCache.getFileCache = ((orig) => (f) => {
    const c = orig(f);
    if (f.basename === 'T066') delete c.frontmatter['rappel-id'];
    return c;
  })(g.app.metadataCache.getFileCache);
  await g.fusionnerTaches('T066', 'T067');
  const maj = journal.find((x) => x[0] === 'maj' && x[1] === 'T066')[2];
  assert.equal(maj['rappel-id'], 'R1');
  assert.ok(g._rappelsEpargnes.has('R1'));
});

test('Transfert du temps : total, relevés par jour et sessions passent à la gardée', async () => {
  const g = Object.create(Ariane.prototype);
  const fG = fichier('T/T066.md');
  const jours = { '2026-11-03': { temps: { 'T/T067.md': 600, 'T/T066.md': 60 }, sessions: [{ chemin: 'T/T067.md', debut: '2026-11-03T10:00' }] } };
  const sales = [];
  let ecrit = null;
  Object.assign(g, {
    settings: { tempsTotalSecondes: { 'T/T067.md': 1200 }, tempsHistorique: { '2026-11-04': { 'T/T067.md': 120 } } },
    _tempsSecondes: new Map([['T/T067.md', 30]]),
    tempsTotalDe: (c) => (c === 'T/T066.md' ? 5 : 0),
    marquerEcriture() {},
    marquerJourSale: (j) => sales.push(j),
    joursAvecDonnees: async () => Object.keys(jours),
    donneesJour: async (j) => jours[j],
    saveSettings: async () => {},
    app: { fileManager: { processFrontMatter: async (f, fn) => { const x = {}; fn(x); ecrit = x; } } },
  });
  await g._transfererTemps('T/T067.md', fG);
  assert.equal(g.settings.tempsTotalSecondes['T/T066.md'], 1500);
  assert.equal(g.settings.tempsTotalSecondes['T/T067.md'], undefined);
  assert.deepEqual(ecrit, { 'temps-passe': 25 });
  assert.equal(g._tempsSecondes.get('T/T066.md'), 30);
  assert.deepEqual(g.settings.tempsHistorique['2026-11-04'], { 'T/T066.md': 120 });
  assert.deepEqual(jours['2026-11-03'].temps, { 'T/T066.md': 660 });
  assert.equal(jours['2026-11-03'].sessions[0].chemin, 'T/T066.md');
  assert.deepEqual(sales.sort(), ['2026-11-03', '2026-11-04']);
});

test('Fenêtre de fusion : la plus ancienne gardée par défaut, l\'apport dit en clair', () => {
  const { ModaleFusionTaches } = Ariane._test;
  assert.equal(ModaleFusionTaches.plusAncienne([{ ref: 'T067', cree: '2026-11-02' }, { ref: 'T066', cree: '2026-11-02' }]), 'T066');
  assert.equal(ModaleFusionTaches.plusAncienne([{ ref: 'T010', cree: '2026-11-03' }, { ref: 'T090', cree: '2026-10-01' }]), 'T090');
  assert.deepEqual(ModaleFusionTaches.apport({ creneaux: 2, commentaires: 1, tempsMin: 90, horsObsidian: 0, enfants: 1, note: true }),
    ['2 créneaux', '1 commentaire de séance', '1 h 30 de temps passé', '1 sous-tâche', 'sa note de travail']);
});
