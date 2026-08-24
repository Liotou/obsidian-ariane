# Serveur MCP « ariane-annotations »

Donne à Claude (via Claudian ou Claude Code) une **recherche sémantique** sur vos
annotations et notes conceptuelles, sans lire tout le coffre. Il réutilise l'index
d'embeddings d'Ariane et Ollama (bge-m3).

## Outil exposé
`chercher_annotations(requete, k=8)` → renvoie les notes les plus pertinentes
(titre, chemin, lien `[[…]]`, contenu), classées par similarité.

## Prérequis
1. **Ollama** lancé, modèle présent : `ollama pull bge-m3`.
2. **Index Ariane construit** : dans Obsidian, ouvrez les suggestions d'Ariane en
   mode *sémantique* ou *hybride* au moins une fois (cela crée `cache-embeddings.json`).

## Installation dans Claudian
Ajoutez le contenu de `config-claudian.json` à la configuration des serveurs MCP de
Claudian (section « MCP servers »). Si Claudian utilise la config de Claude Code,
placez-le plutôt dans `~/.claude.json` ou un `.mcp.json` de dossier.

Puis, dans Claude : « Utilise l'outil chercher_annotations pour trouver les
annotations qui appuient tel argument. »

## Réglages (variables d'environnement, optionnelles)
- `OLLAMA_URL` (défaut `http://localhost:11434`)
- `ARIANE_CACHE` (défaut : le `cache-embeddings.json` d'Ariane, auto-détecté)
- `ARIANE_VAULT` (défaut : la racine du coffre, auto-détectée)
