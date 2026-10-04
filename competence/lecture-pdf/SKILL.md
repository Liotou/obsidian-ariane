---
name: "lecture-pdf"
description: "Lit le PDF que Monsieur a ouvert dans Obsidian (lecteur ZotFlow de Zotero, ou PDF du coffre) : retrouve seul le document et la page affichée, lit les pages dans le PDF lui-même (texte, tableaux, figures), cherche dans tout le livre, et s'appuie sur ses surlignages et commentaires Zotero. À utiliser dès que Monsieur parle « du PDF », « du livre », « de l'article », « de cette page », « de ce chapitre », « de ce passage », de « ce que je lis », de ses surlignages ou de ses annotations, même sans nommer le document."
---

# Lire avec Monsieur le PDF qu'il a ouvert

Monsieur lit ses PDF dans Obsidian, le plus souvent dans le lecteur
**ZotFlow** (sa bibliothèque Zotero). Claudian ne vous transmet pas ces
PDF : c'est à vous de les retrouver. Ne lui demandez jamais quel document il
lit ni où il se trouve, avant d'avoir fait l'étape 1.

## 1. Savoir ce qu'il lit

```bash
python3 ".claude/skills/lecture-pdf/ou-je-lis.py"
```

(Depuis la racine du coffre, le dossier de travail de Claudian.) Le script
lit, sans rien modifier, les onglets qu'Obsidian enregistre et la position de
lecture que ZotFlow garde. Il rend, pour le document lu en dernier puis pour
les autres PDF ouverts :

- le chemin du **PDF** sur le disque (pour ZotFlow, la copie que Zotero
  range dans `~/Zotero/storage/<clé>/`, le même document) ;
- la **page affichée**, numéro dans le fichier (1 = première page du PDF) ;
- le **texte intégral** déjà extrait par Zotero ;
- la **fiche source**, la **clé de citation**, et le dossier des **notes de
  surlignages** dans le coffre ;
- la commande pour lire ses **surlignages à jour**.

La page est celle que ZotFlow a enregistrée : après un saut tout récent,
elle peut avoir une page de retard. Si Monsieur dit « cette page » et que le
contenu ne colle pas, lisez aussi la suivante et la précédente.

Si le PDF est « ABSENT » (pas téléchargé par Zotero sur ce Mac), dites-le
simplement ; ne cherchez pas de copie ailleurs.

## 2. Lire les pages

Lisez le PDF vous-même avec l'outil **Read** et son paramètre `pages`
(par exemple `pages: "12-14"`) : vous voyez le texte, les tableaux et les
figures. Un PDF de plus de dix pages exige `pages`, vingt pages au plus par
lecture. Pour « cette page », lisez la page affichée ; pour « ce chapitre »,
trouvez d'abord ses bornes (sommaire, ou recherche ci-dessous).

**Numéros de page.** Ceux du fichier ne sont pas ceux imprimés : dans un
livre, la page 100 du fichier porte souvent un autre numéro (92, par
exemple). Quand vous citez, donnez toujours le **numéro imprimé**, celui que
Monsieur retrouvera dans le livre. La recherche ci-dessous donne les deux.

## 3. Chercher dans tout le document

```bash
swift ".claude/skills/lecture-pdf/chercher.swift" "<chemin du PDF>" mots à chercher
```

Lecture native par macOS (PDFKit), quelques secondes pour six cents pages.
Rend les pages qui contiennent tous les mots (casse et accents ignorés),
avec le numéro imprimé et un extrait. Puis lisez les pages retenues
(étape 2). Ne répondez pas sur la foi des seuls extraits.

## 4. Ses surlignages et commentaires

Ce que Monsieur a surligné dit ce qui compte pour lui. Deux sources :

- **à jour** : `python3 ".claude/skills/lecture-pdf/surlignages.py" <clé> [--pages 40-60] [--couleur rouge]`
  lit la base de Zotero (lecture seule), y compris les surlignages tout
  récents. Pages = numéros **imprimés**. Chaque entrée donne la page, la
  couleur, le passage exact et son commentaire ;
- **dans le coffre** : `02 - Annotations/@<clé de citation>/`, une note par
  surlignage (passage cité, commentaire, page, couleur), que ses autres
  notes citent par `[[<clé du surlignage>|…]]`.

Les couleurs : surtout jaune, puis rouge et vert. Leur sens n'est pas fixé :
ne lui en prêtez pas ; s'il en parle, demandez-le-lui.

Usages : « qu'ai-je surligné dans ce chapitre ? », « résume mes passages en
rouge », « ce que je pensais de ce passage » (son commentaire), ou, pour une
question sur le livre, partir de ses surlignages des pages concernées
avant de lire le reste.

## 5. Ses notes qui parlent de ce document

Cherchez dans le coffre (Grep) la clé de citation `@<clé>` et les clés de
ses surlignages : ses notes de lecture et livrables qui citent déjà ce
document ou ce passage. Signalez-les quand elles éclairent la question.

## Répondre

- Citez **mot pour mot**, entre guillemets français, avec la page imprimée :
  « … » (p. 92). Jamais de citation reconstituée de mémoire ni de
  paraphrase présentée comme une citation.
- Pour renvoyer à la source dans une note : `[[@<clé de citation>]]`.
- Distinguez ce que dit le texte, ce que Monsieur en a dit (ses
  commentaires), et votre propre lecture.
- Ne recopiez pas de longs passages : résumez, et citez l'essentiel.
- Conservez à l'identique noms propres, sigles et termes techniques.
- Ne modifiez ni le PDF, ni ses surlignages, ni la base de Zotero : tout
  ici est en lecture seule.

## Ton

Vouvoyez Monsieur et appelez-le « Monsieur ». N'employez jamais le tiret
cadratin ni le demi-cadratin : deux-points, virgules ou parenthèses à la
place.
