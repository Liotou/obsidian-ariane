// Agenda iCal (Google Agenda) en fond : lecture, répétitions, fuseaux.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

process.env.TZ = process.env.TZ || 'Europe/Paris';

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'BEGIN:VEVENT', 'DTSTART:20261020T080000Z', 'DTEND:20261020T093000Z', 'UID:simple@google.com',
  'SUMMARY:Séminaire\\, salle B', 'LOCATION:Dauphine', 'DESCRIPTION:Ligne 1\\nLigne 2', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261022', 'DTEND;VALUE=DATE:20261024', 'UID:jour@google.com', 'SUMMARY:Colloque', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Paris:20261019T140000', 'DTEND;TZID=Europe/Paris:20261019T150000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=6', 'EXDATE;TZID=Europe/Paris:20261022T140000', 'UID:hebdo@google.com',
  'SUMMARY:Atelier', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Paris:20261027T160000', 'DTEND;TZID=Europe/Paris:20261027T170000',
  'RECURRENCE-ID;TZID=Europe/Paris:20261026T140000', 'UID:hebdo@google.com', 'SUMMARY:Atelier (déplacé)', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261021T100000Z', 'DTEND:20261021T110000Z', 'UID:annule@google.com', 'STATUS:CANCELLED',
  'SUMMARY:Annulé', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('lireIcs : propriétés, texte échappé, lignes continuées', () => {
  const l = Ariane.lireIcs('BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261020T080000Z\r\nSUMMARY:Une très longue\r\n  ligne\r\nEND:VEVENT');
  assert.equal(l[0].titre, 'Une très longue ligne');
  const e = Ariane.lireIcs(ICS)[0];
  assert.equal(e.titre, 'Séminaire, salle B');
  assert.equal(e.notes, 'Ligne 1\nLigne 2');
});

test('evenementsIcs : heures locales, journée entière, répétitions, exception, occurrence déplacée, annulation', () => {
  const ev = Ariane.evenementsIcs(ICS, '2026-10-19', '2026-11-01', { nom: 'Doctorat', couleur: '#3366cc' });
  const t = (titre) => ev.filter((e) => e.titre === titre);
  // 08:00 UTC = 10:00 à Paris (heure d'été jusqu'au 25 octobre).
  assert.deepEqual([t('Séminaire, salle B')[0].debut, t('Séminaire, salle B')[0].fin], ['2026-10-20T10:00', '2026-10-20T11:30']);
  const col = t('Colloque')[0];
  assert.equal(col.allDay, true);
  assert.deepEqual([col.debut, col.fin], ['2026-10-22T00:00', '2026-10-24T00:00']);
  // Lundis et jeudis, 6 fois à partir du 19 : 19, 22 (exclu), 26 (déplacé), 29, 2 nov., 5 nov. ;
  // dans la fenêtre : 19, 29 ; le 26 devient le 27 à 16 h.
  assert.deepEqual(t('Atelier').map((e) => e.debut), ['2026-10-19T14:00', '2026-10-29T14:00']);
  assert.deepEqual(t('Atelier (déplacé)').map((e) => e.debut), ['2026-10-27T16:00']);
  assert.equal(t('Annulé').length, 0);
  assert.ok(ev.every((e) => e.source === 'ics' && e.calendrier === 'Doctorat' && e.couleur === '#3366cc'));
});

test('repetitionsIcs : mensuelle au deuxième mardi, annuelle, jusqu’à une date', () => {
  const d = Ariane.dateIcs('20261013T090000', {});
  const m = Ariane.repetitionsIcs(d, 'FREQ=MONTHLY;BYDAY=2TU;COUNT=3', Date.UTC(2030, 0, 1));
  assert.deepEqual(m.map((x) => x.mo + '/' + x.d), ['10/13', '11/10', '12/8']);
  // Le 29 février ne revient que les années bissextiles.
  const a = Ariane.repetitionsIcs(Ariane.dateIcs('20280229', { VALUE: 'DATE' }), 'FREQ=YEARLY;UNTIL=20370101', Date.UTC(2040, 0, 1));
  assert.deepEqual(a.map((x) => x.y), [2028, 2032, 2036]);
  const u = Ariane.repetitionsIcs(Ariane.dateIcs('20261019T090000', {}), 'FREQ=DAILY;UNTIL=20261021T235959Z', Date.UTC(2030, 0, 1));
  assert.equal(u.length, 3);
});

