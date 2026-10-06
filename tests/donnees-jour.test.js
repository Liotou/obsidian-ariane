// Données du temps par jour (.ariane/jours/AAAA-MM-JJ.json)
// et bilan de la journée : éprouvés sur un disque en mémoire.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const DIR = '.obsidian/plugins/obsidian-ariane';
const DONNEES = '.ariane/jours';

function greffon(disque, settings) {
  const g = Object.create(Ariane.prototype);
  g.settings = Object.assign({}, settings || {});
  g.manifest = { dir: DIR };
  g.saveSettings = async () => { g._sauve = true; };
  g.app = {
    vault: {
      adapter: {
        exists: async (p) => p in disque || Object.keys(disque).some((k) => k.startsWith(p + '/')),
        write: async (p, s) => { disque[p] = s; },
        read: async (p) => disque[p],
        mkdir: async () => {},
        rename: async (de, vers) => {
          for (const k of Object.keys(disque)) {
            if (k === de || k.startsWith(de + '/')) { disque[vers + k.slice(de.length)] = disque[k]; delete disque[k]; }
          }
        },
        list: async (d) => ({ files: Object.keys(disque).filter((k) => k.startsWith(d + '/')), folders: [] }),
        remove: async (p) => { delete disque[p]; },
        rmdir: async () => {},
      },
    },
  };
  return g;
}

test('données par jour : un dossier caché à la racine du coffre', () => {
  const g = greffon({}, { tempsDossierJournal: 'Journal/' });
  assert.equal(g.dossierDonneesJour, '.ariane/jours');
  assert.equal(g.cheminDonneesJour('2026-10-06'), '.ariane/jours/2026-10-06.json');
});

test('données par jour : ajout, écriture groupée, relecture bout à bout', async () => {
  const disque = {};
  const g = greffon(disque);
  await g.ajouterDonneeJour('2026-10-05', 'sessions', { chemin: 'a.md' });
  await g.ajouterDonneeJour('2026-10-06', 'sessions', { chemin: 'b.md' });
  await g.ajouterDonneeJour('2026-10-06', 'onglets', { url: 'https://x' });
  g.settings.tempsHistorique = { '2026-10-06': { 'b.md': 120 } };
  await g.ecrireDonneesJours();
  const o = JSON.parse(disque[DONNEES + '/2026-10-06.json']);
  assert.equal(o.jour, '2026-10-06');
  assert.deepEqual(o.temps, { 'b.md': 120 }, 'le relevé du compteur rejoint son jour');
  assert.equal(o.onglets.length, 1);

  // Une autre session repart du disque.
  const h = greffon(disque);
  assert.deepEqual(await h.joursAvecDonnees(), ['2026-10-05', '2026-10-06']);
  assert.deepEqual((await h.listesDepuis('sessions', '')).map((x) => x.chemin), ['a.md', 'b.md']);
  assert.deepEqual((await h.listesDepuis('sessions', '2026-10-06')).map((x) => x.chemin), ['b.md']);
  await h.chargerTempsDepuisJours();
  // Le jour n'est retenu que dans la fenêtre « tempsRetenirJours » : on la
  // vérifie seulement s'il est récent.
  if (Date.now() - Date.parse('2026-10-06') < 100 * 86400000) {
    assert.equal(h.settings.tempsHistorique['2026-10-06']['b.md'], 120);
  }
});

test('migration : les anciens fichiers passent dans les jours, puis sont mis de côté', async () => {
  const disque = {
    [DIR + '/sessions-travail.jsonl']: [
      JSON.stringify({ chemin: 'vieux.md', debut: '2026-10-01T09:00:00', fin: '2026-10-01T09:30:00' }),
      JSON.stringify({ renomme: 'vieux.md', vers: 'neuf.md' }),
    ].join('\n') + '\n',
    [DIR + '/journal-taches.jsonl']: JSON.stringify({ ref: 'T001', champ: 'statut', le: '2026-10-02T10:00:00' }) + '\n',
    [DIR + '/activite-ia.json']: JSON.stringify({ '2026-10-02 14:00': { resume: 'Lecture' } }),
    [DIR + '/chronologie/2026-10.json']: JSON.stringify({ '2026-10-03': [{ type: 'creation', chemin: 'n.md' }] }),
  };
  const g = greffon(disque, { tempsHistorique: { '2026-10-01': { 'neuf.md': 60 } } });
  await g.migrerVersDonneesJour();

  const j1 = JSON.parse(disque[DONNEES + '/2026-10-01.json']);
  assert.equal(j1.sessions[0].chemin, 'neuf.md', 'le renommage est rejoué');
  assert.deepEqual(j1.temps, { 'neuf.md': 60 });
  const j2 = JSON.parse(disque[DONNEES + '/2026-10-02.json']);
  assert.equal(j2.taches.length, 1);
  assert.equal(j2.activiteIA['2026-10-02 14:00'].resume, 'Lecture');
  assert.equal(JSON.parse(disque[DONNEES + '/2026-10-03.json']).chronologie.length, 1);

  assert.ok(!(DIR + '/sessions-travail.jsonl' in disque));
  assert.ok(DIR + '/sessions-travail.jsonl.avant-donnees-jour' in disque, 'l\'ancien fichier est gardé');
  assert.ok(DIR + '/chronologie.avant-donnees-jour/2026-10.json' in disque);
  assert.equal(g.settings.donneesJourVersion, 2);
  assert.ok(g._sauve);

  // Une seconde fois : rien ne bouge.
  const avant = JSON.stringify(disque);
  await g.migrerVersDonneesJour();
  assert.equal(JSON.stringify(disque), avant);
});

