# Scission d'Ariane — conception révisée (2026-09-07)

> ## ⚠️ ABANDONNÉE le 2026-09-07 — Ariane reste UN SEUL GREFFON
>
> L'utilisateur a tranché après avoir vu la phase 1 tourner : « je ne veux
> qu'un seul plugin ». La **phase 2 (§4) n'aura pas lieu** — pas de
> `packages/`, pas de `ariane-note` ni `ariane-task`, pas de migration de
> `data.json`, et §6 est sans objet.
>
> **La phase 1 est faite et reste** : `main.js` est produit par
> `scripts/build.mjs` depuis les fragments de `src/`, et `class Ariane` est
> assemblée de dix mixins. Ce découpage ne préparait pas la scission — il
> valait par lui-même, et c'est pour cela qu'il survit à son abandon : une
> classe de 12 000 lignes ne se tient ni dans une tête ni dans un contexte
> d'IA.
>
> **Ce que la décision confirme, a posteriori** : avoir séparé la
> modularisation de la scission (§4) était le bon découpage du chantier. La
> phase qui apportait le bénéfice n'imposait rien à l'utilisateur ; celle qui
> lui imposait deux greffons et une migration est celle qu'il a refusée. Le
> document est conservé pour cette raison, et pour éviter qu'une troisième
> étude reparte de zéro : §1 et §2 mesurent ce qui existe, §5 énonce des
> contraintes toujours en vigueur.
>
> Une relance explicite de l'utilisateur est nécessaire pour rouvrir le sujet.

> **Remplace** `2026-08-31-scission-plugins-design.md`, écrit quand `main.js`
> faisait 16 800 lignes et 18 régions — avant la vue calendrier, la synchro
> EventKit et l'export HTML. Les décisions D1–D9 de ce document restent
> valables sauf là où la présente spec les corrige explicitement (§3).

## 1 · Pourquoi rouvrir la conception

Mesures au 2026-09-07 sur 26 628 lignes, en affectant chaque région et
sous-région à son domaine :

| paquet prévu en août | lignes | part |
|---|---:|---:|
| `ariane-task` | 13 368 | **58,6 %** |
| `ariane-note` | 6 121 | 26,8 % |
| `ariane-core` | 2 114 | 9,3 % |
| `ariane-assistant` | 782 | 3,4 % |
| `ariane-graph` | 424 | 1,9 % |

Trois constats invalident le découpage d'août.

**a) Le découpage ne règle pas le problème qu'il visait.** Il détache les deux
plus petits domaines et laisse `ariane-task` à 13 400 lignes — presque la
taille du plugin entier au moment où la scission a été conçue pour régler la
taille.

**b) `ariane-assistant` est un service, pas un domaine.** La spec d'août pose
« aucune interaction runtime entre les 4 plugins ». Or la couche IA est
appelée des deux côtés :

| symbole | défini | appelé depuis |
|---|---|---|
| `tokeniser`, `cosinusVecteurs`, `vecteurTfIdf` | région 4 | biblio (note, l. 12711/12745/12842) **et** tâches (l. 14766) |
| `genererJson`, `encoderTextes` | l. 8042/8067 | références en attente (note, l. 11976) **et** tâches (l. 14761) |

En faire un greffon obligerait à dupliquer la plomberie LLM dans `note` **et**
dans `task`, ou à inventer une API inter-greffons que la spec interdit.

**c) Le vrai bénéfice du mono-repo n'est pas « N greffons », c'est le build.**
Aujourd'hui tout tient en un fichier parce qu'il n'y a pas d'étape de build.
esbuild permet à *chaque* greffon d'être fait de nombreux petits fichiers —
c'est cela qui règle la `class Ariane` de 12 012 lignes, pas le nombre de
greffons publiés.

## 2 · Cible

**Trois paquets**, dont un seul non publié.

| paquet | publié | ~lignes | contenu |
|---|---|---:|---|
| `core` | non | 2 800 | i18n/`TEXTES`, utilitaires, dates & jours, chemins, garde-fous d'écriture, socle de réglages, `MoteurVue`, **et la couche IA/vecteurs** (TF-IDF + fournisseurs LLM) |
| `ariane-note` | oui | 5 700 | Zotero, notes atomiques, biblio, export Word/Pandoc, doublons d'auteurs, panier, panneau de suggestions, **schémas draw.io** |
| `ariane-task` | oui | 13 400 | tâches, frise, articulation, calendrier, temps de travail, synchro Apple (Rappels + Agenda) |

**La couche IA vit dans `core`.** C'est la correction principale par rapport à
août : le service est consommé par les deux greffons, seul le *panneau* de
suggestions (`VueSuggestionsZotflow` + son onglet de réglages) est une
fonctionnalité, et il part dans `ariane-note`.

**Les schémas draw.io vont dans `ariane-note`.** L'utilisateur a déjà retiré la
partie « graphes » du produit, en conservant les fonctions de conversion de
schéma en texte (région 8 : `parserMxGraph`, `pagesDepuisDrawio`,
`extraitSchema`, `injecterExtrait`…). Ce qui reste — 424 lignes — ne justifie
pas un dépôt, un manifeste, un cycle de publication et une migration
utilisateur à lui seul. `analyserCarte` (l. 2540), aujourd'hui rangée en
région 5 alors que ses seuls appelants sont côté schémas (l. 8639, 8740),
rejoint le module des schémas.

**Les trois vues de tâches ne sont pas séparables.** Frise, articulation et
calendrier lisent les mêmes notes, partagent `tachesPourGantt`, `MoteurVue`,
l'annulation, les familles et les couleurs. Les séparer imposerait soit une API
inter-greffons, soit une duplication massive.

