// L'IA de chaque fonction : plus de fournisseur principal. Chaque fonction
// qui emploie une IA générative est au registre FONCTIONS_IA, a son
// fournisseur et son modèle, et part, à la mise à jour, de ce qu'elle
// suivait avant.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Ariane = require('./obsidian-factice.js');

const { FONCTIONS_IA, FOURNISSEURS_IA, MODULES_ARIANE } = Ariane._test;
const SRC = path.join(__dirname, '..', 'src');
const sources = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'))
  .map((f) => ({ f, t: fs.readFileSync(path.join(SRC, f), 'latin1') }));

test('IA : le registre, des ids uniques, des modules et des fournisseurs connus', () => {
  const ids = FONCTIONS_IA.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  const modules = new Set(MODULES_ARIANE.map((m) => m.id));
  for (const d of FONCTIONS_IA) {
    assert.ok(modules.has(d.module), d.id + ' : module ' + d.module);
    assert.ok(d.nom && d.desc && d.domaine, d.id);
    assert.ok(['principal', 'assistant', 'repartition', 'local', 'activite', 'images'].includes(d.herite), d.id);
  }
  assert.deepEqual(FOURNISSEURS_IA.map((x) => x.id), ['mistral', 'claude', 'ollama', 'lmstudio', 'apple']);
});

