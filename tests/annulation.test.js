const test = require('node:test');
const assert = require('node:assert');
const { _toucheAnnuler, _toucheRetablir, poserAnnulation, annulerDernier, refaireDernier }
  = require('./obsidian-factice.js')._test;

// Pile d'annulation/rétablissement partagée par la frise, l'articulation et
// le calendrier. On éprouve les helpers avec un faux moteur qui imite le
// motif des vues : une écriture via le greffon + une paire { annule, retablit }.

const touche = (o) => Object.assign(
  { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, key: '', code: '' }, o);

function fauxMoteur() {
  const moteur = {
    ecrits: [], dessins: 0,
    greffon: {
      async ecrireDatesTaches(chs) {
        moteur.ecrits.push(chs.map((c) => ({ ...c })));
        return chs;
      },
    },
    dessiner() { moteur.dessins++; },
  };
  return moteur;
}

// Reproduit le motif de appliquerGeste : le geste écrit les nouvelles dates
// et pousse une paire qui revient à `avant` / rejoue `apres`.
function gestDates(moteur, apres) {
  const avant = [{ ref: 'T1', debut: '2026-09-01', echeance: '2026-09-02' }];
  moteur.greffon.ecrireDatesTaches(apres);
  poserAnnulation(moteur, async () => {
    await moteur.greffon.ecrireDatesTaches(avant);
    moteur.dessiner();
  }, async () => {
    await moteur.greffon.ecrireDatesTaches(apres);
    moteur.dessiner();
  });
}

test('⌘/Ctrl+Z (sans Maj ni Alt) annule, pas les autres touches', () => {
  assert.equal(_toucheAnnuler(touche({ metaKey: true, key: 'z' })), true);
  assert.equal(_toucheAnnuler(touche({ ctrlKey: true, key: 'Z' })), true);
  assert.equal(_toucheAnnuler(touche({ ctrlKey: true, code: 'KeyZ' })), true);
  assert.equal(_toucheAnnuler(touche({ metaKey: true, shiftKey: true, key: 'z' })), false);
  assert.equal(_toucheAnnuler(touche({ metaKey: true, altKey: true, key: 'z' })), false);
  assert.equal(_toucheAnnuler(touche({ key: 'z' })), false);
});

test('⌘⇧Z et Ctrl+Y rétablissent, sans plus', () => {
  assert.equal(_toucheRetablir(touche({ metaKey: true, shiftKey: true, key: 'z' })), true);
  assert.equal(_toucheRetablir(touche({ ctrlKey: true, shiftKey: true, key: 'Z' })), true);
  assert.equal(_toucheRetablir(touche({ ctrlKey: true, key: 'y' })), true);
  assert.equal(_toucheRetablir(touche({ metaKey: true, code: 'KeyY' })), true);
  assert.equal(_toucheRetablir(touche({ metaKey: true, key: 'z' })), false);
  assert.equal(_toucheRetablir(touche({ shiftKey: true, key: 'z' })), false);
  assert.equal(_toucheRetablir(touche({ metaKey: true, altKey: true, shiftKey: true, key: 'z' })), false);
});

test('le geste pousse une paire, l annulation la passe au rétablissement', async () => {
  const m = fauxMoteur();
  gestDates(m, [{ ref: 'T1', debut: '2026-09-05', echeance: '2026-09-08' }]);
  assert.equal(m._undo.length, 1);
  await annulerDernier(m);
  assert.deepEqual(m.ecrits[1], [{ ref: 'T1', debut: '2026-09-01', echeance: '2026-09-02' }]);
  assert.equal(m._undo.length, 0);
  assert.equal(m._redo.length, 1);
  await refaireDernier(m);
  assert.deepEqual(m.ecrits[2], [{ ref: 'T1', debut: '2026-09-05', echeance: '2026-09-08' }]);
  assert.equal(m._undo.length, 1);
  assert.equal(m._redo.length, 0);
  assert.equal(m.dessins, 2);
});

test('annuler puis refaire deux gestes respecte l ordre A puis B', async () => {
  const m = fauxMoteur();
  gestDates(m, [{ ref: 'T1', debut: '2026-09-05', echeance: '' }]);
  gestDates(m, [{ ref: 'T1', debut: '2026-09-10', echeance: '' }]);
  await annulerDernier(m); // défait B
  await annulerDernier(m); // défait A
  assert.deepEqual(m.ecrits.at(-1), [{ ref: 'T1', debut: '2026-09-01', echeance: '2026-09-02' }]);
  await refaireDernier(m); // rejoue A
  assert.deepEqual(m.ecrits.at(-1), [{ ref: 'T1', debut: '2026-09-05', echeance: '' }]);
  await refaireDernier(m); // rejoue B
  assert.deepEqual(m.ecrits.at(-1), [{ ref: 'T1', debut: '2026-09-10', echeance: '' }]);
});

test('un geste neuf vide le rétablissement', async () => {
  const m = fauxMoteur();
  gestDates(m, [{ ref: 'T1', debut: '2026-09-05', echeance: '' }]);
  await annulerDernier(m);
  assert.equal(m._redo.length, 1);
  gestDates(m, [{ ref: 'T1', debut: '2026-09-12', echeance: '' }]);
  assert.equal(m._redo.length, 0);
  await refaireDernier(m); // rien à rétablir : aucune écriture
  assert.equal(m.ecrits.length, 3);
});

test('piles vides : aucun effet, pas de levée', async () => {
  const m = fauxMoteur();
  await annulerDernier(m);
  await refaireDernier(m);
  assert.equal(m.ecrits.length, 0);
});

test('la pile d annulation plafonne à 60', () => {
  const m = fauxMoteur();
  for (let i = 0; i < 65; i++) poserAnnulation(m, async () => {}, async () => {});
  assert.equal(m._undo.length, 60);
});
