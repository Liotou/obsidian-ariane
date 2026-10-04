// Pont Claude (section 22) et serveur MCP ariane-taches (mcp/taches.js), de
// bout en bout : un vrai pont sur un greffon factice, le vrai serveur lancé
// comme Claudian le lance. Le fichier d'annonce est temporaire : le vrai
// ~/.ariane-mcp/pont.json n'est jamais touché.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const Ariane = require('./obsidian-factice.js');
const { PontClaude, pontCorpsNote } = Ariane._test;

const AUJ = new Date().toISOString().slice(0, 10);
const J = (n) => Ariane.decalerJour(AUJ, n);

function greffonFactice() {
  const taches = [
    { ref: 'T001', intitule: 'Lire Bertalanffy', statut: 'en cours', famille: 'lecture', priorite: '',
      echeance: J(-3), creneaux: [J(1) + ' 09:00-11:00'], bloquePar: [], fichier: { path: '08 - Tâches/T001.md' } },
    { ref: 'T002', intitule: 'Rédiger le chapitre 2', statut: 'à faire', famille: 'production', priorite: 'haute',
      echeance: J(30), creneaux: [], bloquePar: ['[[T001]]'], fichier: { path: '08 - Tâches/T002.md' } },
    { ref: 'T003', intitule: 'Ancienne', statut: 'terminée', famille: 'action', echeance: J(-40),
      creneaux: [], bloquePar: [], fichier: { path: '08 - Tâches/T003.md' } },
  ];
  const g = {
    settings: { tempsHistorique: { [J(-1)]: { '08 - Tâches/T001.md': 1800 } } },
    app: { vault: {
      adapter: { getBasePath: () => '/coffre/test' },
      cachedRead: async () => '---\nx: 1\n---\n# Lire\nNote de travail.\n<!-- ariane:creneaux -->\n## Sessions\n<!-- /ariane:creneaux -->\n',
    } },
    tachesPourGantt: () => taches,
    analyseTaches: async (auj) => taches.map((t) => ({ tache: t, tempsRecentMin: 30,
      analyse: Ariane.analyseTache(t, { aujourdhui: auj, bloquees: t.ref === 'T001' ? 1 : 0 }) })),
    lireJournalTaches: async () => [
      { le: J(-5) + 'T10:00', ref: 'T001', champ: 'echeance', avant: J(-10), apres: J(-3), origine: 'externe' },
      { le: J(-5) + 'T10:00', ref: 'T002', champ: 'statut', avant: '', apres: 'à faire', origine: 'ariane' },
    ],
    _cheminsLiesTache: () => [],
    evenementsFond: async () => [
      { titre: 'Séminaire', debut: J(1) + 'T14:00', fin: J(1) + 'T16:00', calendrier: 'Travail', allDay: false },
      { titre: 'Colloque', debut: J(2) + 'T00:00', fin: J(3) + 'T00:00', calendrier: 'Travail', allDay: true },
    ],
  };
  return g;
}

async function demarrerPont() {
  const annonce = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ariane-pont-')), 'pont.json');
  const pont = new PontClaude(greffonFactice());
  pont.cheminAnnonce = annonce;
  pont.demarrer();
  for (let i = 0; i < 50 && !pont.port; i += 1) await new Promise((r) => setTimeout(r, 20));
  return { pont, annonce };
}

// Lance le serveur MCP, lui envoie des messages, rend les réponses par id.
function dialoguer(env, messages) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'mcp', 'taches.js')],
      { env: Object.assign({}, process.env, env) });
    const recus = new Map();
    let tampon = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      tampon += d;
      let i;
      while ((i = tampon.indexOf('\n')) >= 0) {
        const l = tampon.slice(0, i); tampon = tampon.slice(i + 1);
        if (l.trim()) { const j = JSON.parse(l); recus.set(j.id, j); }
      }
      if (recus.size >= messages.length) { p.kill(); resolve(recus); }
    });
    p.on('error', reject);
    setTimeout(() => { p.kill(); reject(new Error('délai dépassé : ' + recus.size + ' réponses')); }, 8000);
    for (const m of messages) p.stdin.write(JSON.stringify(Object.assign({ jsonrpc: '2.0' }, m)) + '\n');
  });
}

const appel = (id, name, args) => ({ id, method: 'tools/call', params: { name, arguments: args || {} } });
const texte = (r) => JSON.parse(r.result.content[0].text);

test('pont : annonce son port et son jeton, puis se retire à l\'arrêt', async () => {
  const { pont, annonce } = await demarrerPont();
  const a = JSON.parse(fs.readFileSync(annonce, 'utf8'));
  assert.equal(a.coffres['/coffre/test'].port, pont.port);
  assert.equal(a.coffres['/coffre/test'].jeton.length, 48);
  assert.equal((fs.statSync(annonce).mode & 0o777), 0o600, 'lisible par Monsieur seul');
  pont.arreter();
  assert.deepEqual(JSON.parse(fs.readFileSync(annonce, 'utf8')).coffres, {});
});

