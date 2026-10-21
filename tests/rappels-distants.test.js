// Rappels hors du Mac : Google Tasks et Microsoft To Do (fonctions pures,
// puis moteur d'envoi et de relève contre un faux service).
process.env.TZ = 'Europe/Paris';
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('identifiant de rappel : préfixé du service, sans préfixe pour Apple', () => {
  const id = Ariane.idRappel('google', 'L1', 't9');
  assert.equal(id, 'google:L1::t9');
  assert.deepEqual(Ariane.partiesIdRappel(id), { fournisseur: 'google', liste: 'L1', tache: 't9' });
  assert.deepEqual(Ariane.partiesIdRappel('microsoft:AAMk=::AQMk='), { fournisseur: 'microsoft', liste: 'AAMk=', tache: 'AQMk=' });
  assert.equal(Ariane.partiesIdRappel('8F2C-11AA').fournisseur, 'apple');
  assert.equal(Ariane.partiesIdRappel('').fournisseur, '');
  assert.equal(Ariane.idRappel('google', '', 't'), '');
});

test('corps Google : le jour seul, statut, et la coche retirée', () => {
  assert.deepEqual(Ariane.corpsTacheGoogle({ titre: 'T', notes: 'n', echeance: '2026-10-21', heure: '14:00', termine: false }),
    { title: 'T', notes: 'n', due: '2026-10-21T00:00:00.000Z', status: 'needsAction', completed: null });
  const fini = Ariane.corpsTacheGoogle({ titre: 'T', echeance: '', termine: true });
  assert.equal(fini.status, 'completed');
  assert.equal(fini.due, null);
  assert.ok(!('completed' in fini));
});

test('corps Microsoft : jour, heure en alerte, importance, fuseau ou UTC', () => {
  const c = Ariane.corpsTacheMicrosoft({ titre: 'T', notes: 'n', echeance: '2026-10-21', heure: '14:30',
    priorite: 'haute', termine: false, fuseau: 'Europe/Paris' });
  assert.deepEqual(c.dueDateTime, { dateTime: '2026-10-21T00:00:00', timeZone: 'Europe/Paris' });
  assert.deepEqual(c.reminderDateTime, { dateTime: '2026-10-21T14:30:00', timeZone: 'Europe/Paris' });
  assert.equal(c.isReminderOn, true);
  assert.equal(c.importance, 'high');
  assert.equal(c.status, 'notStarted');
  const u = Ariane.corpsTacheMicrosoft({ titre: 'T', echeance: '2026-10-21', heure: '', priorite: 'basse', termine: true, fuseau: '' });
  assert.deepEqual(u.dueDateTime, { dateTime: '2026-10-20T22:00:00', timeZone: 'UTC' }, 'minuit de Paris, en UTC');
  assert.equal(u.isReminderOn, false);
  assert.equal(u.reminderDateTime, null);
  assert.equal(u.importance, 'low');
  assert.equal(u.status, 'completed');
});

test('relève : la date lue côté Google et côté Microsoft', () => {
  assert.deepEqual(Ariane.etatTacheDistante('google', { title: 'A', status: 'completed', due: '2026-10-21T00:00:00.000Z' }),
    { titre: 'A', coche: true, due: '2026-10-21' });
  // Minuit local exprimé en UTC : ramené au bon jour.
  assert.equal(Ariane.etatTacheDistante('microsoft', { title: 'B', status: 'notStarted',
    dueDateTime: { dateTime: '2026-10-20T22:00:00.0000000', timeZone: 'UTC' } }).due, '2026-10-21');
  // Minuit pile : le jour tel quel, quel que soit le fuseau.
  assert.equal(Ariane.etatTacheDistante('microsoft', { dueDateTime: { dateTime: '2026-10-21T00:00:00.0000000', timeZone: 'UTC' } }).due, '2026-10-21');
  // L'alerte du même jour donne l'heure.
  assert.equal(Ariane.etatTacheDistante('microsoft', { status: 'completed',
    dueDateTime: { dateTime: '2026-10-21T00:00:00', timeZone: 'Europe/Paris' },
    isReminderOn: true, reminderDateTime: { dateTime: '2026-10-21T12:30:00.0000000', timeZone: 'UTC' } }).due, '2026-10-21T14:30');
  assert.equal(Ariane.etatTacheDistante('microsoft', {}).due, '');
});

