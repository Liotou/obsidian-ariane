// Barre d'état : le créneau du moment, et ce qu'il reste.
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

const cr = (d, f) => Ariane.formatCreneau(d, f);
const a = (iso) => Ariane.msDeIsoLocal(iso);

test('créneau du moment : en cours d’abord (le premier à finir), sinon le prochain du jour', () => {
  const taches = [
    { ref: 'T1', intitule: 'Lire', statut: 'à faire', creneaux: [cr('2026-10-23T10:00', '2026-10-23T12:00')] },
    { ref: 'T2', intitule: 'Écrire', statut: 'en cours', creneaux: [cr('2026-10-23T11:00', '2026-10-23T11:45'), cr('2026-10-23T16:00', '2026-10-23T17:00')] },
    { ref: 'T3', intitule: 'Fait', statut: 'terminée', creneaux: [cr('2026-10-23T11:00', '2026-10-23T11:30')] },
    { ref: 'T4', intitule: 'Demain', statut: 'à faire', creneaux: [cr('2026-10-24T09:00', '2026-10-24T10:00')] },
  ];
  const c = Ariane.creneauDuMoment(taches, a('2026-10-23T11:15'));
  assert.equal(c.tache.ref, 'T2');
  assert.equal(c.enCours, true);
  const p = Ariane.creneauDuMoment(taches, a('2026-10-23T13:00'));
  assert.deepEqual([p.tache.ref, p.enCours, p.debut], ['T2', false, '2026-10-23T16:00']);
  assert.equal(Ariane.creneauDuMoment(taches, a('2026-10-23T18:00')), null, 'demain ne s’annonce pas');
  assert.equal(Ariane.creneauDuMoment(taches, a('2026-10-23T12:00')).enCours, false, 'la fin est exclue');
});

test('avancée : passé, restant, part écoulée', () => {
  const c = { debut: '2026-10-23T11:15', fin: '2026-10-23T12:00' };
  assert.deepEqual(Ariane.avanceeCreneau(c, a('2026-10-23T11:27') + 30000), { passeMin: 12, resteMin: 33, part: 12.5 / 45 });
  assert.equal(Ariane.avanceeCreneau(c, a('2026-10-23T10:00')).passeMin, 0);
  assert.equal(Ariane.avanceeCreneau(c, a('2026-10-23T13:00')).resteMin, 0);
});