test('pont : un mauvais jeton est refusé', async () => {
  const { pont } = await demarrerPont();
  const code = await new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: pont.port, path: '/outil', method: 'POST',
      headers: { Authorization: 'Bearer ' + 'x'.repeat(48) } }, (res) => resolve(res.statusCode));
    req.end('{"nom":"revue"}');
  });
  pont.arreter();
  assert.equal(code, 401);
});

test('serveur MCP : les outils de lecture, de bout en bout', async () => {
  const { pont, annonce } = await demarrerPont();
  try {
    const r = await dialoguer({ ARIANE_PONT: annonce }, [
      { id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {} } },
      { id: 2, method: 'tools/list' },
      appel(3, 'lister_taches'),
      appel(4, 'detail_tache', { ref: 'T001' }),
      appel(5, 'charge_calendrier', { du: J(1), au: J(2) }),
      appel(6, 'revue'),
      appel(7, 'detail_tache', { ref: 'T999' }),
    ]);
    assert.equal(r.get(1).result.serverInfo.name, 'ariane-taches');
    assert.deepEqual(r.get(2).result.tools.map((o) => o.name),
      ['lister_taches', 'detail_tache', 'charge_calendrier', 'proposer_modifications',
        'document_ouvert', 'lire_pdf', 'chercher_dans_pdf', 'revue']);

    const liste = texte(r.get(3));
    assert.deepEqual(liste.taches.map((t) => t.ref), ['T001', 'T002'], 'la terminée est exclue, la plus urgente en tête');
    assert.equal(liste.taches[0].urgence.raison, 'échéance dépassée de 3 j');
    assert.ok(liste.taches[0].diagnostics.some((d) => d.code === 'retard'));
    assert.deepEqual(liste.taches[1].bloque_par, ['T001']);

    const detail = texte(r.get(4));
    assert.equal(detail.note, '# Lire\nNote de travail.', 'propriétés et blocs d\'Ariane retirés');
    assert.equal(detail.journal.length, 1);
    assert.equal(detail.journal[0].champ, 'echeance');
    assert.deepEqual(detail.temps_par_jour, [{ jour: J(-1), minutes: 30 }]);
    assert.equal(detail.creneaux[0].passe, false);

    const charge = texte(r.get(5));
    assert.equal(charge.jours.length, 2);
    const j1 = charge.jours[0];
    assert.equal(j1.creneaux[0].ref, 'T001');
    assert.equal(j1.evenements[0].titre, 'Séminaire');
    assert.equal(j1.minutes_occupees, 240);
    assert.deepEqual(j1.plages_libres.map((p) => p.debut + '-' + p.fin), ['08:00-09:00', '11:00-14:00', '16:00-19:00']);
    assert.equal(charge.jours[1].journee_entiere[0].titre, 'Colloque');
    assert.equal(charge.jours[1].plages_libres[0].minutes, 660, 'une journée entière ne bloque pas les plages');

    const revue = texte(r.get(6));
    assert.deepEqual(revue.en_retard.map((t) => t.ref), ['T001']);

    assert.equal(r.get(7).result.isError, true);
    assert.match(r.get(7).result.content[0].text, /Tâche introuvable : T999/);
  } finally {
    pont.arreter();
  }
});

test('serveur MCP : Obsidian fermé, un message qui le dit', async () => {
  const vide = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ariane-pont-')), 'absent.json');
  const r = await dialoguer({ ARIANE_PONT: vide }, [appel(1, 'revue')]);
  assert.equal(r.get(1).result.isError, true);
  assert.match(r.get(1).result.content[0].text, /Obsidian est-il ouvert/);
});

test('corps de note : sans propriétés ni blocs entretenus par Ariane', () => {
  assert.equal(pontCorpsNote('---\na: 1\n---\nTexte\n<!-- ariane:acces -->\nx\n<!-- /ariane:acces -->\nFin'), 'Texte\nFin');
});

