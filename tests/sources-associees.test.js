const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');
const { construireNote } = Ariane._test;

const INDEX = [
  { basename: '@ackoffIdealizedDesignCreating2006', citkey: 'ackoffIdealizedDesignCreating2006',
    premier: 'ackoff', annee: '2006', titre: "Idealized design: creating an organization's future" },
  { basename: '@adnerEcosystemStructureActionable2017', citkey: 'adnerEcosystemStructureActionable2017',
    premier: 'adner', annee: '2017', titre: 'Ecosystem as Structure: An Actionable Construct for Strategy' },
  { basename: '@beckRiskSociety1992', citkey: 'beckRiskSociety1992',
    premier: 'beck', annee: '1992', titre: 'Risk society' },
];

test('mentionsDeSources : titre, titre court, auteur et année, clé de citation', () => {
  const m = (t, ex) => Ariane.mentionsDeSources(t, INDEX, ex).map((x) => [x.basename, x.raison]);
  assert.deepEqual(m('Cela rejoint Idealized design, qui pose l’idéal en premier.'), []); // deux mots : trop court
  assert.deepEqual(m('Rappelle « Idealized design : creating an organization’s future ».'),
    [['@ackoffIdealizedDesignCreating2006', 'titre']]);
  assert.deepEqual(m('À relier à Ecosystem as structure, et à la notion d’alignement.'),
    [['@adnerEcosystemStructureActionable2017', 'titre']]);
  assert.deepEqual(m('Comme chez Ackoff et al. (2006), l’idéal précède.'),
    [['@ackoffIdealizedDesignCreating2006', 'auteur']]);
  assert.deepEqual(m('Voir @beckRiskSociety1992 sur ce point.'), [['@beckRiskSociety1992', 'clé']]);
  // La source elle-même, ou une référence déjà citée, n'est pas proposée.
  assert.deepEqual(m('Ackoff (2006) encore.', new Set(['@ackoffIdealizedDesignCreating2006'])), []);
  // Un titre de deux mots se confond avec le texte : seul l'auteur le trouve.
  assert.deepEqual(m('La risk society est un thème.'), []);
  assert.deepEqual(m('La société du risque, Beck 1992.'), [['@beckRiskSociety1992', 'auteur']]);
});

test('texteMentionsAnnotation : ni entête, ni passage cité, ni lignes de liens', () => {
  const contenu = '---\nzotflow-anno-key: K1\n---\n**[Mon titre](obsidian://zotflow?x=1)**\n\nMon commentaire, cf. Ackoff 2006.\n\n'
    + '> [!quote]\n> Texte de Adner 2017 surligné.\n\nSource : [[@x#^K1]]\n\nRéférences citées : [[@beckRiskSociety1992]]\n\nVoir aussi : [[@y]]';
  const t = Ariane.texteMentionsAnnotation(contenu, { labelReferences: 'Références citées : ', labelVoirAussi: 'Voir aussi : ' });
  assert.match(t, /Mon titre/);
  assert.match(t, /Ackoff 2006/);
  assert.doesNotMatch(t, /Adner|obsidian:|beckRisk|zotflow-anno-key|@y/);
});

test('regrouperParSource : meilleure annotation par source, hors exclusions', () => {
  const infos = new Map([
    ['a1', { source: '@A', titre: 'a un' }], ['a2', { source: '@A', titre: 'a deux' }],
    ['b1', { source: '@B', titre: 'b un' }], ['c1', { source: '@C', titre: 'c un' }],
  ]);
  const r = Ariane.regrouperParSource(
    [{ path: 'a1', score: 0.4 }, { path: 'a2', score: 0.6 }, { path: 'b1', score: 0.7 }, { path: 'c1', score: 0.9 }],
    infos, new Set(['@C']), 5);
  assert.deepEqual(r.map((g) => [g.basename, g.n, g.meilleure.titre]), [['@B', 1, 'b un'], ['@A', 2, 'a deux']]);
});

test('modifierAssociation et renommerAssociations', () => {
  const t = {};
  assert.equal(Ariane.modifierAssociation(t, 'K', '@A', 'associer'), true);
  assert.equal(Ariane.modifierAssociation(t, 'K', '@A', 'associer'), false);
  Ariane.modifierAssociation(t, 'K', '@B', 'ecarter');
  assert.deepEqual(t.K, { sources: ['@A'], refus: ['@B'] });
  Ariane.modifierAssociation(t, 'K', '@B', 'associer'); // un refus levé par un accord
  assert.deepEqual(t.K, { sources: ['@A', '@B'], refus: [] });
  assert.equal(Ariane.renommerAssociations(t, '@A', '@A2'), true);
  assert.deepEqual(t.K.sources, ['@A2', '@B']);
  Ariane.modifierAssociation(t, 'K', '@A2', 'dissocier');
  Ariane.modifierAssociation(t, 'K', '@B', 'dissocier');
  assert.equal(t.K, undefined); // entrée vide retirée
});

test('construireNote : propriété « sources-associées » et ligne « Voir aussi »', () => {
  const cfg = {
    modeleNote: '**{{title}}**\n\n{{paraphrase}}\n\nSource : {{source}}\n\n{{references}}',
    labelReferences: 'Références citées : ', labelVoirAussi: 'Voir aussi : ', labelPage: 'p. ',
    aliasTemplate: '{{title}}', referenceParDefautSource: true, rattachementZotero: false,
    correspondancesSuffixe: {},
  };
  const bloc = { cle: 'K1', titre: 'Titre', paraphrase: 'Commentaire', refs: [], ordre: 1 };
  const sans = construireNote(bloc, '@src', [], cfg, {});
  assert.doesNotMatch(sans, /sources-associées|Voir aussi/);
  const assoc = { K1: { sources: ['@A', '@src', '@B'], refus: ['@C'] } };
  const avec = construireNote(bloc, '@src', [], cfg, { associations: assoc });
  assert.match(avec, /sources-associées:\n {2}- "\[\[@A\]\]"\n {2}- "\[\[@B\]\]"/);
  assert.match(avec, /\n\nVoir aussi : \[\[@A\]\] ; \[\[@B\]\]\n$/);
  // Un modèle qui place {{seeAlso}} le reçoit à sa place, une seule fois.
  const place = construireNote(bloc, '@src', [], Object.assign({}, cfg, { modeleNote: '{{seeAlso}}\n\n{{title}}' }), { associations: assoc });
  assert.equal(place.split('Voir aussi').length, 2);
  assert.match(place, /---\nVoir aussi/);
});
