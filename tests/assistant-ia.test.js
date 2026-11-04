// Assistant IA (section 24) : la logique pure des outils d'écriture et de la
// barre de demande.
const test = require('node:test');
const assert = require('node:assert/strict');
const Ariane = require('./obsidian-factice.js');
const A = Ariane._test.AssistantEcriture;

test('masquage : liens, citations, notes, balises et code ne passent pas par l’IA', () => {
  const t = 'Selon [[Weick 2007|Weick]] et [@weick2007], la vigilance[^3] se voit dans `code` '
    + 'et <span class="ann-s" data-id="k1"></span>ici, voir [le site](https://x.y) et $x^2$.';
  const m = A.masquer(t);
  assert.ok(!/\[\[|\[@|\[\^|<span|`|\$|\]\(/.test(m.texte), m.texte);
  assert.equal(m.jetons.length, 7);
  assert.deepEqual(A.restaurer(m.texte, m.jetons), { texte: t, manquants: [] });
});

test('restauration : une marque perdue par l’IA est signalée, une marque inventée disparaît', () => {
  const m = A.masquer('Voir [[A]] puis [[B]].');
  const r = A.restaurer('Voir ⟦1⟧ ensuite ⟦7⟧.', m.jetons);
  assert.equal(r.texte, 'Voir [[A]] ensuite .');
  assert.deepEqual(r.manquants, ['[[B]]']);
  const n = A.masquer('les signaux faibles[^2].');
  assert.equal(A.restaurer('les signaux faibles ⟦1⟧.', n.jetons).texte, 'les signaux faibles[^2].', 'la note recolle à son mot');
});

test('nettoyage : bloc de code, préambule et guillemets ôtés', () => {
  assert.equal(A.nettoyer('```markdown\nUn texte.\n```'), 'Un texte.');
  assert.equal(A.nettoyer('Voici le texte corrigé :\n\nUn texte.'), 'Un texte.');
  assert.equal(A.nettoyer('« Un texte. »'), 'Un texte.');
  assert.equal(A.nettoyer('« Un » et « deux »'), '« Un » et « deux »', 'des guillemets intérieurs restent');
});

test('différences mot à mot : ce qui part, ce qui arrive', () => {
  const d = A.differences('Les organisation cultive la vigilance.', 'Les organisations cultivent la vigilance.');
  assert.deepEqual(d.filter((x) => x.genre !== 'egal').map((x) => x.genre + ':' + x.texte.trim()),
    ['retrait:organisation', 'ajout:organisations', 'retrait:cultive', 'ajout:cultivent']);
  assert.equal(d.filter((x) => x.genre !== 'retrait').map((x) => x.texte).join(''), 'Les organisations cultivent la vigilance.');
});

test('filet de sécurité : les liens et citations perdus par une réécriture', () => {
  const avant = 'Selon [[Weick 2007|Weick]] [^3], la vigilance [@weick2007] et [[Weick 2007|Weick]].';
  assert.deepEqual(A.citationsPerdues(avant, avant), []);
  assert.deepEqual(A.citationsPerdues(avant, 'Selon Weick [^3], la vigilance et [[Weick 2007|Weick]].'),
    ['[[Weick 2007|Weick]]', '[@weick2007]']);
  assert.deepEqual(A.citationsPerdues('Un texte sans lien.', 'Un autre texte.'), []);
});

test('« Qu’en pensez-vous ? » : chaque remarque s’accroche au passage qu’elle cite', () => {
  const t = 'La vigilance collective repose sur des signaux faibles. Elle se cultive.';
  const r = A.remarques([
    { extrait: 'Elle se cultive', remarque: 'Préciser comment.' },
    { extrait: 'signaux faibles', remarque: 'Définir.' },
    { extrait: 'introuvable ici', remarque: 'Remarque générale.' },
    { extrait: 'faibles', remarque: 'Chevauche : écartée.' },
    { extrait: 'La vigilance', remarque: '' },
  ], t);
  // Dans l'ordre du texte ; la remarque générale (tout le texte) et celle qui
  // chevauche sont écartées, comme celle qui est vide.
  assert.deepEqual(r.map((x) => t.slice(x.from, x.to) + ' / ' + x.remarque),
    ['signaux faibles / Définir.', 'Elle se cultive / Préciser comment.']);
  assert.deepEqual(A.remarques([{ extrait: 'absent', remarque: 'Seule.' }], t), [{ from: 0, to: t.length, remarque: 'Seule.' }]);
  assert.deepEqual(A.remarques({ remarques: [{ extrait: 'Elle', remarque: 'x' }] }, t).length, 1);
});

test('actions : chacune a sa consigne, son icône et sa sortie', () => {
  for (const a of A.ACTIONS) {
    assert.ok(a.consigne && a.icone && a.nom, a.id);
    assert.ok(['remplacer', 'inserer', 'commenter'].includes(a.sortie), a.id);
  }
  assert.equal(A.action('relire').diff, true);
  assert.equal(A.action('inconnue'), null);
});

test('Halo de l\'IA : autour de la fenêtre modale du dessus, sinon du volet actif', () => {
  const vue = { id: 'volet' };
  const feuille = { view: { containerEl: vue } };
  const doc = (n) => ({ querySelectorAll: () => Array.from({ length: n }, (_, i) => ({ id: 'modale' + i })) });
  assert.equal(Ariane.cibleHaloIA(doc(2), feuille).id, 'modale1');
  assert.equal(Ariane.cibleHaloIA(doc(0), feuille), vue);
  assert.equal(Ariane.cibleHaloIA(doc(0), null), null);
});
