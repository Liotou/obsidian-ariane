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

test('intention : la demande faite à la barre trouve son outil', () => {
  assert.deepEqual(A.intention('Ajoute une tâche : relire le chapitre 3 vendredi'),
    { genre: 'tache', texte: 'relire le chapitre 3 vendredi' });
  assert.equal(A.intention('rappelle-moi d’écrire à Solène lundi').genre, 'tache');
  assert.equal(A.intention('Résume ma journée').genre, 'journee');
  assert.equal(A.intention('résumé de la semaine').genre, 'semaine');
  assert.deepEqual(A.intention('Relis la sélection'), { genre: 'ecriture', action: 'relire', texte: 'Relis la sélection' });
  assert.equal(A.intention('Rends ce passage plus soutenu').action, 'soutenu');
  assert.equal(A.intention('Mets ça en tableau').action, 'tableau');
  assert.equal(A.intention('Que dit Weick sur la vigilance ?').genre, 'question');
});

test('actions : chacune a sa consigne, son icône et sa sortie', () => {
  for (const a of A.ACTIONS) {
    assert.ok(a.consigne && a.icone && a.nom, a.id);
    assert.ok(['remplacer', 'inserer'].includes(a.sortie), a.id);
  }
  assert.equal(A.action('relire').diff, true);
  assert.equal(A.action('inconnue'), null);
});