test('IA : tout appel passe par une fonction du registre, et chaque fonction sert', () => {
  const ids = new Set(FONCTIONS_IA.map((d) => d.id));
  const servis = new Set();
  const inconnus = [];
  // genererPour('id', …), genererIA(…, 'id'), _genererActiviteIA(…, 'id'), iaPour('id').
  const motifs = [/genererPour\('([\w-]+)'/g, /_genererActiviteIA\([\s\S]{0,160}?, '([\w-]+)'\)/g,
    /genererIA\([\s\S]{0,160}?, (?:\d+|60), '([\w-]+)'\)/g, /'(taches-decouper)' : '(taches-structurer)'/g,
    /iaPour\('([\w-]+)'\)/g, /genererImagesPour\('([\w-]+)'/g];
  for (const { f, t } of sources) {
    for (const re of motifs) {
      for (const m of t.matchAll(re)) {
        for (const id of m.slice(1).filter(Boolean)) (ids.has(id) ? servis : { add: () => inconnus.push(f + ' : ' + id) }).add(id);
      }
    }
  }
  assert.deepEqual(inconnus, []);
  assert.deepEqual([...ids].filter((id) => !servis.has(id)), [], 'fonctions sans appel');
  // Plus aucun accès direct à un fournisseur hors du routage (11c, 11u).
  const directs = [];
  for (const { f, t } of sources) {
    if (f.startsWith('11c-') || f.startsWith('11u-')) continue;
    for (const m of t.matchAll(/\b(genererAvecFournisseur|genererMistral|genererClaude|genererApple|genererJsonAvec|requeteMistral|genererJson|genererJsonRefs)\(/g)) {
      directs.push(f + ' : ' + m[1]);
    }
    if (/api\.mistral\.ai/.test(t)) directs.push(f + ' : api.mistral.ai');
  }
  assert.deepEqual(directs, []);
  // Plus de fournisseur principal dans le code qui choisit.
  for (const { f, t } of sources) {
    if (f.startsWith('01-') || f.startsWith('11c-')) continue;
    assert.ok(!/settings\.(refsFournisseur|refsModele|activiteIAFournisseur|assistantFournisseur|organisationModeleClaude)\b/.test(t), f);
  }
});

test('IA : à la mise à jour, chaque fonction garde l’IA qu’elle suivait', () => {
  // Les réglages de Monsieur avant la 3.3.
  const s = { refsFournisseur: 'mistral', refsModele: 'mistral-large-latest', refsModeleClaude: '',
    assistantFournisseur: 'auto', activiteIAFournisseur: 'mistral', activiteIAModele: '',
    organisationModeleClaude: 'sonnet', suggFournisseur: 'ollama', suggModeleLLM: 'llama3.2' };
  const ia = (id) => Ariane.iaDeFonction(id, s);
  assert.deepEqual(ia('assistant'), { f: 'apple', m: '' });
  assert.deepEqual(ia('taches-structurer'), { f: 'mistral', m: 'mistral-large-latest' });
  assert.deepEqual(ia('biblio-decouper'), { f: 'mistral', m: 'mistral-large-latest' });
  assert.deepEqual(ia('taches-repartir'), { f: 'claude', m: 'sonnet' });
  assert.deepEqual(ia('refs-rattacher'), { f: 'ollama', m: 'llama3.2' });
  assert.deepEqual(ia('sugg-reclasser'), { f: 'ollama', m: 'llama3.2' });
  assert.deepEqual(ia('activite-journee'), { f: 'mistral', m: 'mistral-large-latest' });
  // La transcription des cahiers, venue après : Claude (Sonnet), qui lit l'écriture.
  assert.deepEqual(ia('manuscrites-transcrire'), { f: 'claude', m: 'sonnet' });
  // L'activité en Claude reprend son modèle à elle, Haiku par défaut.
  assert.deepEqual(Ariane.iaDeFonction('activite-creneaux', { activiteIAFournisseur: 'claude' }), { f: 'claude', m: 'haiku' });
  // L'assistant réglé sur le fournisseur principal le suit.
  assert.deepEqual(Ariane.iaDeFonction('assistant', { assistantFournisseur: 'principal', refsFournisseur: 'claude', refsModeleClaude: 'opus' }),
    { f: 'claude', m: 'opus' });
  // Aucun réglage : les valeurs d'origine (Ollama).
  assert.deepEqual(Ariane.iaDeFonction('taches-seance', {}), { f: 'ollama', m: 'llama3.2' });
});

test('IA : un choix propre l’emporte, un modèle vide prend celui du fournisseur', () => {
  const s = { refsFournisseur: 'ollama', iaFonctions: { 'taches-seance': { f: 'mistral', m: '' }, 'assistant': { f: 'claude', m: 'haiku' } } };
  assert.deepEqual(Ariane.iaDeFonction('taches-seance', s), { f: 'mistral', m: 'mistral-small-latest' });
  assert.deepEqual(Ariane.iaDeFonction('assistant', s), { f: 'claude', m: 'haiku' });
  assert.deepEqual(Ariane.iaDeFonction('taches-langage', s), { f: 'ollama', m: 'llama3.2' });
});

test('IA : sur une machine qui n’a pas le fournisseur, son modèle par défaut', () => {
  const g = Object.create(Ariane.prototype);
  g.settings = { iaFonctions: { 'taches-langage': { f: 'claude', m: 'opus' } } };
  g.fournisseurDisponible = () => 'mistral';   // le téléphone
  assert.deepEqual(g.iaPour('taches-langage'), { f: 'mistral', m: 'mistral-small-latest' });
  let appel = null;
  g.genererAvecFournisseur = async (p, max, f, m, o) => { appel = { f, m, o }; return '{}'; };
  g.fournisseurDisponible = (f) => f;
  return g.genererPour('taches-langage', 'x', 10, { delai: 5 }).then(() => {
    assert.deepEqual(appel, { f: 'claude', m: 'opus', o: { delai: 5, modeleClaude: 'opus' } });
  });
});

test('Mistral : un modèle hors de l’abonnement passe à mistral-small-latest', async () => {
  const g = Object.create(Ariane.prototype);
  g.settings = { refsCleMistral: 'k' };
  const modeles = [];
  global.__arianeRequete = async (o) => {
    const c = JSON.parse(o.body);
    modeles.push(c.model);
    if (c.model === 'mistral-large-latest') {
      return { status: 403, text: '{"object":"error","message":"This model is not available in your subscription tier","type":"tier_not_allowed","code":"1910"}' };
    }
    return { status: 200, json: { choices: [{ message: { content: '{"ok":true}' } }] } };
  };
  try {
    const t = await g.genererMistral('p', 10, 'mistral-large-latest');
    assert.equal(t, '{"ok":true}');
    assert.deepEqual(modeles, ['mistral-large-latest', 'mistral-small-latest']);
    // Une autre erreur ne déclenche pas de repli.
    global.__arianeRequete = async () => ({ status: 401, text: 'Unauthorized' });
    assert.equal(await g.genererMistral('p', 10, 'mistral-large-latest'), null);
    assert.match(g._diagIA, /Mistral HTTP 401/);
  } finally { delete global.__arianeRequete; }
  assert.equal(Ariane.modeleMistral('llama3.2'), 'mistral-small-latest');
  assert.equal(Ariane.modeleMistral('magistral-medium-latest'), 'magistral-medium-latest');
});
