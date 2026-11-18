// Événements de l'agenda associés à une tâche : identité (une série partage
// l'identifiant), forme lisible, échéance au dernier événement, et
// réalignement quand l'agenda est relu (déplacé, renommé, introuvable).
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const ev = (id, debut, titre, allDay) => ({ id, debut, fin: '', titre, allDay: !!allDay });

test('clé : identifiant et instant ; un jour entier garde le seul jour ; un id à « | » se relit', () => {
  assert.equal(Ariane.cleEvenementTache(ev('A1', '2026-11-20T10:00', 'Réunion')), 'A1|2026-11-20T10:00');
  assert.equal(Ariane.cleEvenementTache(ev('A2', '2026-11-21', 'Colloque', true)), 'A2|2026-11-21');
  assert.equal(Ariane.cleEvenementTache(ev('', '2026-11-20T10:00', 'x')), '');
  assert.deepEqual(Ariane.lireCleEvenement('ics:uid|2026-11-20T10:00|2026-11-20T10:00'),
    { id: 'ics:uid|2026-11-20T10:00', quand: '2026-11-20T10:00' });
  assert.equal(Ariane.lireCleEvenement('n’importe quoi'), null);
});

test('forme lisible, et titre retrouvé sans la date ni la marque « introuvable »', () => {
  const l = Ariane.libelleEvenementTache('2026-11-20T10:00', 'Réunion WP1', true);
  assert.equal(l, '2026-11-20 10:00 Réunion WP1 (introuvable)');
  assert.equal(Ariane.titreDuLibelleEvenement(l), 'Réunion WP1');
  assert.equal(Ariane.titreDuLibelleEvenement('2026-11-21 Colloque'), 'Colloque');
});

test('échéance : le dernier événement, avec son heure de début (aucune pour un jour entier)', () => {
  assert.deepEqual(Ariane.echeanceDesEvenements(['A|2026-11-20T10:00', 'B|2026-12-02T14:30', 'C|2026-11-25']),
    { echeance: '2026-12-02', heure: '14:30' });
  assert.deepEqual(Ariane.echeanceDesEvenements(['C|2026-11-25']), { echeance: '2026-11-25', heure: '' });
  assert.equal(Ariane.echeanceDesEvenements([]), null);
});

test('série récurrente : la séance associée est celle du même jour, pas toute la série', () => {
  const serie = [ev('S', '2026-11-13T09:00', 'Cours'), ev('S', '2026-11-20T09:00', 'Cours'), ev('S', '2026-11-27T09:00', 'Cours')];
  assert.equal(Ariane.evenementDeCle('S|2026-11-20T09:00', serie), serie[1]);
  // L'heure de la séance a changé : même jour, retrouvée.
  const deplacee = [serie[0], ev('S', '2026-11-20T11:00', 'Cours'), serie[2]];
  assert.equal(Ariane.evenementDeCle('S|2026-11-20T09:00', deplacee), deplacee[1]);
  // La séance a disparu de la série : introuvable, pas confondue avec une autre.
  assert.equal(Ariane.evenementDeCle('S|2026-11-20T09:00', [serie[0], serie[2]]), null);
  // Un événement unique changé de jour : suivi.
  assert.equal(Ariane.evenementDeCle('U|2026-11-20T09:00', [ev('U', '2026-11-24T09:00', 'Point')]).debut, '2026-11-24T09:00');
});

test('réalignement : déplacé et renommé suivis, introuvable marqué, hors fenêtre intact', () => {
  const cles = ['A|2026-11-20T10:00', 'B|2026-11-22T09:00', 'C|2027-03-01'];
  const libs = ['2026-11-20 10:00 Réunion', '2026-11-22 09:00 Séminaire', '2027-03-01 Soutenance'];
  const lus = [ev('A', '2026-11-21T15:00', 'Réunion WP1')];
  const r = Ariane.reconcilierEvenementsTache(cles, libs, lus, { debut: '2026-11-01', fin: '2026-12-31' });
  assert.deepEqual(r.cles, ['A|2026-11-21T15:00', 'B|2026-11-22T09:00', 'C|2027-03-01']);
  assert.deepEqual(r.libelles, ['2026-11-21 15:00 Réunion WP1', '2026-11-22 09:00 Séminaire (introuvable)',
    '2027-03-01 Soutenance']);
  assert.equal(r.change, true);
  assert.equal(r.quandChange, true);
  // Relu tel quel une seconde fois : rien ne change.
  const r2 = Ariane.reconcilierEvenementsTache(r.cles, r.libelles, lus, { debut: '2026-11-01', fin: '2026-12-31' });
  assert.equal(r2.change, false);
  // L'événement revient : la marque tombe, sans que l'échéance ait à bouger.
  const r3 = Ariane.reconcilierEvenementsTache(r.cles, r.libelles, lus.concat([ev('B', '2026-11-22T09:00', 'Séminaire')]),
    { debut: '2026-11-01', fin: '2026-12-31' });
  assert.equal(r3.libelles[1], '2026-11-22 09:00 Séminaire');
  assert.equal(r3.quandChange, false);
});