test('connexion : Microsoft en PKCE, Google autorise aussi les tâches', () => {
  const u = new URL(Ariane.urlAutorisationMicrosoft({ clientId: 'abc', locataire: '', redirection: 'http://localhost:5000', verificateur: 'v'.repeat(50), etat: 'e' }));
  assert.equal(u.origin + u.pathname, 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  assert.equal(u.searchParams.get('scope'), 'Tasks.ReadWrite offline_access');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost:5000');
  assert.ok(Ariane.GOOGLE_PORTEES.includes('https://www.googleapis.com/auth/tasks'));
});

// Un greffon factice, branché sur un faux service : `repondre(m, url, corps)`.
function greffon(dest, taches, repondre) {
  const appels = [];
  const ecrits = {};
  const instantanes = {};
  const ctx = Object.assign(Object.create(Ariane.prototype), {
    settings: { rappelsDestination: dest, rappelsActif: true, rappelsFormatTitre: '[{ref}] - {intitule}',
      googleJeton: { refresh_token: 'r' }, microsoftJeton: { refresh_token: 'r' }, rappelsSupprimerAbandonnees: true },
    app: {
      vault: { getName: () => 'Coffre' },
      fileManager: { processFrontMatter: async (f, fn) => { const x = {}; fn(x); instantanes[f.path] = x['Tâche - Synchro Rappels']; } },
    },
  });
  Object.assign(ctx, {
    _tachesRappel: () => taches,
    listeRappelsDe: (fam) => (fam === 'autre' ? 'Autre' : 'Doctorat'),
    familleDe: () => ({ nom: 'F' }),
    lireNoteTache: async () => '',
    marquerEcriture: () => {},
    majTache: async (ref, champs) => { ecrits[ref] = Object.assign(ecrits[ref] || {}, champs); return true; },
    _appelOAuth: async (service, m, url, corps) => {
      appels.push(m + ' ' + decodeURIComponent(url.replace(/^https:\/\/[^/]+/, '')));
      return repondre(m, url, corps);
    },
  });
  return { ctx, appels, ecrits, instantanes };
}

test('Google Tasks : un envoi crée, met à jour, change de liste, retire l’abandonnée, ignore Apple', async () => {
  const f = (r) => ({ path: 'T/' + r + '.md' });
  const taches = [
    { ref: 'T1', intitule: 'Lire', statut: 'à faire', echeance: '2026-10-21', fichier: f('T1'), _rid: '', _snap: '' },
    { ref: 'T2', intitule: 'Écrire', statut: 'à faire', echeance: '2026-10-22', fichier: f('T2'), _rid: 'google:LD::t2', _snap: '' },
    { ref: 'T3', intitule: 'Fait', statut: 'terminée', echeance: '2026-10-01', fichier: f('T3'), _rid: 'APPLE-UUID', _snap: 'x' },
    { ref: 'T4', intitule: 'Laissé', statut: 'abandonnée', echeance: '', fichier: f('T4'), _rid: 'google:LD::t4', _snap: 'x' },
    { ref: 'T5', intitule: 'Ailleurs', statut: 'à faire', echeance: '2026-10-23', famille: 'autre', fichier: f('T5'), _rid: 'google:LD::t5', _snap: '' },
  ];
  let n = 0;
  const g = greffon('google', taches, (m, url) => {
    if (url.includes('/users/@me/lists') && m === 'GET') return { status: 200, json: { items: [{ id: 'L0', title: 'Mes tâches' }, { id: 'LD', title: 'Doctorat' }] } };
    if (url.includes('/users/@me/lists') && m === 'POST') return { status: 200, json: { id: 'LA' } };
    if (m === 'POST') return { status: 200, json: { id: 'neuf' + (++n) } };
    if (m === 'DELETE') return { status: 204, json: null };
    return { status: 200, json: { id: 'x' } };
  });
  const r = await g.ctx._pousserRappelsDistant(true);
  assert.equal(r, 4);
  assert.deepEqual(g.appels, [
    'GET /tasks/v1/users/@me/lists?maxResults=100',
    'POST /tasks/v1/lists/LD/tasks',
    'PATCH /tasks/v1/lists/LD/tasks/t2',
    'DELETE /tasks/v1/lists/LD/tasks/t4',
    'POST /tasks/v1/users/@me/lists',
    'DELETE /tasks/v1/lists/LD/tasks/t5', 'POST /tasks/v1/lists/LA/tasks',
  ]);
  assert.equal(g.ecrits.T1['rappel-id'], 'google:LD::neuf1');
  assert.equal(g.ecrits.T2, undefined, 'identifiant inchangé, rien à réécrire');
  assert.equal(g.ecrits.T4['rappel-id'], '');
  assert.equal(g.ecrits.T5['rappel-id'], 'google:LA::neuf2');
  assert.ok(!('T3' in g.ecrits), 'la tâche close d’Apple ne part pas chez Google');
  assert.match(g.instantanes['T/T1.md'], /^2026-10-21\|\|à faire§\[T1\] - Lire\|LD$/);

  // Un second envoi automatique, rien n'ayant changé : aucun appel aux tâches.
  for (const t of taches) {
    if (g.ecrits[t.ref] && g.ecrits[t.ref]['rappel-id'] != null) t._rid = g.ecrits[t.ref]['rappel-id'];
    if (g.instantanes[t.fichier.path]) t._snap = g.instantanes[t.fichier.path];
  }
  g.appels.length = 0;
  await g.ctx._pousserRappelsDistant(true);
  assert.deepEqual(g.appels, [], 'listes en cache, tâches inchangées');
});

test('Microsoft To Do : un fuseau refusé se rabat sur l’UTC', async () => {
  const taches = [{ ref: 'T1', intitule: 'Lire', statut: 'à faire', echeance: '2026-10-21', heure: '09:00',
    fichier: { path: 'T/T1.md' }, _rid: '', _snap: '' }];
  const corps = [];
  const g = greffon('microsoft', taches, (m, url, c) => {
    if (url.endsWith('/me/todo/lists')) return { status: 200, json: { value: [{ id: 'M1', displayName: 'Doctorat' }] } };
    corps.push(c);
    if (c.dueDateTime.timeZone !== 'UTC') return { status: 400, json: { error: { code: 'invalidRequest' } } };
    return { status: 201, json: { id: 'mt1' } };
  });
  await g.ctx._pousserRappelsDistant(true);
  assert.equal(corps.length, 2);
  assert.equal(corps[0].dueDateTime.timeZone, 'Europe/Paris');
  assert.deepEqual(corps[1].reminderDateTime, { dateTime: '2026-10-21T07:00:00', timeZone: 'UTC' });
  assert.equal(g.ecrits.T1['rappel-id'], 'microsoft:M1::mt1');
});

test('relève Google : coche et jour repris, heure gardée, tâche ajoutée importée', async () => {
  const fm = {
    'T/T1.md': { 'Tâche - Rappel ID': 'google:LD::a', 'Tâche - Synchro Rappels': '2026-10-21|10:00|à faire§x|LD' },
    'T/T2.md': { 'Tâche - Rappel ID': 'google:LD::b', 'Tâche - Synchro Rappels': '2026-10-01||à faire' },
  };
  const taches = [
    { ref: 'T1', statut: 'à faire', echeance: '2026-10-21', heure: '10:00', fichier: { path: 'T/T1.md' } },
    { ref: 'T2', statut: 'à faire', echeance: '2026-10-05', heure: '', fichier: { path: 'T/T2.md' } },
  ];
  const importes = [];
  const g = greffon('google', [], (m, url) => {
    if (url.includes('/users/@me/lists')) return { status: 200, json: { items: [{ id: 'LD', title: 'Doctorat' }] } };
    return { status: 200, json: { items: [
      { id: 'a', title: '[T1] - x', status: 'completed', due: '2026-10-24T00:00:00.000Z' },
      { id: 'b', title: '[T2] - y', status: 'completed', due: '2026-10-01T00:00:00.000Z' },
      { id: 'c', title: 'Appeler le labo', status: 'needsAction', due: '2026-10-25T00:00:00.000Z' },
      { id: 'd', title: 'Déjà fait', status: 'completed' },
    ] } };
  });
  Object.assign(g.ctx, {
    settings: Object.assign(g.ctx.settings, { prefixeTaches: 'Tâche - ', listeRappelsDefaut: 'Doctorat', famillesTaches: [], rappelsIgnores: [] }),
    tachesPourGantt: () => taches,
    _lireT: (x, concept) => x['Tâche - Rappel ID'],
    _importerRappel: async (r) => { importes.push(r); return true; },
  });
  g.ctx.app.metadataCache = { getFileCache: (f) => ({ frontmatter: fm[f.path] }) };
  const n = await g.ctx._releverRappelsDistant(true);
  assert.equal(n, 2);
  assert.deepEqual(g.ecrits.T1, { statut: 'terminée', terminee: true, echeance: '2026-10-24', heure: '10:00' });
  assert.equal(g.ecrits.T2, undefined, 'la note a bougé depuis l’envoi : elle fait foi');
  assert.deepEqual(importes.map((r) => [r.id, r.nom, r.dueIso, r.listeNom]),
    [['google:LD::c', 'Appeler le labo', '2026-10-25', 'Doctorat']]);
});

test('relève Apple : inchangée, et sans les identifiants des autres services', async () => {
  const fm = {
    'T/T1.md': { 'Tâche - Rappel ID': 'APPLE-1', 'Tâche - Synchro Rappels': '2026-10-21||à faire' },
    'T/T2.md': { 'Tâche - Rappel ID': 'google:LD::b' },
  };
  const taches = [
    { ref: 'T1', statut: 'à faire', echeance: '2026-10-21', heure: '', fichier: { path: 'T/T1.md' } },
    { ref: 'T2', statut: 'à faire', echeance: '2026-10-05', heure: '', fichier: { path: 'T/T2.md' } },
  ];
  const importes = [];
  let script = '';
  const g = greffon('apple', [], () => ({ status: 500 }));
  Object.assign(g.ctx, {
    settings: Object.assign(g.ctx.settings, { rappelsDestination: '', listeRappelsDefaut: 'Doctorat', famillesTaches: [], rappelsIgnores: [] }),
    _dossierTachesValide: () => true,
    tachesPourGantt: () => taches,
    _lireT: (x) => x['Tâche - Rappel ID'],
    _importerRappel: async (r, refs, connus) => { importes.push([r.id, r.nom, r.coche, r.dueIso, r.listeNom, connus.has('google:LD::b')]); return true; },
    _osascriptJXA: async (s) => { script = s; return 'T1\t1\t2026-10-24T09:00\nNOUVEAU\tR9\tAppeler\t0\t2026-10-25\tDoctorat\nNOUVEAU\tAPPLE-1\tdéjà lié\t0\t\tDoctorat'; },
  });
  g.ctx.app.metadataCache = { getFileCache: (f) => ({ frontmatter: fm[f.path] }) };
  const n = await g.ctx.releverRappels(true);
  assert.equal(n, 2);
  assert.ok(script.includes('APPLE-1') && !script.includes('google:'), 'seul l’identifiant Apple part vers Rappels');
  assert.deepEqual(g.ecrits.T1, { statut: 'terminée', terminee: true, echeance: '2026-10-24', heure: '09:00' });
  assert.deepEqual(importes, [['R9', 'Appeler', false, '2026-10-25', 'Doctorat', true]]);
});