## 3 · Décisions d'août corrigées

| décision d'août | statut |
|---|---|
| D1 — `ariane-assistant` garde un sélecteur de dossiers | **caduque** : plus de greffon assistant. Le sélecteur reste dans les réglages de `ariane-note`. |
| D6 — nom « Ariane — Graphes & schémas » | **caduque** : plus de greffon graph. |
| D9 — chaque greffon en 1.0.0 | **corrigée** : voir §6, les deux greffons publiés partent de `2.79.0`, la version actuelle. |
| D2, D3, D4, D5, D7, D8 | inchangées. En particulier **D4 : identifiants de vue inchangés** (`ariane-frise`, `ariane-articulation`, `ariane-calendrier`, `zfa-references`, `zfa-taches-incoherences`, `zfa-suggestions`) — les fichiers `.base` de l'utilisateur les référencent. |

## 4 · Deux phases

La scission en greffons impose une migration des réglages chez l'utilisateur
(§6). La modularisation, elle, n'impose rien. On les sépare donc, et la phase 1
livre à elle seule l'essentiel du bénéfice.

### Phase 1 — mono-repo, modules, build (un seul greffon publié)

Le greffon installé ne change pas : même identifiant, même `data.json`, même
`main.js` déposé dans le coffre. Ce qui change est la source.

```
obsidian-ariane/
├── package.json              workspaces + scripts
├── esbuild.config.mjs
├── eslint.config.mjs
├── tests/                    inchangés — ils chargent le main.js bundlé
├── main.js                   PRODUIT PAR LE BUILD (versionné : c'est le livrable Obsidian)
├── manifest.json
├── styles.css
└── src/
    ├── main.js               point d'entrée : class Ariane + onload
    ├── core/…
    ├── ia/…
    ├── note/…
    └── task/…
```

`main.js` reste versionné à la racine : c'est le fichier qu'Obsidian charge et
que l'utilisateur copie dans son coffre. Il devient un artefact de build, plus
un fichier à éditer — un garde-fou de test le rappelle.

**La `class Ariane` se découpe en mixins.** Chaque module de domaine exporte
une fonction `(Base) => class extends Base { … }` ; le point d'entrée compose :

```js
class Ariane extends avecTaches(avecNotes(avecIa(avecCore(obsidian.Plugin)))) {
  async onload() { … }
}
```

Ce motif a trois propriétés qui comptent ici : les sites d'appel restent
identiques (`this.machin()` continue de fonctionner), les méthodes statiques
s'héritent le long de la chaîne (`Ariane.refDepuisChemin` reste joignable), et
la phase 2 se réduit à composer des chaînes de mixins différentes par greffon.

**Les tests ne changent pas.** `tests/obsidian-factice.js` charge `../main.js` ;
`npm test` construit d'abord, teste ensuite. La suite de 402 tests reste le
filet de sécurité de tout le chantier.

### Phase 2 — trois paquets

```
packages/
├── core/           non publié, consommé par les deux autres
├── ariane-note/    manifest.json, styles.css, build → main.js
└── ariane-task/    manifest.json, styles.css, build → main.js
```

Chaque greffon compose sa propre chaîne de mixins et embarque `core` dans son
bundle (pas de dépendance runtime entre greffons, conformément à la règle
d'août).

## 5 · Contraintes qui traversent tout le chantier

- **Octets NUL.** `main.js` contient 7 octets NUL (chaînes sentinelles
  `'\0sans'`, clé d'arête d'articulation). `grep -a` obligatoire, jamais
  `sed -i`. Toute réécriture globale se contrôle par
  `tr -cd '\000' < main.js | wc -c`. Le build doit les préserver : un test le
  vérifie.
- **Identifiants de vue gelés** (D4).
- **`data.json` ne se copie jamais** vers le coffre : ce sont les réglages de
  l'utilisateur.
- **Le balisage en régions reste la carte** tant que le fichier est unique.
  `tests/structure.test.js` en est le garde-fou ; il évolue avec la structure,
  il ne se désactive pas.
- **Zéro changement fonctionnel** dans tout le chantier. Une phase qui modifie
  un comportement observable a débordé.

## 6 · Migration utilisateur (phase 2)

À la phase 2, l'utilisateur passe d'un greffon à deux. Trois points :

1. **Réglages.** `data.json` d'`obsidian-ariane` contient les clés des deux
   domaines. Chaque nouveau greffon lit l'ancien `data.json` au premier
   démarrage s'il n'a pas encore le sien, y prend les clés qui le concernent,
   et écrit son propre fichier. L'ancien n'est jamais modifié ni supprimé.
2. **Vues.** Les identifiants étant gelés, les `.base` existants continuent de
   résoudre — à condition que le greffon qui enregistre la vue soit activé.
3. **Désactivation de l'ancien.** L'utilisateur désactive `obsidian-ariane`
   lui-même. Aucun code ne touche à l'installation d'un autre greffon.

Les deux greffons publiés partent de `2.79.0` et non de `1.0.0` : ils
continuent l'historique d'Ariane, et repartir à 1.0.0 ferait proposer une
« mise à jour » régressive aux installations existantes.

## 7 · Ce que la phase 1 ne fait pas

- Pas de découpage en greffons — c'est la phase 2.
- Pas de TypeScript. Le fichier est en JS ; le convertir doublerait le risque
  d'un chantier déjà large, sans bénéfice pour ce qui est visé ici.
- Pas de changement fonctionnel, pas de correction de bug opportuniste, pas de
  renommage d'API publique.
