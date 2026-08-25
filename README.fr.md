# Ariane

> 🤖 **Écrit en vibe coding avec Claude.** Ce greffon a été conçu et programmé en
> conversation avec Claude (Anthropic), à partir des besoins réels d'un
> doctorant. Je ne suis pas développeur. Je décris ce dont j'ai besoin, je
> teste, je corrige, et le code prend forme au fil des échanges. Je le dis
> d'emblée, par honnêteté, pour que vous sachiez ce que vous installez. Le code
> est lisible, commenté, et sans dépendance : un seul fichier `main.js`, ni
> TypeScript, ni bundler, ni `npm`.
>
> *English: see [README.md](README.md).*

🔗 **Ariane est le compagnon d'aval de [ZotFlow](https://github.com/duanxianpi/zotflow).**
ZotFlow fait entrer Zotero dans Obsidian : références, pièces jointes,
annotations, notes. Ariane prend le relais et travaille cette matière. Elle
l'atomise, la relie, la cite et l'exporte. Sans ZotFlow, Ariane n'a rien à se
mettre sous la dent.

🌍 Interface disponible en **français et en anglais**.

---

## 🧭 Sommaire

- [⚠️ Avant de commencer](#-avant-de-commencer)
- [⚛️ Atomiser](#-atomiser)
- [🧮 Une base pour vos annotations](#-une-base-pour-vos-annotations)
- [🔖 Citer Zotero, en direct](#-citer-zotero-en-direct)
- [🖱️ Glisser-déposer](#-glisser-déposer)
- [🪗 Replier les citations](#-replier-les-citations)
- [🏷️ L'aparté](#-laparté-ou-comment-lire-les-noms-codés)
- [✨ Suggestions](#-suggestions)
- [↩️ Retour vers Zotero](#-retour-vers-zotero)
- [📚 Bibliographies](#-bibliographies)
- [⏳ Références en attente](#-références-en-attente)
- [👥 Auteurs](#-auteurs)
- [📝 Exporter vers Word](#-exporter-vers-word)
- [⏱️ Compter le temps](#-compter-le-temps)
- [🧹 Outils d'entretien](#-outils-dentretien)
- [🗂️ S'adapter à votre organisation](#-sadapter-à-votre-organisation)
- [⌨️ Commandes](#-commandes)
- [📦 Installation](#-installation)

---

## ⚠️ Avant de commencer

À lire en premier. Tout le reste en dépend. 🧱

Ariane ne lit pas votre PDF, elle lit ce que **vous** avez écrit dans Zotero. La
manière dont vous rédigez le commentaire de vos annotations est donc le contrat
entre les deux outils, et la pièce maîtresse de ce contrat, c'est le **titre**.

La forme attendue, avec le profil livré par défaut, est celle-ci :

```
**Un titre court pour cette idée**
Votre paraphrase, avec vos mots, sur autant de lignes que vous voulez.
*(Fan et al., 2022 ; Stål et al., 2023)*
```

Trois lignes, trois rôles :

1. 🏷️ **Le titre, en gras, sur la première ligne. Celui-là est obligatoire.**
   Il devient le nom de la note, l'étiquette que vous lisez dans l'explorateur,
   dans le panneau de suggestions et dans chaque lien qui pointe vers cette
   annotation.
2. ✍️ **La paraphrase**, sur les lignes suivantes. Facultative, et libre.
3. 📎 **Les références citées, en italique, sur la dernière ligne.** Facultatives
   elles aussi. Voir plus bas.

Sachez ce qui se passe sans titre : par défaut, une annotation dont le
commentaire ne commence pas par une ligne en gras n'est **pas atomisée du tout**.
Elle ne devient pas une note mal nommée, elle est simplement écartée, et le
passage reste dans Zotero sans jamais rejoindre votre coffre.

🩹 Ce comportement se lève. Dans *Avancé → Annotations sans titre*, activez
**Atomiser les annotations sans titre** : le commentaire entier devient alors la
paraphrase, et Ariane en déduit un titre, en coupant à la fin de la première
phrase ou au dernier mot entier. Vous choisissez si le titre vient du
commentaire ou du texte surligné, et sur quelle longueur. Cela fonctionne bien,
et cela reste un repli : un titre que vous avez écrit vaudra toujours mieux
qu'un titre deviné.

L'habitude à prendre est donc toujours la même : surligner, écrire un titre en
gras, puis paraphraser. Cela coûte quelques secondes par annotation, et c'est ce
qui rend tout le coffre navigable ensuite.

🤖 **Vous n'êtes pas obligé de l'écrire à la main.** Je maintiens un second
plugin pour cela, côté Zotero : [**Annota**](https://github.com/Liotou/zotero-annota).
Vous attribuez une consigne à chaque couleur de surlignage et, au moment où vous
surlignez un passage, le modèle rédige le commentaire pour vous, déjà mis en
forme : titre en gras, paraphrase, références en italique. La consigne
académique fournie avec produit exactement la structure décrite ci-dessus, ce
qui n'est pas un hasard. Annota est facultatif et indépendant, Ariane n'en a
jamais besoin, mais c'est lui qui transforme la discipline en réflexe.

📐 **Cette forme n'est pas imposée.** Si votre propre convention diffère,
l'onglet *Analyse* permet de la décrire : un profil, c'est un couple
d'expressions régulières, une pour le titre et une pour la ligne de référence.
Vous pouvez en déclarer plusieurs, et Ariane retient le premier qui correspond.
Le profil par défaut ne fait que suivre ce qu'écrit ZotFlow.

### 📎 Les références citées, entièrement facultatives

La dernière ligne en italique sert aux travaux que le passage **rapporte** sans
en être l'auteur, ceux que vous écririez avec un « cité dans ».

```
**Deux modes de production de la connaissance**
Les auteurs distinguent le mode 1 du mode 2 et reprennent le cadrage antérieur.
*(Gibbons, 1994 ; Nowotny et al., 2001)*
```

N'y écrivez rien et vous ne perdez rien : l'annotation est atomisée comme
d'habitude, avec son titre et sa paraphrase. Écrivez-la et Ariane la prend en
charge. Elle transforme chaque nom en référence en attente, regroupe en une
seule citation les travaux rapportés par la même source, vérifie si le travail
rapporté figure déjà dans votre bibliothèque Zotero et le cite directement le
cas échéant. Elle en tire aussi les pages d'auteurs et de références en attente.

C'est un ajout, jamais une obligation. 🙂

---

## ⚛️ Atomiser

Chaque annotation Zotero devient une note autonome, à l'identité stable, qui
survit aux régénérations. Renommez la note, retouchez sa paraphrase, déplacez-la :
le lien vers la source tient.

Les **notes-filles Zotero**, celles attachées à la référence entière plutôt qu'à
un passage, deviennent des notes de lecture à part entière, citables et reliées
à leur source. Les citations Zotero qu'elles contiennent sont converties au
passage, si bien qu'elles nourrissent votre bibliographie comme les autres.

Trois comportements, activables séparément :

- la **régénération** : quand la source change, les annotations sont refaites ;
- la **propagation des suppressions** : quand une annotation disparaît de
  Zotero, sa note est supprimée et ses liens retirés. Destructif, donc désactivé
  par défaut ;
- le **verrouillage** : les notes produites portent `locked: true` et ne peuvent
  pas être modifiées par inadvertance.

Les annotations qu'aucune note ne cite peuvent être **taguées** automatiquement,
ce qui permet de les colorer dans le graphe et de voir d'un coup d'œil ce que
vous avez lu sans jamais l'employer.

## 🧮 Une base pour vos annotations

L'atomisation vous donne des milliers de petites notes. Pour les voir vraiment,
Obsidian dispose des **Bases**, sa vue en base de données intégrée, et Ariane
écrit précisément les propriétés dont une base a besoin. Cette vue **n'est pas
livrée avec le plugin** : une base est un fichier de votre coffre, à vous de la
façonner, voici donc tout ce qu'il faut pour la construire. Une base toute faite
se trouve dans [`docs/annotations.base`](docs/annotations.base), à copier dans
votre coffre et à ouvrir telle quelle. 📋

### Ce qu'Ariane écrit sur chaque note d'annotation

| Propriété | Contenu |
| --- | --- |
| `aliases` | le titre de l'annotation, le nom lisible |
| `zotflow-anno-key` | la clé Zotero de l'annotation, stable d'une régénération à l'autre |
| `zotflow-source` | un lien vers la fiche source, `[[@auteurTitre2020]]` |
| `ordre` | position de l'annotation dans le document |
| `page` | page dans le PDF |
| `couleur` | couleur du surlignage Zotero, en toutes lettres |
| `références-citées` | liens vers les travaux secondaires que le passage rapporte |
| `références-pages` | la page indiquée pour chacun d'eux |
| `collections` | les collections Zotero, de la racine à la feuille |
| `zotflow-auto`, `zotflow-locked` | note générée, note verrouillée |
| `tags: orphelin` | ajouté aux annotations qu'aucune note ne cite |

Les fiches source viennent de ZotFlow et portent `citationKey`, `title`,
`creators`, `year`, `itemType`, `zotero-key` et `collections`. Depuis une
annotation, une base les atteint par `asFile()`, et c'est ce qui fait tenir
l'ensemble.

### Les formules

```yaml
formulas:
  source: note["zotflow-source"]
  appels: file.backlinks.length
  auteurs: note["zotflow-source"].asFile().properties["creators"]
  annee: note["zotflow-source"].asFile().properties["year"]
```

`source` vous donne un lien cliquable vers la référence. `appels` compte combien
de notes citent cette annotation, et c'est la colonne la plus utile de toutes :
elle sépare la matière que vous avez exploitée de celle que vous avez seulement
récoltée. Les deux dernières vont chercher dans la fiche source l'auteur et
l'année, ce qui permet de trier les annotations par auteur sans quitter le
tableau.

### Trier par collection Zotero

`collections` est une liste qui va de la racine jusqu'au dossier le plus
profond, par exemple `My Library`, `Doctorat`, `04 - Risques`, `Risque
systémique`. Les deux premières ne portent aucune information, on les écarte, et
ce qui reste est votre véritable chemin thématique :

```yaml
formulas:
  chemin: note["collections"].filter(value.toString().containsAny("My Library", "Doctorat") == false).join(" › ")
  collection: note["collections"].filter(value.toString().containsAny("My Library", "Doctorat") == false).reverse().slice(0, 1).join("")
```

`chemin` affiche le chemin entier, `collection` ne garde que le dernier élément,
la sous-collection la plus fine, qui est la bonne clé de regroupement. Remplacez
les deux noms par ce que votre propre bibliothèque place en tête.

```yaml
    groupBy:
      property: formula.collection
      direction: ASC
```

Regroupez un tableau ainsi et vous lisez votre corpus par thème plutôt que par
référence : toutes les annotations sur le risque systémique ensemble, quel que
soit l'ouvrage d'où elles viennent. **Obsidian inscrit le nombre de lignes dans
l'en-tête de chaque groupe : regrouper, c'est déjà compter.** 🔢

### Compter les annotations par source

L'autre sens, c'est un tableau dont les lignes sont les **sources**, avec le
nombre d'annotations que chacune a produites. Les rétroliens vous le donnent :

```yaml
formulas:
  annotations: file.backlinks.filter(value.asFile().path.startsWith("1 - Annotations/")).map(value.asFile().path).unique().length
  jamaisCitees: file.backlinks.filter(value.asFile().path.startsWith("1 - Annotations/")).filter(value.asFile().hasTag("orphelin")).map(value.asFile().path).unique().length
```

Cela se lit de l'intérieur vers l'extérieur : prendre tout ce qui pointe vers
cette source, ne garder que ce qui vit dans le dossier des annotations, réduire
chaque élément à son chemin, retirer les doublons, compter. Les étapes `map` et
`unique` ne sont pas décoratives : une annotation pointe deux fois vers sa
source, une fois dans ses propriétés et une fois dans son corps, et sans elles
chaque source compterait double. `jamaisCitees` ajoute un filtre et vous dit
quelle part de vos lectures n'a jamais servi.

Filtrez la vue sur `file.hasProperty("zotero-key")` pour ne garder que les
fiches source de ZotFlow, puis triez sur `formula.annotations` en ordre
décroissant. Vous obtenez votre effort de lecture classé, du plus annoté au
moins annoté, avec la part inexploitée à côté. Adaptez `"1 - Annotations/"` au
nom de votre propre dossier.

### Les vues qui valent la peine

- **par source**, regroupée sur `formula.source` et triée sur `ordre` : les
  annotations d'un ouvrage dans l'ordre de lecture ;
- **par collection Zotero**, regroupée sur `formula.collection` et triée sur
  `formula.appels` en décroissant : vos thèmes, du plus exploité au moins ;
- **jamais citées**, filtrée sur `file.backlinks.length == 0` : ce que vous avez
  lu et jamais réemployé ;
- **compteur par source**, décrite ci-dessus ;
- **par couleur**, regroupée sur `note.couleur`, en cartes : utile si vos
  couleurs de surlignage portent un sens, définition, objection, méthode.

## 🔖 Citer Zotero, en direct

Les citations s'écrivent en clair dans vos notes :

```
([[CLE|Dresch et al., 2015, p. 63]] ; [[AUTRE|Gibbons, 1994, p. 12]])
```

Le libellé vient d'un modèle que vous réglez, par exemple
`{{auteurs}}, {{annee}}, p. {{page}}`. La citation se place avant la ponctuation
finale, comme le veut la typographie française.

**Les sources de seconde main.** Quand une annotation rapporte un travail que
vous n'avez pas lu, Ariane écrit « Fan et al., 2022 et Stål et al., 2023, cité
dans Raizada & Sinha, 2025, p. 1 ». Plusieurs travaux rapportés par une même
source sont réunis en une seule citation, ce qui empêche le style de citation
d'effacer le nom d'auteur du second. Si le travail rapporté figure lui-même dans
Zotero, il est cité directement, puisque vous pouvez le lire.

Plutôt que de nommer tous les travaux rapportés dans le fil du texte, la source
peut porter un **compteur**, dont le survol les affiche en liens cliquables.

## 🖱️ Glisser-déposer

C'est la façon la plus rapide de citer en écrivant.

![Des annotations glissées sur une phrase : les citations s'insèrent en ligne et la bibliographie se construit](docs/drag-and-drop.gif)

**Glissez une annotation, ou une source, sur une phrase.** Sa référence
s'insère en ligne, entre parenthèses, avant la ponctuation finale. Vous ne
quittez pas le fil de la frappe plus d'une seconde.

Dans l'enregistrement ci-dessus, trois annotations sont déposées l'une après
l'autre sur la même phrase. Chacune insère sa citation avant le point, et la
bibliographie de fin de note se construit à mesure.

La cible suit votre curseur : en survolant le **texte**, la citation se place en
fin de la phrase visée ; en survolant la **marge gauche** du paragraphe, elle se
place en fin de paragraphe. La zone visée est surlignée pendant le glisser, si
bien que vous voyez où elle tombera avant de lâcher.

Le **panier d'annotations**, ouvert depuis le ruban, permet d'en rassembler au
fil de la lecture, puis de poser l'ensemble d'un coup au moment d'écrire.
Glissez le panier sur un paragraphe, ou déposez-le au curseur, et toutes les
annotations qu'il contient arrivent en une seule citation.

![Des annotations rassemblées dans le panier, puis déposées d'un coup sur une phrase en une seule citation](docs/annotation-basket.gif)

Quatre annotations sont réunies ici, venues de trois sources différentes, et
tombent d'un seul geste en `(Aven et Renn, 2010, p. 49 ; Aven et Renn, 2010,
p. 65 ; Aven et Ylönen, 2019, p. 285 ; Babeau, 2025)`. La bibliographie suit
d'elle-même.

Deux détails qui ont demandé du travail :

- réutiliser une citation est une **copie**, jamais un déplacement. Sans le
  forcer, l'éditeur la retirait du paragraphe d'origine ;
- un lien rendu hors d'une vue markdown arrive avec un contenu vide, si bien
  qu'Ariane note l'élément glissé au départ du glisser, seul moment sûr.

Vous choisissez si n'importe quelle note peut être déposée ou seulement les
annotations, et si Ariane vous prévient quand un dépôt ne correspond à rien dans
le coffre, plutôt que de ne rien faire en silence.

## 🪗 Replier les citations

Une citation longue encombre la lecture. Repliée, elle cède la place à une
pastille portant le nombre de références qu'elle contient.

![Des citations repliées en pastilles numérotées en fin de phrase, qui se déplient au survol](docs/folding-citations.gif)

La note ci-dessus porte cinq citations et se lit d'un trait. Les pastilles
comptent respectivement deux, sept, deux, trois et une référence, et les
rendent dès qu'on en a besoin.

- un clic sur la pastille déplie cette citation seule ;
- les commandes, ou le bouton du ruban, replient ou déplient toute la note ;
- en édition, une citation se déplie d'elle-même dès que le curseur y entre, et
  se replie quand vous en sortez.

## 🏷️ L'aparté, ou comment lire les noms codés

Un coffre construit ainsi se remplit de noms que personne ne peut lire. Les
notes d'annotation portent le nom de leur clé Zotero, `6BH5SHHB`. Les notes
conceptuelles portent un horodatage, `NC-202607041635`. Ces noms sont excellents
pour la machine, stables et sans collision, et illisibles pour vous. L'aparté
vous rend la lecture sans toucher un seul caractère de vos fichiers. ✨

**Dans une note**, l'aparté affiche le titre juste après le lien, en lecture
comme en édition. Vous écrivez `[[6BH5SHHB]]` et vous lisez `[[6BH5SHHB]] Deux
modes de production`. Son format, sa couleur et sa taille se règlent, et vous
décidez famille par famille quelles notes en reçoivent un.

**Dans l'explorateur**, la même idée s'applique aux noms de fichiers. Ariane
peut afficher l'**alias plutôt que le nom de fichier**, et présenter les
dossiers de votre choix en **police à largeur fixe**, pour que la partie codée
s'aligne colonne par colonne.

![L'explorateur de fichiers affichant des noms de notes codés en police à largeur fixe, chacun suivi de son alias en italique](docs/explorer-alias.png)

Le dossier ci-dessus contient des notes conceptuelles. La référence est à
gauche, alignée et balayable du regard, et l'alias se lit à côté :
`NC-202607060948`, c'est *Design Science (Research)*, `NC-202607061244`, c'est
*Pensée systémique*. Vous gardez en même temps un identifiant stable et un nom
lisible, sans avoir à choisir entre les deux.

Les deux affichages ne sont que de la décoration. Le fichier sur le disque n'est
pas modifié, son nom non plus : la recherche, le tri, les rétroliens et les
autres plugins continuent de voir exactement ce qui a toujours été là. Coupez
l'option et tout revient à son nom codé.

## ✨ Suggestions

Un panneau latéral propose les notes les plus proches au fil de l'écriture.

Trois moteurs : **lexical** (mots en commun, aucune dépendance), **sémantique**
(le sens, par embeddings locaux) et **hybride**, qui combine les deux et reste
le choix recommandé. Tout est local, hors ligne et gratuit, par **Ollama ou
LM Studio**.

![Le panneau de suggestions, filtré par famille de notes, proposant des notes avec leur score de pertinence](docs/suggestions.gif)

- filtrez le panneau par famille de notes, avec la couleur et l'icône que vous
  leur avez données ;
- **clic droit sur un passage** pour obtenir des suggestions sur ce passage
  seul, et non sur la note entière ;
- **glissez une suggestion** directement dans votre texte pour la citer ;
- le bouton ✨ fait relire les meilleurs candidats par un modèle de langue
  local, à la demande seulement.

⚡ Ce dernier point compte. Le reclassement est de loin le poste le plus lourd du
greffon : il ne part jamais seul, il est borné en longueur de réponse comme en
durée, et rien n'est calculé tant que le panneau n'est pas réellement visible.

## ↩️ Retour vers Zotero

Un bouton dans le lecteur ZotFlow, et une commande, vous ramènent à Zotero au
bon endroit :

- depuis le **lecteur**, Zotero ouvre le même PDF à la page où vous étiez ;
- depuis une **note d'annotation**, Zotero ouvre le PDF et se place sur le
  surlignage même ;
- depuis une **fiche source**, Zotero ouvre sa pièce jointe, ou sélectionne la
  référence s'il n'y en a pas.

## 📚 Bibliographies

**En fin de note.** Ariane relève les sources citées dans le corps et entretient
une bibliographie entre deux marqueurs, à la manière de Zotero dans Word. La
mise en forme est celle que ZotFlow a déjà produite, donc votre style de
citation est respecté. Chaque entrée reçoit un lien cliquable placé à sa suite,
jamais autour, afin de préserver les italiques du style.

Tri par auteur ou par ordre d'apparition, régénération dans la note active ou
dans tout le coffre.

**Par source.** Ariane peut récupérer les travaux qu'une source cite elle-même,
via Crossref et OpenAlex, et les inscrire dans une note dédiée. Renseignez une
adresse électronique et les deux services vous accordent de meilleures limites.

## ⏳ Références en attente

Une référence citée par une de vos annotations mais absente de Zotero n'est pas
perdue. Ariane la garde comme note provisoire et tente de la rattacher à une
vraie fiche Zotero, par auteurs et année.

Les correspondances certaines, où un seul appariement est possible, sont
rattachées sans rien demander. Pour les cas **ambigus**, vous choisissez :
les ignorer, laisser un modèle de langue local trancher, ou être interrogé à
chaque fois. Une décision prise à la main est retenue et jamais reposée, et un
bouton permet d'effacer ces souvenirs.

Une commande traite aussi le cas classique du **2005a et 2005b**, où vous liez
vous-même une référence à la bonne fiche Zotero.

## 👥 Auteurs

Ariane peut tenir une note par auteur, listant ses sources. Les noms d'auteurs
arrivent sous bien des formes : une commande repère les **doublons**, regroupe
les variantes, et vous laisse cocher celles à fusionner et la fiche à conserver.

## 📝 Exporter vers Word

Le point le plus délicat, et le plus abouti : un export `.docx` **avec des
champs Zotero actualisables**, et non du texte figé. Vous rouvrez le document
dans Word, vous cliquez « Actualiser », et Zotero refait la mise en forme.

La mise en page est **pilotée par votre modèle Word**, non par le code. Vous y
posez des jetons, le greffon les remplit :

| Jeton | Rempli par |
|---|---|
| `{{titre}}` | le titre de la note |
| `{{dossier}}` | son dossier, sans numéro de rangement |
| `{{date}}` `{{date:long}}` | sa date de création, courte ou en toutes lettres |
| `{{réf}}` | sa référence, prise dans une propriété ou dans le nom du fichier |
| `{{propriété:clé}}` | une propriété nommée |
| `{{propriétés.nom}}` / `{{propriétés.valeur}}` | un rang répété par propriété restante |
| `{{encadré.titre}}` / `{{encadré.contenu}}` | vos encadrés `> [!info]`, enfermés dans le cadre que vous avez dessiné |

Déplacer un jeton, ajouter une ligne, changer un style, redessiner le cadre :
tout cela se fait dans Word. Une commande **vérifie votre modèle** et vous dit
ce qu'elle y a trouvé, quels jetons elle ne reconnaît pas, et quels gabarits
manquent.

L'export, au passage :

- décale les titres d'un cran, si bien que `##` devient Titre 1, et retire la
  numérotation saisie à la main, laissant Word numéroter seul ;
- transforme les encadrés `> [!info]` en tableau encadré, selon votre modèle ;
- convertit les tableaux markdown, avec filets et vos styles de tableau ;
- retire les crochets des valeurs de propriétés, si bien que `[[Jane Doe]]` sort
  `Jane Doe` ;
- rend insécables les espaces déjà présentes devant `;` `:` `!` `?`, sans jamais
  en ajouter, ce qui laisse adresses et heures intactes ;
- pose le champ de bibliographie Zotero à la fin, pour que vous n'ayez pas à
  l'insérer vous-même.

⚠️ Demande pandoc, le filtre Lua de Better BibTeX, et Zotero ouvert.

## ⏱️ Compter le temps

Le temps passé dans chaque note, en minutes, reporté en propriété.

La mesure se met en pause dès que le clavier et la souris se taisent, ou que la
fenêtre perd le focus : elle compte le travail effectif, non la présence devant
l'écran. Vous réglez la durée du silence.

Le total de référence est tenu en secondes et la propriété n'en est qu'une vue
arrondie, car arrondir à chaque report, en repartant d'une valeur déjà arrondie,
gonfle le total de plusieurs pour cent. Les écritures sont espacées pour ne pas
agiter la synchronisation, et le temps en attente n'est jamais perdu.

Un **journal quotidien** peut s'écrire au changement de jour, et un élément de
barre d'état affiche le temps de la note en cours, le point plein quand le
compteur tourne, vide en pause. Le journal est une note ordinaire : il reste
cherchable et renvoie au travail dont il rend compte.

```markdown
---
type: journal-temps
date: 2026-08-21
total-minutes: 34
---
# Temps de travail du 2026-08-21

**Total : 34 min** sur 3 note(s).

| Note | Temps |
| --- | --- |
| [[3 - Notes conceptuelles/NC-202608210937]] | 29 min |
| [[3 - Notes conceptuelles/NC-202607231002]] | 4 min |
| [[Modification à apporter au modèle documentaire]] | 1 min |
```

![Le journal quotidien tel qu'Obsidian le rend, avec ses propriétés et le tableau des notes et des minutes](docs/time-journal.png)

Chaque ligne étant un vrai lien, le journal apparaît dans les rétroliens des
notes qu'il cite. Rouvrir une note des mois plus tard vous dit le temps qu'elle
a coûté.

## 🧹 Outils d'entretien

- **Renommer une propriété** dans tout le coffre. Changer un nom dans les
  réglages ne vaut que pour les écritures à venir : cet outil reporte l'ancienne
  valeur sur la nouvelle. Il compte d'abord, et n'écrase jamais une note qui
  porte déjà la nouvelle propriété.
- **Exporter et importer un profil de réglages**. Les chemins propres à votre
  machine n'y figurent jamais, et un profil importé ne les touche pas.
- **Vérifier le modèle Word**, avant l'export plutôt qu'après.
- **Restaurer** toute note produite qui aurait été modifiée à la main.

## 🗂️ S'adapter à votre organisation

Ariane ne présume rien de votre coffre. Vous décrivez vos **familles de notes**
dans les réglages, avec pour chacune un libellé, un ou plusieurs dossiers, un
préfixe éventuel, et ce qu'Ariane doit en faire : afficher le titre après les
liens, nourrir les suggestions, changer l'apparence dans l'explorateur. Les
lignes se réordonnent au glisser-déposer. Aucun type de note n'est nommé dans le
code.

Un bouton propose les familles de votre coffre et **devine leurs préfixes** à
partir des noms de fichiers. Un autre détecte les dossiers qui jouent chacun des
rôles : où sont rangées les annotations, où vont les notes de lecture, où
tombent les exports, et ainsi de suite.

## ⌨️ Commandes

| Commande | Ce qu'elle fait |
|---|---|
| Atomiser la note source active | une note par annotation |
| Ré-atomiser toutes les sources | tout le coffre |
| Notes de lecture : atomiser les notes-filles Zotero | notes attachées à la référence même |
| Citations : tout replier, tout déplier, replier ou déplier | les pastilles |
| Citations : rafraîchir les libellés | après changement du modèle de citation |
| Bibliographie : régénérer dans la note active, ou dans toutes | bibliographie de fin de note |
| Générer la bibliographie citée de cette source, ou de toutes | via Crossref et OpenAlex |
| Rattacher les références en attente aux sources Zotero | par auteurs et année |
| Lier cette référence à une fiche Zotero | le cas 2005a et 2005b |
| Fusionner les doublons d'auteurs | regroupe les variantes de nom |
| Ouvrir dans Zotero | lecteur, annotation ou source |
| Vérifier le modèle Word | jetons et gabarits |
| Exporter en Word avec citations Zotero | toute la chaîne |
| Temps : écrire le journal du jour, reporter dans les notes | le compteur |
| Panier d'annotations : afficher ou masquer | pour le glisser-déposer |
| Suggestions : ouvrir le panneau, reconstruire l'index | le panneau latéral |

---

## 📦 Installation

Ariane ne figure pas dans le catalogue officiel d'Obsidian. Deux voies :

**Par BRAT** ✅ (recommandé, mises à jour automatiques)
1. installez le greffon [BRAT](https://github.com/TfTHacker/obsidian42-brat) ;
2. lancez la commande « BRAT: Add a beta plugin for testing » ;
3. collez `Liotou/obsidian-ariane`.

BRAT suivra les publications de ce dépôt et vous proposera les mises à jour.

**À la main**
Téléchargez `main.js`, `manifest.json` et `styles.css` depuis la
[dernière publication](../../releases/latest) et déposez-les dans
`VotreCoffre/.obsidian/plugins/zotflow-atomiser/`.

### Pour l'export Word
- [pandoc](https://pandoc.org/) ;
- le filtre Lua de [Better BibTeX](https://retorque.re/zotero-better-bibtex/)
  (`pandoc-zotero-live-citemarkers.lua`) ;
- Zotero ouvert, avec Better BibTeX ;
- votre modèle `.docx`, porteur des jetons.

### Pour les suggestions sémantiques
[Ollama](https://ollama.com/) ou [LM Studio](https://lmstudio.ai/), avec un
modèle d'embeddings. `bge-m3` convient bien au français.

---

## 🙏 Remerciements

**[ZotFlow](https://github.com/duanxianpi/zotflow)** d'abord et avant tout. Ariane
ne serait rien sans lui. C'est ZotFlow qui fait vivre Zotero dans Obsidian, et
tout ce que fait Ariane part de ce qu'il dépose. Merci à
[Xianpi Duan](https://github.com/duanxianpi), qui l'a développé.

Merci également à [Better BibTeX](https://retorque.re/zotero-better-bibtex/) et
à son filtre pandoc, sans lequel les citations vivantes dans Word resteraient un
vœu pieux.

---

## ⚖️ Licence

MIT, voir [LICENSE](LICENSE).
