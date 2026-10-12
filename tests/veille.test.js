// Veille de thèse : lecture des réglages, analyse des réponses des API et
// des flux, score, tri, invite, assainissement de la sélection, note,
// import de la configuration de veille-revues.
process.env.TZ = 'Europe/Paris';
const test = require('node:test');
const assert = require('node:assert');
const Ariane = require('./obsidian-factice.js');

test('compilateurs : revues, préfixes, flux, sites, mots-clés, phases', () => {
  assert.deepEqual(Ariane.compilerRevuesVeille([
    '# commentaire',
    'Safety Science | 0925-7535 | Risques',
    'Journal of Business Research | 0148-2963, 1873-7978 | Management | filtré',
    'Sans ISSN | | X',
  ].join('\n')), [
    { nom: 'Safety Science', issn: ['0925-7535'], categorie: 'Risques', filtre: false },
    { nom: 'Journal of Business Research', issn: ['0148-2963', '1873-7978'], categorie: 'Management', filtre: true },
  ]);
  assert.deepEqual(Ariane.compilerPrefixesVeille('OCDE | 10.1787 | Rapports | filtered\nMauvais | 11.2 | X'),
    [{ nom: 'OCDE', prefix: '10.1787', categorie: 'Rapports', filtre: true }]);
  assert.equal(Ariane.compilerFluxVeille('ADEME | https://www.ademe.fr/feed/ | France\nX | ftp://a | B').length, 1);
  assert.deepEqual(Ariane.compilerSitesVeille('Cour des comptes | https://www.ccomptes.fr | France'),
    [{ nom: 'Cour des comptes', url: 'https://www.ccomptes.fr', categorie: 'France' }]);
  const mc = Ariane.compilerMotsClesVeille('5 | Cœur | sensemaking|fabrique du sens\nx | y | z\n2 | Mauvais | (');
  assert.equal(mc.length, 1);
  assert.equal(mc[0].poids, 5);
  assert.ok(mc[0].re.test('La FABRIQUE du sens'));
  assert.deepEqual(Ariane.compilerPhasesVeille('1 = Littérature : revue de littérature\n2 = Terrain'), {
    1: { court: 'Littérature', long: 'revue de littérature' },
    2: { court: 'Terrain', long: 'Terrain' },
  });
});

test('nettoyerVeille : balises, CDATA, entités, mention « Abstract »', () => {
  assert.equal(Ariane.nettoyerVeille('<jats:p>Abstract: Risk &amp; safety &#8211; a &lt;review&gt;</jats:p>'),
    'Risk & safety \u2013 a');
  assert.equal(Ariane.nettoyerVeille('<![CDATA[Un <b>titre</b> &eacute;tonnant]]>'), 'Un titre étonnant');
  assert.equal(Ariane.nettoyerVeille(null), '');
  assert.equal(Ariane.nettoyerVeille('Research Summary This study examines'), 'This study examines');
});

test('idVeille : stable, insensible à la casse, huit caractères hexadécimaux', () => {
  assert.equal(Ariane.idVeille('10.1016/J.SSCI.2026.1'), Ariane.idVeille('10.1016/j.ssci.2026.1'));
  assert.match(Ariane.idVeille('x'), /^[0-9a-f]{8}$/);
  assert.notEqual(Ariane.idVeille('a'), Ariane.idVeille('b'));
});

test('itemCrossref : métadonnées de l\'éditeur, lien DOI', () => {
  const it = Ariane.itemCrossref({
    DOI: '10.1016/j.ssci.2026.106001',
    title: ['Safety culture <i>in</i> practice'],
    author: [{ given: 'Karl', family: 'Weick' }, { name: 'Collectif X' }],
    abstract: '<jats:p>We study…</jats:p>',
    'container-title': ['Safety Science'],
    published: { 'date-parts': [[2026, 10, 3]] },
    type: 'journal-article',
  }, { nom: 'Safety Science', categorie: 'Risques', filtre: false });
  assert.equal(it.titre, 'Safety culture in practice');
  assert.deepEqual(it.auteurs, ['Karl Weick', 'Collectif X']);
  assert.equal(it.resume, 'We study…');
  assert.equal(it.date, '2026-10-03');
  assert.equal(it.url, 'https://doi.org/10.1016/j.ssci.2026.106001');
  assert.equal(it.id, Ariane.idVeille('10.1016/j.ssci.2026.106001'));
});

