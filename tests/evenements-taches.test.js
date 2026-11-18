// Notes d'événement : identité (une série partage l'identifiant), liens natifs
// avec les tâches, et actualisation prudente depuis l'agenda.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const ev = (id, debut, titre, o) => Object.assign({ id, debut, fin: debut, titre, calendrier: 'Calendrier', allDay: debut.length === 10 }, o || {});
const J = (n) => Ariane.decalerJour(new Date().toISOString().slice(0, 10), n);

test('identité : l’id iCal perd son instant, celui d’Apple ne change pas', () => {
  assert.equal(Ariane.idStableEvenement('ics:u@g|2026-11-20T10:00'), 'ics:u@g');
  assert.equal(Ariane.idStableEvenement('ABC:DEF'), 'ABC:DEF');
  assert.equal(Ariane.nomNoteEvenement(ev('A', '2026-11-20T09:00', 'x')), 'EV-20261120-0900');
  assert.equal(Ariane.nomNoteEvenement(ev('A', '2026-11-21', 'x')), 'EV-20261121');
});

test('appariement : instant, puis jour, puis événement unique déplacé ; jamais une autre séance', () => {
  const serie = [ev('S', '2026-11-13T09:00', 'C'), ev('S', '2026-11-27T09:00', 'C')];
  const unique = ev('U', '2026-12-01T10:00', 'P');
  const heure = ev('H', '2026-11-20T15:00', 'R');
  const notes = [{ cle: 's13', id: 'S', quand: '2026-11-13T09:00' }, { cle: 's20', id: 'S', quand: '2026-11-20T09:00' },
    { cle: 'u', id: 'U', quand: '2026-11-25T10:00' }, { cle: 'h', id: 'H', quand: '2026-11-20T10:00' }];
  const { paires, restants } = Ariane.apparierNotesEvenements(notes, serie.concat([unique, heure]));
  assert.equal(paires.get('s13'), serie[0]);
  assert.equal(paires.has('s20'), false, 'la séance disparue ne prend pas celle du 27');
  assert.equal(paires.get('u'), unique);
  assert.equal(paires.get('h'), heure);
  assert.deepEqual(restants, [serie[1]]);
});

test('écart : rien si la note est à jour ; une valeur vidée retire la clé ; le retour efface « supprimé »', () => {
  const e = ev('ics:u|2026-11-20T10:00', '2026-11-20T10:00', 'Réunion', { fin: '2026-11-20T11:00', lieu: 'Paris', participants: ['A'] });
  const fm = Ariane.champsNoteEvenement(e);
  assert.equal(fm['Événement ID'], 'ics:u');
  assert.deepEqual(Ariane.ecartNoteEvenement(fm, e), { poser: {}, retirer: [] });
  const e2 = Object.assign({}, e, { lieu: '', fin: '2026-11-20T12:00' });
  assert.deepEqual(Ariane.ecartNoteEvenement(Object.assign({}, fm, { 'Statut agenda': 'x' }), e2),
    { poser: { Fin: '2026-11-20T12:00' }, retirer: ['Lieu', 'Statut agenda'] });
});

test('corps : le texte de l’utilisateur reste, seuls les blocs et un titre inchangé suivent', () => {
  const avant = '---\nType: evenement\n---\n# Réunion\n\nMes notes.\n';
  const e = ev('A', '2026-11-20T10:00', 'Réunion WP1', { notes: 'Ordre du jour' });
  const c = Ariane.corpsNoteEvenement(avant, e, 'Réunion', [{ nom: 'a.pdf', taille: 2048 }]);
  assert.ok(c.includes('# Réunion WP1'));
  assert.ok(c.includes('Ordre du jour') && c.includes('a.pdf (PDF, 2 Ko)') && c.endsWith('Mes notes.\n'));
  assert.equal(Ariane.corpsNoteEvenement(c, e, 'Réunion WP1', [{ nom: 'a.pdf', taille: 2048 }]), c, 'stable : pas d’écriture');
  const perso = Ariane.corpsNoteEvenement('# Mon titre\n', e, 'Réunion', []);
  assert.ok(perso.startsWith('# Mon titre'), 'un titre changé à la main est respecté');
  const sans = Ariane.corpsNoteEvenement(c, Object.assign({}, e, { notes: '' }), 'Réunion WP1', []);
  assert.ok(!sans.includes('ariane:description') && !sans.includes('ariane:pieces') && sans.includes('Mes notes.'));
});