test('bilan de la journée : consigne pour une lecture à voix haute', () => {
  const p = Ariane.promptResumeJournee('2026-10-06', 'Travail dans Obsidian : 2 h 10', 'doctorant');
  assert.match(p, /mardi 6 octobre/);
  assert.match(p, /« Monsieur »/);
  assert.match(p, /voix haute/);
  assert.match(p, /\{"resume": "…"\}/);
  assert.match(p, /Contexte : doctorant/);
  assert.match(p, /Travail dans Obsidian : 2 h 10$/);
  assert.ok(!/Contexte/.test(Ariane.promptResumeJournee('2026-10-06', 'x', '')), 'pas de contexte, pas de ligne');
});

test('chronologie : une rafale de créations devient un lot, le reste ne bouge pas', () => {
  const s = 1000;
  const T = 1790000000000;
  const evts = [
    { t: T + 500 * s, type: 'note-modifiee', chemin: 'Notes/a.md' },
    ...[0, 10, 20, 30, 40].map((d, i) => ({ t: T + d * s, type: 'note-creee', chemin: '98 - Bibliographie/n' + i + '.md', titre: 'n' + i })),
    { t: T + 25 * s, type: 'note-creee', chemin: 'Notes/b.md', titre: 'b' },
    { t: T + 400 * s, type: 'note-creee', chemin: '98 - Bibliographie/tard.md', titre: 'tard' },
  ].sort((a, b) => b.t - a.t);
  const g = Ariane.grouperAjoutsAuto(evts);
  assert.deepEqual(g.map((e) => e.type), ['note-modifiee', 'note-creee', 'ajouts-auto', 'note-creee']);
  const lot = g[2];
  assert.equal(lot.n, 5);
  assert.equal(lot.dossier, '98 - Bibliographie');
  assert.equal(lot.t, T + 40 * s);
  assert.equal(lot.debut, T);
  assert.deepEqual(lot.elements.map((x) => x.titre), ['n4', 'n3', 'n2', 'n1', 'n0']);
  assert.equal(g[3].titre, 'b', 'une note seule dans un autre dossier reste à sa place');
  assert.equal(Ariane.grouperAjoutsAuto(evts.slice(0, 3)).length, 3, 'trois créations ne font pas un lot');
});

test('migration v2 : l\'ancien .données rejoint .ariane/jours, fusionné si besoin', async () => {
  const VIEUX = '07 - Journal du temps/.données';
  const disque = {
    [VIEUX + '/2026-10-01.json']: JSON.stringify({ version: 1, jour: '2026-10-01', sessions: [{ chemin: 'a.md' }], temps: { 'a.md': 60 } }),
    [VIEUX + '/2026-10-02.json']: JSON.stringify({ version: 1, jour: '2026-10-02', taches: [{ ref: 'T1' }], resumeJournee: { texte: 'Bonne journée' } }),
    [DONNEES + '/2026-10-02.json']: JSON.stringify({ version: 1, jour: '2026-10-02', taches: [{ ref: 'T2' }], temps: { 'b.md': 30 } }),
  };
  const g = greffon(disque, { donneesJourVersion: 1, tempsDossierJournal: '07 - Journal du temps' });
  await g.migrerVersDonneesJour();
  assert.ok(!Object.keys(disque).some((k) => k.startsWith(VIEUX + '/')), 'plus rien dans l\'ancien dossier');
  assert.equal(JSON.parse(disque[DONNEES + '/2026-10-01.json']).sessions[0].chemin, 'a.md');
  const d2 = JSON.parse(disque[DONNEES + '/2026-10-02.json']);
  assert.deepEqual(d2.taches.map((x) => x.ref), ['T2', 'T1'], 'listes mises bout à bout');
  assert.equal(d2.resumeJournee.texte, 'Bonne journée');
  assert.deepEqual(d2.temps, { 'b.md': 30 });
  assert.equal(g.settings.donneesJourVersion, 2);
  assert.equal(await g.resumeDeLaJournee('2026-10-02'), 'Bonne journée', 'le cache relit le nouvel endroit');
});

test('temps du jour : en minutes, du plus long au plus court, une minute au moins', async () => {
  const disque = { [DONNEES + '/2026-10-05.json']: JSON.stringify({ temps: { 'a.md': 600, 'b.md': 30, 'c.md': 1800 } }) };
  const g = greffon(disque, { tempsHistorique: { '2026-10-05': { 'a.md': 900 } } });
  assert.deepEqual(await g.tempsDuJour('2026-10-05'), [{ chemin: 'c.md', min: 30 }, { chemin: 'a.md', min: 15 }]);
});
