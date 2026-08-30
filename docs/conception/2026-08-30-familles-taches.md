# Conception — Familles de tâches personnalisables

**But :** rendre les familles de tâches **configurables dans les réglages**
(nombre illimité), chacune avec une couleur, une icône et des propriétés
qu'elle ajoute à une tâche normale. La vue Articulation colore et illustre
ses cartes par famille. Le contenu des cartes, lui, est piloté par la base
native (bouton « Propriétés », filtre, tri), pas par la famille.

**Spécification amont :** `docs/conception/2026-08-28-systeme-de-taches.md`,
`docs/conception/2026-08-30-articulation-vue-base.md`.

---

## Contraintes globales

- **Le frontmatter est la seule source de vérité.** La famille d'une tâche
  vit dans le champ `famille`. Rien n'est déduit d'un dossier ou d'un préfixe.
- **Aucune écriture qui ne change rien.**
- **Les familles par défaut (`lecture`, `production`, `action`) sont
  préchargées** dans les réglages : le comportement actuel est conservé sans
  migration de notes.
- **Fonctions pures pour tout ce qui se raisonne.** `Ariane.familleTache`,
  `Ariane.proprietesManquantes` sont statiques et testées par `node --test`.
- **Ne pas confondre** `famillesTaches` (ce document) avec `famillesNotes`
  (côté Zotero : dossiers, préfixes, alias). Deux réglages distincts.
