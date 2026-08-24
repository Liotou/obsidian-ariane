# Ariane

> **Écrit en vibe coding avec Claude.** Ce greffon a été conçu et programmé en
> conversation avec Claude (Anthropic), à partir des besoins réels d'un
> doctorant. Je ne suis pas développeur. Je décris ce dont j'ai besoin, je
> teste, je corrige, et le code prend forme au fil des échanges. Je le dis
> d'emblée, par honnêteté, pour que vous sachiez ce que vous installez. Le code
> est lisible, commenté, et sans dépendance : un seul fichier `main.js`, ni
> TypeScript, ni bundler, ni `npm`.
>
> *English: see [README.md](README.md).*

**Ariane est le compagnon d'aval de [ZotFlow](https://github.com/zotflow/zotflow).**
ZotFlow fait entrer Zotero dans Obsidian : références, pièces jointes,
annotations, notes. Ariane prend le relais et travaille cette matière. Elle
l'atomise, la relie, la cite et l'exporte. Sans ZotFlow, Ariane n'a rien à se
mettre sous la dent.

Interface disponible en **français et en anglais**.

---

## Ce que fait Ariane

### Atomiser
Chaque annotation Zotero devient une note autonome, à l'identité stable, qui
survit aux régénérations. Les **notes-filles Zotero**, celles attachées à la
référence entière plutôt qu'à un passage, deviennent des notes de lecture à part
entière, citables et reliées à leur source.

### Citer Zotero, en direct
Les citations s'écrivent en clair dans vos notes :

```
([[CLE|Dresch et al., 2015, p. 63]] ; [[AUTRE|Gibbons, 1994, p. 12]])
```

Ariane tient l'apparat des **sources de seconde main**, sous la forme « X, Y et
Z, cité dans Dupont, 2020 ». Elle replie les citations en pastilles quand elles
encombrent la lecture, et construit la bibliographie de fin de note.

### Suggérer
Un panneau latéral propose, au fil de l'écriture, les notes les plus proches.
Trois moteurs au choix : lexical (aucune dépendance), sémantique (embeddings
locaux) ou hybride. **Ollama ou LM Studio**, en local, hors ligne, gratuit. Le
reclassement par modèle de langue reste à la demande, et il est borné en durée
comme en longueur, pour ne pas faire chauffer la machine.

### Exporter vers Word
Le point le plus délicat, et le plus abouti : un export `.docx` **avec des
champs Zotero actualisables**, et non du texte figé. Vous rouvrez le document
dans Word, vous cliquez « Actualiser », et Zotero refait la mise en forme.

La mise en page est **pilotée par votre modèle Word**, non par le code. Vous y
posez des jetons, le greffon les remplit :

| Jeton | Rempli par |
|---|---|
| `{{titre}}` | le titre de la note |
| `{{dossier}}` | son dossier, sans numéro de rangement |
| `{{date}}` `{{date:long}}` | sa date de création |
| `{{réf}}` | sa référence |
| `{{propriété:clé}}` | une propriété nommée |
| `{{propriétés.nom}}` / `{{propriétés.valeur}}` | un rang répété par propriété |
| `{{encadré.titre}}` / `{{encadré.contenu}}` | vos encadrés `> [!info]` |

Déplacer un jeton, ajouter une ligne, changer un style : tout cela se fait dans
Word, sans toucher au code. Une commande vérifie que le modèle est toujours
compris.

### Compter le temps
Le temps passé dans chaque note, en minutes, reporté en propriété. La mesure se
met en pause dès que le clavier se tait ou que la fenêtre perd le focus.

### Et aussi
Schémas draw.io synchronisés dans leurs notes, glisser-déposer d'une annotation
pour l'insérer en citation, bibliographies par source, rattachement des
références citées, fusion des doublons d'auteurs.

---

## S'adapter à votre organisation

Ariane ne présume rien de votre coffre. Vous décrivez vos **familles de notes**
dans les réglages, avec pour chacune un libellé, un ou plusieurs dossiers, un
préfixe éventuel, et ce qu'Ariane doit en faire. Aucun type de note n'est nommé
dans le code.

Un bouton propose les familles de votre coffre et **devine les préfixes**. Un
autre détecte les dossiers qui jouent chacun des rôles.

Vous pouvez **exporter votre profil de réglages** pour le partager. Les chemins
propres à votre machine n'y figurent jamais, et un profil importé ne les touche
pas.

---

## Installation

Ariane ne figure pas dans le catalogue officiel d'Obsidian. Deux voies :

**Par BRAT** (recommandé, mises à jour automatiques)
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

## Remerciements

**[ZotFlow](https://github.com/zotflow/zotflow)** d'abord et avant tout. Ariane
ne serait rien sans lui. C'est ZotFlow qui fait vivre Zotero dans Obsidian, et
tout ce que fait Ariane part de ce qu'il dépose. Merci à celles et ceux qui
l'ont développé.

Merci également à [Better BibTeX](https://retorque.re/zotero-better-bibtex/) et
à son filtre pandoc, sans lequel les citations vivantes dans Word resteraient un
vœu pieux.

---

## Licence

MIT, voir [LICENSE](LICENSE).