test('proposer_modifications : seul ce que Monsieur coche est appliqué, puis annulable', async () => {
  const { pont, annonce } = await demarrerPont();
  const g = pont.greffon;
  const ecrits = [];
  g.fichierDeRef = (ref) => ({ path: '08 - Tâches/' + ref + '.md' });
  g.marquerOrigineTache = (chemin, origine) => ecrits.push(['origine', chemin, origine]);
  g.majTache = async (ref, champs) => { ecrits.push(['maj', ref, champs]); return true; };
  g.majCreneau = async (ref, chg) => { ecrits.push(['creneau', ref, chg]); return true; };
  // Monsieur accepte p1, refuse p2 ; p3 est écarté par Ariane avant de lui être montré.
  let montres = null;
  pont._demanderValidation = async (motif, valides, erreurs) => {
    montres = { motif, valides: valides.map((v) => v.id), erreurs: erreurs.map((e) => e.id) };
    return ['p1'];
  };
  try {
    const r = await dialoguer({ ARIANE_PONT: annonce }, [appel(1, 'proposer_modifications', {
      motif: 'Replanifier la lecture.',
      changements: [
        { ref: 'T001', justification: 'Échéance dépassée.', champs: { echeance: J(10) },
          ajouter_creneaux: [{ debut: J(4) + 'T09:00', fin: J(4) + 'T11:00' }] },
        { ref: 'T002', champs: { statut: 'en cours' } },
        { ref: 'T001', champs: { echeance: 'demain' } },
      ],
    })]);
    const res = texte(r.get(1));
    assert.deepEqual(montres, { motif: 'Replanifier la lecture.', valides: ['p1', 'p2'], erreurs: ['p3'] });
    assert.deepEqual(res.acceptes, [{ id: 'p1', ref: 'T001', intitule: 'Lire Bertalanffy' }]);
    assert.deepEqual(res.refuses.map((x) => x.ref), ['T002']);
    assert.equal(res.ecartes[0].erreur, 'echeance invalide : demain');
    assert.deepEqual(ecrits, [
      ['origine', '08 - Tâches/T001.md', 'claude'],
      ['maj', 'T001', { echeance: J(10) }],
      ['origine', '08 - Tâches/T001.md', 'claude'],
      ['creneau', 'T001', { avant: '', debut: J(4) + 'T09:00', fin: J(4) + 'T11:00' }],
    ], 'marqué « claude » avant chaque écriture ; rien pour T002');

    ecrits.length = 0;
    assert.equal(await pont.annulerDerniereProposition(), true);
    assert.deepEqual(ecrits, [
      ['creneau', 'T001', { avant: J(4) + ' 09:00-11:00', debut: '', fin: '' }],
      ['maj', 'T001', { echeance: J(-3) }],
    ], 'défait dans l\'ordre inverse');
    assert.equal(await pont.annulerDerniereProposition(), false, 'une seule fois');
  } finally {
    pont.arreter();
  }
});

test('installation pour Claude : compétence, serveurs et configuration, sans rien écraser d\'autre', () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'ariane-install-'));
  const coffre = path.join(racine, 'coffre');
  const maison = path.join(racine, 'maison');
  const greffonDir = path.join(coffre, '.obsidian/plugins/obsidian-ariane');
  fs.mkdirSync(path.join(greffonDir, 'competence/ariane-taches'), { recursive: true });
  fs.mkdirSync(path.join(greffonDir, 'mcp'), { recursive: true });
  fs.writeFileSync(path.join(greffonDir, 'competence/ariane-taches/SKILL.md'), '---\nname: ariane-taches\n---\n');
  fs.writeFileSync(path.join(greffonDir, 'mcp/taches.js'), '// taches');
  fs.writeFileSync(path.join(greffonDir, 'mcp/serveur.js'), '// serveur');
  fs.mkdirSync(path.join(coffre, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(coffre, '.claude/mcp.json'), JSON.stringify({
    mcpServers: { autre: { command: 'x' }, 'ariane-annotations': { command: '/bin/sh', args: ['vieux'], env: { OLLAMA_URL: 'http://ailleurs:1' } } },
    _claudian: { servers: { autre: { contextSaving: true } } },
  }));
  const pont = new PontClaude({ manifest: { dir: '.obsidian/plugins/obsidian-ariane' },
    app: { vault: { adapter: { getBasePath: () => coffre } } } });
  const home = process.env.HOME;
  process.env.HOME = maison;
  try {
    pont.installerPourClaude();
  } finally { process.env.HOME = home; }
  assert.equal(fs.readFileSync(path.join(coffre, '.claude/skills/ariane-taches/SKILL.md'), 'utf8'), '---\nname: ariane-taches\n---\n');
  assert.equal(fs.readFileSync(path.join(maison, '.ariane-mcp/taches.js'), 'utf8'), '// taches');
  const d = JSON.parse(fs.readFileSync(path.join(coffre, '.claude/mcp.json'), 'utf8'));
  assert.deepEqual(d.mcpServers.autre, { command: 'x' }, 'un autre serveur n\'est pas touché');
  assert.deepEqual(d.mcpServers['ariane-taches'].args, [path.join(maison, '.ariane-mcp/taches.js')]);
  assert.equal(d.mcpServers['ariane-taches'].env.ARIANE_VAULT, coffre);
  assert.match(d.mcpServers['ariane-taches'].command, /(^|\/)node$/, 'jamais le /bin/sh configuré ailleurs');
  assert.equal(d.mcpServers['ariane-annotations'].env.OLLAMA_URL, 'http://ailleurs:1', 'un réglage de Monsieur est gardé');
  assert.equal(d.mcpServers['ariane-annotations'].env.ARIANE_CACHE, path.join(greffonDir, 'cache-embeddings.json'));
  assert.deepEqual(d._claudian.servers.autre, { contextSaving: true });
  assert.deepEqual(d._claudian.servers['ariane-taches'], { contextSaving: false });
});