- **Hors périmètre v1 :** formulaire de saisie Templater par famille,
  capture LLM, valeurs par défaut de propriété, règles de déduction
  configurables (l'ancienne déduction reste en dur comme repli).

---

## 1. Modèle de données

### 1.1 Définition d'une famille (réglages)

`this.settings.famillesTaches` : tableau d'objets.

```
{
  id: 'lecture',            // slug, valeur écrite dans `famille:`
  nom: 'Lecture',
  couleur: '#4c78c9',
  icone: 'book-open',       // nom d'icône Lucide
  proprietes: [             // propriétés que la famille ajoute à une tâche
    { cle: 'source',   libelle: 'Source',   type: 'lien'  },
    { cle: 'pages',    libelle: 'Pages',    type: 'texte' }
  ]
}
```

`type` ∈ `texte | nombre | date | case | liste | lien`. Ce vocabulaire FR se
mappe sur les types Obsidian via la table déjà utilisée par le menu
« Type » de l'en-tête de frise (`text | number | date | checkbox | multitext |
link`).

`DEFAULT_SETTINGS.famillesTaches` préchargé :

| id | nom | couleur | icône | propriétés |
|---|---|---|---|---|
| `lecture` | Lecture | `#4c78c9` | `book-open` | `source` (lien) |
| `production` | Production | `#e0873d` | `file-pen` | `livrable` (lien), `fichier` (texte) |
| `action` | Action | `#6aa84f` | `zap` | — |

Réglage annexe : **`familleTacheDefaut`** (menu, défaut `action`) — famille
appliquée à une tâche dont `famille` est vide et que l'ancienne déduction ne
tranche pas.

### 1.2 Champ `famille` sur la tâche

- `corpsNouvelleTache` émet toujours une ligne `famille:` (vide), placée après
  `type: tache`.
- `famille` est **enregistrée comme propriété typée** auprès d'Obsidian au
  `onload` : `app.metadataTypeManager.setType('famille', 'text')` — un simple
  texte, mais on alimente l'autocomplétion en s'assurant qu'au moins une note
  existante la porte. (Obsidian n'a pas de vrai type « enum » exposé par
  l'API ; le menu déroulant se fait côté carte, cf. §3.3.)

---

## 2. Fonctions pures

### 2.1 `Ariane.familleTache(fm, familles, defaut)`

Signature élargie (les appelants passent `this.settings.famillesTaches` et
`this.settings.familleTacheDefaut`). Ordre de résolution :

1. `fm.famille` non vide **et** présent dans `familles` → cet id.
2. Sinon, ancienne déduction : `champTache(fm).retenu === 'source'` → `lecture`
   si `lecture` existe ; `retenu` truthy → `production` si elle existe.
3. Sinon → `defaut` (qui vaut `action` en fabrique).

Rétro-compatibilité : appelée sans `familles`, se comporte comme aujourd'hui
(les tests existants passent inchangés — on garde une branche `if (!familles)`).

### 2.2 `Ariane.proprietesManquantes(fm, famille)`

Rend la liste des `{cle, type}` déclarés par `famille.proprietes` **absents**
des clés de `fm`. Sert au rattrapage §3.1. Pure, testée (fm vide, fm complet,
fm partiel, famille sans propriétés).

### 2.3 Table de types

`Ariane.TYPE_FR_VERS_OBSIDIAN = { texte:'text', nombre:'number', date:'date',
case:'checkbox', liste:'multitext', lien:'link' }` — extraite de l'inline du
menu « Type » pour être partagée entre frise et familles.

---

## 3. Comportement

### 3.1 « La famille ajoute des propriétés »

Au chargement d'une vue de tâches (frise ou articulation) et après chaque
`onDataUpdated`, pour chaque tâche du jeu : si `famille` est renseignée et que
`Ariane.proprietesManquantes` renvoie une liste non vide, écrire ces clés
(valeur vide) dans le frontmatter via `processFrontMatter`. Une seule passe,
groupée, silencieuse. Garantit que « une tâche de famille X porte les champs de
X » quel que soit le mode de création (bouton « Nouveau » natif de Bases,
`creerTache`, copie manuelle).

Garde-fou anti-boucle : ne réécrit que si au moins une clé manque réellement
(respecte « aucune écriture qui ne change rien »).

### 3.2 Réglages — éditeur de familles

Onglet **Tâches**, nouvelle section « Familles de tâches », sous les réglages
`dossierTaches` / `listeRappelsDefaut`.

Liste répétable calquée sur `_tableFamilles` (familles de notes) :

- glisser-déposer pour réordonner, boutons monter / descendre / supprimer ;
- bouton « Ajouter une famille » en bas ;
- si la liste est vide, bouton « Recharger les familles par défaut ».

Chaque ligne de famille — en-tête :

| contrôle | champ | notes |
|---|---|---|
| poignée | — | `grip-vertical`, glisser pour réordonner |
| texte | `id` | slug ; `slugifier()` au `blur` ; unicité vérifiée, sinon bord rouge |
| texte | `nom` | libellé affiché |
| `input[type=color]` | `couleur` | |
| texte + aperçu | `icone` | `setIcon` sur un span d'aperçu, revalidé au `change` |
| boutons | monter / descendre / supprimer | |

Corps de la ligne — sous-liste « Propriétés ajoutées » :

- une rangée par propriété : texte `cle`, texte `libelle`, menu `type`
  (6 entrées FR), bouton supprimer ;
- bouton « Ajouter une propriété ».

Renommer un `id` **ne migre pas** les notes existantes : un avertissement
discret sous le champ le rappelle (« les tâches déjà rattachées gardent
l'ancien identifiant »).

Menu `familleTacheDefaut` : `Setting` avec `addDropdown`, options = ids des
familles.

### 3.3 Vue Articulation — cartes pilotées par la base

**Contenu de carte = propriétés cochées dans le sélecteur natif
« Propriétés ».** `dessinerNoeud` lit `this.config.getOrder()` et rend une
rangée par propriété, dans l'ordre de la base, via le widget de type
(`registeredTypeWidgets[type].render`, même `ctx` que la frise → édition en
place, `onChange` → `greffon.majTache(ref, { [cle]: v })`).

- **Filtre natif** : les nœuds se limitent à `this.data.data` (déjà filtré par
  Bases). `tachesDuGraphe()` part de ce jeu ; une tâche exclue disparaît avec
  ses arêtes. Le grimpage d'ancêtres est conservé mais borné au jeu filtré.
- **Tri natif** : `config.serialize().sort` fournit l'ordre d'entrée de
  `placerGraphe`. **Le tri ne réordonne que les nœuds sans `canvas-x/y`** ;
  un nœud placé à la main reste où il est. `placerGraphe` reçoit donc les
  nœuds déjà ordonnés et n'attribue de position qu'aux nœuds libres.
- **Champ `famille` sur la carte** : rendu comme un menu déroulant maison
  (`<select>` peuplé des `nom` de `famillesTaches`), toujours présent en
  pied de carte quel que soit le sélecteur natif. `onChange` →
  `majTache(ref, { famille: id })` puis rafraîchissement (couleur + icône +
  rattrapage §3.1).
- **Couleur et icône** : fin du hard-code
  `{lecture:'book-open', production:'file-pen', action:'zap'}`. La carte lit
  `familleDe(n.famille)` dans les réglages : bord gauche =
  `couleur`, badge `.zfa-artic-fam` = `setIcon(el, famille.icone)`, plus une
  variable CSS `--zfa-fam-couleur` posée sur le nœud pour teinter le badge.
  Famille inconnue → gris `#888`, icône `circle`.

### 3.4 Modes de carte

Bascule **Rétracté / Détaillé** dans la barre de vue Articulation, mémorisée
dans le `.base` (option de vue `modeCarte`, valeurs `retracte | detaille`,
défaut `retracte`).

- **Rétracté** : titre + badge famille + échéance + jauge d'avancement.
  Hauteur fixe `ARTIC_H`. Les propriétés cochées ne sont pas montrées.
- **Détaillé** : + les propriétés cochées, empilées. Carte à hauteur variable
  (mesurée après rendu, `ARTIC_H` + n × hauteur de rangée). Chaque carte
  porte un chevron **déplier / replier ses propriétés** ; l'état plié/déplié
  par carte est local à la session (Map dans le moteur, pas de frontmatter).

`placerGraphe` et les arêtes lisent la hauteur effective de chaque nœud
(`n.h`), plus jamais `ARTIC_H` en dur — même principe que `ligne.h` dans la
frise.

### 3.5 Nettoyage

- Suppression du bouton **« + Tâche »** de la barre Articulation
  (`boutonBarre(barre, 'plus', …)` + méthode `ajoutRapide`). Le bouton
  **« Nouveau »** natif de Bases crée la tâche (source de la base = dossier
  des tâches). `creerTache` reste (utilisée par la capture et les commandes).
- Barre Articulation après nettoyage : **Ajuster · Redisposer ·
  Rétracté/Détaillé**.

---

## 4. Réglages — récapitulatif

| clé | type | défaut | onglet |
|---|---|---|---|
| `famillesTaches` | tableau | 3 familles préchargées | Tâches |
| `familleTacheDefaut` | chaîne | `action` | Tâches |

Option de vue Articulation (`.base`) : `modeCarte` (`retracte` \| `detaille`).

---

## 5. Tests

`tests/familles-taches.test.js` :

- `familleTache` : champ explicite connu / explicite inconnu → repli /
  déduction `source` → `lecture` / déduction `livrable` → `production` /
  rien → `familleTacheDefaut` / appel legacy sans `familles` inchangé.
- `proprietesManquantes` : fm vide → toutes / fm complet → aucune / fm
  partiel → le reste / famille sans propriétés → aucune / clé présente mais
  vide → considérée présente.
- `TYPE_FR_VERS_OBSIDIAN` : les 6 correspondances.

`tests/articulation.test.js` : `placerGraphe` — un nœud avec `x/y` fixés
n'est pas déplacé même quand un tri est fourni (déjà couvert, on ajoute le
cas « tri + nœuds mixtes placés/libres »).

Les tests existants de `familleTache` (via `tachesPourGantt`) doivent passer
inchangés.

---

## 6. Ordre de mise en œuvre

1. `famillesTaches` + `familleTacheDefaut` dans `DEFAULT_SETTINGS` ;
   `TYPE_FR_VERS_OBSIDIAN` extrait et partagé.
2. `Ariane.familleTache` élargie + `Ariane.proprietesManquantes` + tests.
3. `corpsNouvelleTache` : ligne `famille:`. Enregistrement du type au `onload`.
4. Éditeur de familles dans `ongletTaches` (réutilise les briques de
   `_tableFamilles`).
5. Rattrapage des propriétés manquantes (§3.1) dans frise et articulation.
6. Articulation : cartes pilotées par `getOrder()` + widgets typés ;
   filtre/tri natifs ; couleur/icône par famille ; menu famille en pied.
7. Modes Rétracté/Détaillé + hauteur de nœud variable.
8. Nettoyage du bouton « + Tâche ».
9. `styles.css` : `--zfa-fam-couleur`, rangées de propriété, chevron de dépli.
10. README FR/EN, bump de version.