test('Google synchronisé : connexion PKCE, dates avec décalage, identifiants, plan des opérations', () => {
  // PKCE (S256, base64url sans « = ») : valeur recoupée avec hashlib de Python.
  assert.equal(Ariane.defiPkce('dBjftJeZ4CVP-mJ92K9W8b_9mwzfXZ8wUwmZ-LpeuSc'), 'zGIUt5-5pjM3EHp7C8Vlt_XrqtiCZ35z65VfggSN0ig');
  const u = new URL(Ariane.urlAutorisationGoogle({ clientId: 'abc.apps.googleusercontent.com', redirection: 'http://127.0.0.1:5555', verificateur: 'v', etat: 'e1' }));
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.ok(u.searchParams.get('scope').includes('calendar.events'));
  // Heure d'été à Paris : +02:00 ; d'hiver : +01:00.
  assert.equal(Ariane.dateHeureGoogle('2026-10-20T14:00', 'Europe/Paris').dateTime, '2026-10-20T14:00:00+02:00');
  assert.equal(Ariane.dateHeureGoogle('2026-11-20T14:00', 'Europe/Paris').dateTime, '2026-11-20T14:00:00+01:00');
  assert.equal(Ariane.localDepuisGoogle({ dateTime: '2026-10-20T12:00:00Z' }), '2026-10-20T14:00');
  assert.equal(Ariane.localDepuisGoogle({ date: '2026-10-22' }), '2026-10-22T00:00');
  assert.deepEqual(Ariane.partiesIdGoogle(Ariane.idGoogle('perso@group.calendar.google.com', 'ev1')),
    { cal: 'perso@group.calendar.google.com', ev: 'ev1' });
  const crs = [{ debut: '2026-10-20T14:00', fin: '2026-10-20T15:00' }, { debut: '2026-10-21T09:00', fin: '2026-10-21T10:00' }];
  const ops = (o) => Ariane.planPushGoogle(o).map((x) => x.op + x.idx);
  assert.deepEqual(ops({ ref: 'T1', crs, ids: [], cal: 'C' }), ['creer0', 'creer1']);
  assert.deepEqual(ops({ ref: 'T1', crs, ids: ['C::a', 'C::b'], cal: 'C' }), ['maj0', 'maj1']);
  assert.deepEqual(ops({ ref: 'T1', crs, ids: ['A::a', 'C::b'], cal: 'C' }), ['deplacer0', 'maj1']);
  assert.deepEqual(ops({ ref: 'T1', crs: crs.slice(0, 1), ids: ['C::a', 'C::b'], cal: 'C' }), ['maj0', 'supprimer1']);
  // Sans calendrier : rien à créer, les événements liés sont retirés.
  assert.deepEqual(ops({ ref: 'T1', crs, ids: ['C::a'], cal: '' }), ['supprimer0']);
  const corps = Ariane.corpsEvenementGoogle({ ref: 'T1', idx: 0, titre: '[T1] - Lire', notes: 'Extrait', lien: 'obsidian://open?x', debut: crs[0].debut, fin: crs[0].fin, fuseau: 'Europe/Paris' });
  assert.equal(corps.summary, '[T1] - Lire');
  assert.match(corps.description, /Extrait[\s\S]*obsidian:\/\/open\?x/);
  assert.equal(corps.extendedProperties.private.ariane, 'T1');
});

