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

test('bilan de la journée : consigne du soir, demain, mot pour clore', () => {
  const p = Ariane.promptResumeJournee('2026-10-06', 'Travail dans Obsidian : 2 h 10', 'doctorant', {
    portrait: 'Imposteur à ses heures.', demain: 'ÉVÉNEMENTS :\n- 09:00 à 10:00 : Cours', mot: { mot: 'Kairos', definition: 'le moment opportun' } });
  assert.match(p, /mardi 6 octobre/);
  assert.match(p, /Demain \(mercredi 7 octobre\)/);
  assert.match(p, /« Monsieur »/);
  assert.match(p, /voix haute/);
  assert.match(p, /Portrait : Imposteur à ses heures\./);
  assert.match(p, /Contexte : doctorant/);
  assert.match(p, /« Le mot pour clore cette journée est : »/);
  assert.match(p, /Le mot est imposé : « Kairos », défini ainsi : « le moment opportun »/);
  assert.match(p, /une journée ne définit pas une thèse entière/);
  assert.match(p, /RELEVÉ DE LA JOURNÉE :\nTravail dans Obsidian : 2 h 10/);
  assert.match(p, /DEMAIN \(mercredi 7 octobre\) :\nÉVÉNEMENTS :\n- 09:00 à 10:00 : Cours$/);
  const libre = Ariane.promptResumeJournee('2026-10-06', 'x', '', { motsRecents: ['Ataraxie'] });
  assert.ok(!/Contexte|Portrait/.test(libre), 'sans contexte ni portrait, pas de ligne');
  assert.match(libre, /Choisis toi-même un mot/);
  assert.match(libre, /Pas l'un de ceux-ci, déjà donnés : Ataraxie\./);
  assert.match(libre, /Rien de prévu au calendrier ni dans les tâches\.$/);
});

test('mots du soir : une entrée par ligne, puces et entête retirées', () => {
  const t = '---\ntags: mots\n---\n# Mots\n- Kairos : le moment opportun\n* [ ] **Sérendipité** = trouver sans chercher\n3. Ataraxie\n\n';
  assert.deepEqual(Ariane.motsDuSoir(t), [
    { mot: 'Kairos', definition: 'le moment opportun' },
    { mot: 'Sérendipité', definition: 'trouver sans chercher' },
    { mot: 'Ataraxie', definition: '' },
  ]);
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

test('bilan : événements du calendrier, créneaux tenus ou non, échéances ouvertes', async () => {
  const jour = '2026-10-05'; // un jour passé : tous les créneaux sont révolus
  const g = greffon({});
  g.donneesTempsReel = async () => null;
  g.activiteDisponible = () => false;
  g._cheminsLiesTache = () => [];
  g.sessionsTravail = () => [
    { chemin: 'T1.md', debut: jour + 'T09:00:00', fin: jour + 'T09:50:00' },
    { chemin: 'T2.md', debut: jour + 'T14:00:00', fin: jour + 'T14:20:00' },
  ];
  g.evenementsFond = async () => [
    { titre: 'Séminaire', debut: jour + 'T10:00', fin: jour + 'T12:00', calendrier: 'Labo', participants: ['A', 'B'] },
    { titre: 'Hier', debut: '2026-10-04T10:00', fin: '2026-10-04T11:00' },
  ];
  g.tachesPourGantt = () => [
    { ref: 'T1', intitule: 'Lire', statut: 'en cours', fichier: { path: 'T1.md' }, creneaux: [jour + ' 09:00-10:00'], tempsReel: [] },
    { ref: 'T2', intitule: 'Écrire', statut: 'à faire', fichier: { path: 'T2.md' }, creneaux: [jour + ' 14:00-16:00'], tempsReel: [] },
    { ref: 'T3', intitule: 'Rendre', statut: 'à faire', echeance: jour, jalon: true, fichier: { path: 'T3.md' }, creneaux: [jour + ' 17:00-18:00'], tempsReel: [] },
  ];
  const m = await g._matiereJournee(jour);
  assert.match(m, /ÉVÉNEMENTS DU CALENDRIER :\n- 10:00 à 12:00 : Séminaire \(agenda Labo, 2 participants\)/);
  assert.ok(!/Hier/.test(m), 'un événement d\'un autre jour n\'y est pas');
  assert.match(m, /09:00 à 10:00 : T1 Lire \(statut en cours\) : 50 min faites sur 1 h \(tenu\)/);
  assert.match(m, /14:00 à 16:00 : T2 Écrire \(statut à faire\) : 20 min faites sur 2 h \(à peine entamé\)/);
  assert.match(m, /17:00 à 18:00 : T3 Rendre .* aucun travail relevé/);
  assert.match(m, /ÉCHÉANCES DU JOUR NON TERMINÉES :\n- T3 Rendre \(jalon\), statut à faire/);
});

test('bilan : la matière de demain', async () => {
  const g = greffon({});
  g.evenementsFond = async (d) => (d === '2026-10-06' ? [{ titre: 'Cours', debut: '2026-10-06T09:00', fin: '2026-10-06T10:00' }] : []);
  g.tachesPourGantt = () => [
    { ref: 'T1', intitule: 'Lire', statut: 'en cours', avancement: 40, creneaux: ['2026-10-06 14:00-15:00'], echeance: '2026-10-06' },
    { ref: 'T2', intitule: 'Fini', statut: 'terminée', creneaux: ['2026-10-06 16:00-17:00'] },
    { ref: 'T3', intitule: 'Rendre', statut: 'à faire', jalon: true, echeance: '2026-10-09', creneaux: [] },
    { ref: 'T4', intitule: 'Loin', statut: 'à faire', echeance: '2026-11-01', creneaux: [] },
  ];
  const m = await g._matiereDemain('2026-10-05');
  assert.equal(m, [
    'ÉVÉNEMENTS :', '- 09:00 à 10:00 : Cours', '',
    'CRÉNEAUX DE TÂCHES :', '- 14:00 à 15:00 : T1 Lire (statut en cours, 40 %)', '',
    'ÉCHÉANCES :', '- T1 Lire, statut en cours', '',
    'ÉCHÉANCES DES JOURS SUIVANTS :', '- 2026-10-09 : T3 Rendre (jalon)',
  ].join('\n'));
});

test('Apple Notes : titre du bilan, script du bilan et des mots', () => {
  assert.equal(Ariane.titreBilanAppleNotes('2026-10-06'), '06-10-2026');
  const s = Ariane.genererJXABilan('Bilans du soir', '06-10-2026', 'Bonsoir Monsieur.\nLe mot <est> : Kairos & co.');
  assert.match(s, /<h1>06-10-2026<\/h1>/);
  assert.match(s, /Le mot &lt;est&gt; : Kairos &amp; co\./);
  assert.match(s, /name: "Bilans du soir"/);
  assert.doesNotThrow(() => new Function(s), 'du JavaScript valide');
  assert.doesNotThrow(() => new Function(Ariane.genererJXAMots('🖋️ Mots')));
});

test('Apple Notes : une note de mot mise en forme pour le coffre', () => {
  const m = Ariane.noteMotDepuisApple({ id: 'x-coredata://A/ICNote/p1', nom: 'Allométrie', modifie: '2026-10-01T10:00:00.000Z',
    texte: 'Allométrie\nAllométrie (n. f.) : Étude des variations relatives.\nExemple : « Une phrase. »\nÉtymologie : Du grec allos.' });
  assert.equal(m.nom, 'Allométrie');
  assert.equal(m.classe, 'n. f.');
  assert.equal(m.definition, 'Étude des variations relatives.');
  assert.match(m.contenu, /^---\nType: mot\nMot: "Allométrie"\nClasse: "n. f."\nDéfinition: "Étude des variations relatives\."\napple-notes-id: "x-coredata:\/\/A\/ICNote\/p1"/);
  assert.match(m.contenu, /\n# Allométrie\n\n\*\*Allométrie\*\* \(n\. f\.\) : Étude des variations relatives\.\n\n\*\*Exemple\*\* : « Une phrase\. »\n\n\*\*Étymologie\*\* : Du grec allos\.\n/);
  assert.equal(Ariane.noteMotDepuisApple({ nom: 'A/B: c?', texte: '' }).nom, 'A B c');
  const c = Ariane.noteMotDepuisApple({ nom: 'Contingence', texte: 'Contingence\nContingence (épistémologie) (n. f.) : Ce qui aurait pu être autrement.' });
  assert.equal(c.classe, 'n. f.');
  assert.equal(c.definition, 'Ce qui aurait pu être autrement.');
  assert.match(c.contenu, /\*\*Contingence\*\* \(épistémologie\) \(n\. f\.\) : Ce qui/);
});
