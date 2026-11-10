// Le démarrage réel d'Ariane, module par module : un module coupé
// n'enregistre rien (commandes, vues, ruban, écoutes, extensions…).
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { MODULES_ARIANE, PROFILS_ARIANE } = Ariane._test;

const { demarrer } = require('./demarrage-factice.js');

test('démarrage : chaque module coupé retire ses enregistrements, et rien d’autre', async () => {
  const tout = await demarrer(PROFILS_ARIANE.tout);
  assert.ok(tout.filter((x) => x.startsWith('commande')).length >= 78, 'commandes : ' + tout.length);
  for (const m of MODULES_ARIANE) {
    if (m.coeur) continue;
    const coupes = [m.id].concat(Ariane.modulesDependants(m.id, PROFILS_ARIANE.tout));
    const sans = await demarrer(PROFILS_ARIANE.tout.filter((id) => !coupes.includes(id)));
    assert.ok(sans.length < tout.length, m.id + ' coupé : rien de moins (' + sans.length + ')');
    // Ce qui reste est un sous-ensemble de ce qu'enregistre le profil « Tout ».
    const reste = tout.slice();
    for (const x of sans) {
      const i = reste.indexOf(x);
      assert.ok(i >= 0, m.id + ' coupé : enregistrement inattendu ' + x);
      reste.splice(i, 1);
    }
  }
});

test('démarrage : le cœur seul n’enregistre ni tâches, ni temps, ni suggestions', async () => {
  const coeur = await demarrer(['annotations', 'citations']);
  for (const interdit of ['vue zfa-suggestions', 'ruban history', 'ruban sparkles', 'bloc ariane-organisation',
    'commande creer-tache', 'commande rappels-pousser', 'commande ouvrir-chronologie', 'composant IntegrationCanevas',
    'composant BarreEdition', 'composant PontClaude', 'composant CorrecteurApple']) {
    assert.ok(!coeur.includes(interdit), 'présent avec le cœur seul : ' + interdit);
  }
  assert.ok(coeur.includes('commande atomise-tout'));
  assert.ok(coeur.includes('commande citations-basculer'));
});