test('horizon et échéance : de l’origine à un an ; le dernier événement préparé décide', () => {
  assert.equal(Ariane.evenementDansHorizon(ev('A', '2027-11-18', 'x'), '2025-06-13', '2026-11-18'), true);
  assert.equal(Ariane.evenementDansHorizon(ev('A', '2027-11-19', 'x'), '2025-06-13', '2026-11-18'), false);
  assert.equal(Ariane.evenementDansHorizon(ev('A', '2025-06-12', 'x'), '2025-06-13', '2026-11-18'), false);
  assert.deepEqual(Ariane.echeanceDesQuands(['2026-11-20T10:00', '2026-12-02T14:30', '2026-11-25']), { echeance: '2026-12-02', heure: '14:30' });
  assert.equal(Ariane.echeanceDesQuands([]), null);
  const ici = new Date(2026, 10, 18, 12, 0);
  assert.equal(Ariane.evenementPasse(ev('A', '2026-11-18T12:00', 'x'), ici), true);
  assert.equal(Ariane.evenementPasse(ev('A', '2026-11-18', 'x'), ici), false);
});

// Un coffre en mémoire : notes { fm, corps }, tâches, écritures comptées.
function coffre(notes, taches) {
  const g = Object.create(Ariane.prototype);
  const fichier = (path) => ({ path, basename: path.split('/').pop().replace(/\.md$/, ''), extension: 'md' });
  const fs = new Map(Object.keys(notes).map((p) => [p, fichier(p)]));
  g.ecritures = [];
  g.taches = [];
  g.settings = { dossierNotesEvenements: 'EV', notesEvenementsCalendriers: ['Calendrier'], notesEvenementsDepuis: '2025-06-13' };
  g.marquerEcriture = () => {};
  g.marquerOrigineTache = () => {};
  g.cleT = (c) => c;
  g.fichierDePiece = () => null;
  g.tachesPourGantt = () => taches || [];
  g.majTache = async (ref, c) => {
    g.ecritures.push(['tache', ref, c]);
    const t = taches.find((x) => x.ref === ref);
    if (c.prepare) t.prepare = c.prepare;
    if (c['fait-suite']) t.faitSuite = c['fait-suite'];
    return true;
  };
  g.creerNoteEvenement = async (c) => {
    const p = 'EV/' + c.nom + '.md';
    notes[p] = { fm: null, nouveau: { 'Événement ID': c.evenementId, Date: c.date, aliases: [c.intitule] }, corps: '# ' + c.intitule + '\n' };
    fs.set(p, fichier(p));
    return p;
  };
  g.app = {
    vault: {
      getMarkdownFiles: () => [...fs.values()],
      getAbstractFileByPath: (p) => fs.get(p),
      cachedRead: async (f) => notes[f.path].corps,
      process: async (f, fn) => { g.ecritures.push(['corps', f.path]); notes[f.path].corps = fn(notes[f.path].corps); },
    },
    metadataCache: {
      getFileCache: (f) => (notes[f.path] && notes[f.path].fm ? { frontmatter: notes[f.path].fm } : null),
      fileToLinktext: (f) => f.basename,
      getFirstLinkpathDest: (c) => [...fs.values()].find((f) => f.basename === c) || null,
    },
    fileManager: { processFrontMatter: async (f, fn) => {
      g.ecritures.push(['fm', f.path]);
      const n = notes[f.path] || f.fm;
      if (!notes[f.path]) { fn(f.fm); return; }
      n.fm = n.fm || n.nouveau;
      fn(n.fm);
    } },
  };
  return g;
}

test('synchronisation : crée à un an près, pour les calendriers choisis, sans rien réécrire ensuite', async () => {
  const notes = {};
  const g = coffre(notes, []);
  const dedans = ev('A', J(200) + 'T10:00', 'Colloque', { fin: J(200) + 'T12:00', lieu: 'Lyon' });
  const lointain = ev('B', J(390) + 'T10:00', 'Trop loin');
  const perso = ev('C', J(3) + 'T10:00', 'Privé', { calendrier: 'Personnel' });
  const b = { debut: '2025-06-13', fin: J(399) };
  assert.equal((await g.synchroniserNotesEvenements([dedans, lointain, perso], b)).creees, 1);
  const p = 'EV/EV-' + J(200).replace(/-/g, '') + '-1000.md';
  assert.equal(notes[p].fm.Lieu, 'Lyon');
  assert.deepEqual(notes[p].fm.Ressources, []);
  g.ecritures.length = 0;
  await g.synchroniserNotesEvenements([dedans, lointain, perso], b);
  assert.deepEqual(g.ecritures, [], 'une note à jour n’est pas réécrite');
});

