// Ariane sous Windows : le démarrage complet ne casse pas, et chaque
// fonction propre au Mac a son intermédiaire (un réglage venu d'un Mac,
// dans un coffre partagé, ne laisse rien échouer en silence).
global.__arianePlateforme = { isMacOS: false, isWin: true, isDesktopApp: true };
const plateformeReelle = Object.getOwnPropertyDescriptor(process, 'platform');
Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { PROFILS_ARIANE, MoteurAppleIA, CorrecteurApple, touchesSysteme } = Ariane._test;
const { demarrer } = require('./demarrage-factice.js');

test.after(() => Object.defineProperty(process, 'platform', plateformeReelle));

test('Windows : le démarrage avec tous les modules aboutit, sans le correcteur Apple', async () => {
  const tout = await demarrer(PROFILS_ARIANE.tout);
  assert.ok(tout.filter((x) => x.startsWith('commande')).length >= 70, 'commandes : ' + tout.length);
  assert.ok(!tout.includes('composant CorrecteurApple'), 'le correcteur Apple ne démarre pas hors du Mac');
  assert.equal(MoteurAppleIA.disponible(), false);
  assert.equal(CorrecteurApple.disponible ? CorrecteurApple.disponible() : false, false);
});

test('Windows : un fournisseur d’IA « Apple » passe à Mistral, Claude ou Ollama', () => {
  assert.equal(Ariane.fournisseurSurCeSysteme('apple', { refsCleMistral: 'k' }, false, true), 'mistral');
  assert.equal(Ariane.fournisseurSurCeSysteme('apple', {}, false, true), 'claude');
  assert.equal(Ariane.fournisseurSurCeSysteme('apple', {}, false, false), 'ollama');
  assert.equal(Ariane.fournisseurSurCeSysteme('claude', {}, false, false), 'claude');
  assert.equal(Ariane.fournisseurSurCeSysteme('apple', {}, true, false), 'apple', 'sur Mac, rien ne change');
  const g = Object.create(Ariane.prototype);
  g.settings = { refsFournisseur: 'apple', assistantFournisseur: 'apple', refsCleMistral: 'k' };
  assert.equal(g.fournisseurAssistant(), 'mistral');
});

test('Windows : Apple Calendrier et Apple Rappels laissent la place à Google', () => {
  const g = Object.create(Ariane.prototype);
  g.settings = { agendaSource: 'apple', rappelsDestination: 'apple' };
  assert.equal(g.sourceAgenda(), 'google');
  assert.equal(g.destinationRappels(), 'google');
  g.settings = { agendaSource: 'google-sync', rappelsDestination: 'microsoft' };
  assert.equal(g.sourceAgenda(), 'google-sync');
  assert.equal(g.destinationRappels(), 'microsoft');
});

test('Windows : les touches se disent Ctrl, Alt, Maj', () => {
  assert.equal(touchesSysteme('Un ⌘Z les annule.'), 'Un Ctrl Z les annule.');
  assert.match(touchesSysteme('↵ avec l’IA, ⇧↵ telle quelle'), /^↵ avec l’IA, (Maj|Shift) ↵ telle quelle$/);
  assert.equal(touchesSysteme('⌘↵'), 'Ctrl ↵');
  assert.equal(touchesSysteme('⌘↵', true), '⌘↵');
});