test('Google synchronisé : un envoi crée, met à jour, déplace, supprime, puis note les identifiants', async () => {
  const cr = (d, f) => Ariane.formatCreneau(d, f);
  const fms = {
    T1: { 'Tâche - Google ID': [] },
    T2: { 'Tâche - Google ID': ['Ancien::e2'] },
    T3: { 'Tâche - Google ID': ['C1::e3', 'C1::e4'] },
  };
  const taches = [
    { ref: 'T1', intitule: 'Lire', famille: 'f', statut: 'à faire', fichier: { path: 'T/T1.md' }, creneaux: [cr('2026-10-20T14:00', '2026-10-20T15:00')] },
    { ref: 'T2', intitule: 'Écrire', famille: 'f', statut: 'à faire', fichier: { path: 'T/T2.md' }, creneaux: [cr('2026-10-21T09:00', '2026-10-21T10:00')] },
    { ref: 'T3', intitule: 'Relire', famille: 'f', statut: 'à faire', fichier: { path: 'T/T3.md' }, creneaux: [cr('2026-10-22T09:00', '2026-10-22T10:00')] },
  ];
  const appels = [];
  let n = 0;
  const ctx = Object.assign(Object.create(Ariane.prototype), {
    settings: { prefixeTaches: 'Tâche - ', agendaFormatTitre: '[{ref}] - {intitule}', googleJeton: { refresh_token: 'r' } },
    app: {
      vault: { getName: () => 'Coffre' },
      metadataCache: { getFileCache: (f) => ({ frontmatter: fms[f.path.slice(2, 4)] }) },
      fileManager: { processFrontMatter: async (f, fn) => fn(fms[f.path.slice(2, 4)]) },
    },
  });
  Object.assign(ctx, {
    tachesPourGantt: () => taches,
    calendriersGoogle: async () => new Map([['doctorat', 'C1']]),
    agendaCalendrierDe: () => 'Doctorat',
    lireNoteTache: async () => '',
    familleDe: () => ({ nom: 'F' }),
    marquerEcriture: () => {},
    _rafraichirFond: () => {},
    _googleApi: async (m, chemin, corps) => {
      appels.push(m + ' ' + decodeURIComponent(chemin));
      if (m === 'POST') return { status: 200, json: { id: 'nouveau' + (++n) } };
      return { status: m === 'DELETE' ? 204 : 200, json: {} };
    },
  });
  await ctx._pousserGoogleImpl(true);
  assert.deepEqual(appels, [
    'POST /calendars/C1/events',
    'DELETE /calendars/Ancien/events/e2', 'POST /calendars/C1/events',
    'PATCH /calendars/C1/events/e3', 'DELETE /calendars/C1/events/e4',
  ]);
  assert.deepEqual(fms.T1['Tâche - Google ID'], ['C1::nouveau1']);
  assert.deepEqual(fms.T2['Tâche - Google ID'], ['C1::nouveau2']);
  assert.deepEqual(fms.T3['Tâche - Google ID'], ['C1::e3']);
  assert.ok(fms.T1['Tâche - Synchro Google'], 'instantané posé');
  // Un second envoi automatique, rien n'ayant changé : aucun appel.
  appels.length = 0;
  await ctx._pousserGoogleImpl(true);
  assert.deepEqual(appels, [], 'rien de changé, rien d’envoyé');
  // Le titre change : seule cette tâche repart.
  taches[0].intitule = 'Lire Ackoff';
  await ctx._pousserGoogleImpl(true);
  assert.deepEqual(appels, ['PATCH /calendars/C1/events/nouveau1']);
});

test('Google synchronisé : la relève déplace le créneau, et ne fait qu’oublier le lien d’un événement disparu', async () => {
  const c1 = Ariane.formatCreneau('2026-10-20T14:00', '2026-10-20T15:00');
  const c2 = Ariane.formatCreneau('2026-10-21T09:00', '2026-10-21T10:00');
  const t = { ref: 'T1', statut: 'à faire', fichier: { path: 'T/T1.md' }, creneaux: [c1, c2] };
  const fm = { 'Tâche - Google ID': ['C1::a', 'C1::b'], 'Tâche - Synchro Google': Ariane.instantAgenda(t) + '§[T1] - x|C1' };
  const deplaces = [];
  const ctx = Object.assign(Object.create(Ariane.prototype), {
    settings: { prefixeTaches: 'Tâche - ', googleJeton: { refresh_token: 'r' } },
    app: { metadataCache: { getFileCache: () => ({ frontmatter: fm }) },
      fileManager: { processFrontMatter: async (f, fn) => fn(fm) } },
  });
  Object.assign(ctx, {
    tachesPourGantt: () => [t],
    marquerEcriture: () => {},
    antirebond: () => {},
    majCreneau: async (ref, o) => { deplaces.push(o.debut + '>' + o.fin); },
    _googleApi: async (m, chemin) => (chemin.endsWith('/a')
      ? { status: 200, json: { start: { dateTime: '2026-10-20T14:30:00+02:00' }, end: { dateTime: '2026-10-20T16:00:00+02:00' } } }
      : { status: 404, json: null }),
  });
  const n = await ctx.releverGoogle(true);
  assert.equal(n, 2);
  assert.deepEqual(deplaces, ['2026-10-20T14:30>2026-10-20T16:00']);
  assert.deepEqual(fm['Tâche - Google ID'], ['C1::a', ''], 'lien oublié, créneau gardé');
});
