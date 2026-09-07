# Ariane — consignes de travail

Greffon Obsidian. Plusieurs IA éditent ce dépôt à tour de rôle : ce fichier
porte les invariants qu'aucune ne doit découvrir à ses dépens.

## main.js est produit, pas édité

`main.js` est la **concaténation d'octets** des fragments de `src/`, dans
l'ordre de `src/ordre.json`.

```bash
npm run build      # écrit main.js depuis src/
npm test           # construit, puis lance la suite
npm run verifier   # échoue si main.js diverge de src/
```

Éditer `main.js` directement, c'est perdre son travail à la construction
suivante. Éditer le fragment. `tests/build.test.js` le rappelle.

**Ce n'est pas un empaqueteur, et c'est délibéré** : l'export « frise vivante »
sérialise `MoteurVue` et `MoteurFrise` par `Function.prototype.toString()` et
réévalue ce texte dans la page produite — tout outil qui renomme ou réordonne
casserait cet export en silence, chez l'utilisateur. esbuild a été essayé puis
écarté : il supprime les commentaires, donc le balisage `//#region`, la carte du
fichier et le socle de `tests/structure.test.js`. Le raisonnement complet est en
tête de `scripts/build.mjs`.

Conséquences pratiques : les fragments partagent **une seule portée** — ni
`import` ni `export`, et les noms de premier niveau doivent rester uniques.
Chaque fragment doit être du JavaScript valide au premier niveau (`npm run
check`), sinon une coupure mal placée ne se voit qu'au chargement du greffon.

## class Ariane est assemblée de mixins

`class Ariane extends composer(obsidian.Plugin, avecSocle, avecIa, …)`. Chaque
mixin est une fonction `(Base) => class extends Base { … }` dans son propre
`src/11*.js`, un par domaine. Rien ne change côté appel : `this.machin()` et
`Ariane.machin()` se résolvent le long de la chaîne d'héritage.

Deux règles, chacune tenue par un test de `tests/structure.test.js` :

- **Un membre n'est défini que dans un seul mixin.** La composition applique
  de gauche à droite : deux définitions du même nom se masqueraient en
  silence, et le vainqueur dépendrait de `src/ordre.json`.
- **Tout mixin déclaré est composé**, dans le même ordre. Un mixin oublié dans
  la liste, ce sont ses méthodes absentes du greffon — sans erreur au chargement.

Une méthode nouvelle va dans le mixin de son domaine, et dans la sous-région
`//#region Ariane · …` qui la concerne — pas en fin de fichier.

## Pièges déjà payés

- **Octets NUL.** `main.js` en contient (chaînes sentinelles : `SANS_GROUPE`
  vaut `'\0sans'`, plus la clé d'arête d'articulation). `grep` bascule en mode
  binaire : toujours `grep -a`. **Jamais `sed -i`**, qui les mange ; `perl -0pi`
  et les outils d'édition les préservent. Contrôle :
  `tr -cd '\000' < main.js | wc -c`.
- **Multi-fenêtre.** Dans un volet détaché, `document` et `window` globaux sont
  ceux de la fenêtre **principale**. Les trois moteurs de vue héritent de
  `MoteurVue` et passent par `this._doc()` / `this._win()` pour tout
  `createElement`, tout écouteur `pointermove`/`pointerup` et tout
  `requestAnimationFrame`. Ne jamais réintroduire un `_doc()` local.
- **Index des tâches.** `Ariane.refDepuisChemin` ne lit que le **chemin** :
  `_indexTaches()` s'invalide donc sur `create`/`delete`/`rename` et
  `saveSettings`, pas sur `modify`.
- **Identifiants de vue gelés** : `ariane-frise`, `ariane-articulation`,
  `ariane-calendrier`, `zfa-references`, `zfa-taches-incoherences`,
  `zfa-suggestions`. Les fichiers `.base` de l'utilisateur les référencent.
- **JXA / EventKit** (synchro Apple) : `authorizationStatusForEntityType`
  renvoie une **chaîne**, la passer par `Number()` ; `null` en argument objet
  ObjC devient `NSNull` et plante — utiliser `$(tableau)` ; lire la couleur d'un
  `EKCalendar` provoque un SIGBUS (les couleurs passent par AppleScript) ;
  le champ URL d'un événement est `e.URL`, pas `e.url` ; l'identité stable d'un
  `EKEvent` est `eventIdentifier`.

## Déploiement dans le coffre

```bash
cp main.js styles.css manifest.json "$HOME/Obsidian Vault/.obsidian/plugins/obsidian-ariane/"
```

**Jamais `data.json`** : ce sont les réglages de l'utilisateur. Et ne pas
synchroniser le coffre sans que Monsieur l'ait demandé — il teste lui-même.

## Balisage

Deux niveaux, tous deux repliables :

- niveau 1, colonne 0 : `//#region N · Titre` … `//#endregion N · Titre`.
  Un fragment de `src/` = une section. Ajouter une section, c'est renuméroter
  les suivantes **et** la carte en tête de `src/00-entete.js`.
- niveau 2, indenté de 2 espaces, dans les grosses classes :
  `//#region Ariane · <domaine>`, `Frise · …`, `Articulation · …`,
  `Calendrier · …`.

`tests/structure.test.js` échoue si les bornes se dépareillent, si la
numérotation saute, si la carte diverge, ou si un garde-fou multi-fenêtre
retombe sur le `document` global. Il a déjà rattrapé plusieurs erreurs réelles :
le réparer, pas le contourner.

## Ariane est UN SEUL greffon

La scission en plusieurs greffons a été étudiée deux fois — quatre paquets en
août, trois en septembre — puis **abandonnée le 2026-09-07** : l'utilisateur ne
veut qu'un greffon. Les deux specs sont archivées dans `docs/superpowers/specs/`
avec la raison, pour qu'une troisième étude ne reparte pas de zéro.

Le découpage de `src/` et les mixins de `class Ariane` **restent** : ils ne
préparaient pas la scission, ils existaient pour eux-mêmes. Ne pas les défaire
sous prétexte que la scission est annulée, et ne rien échafouder du côté
`packages/` sans relance explicite de l'utilisateur.

## Ne pas toucher

`zotflow-*` et `famillesNotes` : ce sont d'autres greffons, ou des réglages qui
ne relèvent pas d'ici.