// Un greffon réduit : des tâches en mémoire, et majTache qui les modifie.
function greffonFactice(taches) {
  const g = Object.create(Ariane.prototype);
  g.ecrits = [];
  g.tachesPourGantt = () => taches;
  g.majTache = async (ref, champs) => {
    g.ecrits.push({ ref, champs });
    const t = taches.find((x) => x.ref === ref);
    if (champs['evenements-id']) t.evenementsId = champs['evenements-id'];
    if (champs.evenements) t.evenements = champs.evenements;
    if (champs.echeance) t.echeance = champs.echeance;
    return true;
  };
  return g;
}

test('associer : l’échéance suit le dernier événement ; dissocier la recalcule ; le dernier retiré la laisse', async () => {
  const t = { ref: 'T090', intitule: 'Préparer le cours', statut: 'à faire', evenementsId: [], evenements: [] };
  const g = greffonFactice([t]);
  await g.associerEvenementTache('T090', ev('B', '2026-12-02T14:30', 'Cours 2'));
  await g.associerEvenementTache('T090', ev('A', '2026-11-20T10:00', 'Cours 1'));
  assert.deepEqual(t.evenementsId, ['A|2026-11-20T10:00', 'B|2026-12-02T14:30']);
  assert.deepEqual(t.evenements, ['2026-11-20 10:00 Cours 1', '2026-12-02 14:30 Cours 2']);
  const dernier = g.ecrits[g.ecrits.length - 1].champs;
  assert.equal(dernier.echeance, '2026-12-02');
  assert.equal(dernier.heure, '14:30');
  assert.equal(dernier['sans-echeance'], false);
  // Déjà associé : rien n'est écrit.
  const n = g.ecrits.length;
  assert.equal(await g.associerEvenementTache('T090', ev('A', '2026-11-20T10:00', 'Cours 1')), false);
  assert.equal(g.ecrits.length, n);
  // Retirer le dernier : l'échéance revient au précédent.
  await g.dissocierEvenementTache('T090', 'B|2026-12-02T14:30');
  assert.equal(g.ecrits[g.ecrits.length - 1].champs.echeance, '2026-11-20');
  // Retirer le seul qui reste : la liste se vide, l'échéance ne bouge pas.
  await g.dissocierEvenementTache('T090', 'A|2026-11-20T10:00');
  const fin = g.ecrits[g.ecrits.length - 1].champs;
  assert.deepEqual(fin['evenements-id'], []);
  assert.equal('echeance' in fin, false);
});

test('tâches d’un événement : même identifiant et même jour seulement', () => {
  const t1 = { ref: 'T1', evenementsId: ['S|2026-11-20T09:00'], evenements: [] };
  const t2 = { ref: 'T2', evenementsId: ['S|2026-11-27T09:00'], evenements: [] };
  const g = greffonFactice([t1, t2]);
  assert.deepEqual(g.tachesDeEvenement(ev('S', '2026-11-20T09:00', 'Cours')).map((x) => x.tache.ref), ['T1']);
  assert.deepEqual(g.tachesDeEvenement(ev('S', '2026-11-27T10:00', 'Cours')).map((x) => x.tache.ref), ['T2']);
  assert.deepEqual(g.tachesDeEvenement(ev('X', '2026-11-20T09:00', 'Autre')), []);
});

test('réalignement des tâches : une lecture vide ne marque rien introuvable ; l’échéance suit un déplacement', async () => {
  const t = { ref: 'T3', evenementsId: ['A|2026-11-20T10:00'], evenements: ['2026-11-20 10:00 Réunion'] };
  const g = greffonFactice([t]);
  assert.equal(await g.reconcilierEvenementsTaches([], { debut: '2026-11-01', fin: '2026-11-30' }), 0);
  assert.equal(g.ecrits.length, 0);
  await g.reconcilierEvenementsTaches([ev('A', '2026-11-24T16:00', 'Réunion'), ev('Z', '2026-11-02T08:00', 'Autre')],
    { debut: '2026-11-01', fin: '2026-11-30' });
  assert.equal(g.ecrits.length, 1);
  assert.equal(g.ecrits[0].champs.echeance, '2026-11-24');
  assert.equal(g.ecrits[0].champs.heure, '16:00');
});
