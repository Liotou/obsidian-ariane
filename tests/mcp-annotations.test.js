// Serveur MCP ariane-annotations (mcp/serveur.js) : un coffre temporaire, un
// faux Ollama, le vrai serveur lancé comme Claudian le lance.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

function coffre() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'ariane-annot-'));
  const ecrire = (rel, texte) => {
    fs.mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    fs.writeFileSync(path.join(racine, rel), texte);
  };
  ecrire('02 - Annotations/@tong/KHXS6EEP.md', '---\naliases:\n  - Le risque comme potentiel de crise.\n---\nLa relation causale entre le risque et la crise est purement potentielle. Le risque est un potentiel de crise.\n');
  ecrire('02 - Annotations/@tong/Q7RBDGQW.md', '---\naliases:\n  - Accumulation des risques et gravité des crises.\n---\nPlus les risques s\'accumulent, plus la crise est grave, comme une énergie potentielle.\n');
  ecrire('02 - Annotations/@x/SANSALIAS.md', '**[Définition de la résilience](zotero://x)**\n\nCapacité à absorber un choc.\n');
  // Vecteurs : la requête tombera plus près de Q7 que de KHXS6EEP ; seule la
  // recherche par les mots peut remettre KHXS6EEP en tête.
  const cache = { model: 'bge-m3', entries: {
    '02 - Annotations/@tong/KHXS6EEP.md': { hash: 'a', vec: [0.6, 0.8, 0] },
    '1 - Annotations/@tong/KHXS6EEP.md': { hash: 'a', vec: [1, 0, 0] },   // ancien chemin : fichier disparu
    '02 - Annotations/@tong/Q7RBDGQW.md': { hash: 'b', vec: [0.95, 0.3, 0] },
    '02 - Annotations/@x/SANSALIAS.md': { hash: 'c', vec: [0, 0, 1] },
  } };
  const fichierCache = path.join(racine, 'cache.json');
  fs.writeFileSync(fichierCache, JSON.stringify(cache));
  return { racine, fichierCache };
}

function fauxOllama() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let d = ''; req.on('data', (c) => { d += c; });
      req.on('end', () => { res.end(JSON.stringify({ embeddings: [[1, 0, 0]] })); });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function chercher(env, requete) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'mcp', 'serveur.js')],
      { env: Object.assign({}, process.env, env) });
    let tampon = '';
    p.stdout.on('data', (d) => {
      tampon += d;
      for (const l of tampon.split('\n')) {
        if (!l.trim()) continue;
        let j; try { j = JSON.parse(l); } catch (e) { continue; }
        if (j.id === 2) { p.kill(); resolve(j.result.content[0].text); }
      }
    });
    setTimeout(() => { p.kill(); reject(new Error('délai')); }, 8000);
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'chercher_annotations', arguments: { requete } } }) + '\n');
  });
}

const titres = (t) => [...t.matchAll(/^### \d+\. (.*)$/gm)].map((m) => m[1]);

test('recherche : fichiers disparus ignorés, titres lisibles, classement annoncé', async () => {
  const { racine, fichierCache } = coffre();
  const ollama = await fauxOllama();
  try {
    const t = await chercher({ ARIANE_VAULT: racine, ARIANE_CACHE: fichierCache,
      OLLAMA_URL: 'http://127.0.0.1:' + ollama.address().port }, 'le risque devient une crise : potentiel de crise');
    assert.match(t, /CLASSÉS DU PLUS AU MOINS PERTINENT/);
    assert.match(t, /sur 3 notes/, 'l\'entrée à l\'ancien chemin n\'est pas comptée');
    assert.ok(!t.includes('1 - Annotations/'), 'jamais un chemin qui n\'existe plus');
    assert.deepEqual(titres(t).slice(0, 2), ['Le risque comme potentiel de crise.', 'Accumulation des risques et gravité des crises.'],
      'l\'expression exacte remet en tête la note que le sens seul classait deuxième');
  } finally { ollama.close(); }
});

test('recherche : sans alias, le titre vient du corps ; sans Ollama, les mots suffisent', async () => {
  const { racine, fichierCache } = coffre();
  const t = await chercher({ ARIANE_VAULT: racine, ARIANE_CACHE: fichierCache, OLLAMA_URL: 'http://127.0.0.1:1' },
    'définition de la résilience');
  assert.match(t, /Ollama injoignable : recherche par les mots seulement/);
  assert.deepEqual(titres(t), ['Définition de la résilience']);
});