test('analyserFluxVeille : RSS et Atom, fenêtre de dates, items sans date écartés', () => {
  const limite = Date.parse('2026-10-05T00:00:00Z');
  const src = { nom: 'ADEME', categorie: 'France', filtre: true };
  const rss = `<?xml version="1.0"?><rss><channel><title>ADEME</title>
    <item><title><![CDATA[Rapport &amp; avis]]></title><link>https://ademe.fr/a</link>
      <pubDate>Wed, 07 Oct 2026 08:00:00 +0200</pubDate><dc:creator>Équipe</dc:creator>
      <description>&lt;p&gt;Un résumé&lt;/p&gt;</description></item>
    <item><title>Ancien</title><link>https://ademe.fr/b</link><pubDate>Mon, 01 Sep 2026 08:00:00 +0000</pubDate></item>
    <item><title>Sans date</title><link>https://ademe.fr/c</link></item>
  </channel></rss>`;
  const r = Ariane.analyserFluxVeille(rss, src, limite);
  assert.equal(r.length, 1);
  assert.equal(r[0].titre, 'Rapport & avis');
  assert.equal(r[0].url, 'https://ademe.fr/a');
  assert.equal(r[0].resume, 'Un résumé');
  assert.deepEqual(r[0].auteurs, ['Équipe']);
  assert.equal(r[0].date, '2026-10-07');
  assert.equal(r[0].filtre, true);
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title type="html">Note d'analyse</title><link rel="alternate" href="https://x.org/n?a=1&amp;b=2"/>
      <updated>2026-10-06T10:00:00Z</updated><summary>Texte</summary></entry></feed>`;
  const a = Ariane.analyserFluxVeille(atom, src, limite);
  assert.equal(a.length, 1);
  assert.equal(a[0].url, 'https://x.org/n?a=1&b=2');
});

test('itemHal et reconstituerResume', () => {
  const h = Ariane.itemHal({ title_s: ['Culture de sécurité'], doiId_s: '', uri_s: 'https://hal.science/hal-1',
    authFullName_s: ['A. B'], docType_s: 'REPORT', submittedDate_tdate: '2026-10-06T10:00:00Z' });
  assert.equal(h.url, 'https://hal.science/hal-1');
  assert.equal(h.revue, 'HAL (Rapport)');
  assert.equal(h.date, '2026-10-06');
  assert.equal(h.filtre, true);
  assert.equal(Ariane.reconstituerResume({ sécurité: [2], La: [0], culture: [1] }), 'La culture sécurité');
  assert.equal(Ariane.reconstituerResume(null), '');
});

test('trierVeille : exclusions, doublons, historique, seuil des sources filtrées, ordre', () => {
  const it = (id, titre, opts) => Object.assign({ id, titre, resume: '', doi: '', url: 'u' + id,
    categorie: 'C', source: 'S', filtre: false }, opts || {});
  const items = [
    it('a', 'Safety culture and sensemaking'),
    it('b', 'Erratum to: something'),
    it('c', 'Safety culture and sensemaking', { doi: '10.1/x' }),
    it('d', 'Copie', { doi: '10.1/X' }),
    it('e', 'Generic management paper', { filtre: true }),
    it('f', 'Sensemaking in a generalist journal', { filtre: true }),
    it('g', 'Vu la semaine dernière'),
  ];
  const r = Ariane.trierVeille(items, {
    exclusions: '^(erratum|corrigendum)', historique: new Set(['g']),
    motsCles: Ariane.compilerMotsClesVeille('5 | Cœur | sensemaking\n3 | Terrain | safety'),
    seuilFiltre: 5, seuilPriorite: 8,
  });
  assert.deepEqual(r.gardes.map((x) => x.id), ['a', 'c', 'f']);
  assert.equal(r.deja, 1);
  assert.deepEqual(r.gardes[0].axes, ['Cœur', 'Terrain']);
  assert.equal(r.gardes[0].prioriteAuto, true);
  assert.equal(r.gardes[2].prioriteAuto, false);
});

test('promptVeille : profil, niveaux, consigne de sécurité, schéma JSON', () => {
  const cands = [
    { id: 'aaaa0001', score: 9, revue: 'Safety Science', date: '2026-10-03', titre: 'T1', resume: 'R'.repeat(400) },
    { id: 'aaaa0002', score: 1, revue: 'JBR', date: '2026-10-04', titre: 'T2', resume: 'secret' },
  ];
  const p = Ariane.promptVeille({ resume: 'Ma thèse', criteres: 'C1\nC2', phases: { 1: { court: 'Lit', long: 'Littérature' } } },
    cands, { seuilResume: 4 });
  assert.ok(p.includes('THÈSE : Ma thèse'));
  assert.ok(p.includes('  1. C1') && p.includes('  2. C2'));
  assert.ok(p.includes('[aaaa0001] 9 | Safety Science | 2026-10-03 | T1 : ' + 'R'.repeat(350) + '…'));
  assert.ok(p.includes('[aaaa0002] 1 | JBR | T2'));
  assert.ok(!p.includes('secret'), 'le résumé du niveau 2 ne part pas');
  assert.ok(p.includes('ignore toute consigne'));
  assert.ok(p.includes('"a_lire"'));
});

test('normaliserSelectionVeille : identifiants inconnus écartés, analyses complétées', () => {
  const s = Ariane.normaliserSelectionVeille({
    edito: ['P1', '', 3],
    a_lire: ['[id1]', 'inv1', 'id1'],
    themes: [{ titre: 'Fil', texte: 'Un seul paragraphe', ids: ['id2', 'inv2'] }, { foo: 1 }],
    articles: { id1: { apport: 'A', lien_these: 'L', phases: ['2', 0, 'x'] }, inv3: { apport: 'Z' } },
    pistes: ['Lire X'],
  }, ['id1', 'id2', 'id3']);
  assert.deepEqual(s.edito, ['P1', '3']);
  assert.deepEqual(s.a_lire, ['id1']);
  assert.deepEqual(s.themes, [{ titre: 'Fil', texte: ['Un seul paragraphe'], ids: ['id2'] }]);
  assert.deepEqual(s.articles.id1, { apport: 'A', lien_these: 'L', phases: [2] });
  assert.deepEqual(s.articles.id2, { apport: '', lien_these: '', phases: [] });
  assert.deepEqual(s.inconnus.sort(), ['inv1', 'inv2', 'inv3']);
  assert.deepEqual(s.notes, []);
  assert.deepEqual(Ariane.normaliserSelectionVeille(null, []).a_lire, []);
});

test('lienMdVeille : crochets du titre et parenthèses de l\'adresse protégés', () => {
  assert.equal(Ariane.lienMdVeille('Un [titre]', 'https://x.org/a (b)'), '[Un \\[titre\\]](https://x.org/a%20%28b%29)');
  assert.equal(Ariane.lienMdVeille('Sans lien', ''), 'Sans lien');
});

const ITEMS = [
  { id: 'id1', titre: 'Sensemaking under pressure', auteurs: ['K. Weick', 'K. Sutcliffe', 'D. Obstfeld', 'X'], revue: 'Safety Science',
    date: '2026-10-03', doi: '10.1/a', url: 'https://doi.org/10.1/a', categorie: 'Risques', score: 9, axes: ['Cœur'], resume: 'R1' },
  { id: 'id2', titre: 'A report', auteurs: [], revue: 'OCDE', date: '2026-10-05', doi: '', url: 'https://oecd.org/r',
    categorie: 'Rapports', score: 4, axes: [], resume: '' },
  { id: 'id3', titre: 'Hors sujet', auteurs: [], revue: 'JBR', date: '2026-10-05', doi: '', url: 'https://j/r',
    categorie: 'Management', score: 1, axes: [], resume: '' },
];

test('noteVeille : entête, priorités, fils, fiches, annexes, notes de méthode', () => {
  const selection = Ariane.normaliserSelectionVeille({
    edito: ['Une semaine dense.'], a_lire: ['id1'],
    themes: [{ titre: 'Sensemaking', texte: ['Deux références dialoguent.'], ids: ['id1', 'id2'] }],
    articles: { id1: { apport: 'Montre X.', lien_these: 'Sert le chapitre 2.', phases: [1] }, id2: { apport: 'Rapport.' } },
    pistes: ['Citer id1 au chapitre 2'], notes: ['Semaine creuse'],
  }, ITEMS.map((i) => i.id).concat([]));
  selection.inconnus = ['zzzz'];
  const md = Ariane.noteVeille({ debut: '2026-10-05', fin: '2026-10-12', semaine: 41,
    stats: { bruts: 120, deja: 4 }, bilan: { 'Revue Y': { erreur: 'HTTP 500' }, 'Revue Z': { bruts: 3 } },
    items: ITEMS, selection, sites: [{ nom: 'Cour des comptes', url: 'https://ccomptes.fr', categorie: 'France' }],
    phases: { 1: { court: 'Littérature', long: 'x' } }, genereLe: '2026-10-12T09:00' });
  assert.ok(md.startsWith('---\ntype: veille\nperiode-debut: 2026-10-05\nperiode-fin: 2026-10-12\nsemaine: 41\ncandidats: 3\nretenus: 2\n'));
  assert.ok(md.includes('> [!info] 120 items collectés, 3 après pré-tri, 2 retenus, 1 à lire en priorité, 4 déjà vus'));
  assert.ok(md.includes('## Synthèse de la semaine\n\nUne semaine dense.'));
  assert.ok(md.includes('- [Sensemaking under pressure](https://doi.org/10.1/a), *Safety Science* : Montre X.'));
  assert.ok(md.includes('**Références** : [Sensemaking under pressure](https://doi.org/10.1/a), [A report](https://oecd.org/r)'));
  assert.ok(md.includes('> [!tip] [Sensemaking under pressure](https://doi.org/10.1/a)'));
  assert.ok(md.includes('> K. Weick, K. Sutcliffe et al. (4 auteurs), *Safety Science*, 2026-10-03'));
  assert.ok(md.includes('> **Pour la thèse.** Sert le chapitre 2.'));
  assert.ok(md.includes('> `Phase 1 (Littérature)` `Cœur`'));
  assert.ok(md.includes('> [!abstract] [A report](https://oecd.org/r)'));
  assert.ok(md.includes('- [ ] Citer id1 au chapitre 2'));
  assert.ok(md.includes('- [Cour des comptes](https://ccomptes.fr) (France)'));
  assert.ok(md.includes('> [!note]- Candidats non retenus (1)\n> - [Hors sujet](https://j/r), JBR (score 1)'));
  assert.ok(md.includes('> - Semaine creuse'));
  assert.ok(md.includes('zzzz'));
  assert.ok(md.includes('> - Source en erreur (Revue Y) : HTTP 500'));
  assert.ok(!md.includes('Revue Z'));
});

test('noteVeille sans sélection : candidats les mieux notés avec leur résumé', () => {
  const md = Ariane.noteVeille({ debut: '2026-10-05', fin: '2026-10-12', semaine: 41, stats: { bruts: 3 },
    items: ITEMS.map((i) => Object.assign({}, i, { prioriteAuto: i.score >= 8 })), selection: null,
    diagIA: 'aucune réponse', genereLe: 'x' });
  assert.ok(md.includes('## Candidats les mieux notés'));
  assert.ok(md.includes('(aucune réponse)'));
  assert.ok(md.includes('> **Résumé.** R1'));
  assert.ok(!md.includes('**Apport.**'));
  assert.ok(md.includes('> [!note]- Tous les candidats (3)'));
});

test('import de veille-revues : sources.json et profil_these.json', () => {
  const sources = {
    revues: [{ nom: 'Strategic Management Journal', issn: ['0143-2095', '1097-0266'], categorie: 'Management stratégique', filtre: false },
      { nom: 'Research Policy', issn: ['0048-7333'], categorie: 'Management stratégique', filtre: true }],
    prefixes_doi: [{ nom: 'FAO', prefix: '10.4060', categorie: 'Rapports', filtre: true }],
    rss: [{ nom: 'IDDRI', url: 'https://www.iddri.org/fr/rss.xml', categorie: 'Think tanks', filtre: true }],
    hal: { requetes: ['"system dynamics" AND food'] },
    veille_web: { sites: [{ nom: 'Cour des comptes', url: 'https://www.ccomptes.fr/fr/publications', domaine: 'ccomptes.fr', categorie: 'France' }] },
  };
  const s = Ariane.depuisSourcesVeilleJson(sources);
  assert.equal(s.veilleRevues, 'Strategic Management Journal | 0143-2095, 1097-0266 | Management stratégique\n'
    + 'Research Policy | 0048-7333 | Management stratégique | filtré');
  // Aller-retour : le texte importé se relit comme la source d'origine.
  assert.deepEqual(Ariane.compilerRevuesVeille(s.veilleRevues).map((r) => [r.nom, r.issn, r.filtre]),
    [['Strategic Management Journal', ['0143-2095', '1097-0266'], false], ['Research Policy', ['0048-7333'], true]]);
  assert.equal(Ariane.compilerPrefixesVeille(s.veillePrefixes)[0].prefix, '10.4060');
  assert.equal(Ariane.compilerFluxVeille(s.veilleFlux)[0].filtre, true);
  assert.equal(s.veilleHal, '"system dynamics" AND food');
  assert.equal(Ariane.compilerSitesVeille(s.veilleSites)[0].nom, 'Cour des comptes');

  const p = Ariane.depuisProfilVeilleJson({
    these: { resume: 'R', phases: { 1: 'Revue de littérature', 2: 'Terrain' }, phases_courtes: { 1: 'Littérature' },
      criteres_selection: ['C1', 'C2'], a_ecarter: 'X', exemple_lien_these: 'E' },
    mots_cles: [{ motif: 'concept|synonyme', poids: 5, axe: 'Cœur' }],
    seuils: { source_filtree_min: 6, priorite_min: 9, resume_dans_liste_min: 3 },
    exclusions_titre: '^(erratum)',
  });
  assert.equal(p.veilleCriteres, 'C1\nC2');
  assert.equal(p.veillePhases, '1 = Littérature : Revue de littérature\n2 = Terrain : Terrain');
  assert.equal(p.veilleMotsCles, '5 | Cœur | concept|synonyme');
  assert.ok(Ariane.compilerMotsClesVeille(p.veilleMotsCles)[0].re.test('un SYNONYME'));
  assert.deepEqual([p.veilleSeuilFiltre, p.veilleSeuilPriorite, p.veilleSeuilResume], [6, 9, 3]);
  assert.equal(p.veilleExclusionsTitre, '^(erratum)');
});

test('acteurs suivis : lignes générales, LinkedIn mis à part, flux découvert dans la page', () => {
  const a = Ariane.compilerActeursVeille('# commentaire\nAssociation A | https://a.fr/, https://a.fr/agenda/feed/ https://www.linkedin.com/company/a/\nSans adresse | rien');
  assert.deepEqual(a, [{ nom: 'Association A', flux: ['https://a.fr/', 'https://a.fr/agenda/feed/'],
    aConsulter: ['https://www.linkedin.com/company/a/'] }]);
  const html = '<head><link rel="stylesheet" href="x.css"><link rel="alternate" type="application/rss+xml" title="A &raquo; Flux" href="/feed/">'
    + '<link rel="alternate" type="application/rss+xml" title="A &raquo; Flux pour Événements" href="https://a.fr/evenements/feed/"></head>';
  assert.deepEqual(Ariane.decouvrirFluxVeille(html, 'https://a.fr/evenements/'),
    ['https://a.fr/evenements/feed/', 'https://a.fr/feed/'], 'le flux de la page d\'abord');
  assert.deepEqual(Ariane.decouvrirFluxVeille('<html></html>', 'https://a.fr/'), []);
});

test('acteurs suivis : collecte par la page, sans doublon, du plus récent au plus ancien', async () => {
  const flux = (items) => '<rss><channel>' + items.map(([t, u, d]) => '<item><title>' + t + '</title><link>' + u
    + '</link><pubDate>' + d + '</pubDate><description>Texte</description></item>').join('') + '</channel></rss>';
  const pages = {
    'https://a.fr/': '<link rel="alternate" type="application/rss+xml" href="https://a.fr/feed/">',
    'https://a.fr/feed/': flux([['Vieux', 'https://a.fr/v', 'Mon, 01 Jun 2026 10:00:00 +0000'],
      ['Récent', 'https://a.fr/r', 'Wed, 07 Oct 2026 10:00:00 +0000']]),
    'https://a.fr/evenements/feed/': flux([['Récent', 'https://a.fr/r', 'Wed, 07 Oct 2026 10:00:00 +0000'],
      ['Conférence', 'https://a.fr/c', 'Thu, 08 Oct 2026 10:00:00 +0000']]),
  };
  const moi = { _veilleGet: async (u) => { if (!(u in pages)) throw new Error('HTTP 404'); return pages[u]; } };
  const r = await Ariane.prototype._veilleActeur.call(moi,
    { nom: 'A', flux: ['https://a.fr/', 'https://a.fr/evenements/feed/'], aConsulter: [] },
    Date.parse('2026-10-01T00:00:00Z'));
  assert.deepEqual(r.items.map((i) => i.titre), ['Conférence', 'Récent']);
  assert.equal(r.erreur, '');
  const ko = await Ariane.prototype._veilleActeur.call(moi, { nom: 'B', flux: ['https://b.fr/'], aConsulter: [] }, 0);
  assert.match(ko.erreur, /HTTP 404/);
});

test('acteurs suivis : l\'analyse de l\'IA est bornée, et les événements à venir remontent', () => {
  const ana = Ariane.normaliserActeursVeille({
    x1: { categorie: 'événement', interet: 'FORT', pourquoi: 'Utile.', quand: '2026-11-20', lieu: 'Le Havre' },
    x2: { categorie: 'inventée', interet: 'énorme', quand: 'bientôt' },
    zz: { categorie: 'Événement' },
  }, ['x1', 'x2'], ['Événement', 'Actualité']);
  assert.deepEqual(ana.get('x1'), { categorie: 'Événement', interet: 'fort', pourquoi: 'Utile.', quand: '2026-11-20', lieu: 'Le Havre' });
  assert.deepEqual(ana.get('x2'), { categorie: 'Événement', interet: 'moyen', pourquoi: '', quand: '', lieu: '' });
  assert.ok(!ana.has('zz'), 'identifiant inconnu écarté');
  const items = [
    { id: 'x1', titre: 'Colloque', url: 'https://a.fr/c', date: '2026-10-08', resume: '', ia: ana.get('x1') },
    { id: 'x2', titre: 'Brève', url: 'https://a.fr/b', date: '2026-10-09', resume: 'Une brève.', ia: ana.get('x2') },
  ];
  const md = Ariane.noteVeille({ debut: '2026-10-05', fin: '2026-10-12', semaine: 41, stats: { bruts: 2 }, items: [],
    selection: null, acteurs: [{ nom: 'Association A', items, aConsulter: ['https://www.linkedin.com/company/a/'], erreur: '' },
      { nom: 'B', items: [], aConsulter: [], erreur: '' }], genereLe: 'x' });
  assert.ok(md.includes('## Acteurs suivis'));
  assert.ok(md.includes('> [!tip] Événements à venir\n> - **2026-11-20** (Le Havre) : [Colloque](https://a.fr/c), Association A'));
  assert.ok(md.includes('- `Événement, intérêt fort` [Colloque](https://a.fr/c) (2026-10-08) : Utile.'));
  assert.ok(md.includes('[LinkedIn](https://www.linkedin.com/company/a/)'));
  assert.ok(md.includes('### B\n\nRien de neuf sur la période.'));
});