test('agenda modifié : la note suit, le texte reste, l’échéance des seules préparations bouge', async () => {
  const fm = Object.assign(Ariane.champsNoteEvenement(ev('A', '2026-11-20T10:00', 'Réunion')), { aliases: ['Réunion'], Ressources: [] });
  const notes = { 'EV/N.md': { fm, corps: '# Réunion\n\nMes notes.\n' } };
  const prep = { ref: 'T1', fichier: { path: 'T/T1.md' }, prepare: ['[[N]]'], faitSuite: [] };
  const suite = { ref: 'T2', fichier: { path: 'T/T2.md' }, prepare: [], faitSuite: ['[[N]]'] };
  const g = coffre(notes, [prep, suite]);
  await g.synchroniserNotesEvenements([ev('A', '2026-11-24T16:00', 'Réunion WP1')], { debut: '2026-11-01', fin: '2026-11-30' });
  assert.equal(fm['Début'], '2026-11-24T16:00');
  assert.equal(fm.Titre, 'Réunion WP1');
  assert.deepEqual(fm.aliases, ['Réunion WP1']);
  assert.ok(notes['EV/N.md'].corps.includes('# Réunion WP1') && notes['EV/N.md'].corps.includes('Mes notes.'));
  const taches = g.ecritures.filter((x) => x[0] === 'tache');
  assert.deepEqual(taches.map((x) => x[1]), ['T1']);
  assert.equal(taches[0][2].echeance, '2026-11-24');
  assert.equal(taches[0][2].heure, '16:00');
});

test('disparition : jamais sur une lecture vide ou partielle ; deux lectures sûres espacées', async () => {
  const note = () => ({ fm: Object.assign(Ariane.champsNoteEvenement(ev('A', '2026-11-20T10:00', 'R')), { Ressources: [] }), corps: '# R\n' });
  const autre = ev('Z', '2026-11-02T08:00', 'Autre');
  const b = { debut: '2026-11-01', fin: '2026-11-30' };
  const notes = { 'EV/N.md': note() };
  notes['EV/Z.md'] = { fm: Object.assign(Ariane.champsNoteEvenement(autre), { Ressources: [] }), corps: '# Autre\n' };
  const g = coffre(notes, []);
  await g.synchroniserNotesEvenements([], b, { lecture: { ok: true, calendriers: ['Calendrier'] } });
  await g.synchroniserNotesEvenements([autre], b);
  await g.synchroniserNotesEvenements([autre], b, { lecture: { ok: true, calendriers: ['Autre'] } });
  assert.equal(notes['EV/N.md'].fm['Statut agenda'], undefined);
  const lecture = { ok: true, calendriers: ['Calendrier'] };
  await g.synchroniserNotesEvenements([autre], b, { lecture });
  assert.equal(notes['EV/N.md'].fm['Statut agenda'], undefined, 'une seule absence ne suffit pas');
  g._absencesNE.set('EV/N.md', Date.now() - 31 * 60000);
  await g.synchroniserNotesEvenements([autre], b, { lecture });
  assert.equal(notes['EV/N.md'].fm['Statut agenda'], 'supprimé de Calendrier');
  assert.ok(notes['EV/N.md'], 'la note reste');
  await g.synchroniserNotesEvenements([autre, ev('A', '2026-11-20T10:00', 'R')], b, { lecture });
  assert.equal(notes['EV/N.md'].fm['Statut agenda'], undefined, 'l’événement revenu efface la marque');
});

test('tâche : préparer fixe l’échéance, faire suite non ; retirer vide la propriété', async () => {
  const notes = {};
  const f = { path: 'T/T1.md', fm: { prepare: ['[[EV-20261120-1000]]'] } };
  const t = { ref: 'T1', fichier: f, prepare: [], faitSuite: [] };
  const g = coffre(notes, [t]);
  const a = ev('A', '2026-11-20T10:00', 'Cours');
  assert.equal(await g.associerEvenementTache('T1', a), true);
  assert.deepEqual(t.prepare, ['[[EV-20261120-1000]]']);
  let c = g.ecritures.filter((x) => x[0] === 'tache').pop()[2];
  assert.equal(c.echeance, '2026-11-20');
  assert.equal(await g.associerEvenementTache('T1', a, { suite: true }), false, 'déjà relié');
  await g.associerEvenementTache('T1', ev('B', '2026-11-02T10:00', 'Réunion'), { suite: true });
  c = g.ecritures.filter((x) => x[0] === 'tache').pop()[2];
  assert.deepEqual(c['fait-suite'], ['[[EV-20261102-1000]]']);
  assert.equal('echeance' in c, false);
  assert.deepEqual(g.tachesDeEvenement(a).map((x) => [x.tache.ref, x.suite]), [['T1', false]]);
  await g.dissocierEvenementTache('T1', '[[EV-20261120-1000]]');
  assert.equal('prepare' in f.fm, false);
});
