'use strict';

/*
 * Ariane
 * ================
 * Plugin Obsidian sur mesure et PARAMÉTRABLE. Transforme les
 * annotations d'une note source (ZotFlow / Zotero) en notes atomiques
 * réactives, selon un ou plusieurs standards d'annotation configurables.
 *
 * Principes :
 *   - IDENTITÉ STABLE : chaque note d'annotation garde dans son entête
 *     une clé stable (zotflow-anno-key). C'est cette clé, et non le nom
 *     de fichier, qui sert d'identité au plugin. Les liens survivent
 *     donc aux changements de titre (renommage via l'API d'Obsidian).
 *   - RÉACTIF : régénération automatique à chaque modification de la
 *     source (désactivable).
 *   - VERROUILLÉ : les éditions manuelles des notes automatiques sont
 *     restaurées (désactivable).
 *   - SUPPRESSION PROPAGÉE : une annotation retirée de la source voit
 *     sa note supprimée et ses liens retirés des notes conceptuelles
 *     (désactivable).
 *   - RATTACHEMENT ZOTERO : une référence citée correspondant à une
 *     source Zotero (même premier auteur + année) pointe vers la note
 *     @citekey (désactivable).
 *
 * Paramétrage (onglet Réglages) :
 *   - Dossiers de sortie, nommage, alias.
 *   - Motifs d'analyse (regex) par champ, regroupés en PROFILS de
 *     standard : plusieurs standards peuvent coexister, le premier
 *     profil dont le motif de titre correspond est retenu pour le bloc.
 *   - Modèles de sortie type Templater ({{title}}, {{paraphrase}},
 *     {{source}}, {{references}}, {{image}}, {{page}}...).
 *   - Interrupteurs de comportement.
 *
 * ATTENTION : agit automatiquement, peut supprimer des notes et retirer
 * des liens. Sauvegardez votre coffre.
 */

const obsidian = require('obsidian');

const FENETRE_ECRITURE_MS = 2500;
const DELAI_ANTIREBOND_MS = 800;

/* ------------------------------ Langues -------------------------------- */
/* Le français sert de CLÉ : tr('Dossier des annotations') rend la traduction si
 * elle existe, et le français sinon. Une traduction oubliée se voit donc dans
 * la langue d'origine plutôt que de laisser un trou dans l'interface. */

const TEXTES = {
  en: {
    ".docx dont les styles seront appliqués (titres, corps, citation, etc.).": ".docx whose styles will be applied (headings, body, quote, and so on).",
    "Abréger les citations indirectes": "Shorten secondary citations",
    "Accepter n'importe quelle note": "Accept any note",
    "Activer la récupération via API": "Enable retrieval through the API",
    "Activer le compteur": "Enable the timer",
    "Activer le reclassement": "Enable reranking",
    "Activer le repliement": "Enable folding",
    "Activer les suggestions": "Enable suggestions",
    "Activé, un travail rapporté mais absent de Zotero est cité sous la forme « Fan et al., 2022, cité dans Raizada & Sinha, 2025, p. 1 ». Désactivé, seule la source réellement consultée est citée. Sans effet sur les travaux présents dans Zotero, toujours cités directement.": "When enabled, a work reported but absent from Zotero is cited as “Fan et al., 2022, as cited in Raizada & Sinha, 2025, p. 1”. When disabled, only the source you actually read is cited. This has no effect on works present in Zotero, which are always cited directly.",
    "Adresse": "Address",
    "Affichage": "Appearance",
    "Affiche en police à largeur fixe les notes des dossiers listés. Liste vide : aucun. Le texte reste normal (recherche et tri intacts).": "Shows notes from the listed folders in a fixed width font. An empty list means none. The text itself is unchanged, so search and sorting still work.",
    "Affiche l'aperçu natif au survol des liens internes dans les vues qui ne le font pas (ex. chat Claudian, panneaux).": "Shows the native hover preview for internal links in views that do not provide one, such as side panels.",
    "Affiche un message quand un élément déposé ne correspond à aucune note du coffre, au lieu de ne rien faire.": "Shows a message when a dropped item matches no note in the vault, instead of doing nothing.",
    "Afficher l'alias plutôt que le nom de fichier": "Show the alias instead of the filename",
    "Afficher la justification": "Show the reason",
    "Afficher le titre après un lien vers une note de cette famille": "Show the title after a link to a note of this family",
    "Afficher le titre en aparté": "Show the title as an aside",
    "Afficher l’aparté pour les liens vers des notes d’annotation.": "Show the aside for links pointing to annotation notes.",
    "Affiner par le modèle de langue": "Refine with the language model",
    "Ajoute le titre après un lien d'annotation ou de note conceptuelle qui affiche la clé (lecture et édition).": "Adds the title after a link that shows only a key, in reading view and while editing.",
    "Ajoute un lien après chaque référence. Il est placé à la suite, et non autour du texte, afin de préserver les italiques du style bibliographique.": "Adds a link after each reference. It goes next to the entry rather than around it, so the italics of the bibliographic style survive.",
    "Ajoute un tag aux annotations à zéro appel, pour les colorer dans le graphe.": "Tags annotations that are never cited, so you can colour them in the graph.",
    "Ajoute un titre « Bibliographie » où insérer la bibliographie dans Word (Zotero > Add Bibliography).": "Adds a “Bibliography” heading where Word should place the bibliography (Zotero > Add Bibliography).",
    "Ajouter une famille": "Add a family",
    "Ajouté devant le nom de la source (ex. « Biblio - @cle »). Peut être vide.": "Placed before the source name, for example “Biblio - @key”. May be left empty.",
    "Alias": "Alias",
    "Alphabétique (auteur, année)": "Alphabetical (author, year)",
    "Analyse (expressions régulières)": "Parsing (regular expressions)",
    "Ancien nom → nouveau nom": "Old name to new name",
    "Annotations atomisées": "Atomised annotations",
    "Annuler": "Cancel",
    "Aparté": "Aside",
    "Aparté (titre sur les liens)": "Aside (title shown after links)",
    "Aperçu au survol hors éditeur": "Hover preview outside the editor",
    "Apparat « cité dans »": "Secondary source apparatus",
    "Apparat « cité dans » à l'export": "Secondary source apparatus on export",
    "Ariane : ": "Ariane: ",
    "Ariane : ouvrir dans Zotero": "Ariane: open in Zotero",
    "Ariane : suggestions pour ce passage": "Ariane: suggestions for this passage",
    "Ariane relève les annotations et les sources citées dans le corps de la note, puis entretient une bibliographie en fin de note, à la manière de Zotero dans Word.": "Ariane collects the annotations and sources cited in the body of the note, then keeps a bibliography at the end of it, the way Zotero does in Word.",
    "Ariane — rattachement": "Ariane: attachment",
    "Associez chaque niveau markdown à un nom de style de votre modèle (laisser vide = style pandoc par défaut).": "Map each markdown level to a style name from your template. Leave empty to keep the default pandoc style.",
    "Atomiser la note source active": "Atomise the active source note",
    "Atomiser les notes de lecture": "Atomise reading notes",
    "Au changement de jour, la veille est consignée.": "When the day changes, the previous day is written down.",
    "Aucun dossier de références en attente.": "No folder set for pending references.",
    "Aucun dossier à proposer.": "No folder to propose.",
    "Aucun doublon d'auteur détecté.": "No duplicate author found.",
    "Aucun problème détecté.": "No problem found.",
    "Aucun schéma draw.io trouvé (.drawio.svg).": "No draw.io diagram found (.drawio.svg).",
    "Aucun schéma draw.io trouvé.": "No draw.io diagram found.",
    "Aucun temps enregistré pour le ": "No time recorded for ",
    "Aucune annotation trouvée.": "No annotation found.",
    "Aucune famille. Ajoutez-en une, ou laissez Ariane proposer celles de votre coffre.": "No family yet. Add one, or let Ariane propose the ones found in your vault.",
    "Aucune fiche Zotero pour « ": "No Zotero entry for “",
    "Aucune note active.": "No active note.",
    "Aucune note associée à « ": "No note attached to “",
    "Aucune pièce jointe ni clé Zotero dans « ": "Neither attachment nor Zotero key in “",
    "Aucune référence citée trouvée pour ce DOI.": "No cited reference found for this DOI.",
    "Aucune source Zotero avec DOI.": "No Zotero source carries a DOI.",
    "Aucune suggestion pertinente.": "No relevant suggestion.",
    "Aucune variante de nom détectée.": "No name variant found.",
    "Auteurs : ": "Authors: ",
    "Auto (Crossref puis OpenAlex)": "Auto (Crossref then OpenAlex)",
    "Automatique": "Automatic",
    "Automatisation": "Automation",
    "Avancé": "Advanced",
    "Avec organisation": "With organisation",
    "Barre d'état": "Status bar",
    "Bibliographie : ": "Bibliography: ",
    "Bibliographie : régénérer dans toutes les notes": "Bibliography: rebuild in every note",
    "Bibliographie de fin de note": "Bibliography at the end of the note",
    "Bibliographie mise à jour dans ": "Bibliography updated in ",
    "Bibliographies : ": "Bibliographies: ",
    "Bibliographies citées": "Cited bibliographies",
    "Bibliographies citées (API)": "Cited bibliographies (API)",
    "Bibliographies terminées : ": "Bibliographies finished: ",
    "Bibliographies…": "Bibliographies…",
    "Blocs sans type": "Shapes without a type",
    "Callout pour {{citation}} : quote, cite, note, info…": "Callout used for {{citation}}: quote, cite, note, info…",
    "Candidats soumis": "Candidates submitted",
    "Ce n'est pas un lecteur ZotFlow.": "This is not a ZotFlow reader.",
    "Cellule de tableau": "Table cell",
    "Certaines seulement, ignorer les ambiguës": "Certain matches only, skip ambiguous ones",
    "Ces dossiers ne décrivent pas vos types de notes, mais les emplacements dont Ariane a besoin. Laissez vide ce dont vous ne vous servez pas.": "These folders do not describe your note types. They are the places Ariane needs in order to work. Leave empty whatever you do not use.",
    "Ces notes nourrissent le panneau de suggestions": "These notes feed the suggestions panel",
    "Cette note ne contient pas d'annotations reconnues.": "This note contains no recognised annotation.",
    "Cette note ne se rattache pas à une source Zotero.": "This note is not attached to a Zotero source.",
    "Cette source n'a pas de DOI.": "This source has no DOI.",
    "Champ de référence formatée": "Formatted reference field",
    "Changer de service réencode l'index : les vecteurs de deux modèles ne se comparent pas.": "Switching service re-encodes the index, because vectors from two different models cannot be compared.",
    "Changer le nom d'une propriété dans les réglages ne vaut que pour les écritures à venir : les notes déjà écrites gardent l'ancien nom. Cet outil reporte l'ancienne valeur sur la nouvelle dans tout le coffre. Une note qui porte déjà la nouvelle propriété n'est jamais écrasée.": "Renaming a property in the settings only applies to future writes, so notes already written keep the old name. This tool carries the old value over to the new one across the whole vault. A note that already has the new property is never overwritten.",
    "Chasse fixe": "Fixed width",
    "Chaîne détectant une note source à traiter.": "String used to detect a source note worth processing.",
    "Chemin de pandoc": "Path to pandoc",
    "Choisissez la fiche Zotero correspondante :": "Choose the matching Zotero entry:",
    "Cible automatique : en survolant le texte, l’appel de note se place en fin de la phrase visée ; en survolant la marge gauche du paragraphe, il se place en fin de paragraphe. La zone visée est surlignée pendant le glisser.": "Automatic target: hovering the text places the citation at the end of the sentence under the cursor, hovering the left margin places it at the end of the paragraph. The target area is highlighted while you drag.",
    "Citation  (>)": "Quote  (>)",
    "Citations": "Citations",
    "Citations & bibliographie": "Citations and bibliography",
    "Citations : rafraîchir les libellés…": "Citations: refresh labels…",
    "Citations : replier ou déplier": "Citations: fold or unfold",
    "Citations : tout déplier": "Citations: unfold all",
    "Citations : tout replier": "Citations: fold all",
    "Citations indirectes": "Secondary citations",
    "Collez ici le contenu d'un fichier de profil. Les réglages inconnus sont ignorés.": "Paste the contents of a profile file here. Unknown settings are ignored.",
    "Compter": "Count",
    "Confirmer": "Confirm",
    "Conserver le relevé quotidien": "Keep the daily record",
    "Contenu des notes": "Note contents",
    "Copier": "Copy",
    "Copiez le nom exact du style voulu dans les champs de mapping des réglages.": "Copy the exact style name you want into the mapping fields in the settings.",
    "Copié : ": "Copied: ",
    "Corps (pt)": "Body size (pt)",
    "Correspondances de références mémorisées": "Remembered reference matches",
    "Couleur CSS. Vide = atténuée. Ex. « #999 », « var(--text-faint) ».": "A CSS colour. Empty means muted. For example “#999” or “var(--text-faint)”.",
    "Couleur dans le panneau de suggestions": "Colour in the suggestions panel",
    "Couleur de l'aparté": "Colour of the aside",
    "DSL copié.": "DSL copied.",
    "Descendre": "Move down",
    "Documents exportés": "Exported documents",
    "Dossier de sortie": "Output folder",
    "Dossier des annotations": "Annotations folder",
    "Dossier des auteurs": "Authors folder",
    "Dossier des bibliographies": "Bibliographies folder",
    "Dossier des références citées": "Cited references folder",
    "Dossier du journal": "Journal folder",
    "Dossiers": "Folders",
    "Dossiers & familles": "Folders and families",
    "Décaler les titres d’un cran": "Shift headings down one level",
    "Décisions de rattachement oubliées.": "Attachment decisions forgotten.",
    "Décoché, les citations restent toujours visibles et les commandes sans effet.": "When unchecked, citations always stay visible and the commands do nothing.",
    "Décoché, tous les auteurs rapportés sont nommés, suivis de « cité dans » et de la source.": "When unchecked, every reported author is named, followed by “as cited in” and the source.",
    "Déconseillé. Activé, le modèle repart à chaque changement de note — c'est ce qui faisait tourner la ventilation sans répit.": "Not recommended. When enabled, the model runs again on every note change, which is what kept the fans spinning.",
    "Décrivez vos types de notes. Une famille couvre un ou plusieurs dossiers, éventuellement un préfixe de nom, et dit ce qu'Ariane doit en faire : afficher le titre après les liens, nourrir les suggestions, changer l'apparence dans l'explorateur. Glissez les lignes pour les réordonner — la première qui couvre une note l'emporte.": "Describe your own note types. A family covers one or more folders, optionally a filename prefix, and states what Ariane should do with them: show the title after links, feed the suggestions, change the look in the file explorer. Drag rows to reorder them, since the first family that covers a note wins.",
    "Délai avant recalcul (ms)": "Delay before recomputing (ms)",
    "Délai maximal": "Maximum delay",
    "Déposer sur le curseur": "Drop at the cursor",
    "Déposer une note sur un paragraphe": "Drop a note onto a paragraph",
    "Dépôt non reconnu : ": "Unrecognised drop: ",
    "Désactivé": "Disabled",
    "Détecter les dossiers de mon coffre": "Detect the folders in my vault",
    "Email (pool poli)": "Email (polite pool)",
    "Emplacement de bibliographie": "Bibliography placement",
    "En jetons.": "In tokens.",
    "En jours. Ce relevé sert au journal ; passé ce délai il est effacé des réglages, les totaux inscrits dans les notes demeurent.": "In days. This record feeds the journal. Past that point it is cleared from the settings, while the totals written in your notes remain.",
    "En minutes, dans le frontmatter de chaque note.": "In minutes, in the frontmatter of each note.",
    "En secondes, sans clavier ni souris. 120 convient à la rédaction, où l'on s'arrête pour réfléchir ; 30 ne compte que la frappe.": "In seconds, with neither keyboard nor mouse. 120 suits writing, where you pause to think. 30 counts typing only.",
    "En secondes. Au-delà, Ariane rend la main et garde le classement sans le modèle.": "In seconds. Beyond that, Ariane gives up and keeps the ranking without the model.",
    "En secondes. Espacer les écritures évite d'agiter la synchronisation ; le temps en attente n'est jamais perdu, il est reporté en quittant la note.": "In seconds. Spacing out the writes keeps your sync quiet. Pending time is never lost, it is written when you leave the note.",
    "En-tête de tableau": "Table header",
    "Encadrés": "Callouts",
    "Entretient un encart « Contenu du schéma » dans la note associée, ce qui rend les blocs et relations cherchables.": "Keeps a “Diagram contents” block in the paired note, which makes shapes and relations searchable.",
    "Espaces insécables": "Non breaking spaces",
    "Ex. « 0.8em », « 11px ».": "For example “0.8em” or “11px”.",
    "Export SVG": "SVG export",
    "Export Word": "Word export",
    "Export Word (Zotero)…": "Word export (Zotero)…",
    "Export terminé : ": "Export finished: ",
    "Export — échec : ": "Export failed: ",
    "Exporte la note active en .docx où chaque note de bas de page devient une citation Zotero vivante (via Pandoc + filtre BetterBibTeX). Zotero doit tourner ; pandoc doit être installé (brew install pandoc). Commande : « Exporter en Word avec citations Zotero (Pandoc) ».": "Exports the active note to .docx, where each citation becomes a live Zotero field, through pandoc and the BetterBibTeX filter. Zotero must be running and pandoc must be installed.",
    "Exporter": "Export",
    "Exporter en Word avec citations Zotero (Pandoc)": "Export to Word with live Zotero citations (pandoc)",
    "Familles de notes": "Note families",
    "Fenêtre flottante": "Floating window",
    "Fiches auteurs": "Author notes",
    "Filtre Lua (BetterBibTeX)": "Lua filter (BetterBibTeX)",
    "Finition non appliquée : ": "Finishing pass not applied: ",
    "Flèches sans étiquette": "Arrows without a label",
    "Format de l'aparté": "Format of the aside",
    "Format de la citation": "Citation format",
    "Format des entrées (repli, si le champ est absent)": "Entry format (fallback, when the field is missing)",
    "Format du nom de fichier": "Filename format",
    "Forme du compteur": "Timer display",
    "Fusion des auteurs…": "Merging authors…",
    "Fusion — échec : ": "Merge failed: ",
    "Fusionner": "Merge",
    "Fusionner les doublons d'auteurs": "Merge duplicate authors",
    "Garde-fous. Sans borne de longueur, un modèle qui ne referme pas sa réponse peut tourner plusieurs minutes à pleine charge : c'est arrivé, et mesuré.": "Safeguards. Without a length limit, a model that never closes its answer can run for several minutes at full load. That happened, and it was measured.",
    "Glisser pour réordonner": "Drag to reorder",
    "Glisser un lien de note sur un paragraphe l'ajoute à sa note de bas de page. Déposer ailleurs reste normal.": "Dragging a note link onto a paragraph adds it to that paragraph's citation. Dropping anywhere else behaves as usual.",
    "Glisser-déposer & notes de bas de page": "Drag and drop, footnotes",
    "Glissez des annotations ici…": "Drag annotations here…",
    "Graphe": "Graph",
    "Groupe 1 = clé stable, groupe 2 = contenu.": "Group 1 is the stable key, group 2 is the content.",
    "Général": "General",
    "Générer la bibliographie citée de cette source (via API)": "Build the cited bibliography of this source (through the API)",
    "Générer les bibliographies citées de TOUTES les sources (via API)": "Build the cited bibliographies of EVERY source (through the API)",
    "Hybride (recommandé)": "Hybrid (recommended)",
    "Ignorer": "Skip",
    "Ignorer les notes verrouillées": "Skip locked notes",
    "Importer": "Import",
    "Inclure le texte surligné (citation)": "Include the highlighted text (quotation)",
    "Index de suggestions reconstruit (": "Suggestion index rebuilt (",
    "Index reconstruit (": "Index rebuilt (",
    "Indexation des cartes…": "Indexing diagrams…",
    "Indexation sémantique…": "Semantic indexing…",
    "Indiquez le nom actuel de la propriété.": "Give the current name of the property.",
    "Indiquez les deux noms.": "Give both names.",
    "Infobulle dans l'explorateur": "Tooltip in the file explorer",
    "Intègre le surlignage via {{citation}} (encadré) ou {{highlight}} (brut).": "Inserts the highlight through {{citation}} as a callout, or {{highlight}} as plain text.",
    "JSON invalide : ": "Invalid JSON: ",
    "Journal du temps": "Time journal",
    "Journal quotidien": "Daily journal",
    "Journaux quotidiens du compteur de temps.": "Daily records from the timer.",
    "L'aparté sur les autres notes, et l'affichage de l'alias dans l'explorateur, se règlent famille par famille — onglet « Dossiers & familles ».": "The aside on other notes, and showing the alias in the file explorer, are set family by family, in the “Folders and families” tab.",
    "Lancer": "Run",
    "Langue": "Language",
    "Le JSON doit être un tableau non vide.": "The JSON must be a non empty array.",
    "Le compteur mesure le temps passé dans une note ouverte en édition. Il se met en pause dès que le clavier et la souris se taisent, ou que la fenêtre perd le focus : il compte donc le travail effectif, non la présence devant l'écran. Le total est inscrit en minutes dans une propriété de la note.": "The timer measures time spent in a note open for editing. It pauses as soon as keyboard and mouse go quiet, or the window loses focus, so it counts actual work rather than presence in front of the screen. The total is written in minutes into a property of the note.",
    "Le jeton {{réf}} de votre modèle. Ariane cherche les propriétés ci-dessous, dans l'ordre, accents et majuscules indifférents.": "The {{réf}} token of your template. Ariane looks for the properties below, in order, ignoring accents and case.",
    "Le modèle répond : le reclassement est disponible.": "The model answers: reranking is available.",
    "Le panier est vide.": "The basket is empty.",
    "Le texte de liaison — « , cité dans » — se règle une seule fois, dans l'onglet « Citations & bibliographie ». Il vaut pour les citations en ligne comme pour l'export.": "The linking text, “, as cited in”, is set in one place only, in the “Citations and bibliography” tab. It applies to inline citations and to the export alike.",
    "Lecture des styles — échec : ": "Reading the styles failed: ",
    "Les dossiers concernés se cochent famille par famille — onglet « Dossiers & familles ».": "The folders concerned are ticked family by family, in the “Folders and families” tab.",
    "Les dossiers puisés par les suggestions, leur couleur et leur icône se règlent famille par famille — onglet « Dossiers & familles », case « Suggestions ».": "The folders the suggestions draw from, along with their colour and icon, are set family by family, in the “Folders and families” tab, under the “Suggestions” box.",
    "Les notes portant « locked: true » (fiches graphiques, notes importées) ne peuvent pas être éditées par inadvertance.": "Notes carrying “locked: true” cannot be edited by accident.",
    "Les notes portant « locked: true » ne sont pas chronométrées.": "Notes carrying “locked: true” are not timed.",
    "Les notes-filles Zotero — attachées à la référence entière, non à un passage — deviennent des notes à part, citables et reliées à leur source.": "Zotero child notes, attached to the whole reference rather than to a passage, become notes in their own right, citable and linked back to their source.",
    "Les rapprochements que vous avez confirmés à la main entre une référence en attente et une source Zotero. Les oublier vous fera reposer la question.": "The matches you confirmed by hand between a pending reference and a Zotero source. Forgetting them means being asked again.",
    "Les étiquettes admises sur vos schémas. Une liste vide n'impose rien. Un terme par ligne.": "The labels allowed on your diagrams. An empty list imposes nothing. One term per line.",
    "Lexical (mots)": "Lexical (words)",
    "Lexical : mots en commun (aucune dépendance). Sémantique : comprend le sens via des embeddings locaux (Ollama). Hybride : combine les deux (recommandé). En l'absence d'Ollama, le moteur bascule automatiquement sur le lexical.": "Lexical: shared words, with no dependency. Semantic: meaning, through local embeddings. Hybrid: both at once, and the recommended choice. With no inference service available, the engine falls back to lexical on its own.",
    "Libellé de la page": "Page label",
    "Libellé des références": "References label",
    "Libellé du renvoi": "Link label",
    "Liens non typés (soupape)": "Untyped links (safety valve)",
    "Lier cette référence à une fiche Zotero (désambiguïsation 2005a/b)": "Link this reference to a Zotero entry (to tell 2005a from 2005b)",
    "Lignes suivantes.": "Following rows.",
    "Liste JSON. Pour chaque bloc, le premier profil dont « titreRegex » correspond est retenu.": "A JSON list. For each block, the first profile whose “titreRegex” matches is used.",
    "Longueur maximale de la réponse": "Maximum answer length",
    "Maintenance": "Maintenance",
    "Maintient une note par auteur pointant vers ses sources.": "Keeps one note per author, pointing to their sources.",
    "Marqueur de source": "Source marker",
    "Me demander pour les ambiguës": "Ask me about ambiguous ones",
    "Mise en forme du document": "Document formatting",
    "Mise en page (modèle Word)": "Layout (Word template)",
    "Mise à jour automatique": "Automatic update",
    "Modèle": "Template",
    "Modèle Word (styles)": "Word template (styles)",
    "Modèle Word introuvable : ": "Word template not found: ",
    "Modèle Word — ": "Word template: ",
    "Modèle d'alias": "Alias template",
    "Modèle d'embeddings": "Embedding model",
    "Modèle de corps de note": "Note body template",
    "Modèle de langue": "Language model",
    "Monter": "Move up",
    "Moteur": "Engine",
    "Moteur de pertinence": "Relevance engine",
    "Nom d'icône Lucide, ex. « book »": "A Lucide icon name, for example “book”",
    "Nom de la famille": "Family name",
    "Nom de la police monospace (vide = police de code d’Obsidian).": "Name of the monospace font. Empty means the Obsidian code font.",
    "Nom de référence non reconnu (attendu « Auteur, Année »).": "Reference name not recognised. Expected “Author, Year”.",
    "Nom du tag « orpheline »": "Name of the “orphan” tag",
    "Nombre de meilleurs candidats relus par le modèle.": "How many top candidates the model reviews.",
    "Nombre de suggestions": "Number of suggestions",
    "Nommage des annotations": "Naming of annotations",
    "Noms codés en police monospace": "Coded names in a monospace font",
    "Noms de styles tels qu'ils figurent dans votre modèle Word. Ariane les résout en identifiants — « Corps de texte » se range sous « Corpsdetexte ».": "Style names as they appear in your Word template. Ariane resolves them into identifiers, so “Body Text” is stored as “BodyText”.",
    "Normaliser les conjonctions des références (et → &)": "Normalise conjunctions in references (et to &)",
    "Note « ": "Note “",
    "Notes de lecture": "Reading notes",
    "Notes de lecture : ": "Reading notes: ",
    "Notes de lecture : atomisation…": "Reading notes: atomising…",
    "Notes de lecture : atomiser les notes-filles Zotero": "Reading notes: atomise Zotero child notes",
    "Notes de référence provisoires": "Provisional reference notes",
    "Notes verrouillées non modifiables": "Locked notes cannot be edited",
    "Notes-filles Zotero, attachées à la référence entière.": "Zotero child notes, attached to the whole reference.",
    "Ollama injoignable — repli lexical.": "Inference service unreachable, falling back to lexical.",
    "Ordre": "Order",
    "Ordre d’apparition dans la note": "Order of appearance in the note",
    "Oublier": "Forget",
    "Oublier les décisions enregistrées": "Forget the saved decisions",
    "Ouverture dans Zotero impossible : ": "Could not open in Zotero: ",
    "Ouvrez la note à exporter.": "Open the note you want to export.",
    "Ouvrez un schéma draw.io (.drawio.svg).": "Open a draw.io diagram (.drawio.svg).",
    "Ouvrez une note de référence (dossier « ": "Open a reference note (folder “",
    "Ouvrez une note en mode édition.": "Open a note in editing mode.",
    "Ouvrez une note pour voir des suggestions.": "Open a note to see suggestions.",
    "Ouvrez une note source Zotero.": "Open a Zotero source note.",
    "Ouvrez une note.": "Open a note.",
    "Ouvrir dans Zotero (lecteur ZotFlow, annotation ou source)": "Open in Zotero (ZotFlow reader, annotation or source)",
    "Où afficher les suggestions déclenchées par clic droit sur une sélection.": "Where to show suggestions triggered by right clicking a selection.",
    "Pandoc écrit sa propre section et laisse les en-têtes orphelins. Désactiver ne se justifie qu'en cas de difficulté.": "Pandoc writes its own section and leaves the headers orphaned. Turning this off is only worth trying if something goes wrong.",
    "Panier d'annotations": "Annotation basket",
    "Panier d'annotations : afficher / masquer": "Annotation basket: show or hide",
    "Panneau latéral (ancré)": "Side panel (docked)",
    "Part du score sémantique dans l’hybride (le reste est lexical).": "Share of the semantic score in the hybrid engine. The rest is lexical.",
    "Pause après ce silence": "Pause after this much silence",
    "Placez le curseur dans un paragraphe.": "Put the cursor inside a paragraph.",
    "Poids du sémantique": "Weight of the semantic score",
    "Police": "Font",
    "Police à largeur fixe dans l'explorateur": "Fixed width font in the file explorer",
    "Première ligne des tableaux markdown.": "First row of markdown tables.",
    "Profil de réglages": "Settings profile",
    "Profil écrit : ": "Profile written: ",
    "Profils (JSON)": "Profiles (JSON)",
    "Profils de standard": "Standard profiles",
    "Identifications écrites : ": "Identifications written: ",
    "Rien de nouveau à identifier.": "Nothing new to identify.",
    "Identification": "Identification",
    "Sources citantes": "Citing sources",
    "Actions": "Actions",
    "Références en attente (Ariane)": "Pending references (Ariane)",
    "Rattachement": "Attaching",
    "Bibliographie : recomposer celle de la note active": "Bibliography: rebuild the one in the active note",
    "Bibliographie : recomposer celles de toutes les notes": "Bibliography: rebuild the ones in every note",
    "Références citées : extraire celles de la source active": "Cited references: extract those of the active source",
    "Références citées : extraire celles de toutes les sources": "Cited references: extract those of every source",
    "Références citées : interrompre l’extraction": "Cited references: stop the extraction",
    "Références citées : structurer les entrées non structurées": "Cited references: structure the unstructured entries",
    "Références en attente : ouvrir la liste": "Pending references: open the list",
    "Mises de côté": "Set aside",
    "Aucun libellé à fusionner.": "No label to merge.",
    "Le PDF": "The PDF",
    "Cette source n’a pas de PDF attaché.": "This source has no PDF attached.",
    "Aucun libellé à détacher.": "No label to detach.",
    "Détachements : ": "Detachments: ",
    "note(s)": "note(s)",
    "Bibliographies lues dans les PDF": "Bibliographies read from the PDFs",
    "Crossref ne connaît que ce qui porte un DOI, or les livres n'en ont souvent pas et ce sont eux qui portent les références les plus citées. Zotero garde le texte extrait de chaque PDF : Ariane y lit la bibliographie directement.": "Crossref only knows what carries a DOI, yet books often have none and they carry the most cited references. Zotero keeps the extracted text of every PDF: Ariane reads the bibliography straight from it.",
    "Dossier de données Zotero": "Zotero data folder",
    "Vide : détection automatique dans votre dossier personnel.": "Empty: detected automatically in your home folder",
    "Normalisation…": "Normalising…",
    "Normalisation : ": "Normalising: ",
    "Conjonctions : ": "Conjunctions: ",
    "renommée(s)": "renamed",
    "fusionnée(s)": "merged",
    "en échec": "failed",
    "Déjà dans votre Zotero : ": "Already in your Zotero: ",
    "Ce libellé recouvre ": "This label covers ",
    " travaux différents.": " different works.",
    "Détacher": "Detach",
    "DOI": "DOI",
    " citation(s), d’après la bibliographie de ": " citation(s), from the bibliography of ",
    "Non identifiée : aucune bibliographie de source citante ne la mentionne.": "Not identified: no citing source bibliography mentions it.",
    "Le même travail est aussi cité sous : ": "The same work is also cited as: ",
    "Fusionner ": "Merge ",
    " ici": " here",
    "Rattacher à cette fiche": "Attach to this entry",
    "autre(s) fiche(s) Zotero possible(s)": "other possible Zotero entries",
    "œuvres": "works",
    "À détacher": "To detach",
    "À fusionner": "To merge",
    "Fusionnées": "Merged",
    "occurrence(s) non résolue(s), non comptée(s) ici.": "unresolved occurrence(s), not counted here.",
    "Fusionnée : ": "Merged: ",
    "Détachée : ": "Detached: ",
    "lien(s)": "link(s)",
    "Titre insuffisant pour détacher.": "Title too short to detach.",
    "Fusionner ici": "Merge here",
    "Détacher cette œuvre": "Detach this work",
    "Compté par œuvre": "Counted by work",
    "Ce libellé couvre plusieurs œuvres": "This label covers several works",
    "Même œuvre que": "Same work as",
    "Complétion": "Completion",
    "fiche complète": "complete record",
    "Fiche introuvable pour ce DOI.": "No record found for this DOI.",
    "La fiche du DOI ne concorde pas avec « ": "The DOI record does not match “",
    "Rien n’a été écrit.": "Nothing was written.",
    "Compléter depuis le DOI": "Complete from the DOI",
    "Compléter": "Complete",
    "Complétée : ": "Completed: ",
    "Atomiser : la note source active": "Atomise: the active source note",
    "Atomiser : toutes les sources": "Atomise: every source",
    "Atomiser : les notes-filles Zotero": "Atomise: Zotero child notes",
    "Annotations : afficher ou masquer le panier": "Annotations: show or hide the basket",
    "Annotations : ouvrir le panneau de suggestions": "Annotations: open the suggestions panel",
    "Annotations : reconstruire l’index des suggestions": "Annotations: rebuild the suggestions index",
    "Annotations : ouvrir dans Zotero": "Annotations: open in Zotero",
    "Citations : tout replier": "Citations: fold all",
    "Citations : tout déplier": "Citations: unfold all",
    "Citations : replier ou déplier": "Citations: fold or unfold",
    "Citations : rafraîchir les libellés…": "Citations: refresh the labels…",
    "Bibliographie : régénérer dans la note active": "Bibliography: rebuild in the active note",
    "Références en attente : ouvrir l’arbitrage": "Pending references: open the arbitration",
    "Références en attente : rattacher automatiquement": "Pending references: attach automatically",
    "Références en attente : lier la référence active à une fiche Zotero": "Pending references: link the active reference to a Zotero entry",
    "Entretien : réparer les liens d’auteurs": "Housekeeping: repair author links",
    "Entretien : retirer l’alias des liens d’annotation": "Housekeeping: strip the alias from annotation links",
    "Entretien : normaliser les conjonctions des références": "Housekeeping: normalise reference conjunctions",
    "Entretien : fusionner les doublons d’auteurs": "Housekeeping: merge duplicate authors",
    "Word : exporter avec citations Zotero": "Word: export with Zotero citations",
    "Word : vérifier le modèle": "Word: check the template",
    "Schémas : synchroniser dans les notes": "Diagrams: synchronise into the notes",
    "Schémas : valider le schéma actif": "Diagrams: validate the active diagram",
    "Schémas : interroger le graphe": "Diagrams: query the graph",
    "Temps : écrire le journal du jour": "Time: write today’s journal",
    "Temps : reporter maintenant dans les notes": "Time: report now into the notes",
    "Mes citations : régénérer la bibliographie de la note active": "My citations: rebuild the bibliography of the active note",
    "Mes citations : régénérer la bibliographie de toutes mes notes": "My citations: rebuild the bibliography of all my notes",
    "Ce que citent mes sources : générer la note de la source active (via API)": "What my sources cite: build the note for the active source (via API)",
    "Ce que citent mes sources : générer les notes de toutes les sources (via API)": "What my sources cite: build the notes for all sources (via API)",
    "Génération déjà en cours.": "Generation already running.",
    "Arrêter la génération des bibliographies": "Stop the bibliography generation",
    "Aucune génération en cours.": "No generation running.",
    "Génération interrompue : ": "Generation interrupted: ",
    "générée(s)": "generated",
    "sans résultat": "with no result",
    "Reste environ ": "About ",
    "sur ": "out of ",
    "appel(s) réseau": "network call(s)",
    "Réparer les liens d’auteurs (esperluette collée)": "Repair author links (stuck ampersand)",
    "Aucun lien d’auteur à réparer.": "No author link to repair.",
    "Liens d’auteurs réparés : ": "Author links repaired: ",
    " dans ": " in ",
    " note(s).": " note(s).",
    "sélectionnée(s)": "selected",
    "Tout sélectionner dans cet onglet": "Select everything in this tab",
    "Arbitrer": "Arbitrate",
    "Écrire les identifications": "Write the identifications",
    "Désélectionner": "Clear selection",
    "Un traitement est déjà en cours.": "A batch is already running.",
    "Arbitrage": "Arbitration",
    "Écriture": "Writing",
    "Marquage": "Marking",
    "aboutis": "succeeded",
    "Arrêter le lot": "Stop the batch",
    "Fiche Zotero trouvée": "Zotero entry found",
    "Identifiée": "Identified",
    "Identifiée, sans certitude": "Identified, uncertain",
    "Non identifiée": "Not identified",
    "Aucune bibliographie de source citante ne la mentionne.": "No citing source bibliography mentions it.",
    "Voir la fiche": "Open the entry",
    "Écrire cette identification": "Write this identification",
    "Annuler le verdict": "Undo the verdict",
    "Identification écrite : ": "Identification written: ",
    "Le modèle n’a pas tranché.": "The model did not decide.",
    "Autres candidats dans Zotero": "Other candidates in Zotero",
    "source(s)": "source(s)",
    "La source": "The source",
    "L'annotation": "The annotation",
    "Bibliographie indisponible pour cette source.": "No bibliography available for this source.",
    "Les ": "The ",
    " source(s) arbitrée(s) désignent la même œuvre.": " arbitrated source(s) point to the same work.",
    "Majorité : ": "Majority: ",
    " sources arbitrées.": " arbitrated sources.",
    "Un passage d’article cite une référence. Plusieurs œuvres portent le même auteur et la même année. Dis laquelle le passage désigne.": "A passage from an article cites a reference. Several works share the same author and year. Say which one the passage points to.",
    "Rends STRICTEMENT un objet JSON avec la clé numero (le numéro de l’œuvre dans la liste, ou 0 si le passage ne permet pas de trancher) et la clé confiance (haute, moyenne ou basse). Aucun texte hors du JSON.": "Return STRICTLY a JSON object with the key numero (the number of the work in the list, or 0 if the passage does not allow a decision) and the key confiance (haute, moyenne or basse). No text outside the JSON.",
    "Plusieurs œuvres": "Several works",
    "Cette référence désigne ": "This reference points to ",
    " œuvres distinctes selon la source.": " distinct works depending on the source.",
    "Faire arbitrer par le modèle": "Let the model arbitrate",
    "Arbitrage…": "Arbitrating…",
    "Arbitrages rendus : ": "Arbitrations returned: ",
    "Le modèle lit ici : ": "The model reads here: ",
    "confiance ": "confidence ",
    "Référence citée :": "Cited reference:",
    "Passage :": "Passage:",
    "Œuvres possibles :": "Possible works:",
    "Découpage des bibliographies": "Splitting raw bibliography entries",
    "Une entrée de bibliographie sur six n'existe qu'en texte brut, qu'aucune expression régulière ne découpe. Un modèle s'en charge. Il propose, il ne décide pas : chaque extraction est recoupée avec le texte d'origine, l'année, le nom et le titre devant s'y retrouver, sinon elle est jetée.": "One bibliography entry in six exists only as raw text, which no regular expression can split. A model handles it. It proposes, it does not decide: every extraction is checked against the original text, the year, the name and the title having to appear in it, otherwise it is discarded.",
    "Moteur du découpage": "Splitting engine",
    "Claude en ligne de commande": "Claude command line",
    "Modèle": "Model",
    "llama3.2 suffit largement pour cette tâche.": "llama3.2 is more than enough for this task.",
    "Clé Mistral": "Mistral key",
    "Conservée dans les réglages du greffon, sur votre machine.": "Kept in the plugin settings, on your machine.",
    "Commande": "Command",
    "Chemin du binaire, si « claude » ne suffit pas.": "Path to the binary, if “claude” is not enough.",
    "Lancer le découpage": "Run the splitting",
    "Une passe sur les entrées en texte brut, mise en cache. Interruptible, et reprise là où elle s'était arrêtée.": "One pass over the raw entries, cached. Interruptible, and resumed where it stopped.",
    "Découper": "Split",
    "Arrêter": "Stop",
    "Découper les bibliographies en texte brut": "Split raw bibliography entries",
    "Rien à découper.": "Nothing to split.",
    "Découpage : 0 / ": "Splitting: 0 / ",
    "Découpage : ": "Splitting: ",
    "Découpage terminé : ": "Splitting done: ",
    "retenus": "kept",
    "rejetés": "discarded",
    "Clé Mistral absente des réglages.": "Mistral key missing from settings.",
    "Référence :": "Reference:",
    "Tu reçois une référence bibliographique brute. Rends STRICTEMENT un objet JSON avec les clés auteurs (liste de noms de famille), annee (chaîne de 4 chiffres), titre (le titre de l'œuvre, sans la revue ni l'éditeur), revue (ou chaîne vide). Aucun texte hors du JSON.": "You are given a raw bibliographic reference. Return STRICTLY a JSON object with the keys auteurs (list of surnames), annee (four-digit string), titre (the title of the work, without the journal or publisher), revue (or empty string). No text outside the JSON.",
    "Analyse des références…": "Analysing references…",
    "Recalculer": "Recompute",
    "Dans sa bibliographie": "In its bibliography",
    "Dans sa bibliographie, sans certitude": "In its bibliography, uncertain",
    "ou bien : ": "or else: ",
    "Arbitrer les références en attente": "Arbitrate pending references",
    "Récupérer les bibliographies des sources citantes": "Fetch the bibliographies of citing sources",
    "Récupérer les bibliographies": "Fetch bibliographies",
    "Bibliographies déjà à jour.": "Bibliographies already up to date.",
    "Bibliographies : 0 / ": "Bibliographies: 0 / ",
    "Bibliographies : ": "Bibliographies: ",
    "Bibliographies récupérées : ": "Bibliographies fetched: ",
    "Toutes": "All",
    "À rattacher": "To attach",
    "À arbitrer": "To arbitrate",
    "À acquérir": "To acquire",
    "Non résolues": "Unresolved",
    "Écartées": "Set aside",
    "Rien dans cette catégorie.": "Nothing in this category.",
    "Déjà connu": "Already known",
    "Citée dans": "Cited in",
    "Aucune source identifiée.": "No source identified.",
    "Candidats dans Zotero": "Candidates in Zotero",
    "DOI identique": "same DOI",
    "auteur et année": "author and year",
    "candidat": "candidate",
    "Aucun candidat.": "No candidate.",
    "Rattacher": "Attach",
    "Ne plus marquer": "Unmark",
    "Réintégrer": "Bring back",
    "Écarter": "Set aside",
    "Ouvrir la note": "Open the note",
    "Copier": "Copy",
    "Ouvrir": "Open",
    "Note introuvable : ": "Note not found: ",
    "L'export Word demande pandoc et n'est possible que sur ordinateur.": "Exporting to Word needs pandoc and only works on the desktop.",
    "Annotations sans titre": "Untitled annotations",
    "Par défaut, une annotation dont le commentaire ne correspond à aucun profil est ignorée : elle ne devient pas une note. Activez l'option ci-dessous pour l'atomiser quand même, avec un titre déduit de son contenu.": "By default, an annotation whose comment matches no profile is skipped: it never becomes a note. Turn the option below on to atomise it anyway, with a title inferred from its content.",
    "Atomiser les annotations sans titre": "Atomise untitled annotations",
    "Le commentaire entier devient la paraphrase et le titre est déduit.": "The whole comment becomes the paraphrase and the title is inferred.",
    "Déduire le titre à partir de": "Infer the title from",
    "À défaut, l'autre source est utilisée, puis la clé Zotero.": "Failing that, the other source is used, then the Zotero key.",
    "Le commentaire": "The comment",
    "Le texte surligné": "The highlighted text",
    "Longueur maximale du titre déduit": "Maximum length of the inferred title",
    "En caractères. La coupe se fait à la fin de la première phrase, sinon au dernier mot entier.": "In characters. The cut falls at the end of the first sentence, otherwise at the last whole word",
    "Propager les suppressions": "Propagate deletions",
    "Propose un rôle par dossier dont le nom s'en approche. Rien n'est écrit sans votre relecture.": "Proposes a role for each folder whose name comes close. Nothing is written without your review.",
    "Proposer": "Propose",
    "Proposer depuis mon coffre": "Propose from my vault",
    "Propre à cette machine : jamais reprise dans un profil exporté.": "Specific to this machine, and never carried into an exported profile.",
    "Propriété des notes sources contenant la référence mise en forme par zotflow (filtre « bibliography »). Le style se règle dans zotflow. Champ absent : Ariane utilise le modèle libre ci-dessous.": "The property of source notes holding the reference as formatted by ZotFlow. The style itself is set in ZotFlow. If the field is missing, Ariane falls back to the free template below.",
    "Propriété où inscrire le total": "Property where the total is written",
    "Propriétés à consulter": "Properties to look at",
    "Préfixe": "Prefix",
    "Préfixe des notes de bibliographie": "Prefix for bibliography notes",
    "Quand l'appel [^n] disparaît, retire sa définition. N'agit que sur les notes contenant des liens d'annotation.": "When the [^n] marker disappears, removes its definition. Only acts on notes containing annotation links.",
    "Quand plusieurs flèches partent d’un même bloc et qu’une seule porte une étiquette, elle vaut pour tout le faisceau. Sans effet si deux étiquettes différentes coexistent.": "When several arrows leave the same shape and only one carries a label, that label applies to all of them. No effect if two different labels coexist.",
    "Quand une annotation cite un travail absent de Zotero — donc non consulté directement — la citation prend la forme « Moulin et Gérard, 2026, p. 345, cité dans Aven, 2012, p. 34 ». Si ce travail figure dans Zotero, il est cité directement. Texte inséré entre les deux références :": "When an annotation cites a work absent from Zotero, and therefore not read directly, the citation reads “Moulin and Gérard, 2026, p. 345, as cited in Aven, 2012, p. 34”. If that work is in Zotero, it is cited directly. Text inserted between the two references:",
    "Quand une annotation cite une référence absente de Zotero, la citation prend la forme : « Auteurs, année<texte ci-dessous>Source, p. XX ». Si la référence citée existe dans Zotero, elle est citée directement.": "When an annotation cites a reference absent from Zotero, the citation reads “Authors, year<text below>Source, p. XX”. If the cited reference exists in Zotero, it is cited directly.",
    "Quand une annotation rapporte des travaux que vous n'avez pas consultés, la source consultée porte un compteur des travaux qu'elle rapporte, au lieu de les nommer tous dans le fil du texte. Le survol du compteur les affiche en liens cliquables. Les références déjà présentes dans Zotero restent citées en clair, puisque vous les avez lues. Après changement, lancer « Citations : rafraîchir les libellés » pour réécrire les notes.": "When an annotation reports works you have not read yourself, the source you did read carries a counter of those works instead of naming them all in the running text. Hovering the counter shows them as clickable links. References already in Zotero stay cited in full, since you have read them. After changing this, run “Citations: refresh labels” to rewrite the notes.",
    "Rafraîchir les suggestions (sans modèle de langue)": "Refresh the suggestions (without the language model)",
    "Rafraîchissement des citations…": "Refreshing citations…",
    "Range chaque annotation dans un sous-dossier au nom de sa source (@citekey).": "Files each annotation in a subfolder named after its source (@citekey).",
    "Rattachement aux sources Zotero": "Attachment to Zotero sources",
    "Rattacher automatiquement les références en attente aux sources Zotero": "Attach pending references to Zotero sources automatically",
    "Rattacher les en-têtes du modèle": "Reattach the template headers",
    "Reclassement par modèle de langue": "Reranking by a language model",
    "Reclasser automatiquement": "Rerank automatically",
    "Recommandé : de meilleures limites de débit avec un email.": "Recommended, since an email address raises the rate limits.",
    "Reconstruire": "Rebuild",
    "Reconstruire l'index maintenant": "Rebuild the index now",
    "Recopier le contenu dans la note": "Copy the contents into the note",
    "Regex d'image": "Image regex",
    "Regex de bloc": "Block regex",
    "Regex de page": "Page regex",
    "Regrouper par source": "Group by source",
    "Relations admises": "Allowed relations",
    "Relations entrantes": "Incoming relations",
    "Relations sortantes": "Outgoing relations",
    "Relie les références en attente aux fiches Zotero par auteurs + année. Les correspondances certaines (un seul appariement possible) sont toujours rattachées sans rien demander ; ce réglage ne concerne que les cas ambigus.": "Links pending references to Zotero entries by author and year. Certain matches, where only one pairing is possible, are always attached without asking. This setting concerns ambiguous cases only.",
    "Relâcher l'argument": "Release the passage",
    "Rend insécables les espaces déjà présentes devant « ; », « : », « ! », « ? » et « » », et après « « ». Aucune espace n'est ajoutée : les adresses, les heures et les grappes de citation restent intactes.": "Turns spaces already present before “;”, “:”, “!”, “?” and “»”, and after “«”, into non breaking ones. No space is ever added, so URLs, clock times and citation clusters stay untouched.",
    "Renommage en cours…": "Renaming…",
    "Renommer": "Rename",
    "Renommer une propriété": "Rename a property",
    "Renseignez un modèle Word valide dans les réglages.": "Set a valid Word template in the settings.",
    "Renvoi vers la note source": "Link back to the source note",
    "Repliement des citations": "Folding of citations",
    "Replier par défaut": "Fold by default",
    "Reprendre les suggestions": "Resume suggestions",
    "Restaure toute édition manuelle des notes générées.": "Restores any manual edit made to generated notes.",
    "Retirer cette famille": "Remove this family",
    "Retirer l'alias affiché des liens d'annotation": "Remove the displayed alias from annotation links",
    "Retirer la numérotation saisie à la main": "Remove hand typed numbering",
    "Retirer les crochets des propriétés": "Remove brackets from properties",
    "Retirer les parenthèses des références": "Remove parentheses from references",
    "Rien à importer.": "Nothing to import.",
    "Rien à proposer.": "Nothing to propose.",
    "Ré-atomiser tout le coffre": "Re-atomise the whole vault",
    "Ré-atomiser toutes les sources": "Re-atomise every source",
    "Récupère la bibliographie d'une source via Crossref/OpenAlex (commandes « Confirmer les références en attente » et « Générer la bibliographie citée »).": "Fetches the bibliography of a source through Crossref and OpenAlex.",
    "Récupération de la bibliographie…": "Fetching the bibliography…",
    "Référence de la note": "Reference of the note",
    "Référence par défaut = source": "Default reference is the source",
    "Référence « ": "Reference “",
    "Références & auteurs": "References and authors",
    "Références : ": "References: ",
    "Références citées (apparat « cité dans »)": "Cited references (secondary source apparatus)",
    "Références citées mais pas encore dans Zotero.": "References cited but not yet in Zotero.",
    "Références citées via API : désactivé dans les réglages.": "Cited references through the API are disabled in the settings.",
    "Références citées via API : désactivé.": "Cited references through the API are disabled.",
    "Références en attente": "Pending references",
    "Régénère la bibliographie après une pause dans la frappe.": "Rebuilds the bibliography after a pause in typing.",
    "Régénère les annotations à chaque modification de la source.": "Rebuilds annotations whenever the source changes.",
    "Régénère toutes les annotations à partir des sources.": "Rebuilds every annotation from its source.",
    "Régénération automatique": "Automatic rebuild",
    "Réindexe les dossiers candidats et réencode si nécessaire.": "Reindexes the candidate folders and re-encodes where needed.",
    "Réinitialisation": "Reset",
    "Réinitialiser": "Reset",
    "Rétablir les réglages par défaut": "Restore the default settings",
    "Rôles — où Ariane range ses productions": "Roles: where Ariane files what it produces",
    "Schémas": "Diagrams",
    "Schémas : ": "Diagrams: ",
    "Schémas : interroger le graphe": "Diagrams: query the graph",
    "Schémas : synchroniser le contenu dans les notes associées": "Diagrams: sync contents into the paired notes",
    "Schémas : valider le schéma actif": "Diagrams: validate the active diagram",
    "Schémas draw.io (.drawio.svg) et notes associées. L’éditeur lui-même est fourni par le plugin Ariane-graph.": "draw.io diagrams (.drawio.svg) and their paired notes. The editor itself comes from the Ariane-graph plugin.",
    "Score final minimal (en %) pour qu'une note soit proposée. Plus haut = plus sélectif.": "Minimum final score, as a percentage, for a note to be proposed. Higher means more selective.",
    "Sert à mesurer la proximité de sens entre vos notes.": "Used to measure how close in meaning your notes are.",
    "Service": "Service",
    "Service d'inférence local": "Local inference service",
    "Seuil de pertinence": "Relevance threshold",
    "Si activé, tout lien de note peut être déposé. Sinon, seules les annotations.": "When enabled, any note link can be dropped. Otherwise, annotations only.",
    "Si une annotation ne cite aucune référence, utilise sa source Zotero.": "If an annotation cites no reference, use its Zotero source.",
    "Signale en erreur toute étiquette hors des listes ci-dessus. Sans cela, elles sont seulement signalées comme inconnues.": "Reports as an error any label outside the lists above. Otherwise they are merely flagged as unknown.",
    "Signaler les dépôts non reconnus": "Report unrecognised drops",
    "Sortie": "Output",
    "Sortie de l'export Word.": "Output of the Word export.",
    "Source des données": "Data source",
    "Sources à ne jamais atomiser": "Sources never to atomise",
    "Style du contenu des mises en avant « > [!info] ».": "Style for the contents of “> [!info]” callouts.",
    "Styles du modèle employés": "Template styles in use",
    "Styles du modèle non appliqués : ": "Template styles not applied: ",
    "Suggestions": "Suggestions",
    "Suggestions (Ariane)": "Suggestions (Ariane)",
    "Suggestions d'annotations : ouvrir le panneau": "Annotation suggestions: open the panel",
    "Suggestions d'annotations : reconstruire l'index": "Annotation suggestions: rebuild the index",
    "Suggestions dynamiques d'annotations": "Live annotation suggestions",
    "Suggestions désactivées dans les réglages.": "Suggestions are disabled in the settings.",
    "Suggestions par argument (clic droit)": "Suggestions for a passage (right click)",
    "Suggestions pour l'argument": "Suggestions for the passage",
    "Supprime la note quand l'annotation disparaît de la source et retire ses liens. Action destructive.": "Deletes the note when the annotation disappears from the source, and removes its links. This is destructive.",
    "Supprimer les notes de bas de page orphelines": "Delete orphaned footnotes",
    "Suspendre les suggestions": "Pause suggestions",
    "Synchronisation des schémas…": "Syncing diagrams…",
    "Sémantique (embeddings)": "Semantic (embeddings)",
    "Séparateur d'auteurs (regex)": "Author separator (regex)",
    "Séparateur de citations": "Citation separator",
    "Séparateur entre citations": "Separator between citations",
    "Séparées par des virgules.": "Separated by commas.",
    "Taguer les annotations non citées": "Tag annotations that are never cited",
    "Taille de l'aparté": "Size of the aside",
    "Temps : reporter maintenant dans les notes": "Time: write it into the notes now",
    "Temps : écrire le journal du jour": "Time: write today's journal",
    "Temps de la note en cours. Le point est plein quand le compteur tourne, vide en pause. Un clic ouvre le journal du jour.": "Time on the current note. The dot is solid while the timer runs and hollow when paused. Clicking it opens today's journal.",
    "Temps d’inactivité dans la frappe avant de rafraîchir.": "How long typing must stop before refreshing.",
    "Temps passé": "Time spent",
    "Temps reporté dans les propriétés.": "Time written into the properties.",
    "Test du modèle…": "Testing the model…",
    "Test en cours…": "Testing…",
    "Tester": "Test",
    "Titre 1  (#)": "Heading 1  (#)",
    "Titre 2  (##)": "Heading 2  (##)",
    "Titre 3  (###)": "Heading 3  (###)",
    "Titre 4  (####)": "Heading 4  (####)",
    "Titre de la section": "Section title",
    "Titre de la section des notes": "Title of the notes section",
    "Trancher les ambiguës par le modèle local": "Let the local model decide ambiguous ones",
    "Type d'encadré de citation": "Callout type for quotations",
    "Types de blocs admis": "Allowed shape types",
    "Types inconnus": "Unknown types",
    "Un modèle de langue relit les meilleurs candidats et les remet en ordre. C'est de loin le poste le plus lourd du greffon : il ne part que sur demande, par le bouton ✨ du panneau.": "A language model reviews the best candidates and puts them back in order. It is by far the heaviest part of the plugin, so it only runs on demand, through the ✨ button in the panel.",
    "Un panneau latéral propose, au fil de ce que vous écrivez, les notes les plus proches. Tout est local, gratuit et hors-ligne. Ouvrez-le via l'icône ✦ du ruban ou la commande dédiée.": "A side panel proposes the closest notes as you write. Everything runs locally, free of charge and offline. Open it from the ✦ ribbon icon or the matching command.",
    "Un profil rassemble vos réglages pour les partager ou les retrouver ailleurs. Les chemins propres à cette machine — pandoc, filtre Lua, modèle Word, adresses des services d'inférence — n'y figurent jamais, et un profil importé ne les touche pas.": "A profile gathers your settings so you can share them or find them again elsewhere. Paths specific to this machine, meaning pandoc, the Lua filter, the Word template and the inference service addresses, never appear in it, and an imported profile never touches them.",
    "Une annotation ou une source déposée sur une phrase insère sa référence en ligne, entre parenthèses, avant la ponctuation finale.": "An annotation or a source dropped onto a sentence inserts its reference inline, in brackets, before the closing punctuation.",
    "Une citation entre parenthèses cède la place à une pastille portant le nombre de références. Un clic sur la pastille déplie cette citation seule ; les commandes « Citations : tout replier » et « tout déplier » agissent sur l'ensemble, comme le bouton de la barre latérale. En édition, une citation se déplie d'elle-même dès que le curseur y entre.": "A citation in brackets gives way to a badge carrying the number of references. Clicking the badge unfolds that citation alone, while the “fold all” and “unfold all” commands act on the whole note, as does the sidebar button. While editing, a citation unfolds on its own as soon as the cursor enters it.",
    "Une clé de citation par ligne. Certains modules de Zotero rangent leurs réglages dans un élément de la bibliothèque, qui remonte alors comme une source : « AddonItem » en est le cas le plus courant. Les notes sans prose sont déjà écartées d'elles-mêmes.": "One citation key per line. Some Zotero add-ons store their settings inside a library item, which then shows up as a source. “AddonItem” is the most common case. Notes containing no prose are already skipped on their own.",
    "Une note de bibliographie par source.": "One bibliography note per source.",
    "Une note par annotation Zotero.": "One note per Zotero annotation.",
    "Une phrase expliquant pourquoi chaque note est proposée. Sans elle, le reclassement est un peu plus rapide.": "A sentence explaining why each note is proposed. Without it, reranking is a little faster.",
    "Une propriété « [[Chabane Mazri]] » sort « Chabane Mazri ». Vaut pour les liens simples, les liens à alias et les liens markdown.": "A property written “[[Jane Doe]]” comes out as “Jane Doe”. This covers plain links, aliased links and markdown links.",
    "Variables : {{alias}} (titre), {{key}}, {{auteur}}, {{auteurs}}, {{annee}}. Ex. « ({{alias}}) », « ({{auteur}}, {{annee}}) ».": "Variables: {{alias}} (title), {{key}}, {{auteur}}, {{auteurs}}, {{annee}}. For example “({{alias}})” or “({{auteur}}, {{annee}})”.",
    "Variables : {{auteurs}}, {{auteursComplets}}, {{annee}}, {{page}}, {{key}}. Les fragments restés vides sont retirés.": "Variables: {{auteurs}}, {{auteursComplets}}, {{annee}}, {{page}}, {{key}}. Fragments left empty are removed.",
    "Variables : {{auteurs}}, {{auteursComplets}}, {{annee}}, {{titre}}, {{publication}}, {{doi}}, {{url}}, {{type}}, {{cle}}. Les fragments vides sont retirés.": "Variables: {{auteurs}}, {{auteursComplets}}, {{annee}}, {{titre}}, {{publication}}, {{doi}}, {{url}}, {{type}}, {{cle}}. Empty fragments are removed.",
    "Variables : {{authorLinks}}, {{name}}, {{year}}, {{firstAuthor}}.": "Variables: {{authorLinks}}, {{name}}, {{year}}, {{firstAuthor}}.",
    "Variables : {{key}}, {{title}}. Ex. « {{key}}_{{title}} » (recommandé), « {{title}} » ou « {{key}} ».": "Variables: {{key}}, {{title}}. For example “{{key}}_{{title}}” (recommended), “{{title}}” or “{{key}}”.",
    "Variables : {{key}}, {{title}}. Vide = pas d'alias.": "Variables: {{key}}, {{title}}. Empty means no alias.",
    "Variables : {{title}}, {{titleLink}} (titre cliquable vers l’annotation dans le PDF), {{annotationUrl}}, {{key}}, {{paraphrase}}, {{image}}, {{citation}}, {{highlight}}, {{source}}, {{page}}, {{pageLine}}, {{references}}, {{referenceLinks}}, {{sourceName}}.": "Variables: {{title}}, {{titleLink}} (clickable title leading to the annotation in the PDF), {{annotationUrl}}, {{key}}, {{paraphrase}}, {{image}}, {{citation}}, {{highlight}}, {{source}}, {{page}}, {{pageLine}}, {{references}}, {{referenceLinks}}, {{sourceName}}.",
    "Verrouiller les notes automatiques": "Lock generated notes",
    "Vider": "Clear",
    "Vocabulaire des schémas": "Diagram vocabulary",
    "Vocabulaire strict": "Strict vocabulary",
    "Voir les styles": "View the styles",
    "Vos notes s'appellent « NP-260826-07 » ou « CR-260826-07 » : le nom fait alors référence. Désactivé, le champ reste vide si aucune propriété n'est trouvée.": "If your notes are named like “NP-260826-07” or “CR-260826-07”, the filename is the reference. When disabled, the field stays empty if no property is found.",
    "Vérification du modèle — échec : ": "Template check failed: ",
    "Vérifier le modèle Word (jetons et gabarits)": "Check the Word template (tokens and layouts)",
    "ZotFlow [": "ZotFlow [",
    "chemin dans le coffre": "path inside the vault",
    "finition.py introuvable.": "finition.py not found.",
    "icône": "icon",
    "pandoc-zotero-live-citemarkers.lua avec ses dépendances.": "pandoc-zotero-live-citemarkers.lua, with its dependencies.",
    "ref, reference, réf": "ref, reference",
    "temps": "temps",
    "temps-passe": "temps-passe",
    "un ou plusieurs, séparés par des virgules": "one or more, separated by commas",
    "var(--font-monospace)": "var(--font-monospace)",
    "vous@exemple.fr": "you@example.com",
    "{ \"ariane\": \"…\", \"profil\": { … } }": "{ \"ariane\": \"…\", \"profil\": { … } }",
    "{{n}} tient la place du nombre de travaux rapportés.": "{{n}} stands for the number of reported works.",
    "« # » est le titre du document, pas une partie : « ## » devient donc Titre 1 dans Word.": "“#” is the document title, not a part, so “##” becomes Heading 1 in Word.",
    "« 2.1 Titre » devient « Titre » : Word numérote seul.": "“2.1 Title” becomes “Title”, since Word numbers on its own.",
    "« Automatique » suit la langue d'Obsidian. Le greffon parle français et anglais ; toute autre langue affiche l'anglais.": "“Automatic” follows the Obsidian language. The plugin speaks English and French, and any other language shows English.",
    "« auto » = Crossref puis OpenAlex. OpenAlex couvre mieux, Crossref est plus direct.": "“auto” means Crossref then OpenAlex. OpenAlex has wider coverage, Crossref is more direct.",
    "À défaut, le nom du fichier": "Otherwise, the filename",
    "À ne modifier qu'en connaissance de cause.": "Only change these if you know what you are doing.",
    "Échec : ": "Failed: ",
    "Écrire dans la note au plus tous les": "Write into the note at most every",
    "Écrire le journal automatiquement": "Write the journal automatically",
    "Écrit un fichier JSON dans le dossier du greffon. « Avec organisation » y ajoute vos dossiers et vos familles de notes ; sans, le profil ne contient que les réglages de fonctionnement.": "Writes a JSON file into the plugin folder. “With organisation” adds your folders and note families. Without it, the profile holds only the working settings.",
    "État au démarrage. Les commandes le modifient et l'enregistrent.": "State at startup. The commands change it and save it.",
    "Étiquettes hors vocabulaire": "Labels outside the vocabulary",
    "Étiquettes implicites": "Implicit labels",
    "Étiquettes portées par les flèches, ex. « précède », « contredit ».": "Labels carried by arrows, for example “precedes” or “contradicts”.",
    "Étiquettes portées par les formes, ex. « concept », « acteur ».": "Labels carried by shapes, for example “concept” or “actor”.",
    "— Aparté sur les annotations": "Aside on annotations",
    "⇱ Glisser sur un paragraphe": "⇱ Drag onto a paragraph",
    "Tâches": "Tasks",
    "Une note par tâche.": "One note per task.",
    "Ariane — nouvelle tâche": "Ariane — new task",
    "Intitulé": "Title",
    "Famille": "Kind",
    "Action": "Action",
    "Lecture": "Reading",
    "Source Zotero": "Zotero source",
    "Début": "Start",
    "Échéance": "Due",
    "Priorité": "Priority",
    "(aucune)": "(none)",
    "haute": "high",
    "moyenne": "medium",
    "basse": "low",
    "Jalon": "Milestone",
    "Repère de calendrier : seule l'échéance est retenue.": "Calendar marker: only the due date is kept.",
    "Liste Apple Rappels": "Apple Reminders list",
    "Créer": "Create",
    "Tâches : créer une tâche": "Tasks: create a task",
    "Une tâche sans intitulé ne se retrouve pas.": "A task without a title cannot be found again.",
    "Production": "Output",
    "Chercher…": "Search…",
    "aucune pour l instant": "none yet",
    "Auteur, titre, année ou clé…": "Author, title, year or key…",
    "Aucune fiche Zotero trouvée dans le coffre.": "No Zotero entry found in the vault.",
    "Ce qui est produit": "What is produced",
    "Une note du coffre, ou le chemin absolu d un fichier. Peut rester vide.": "A note in the vault, or the absolute path of a file. May stay empty.",
    "NC-202607081912  ou  /Users/…/soutenance.pptx": "NC-202607081912  or  /Users/…/talk.pptx",
    "Conflit de champs": "Conflicting fields",
    "Seul le premier est retenu.": "Only the first one is kept.",
    "Source": "Source",
    "Ouvrir le PDF": "Open the PDF",
    "Ouvrir dans Zotero": "Open in Zotero",
    "Livrable": "Output",
    "Fichier": "File",
    "modifié le": "changed on",
    "ouvert le": "opened on",
    "Tâches : rafraîchir le bloc de la tâche active": "Tasks: refresh the block of the active task",
    "Bloc rafraîchi.": "Block refreshed.",
    "Cette note n'est pas une tâche.": "This note is not a task.",
  },
};
let LANGUE = 'fr';

function definirLangue(choix) {
  if (choix === 'fr' || choix === 'en') { LANGUE = choix; return LANGUE; }
  // « auto » : on suit la langue d'Obsidian, et l'on retombe sur l'anglais
  // pour toute langue que le greffon ne parle pas.
  let l = 'en';
  try {
    l = (window.localStorage.getItem('language') || navigator.language || 'en').slice(0, 2);
  } catch (e) { l = 'en'; }
  LANGUE = (l === 'fr') ? 'fr' : 'en';
  return LANGUE;
}

function tr(cle) {
  if (LANGUE === 'fr') return cle;
  const table = TEXTES[LANGUE];
  const v = table ? table[cle] : null;
  return v == null ? cle : v;
}

const DEFAULT_SETTINGS = {
  langue: 'auto',               // 'auto' | 'fr' | 'en'
  // --- Dossiers ---
  dossierAnnotations: '',       // rôle : où atomiser les annotations
  dossierNotesLecture: '',      // rôle : où atomiser les notes-filles Zotero
  sourcesExclues: [],           // clés de citation à ne jamais atomiser
  atomiserNotesLecture: true,
  dossierReferences: '',        // rôle : où déposer les références en attente
  dossierTaches: '',            // rôle : où déposer les notes de tâche
  listeRappelsDefaut: 'Doctorat - Tâches',
  // FAMILLES DE NOTES — la table que l'utilisateur remplit lui-même. Elle
  // remplace les réglages qui nommaient en dur des types de notes
  // (« notes conceptuelles ») et les listes de dossiers éparpillées. Chaque
  // ligne : { nom, dossiers[], prefixe, aparte, suggestions, couleur, icone,
  // monospace, alias }. Vide par défaut : le greffon ne présume d'aucune
  // organisation, et se peuple à la première ouverture des réglages.
  famillesNotes: [],
  // Anciennes clés, conservées le temps de la migration (voir migrerFamilles).
  dossierNotesConceptuelles: '',
  prefixeNoteConceptuelle: '',
  // Correspondances manuelles « Auteur, 2005a » -> « @citekeyZotero » (désambiguïsation)
  correspondancesSuffixe: {},
  regrouperParSource: true, // sous-dossier par source (@citekey)

  // --- Nommage / alias ---
  formatNomFichier: '{{key}}_{{title}}', // nom de fichier ; variables {{key}}, {{title}}
  aliasTemplate: '{{key}}', // contenu de l'alias (vide = pas d'alias)
  aliasSurLiens: true, // affiche « (Titre) » discret après un lien montrant la clé
  // Repliement des citations entre parenthèses : la référence cède la place à
  // une pastille cliquable, pour aérer la lecture et l'édition.
  // Citations indirectes : la source consultée porte un compteur des travaux
  // qu'elle rapporte, au lieu de les nommer tous dans le fil du texte.
  citationsIndirectesAbregees: true,
  citationsMarqueEmprunt: '⟨{{n}}⟩',
  // --- Temps passé sur les notes ----------------------------------------
  tempsActif: true,
  tempsPropriete: 'temps-passe',        // en minutes, dans le frontmatter
  tempsInactiviteSec: 120,              // pause après ce silence
  tempsEcritureSec: 300,                // report en propriété, au plus tous les…
  tempsIgnorerVerrouillees: true,       // ne pas chronométrer « locked: true »
  tempsBarreEtat: true,
  tempsInfobulleExplorateur: true,
  tempsDossierJournal: '',      // rôle : où écrire le journal du compteur
  tempsJournalAuto: true,               // écrire le journal au changement de jour
  tempsHistorique: {},                  // { 'AAAA-MM-JJ': { chemin: secondes } }
  // Total de référence, en secondes, par note. La propriété du frontmatter en
  // est dérivée : arrondir à chaque report, en repartant d'une valeur déjà
  // arrondie, gonflait le total à chaque écriture.
  tempsTotalSecondes: {},
  tempsRetenirJours: 120,
  dropSignalerRefus: true, // prévenir quand un dépôt n'est pas reconnu
  citationsRepliables: true,
  citationsRepliees: false, // état courant, piloté par les commandes
  aparteAnnotations: true, // aparté actif pour les liens vers des annotations
  aparteConceptuelles: true, // aparté actif pour les liens vers des notes conceptuelles
  dossiersAliasExplorateur: [], // dossiers dont les notes affichent leur alias dans l'explorateur
  modeleAparte: ' ({{alias}})', // format de l'aparté ; variables {{alias}}, {{key}}
  aparteCouleur: '', // couleur CSS (vide = atténuée par défaut)
  aparteTaille: '0.8em', // taille de police de l'aparté
  dropSurParagraphe: true, // déposer une note sur un paragraphe -> note de bas de page
  dropToutesNotes: true, // accepter n'importe quelle note (sinon seulement les annotations)
  titreSectionNotes: 'Annotations de lecture associées', // en-tête de la section des notes
  modeleCitation: '{{auteurs}}, {{annee}}, p. {{page}}',
  separateurCitation: ' ; ',
  // Bibliographie de fin de note, régénérée d'après les citations du corps.
  biblioAuto: true,
  biblioTitre: 'Bibliographie',
  biblioModele: '{{auteurs}} ({{annee}}). {{titre}}. *{{publication}}*.',
  biblioTri: 'auteur', // 'auteur' | 'apparition'
  // Champ des notes sources contenant la référence déjà mise en forme par
  // zotflow (filtre Liquid « bibliography », style réglé dans zotflow).
  // Vide ou absent : Ariane retombe sur le modèle libre ci-dessus.
  biblioChamp: 'bibliographie',
  biblioLien: true, // ajouter un renvoi vers la note source
  biblioLienTexte: '↗', // libellé de ce renvoi
  nettoyerNotesOrphelines: true, // retirer la définition d'une note quand son appel disparaît
  marquerOrphelines: true, // taguer les annotations à 0 appel (pour le graphe)
  tagOrpheline: 'orphelin', // nom du tag (sans #)

  // --- Comportement ---
  regenerationAuto: true,
  verrouillage: true,
  propagerSuppressions: true,
  rattachementZotero: true,
  referenceParDefautSource: true, // si aucune réf. citée, utiliser la source
  liensAuteurs: true, // propriété "auteurs" (nom complet) + notes d'auteur dédiées
  dossierAuteurs: 'Auteurs',
  // --- Export Word avec citations Zotero vivantes (Pandoc + filtre BBT) ---
  exportPandocBin: 'pandoc',    // propre à la machine : jamais exporté dans un profil
  exportFiltreLua: '',          // propre à la machine : jamais exporté dans un profil
  exportDossier: '',            // rôle : où déposer les documents exportés
  // Mise en forme du document exporté.
  exportDecalerTitres: true,        // « # » est le titre du document, pas une partie
  exportRetirerNumerotation: true,  // Word numérote seul
  exportStyleEncadre: 'Items de réflexion',
  exportInsecables: true,       // espaces insécables devant ; : ! ? et autour des guillemets
  exportStyleEnteteTableau: 'Titre de tableau',
  exportStyleCelluleTableau: 'Champ de tableau',
  exportEntetes: true,          // rattacher les en-têtes du modèle
  exportNettoyerLiens: true,    // [[Chabane Mazri]] -> Chabane Mazri dans les propriétés
  exportProprieteReference: 'ref, reference, réf, référence',
  exportRefDepuisNom: true,     // à défaut de propriété, le nom du fichier fait référence

  exportBibliographie: true,
  // Apparat de citation de seconde main, partagé par les citations en ligne
  // et par l'export Word.
  citeDans: ', cité dans ',
  exportCiteDansActif: true,    // sinon, on ne cite que la source consultée
  exportModeleWord: '',
  exportMapStyles: { Heading1: '', Heading2: '', Heading3: '', Heading4: '', BodyText: 'Corps de texte', BlockText: 'Citation intense', Compact: 'Corps de texte' },
  validationRattachement: true, // confirmer les rattachements AMBIGUS (risque d'homonymie)
  rattachementAutoCertain: true, // rattacher sans confirmation les correspondances certaines (unique appariement fort)
  // Cas ambigus : trancher par le modèle local plutôt que de vous interroger.
  rattachementIA: true,
  // Décisions déjà prises, pour ne jamais reposer deux fois la même question.
  rattachementsDecides: {},

  // --- Références citées via API bibliographique (Crossref / OpenAlex) ---
  apiReferencesCitees: true, // activer la récupération des références citées d'une source
  apiSource: 'auto', // 'auto' (Crossref puis OpenAlex) | 'crossref' | 'openalex'
  apiEmail: '', // email pour les « polite pools » Crossref/OpenAlex (recommandé)
  dossierBibliographies: '',    // rôle : où écrire les bibliographies citées
  prefixeBibliographie: 'Biblio - ', // préfixe du nom des notes de biblio (évite l'homonymie avec la source)

  // --- Détection des sources ---
  marqueurSource: '<!-- ZF_ANNO_BEG_',

  // --- Analyse (global) ---
  blocRegex: '<!-- ZF_ANNO_BEG_(\\w+) -->([\\s\\S]*?)<!-- ZF_ANNO_END_\\1 -->',
  pageRegex: '\\.pdf,\\s*p\\.\\s*([^\\]]+?)\\]\\(obsidian',
  imageRegex: '!\\[\\[([^\\]]+?)\\]\\]',
  retirerParentheses: true,
  // Annotations dont le commentaire ne porte pas de titre reconnu : écartées
  // par défaut, atomisées avec un titre de repli si l'option est active.
  titreFacultatif: false,
  titreReplSource: 'paraphrase', // 'paraphrase' | 'surlignage'
  titreReplLongueur: 60,
  separateurCitations: ';',
  separateurAuteurs: '\\s+(?:and|et|&)\\s+|\\s*,\\s*',

  // --- Profils de standard (multi-standards) ---
  // Chaque profil : { nom, titreRegex (groupe 1 = titre),
  //                   referenceRegex (groupe 1 = texte de référence) }
  profils: [
    {
      nom: 'ZotFlow standard (gras / texte / *(référence)*)',
      titreRegex: '^\\*\\*(.+?)\\*\\*\\.?$',
      referenceRegex: '^\\*(?!\\*)(.+?)(?<!\\*)\\*$',
    },
  ],

  // --- Citation (texte surligné) ---
  inclureCitation: true,
  calloutCitation: 'quote',

  // --- Modèles de sortie ---
  modeleNote: '**{{titleLink}}**\n\n{{image}}\n\n{{paraphrase}}\n\n{{citation}}\n\nSource : {{source}}\n\n{{references}}',
  labelReferences: 'Références citées : ',
  labelPage: 'Page : ',
  modeleReference: '---\ntype: reference-citee\n---\n\n{{authorLinks}}',

  // --- Suggestions dynamiques (local, gratuit) ---
  suggActif: true, // panneau de suggestions actif
  suggDossiersCandidats: [],   // migré vers famillesNotes
  // Filtre du panneau : dossiers candidats momentanément décochés.
  suggDossiersMasques: [],

  suggK: 8, // nombre de suggestions affichées
  suggSeuil: 0.18, // score final minimal (0..1)
  suggAntirebond: 900, // ms d'inactivité avant recalcul
  // Moteur : 'lexical' | 'semantique' | 'hybride'
  suggMoteur: 'hybride',
  suggArgAffichage: 'panneau', // suggestions par argument (clic droit) : 'panneau' | 'flottant'
  hoverPartout: true, // aperçu au survol des liens hors éditeur (chat Claudian, etc.)
  // Police monospace (largeur fixe) pour les noms codés dans l'explorateur.
  // --- Pont draw.io : vocabulaire et export (voir plugin Ariane-graph) ---
  cartesStrict: false, // true = signaler en erreur toute étiquette hors vocabulaire
  cartesTypesBlocs: [],
  cartesRelations: [],
  schemaSyncAuto: true, // recopier le contenu des schémas dans leur note
  schemaPropagerEtiquettes: true, // une étiquette unique vaut pour tout le faisceau
  verrouLecture: true, // rendre non modifiables les notes « locked: true »
  cartesSvgPolice: 'Helvetica',
  cartesSvgTaille: 10,
  nomsMonospaceFont: '', // vide = police de code d'Obsidian (var(--font-monospace))
  // Dossiers dont les notes s'affichent en police à largeur fixe.
  // Correspondance exacte : les sous-dossiers ne sont PAS concernés.
  dossiersMonospace: [],       // migré vers famillesNotes
  suggPoidsSemantique: 0.7, // poids du score sémantique dans l'hybride (0..1)
  // Style par dossier candidat : { "dossier": { couleur, icone } }
  suggStylesDossiers: {},
  // Embeddings via Ollama (local, gratuit)
  suggFournisseur: 'ollama',     // 'ollama' ou 'lmstudio'
  suggOllamaUrl: 'http://localhost:11434',
  suggLmStudioUrl: 'http://localhost:1234',
  suggModeleEmbed: 'bge-m3',
  // Reclassement + justification par LLM local (optionnel)
  suggRerank: false,
  suggRerankAuto: false,        // le reclassement ne part plus seul : bouton « Affiner »
  suggRerankJetons: 400,        // borne de longueur de la réponse du modèle
  suggRerankDelaiSec: 45,       // au-delà, on rend la main
  suggRerankJustif: true, // afficher la phrase de justification
  suggModeleLLM: 'llama3.2',

  // --- Moteur du découpage bibliographique ---
  // Séparé de celui des suggestions : Mistral et le CLI de Claude savent
  // rédiger mais ne fournissent pas les embeddings dont l'index a besoin.
  refsFournisseur: 'ollama',   // 'ollama' | 'lmstudio' | 'mistral' | 'claude'
  refsModele: 'llama3.2',
  refsCleMistral: '',
  refsCheminClaude: 'claude',
  // Dossier de données de Zotero. Vide : détection automatique (~/Zotero).
  dossierZotero: '',
  suggRerankTopN: 12,
};

/* =========================================================================
 * Fonctions PURES (testables hors Obsidian, pilotées par la config)
 * ========================================================================= */

function echapperRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Nom complet de l'auteur tel qu'utilisé dans Zotero, normalisé en
// « Prénom Nom » (accepte aussi « Nom, Prénom »).
// Retire un éventuel balisage de lien [[...]] (et son alias) d'un nom d'auteur.
// Les « creators » des notes source ZotFlow sont désormais des liens, il faut
// donc les dé-baliser avant de nommer les fiches auteurs ou de comparer.
function sansLien(s) {
  return String(s == null ? '' : s)
    .replace(/^\s*!?\[\[/, '')
    .replace(/\]\]\s*$/, '')
    .replace(/\|.*$/, '')
    .trim();
}

function nomCompletAuteur(c) {
  let s = sansLien(c);
  if (!s) return '';
  if (s.includes(',')) {
    const parts = s.split(',');
    s = (parts.slice(1).join(',').trim() + ' ' + parts[0].trim()).trim();
  }
  return s.replace(/\s+/g, ' ');
}

// Remplace les variables {{var}} d'un modèle par leurs valeurs.
function appliquerModele(modele, vars) {
  return String(modele).replace(/{{\s*(\w+)\s*}}/g, (m, k) =>
    vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''
  );
}

// Remplace la conjonction entre auteurs (« et », « and ») par « & »,
// en préservant « et al. ». Ex. « Bird et Tobin, 2018 » -> « Bird & Tobin, 2018 ».
function normaliserConjAuteurs(s) {
  if (!s) return s;
  let out = String(s).replace(/\bet\s+al\.?/gi, '@@ETAL@@');
  out = out.replace(/\s+et\s+/g, ' & ').replace(/\s+and\s+/gi, ' & ');
  out = out.replace(/@@ETAL@@/g, 'et al.');
  return out;
}

// Calcule les plages [from,to] à supprimer pour retirer les définitions de
// notes de bas de page « orphelines » gérées par le plugin (celles dont
// l'appel [^label] a disparu du corps ET dont le bloc contient un lien [[…]]).
// Retire aussi l'en-tête de section s'il ne reste plus aucune définition.
// Fonction pure (testée hors ligne) : ne dépend que de la chaîne du document.
function rangesNotesOrphelines(docStr, titre) {
  const lignes = docStr.split('\n');
  const offsets = [];
  let acc = 0;
  for (const l of lignes) { offsets.push(acc); acc += l.length + 1; }
  const total = docStr.length;
  const lineStart = (i) => offsets[i];
  const lineEndExcl = (i) => (i + 1 < lignes.length ? offsets[i + 1] : total);

  // Appels de note réellement utilisés (on ignore les marqueurs de définition).
  const refs = new Set();
  for (let i = 0; i < lignes.length; i++) {
    const line = lignes[i];
    const re = /\[\^([^\]\s]+)\]/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const after = line.slice(m.index + m[0].length);
      if (after.startsWith(':')) continue; // c'est une définition
      refs.add(m[1]);
    }
  }

  // Définitions et étendue de leur bloc (lignes indentées suivantes).
  const defs = [];
  for (let i = 0; i < lignes.length; i++) {
    const d = lignes[i].match(/^[ \t]*\[\^([^\]]+)\]:/);
    if (!d) continue;
    let j = i;
    while (j + 1 < lignes.length && /^[ \t]/.test(lignes[j + 1])) j++;
    const gere = /\[\[/.test(lignes.slice(i, j + 1).join('\n'));
    defs.push({ label: d[1], i, j, gere });
  }

  const ranges = [];
  for (const dd of defs) {
    if (!(dd.gere && !refs.has(dd.label))) continue;
    let last = dd.j;
    if (dd.j + 1 < lignes.length && lignes[dd.j + 1].trim() === '') last = dd.j + 1;
    ranges.push({ from: lineStart(dd.i), to: lineEndExcl(last) });
  }

  const restantes = defs.filter((dd) => !(dd.gere && !refs.has(dd.label)));
  if (restantes.length === 0 && titre) {
    for (let h = 0; h < lignes.length; h++) {
      if (lignes[h].trim() === '**' + titre + '**') {
        let start = h;
        if (h - 1 >= 0 && lignes[h - 1].trim() === '---') start = h - 1;
        while (start - 1 >= 0 && lignes[start - 1].trim() === '') start--;
        let last = h;
        if (h + 1 < lignes.length && lignes[h + 1].trim() === '') last = h + 1;
        ranges.push({ from: lineStart(start), to: lineEndExcl(last) });
        break;
      }
    }
  }

  ranges.sort((a, b) => a.from - b.from);
  const merged = [];
  for (const r of ranges) {
    if (merged.length && r.from <= merged[merged.length - 1].to) {
      merged[merged.length - 1].to = Math.max(merged[merged.length - 1].to, r.to);
    } else merged.push({ from: r.from, to: r.to });
  }
  return merged;
}

// Horodatage AAAAMMJJhhmm à partir d'un temps (ms), pour NC-AAAAMMJJhhmm.
function horodatageNC(ms) {
  const d = new Date(ms || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes())
  );
}

// Analyse "Auteur(s), Année" -> { nom, auteurs[], annee, annee4, premierAuteur }.
// L'année peut porter un suffixe de désambiguïsation (2005a, 2005b) propre à la
// bibliographie de la source : on le conserve pour ne pas fusionner des
// références distinctes. annee4 = les 4 chiffres seuls (pour l'appariement Zotero).
function parseNomReference(nom, cfg) {
  const mc = nom.match(/^(.+?),\s*(\d{4}[a-z]?)/i);
  if (!mc) return null;
  const auteurComplet = mc[1].trim();
  const annee = mc[2].trim();
  const annee4 = (annee.match(/\d{4}/) || [''])[0];
  let auteurs;
  if (/\bet\s+(?:al|coll)\.?/i.test(auteurComplet)) {
    auteurs = [auteurComplet.replace(/\s+et\s+(?:al|coll)\.?.*$/i, '').trim()];
  } else {
    let sep;
    try {
      sep = new RegExp((cfg && cfg.separateurAuteurs) || '\\s+(?:and|et|&)\\s+|\\s*,\\s*', 'i');
    } catch (e) {
      sep = /\s+(?:and|et|&)\s+|\s*,\s*/i;
    }
    auteurs = auteurComplet
      .split(sep)
      .map((a) => a.trim().replace(/^(?:&|and|et)\s+/i, ''))
      .filter((a) => a.length > 0);
  }
  // Page éventuelle après l'année : « , p. 345 », « pp. 12-14 ».
  let page = '';
  const restePage = nom.slice(mc.index + mc[0].length);
  const mp = restePage.match(/pp?\.?\s*([0-9]+(?:\s*[-–—]\s*[0-9]+)?)/i);
  if (mp) page = mp[1].replace(/\s*[-–—]\s*/, '-').trim();
  return {
    nom: normaliserConjAuteurs(`${auteurComplet}, ${annee}`),
    auteurComplet,
    annee,
    annee4,
    etAl: /\bet\s+(?:al|coll)\.?/i.test(auteurComplet),
    auteurs,
    premierAuteur: auteurs[0] || auteurComplet,
    page,
  };
}

// Analyse une citation « auteur seul » (sans année) -> lien direct vers
// l'auteur, sans note de référence intermédiaire. Renvoie null si la chaîne
// contient une année (c'est alors une vraie référence) ou n'a pas de nom propre.
function parseAuteurSeul(nom, cfg) {
  const s = normaliserConjAuteurs(String(nom || '').trim());
  if (!s) return null;
  if (/\d{4}/.test(s)) return null; // contient une année -> pas « auteur seul »
  if (!/[A-ZÀ-Ÿ]/.test(s)) return null; // aucun nom propre capitalisé -> ignorer
  let auteurs;
  if (/\bet\s+(?:al|coll)\.?/i.test(s)) {
    auteurs = [s.replace(/\s+et\s+(?:al|coll)\.?.*$/i, '').trim()];
  } else {
    let sep;
    try {
      sep = new RegExp((cfg && cfg.separateurAuteurs) || '\\s+(?:and|et|&)\\s+|\\s*,\\s*', 'i');
    } catch (e) {
      sep = /\s+(?:and|et|&)\s+|\s*,\s*/i;
    }
    auteurs = s
      .split(sep)
      .map((a) => a.trim().replace(/^(?:&|and|et)\s+/i, ''))
      .filter((a) => a.length > 0);
  }
  if (!auteurs.length) return null;
  return {
    estAuteurSeul: true,
    nom: s,
    auteurComplet: s,
    annee: '',
    annee4: '',
    auteurs,
    premierAuteur: auteurs[0] || s,
  };
}

// Compile les profils (chaînes -> RegExp), en ignorant les profils invalides.
function compilerProfils(cfg) {
  const out = [];
  for (const p of cfg.profils || []) {
    try {
      out.push({
        nom: p.nom,
        titre: new RegExp(p.titreRegex),
        reference: p.referenceRegex ? new RegExp(p.referenceRegex) : null,
      });
    } catch (e) {
      console.error('[Ariane] Profil invalide ignoré :', p.nom, e);
    }
  }
  return out;
}

// Couleurs standard de Zotero -> nom lisible (pour la propriété « couleur »).
const COULEURS_ZOTERO = {
  '#ffd400': 'jaune',
  '#ff6666': 'rouge',
  '#5fb236': 'vert',
  '#2ea8e5': 'bleu',
  '#a28ae5': 'violet',
  '#e56eee': 'magenta',
  '#f19837': 'orange',
  '#aaaaaa': 'gris',
};
function nomCouleur(c) {
  if (!c) return '';
  const h = String(c).trim().toLowerCase();
  return COULEURS_ZOTERO[h] || h;
}

// Neutralise le contenu des liens [[…]] en conservant la longueur du texte :
// les points d'une citation (« p. 2 ») ne doivent pas passer pour des fins de
// phrase. Les positions calculées restent donc valables sur le texte d'origine.
function masquerLiens(texte) {
  return String(texte).replace(/\[\[[^\]]*\]\]/g, (m) => '·'.repeat(m.length));
}

// Fin de la phrase contenant l'offset (index juste après le point/? /! ).
// Sert au dépôt « par phrase » : place l'appel de note en fin de phrase.
function finDePhrase(texte, off) {
  const re = /[.?!…](?=\s|$)/g;
  re.lastIndex = Math.max(0, Math.min(off, texte.length));
  const m = re.exec(masquerLiens(texte));
  return m ? m.index + 1 : texte.length;
}

// Début de la phrase contenant l'offset : index juste après le dernier
// point/? /! qui précède l'offset, espaces de tête ignorés.
// Comme finDePhrase, mais renvoie l'index DE la ponctuation finale (donc juste
// avant le point), afin de poser l'appel de note avant celui-ci.
function finDePhraseAvantPonct(texte, off) {
  const re = /[.?!…](?=\s|$)/g;
  re.lastIndex = Math.max(0, Math.min(off, texte.length));
  const m = re.exec(masquerLiens(texte));
  if (!m) return texte.length;
  // Typographie française : « … frontière ? » garde son espace avant le point
  // d'interrogation. On remonte donc avant l'espace qui précède la ponctuation.
  let i = m.index;
  while (i > 0 && /[ \t\u00a0\u202f]/.test(texte[i - 1])) i--;
  return i;
}

function debutPhrase(texte, off) {
  const re = /[.?!…](?=\s|$)/g;
  const masque = masquerLiens(texte);
  let start = 0, m;
  while ((m = re.exec(masque)) !== null) {
    if (m.index + 1 <= off) start = m.index + 1;
    else break;
  }
  while (start < texte.length && /\s/.test(texte[start])) start++;
  return start;
}

/* ---------- Moteur de suggestions : similarité lexicale (TF-IDF) -------- */

// Mots vides FR + EN, écartés à l'indexation.
const MOTS_VIDES = new Set(
  ('au aux avec ce ces dans de des du elle en et eux il je la le les leur lui ma mais me '
    + 'meme mes moi mon ne nos notre nous on ont ou par pas pour qu que qui quoi sa se ses '
    + 'son sur ta te tes toi ton tu un une vos votre vous est sont ete etre avoir fait plus '
    + 'tres cette comme donc car ainsi alors entre aussi peut selon dont chez sans sous '
    + 'the and or of to in is are was were be been for on at by with as that this these those '
    + 'it its from not but they their them we you he she his her also can may such into which '
    + 'what when where who whom how than then so if there here more most other some any each')
    .split(/\s+/)
);

// Normalise (minuscules, sans accents) et découpe un texte en jetons
// signifiants : longueur >= 3, hors mots vides, dépluralisation légère.
function tokeniser(texte) {
  if (!texte) return [];
  const norm = String(texte)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const jetons = [];
  for (let mot of norm.split(/[^a-z0-9]+/)) {
    if (mot.length < 3 || MOTS_VIDES.has(mot)) continue;
    if (mot.length > 4 && (mot.endsWith('s') || mot.endsWith('x'))) mot = mot.slice(0, -1);
    jetons.push(mot);
  }
  return jetons;
}

// Fréquence des termes : Map(terme -> compte).
function frequenceTermes(jetons) {
  const m = new Map();
  for (const j of jetons) m.set(j, (m.get(j) || 0) + 1);
  return m;
}

// IDF d'un corpus (liste de Map tf) : Map(terme -> idf lissé).
function calculerIdf(docsTf) {
  const df = new Map();
  for (const tf of docsTf) for (const terme of tf.keys()) df.set(terme, (df.get(terme) || 0) + 1);
  const n = docsTf.length || 1;
  const idf = new Map();
  for (const [terme, d] of df) idf.set(terme, Math.log(1 + n / d));
  return idf;
}

// Vecteur TF-IDF (Map terme->poids) + norme euclidienne.
function vecteurTfIdf(tf, idf) {
  const vec = new Map();
  let somme = 0;
  for (const [terme, c] of tf) {
    const poids = (1 + Math.log(c)) * (idf.get(terme) || 0);
    if (poids > 0) { vec.set(terme, poids); somme += poids * poids; }
  }
  return { vec, norme: Math.sqrt(somme) || 1 };
}

// Cosinus entre deux vecteurs creux (itère sur le plus petit).
function cosinusTfIdf(vReq, nReq, vDoc, nDoc) {
  let a = vReq, b = vDoc;
  if (a.size > b.size) { a = vDoc; b = vReq; }
  let dot = 0;
  for (const [terme, p] of a) { const q = b.get(terme); if (q) dot += p * q; }
  return dot / (nReq * nDoc);
}

// Empreinte compacte et stable d'un texte (djb2), pour le cache d'embeddings.
function hacherTexte(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return h.toString(36) + ':' + s.length;
}

// Normalise un vecteur (norme L2 = 1) ; renvoie un Float32Array.
function normaliserVecteur(arr) {
  let n = 0;
  for (let i = 0; i < arr.length; i++) n += arr[i] * arr[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] / n;
  return out;
}

// Cosinus entre deux vecteurs déjà normalisés (= produit scalaire).
function cosinusVecteurs(a, b) {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) d += a[i] * b[i];
  return d;
}

// Certains modules de Zotero rangent leurs réglages dans un élément de la
// bibliothèque, qui remonte alors comme une source ordinaire. Ses « notes »
// ne sont pas des notes : ce sont des relevés au format JSON, ou de simples
// clés d'éléments. On refuse de les atomiser plutôt que de fabriquer des notes
// vides d'à peu près tout.
function estNoteDeDonnees(corps) {
  let t = String(corps || '').trim();
  if (!t) return true;
  // Une clé Zotero seule en première ligne ne dit rien : on l'écarte d'abord.
  t = t.replace(/^[A-Z0-9]{6,10}\s*\n/, '').trim();
  if (!t) return true;
  if (/^[[{][\s\S]*[\]}]$/.test(t)) {
    try { JSON.parse(t); return true; } catch (e) { /* pas du JSON : on continue */ }
  }
  // Aucun mot de quatre lettres ou plus : ce n'est pas de la prose.
  return !/[A-Za-zÀ-ÿ]{4,}/.test(t.replace(/[A-Z0-9]{6,10}/g, ' '));
}

// Notes-filles Zotero : celles attachées à la référence entière, non à un
// passage. Zotflow les dépose dans la fiche source, sous « ## Notes », bornées
// par <!-- ZF_NOTE_BEG_<clé> --> … <!-- ZF_NOTE_END_<clé> -->. Contrairement
// aux annotations, elles n'ont ni ancre ni note propre : elles ne pouvaient
// donc être ni citées ni reliées.
function extraireNotesFilles(contenu) {
  const blocs = [];
  const re = /<!--\s*ZF_NOTE_BEG_(\w+)\s*-->([\s\S]*?)<!--\s*ZF_NOTE_END_\1\s*-->/g;
  let m;
  while ((m = re.exec(contenu)) !== null) {
    const cle = m[1];
    // La ligne de métadonnées ne porte que du JSON encodé : elle n'a rien à
    // faire dans la note produite.
    const corps = String(m[2] || '')
      .replace(/<!--\s*ZF_NOTE_META[\s\S]*?-->/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!corps || estNoteDeDonnees(corps)) continue;
    blocs.push({ cle, corps, titre: titreDeNoteFille(corps) });
  }
  return blocs;
}

// Le titre : la première amorce en gras, à défaut la première ligne de texte.
function titreDeNoteFille(corps) {
  for (const ligne of corps.split('\n')) {
    const t = ligne.trim();
    if (!t) continue;
    const gras = t.match(/^\*\*(.+?)\*\*\.?\s*$/);
    if (gras) return gras[1].trim();
    const nu = t.replace(/^[#>*\-\s]+/, '').replace(/<[^>]+>/g, '').trim();
    if (nu) return nu.length > 90 ? nu.slice(0, 87).trim() + '…' : nu;
  }
  return '';
}

// Les citations que zotflow inscrit dans une note-fille sont du HTML portant
// l'URI Zotero de la source et le libellé déjà mis en forme. On les ramène à
// la forme d'Ariane — ([[@clé|libellé]]) — pour qu'elles nourrissent la
// bibliographie de fin de note comme l'export Word.
function citationsZotflowVersAriane(corps, parCleZotero) {
  const texte = String(corps);
  // Le span de citation en contient un autre : une expression paresseuse
  // s'arrêterait sur la balise fermante du span intérieur. On apparie donc à
  // la profondeur, comme on le ferait pour n'importe quelle imbrication.
  const ouvre = /<span\b(?=[^>]*class="citation")[^>]*data-citation="([^"]*)"[^>]*>/g;
  let sortie = '', dernier = 0, m;
  while ((m = ouvre.exec(texte)) !== null) {
    const debutDedans = m.index + m[0].length;
    const apres = finDeSpanApparie(texte, debutDedans);
    if (apres < 0) continue;
    const dedans = texte.slice(debutDedans, apres - '</span>'.length);
    const libelle = dedans.replace(/<[^>]+>/g, '').trim().replace(/^\(+\s*/, '').replace(/\s*\)+$/, '').trim();
    let cleZot = null;
    try {
      const j = JSON.parse(decodeURIComponent(m[1]));
      const items = (j && j.citationItems) || [];
      const uri = items[0] && items[0].uris && items[0].uris[0];
      const mu = uri && String(uri).match(/items\/(\w+)/);
      if (mu) cleZot = mu[1];
    } catch (e) { /* citation illisible : on la laisse telle quelle */ }
    const citekey = cleZot && parCleZotero ? parCleZotero.get(cleZot) : null;
    const remplacement = (citekey && libelle)
      ? '([[' + citekey + '|' + libelle + ']])'
      : texte.slice(m.index, apres);
    sortie += texte.slice(dernier, m.index) + remplacement;
    dernier = apres;
    ouvre.lastIndex = apres;
  }
  return sortie + texte.slice(dernier);
}

// Indice qui suit le </span> appariant le span ouvert juste avant « depart ».
function finDeSpanApparie(texte, depart) {
  const re = /<span\b[^>]*>|<\/span>/g;
  re.lastIndex = depart;
  let profondeur = 1, m;
  while ((m = re.exec(texte)) !== null) {
    profondeur += (m[0] === '</span>') ? -1 : 1;
    if (profondeur === 0) return m.index + m[0].length;
  }
  return -1;
}

// Extrait tous les blocs d'annotation d'une note source, selon la config.
// Titre de repli pour une annotation dont le commentaire ne porte pas de titre
// reconnu par un profil. On coupe à la première phrase si elle tient dans la
// longueur voulue, sinon au dernier mot entier.
function titreDeRepli(paraphrase, highlight, cle, cfg) {
  const limite = Math.max(10, parseInt(cfg.titreReplLongueur, 10) || 60);
  const surlignageDabord = cfg.titreReplSource === 'surlignage';
  const sources = surlignageDabord ? [highlight, paraphrase] : [paraphrase, highlight];
  let base = '';
  for (const s of sources) {
    base = String(s || '')
      .replace(/!\[\[[^\]]*\]\]/g, ' ')
      .replace(/[*_`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (base) break;
  }
  if (!base) return cle;
  const phrase = base.match(/^[^.!?…]*[.!?…]/);
  if (phrase && phrase[0].trim().length <= limite) {
    return phrase[0].replace(/[.!?…]+$/, '').trim() || cle;
  }
  if (base.length <= limite) return base;
  const coupe = base.slice(0, limite);
  const esp = coupe.lastIndexOf(' ');
  return (esp > limite / 2 ? coupe.slice(0, esp) : coupe).trim() + '…';
}

function extraireBlocs(contenu, cfg) {
  let regexBloc, regexPage, regexImage;
  try {
    regexBloc = new RegExp(cfg.blocRegex, 'g');
    regexPage = new RegExp(cfg.pageRegex, 'g');
    regexImage = new RegExp(cfg.imageRegex, 'g');
  } catch (e) {
    console.error('[Ariane] Regex de base invalide :', e);
    return [];
  }
  const profils = compilerProfils(cfg);
  if (profils.length === 0) return [];

  const sepCit = (cfg.separateurCitations || ';').trim() || ';';
  const blocs = [];
  let m;
  let finBlocPrecedent = 0;
  while ((m = regexBloc.exec(contenu)) !== null) {
    const cle = m[1];
    const brut = m[2] || '';

    // En-tête du callout : tout ce qui sépare la fin du bloc précédent
    // du marqueur BEG courant (page, image, texte surligné).
    const entete = contenu.substring(finBlocPrecedent, m.index);
    finBlocPrecedent = m.index + m[0].length;

    const lignes = brut
      .split('\n')
      .map((l) => l.replace(/^>\s?/, '').trim())
      .filter((l) => l.length > 0);
    if (lignes.length === 0) continue;

    // Normalisation : titre en gras et référence en italique collés sur la
    // même ligne (annotation sans paraphrase) -> on les sépare en deux
    // lignes pour que chacun soit reconnu.
    const colle = lignes[0].match(/^(\*\*.+?\*\*\.?)\s*(\*(?!\*).+?\*)$/);
    if (colle) lignes.splice(0, 1, colle[1], colle[2]);

    // Choix du profil : le premier dont le motif de titre correspond.
    let titre = null;
    let profReference = null;
    let profNom = null;
    // Le titre occupe-t-il la première ligne ? Sinon elle appartient au corps.
    let ligneTitre = true;
    for (const p of profils) {
      const mt = lignes[0].match(p.titre);
      if (mt) {
        titre = (mt[1] !== undefined ? mt[1] : mt[0]).trim();
        profReference = p.reference;
        profNom = p.nom;
        break;
      }
    }
    if (titre === null) {
      // Commentaire sans titre reconnu : annotation écartée par défaut,
      // atomisée avec un titre de repli si l'option est active.
      if (!cfg.titreFacultatif) continue;
      ligneTitre = false;
      titre = ''; // calculé plus bas, la paraphrase étant alors connue
      profReference = profils[0].reference;
      profNom = profils[0].nom;
    }

    // Référence éventuelle : dernière ligne selon le motif du profil.
    const premiere = ligneTitre ? 1 : 0;
    let ligneReference = null;
    let lignesParaphrase = lignes.slice(premiere);
    const derniere = lignes[lignes.length - 1];
    if (profReference && lignes.length > premiere) {
      const mr = derniere.match(profReference);
      if (mr) {
        ligneReference = (mr[1] !== undefined ? mr[1] : mr[0]).trim();
        if (cfg.retirerParentheses) {
          ligneReference = ligneReference.replace(/^\(+\s*/, '').replace(/\s*\)+$/, '').trim();
        }
        lignesParaphrase = lignes.slice(premiere, -1);
      }
    }
    const paraphrase = lignesParaphrase.join('\n').trim();

    let page = '';
    const pm = [...entete.matchAll(regexPage)];
    if (pm.length > 0) page = pm[pm.length - 1][1].trim();

    // Lien d'ouverture de l'annotation dans le PDF (dernier de l'en-tête).
    let lienAnno = '';
    const am = [...entete.matchAll(/\((obsidian:\/\/zotflow\?type=open-annotation[^)\s]*)\)/g)];
    if (am.length > 0) lienAnno = am[am.length - 1][1].trim();

    let image = '';
    const im = [...entete.matchAll(regexImage)];
    if (im.length > 0) image = im[im.length - 1][1].trim();

    // Texte surligné (citation d'origine) : lignes de blockquote imbriqué
    // « > > ... » de l'en-tête, en excluant les embeds d'image.
    const surligne = [];
    for (const l of entete.split('\n')) {
      const mh = l.match(/^>\s*>\s?(.*)$/);
      if (mh) {
        const t = mh[1].trim();
        if (t && !/^!\[\[/.test(t)) surligne.push(t);
      }
    }
    const highlight = surligne.join(' ').replace(/\s{2,}/g, ' ').trim();

    const refs = [];
    if (ligneReference) {
      let citations;
      try {
        citations = ligneReference.split(new RegExp(echapperRegex(sepCit)));
      } catch (e) {
        citations = ligneReference.split(sepCit);
      }
      for (let c of citations) {
        c = c.replace(/[()]/g, '').trim();
        if (!c) continue;
        const ref = parseNomReference(c, cfg);
        if (ref) {
          refs.push(ref);
        } else {
          // Pas d'année : citation « auteur seul » -> lien direct vers l'auteur.
          const aut = parseAuteurSeul(c, cfg);
          if (aut) refs.push(aut);
        }
      }
    }

    // Couleur de l'annotation : dernier callout « [!zotflow-<type>-<couleur>] » de l'en-tête.
    const cm = [...entete.matchAll(/\[!zotflow-\w+-(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\]/g)];
    const couleur = cm.length ? nomCouleur(cm[cm.length - 1][1]) : '';

    if (!titre) titre = titreDeRepli(paraphrase, highlight, cle, cfg);

    blocs.push({ cle, titre, paraphrase, page, image, highlight, refs, couleur, lienAnno, ordre: blocs.length + 1, profil: profNom });
  }
  return blocs;
}

// Cherche une source Zotero correspondante (1er auteur + année).
// Noms de famille (minuscule) des auteurs cités d'une référence.
function surnamesReference(ref) {
  return (ref && ref.auteurs ? ref.auteurs : [])
    .map((a) => sansAccents(sansLien(String(a)).trim().split(/\s+/).pop()))
    .filter(Boolean);
}

// Force d'appariement entre une référence citée et une entrée d'index Zotero.
// 'fort'   : année + TOUS les auteurs cités présents (haute certitude).
// 'faible' : « et al. » (seul le premier auteur connu) + année + 1er auteur présent.
// null     : pas de correspondance.
function appariementSource(ref, entree) {
  if (!ref || !entree) return null;
  const an = ref.annee4 || ref.annee;
  if (!an || !entree.annee || entree.annee !== an) return null;
  const rs = surnamesReference(ref);
  if (!rs.length) return null;
  const liste = entree.surnames || [];
  const es = new Set(liste);
  if (!es.size) return null;
  if (ref.etAl) {
    // « Renn et al., 2011 » doit désigner une fiche dont Renn est le PREMIER
    // auteur. Se contenter de sa présence quelque part dans la liste rattachait
    // à des travaux où l'auteur cité n'est que co-signataire : vérifié, quatre
    // faux appariements sur vingt-six.
    return rs[0] === liste[0] ? 'fort' : (es.has(rs[0]) ? 'faible' : null);
  }
  return rs.every((s) => es.has(s)) ? 'fort' : null;
}

// Tous les candidats (les 'fort' d'abord) pour une référence citée.
function candidatsSource(ref, indexZotero) {
  const out = [];
  for (const z of indexZotero || []) {
    const m = appariementSource(ref, z);
    if (m) out.push({ entree: z, force: m });
  }
  out.sort((a, b) => (a.force === b.force ? 0 : a.force === 'fort' ? -1 : 1));
  return out;
}

// Source Zotero CERTAINE pour l'auto-rattachement (construireNote) : un unique
// appariement 'fort', jamais pour une référence à suffixe (2005a/b, ambiguë).
// La cible d'un libellé dépend de l'article qui le porte : « Renn, 2008 »
// désigne le chapitre chez l'un et le livre chez l'autre. La table est donc à
// deux étages, { libellé: { source: cible, __defaut: cible } }. L'ancienne forme
// plate, { libellé: cible }, reste lue telle quelle.
function cibleDeReference(table, nom, source) {
  const e = table && table[nom];
  if (!e) return null;
  if (typeof e === 'string') return e;
  if (source && e[source]) return e[source];
  return e.__defaut || null;
}

function migrerCorrespondances(table) {
  const out = {};
  for (const [nom, v] of Object.entries(table || {})) {
    out[nom] = typeof v === 'string' ? { __defaut: v } : v;
  }
  return out;
}

// Clé d'œuvre : le DOI s'il existe, sinon le titre normalisé. Les tirets
// Unicode sont ramenés à l'ASCII, « Co-opetition » et « Co‐opetition » étant le
// même travail. Un titre trop court n'identifie rien.
// Deux libellés qui ne diffèrent que par une conjonction, un accent, un trait
// d'union ou une virgule désignent la même référence : « Garcia-Aristizabal »
// et « GarciaAristizabal », « Castaner » et « Castan~er », « Gentner et al., »
// et « Gentner, et al., ». La normalisation des conjonctions, posée à la
// création, ne les attrape pas.
function cleLibelle(nom) {
  let x = sansAccents(nom || '');
  x = x.replace(/\s+(?:et|and|&)\s+/g, '&');
  x = x.replace(/\bet\s+al\.?/g, 'etal');
  return x.replace(/[^a-z0-9&]+/g, '');
}

// Un « titre » qui commence par un nom suivi d'initiales n'en est pas un : c'est
// une liste d'auteurs tronquée, « Lawrence, M.G., S. Williams… ». La retenir
// fabriquerait une œuvre fantôme et une note au nom absurde.
function titreCredible(t) {
  const x = String(t || '').trim();
  if (x.length < 10) return false;
  if (/^[A-ZÀ-Ý][\wÀ-ÿ'’-]+,\s*(?:[A-Z]\.\s*){1,4}/.test(x)) return false;
  return /[a-zà-ÿ]{3}/.test(x);
}

// « Lawrence, M.G., S. Williams… 2022. Characteristics, potentials… One Earth
// 5: 44–61. » : le titre suit l'année. On le récupère plutôt que de jeter
// l'entrée, et l'on rend une chaîne vide si rien de crédible n'en sort.
function titreDansReference(texte, annee) {
  const t = String(texte || '');
  if (!annee) return '';
  const m = new RegExp(annee + '\\)?\\s*[.,]\\s*(.+?)(?:\\.\\s|\\.$)').exec(t);
  const cand = m ? m[1].trim() : '';
  return titreCredible(cand) ? cand : '';
}

function cleOeuvre(titre, doi) {
  if (doi) return 'doi:' + doi;
  const t = sansAccents(titre || '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return t.length >= 12 ? 'titre:' + t.slice(0, 44) : '';
}

// Nom de note pour une œuvre détachée d'un libellé partagé. Le qualificatif
// vient de l'ŒUVRE, jamais de l'article : le suffixe a/b des styles n'a de sens
// que dans une bibliographie donnée et désignerait deux travaux d'un article à
// l'autre.
function nomOeuvreDetachee(libelle, titre) {
  const t = String(titre || '').replace(/\s+/g, ' ').trim();
  if (!t) return libelle;
  let court = t.split(/\s*[:;–—]\s*|\.\s+/)[0].trim();
  if (court.length < 10) court = t;
  if (court.length > 48) court = court.slice(0, 48).replace(/\s+\S*$/, '');
  court = court.replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return court ? libelle + ' (' + court + ')' : libelle;
}

function trouverSourceZotero(ref, indexZotero) {
  if (!ref) return null;
  if (ref.annee && ref.annee4 && ref.annee !== ref.annee4) return null;
  const forts = (indexZotero || []).filter((z) => appariementSource(ref, z) === 'fort');
  return forts.length === 1 ? forts[0].basename : null;
}

// Parse le nom d'une référence en attente (« Auteurs, année ») en objet ref,
// pour tenter un appariement Zotero. Retourne null si non parsable.
function refDepuisNomAttente(nom) {
  const s = String(nom || '').trim();
  const m = s.match(/^(.*?),\s*(\d{4}[a-z]?)\b.*$/);
  if (!m) return null;
  let auts = m[1].trim();
  const annee = m[2];
  const etAl = /\bet\s+al\.?/i.test(auts);
  auts = auts.replace(/\bet\s+al\.?/ig, ' ').replace(/&|\bet\b|,|;/g, ' ').replace(/\s+/g, ' ').trim();
  const auteurs = auts.split(' ').filter(Boolean);
  if (!auteurs.length && !etAl) return null;
  return { auteurs, annee, annee4: annee.replace(/[a-z]$/, ''), etAl };
}

// --- Références citées via API bibliographique (fonctions pures, testables) ---

// Normalise un DOI : minuscule, sans préfixe URL ni « doi: ».
// Björnsdóttir, Ylönen, Méric, Santaló : sans cette normalisation, une simple
// mise en minuscules laisse les diacritiques et l'appariement échoue dès que
// les deux graphies diffèrent d'un accent.
function sansAccents(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normDoi(s) {
  if (!s) return '';
  return String(s)
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    // Tirets Unicode (‐ ‑ ‒ – — −) -> tiret ASCII : Crossref en renvoie parfois,
    // ce qui empêchait la correspondance avec un DOI Zotero écrit normalement.
    .replace(/[‐‑‒–—−]/g, '-')
    .trim()
    .toLowerCase();
}

// Nom de famille (dernier mot, minuscule) d'un nom d'auteur libre.
function nomFamille(s) {
  const t = sansLien(String(s || '')).replace(/,.*$/, '').trim(); // « Nom, Prénom » -> « Nom »
  const parts = t.split(/\s+/).filter(Boolean);
  return (parts.length ? parts[parts.length - 1] : t).toLowerCase();
}

// Sépare un nom complet en { nom (famille), prenom }. Gère « Nom, Prénom » et
// l'ordre occidental « Prénom Nom » (dernier mot = nom de famille).
function separerNomPrenom(nomComplet) {
  const s = sansLien(String(nomComplet || '')).trim();
  if (!s) return { nom: '', prenom: '' };
  if (s.includes(',')) {
    const i = s.indexOf(',');
    return { nom: s.slice(0, i).trim(), prenom: s.slice(i + 1).trim() };
  }
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { nom: s, prenom: '' };
  return { nom: parts[parts.length - 1], prenom: parts.slice(0, -1).join(' ') };
}

// Parse une réponse Crossref /works/{doi} -> liste de références citées.
function refsDepuisCrossref(json) {
  const msg = json && json.message ? json.message : json;
  const refs = (msg && msg.reference) || [];
  const out = [];
  for (const r of refs) {
    const doi = normDoi(r.DOI || r.doi || '');
    const titre = String(
      r['article-title'] || r['volume-title'] || r['journal-title'] || r.unstructured || ''
    ).trim();
    const an = String(r.year || '').match(/\d{4}/);
    const surnames = r.author ? [nomFamille(r.author)].filter(Boolean) : [];
    out.push({ doi, titre, annee: an ? an[0] : '', auteurs: surnames, brut: String(r.unstructured || '') });
  }
  return out;
}

// Parse une liste de works OpenAlex (déjà résolus) -> références citées.
function refsDepuisOpenAlexWorks(works) {
  const out = [];
  for (const w of works || []) {
    const doi = normDoi(w.doi || (w.ids && w.ids.doi) || '');
    const titre = String(w.title || w.display_name || '').trim();
    const annee = w.publication_year ? String(w.publication_year) : '';
    const surnames = [];
    for (const a of w.authorships || []) {
      const nom = (a.author && a.author.display_name) || a.raw_author_name || '';
      const f = nomFamille(nom);
      if (f) surnames.push(f);
    }
    out.push({ doi, titre, annee, auteurs: surnames });
  }
  return out;
}

// Construit le contenu canonique d'une note d'annotation (via modèles).
function construireNote(bloc, sourceBasename, indexZotero, cfg, ctxSource) {
  ctxSource = ctxSource || {};
  let refLinks = [];
  const pagesRef = {}; // cible de lien -> page de la référence citée (propre à l'annotation)
  for (const r of bloc.refs) {
    // Citation « auteur seul » (sans année) : lien(s) direct(s) vers l'auteur,
    // sans note de référence intermédiaire.
    if (r.estAuteurSeul) {
      for (const a of r.auteurs) refLinks.push('[[' + a + ']]');
      continue;
    }
    // Correspondance manuelle mémorisée (désambiguïsation 2005a/2005b) prioritaire.
    // La cible dépend de la source : c'est ce qui permet à un même libellé de
    // désigner deux travaux selon l'article, et de survivre à la ré-atomisation.
    const manuel = cibleDeReference(cfg.correspondancesSuffixe, r.nom, sourceBasename);
    let cibleRef;
    if (manuel) {
      cibleRef = manuel;
    } else {
      const z = cfg.rattachementZotero ? trouverSourceZotero(r, indexZotero) : null;
      // À défaut, la note existante dont l'écriture est équivalente : sans quoi
      // « Castan~er » créerait un lien vers un second fichier.
      const canon = ctxSource.canoniques ? ctxSource.canoniques.get(cleLibelle(r.nom)) : null;
      cibleRef = z || canon || r.nom;
    }
    refLinks.push('[[' + cibleRef + ']]');
    if (r.page) pagesRef[cibleRef] = r.page;
  }
  // Aucune référence citée : par défaut, la source de l'annotation.
  if (refLinks.length === 0 && cfg.referenceParDefautSource) {
    refLinks = ['[[' + sourceBasename + ']]'];
  }
  const liens = refLinks.join(' ; ');

  const vars = {
    title: bloc.titre,
    key: bloc.cle,
    sourceName: sourceBasename,
    image: bloc.image ? '![[' + bloc.image + ']]' : '',
    paraphrase: bloc.paraphrase || '',
    source: '[[' + sourceBasename + '#^' + bloc.cle + ']]',
    page: bloc.page || '',
    pageLine: bloc.page ? cfg.labelPage + bloc.page : '',
    referenceLinks: liens,
    references: refLinks.length > 0 ? cfg.labelReferences + liens : '',
    annotationUrl: bloc.lienAnno || '',
    titleLink: bloc.lienAnno ? '[' + bloc.titre + '](' + bloc.lienAnno + ')' : bloc.titre,
  };

  // Citation du texte surligné, rendue en encadré (callout).
  let citation = '';
  if (cfg.inclureCitation && bloc.highlight) {
    const type = (cfg.calloutCitation || 'quote').trim() || 'quote';
    citation =
      '> [!' + type + ']\n' + bloc.highlight.split('\n').map((l) => '> ' + l).join('\n');
  }
  vars.citation = citation;
  vars.highlight = bloc.highlight || '';

  let corps = appliquerModele(cfg.modeleNote, vars);
  corps = corps
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');

  const alias = appliquerModele(cfg.aliasTemplate, vars).trim();

  const fm = ['---'];
  if (alias) {
    fm.push('aliases:');
    fm.push('  - ' + JSON.stringify(alias));
  }
  // Classe CSS pour cibler le style des notes d'annotation (ex. titre).
  fm.push('cssclasses:');
  fm.push('  - annotation');
  fm.push('zotflow-anno-key: ' + bloc.cle);
  fm.push('zotflow-source: ' + JSON.stringify('[[' + sourceBasename + ']]'));
  if (typeof bloc.ordre === 'number') fm.push('ordre: ' + bloc.ordre);
  if (bloc.page) fm.push('page: ' + JSON.stringify(bloc.page));
  // Références citées aussi en propriété (liens cliquables) pour les bases.
  if (refLinks.length > 0) {
    fm.push('références-citées:');
    for (const l of refLinks) fm.push('  - ' + JSON.stringify(l));
  }
  const clesPages = Object.keys(pagesRef);
  if (clesPages.length > 0) {
    fm.push('références-pages:');
    for (const k of clesPages) fm.push('  ' + JSON.stringify(k) + ': ' + JSON.stringify(String(pagesRef[k])));
  }
  // Collections Zotero (héritées de la source) : filtrage direct dans les Bases.
  const cols = ctxSource.collections;
  if (cols) {
    const liste = (Array.isArray(cols) ? cols : [cols]).map((x) => String(x)).filter(Boolean);
    if (liste.length) {
      fm.push('collections:');
      for (const cc of liste) fm.push('  - ' + JSON.stringify(cc));
    }
  }
  if (bloc.couleur) fm.push('couleur: ' + JSON.stringify(bloc.couleur));
  fm.push('zotflow-auto: true');
  fm.push('zotflow-locked: true');
  fm.push('---');

  return fm.join('\n') + '\n' + corps + '\n';
}

// Construit le contenu d'une note de référence provisoire (via modèle).
function construireReference(ref, cfg) {
  const authorLinks = ref.auteurs.map((a) => '[[' + a + ']]').join('\n');
  const vars = {
    authorLinks,
    name: ref.nom,
    year: ref.annee,
    firstAuthor: ref.premierAuteur,
  };
  return appliquerModele(cfg.modeleReference, vars) + '\n';
}

/* =========================================================================
 * Module Cartes — cartes ontologiques sur Canvas (fonctions pures)
 * =========================================================================
 * Le Canvas d'Obsidian est la surface de dessin (fichier .canvas = JSON).
 *  - Les RELATIONS sont les étiquettes natives des arêtes (visibles, éditables).
 *  - Les TYPES DE BLOCS vivent dans un fichier compagnon « <carte>.ariane.json »
 *    (id de nœud -> id de type), pour ne pas altérer le texte des blocs.
 * ========================================================================= */

function normEtiquette(x) {
  return String(x == null ? '' : x)
    .replace(/\s*\((\+|-|−)\)\s*$/, '')   // retire la polarité « (+) » / « (−) »
    .trim().toLowerCase();
}

// Polarité éventuelle d'une étiquette : '+', '-' ou ''.
function polariteEtiquette(x) {
  const m = String(x == null ? '' : x).match(/\((\+|-|−)\)\s*$/);
  if (!m) return '';
  return m[1] === '+' ? '+' : '-';
}

// Relation du vocabulaire correspondant à une étiquette, ou null.
function relationDeEtiquette(etiquette, relations) {
  const n = normEtiquette(etiquette);
  if (!n) return null;
  for (const r of relations || []) {
    if (normEtiquette(r.nom) === n || String(r.id).toLowerCase() === n) return r;
  }
  return null;
}

// Texte lisible d'un nœud de canvas.
function texteNoeud(n) {
  if (!n) return '';
  if (n.type === 'text') return String(n.text || '').split('\n')[0].replace(/^#+\s*/, '').trim();
  if (n.type === 'file') return String(n.file || '').split('/').pop().replace(/\.md$/, '');
  if (n.type === 'link') return String(n.url || '');
  if (n.type === 'group') return String(n.label || '');
  return '';
}

/* ---- Pont draw.io : lecture des schémas .drawio.svg / .drawio ----------- */

function deshtmlMx(x) {
  return String(x == null ? '' : x)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function texteBrutMx(v) {
  // Les libellés draw.io sont doublement encodés (HTML dans un attribut XML) :
  // deux passes de décodage sont nécessaires.
  return deshtmlMx(deshtmlMx(v))
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function attrsMx(bal) {
  const o = {}; const re = /([\w:-]+)\s*=\s*"([^"]*)"/g; let m;
  while ((m = re.exec(bal)) !== null) o[m[1]] = m[2];
  return o;
}

// XML mxGraph -> { nodes, edges } au même format que le Canvas, afin que
// l'analyse, le DSL et l'export SVG fonctionnent sur les deux surfaces.
function parserMxGraph(xml) {
  const nodes = [], edges = [], labelsArete = {};
  const jetons = [];
  const re = /<(object|UserObject|mxCell|mxGeometry)\b([^>]*?)(\/?)>|<\/(object|UserObject)>/g;
  let m;
  while ((m = re.exec(String(xml || ''))) !== null) {
    if (m[4]) { jetons.push({ t: 'fin-objet' }); continue; }
    jetons.push({ t: m[1], a: attrsMx(m[2]), ferme: m[3] === '/' });
  }
  let objet = null, cell = null;
  const pousser = () => {
    if (!cell) return;
    const c = cell; cell = null;
    const a = c.a, g = c.geo || {};
    if (a.edge === '1') {
      edges.push({ id: c.id, fromNode: a.source || '', toNode: a.target || '', label: texteBrutMx(c.valeur), style: a.style || '' });
    } else if (a.vertex === '1') {
      if (a.parent && c.estEtiquette) { labelsArete[a.parent] = texteBrutMx(c.valeur); return; }
      nodes.push({
        id: c.id, type: 'text', text: texteBrutMx(c.valeur), style: a.style || '', parent: a.parent || '',
        x: Number(g.x || 0), y: Number(g.y || 0),
        width: Number(g.width || 120), height: Number(g.height || 40),
      });
    }
  };
  for (const j of jetons) {
    if (j.t === 'object' || j.t === 'UserObject') { objet = j.a; continue; }
    if (j.t === 'fin-objet') { pousser(); objet = null; continue; }
    if (j.t === 'mxCell') {
      pousser();
      const a = j.a;
      const val = objet ? (objet.label != null ? objet.label : (objet.value || '')) : (a.value || '');
      cell = { a, geo: null, id: (objet && objet.id) || a.id || '', valeur: val, estEtiquette: /edgeLabel/.test(a.style || '') };
      if (j.ferme && !objet) pousser();
      continue;
    }
    if (j.t === 'mxGeometry' && cell) cell.geo = j.a;
  }
  pousser();
  const parId = {};
  for (const e of edges) parId[e.id] = e;
  for (const cle of Object.keys(labelsArete)) {
    if (parId[cle] && !parId[cle].label) parId[cle].label = labelsArete[cle];
  }
  return { nodes, edges };
}

// Décompresse un <diagram> draw.io (base64 + deflate) si nécessaire.
function decompresserDiagramme(contenu) {
  const t = String(contenu || '').trim();
  if (/<mxGraphModel/i.test(t)) return t;
  try {
    const zlib = require('zlib');
    const brut = zlib.inflateRawSync(Buffer.from(t, 'base64')).toString('utf8');
    return decodeURIComponent(brut);
  } catch (e) { return ''; }
}

// Contenu d'un fichier (.drawio.svg ou .drawio) -> pages [{ nom, graphe }].
function pagesDepuisDrawio(contenu) {
  let xml = String(contenu || '');
  if (/^\s*<svg/i.test(xml) || /<svg[\s>]/i.test(xml.slice(0, 400))) {
    const mc = xml.match(/\scontent="([^"]*)"/);
    if (!mc) return [];
    xml = deshtmlMx(mc[1]);
  }
  const pages = [];
  const re = /<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g;
  let m, trouve = false;
  while ((m = re.exec(xml)) !== null) {
    trouve = true;
    const a = attrsMx(m[1]);
    pages.push({ nom: deshtmlMx(a.name || ''), graphe: parserMxGraph(decompresserDiagramme(m[2])) });
  }
  if (!trouve && /<mxCell/.test(xml)) pages.push({ nom: '', graphe: parserMxGraph(xml) });
  return pages;
}

// Convention de lecture : quand plusieurs flèches partent d'un même bloc (ou
// convergent vers un même bloc) et qu'une seule étiquette a été écrite, elle
// vaut pour toutes. On ne propage que si le groupe ne porte QU'UNE étiquette
// distincte : deux étiquettes différentes rendraient le choix arbitraire.
function propagerEtiquettes(graphe) {
  const nodes = (graphe && graphe.nodes) || [];
  const edges = (graphe && graphe.edges) || [];
  const parId = {};
  for (const n of nodes) parId[n.id] = n;
  const nomme = (id) => (parId[id] ? String(parId[id].text || '').trim() : '');
  const etiq = (e) => String(e.label || '').trim();

  const copie = edges.map((e) => Object.assign({}, e));
  const utiles = copie.filter((e) => nomme(e.fromNode) && nomme(e.toNode));

  for (const cle of ['fromNode', 'toNode']) {
    const groupes = {};
    for (const e of utiles) {
      if (!groupes[e[cle]]) groupes[e[cle]] = [];
      groupes[e[cle]].push(e);
    }
    for (const k of Object.keys(groupes)) {
      const lot = groupes[k];
      if (lot.length < 2) continue;
      const labels = [...new Set(lot.map(etiq).filter(Boolean))];
      if (labels.length !== 1) continue;      // 0 = rien à propager, 2+ = ambigu
      for (const e of lot) {
        if (!etiq(e)) { e.label = labels[0]; e.labelHerite = true; }
      }
    }
  }
  return { nodes: nodes, edges: copie, pages: graphe ? graphe.pages : undefined };
}

/* --------------------------- Temps passé ---------------------------------
 * Le compteur s'appuie sur la note active et sur l'activité du clavier et de
 * la souris. Il ne mesure donc pas la présence devant l'écran, mais le temps
 * de travail effectif, ce qui est plus honnête pour un journal de thèse.
 * ------------------------------------------------------------------------ */

// « 95 » -> « 1 h 35 ». Les minutes seules restent lisibles jusqu'à 59.
function dureeLisible(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? h + ' h ' + String(r).padStart(2, '0') : h + ' h';
}

function jourIsoDe(d) {
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ------------------------ Citations repliables ---------------------------
 * Une citation a la forme « ([[CLE|Libellé]] ; [[CLE2|Libellé2]]) ». Repliée,
 * elle laisse une pastille portant le nombre de références.
 * ------------------------------------------------------------------------ */

// Un groupe entre parenthèses fait de liens internes séparés par « ; ».
// La parenthèse ne doit contenir aucune parenthèse imbriquée, ce qui écarte
// les incises ordinaires du texte.
const ZFA_RE_CITATION = /\((\s*\[\[[^[\]\n]+\]\](?:\s*;\s*\[\[[^[\]\n]+\]\])*\s*)\)/g;

function citationsDuTexte(texte) {
  const out = [];
  // L'expression est réutilisée : la recompiler à chaque appel coûtait cher,
  // cette fonction étant appelée à chaque frappe et à chaque défilement.
  const re = ZFA_RE_CITATION;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(texte)) !== null) {
    const n = (m[1].match(/\[\[/g) || []).length;
    out.push({ index: m.index, longueur: m[0].length, nombre: n });
  }
  return out;
}

/* ------------------------- Bibliographie de note -------------------------- */

const ZFA_TACHE_DEBUT = '%% ariane:tache %%';
const ZFA_TACHE_FIN = '%% /ariane:tache %%';

const ZFA_BIBLIO_DEBUT = '%% ariane:biblio %%';
const ZFA_BIBLIO_FIN = '%% /ariane:biblio %%';

// « Céline Kermisch » -> « Kermisch, C. » ; « Kermisch, Céline » aussi.
function auteurBiblio(nom) {
  const t = sansLien(String(nom || '')).trim();
  if (!t) return '';
  let famille, prenoms;
  if (t.includes(',')) {
    famille = t.split(',')[0].trim();
    prenoms = t.split(',').slice(1).join(' ').trim();
  } else {
    const parts = t.split(/\s+/).filter(Boolean);
    famille = parts.length > 1 ? parts[parts.length - 1] : t;
    prenoms = parts.slice(0, -1).join(' ');
  }
  const initiales = prenoms
    .split(/[\s-]+/).filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + '.')
    .join(' ');
  return initiales ? famille + ', ' + initiales : famille;
}

function listeAuteursBiblio(creators) {
  const noms = (Array.isArray(creators) ? creators : (creators ? [creators] : []))
    .map(auteurBiblio).filter(Boolean);
  if (!noms.length) return '';
  if (noms.length === 1) return noms[0];
  return noms.slice(0, -1).join(', ') + ' & ' + noms[noms.length - 1];
}

// Une entrée de bibliographie à partir du frontmatter d'une note source.
function entreeBiblio(cle, fm, modele) {
  const val = (x) => String(x == null ? '' : x).replace(/^["']|["']$/g, '').trim();
  const annee = (val(fm.year) || val(fm.date)).match(/\d{4}/);
  const vars = {
    auteurs: listeAuteursBiblio(fm.creators),
    auteursComplets: (Array.isArray(fm.creators) ? fm.creators : (fm.creators ? [fm.creators] : []))
      .map((x) => sansLien(String(x)).trim()).filter(Boolean).join(', '),
    annee: annee ? annee[0] : '',
    titre: val(fm.title),
    publication: val(fm.publication),
    doi: val(fm.doi),
    url: val(fm.url),
    type: val(fm.itemType),
    cle: cle,
  };
  let out = appliquerModele(modele || '{{auteurs}} ({{annee}}). {{titre}}. *{{publication}}*.', vars);
  // Retire les fragments restés vides : « (). », « ** », doubles espaces…
  out = out
    .replace(/\*\s*\*/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*\.\s*(?=\.)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s.,;]+/, '')
    .replace(/[\s,;]+$/, '')
    .trim();
  if (out && !/[.!?]$/.test(out)) out += '.';
  return out;
}

// Une entrée rendue par Zotero peut porter une numérotation de style (IEEE :
// « [1] », Vancouver : « 1. »). On la retire, et on neutralise les caractères
// qui casseraient un alias de lien.
function nettoyerEntreeBiblio(texte) {
  return String(texte == null ? '' : texte)
    .replace(/\s+/g, ' ')
    .replace(/^\s*(?:\[\d+\]|\(\d+\)|\d+\.)\s*/, '')
    .trim();
}

// Le renvoi vers la note source est ajouté APRÈS la référence, et non autour :
// dans un alias de lien, Obsidian ne rend pas le markdown, si bien que les
// italiques du style bibliographique resteraient des astérisques littérales.
function entreeCliquable(texte, cle, marqueur) {
  const t = String(texte == null ? '' : texte).replace(/\s+$/, '');
  if (!cle) return t;
  const m = String(marqueur == null || marqueur === '' ? '↗' : marqueur);
  return t + ' [[' + cle + '|' + m + ']]';
}

// Bloc complet, encadré par des marqueurs pour un remplacement idempotent.
function construireBibliographie(entrees, titre) {
  const out = [ZFA_BIBLIO_DEBUT];
  // Ligne vide indispensable : sans elle, « texte + --- » forme un titre
  // souligné (syntaxe setext) et le marqueur serait rendu comme un titre.
  out.push('');
  out.push('---');
  out.push('## ' + (titre || 'Bibliographie'));
  if (entrees.length) {
    for (const e of entrees) out.push('- ' + e);
  } else {
    out.push('*Aucune source citée.*');
  }
  out.push(ZFA_BIBLIO_FIN);
  return out.join('\n');
}

// Remplace le bloc s'il existe, sinon l'ajoute en fin de note.
function injecterBibliographie(contenu, bloc) {
  const texte = String(contenu == null ? '' : contenu);
  const i = texte.indexOf(ZFA_BIBLIO_DEBUT);
  const j = texte.indexOf(ZFA_BIBLIO_FIN);
  if (i !== -1 && j !== -1 && j > i) {
    return texte.slice(0, i) + bloc + texte.slice(j + ZFA_BIBLIO_FIN.length);
  }
  return texte.replace(/\s*$/, '') + '\n\n' + bloc + '\n';
}

// Texte de la note privé de son frontmatter et de ses blocs synchronisés,
// pour ne repérer que les citations réellement écrites dans le corps.
// Le plus long début commun à des noms de fichiers, arrêté sur un séparateur.
// « NP-260826-07 » et « NP-260727-06 » donnent « NP- ». Un début qui n'est pas
// suivi d'un séparateur ne serait pas un préfixe mais une coïncidence.
function prefixeCommun(noms) {
  const l = (noms || []).filter(Boolean);
  if (l.length < 2) return '';
  let commun = l[0];
  for (const n of l.slice(1)) {
    let i = 0;
    while (i < commun.length && i < n.length && commun[i] === n[i]) i++;
    commun = commun.slice(0, i);
    if (!commun) return '';
  }
  const m = commun.match(/^(.*?[-_ ])/);
  const p = m ? m[1] : '';
  return p.length >= 2 && p.length <= 12 ? p : '';
}

// Une valeur de propriété destinée à Word : les liens d'Obsidian n'y ont pas
// leur place. « [[Chabane Mazri]] » devient « Chabane Mazri », « [[cible|nom]] »
// devient « nom », « [texte](url) » devient « texte ». Le reste est intact.
function valeurLisible(texte) {
  return String(texte == null ? '' : texte)
    .replace(/\[\[([^\]\n]*?)\\?\|([^\]\n]+)\]\]/g, '$2')       // [[cible|alias]]
    .replace(/\[\[([^\]|#\n]+)\]\]/g,
      (m, t) => String(t).split('/').pop().replace(/^@/, '').trim())  // [[cible]]
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, '$1')                  // [texte](url)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Dans un tableau, Obsidian échappe la barre verticale du lien :
// « [[@clé\|libellé]] ». La clé capturée emporte alors l'antislash, la note
// n'est plus retrouvée, et la référence disparaissait à la fois de la
// bibliographie de fin de note et des champs Zotero de l'export Word.
function cleDeLien(x) {
  return String(x == null ? '' : x).replace(/\\+$/, '').trim();
}

function corpsCitable(contenu) {
  let t = String(contenu == null ? '' : contenu).replace(/^---\n[\s\S]*?\n---\n?/, '');
  const coupe = (deb, fin) => {
    const i = t.indexOf(deb), j = t.indexOf(fin);
    if (i !== -1 && j !== -1 && j > i) t = t.slice(0, i) + t.slice(j + fin.length);
  };
  coupe(ZFA_BIBLIO_DEBUT, ZFA_BIBLIO_FIN);
  coupe(ZFA_SCHEMA_DEBUT, ZFA_SCHEMA_FIN);
  return t;
}

/* ---- Conversion entre notes de bas de page et citations classiques ------ */

// Réécrit l'alias des citations « [[clé|libellé]] » du corps, sans toucher au
// frontmatter ni aux blocs synchronisés (bibliographie, contenu de schéma) —
// où le lien « ↗ » doit rester tel quel.
function rafraichirLibelles(contenu, libelle, citable) {
  const texte = String(contenu == null ? '' : contenu);
  const zones = [];
  const mfm = texte.match(/^---\n[\s\S]*?\n---\n?/);
  if (mfm) zones.push([0, mfm[0].length]);
  for (const [d, f] of [[ZFA_BIBLIO_DEBUT, ZFA_BIBLIO_FIN], [ZFA_SCHEMA_DEBUT, ZFA_SCHEMA_FIN]]) {
    const i = texte.indexOf(d), j = texte.indexOf(f);
    if (i !== -1 && j !== -1 && j > i) zones.push([i, j + f.length]);
  }
  const protege = (pos) => zones.some(([a, b]) => pos >= a && pos < b);

  let n = 0;
  const out = texte.replace(/\[\[([^\]|#\n]+)\|([^\]\n]*)\]\]/g, (tout, cle, alias, pos) => {
    if (protege(pos)) return tout;
    const k = cleDeLien(cle);
    if (!citable(k)) return tout;
    const neuf = libelle(k);
    if (!neuf || neuf === alias) return tout;
    n++;
    return '[[' + k + '|' + neuf + ']]';
  });
  return { texte: out, n };
}

// Où insérer un groupe de citations « (…) » à la position visée, et sous
// quelle forme : nouveau groupe, ou ajout dans le groupe déjà présent.
// Renvoie null si rien à insérer. Fonction pure, donc testable.
function composerCitation(docStr, pos, entrees, sep) {
  const separateur = sep || ' ; ';
  const avant = String(docStr).slice(0, pos);
  const groupe = avant.match(/\(([^()]*\[\[[^()]*)\)\s*$/);
  const dedans = groupe ? groupe[1] : '';
  const retenues = (entrees || []).filter((e) => {
    const cle = (e.match(/^\[\[([^|\]]+)/) || [])[1];
    return cle ? dedans.indexOf('[[' + cle) === -1 : true;
  });
  if (!retenues.length) return null;
  if (groupe) {
    const iFerme = avant.lastIndexOf(')');
    return { from: iFerme, to: iFerme, insert: separateur + retenues.join(separateur) };
  }
  const espace = /\s$/.test(avant) || avant === '' ? '' : ' ';
  return { from: pos, to: pos, insert: espace + '(' + retenues.join(separateur) + ')' };
}

// Extrait lisible d'un schéma, destiné à être recopié dans la note associée
// pour rendre son contenu cherchable (recherche Obsidian + index sémantique).
const ZFA_SCHEMA_DEBUT = '%% ariane:schema %%';
const ZFA_SCHEMA_FIN = '%% /ariane:schema %%';

function extraitSchema(graphe, titre) {
  const nodes = (graphe && graphe.nodes) || [];
  const edges = (graphe && graphe.edges) || [];
  const parId = {};
  for (const n of nodes) parId[n.id] = n;

  const relies = new Set();
  const lignes = [];
  for (const e of edges) {
    const a = parId[e.fromNode], b = parId[e.toNode];
    const ta = a ? String(a.text || '').trim() : '';
    const tb = b ? String(b.text || '').trim() : '';
    if (!ta || !tb) continue;
    relies.add(ta); relies.add(tb);
    const et = String(e.label || '').trim();
    lignes.push(ta + (et ? ' --' + et + '--> ' : ' --> ') + tb);
  }
  const isoles = nodes
    .map((n) => String(n.text || '').trim())
    .filter((t) => t && !relies.has(t));

  const out = [];
  out.push(ZFA_SCHEMA_DEBUT);
  out.push('> [!abstract]- Contenu du schéma' + (titre ? ' — ' + titre : ''));
  out.push('> *Synchronisé par Ariane depuis le schéma. Ne pas modifier à la main.*');
  if (lignes.length) {
    out.push('>');
    for (const l of lignes) out.push('> - ' + l);
  }
  if (isoles.length) {
    out.push('>');
    out.push('> **Blocs sans relation** : ' + [...new Set(isoles)].join(' · '));
  }
  if (!lignes.length && !isoles.length) {
    out.push('>');
    out.push('> *(schéma vide)*');
  }
  out.push(ZFA_SCHEMA_FIN);
  return out.join('\n');
}

// Remplace (ou ajoute en fin de note) le bloc synchronisé.
function injecterExtrait(contenu, extrait) {
  const texte = String(contenu == null ? '' : contenu);
  const i = texte.indexOf(ZFA_SCHEMA_DEBUT);
  const j = texte.indexOf(ZFA_SCHEMA_FIN);
  if (i !== -1 && j !== -1 && j > i) {
    const avant = texte.slice(0, i);
    const apres = texte.slice(j + ZFA_SCHEMA_FIN.length);
    return avant + extrait + apres;
  }
  return texte.replace(/\s*$/, '') + '\n\n' + extrait + '\n';
}

// Analyse une carte : blocs, relations, et problèmes de conformité.
function analyserCarte(data, vocab, sidecar) {
  const relations = (vocab && vocab.relations) || [];
  const types = (vocab && vocab.types) || [];
  const strict = !!(vocab && vocab.strict);
  const map = (sidecar && sidecar.blocs) || {};
  const noeuds = (data && data.nodes) || [];
  const aretes = (data && data.edges) || [];
  const parId = {};
  for (const n of noeuds) parId[n.id] = n;

  const blocs = noeuds
    .filter((n) => n.type !== 'group')
    .map((n) => ({ id: n.id, texte: texteNoeud(n), type: map[n.id] || '', noeud: n }));

  const liens = [];
  const problemes = [];
  for (const e of aretes) {
    const rel = relationDeEtiquette(e.label, relations);
    const src = parId[e.fromNode], dst = parId[e.toNode];
    liens.push({
      id: e.id,
      de: e.fromNode, vers: e.toNode,
      deTexte: texteNoeud(src), versTexte: texteNoeud(dst),
      etiquette: e.label || '',
      relation: rel ? rel.id : '',
      polarite: polariteEtiquette(e.label),
    });
    if (!e.label || !String(e.label).trim()) {
      problemes.push({ gravite: 'info', type: 'lien-muet', id: e.id, texte: (texteNoeud(src) || '?') + ' → ' + (texteNoeud(dst) || '?') });
    } else if (!rel && relations.length) {
      // Vocabulaire vide = aucune norme imposée : on ne signale rien.
      problemes.push({ gravite: strict ? 'erreur' : 'avert', type: 'hors-vocabulaire', id: e.id, texte: '« ' + e.label +' » (' + (texteNoeud(src) || '?') + ' → ' + (texteNoeud(dst) || '?') + ')' });
    } else if (rel.soupape) {
      problemes.push({ gravite: 'info', type: 'soupape', id: e.id, texte: '« ' + rel.nom + ' » à retyper (' + (texteNoeud(src) || '?') + ' → ' + (texteNoeud(dst) || '?') + ')' });
    }
  }
  const idsTypes = new Set((types || []).map((t) => t.id));
  for (const b of blocs) {
    if (!b.texte) continue;
    if (!b.type) problemes.push({ gravite: 'info', type: 'bloc-sans-type', id: b.id, texte: b.texte });
    else if (!idsTypes.has(b.type)) problemes.push({ gravite: 'avert', type: 'type-inconnu', id: b.id, texte: b.texte + ' (« ' + b.type + ' »)' });
  }
  return { blocs, liens, problemes };
}

/* =========================================================================
 * Plugin
 * ========================================================================= */

/* ---------------- Détection de doublons d'auteurs ---------------------- */

function normNom(x) {
  return String(x || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[‐‑‒–—−]/g, '-')
    .toLowerCase().replace(/\./g, ' ').replace(/[^a-z0-9\- ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function tokensNom(x) { return normNom(x).replace(/-/g, ' ').split(' ').filter(Boolean); }
function surnameKey(name) {
  const t = tokensNom(name);
  if (!t.length) return '';
  let sur = t[t.length - 1];
  if (sur.length < 3 && t.length > 1) sur = t[0];
  return sur;
}
// Deux noms partageant le nom de famille désignent-ils la même personne ?
function memePersonne(a, b) {
  const fa = tokensNom(a).slice(0, -1), fb = tokensNom(b).slice(0, -1);
  const fullA = new Set(fa.filter((x) => x.length > 1));
  const fullB = new Set(fb.filter((x) => x.length > 1));
  const initA = fa.filter((x) => x.length === 1);
  const initB = fb.filter((x) => x.length === 1);
  if (!fullA.size && !fullB.size) return true;
  if (fullA.size && fullB.size) {
    for (const w of fullA) if (fullB.has(w)) return true;
    return false;
  }
  const full = fullA.size ? fullA : fullB;
  const inits = initA.length ? initA : initB;
  for (const i of inits) { let ok = false; for (const w of full) if (w[0] === i) ok = true; if (!ok) return false; }
  return true;
}
function meilleurCanonique(membres) {
  const acc = (x) => (/[^\x00-\x7f]/.test(x) ? 1 : 0);
  const hy = (x) => (x.includes('-') ? 1 : 0);
  const pleins = (x) => tokensNom(x).slice(0, -1).filter((t) => t.length > 1).length;
  return membres.slice().sort((a, b) =>
    (pleins(b) - pleins(a)) || (acc(b) - acc(a)) || (hy(b) - hy(a)) || (b.length - a.length))[0];
}
// Regroupe des noms (déjà hors copies de conflit) en clusters de même personne.
function clustersDoublons(noms) {
  const groupes = new Map();
  for (const n of noms) {
    const k = surnameKey(n);
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(n);
  }
  const clusters = [];
  for (const membres of groupes.values()) {
    if (membres.length < 2) continue;
    const used = new Set();
    for (let i = 0; i < membres.length; i++) {
      if (used.has(membres[i])) continue;
      const grp = [membres[i]]; used.add(membres[i]);
      for (let j = i + 1; j < membres.length; j++) {
        if (!used.has(membres[j]) && memePersonne(membres[i], membres[j])) { grp.push(membres[j]); used.add(membres[j]); }
      }
      if (grp.length > 1) clusters.push(grp);
    }
  }
  return clusters;
}

// Transforme les notes de bas de page « annotations » d'un Markdown Obsidian
// en citations Pandoc [@citekey, p. XX; ...]. resoudre(cible) -> {citekey,page}|null.
// Les notes de bas de page de texte libre sont conservées telles quelles.
/* ---------------------- Préparation du markdown exporté -------------------
 * Les notes n'emploient plus de notes de bas de page mais des citations en
 * ligne « ([[CLE|Auteur, année, p. 12]]) ». Sans conversion, pandoc n'y voit
 * que du texte : c'est pourquoi le document sortait sans le moindre champ
 * Zotero. On les rend ici sous la forme attendue par le filtre : « [@clé, p. 12] ».
 * ------------------------------------------------------------------------ */

// Regroupe les entrées d'une même source : deux annotations d'un même travail
// ne font qu'une citation, et leurs pages se cumulent dans un seul suffixe.
// « a, b et c ». Le dernier terme est amené par « et », ce qui marque la fin
// de l'énumération sans recourir au point-virgule.
function enumererFrancais(liste) {
  if (liste.length <= 1) return liste.join('');
  return liste.slice(0, -1).join(', ') + ' et ' + liste[liste.length - 1];
}

// Rend une grappe de citations. Chaque entrée résolue est soit une chaîne
// déjà prête, soit { cle, page, travaux } : une source consultée, sa page, et
// les travaux qu'elle rapporte.
//
// Le regroupement se fait ici, à l'échelle de la GRAPPE et non de l'annotation.
// Plusieurs annotations d'une même source se retrouvent souvent côte à côte :
// elles produisaient alors autant de citations du même ouvrage, qu'APA
// regroupait en effaçant le nom de l'auteur à partir de la deuxième —
// « … cité dans Dresch et al., 2015, p. 48, 2015, p. 52, … ». Une source ne
// paraît donc plus qu'une fois, ses pages cumulées et ses travaux rapportés
// réunis.
// « Le Moigne, 1994 » et « Le Moigne, 1994, p. 228 » désignent le même travail,
// le second en précisant la page. On garde le plus précis, et jamais les deux.
function ajouterTravail(liste, travail) {
  const t = String(travail || '').trim();
  if (!t) return;
  for (let i = 0; i < liste.length; i++) {
    if (t.indexOf(liste[i]) === 0) { liste[i] = t; return; }   // le nouveau précise
    if (liste[i].indexOf(t) === 0) return;                     // l'ancien précise déjà
  }
  liste.push(t);
}

// Les pages d'une même source, remises en ordre : les liminaires en chiffres
// romains d'abord, puis les pages numérotées par ordre croissant. Sans cela
// elles sortaient dans l'ordre où les annotations se présentent — « 48, vii,
// 62, 52, 50, 53 » — ce qui ne se lit pas.
function ordonnerPages(pages) {
  const rang = (p) => {
    const n = parseInt(String(p).replace(/^\D+/, ''), 10);
    if (/^[ivxlcdm]+$/i.test(String(p).trim())) return [0, 0, String(p).toLowerCase()];
    return isNaN(n) ? [2, 0, String(p)] : [1, n, ''];
  };
  return pages.slice().sort((a, b) => {
    const ra = rang(a), rb = rang(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || String(ra[2]).localeCompare(String(rb[2]));
  });
}

function rendreGrappe(entrees, connecteur) {
  const lien = connecteur || ', cité dans ';
  const ordre = [];
  const parCle = new Map();
  for (const e of entrees) {
    if (typeof e === 'string') { ordre.push(e); continue; }
    if (!e || !e.cle) continue;
    if (!parCle.has(e.cle)) { parCle.set(e.cle, { pages: [], travaux: [] }); ordre.push({ cle: e.cle }); }
    const g = parCle.get(e.cle);
    // « vii,62 » vaut deux pages : on les sépare pour ne pas les redoubler.
    for (const page of String(e.page || '').split(',')) {
      const v = page.trim();
      if (v && g.pages.indexOf(v) === -1) g.pages.push(v);
    }
    for (const t of (e.travaux || [])) ajouterTravail(g.travaux, t);
  }
  return ordre.map((x) => {
    if (typeof x === 'string') return x;
    const g = parCle.get(x.cle);
    const source = '@' + x.cle
      + (g.pages.length ? ', p. ' + ordonnerPages(g.pages).join(', ') : '');
    return g.travaux.length ? enumererFrancais(g.travaux) + lien + source : source;
  });
}

// Retire la numérotation saisie à la main en tête de titre : « 2.1 Titre »,
// « II - Titre », « 3) Titre ». Word la reprendra automatiquement.
function titreSansNumerotation(txt) {
  return String(txt)
    .replace(/^\s*(?:\d+(?:[.)]\d+)*|[IVXLCDM]+)\s*[.)\-–—]\s+/, '')
    .replace(/^\s*(?:\d+(?:\.\d+)*)\s+(?=\S)/, '')
    .trim();
}

const ZFA_RE_CIT_GROUPE = /\((\s*\[\[[^[\]\n]+\]\](?:\s*;\s*\[\[[^[\]\n]+\]\])*\s*)\)/g;

function citationsEnLigneVersPandoc(texte, resoudre, connecteur) {
  return String(texte).replace(ZFA_RE_CIT_GROUPE, (tout, dedans) => {
    const cles = [...dedans.matchAll(/\[\[([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]/g)].map((x) => cleDeLien(x[1]));
    const entrees = [];
    for (const c of cles) {
      const es = resoudre(c);
      if (es && es.length) for (const e of es) entrees.push(e);
    }
    if (!entrees.length) return tout;            // rien de reconnu : on n'abîme pas
    return '[' + rendreGrappe(entrees, connecteur).join('; ') + ']';
  });
}

// Prépare le markdown : citations, titres, encadrés, blocs à ne pas exporter.
function preparerMarkdownExport(contenu, resoudre, opts) {
  const o = opts || {};
  let s = String(contenu).replace(/^---\n[\s\S]*?\n---\n?/, '');

  // 1. Bibliographie d'Ariane : Zotero produira la sienne.
  s = s.replace(/%%\s*ariane:biblio\s*%%[\s\S]*?%%\s*\/ariane:biblio\s*%%/g, '');
  s = s.replace(/^\s*---\s*$\n+(?=#{1,6}\s*Bibliographie)/gim, '');
  // « \Z » n'existe pas en JavaScript : il y vaut la lettre Z, si bien que la
  // coupe s'arrêtait au premier Z rencontré. On vise la vraie fin de texte.
  s = s.replace(/^#{1,6}[ \t]*Bibliographie[ \t]*$[\s\S]*?(?=^#{1,6}[ \t]|$(?![\s\S]))/gim, '');

  // 2. Compteurs de travaux rapportés : ils n'ont pas de sens hors d'Obsidian.
  s = s.replace(/\s*⟨\d+⟩/g, '');

  // 3. Citations en ligne -> syntaxe du filtre Zotero.
  s = citationsEnLigneVersPandoc(s, resoudre, o.citeDans);

  // 4. Liens de source isolés « [[@clé]] » -> citation dans le texte.
  s = s.replace(/\[\[@([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]/g, (t, cle) => '@' + cleDeLien(cle));

  // 4 bis. Les liens Obsidian qui restent ne sont pas des citations : on les
  //    aplatit pour un rendu propre dans Word.
  s = s
    .replace(/\[\[[^\]\n]*\|([^\]\n]+)\]\]/g, '$1')   // [[cible|alias]] -> alias
    .replace(/\[\[([^\]|#\n]+)\]\]/g,
      (m, t) => t.split('/').pop().replace(/^@/, '').trim());   // [[note]] -> nom

  // 5. Encadrés Obsidian -> bloc à style Word.
  s = encadresVersPandoc(s, o.styleEncadre || 'Items de réflexion');

  // 6. Titres : « # » est le titre du document, pas une partie. On décale d'un
  //    cran, et l'on retire la numérotation manuelle.
  if (o.decalerTitres !== false) {
    s = s.replace(/^(#{1,6})[ \t]+(.+?)[ \t]*$/gm, (t, diese, txt) => {
      const n = diese.length;
      const titre = o.retirerNumerotation === false ? txt.trim() : titreSansNumerotation(txt);
      if (n === 1) return '';                    // titre global : porté par l'en-tête
      return '#'.repeat(Math.max(1, n - 1)) + ' ' + titre;
    });
  } else if (o.retirerNumerotation !== false) {
    s = s.replace(/^(#{1,6})[ \t]+(.+?)[ \t]*$/gm,
      (t, d, txt) => d + ' ' + titreSansNumerotation(txt));
  }

  // 7. Séparation des blocs : sans cela pandoc avale titres et listes.
  s = normaliserBlocsPandoc(s);

  // 8. Typographie française : les espaces devant la ponctuation double
  //    deviennent insécables, pour que Word ne les rejette pas en début de
  //    ligne.
  if (o.insecables !== false) s = insecablesFrancais(s);

  return s.replace(/\n{3,}/g, '\n\n').trim();
}

// Deux écarts entre Obsidian et pandoc, tous deux dus aux lignes vides que
// que l'on n'écrit pas toujours :
//   - pandoc exige une ligne vide AVANT un titre, une liste, une citation, un
//     tableau ou un bloc « ::: » ; sans elle, il rattache la ligne au
//     paragraphe précédent et les dièses s'affichent en clair ;
//   - pandoc réunit en UN paragraphe des lignes consécutives, là où Obsidian
//     en fait autant de paragraphes. Le saut de paragraphe se perdait, et les
//     amorces en gras qui servent de sous-titres se noyaient dans des blocs
//     de plusieurs milliers de caractères.
// On pose donc les lignes vides manquantes, dans les deux cas.
function normaliserBlocsPandoc(texte) {
  const vide = (l) => !String(l || '').trim();
  const estTitre = (l) => /^#{1,6}[ \t]+\S/.test(l);
  const estListe = (l) => /^[ \t]*(?:[-*+][ \t]+|\d+[.)][ \t]+)\S/.test(l);
  const estCitation = (l) => /^[ \t]*>/.test(l);
  const estDiv = (l) => /^[ \t]*:::/.test(l);
  const estTableau = (l) => /^[ \t]*\|/.test(l);
  const estCloture = (l) => /^[ \t]*(?:```|~~~)/.test(l);

  const lignes = String(texte).split('\n');
  const out = [];
  let dansCode = false;
  for (const l of lignes) {
    if (estCloture(l)) { dansCode = !dansCode; out.push(l); continue; }
    if (dansCode) { out.push(l); continue; }
    const prec = out.length ? out[out.length - 1] : '';
    // Une ligne de texte ordinaire : ni titre, ni liste, ni tableau, ni
    // citation, ni bloc, et sans retrait — un retrait signale la suite d'un
    // élément de liste, qu'il ne faut pas couper.
    const estTexte = (x) => !vide(x) && !estTitre(x) && !estListe(x)
      && !estCitation(x) && !estDiv(x) && !estTableau(x) && !estCloture(x)
      && !/^[ \t]/.test(x);
    const manque =
      (estTitre(l) && !vide(prec)) ||
      (estListe(l) && !vide(prec) && !estListe(prec)) ||
      (estCitation(l) && !vide(prec) && !estCitation(prec)) ||
      (estDiv(l) && !vide(prec)) ||
      (estTableau(l) && !vide(prec) && !estTableau(prec)) ||
      (estTexte(l) && !vide(prec) && !estTitre(prec) && !estDiv(prec));
    if (manque && out.length) out.push('');
    out.push(l);
  }
  // Un titre veut aussi une ligne vide derrière lui.
  const final = [];
  for (let i = 0; i < out.length; i++) {
    final.push(out[i]);
    if (estTitre(out[i]) && !vide(out[i + 1])) final.push('');
  }
  return final.join('\n');
}

// Typographie française. On ne fait que RENDRE INSÉCABLE une espace déjà
// présente ; on n'en ajoute jamais. Ajouter une espace devant un « : » nu
// abîmerait les adresses (« https://… »), les heures (« 14:30 ») et les
// attributs pandoc (« custom-style="…" »), qui n'en ont pas.
//
// Les grappes de citation sont laissées telles quelles : Zotero les réécrit à
// l'actualisation, et le « ; » y sépare les références.
function insecablesFrancais(texte) {
  const NB = '\u00a0';                       // espace insécable
  const lignes = String(texte).split('\n');
  let dansCode = false;
  const sortie = lignes.map((l) => {
    if (/^\s*(?:```|~~~)/.test(l)) { dansCode = !dansCode; return l; }
    if (dansCode) return l;
    if (/^\s*:::/.test(l)) return l;          // délimiteur de bloc pandoc
    if (/^\s*\|[\s|:-]*\|\s*$/.test(l)) return l; // ligne de séparation de tableau
    // split avec groupe capturant : les crochets tombent aux rangs impairs.
    return l.split(/(\[[^\]\n]*\])/).map((bout, i) => (i % 2 ? bout : bout
      .replace(/ +([;:!?»])/g, NB + '$1')
      .replace(/(«) +/g, '$1' + NB))).join('');
  });
  return sortie.join('\n');
}

// Marques encadrant une mise en avant dans le markdown intermédiaire. La
// finition les retrouve dans le document produit, en tire le titre, et
// remplace le tout par le gabarit d'encadré du modèle. On ne peut pas se fier
// aux styles : pandoc donne aux éléments de liste le style de liste, non celui
// du bloc, et un encadré à puces échapperait à toute détection par le style.
const MARQUE_ENCADRE_DEBUT = '\u27E6ariane:encadre\u27E7';
const MARQUE_ENCADRE_FIN = '\u27E6/ariane:encadre\u27E7';

// « > [!info] Titre » devient un bloc pandoc à style Word, borné par les deux
// marques ci-dessus. Sans gabarit d'encadré dans le modèle, la finition se
// borne à retirer les marques : le bloc reste stylé, ce qui reste lisible.
function encadresVersPandoc(texte, style) {
  const lignes = String(texte).split('\n');
  const out = [];
  let i = 0;
  while (i < lignes.length) {
    const m = lignes[i].match(/^>\s*\[!(\w+)\][-+]?\s*(.*)$/);
    if (!m) { out.push(lignes[i]); i++; continue; }
    const titre = m[2].trim();
    const corps = [];
    i++;
    while (i < lignes.length && /^>/.test(lignes[i])) {
      corps.push(lignes[i].replace(/^>\s?/, ''));
      i++;
    }
    out.push('::: {custom-style="' + style + '"}');
    out.push(MARQUE_ENCADRE_DEBUT + titre);
    out.push('');
    for (const l of corps) out.push(l);
    out.push('');
    out.push(MARQUE_ENCADRE_FIN);
    out.push(':::');
    out.push('');
  }
  return out.join('\n');
}

function footnotesVersCitations(contenu, resoudre, connecteur) {
  let s = String(contenu).replace(/^---\n[\s\S]*?\n---\n?/, ''); // retire le frontmatter
  const lignes = s.split('\n');
  const defs = {};              // label -> cluster Pandoc
  const aRetirer = new Set();   // indices de lignes de définition (citations) à retirer
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(/^\[\^([^\]]+)\]:(.*)$/);
    if (!m) continue;
    const label = m[1];
    let j = i + 1;
    const corps = [m[2]];
    while (j < lignes.length && /^[ \t]+\S/.test(lignes[j])) { corps.push(lignes[j]); j++; }
    const texte = corps.join('\n');
    const cibles = [...texte.matchAll(/\[\[([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]/g)].map((x) => cleDeLien(x[1]));
    const entrees = [];
    for (const c of cibles) {
      const es = resoudre(c);
      if (es && es.length) for (const e of es) entrees.push(e);
    }
    if (entrees.length) {
      defs[label] = '[' + rendreGrappe(entrees, connecteur).join('; ') + ']';
      for (let k = i; k < j; k++) aRetirer.add(k);
    }
    i = j - 1;
  }
  // Retire le titre de section « Annotations de lecture associées » et son séparateur ---.
  for (let i = 0; i < lignes.length; i++) {
    if (!/^\*\*Annotations de lecture associées\*\*\s*$/.test(lignes[i])) continue;
    aRetirer.add(i);
    let k = i - 1;
    while (k >= 0 && lignes[k].trim() === '') { aRetirer.add(k); k--; }
    if (k >= 0 && /^-{3,}\s*$/.test(lignes[k])) aRetirer.add(k);
  }
  const sortie = [];
  for (let i = 0; i < lignes.length; i++) {
    if (aRetirer.has(i)) continue;
    const l = lignes[i].replace(/\[\^([^\]\s]+)\]/g, (full, lab) => (defs[lab] || full));
    sortie.push(l);
  }
  const texte = sortie.join('\n');
  // Les liens Obsidian ne sont PAS aplatis ici : une citation en ligne s'écrit
  // ([[CLE|Power, 2010, p. 5]]), et l'aplatir à cet endroit la réduisait à du
  // texte mort avant que preparerMarkdownExport n'ait pu la convertir en champ
  // Zotero. L'aplatissement a lieu là-bas, une fois les citations converties.
  return texte.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

class ZotflowAtomiser extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.appliquerStyleAparte();
    this.installerVerrouLecture();
    this.ecrituresRecentes = new Map();
    this.antirebonds = new Map();
    this.rattachementsIgnores = new Set();

    // État du panier flottant d'annotations.
    this.panier = [];
    this.panierEl = null;
    this.glisseDepuisPanier = false;
    this.register(() => this.fermerPanier());
    this.argFenetreEl = null;
    this.suggAncrage = null;
    this.register(() => this.fermerFenetreArgument());

    this.addSettingTab(new ZotflowAtomiserSettingTab(this.app, this));

    this.addRibbonIcon('layers', "Panier d'annotations (Ariane)", () => this.basculerPanier());

    this.addCommand({
      id: 'atomise-active',
      name: tr('Atomiser : la note source active'),
      callback: () => this.commandeNoteActive(),
    });
    this.addCommand({
      id: 'atomise-tout',
      name: tr('Atomiser : toutes les sources'),
      callback: () => this.atomiserTout(),
    });
    this.addCommand({
      id: 'retirer-alias-liens',
      name: tr('Entretien : retirer l’alias des liens d’annotation'),
      callback: () => this.retirerAliasLiensAnnotation(),
    });
    this.addCommand({
      id: 'normaliser-conjonctions-references',
      name: tr('Entretien : normaliser les conjonctions des références'),
      callback: () => this.normaliserConjonctionsReferences(),
    });
    this.addCommand({
      id: 'panier-annotations',
      name: tr('Annotations : afficher ou masquer le panier'),
      callback: () => this.basculerPanier(),
    });
    this.addCommand({
      id: 'lier-reference-zotero',
      name: tr('Références en attente : lier la référence active à une fiche Zotero'),
      callback: () => this.assistantLiageReference(),
    });
    this.addCommand({
      id: 'rattacher-toutes-references',
      name: tr('Références en attente : rattacher automatiquement'),
      callback: () => this.rattacherToutesReferences(),
    });
    this.addCommand({
      id: 'creer-tache',
      name: tr('Tâches : créer une tâche'),
      callback: () => new ModaleNouvelleTache(this.app, this, async (champs) => {
        if (!champs) return;
        const chemin = await this.creerTache(champs);
        const f = this.app.vault.getAbstractFileByPath(chemin);
        if (f) await this.app.workspace.getLeaf(true).openFile(f);
      }).open(),
    });
    this.addCommand({
      id: 'maj-bloc-tache',
      name: tr('Tâches : rafraîchir le bloc de la tâche active'),
      callback: async () => {
        const f = this.app.workspace.getActiveFile();
        if (!f) return;
        const fait = await this.majBlocTache(f);
        new obsidian.Notice(fait ? tr('Bloc rafraîchi.') : tr("Cette note n'est pas une tâche."));
      },
    });
    this.addCommand({
      id: 'temps-journal',
      name: tr('Temps : écrire le journal du jour'),
      callback: () => this.ouvrirBilanTemps(),
    });
    this.addCommand({
      id: 'temps-reporter',
      name: tr('Temps : reporter maintenant dans les notes'),
      callback: async () => {
        await this.reporterTemps();
        new obsidian.Notice(tr('Temps reporté dans les propriétés.'));
      },
    });
    this.addCommand({
      id: 'citations-replier',
      name: tr('Citations : tout replier'),
      callback: () => this.basculerCitations(true),
    });
    this.addCommand({
      id: 'citations-deplier',
      name: tr('Citations : tout déplier'),
      callback: () => this.basculerCitations(false),
    });
    this.addCommand({
      id: 'citations-basculer',
      name: tr('Citations : replier ou déplier'),
      callback: () => this.basculerCitations(!this.settings.citationsRepliees),
    });
    this.addCommand({
      id: 'citations-rafraichir',
      name: tr('Citations : rafraîchir les libellés…'),
      callback: () => new ChoixListeModal(this.app, 'Rafraîchir les libellés de citation', [
        { nom: 'Note active', portee: 'active' },
        { nom: 'Toutes les notes du coffre', portee: 'tout' },
      ], (c) => this.rafraichirCitations(c.portee)).open(),
    });
    this.addCommand({
      id: 'biblio-note',
      name: tr('Bibliographie : recomposer celle de la note active'),
      callback: () => {
        const f = this.app.workspace.getActiveFile();
        if (f) this.majBibliographie(f); else new obsidian.Notice(tr('Ouvrez une note.'));
      },
    });
    this.addCommand({
      id: 'biblio-tout',
      name: tr('Bibliographie : recomposer celles de toutes les notes'),
      callback: () => this.majBibliographieToutes(),
    });
    this.addCommand({
      id: 'schema-synchroniser-tout',
      name: tr('Schémas : synchroniser dans les notes'),
      callback: () => this.synchroniserTousSchemas(),
    });
    this.addCommand({
      id: 'carte-valider',
      name: tr('Schémas : valider le schéma actif'),
      callback: () => this.validerCarte(),
    });
    this.addCommand({
      id: 'carte-interroger',
      name: tr('Schémas : interroger le graphe'),
      callback: () => this.interrogerGraphe(),
    });
    this.addCommand({
      id: 'notes-lecture-atomiser',
      name: tr('Atomiser : les notes-filles Zotero'),
      callback: () => this.atomiserToutesNotesLecture(),
    });
    this.addCommand({
      id: 'ouvrir-dans-zotero',
      name: tr('Annotations : ouvrir dans Zotero'),
      callback: () => this.ouvrirDansZotero(),
    });
    this.addCommand({
      id: 'verifier-modele-word',
      name: tr('Word : vérifier le modèle'),
      callback: () => this.verifierModeleWord(),
    });
    this.addCommand({
      id: 'decouper-bibliographies',
      name: tr('Références citées : structurer les entrées non structurées'),
      callback: () => this.decouperBibliographies(),
    });
    this.addCommand({
      id: 'reparer-liens-auteurs',
      name: tr('Entretien : réparer les liens d’auteurs'),
      callback: () => this.reparerLiensAuteurs(),
    });
    this.addCommand({
      id: 'arbitrer-references-attente',
      name: tr('Références en attente : ouvrir la liste'),
      callback: () => this.ouvrirVueReferences(),
    });
    this.addCommand({
      id: 'exporter-word-zotero',
      name: tr('Word : exporter avec citations Zotero'),
      callback: () => this.exporterWordZotero(),
    });
    this.addCommand({
      id: 'bibliographie-citee-source',
      name: tr('Références citées : extraire celles de la source active'),
      callback: () => this.genererBibliographieSource(),
    });
    this.addCommand({
      id: 'arreter-bibliographies',
      name: tr('Références citées : interrompre l’extraction'),
      callback: () => {
        if (!this.bibliosEnCours) { new obsidian.Notice(tr('Aucune génération en cours.')); return; }
        this.bibliosEnCours = false;
      },
    });
    this.addCommand({
      id: 'bibliographies-citees-toutes',
      name: tr('Références citées : extraire celles de toutes les sources'),
      callback: () => this.genererToutesBibliographies(),
    });
    this.addCommand({
      id: 'fusionner-doublons-auteurs',
      name: tr('Entretien : fusionner les doublons d’auteurs'),
      callback: () => this.ouvrirFusionAuteurs(),
    });
    this.addCommand({
      id: 'suggestions-ouvrir',
      name: tr('Annotations : ouvrir le panneau de suggestions'),
      callback: () => this.ouvrirVueSuggestions(),
    });
    this.addCommand({
      id: 'suggestions-reconstruire',
      name: tr('Annotations : reconstruire l’index des suggestions'),
      callback: async () => {
        const n = await this.construireIndexSuggestions();
        new obsidian.Notice(tr('Index de suggestions reconstruit (') + n + ' notes).');
        this.majSuggestions();
      },
    });

    // Panneau de suggestions dynamiques (moteur lexical local).
    this.registerView('zfa-suggestions', (leaf) => new VueSuggestionsZotflow(leaf, this));
    this.registerView(TYPE_VUE_REFS, (leaf) => new VueReferencesAttente(leaf, this));
    this.addRibbonIcon('quote', 'Citations : replier ou déplier (Ariane)',
      () => this.basculerCitations(!this.settings.citationsRepliees));
    this.addRibbonIcon('sparkles', "Suggestions d'annotations (Ariane)", () => this.ouvrirVueSuggestions());
    this.addRibbonIcon('scale', tr('Références en attente (Ariane)'), () => this.ouvrirVueReferences());
    // Déclare le panneau comme source d'aperçu au survol (« Page preview »).
    if (this.registerHoverLinkSource) {
      this.registerHoverLinkSource('zfa-suggestions', { display: tr('Suggestions (Ariane)'), defaultMod: false });
      this.registerHoverLinkSource('zfa-partout', { display: 'Ariane — liens (chat, panneaux)', defaultMod: false });
    }
    // Aperçu au survol des liens internes dans les vues NON-markdown (ex. chat
    // Claudian), qui ne déclenchent pas l'aperçu natif elles-mêmes.
    this.registerDomEvent(document, 'mouseover', (e) => {
      if (!this.settings.hoverPartout) return;
      const a = e.target && e.target.closest ? e.target.closest('a.internal-link') : null;
      if (!a) return;
      if (a.closest('.markdown-reading-view, .markdown-source-view, .cm-editor')) return; // déjà géré
      const cible = a.getAttribute('data-href') || a.getAttribute('href');
      if (!cible) return;
      this.app.workspace.trigger('hover-link', { event: e, source: 'zfa-partout', hoverParent: this, targetEl: a, linktext: cible, sourcePath: '' });
    });

    // Clic sur un lien dans une fenêtre de survol : la refermer. Les liens
    // externes (obsidian://, zotero://) ouvrent une autre app sans que le
    // popover natif ne se ferme ; on le retire après le traitement du clic.
    this.registerDomEvent(document, 'click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a || !a.closest('.hover-popover, .popover')) return;
      setTimeout(() => {
        document.querySelectorAll('.hover-popover').forEach((el) => el.remove());
      }, 0);
    }, { capture: true });

    // Glisser une annotation sur un paragraphe -> note de bas de page.
    // Enregistré sur le document principal ET sur chaque fenêtre détachée
    // (pop-out / multi-moniteurs), pour que le dépôt fonctionne partout.
    // Les fenêtres détachées ouvertes AVANT le chargement du greffon — celles
    // qu'Obsidian restaure au démarrage — n'étaient couvertes par aucun
    // gestionnaire : seuls le document principal et les fenêtres ouvertes
    // ensuite l'étaient. Le dépôt y restait donc sans effet.
    const docsCouverts = new WeakSet();
    const enregistrerDnD = (doc) => {
      if (!doc || docsCouverts.has(doc)) return;
      docsCouverts.add(doc);
      // Un glisser parti d'un panneau tiers peut arriver avec un dataTransfer
      // vide : Chromium refuse de transporter une adresse « app:// », et c'est
      // précisément la forme que prennent les liens internes rendus hors d'une
      // vue markdown (le chat de Claudian, par exemple). On note donc la cible
      // au départ du glisser, seul moment où l'information est sûre.
      this.registerDomEvent(doc, 'dragstart', (e) => this.noterSourceGlissee(e), { capture: true });
      this.registerDomEvent(doc, 'dragover', (e) => this.surDragOverParagraphe(e), { capture: true });
      this.registerDomEvent(doc, 'drop', (e) => this.surDropParagraphe(e), { capture: true });
      this.registerDomEvent(doc, 'dragend', () => { this._sourceGlissee = ''; this.nettoyerZoneDrop(); });
    };
    enregistrerDnD(document);
    // Rattrapage des fenêtres déjà ouvertes.
    this.app.workspace.onLayoutReady(() => {
      try {
        this.app.workspace.iterateAllLeaves((feuille) => {
          const c = feuille && feuille.view && feuille.view.containerEl;
          if (c && c.ownerDocument) enregistrerDnD(c.ownerDocument);
        });
      } catch (e) {
        console.warn('[Ariane] fenêtres détachées non parcourues :', e);
      }
    });
    this.registerEvent(
      this.app.workspace.on('window-open', (_wsWin, win) => {
        if (win && win.document) enregistrerDnD(win.document);
      })
    );
    // Suppression dynamique des notes de bas de page orphelines.
    this.registerEvent(
      this.app.workspace.on('editor-change', (editor) => {
        if (!this.settings.nettoyerNotesOrphelines) return;
        this.antirebond('notesOrphelines', () => this.nettoyageNotesOrphelines(editor), 1200);
      })
    );
    // Affiche dynamiquement le titre (alias) en aparté discret après un
    // lien d'annotation montrant la clé, en lecture. Non destructif.
    this.registerMarkdownPostProcessor((el, ctx) => this.enrichirLiensAnnotation(el, ctx));
    this.registerMarkdownPostProcessor((el) => this.rendreCitationsRepliables(el));
    this.registerMarkdownPostProcessor((el) => this.enrichirCompteursEmprunts(el));
    this.app.workspace.onLayoutReady(() => this.installerDecorateurExplorateur());
    this.app.workspace.onLayoutReady(() => {
      this.elaguerHistoriqueTemps();
      this.demarrerCompteurTemps();
      this.installerInfobulleTemps();
    });
    this._citVersion = 0;
    this.app.workspace.onLayoutReady(() => this.appliquerEtatCitations());

    // Même aparté en mode édition (Live Preview), via une extension CodeMirror.
    try {
      const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
      const { RangeSetBuilder } = require('@codemirror/state');
      const plugin = this;

      class AliasWidget extends WidgetType {
        constructor(texte) { super(); this.texte = texte; }
        eq(other) { return other.texte === this.texte; }
        toDOM() {
          const span = document.createElement('span');
          span.className = 'zfa-lien-alias';
          span.textContent = this.texte;
          return span;
        }
        ignoreEvent() { return true; }
      }

      const ext = ViewPlugin.fromClass(
        class {
          constructor(view) { this.decorations = this.build(view); }
          update(u) {
            if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = this.build(u.view);
          }
          build(view) {
            const builder = new RangeSetBuilder();
            if (!plugin.settings.aliasSurLiens) return builder.finish();
            for (const { from, to } of view.visibleRanges) {
              const texte = view.state.doc.sliceString(from, to);
              const re = /\[\[([^\]\n]+?)\]\]/g;
              let m;
              while ((m = re.exec(texte)) !== null) {
                if (m.index > 0 && texte[m.index - 1] === '!') continue; // embeds
                const inner = m[1];
                if (inner.includes('#')) continue;
                const parts = inner.split('|');
                if (parts.length > 1) continue; // alias manuel présent -> pas d'aparté auto
                const cible = parts[0].trim();
                const titre = plugin.titreAnnotationCiblee(cible, '', true);
                if (!titre) continue;
                const pos = from + m.index + m[0].length;
                builder.add(pos, pos, Decoration.widget({ widget: new AliasWidget(plugin.formatAparte(titre, cible)), side: 1 }));
              }
            }
            return builder.finish();
          }
        },
        { decorations: (v) => v.decorations }
      );

      this.registerEditorExtension(ext);
    } catch (e) {
      console.error('[Ariane] Aparté en édition indisponible :', e);
    }

    // Citations repliables en édition (Live Preview et mode source).
    // La citation est remplacée par une pastille cliquable ; le contenu
    // réapparaît si le curseur y entre, pour ne jamais gêner la frappe.
    try {
      const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
      const { RangeSetBuilder } = require('@codemirror/state');
      const plugin = this;

      class PastilleCitation extends WidgetType {
        constructor(nombre, deplier) { super(); this.nombre = nombre; this.deplier = deplier; }
        eq(autre) { return autre.nombre === this.nombre; }
        toDOM() {
          const b = document.createElement('span');
          b.className = 'zfa-cit-pastille';
          b.textContent = String(this.nombre);
          b.setAttribute('aria-label', this.nombre > 1
            ? this.nombre + ' références — cliquer pour déplier'
            : 'Une référence — cliquer pour déplier');
          b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
          b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.deplier(); });
          return b;
        }
        ignoreEvent() { return false; }
      }

      const extCitations = ViewPlugin.fromClass(
        class {
          constructor(view) {
            this.ouvertes = new Set();
            this.local = false;
            this.plages = [];
            this.version = plugin._citVersion;
            this.decorations = this.build(view);
          }
          update(u) {
            // Les décalages changent dès que le document change : les
            // exceptions ouvertes à la main ne survivent pas à une édition.
            if (u.docChanged) this.ouvertes.clear();

            // Le basculement global ne modifie ni le texte ni la sélection :
            // sans ce compteur, la vue restait telle quelle jusqu'au prochain
            // clic, ce qui donnait l'impression d'une latence considérable.
            const bascule = this.version !== plugin._citVersion;
            if (bascule) {
              this.version = plugin._citVersion;
              // Une commande globale reprend la main sur les citations
              // dépliées une à une : sans cet oubli, « tout replier » laissait
              // ouvertes celles que l'on avait touchées au doigt.
              this.ouvertes.clear();
            }

            // Dépliement d'une citation isolée : il ne passe pas par le
            // compteur global, qui viderait aussitôt l'exception demandée.
            const local = this.local;
            this.local = false;

            if (bascule || local || u.docChanged || u.viewportChanged) {
              this.decorations = this.build(u.view);
              return;
            }

            // Un simple déplacement du curseur ne change rien tant qu'il
            // n'entre ni ne sort d'une citation. C'est le cas le plus fréquent,
            // et le reconstruire à chaque frappe était inutilement coûteux.
            if (u.selectionSet && this.selectionCompte(u.startState, u.state)) {
              this.decorations = this.build(u.view);
            }
          }
          selectionCompte(avant, apres) {
            const a = avant.selection.main, b = apres.selection.main;
            for (const p of this.plages) {
              const dedansAvant = a.from <= p.to && a.to >= p.from;
              const dedansApres = b.from <= p.to && b.to >= p.from;
              if (dedansAvant !== dedansApres) return true;
            }
            return false;
          }
          build(view) {
            const builder = new RangeSetBuilder();
            this.plages = [];
            const s = plugin.settings;
            if (!s.citationsRepliables || !s.citationsRepliees) return builder.finish();
            const sel = view.state.selection.main;
            const self = this;
            for (const { from, to } of view.visibleRanges) {
              const texte = view.state.doc.sliceString(from, to);
              for (const c of citationsDuTexte(texte)) {
                const debut = from + c.index;
                const fin = debut + c.longueur;
                this.plages.push({ from: debut, to: fin });
                if (this.ouvertes.has(debut)) continue;
                // Curseur ou sélection dans la citation : on la laisse lisible.
                if (sel.from <= fin && sel.to >= debut) continue;
                builder.add(debut, fin, Decoration.replace({
                  widget: new PastilleCitation(c.nombre, () => {
                    self.ouvertes.add(debut);
                    self.local = true;
                    view.dispatch({});
                  }),
                }));
              }
            }
            return builder.finish();
          }
        },
        { decorations: (v) => v.decorations }
      );

      this.registerEditorExtension(extCitations);
    } catch (e) {
      console.error('[Ariane] Citations repliables indisponibles :', e);
    }

    // Surlignage de la phrase visée pendant un glisser (mode « cibler la phrase »).
    try {
      const { StateField, StateEffect } = require('@codemirror/state');
      const { Decoration, EditorView } = require('@codemirror/view');
      this.effetPhrase = StateEffect.define();
      const effetPhrase = this.effetPhrase;
      const marque = Decoration.mark({ class: 'zfa-drop-cible-phrase' });
      const champPhrase = StateField.define({
        create() { return Decoration.none; },
        update(deco, tr) {
          deco = deco.map(tr.changes);
          for (const ef of tr.effects) {
            if (ef.is(effetPhrase)) {
              deco = ef.value && ef.value.to > ef.value.from
                ? Decoration.set([marque.range(ef.value.from, ef.value.to)])
                : Decoration.none;
            }
          }
          return deco;
        },
        provide: (f) => EditorView.decorations.from(f),
      });
      this.registerEditorExtension(champPhrase);
    } catch (e) {
      console.error('[Ariane] Surlignage de phrase indisponible :', e);
    }

    // Suggestions : recalcul à la pause de frappe et au changement de note.
    const estCandidat = (f) => {
      if (!f || !f.path) return false;
      const dossiers = this.dossiersSuggeres();
      return !dossiers.length || dossiers.some((d) => f.path === d + '.md' || f.path.startsWith(d + '/'));
    };
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
      if (this.settings.suggActif) this.antirebond('suggestions', () => this.majSuggestions(false), 200);
    }));
    this.registerEvent(this.app.workspace.on('editor-change', () => {
      if (this.settings.suggActif) this.antirebond('suggestions', () => this.majSuggestions(false), this.settings.suggAntirebond || 900);
    }));
    // Bouton « Ouvrir dans Zotero » dans les lecteurs ZotFlow : au démarrage
    // pour les vues déjà restaurées, puis à chaque changement de disposition.
    this.app.workspace.onLayoutReady(() => this.decorerLecteursZotflow());
    this.registerEvent(this.app.workspace.on('layout-change', () => this.decorerLecteursZotflow()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.decorerLecteursZotflow()));

    // « Ouvrir dans Zotero », au clic droit sur la note comme dans l'éditeur.
    const entreeZotero = (menu, fichier) => {
      if (!fichier || fichier.extension !== 'md') return;
      if (!this.cibleZotero(fichier)) return;
      menu.addItem((it) => it.setTitle(tr('Ariane : ouvrir dans Zotero')).setIcon('external-link')
        .onClick(() => this.ouvrirDansZotero(fichier)));
    };
    this.registerEvent(this.app.workspace.on('file-menu', (menu, f) => entreeZotero(menu, f)));
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, ed, vue) => {
      entreeZotero(menu, vue && vue.file ? vue.file : this.app.workspace.getActiveFile());
    }));

    // Clic droit sur une sélection -> suggestions ciblées sur ce passage.
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor) => {
      const sel = editor && editor.getSelection ? editor.getSelection() : '';
      if (!sel || !sel.trim()) return;
      menu.addItem((it) => it.setTitle(tr('Ariane : suggestions pour ce passage')).setIcon('sparkles')
        .onClick(() => this.suggestionsPourArgument(sel)));
    }));
    // Invalidation de l'index quand une note candidate change.
    const revaliderIndex = (f) => {
      if (!estCandidat(f)) return;
      this.marquerNoteSale(f);
      if (this.settings.suggActif) this.antirebond('suggestionsIndex', () => this.majSuggestions(false), 1500);
    };
    this.registerEvent(this.app.vault.on('modify', revaliderIndex));
    this.registerEvent(this.app.vault.on('create', revaliderIndex));
    this.registerEvent(this.app.vault.on('delete', revaliderIndex));
    this.registerEvent(this.app.vault.on('rename', (f) => revaliderIndex(f)));

    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.vault.on('modify', (f) => this.surModification(f)));

      // Un schéma draw.io modifié -> on rafraîchit l'extrait dans sa note.
      const majSchema = (f) => {
        if (!this.settings.schemaSyncAuto) return;
        if (!(f instanceof obsidian.TFile) || !this.estSchemaDrawio(f)) return;
        this.antirebond('schema:' + f.path, () => this.synchroniserSchema(f, true), 1200);
      };
      this.registerEvent(this.app.vault.on('modify', majSchema));

      // Bibliographie : régénérée après une pause dans la frappe.
      this.registerEvent(this.app.vault.on('modify', (f) => {
        if (!this.settings.biblioAuto) return;
        if (!(f instanceof obsidian.TFile) || f.extension !== 'md') return;
        if (this.ecritePlugin(f.path)) return;
        if (f.path.startsWith(this.dossierA + '/') || f.path.startsWith('Références/')) return;
        this.antirebond('biblio:' + f.path, () => this.majBibliographie(f, true), 2500);
      }));
      this.registerEvent(this.app.vault.on('create', majSchema));
      this.registerEvent(this.app.vault.on('create', (f) => this.surCreation(f)));
      this.registerEvent(this.app.vault.on('delete', (f) => this.surSuppression(f)));

      // Tag « orpheline » : mise à jour quand les liens changent.
      this.registerEvent(this.app.metadataCache.on('resolved', () => {
        if (!this.settings.marquerOrphelines) return;
        this.antirebond('orphelines', () => this.synchroniserTagsOrphelines(), 800);
      }));
      if (this.settings.marquerOrphelines) {
        this.antirebond('orphelines', () => this.synchroniserTagsOrphelines(), 1500);
      }
    });
  }

  /* --------------------- Moteur de suggestions -------------------------- */

  // Fichiers markdown appartenant aux dossiers candidats configurés.
  fichiersCandidatsSuggestions() {
    const dossiers = this.dossiersSuggeres();
    const res = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!dossiers.length || dossiers.some((d) => f.path === d + '.md' || f.path.startsWith(d + '/'))) {
        res.push(f);
      }
    }
    return res;
  }

  // Dossier candidat (le plus spécifique) contenant un chemin, ou '' si aucun.
  // Un dossier candidat est-il retenu par le filtre du panneau ?
  dossierRetenu(dossier) {
    const masques = this.settings.suggDossiersMasques || [];
    return !masques.includes(dossier);
  }

  dossierCandidatDe(chemin) {
    const dossiers = this.dossiersSuggeres()
      .slice().sort((a, b) => b.length - a.length); // plus spécifique d'abord
    for (const d of dossiers) {
      if (chemin === d + '.md' || chemin.startsWith(d + '/')) return d;
    }
    return '';
  }

  // Titre lisible : premier alias, sinon nom de fichier.
  titreLisibleFichier(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const al = cache && cache.frontmatter ? cache.frontmatter.aliases : null;
    if (Array.isArray(al) && al.length) return String(al[0]);
    if (typeof al === 'string' && al) return al;
    return file.basename;
  }

  // Texte indexable d'un fichier candidat : titre (pondéré) + corps nettoyé.
  async texteIndexable(file) {
    let contenu = '';
    try { contenu = await this.app.vault.cachedRead(file); } catch (e) { contenu = ''; }
    const sansFm = contenu.replace(/^---\n[\s\S]*?\n---\n?/, '');
    const propre = sansFm
      .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
      .replace(/[#>*_\[\]\(\)!|^-]+/g, ' ')
      .replace(/\s+/g, ' ');
    const titre = this.titreLisibleFichier(file);
    return titre + ' . ' + titre + ' . ' + propre; // titre compté deux fois
  }

  // (Re)construit l'index des notes candidates : lexical (toujours) et
  // sémantique (si le moteur l'exige et qu'Ollama répond).
  async construireIndexSuggestions() {
    const fichiers = this.fichiersCandidatsSuggestions();
    const entrees = [];
    for (const f of fichiers) {
      const texte = await this.texteIndexable(f);
      if (!texte.trim()) continue;
      entrees.push({ path: f.path, basename: f.basename, titre: this.titreLisibleFichier(f), texte, hash: hacherTexte(texte) });
    }
    this.suggEntrees = entrees;
    this.suggSales = new Set();
    this.recomposerIndexLexical();
    if (this.moteurSemantiqueDemande()) await this.construireIndexSemantique(entrees);
    else this.suggIndexSem = null;
    return this.suggIndex.docs.length;
  }

  moteurSemantiqueDemande() {
    const m = this.settings.suggMoteur || 'hybride';
    return m === 'semantique' || m === 'hybride';
  }

  // Recompose les vecteurs lexicaux à partir des entrées DÉJÀ en mémoire : une
  // centaine de millisecondes pour tout le coffre, sans lire un seul fichier.
  // C'est ce qui permet de ne plus tout relire au moindre enregistrement.
  recomposerIndexLexical() {
    const entrees = this.suggEntrees || [];
    const docsTf = entrees.map((e) => frequenceTermes(tokeniser(e.texte)));
    const idf = calculerIdf(docsTf);
    const docs = entrees.map((e, i) => {
      const v = vecteurTfIdf(docsTf[i], idf);
      return { path: e.path, basename: e.basename, titre: e.titre, vec: v.vec, norme: v.norme };
    });
    this.suggIndex = { docs, idf };
  }

  async assurerIndexSuggestions() {
    if (!this.suggIndex || !this.suggEntrees) { await this.construireIndexSuggestions(); return; }
    if (this.suggSales && this.suggSales.size) await this.rafraichirIndexSuggestions();
  }

  // Une note modifiée ne salit qu'elle-même. Auparavant le moindre
  // enregistrement jetait l'index entier : 1344 notes relues, et 29 Mo de
  // cache d'embeddings relus puis réécrits, à chaque fois.
  marquerNoteSale(file) {
    if (!file || !file.path || !this.suggEntrees) return;
    (this.suggSales = this.suggSales || new Set()).add(file.path);
  }

  async rafraichirIndexSuggestions() {
    const sales = [...(this.suggSales || [])];
    this.suggSales = new Set();
    if (!sales.length) return;
    const parPath = new Map((this.suggEntrees || []).map((e) => [e.path, e]));
    const candidats = new Set(this.fichiersCandidatsSuggestions().map((f) => f.path));
    for (const chemin of sales) {
      const f = this.app.vault.getAbstractFileByPath(chemin);
      if (!f || !f.basename || !candidats.has(chemin)) { parPath.delete(chemin); continue; }
      const texte = await this.texteIndexable(f);
      if (!texte.trim()) { parPath.delete(chemin); continue; }
      parPath.set(chemin, { path: chemin, basename: f.basename, titre: this.titreLisibleFichier(f), texte, hash: hacherTexte(texte) });
    }
    this.suggEntrees = [...parPath.values()];
    this.recomposerIndexLexical();
    if (this.moteurSemantiqueDemande()) await this.construireIndexSemantique(this.suggEntrees);
    else this.suggIndexSem = null;
  }

  invaliderIndexSuggestions() {
    this.suggIndex = null;
    this.suggIndexSem = null;
    this.suggEntrees = null;
    this.suggSales = null;
  }

  /* ---- Embeddings locaux via Ollama (gratuit, hors-ligne) ---- */

  cheminCacheEmbeddings() {
    return this.manifest.dir + '/cache-embeddings.json';
  }

  // Le cache des embeddings pèse 29 Mo. Il vit désormais en mémoire pour toute
  // la session : le relire et le réécrire à chaque mise à jour de l'index
  // coûtait cher, et faisait repartir OneDrive pour rien.
  async assurerCacheEmbeddings(modele) {
    if (this.suggEmb && this.suggEmbModele === modele) return this.suggEmb;
    let entrees = {};
    try {
      const chemin = this.cheminCacheEmbeddings();
      if (await this.app.vault.adapter.exists(chemin)) {
        const j = JSON.parse(await this.app.vault.adapter.read(chemin));
        if (j && j.model === modele && j.entries) entrees = j.entries;
      }
    } catch (e) { /* cache illisible : on repart de zéro */ }
    this.suggEmb = entrees;
    this.suggEmbModele = modele;
    this.suggEmbSale = false;
    this.suggVecs = new Map();
    return entrees;
  }

  // Écriture espacée : au plus une fois toutes les cinq minutes, et à la
  // fermeture. Les 29 Mo n'ont pas à repartir sur le disque à chaque frappe.
  planifierSauvegardeEmbeddings() {
    this.suggEmbSale = true;
    if (this.suggEmbMinuteur) return;
    this.suggEmbMinuteur = setTimeout(() => {
      this.suggEmbMinuteur = null;
      this.sauverCacheEmbeddings().catch(() => { /* fermeture en cours */ });
    }, 5 * 60 * 1000);
  }

  async sauverCacheEmbeddings() {
    if (!this.suggEmbSale || !this.suggEmb) return;
    this.suggEmbSale = false;
    try {
      await this.app.vault.adapter.write(this.cheminCacheEmbeddings(),
        JSON.stringify({ model: this.suggEmbModele, entries: this.suggEmb }));
    } catch (e) { console.debug('[Ariane] sauvegarde cache embeddings', e); }
  }

  // Encode une liste de textes via Ollama. Renvoie null si Ollama est
  // indisponible (le moteur bascule alors sur le lexical).
  /* --- Service d'inférence local : Ollama ou LM Studio --------------- */

  fournisseurLmStudio() {
    return (this.settings.suggFournisseur || 'ollama') === 'lmstudio';
  }

  // Le drapeau est passé explicitement : deux réglages coexistent, celui des
  // suggestions et celui du découpage bibliographique, et ils peuvent différer.
  urlInference(lm) {
    const estLm = lm === undefined ? this.fournisseurLmStudio() : !!lm;
    return estLm
      ? (this.settings.suggLmStudioUrl || 'http://localhost:1234').replace(/\/+$/, '')
      : (this.settings.suggOllamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
  }

  // Encode une liste de textes. LM Studio parle l'API d'OpenAI — /v1/embeddings,
  // réponse dans « data[].embedding » — là où Ollama a la sienne. Rend null si
  // le service est indisponible : le moteur bascule alors sur le lexical.
  async encoderTextes(textes) {
    const lm = this.fournisseurLmStudio();
    try {
      const url = this.urlInference() + (lm ? '/v1/embeddings' : '/api/embed');
      const rep = await obsidian.requestUrl({
        url, method: 'POST', throw: false,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.settings.suggModeleEmbed || 'bge-m3', input: textes }),
      });
      if (rep && rep.status >= 200 && rep.status < 300) {
        const j = rep.json !== undefined ? rep.json : JSON.parse(rep.text);
        if (lm && Array.isArray(j.data)) return j.data.map((d) => d.embedding);
        if (Array.isArray(j.embeddings)) return j.embeddings;
        if (Array.isArray(j.embedding)) return [j.embedding];
      }
    } catch (e) {
      console.debug('[Ariane] encodage indisponible', e);
    }
    return null;
  }

  // Une génération censée rendre du JSON. Bornée dans les deux dialectes :
  // « num_predict » pour Ollama, « max_tokens » pour LM Studio. Sans cette
  // borne, un modèle qui ne referme pas son objet tourne jusqu'à saturer son
  // contexte — plusieurs minutes à pleine charge.
  async genererJson(prompt, jetons) {
    return this.genererJsonAvec(prompt, jetons || this.settings.suggRerankJetons || 400,
      this.fournisseurLmStudio(), this.settings.suggModeleLLM || 'llama3.2');
  }

  async genererJsonAvec(prompt, max, lm, modele) {
    try {
      const url = this.urlInference(lm) + (lm ? '/v1/chat/completions' : '/api/generate');
      const corps = lm
        // LM Studio refuse « response_format: json_object » — il n'accepte que
        // « json_schema » ou « text », et cela varie d'une version à l'autre.
        // On s'en passe : la consigne est dans l'invite, et l'analyse de la
        // réponse est déjà tolérante. « max_tokens » suffit à borner.
        ? { model: modele, messages: [{ role: 'user', content: prompt }],
            temperature: 0, max_tokens: max }
        : { model: modele, prompt, stream: false, format: 'json', keep_alive: '2m',
            options: { temperature: 0, num_predict: max } };
      const rep = await obsidian.requestUrl({
        url, method: 'POST', throw: false,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      if (!rep || rep.status < 200 || rep.status >= 300) return null;
      const j = rep.json !== undefined ? rep.json : JSON.parse(rep.text);
      if (lm) {
        const c = j && j.choices && j.choices[0];
        return c && c.message ? String(c.message.content || '') : null;
      }
      return j && typeof j.response === 'string' ? j.response : (rep.text || null);
    } catch (e) {
      console.debug('[Ariane] génération indisponible', e);
      return null;
    }
  }

  // Le découpage bibliographique passe par son propre moteur. Les quatre
  // dialectes se rejoignent ici, pour qu'il n'existe qu'un seul endroit où
  // borner la génération et rattraper les erreurs.
  async genererJsonRefs(prompt, jetons) {
    return this.genererAvecFournisseur(prompt, jetons || 300,
      this.settings.refsFournisseur || 'ollama', this.settings.refsModele || 'llama3.2');
  }



  async genererAvecFournisseur(prompt, max, f, modele) {
    if (f === 'mistral') return this.genererMistral(prompt, max, modele);
    if (f === 'claude') return this.genererClaude(prompt, max);
    return this.genererJsonAvec(prompt, max, f === 'lmstudio', modele);
  }

  async genererMistral(prompt, max, modele) {
    const cle = (this.settings.refsCleMistral || '').trim();
    if (!cle) { new obsidian.Notice(tr('Clé Mistral absente des réglages.')); return null; }
    try {
      const rep = await obsidian.requestUrl({
        url: 'https://api.mistral.ai/v1/chat/completions',
        method: 'POST', throw: false,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cle },
        body: JSON.stringify({
          model: modele || this.settings.refsModele || 'mistral-small-latest',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0, max_tokens: max,
          response_format: { type: 'json_object' },
        }),
      });
      if (!rep || rep.status < 200 || rep.status >= 300) return null;
      const j = rep.json !== undefined ? rep.json : JSON.parse(rep.text);
      const c = j && j.choices && j.choices[0];
      return c && c.message ? String(c.message.content || '') : null;
    } catch (e) {
      console.debug('[Ariane] Mistral indisponible', e);
      return null;
    }
  }

  // Le CLI de Claude ne demande ni clé ni serveur. On le borne dans le temps :
  // un processus qui ne rend pas la main bloquerait tout le lot.
  genererClaude(prompt, max) {
    const bin = (this.settings.refsCheminClaude || 'claude').trim() || 'claude';
    return new Promise((resoudre) => {
      let fini = false;
      const env = Object.assign({}, process.env, {
        PATH: process.env.HOME + '/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:'
          + (process.env.PATH || ''),
      });
      const enfant = require('child_process').execFile(
        bin, ['-p', prompt], { env, timeout: 60000, maxBuffer: 1 << 20 },
        (err, sortie) => {
          if (fini) return;
          fini = true;
          resoudre(err ? null : String(sortie || '').trim());
        });
      // Sans cela le CLI attend trois secondes une entrée standard qui ne
      // viendra jamais, à chaque appel.
      try { if (enfant.stdin) enfant.stdin.end(); } catch (e) { /* déjà fermée */ }
      setTimeout(() => { if (!fini) { try { enfant.kill('SIGKILL'); } catch (e) { /* déjà mort */ } } }, 61000);
    });
  }

  async testerEncodage() {
    const v = await this.encoderTextes(['test']);
    return !!(v && v[0] && v[0].length);
  }

  async testerLLM() {
    const t = await this.genererJson('Réponds uniquement : {"ok":true}', 32);
    return !!t;
  }

  // Construit l'index sémantique en réutilisant le cache disque : seules les
  // notes nouvelles ou modifiées sont réencodées.
  async construireIndexSemantique(entrees) {
    const modele = this.settings.suggModeleEmbed || 'bge-m3';
    const cache = await this.assurerCacheEmbeddings(modele);
    const aEncoder = entrees.filter((e) => {
      const c = cache[e.path];
      return !(c && c.hash === e.hash && Array.isArray(c.vec));
    });
    const total = aEncoder.length;
    const vue = this.vueSuggestions();
    let notice = null;
    const rapporter = (fait) => {
      const msg = 'Indexation sémantique : ' + fait + ' / ' + total + ' notes…';
      if (notice) notice.setMessage(msg);
      if (vue && vue.marquerIndexation) vue.marquerIndexation(fait, total);
    };
    // Popup uniquement pour un gros index (premier build / reconstruction).
    // Les petites réindexations (note éditée) restent silencieuses.
    if (total > 30) notice = new obsidian.Notice(tr('Indexation sémantique…'), 0);
    if (total > 0) rapporter(0);
    const lot = 24;
    let fait = 0;
    for (let i = 0; i < aEncoder.length; i += lot) {
      const tranche = aEncoder.slice(i, i + lot);
      const vecs = await this.encoderTextes(tranche.map((e) => e.texte));
      if (!vecs) { // Ollama indisponible -> repli lexical
        if (notice) notice.hide();
        if (vue && vue.marquerIndexation) vue.marquerIndexation(-1, total);
        this.suggIndexSem = null;
        return;
      }
      tranche.forEach((e, k) => {
        const v = normaliserVecteur(vecs[k]);
        cache[e.path] = { hash: e.hash, vec: Array.from(v) };
        this.suggVecs.set(e.path, { hash: e.hash, vec: v });
      });
      fait += tranche.length;
      rapporter(fait);
    }
    if (notice) notice.hide();
    if (vue && vue.marquerIndexation) vue.marquerIndexation(total, total, true);

    // Les vecteurs restent en Float32Array d'une mise à jour à l'autre : les
    // reconvertir depuis le JSON coûtait 1,4 million de conversions à chaque
    // reconstruction, pour un résultat identique.
    const docs = [];
    for (const e of entrees) {
      let v = this.suggVecs.get(e.path);
      if (!v || v.hash !== e.hash) {
        const c = cache[e.path];
        if (!c || !Array.isArray(c.vec)) continue;
        v = { hash: c.hash, vec: Float32Array.from(c.vec) };
        this.suggVecs.set(e.path, v);
      }
      docs.push({ path: e.path, basename: e.basename, titre: e.titre, hash: e.hash, vec: v.vec });
    }
    this.suggIndexSem = { model: modele, docs };
    if (total > 0) this.planifierSauvegardeEmbeddings();
  }

  async reclasserLLM(noteTexte, candidats) {
    // Second garde-fou, côté greffon : même borné, un modèle peut être lent.
    // On rend la main au bout du délai réglé plutôt que d'attendre sans fin.
    const secondes = this.settings.suggRerankDelaiSec || 45;
    return Promise.race([
      this._reclasserLLM(noteTexte, candidats),
      new Promise((r) => setTimeout(() => r(null), secondes * 1000)),
    ]);
  }

  async _reclasserLLM(noteTexte, candidats) {
    try {
      const liste = candidats.map((c) => '- [' + c.basename + '] ' + c.titre).join('\n');
      const avecJustif = this.settings.suggRerankJustif !== false;
      const formatJson = avecJustif
        ? '{"resultats":[{"basename":"<identifiant>","raison":"courte justification en français"}]}'
        : '{"resultats":["<identifiant>", "..."]}';
      const prompt =
        'Tu aides un chercheur qui rédige une note. Voici son texte en cours :\n"""\n'
        + noteTexte.slice(0, 1800)
        + '\n"""\n\nParmi les notes candidates ci-dessous, sélectionne et classe les plus pertinentes pour enrichir sa rédaction (de la plus à la moins pertinente). N\'invente aucune note ; recopie exactement les identifiants entre crochets.\n\n'
        + liste
        + '\n\nRéponds UNIQUEMENT en JSON : ' + formatJson + ', au plus '
        + (this.settings.suggK || 8) + ' éléments.';
      const brut = await this.genererJson(prompt);
      if (!brut) return null;
      console.debug('[Ariane] LLM brut', brut);
      // Analyse tolérante : JSON direct, sinon premier bloc { } ou [ ] trouvé.
      let obj = null;
      try { obj = JSON.parse(brut); } catch (e) {
        const m = brut.match(/[\[{][\s\S]*[\]}]/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) { obj = null; } }
      }
      if (!obj) return null;
      // Trouve le tableau de résultats quelle que soit la clé.
      let arr = null;
      if (Array.isArray(obj)) arr = obj;
      else if (Array.isArray(obj.resultats)) arr = obj.resultats;
      else if (Array.isArray(obj.results)) arr = obj.results;
      else if (Array.isArray(obj.suggestions)) arr = obj.suggestions;
      else for (const v of Object.values(obj)) { if (Array.isArray(v)) { arr = v; break; } }
      if (!arr || !arr.length) return null;
      // Appariement tolérant (crochets, .md, casse) sur clé puis titre.
      const norm = (x) => String(x || '').trim().replace(/^\[+|\]+$/g, '').replace(/\.md$/i, '').trim().toLowerCase();
      const parBase = new Map();
      const parTitre = new Map();
      for (const c of candidats) { parBase.set(norm(c.basename), c); parTitre.set(norm(c.titre), c); }
      const ordonne = [];
      for (const r of arr) {
        let id = '', raison = '';
        if (typeof r === 'string') id = r;
        else if (r && typeof r === 'object') {
          id = r.basename || r.id || r.identifiant || r.nom || r.name || r.cle || r.key || r.titre || r.title || '';
          raison = r.raison || r.reason || r.justification || r.pourquoi || '';
        }
        let c = parBase.get(norm(id)) || parTitre.get(norm(id));
        if (c && !ordonne.includes(c)) { c.raison = String(raison || '').trim(); ordonne.push(c); }
      }
      return ordonne.length ? ordonne : null;
    } catch (e) {
      console.debug('[Ariane] reclassement LLM échoué', e);
      return null;
    }
  }

  // Basenames déjà liés dans un contenu (pour ne pas les re-proposer).
  liensExistants(contenu) {
    const set = new Set();
    const re = /\[\[([^\]|#\n]+)/g;
    let m;
    while ((m = re.exec(contenu)) !== null) set.add(cleDeLien(m[1]));
    return set;
  }

  // Meilleures suggestions pour une note : combine score lexical et sémantique
  // selon le moteur choisi. Renvoie { liste, statut }.
  async suggestionsPour(cheminActif, contenu, dejaLies) {
    if (!this.suggIndex || !this.suggIndex.docs.length) return { liste: [], statut: 'vide' };
    const moteur = this.settings.suggMoteur || 'hybride';
    // Score lexical (toujours calculé)
    const { vec, norme } = vecteurTfIdf(frequenceTermes(tokeniser(contenu)), this.suggIndex.idf);
    const lex = new Map();
    for (const d of this.suggIndex.docs) lex.set(d.path, cosinusTfIdf(vec, norme, d.vec, d.norme));
    // Score sémantique (si disponible)
    let sem = null;
    let statut = 'lexical';
    if (moteur !== 'lexical' && this.suggIndexSem && this.suggIndexSem.docs.length) {
      // La requête change peu d'un recalcul à l'autre : revenir sur une note
      // déjà vue ne doit plus coûter 600 ms d'Ollama.
      const extrait = contenu.slice(0, 4000);
      const empreinte = hacherTexte(extrait);
      this.suggReqCache = this.suggReqCache || new Map();
      let q = this.suggReqCache.get(empreinte);
      if (!q) {
        const qv = await this.encoderTextes([extrait]);
        if (qv && qv[0]) {
          q = normaliserVecteur(qv[0]);
          if (this.suggReqCache.size > 24) this.suggReqCache.clear();
          this.suggReqCache.set(empreinte, q);
        }
      }
      if (q) {
        sem = new Map();
        for (const d of this.suggIndexSem.docs) sem.set(d.path, cosinusVecteurs(q, d.vec));
        statut = moteur === 'semantique' ? 'sémantique' : 'hybride';
      } else {
        statut = 'lexical (repli)';
      }
    }
    const w = typeof this.settings.suggPoidsSemantique === 'number' ? this.settings.suggPoidsSemantique : 0.7;
    const seuil = typeof this.settings.suggSeuil === 'number' ? this.settings.suggSeuil : 0.18;
    const res = [];
    for (const d of this.suggIndex.docs) {
      if (d.path === cheminActif) continue;
      if (dejaLies && dejaLies.has(d.basename)) continue;
      const l = lex.get(d.path) || 0;
      const s = sem ? (sem.get(d.path) || 0) : 0;
      let score;
      if (!sem) score = l;
      else if (moteur === 'semantique') score = s;
      else score = w * s + (1 - w) * l;
      if (score < seuil) continue;
      const dossier = this.dossierCandidatDe(d.path);
      if (!this.dossierRetenu(dossier)) continue;   // filtre du panneau
      res.push({ path: d.path, basename: d.basename, titre: d.titre, score, dossier });
    }
    res.sort((a, b) => b.score - a.score);
    return { liste: res.slice(0, this.settings.suggK || 8), statut };
  }

  vueSuggestions() {
    // Obsidian 1.7 diffère l'instanciation des vues : une feuille peut exister
    // sans que sa vue le soit encore. On ne renvoie qu'une vue réellement prête.
    const feuilles = this.app.workspace.getLeavesOfType('zfa-suggestions');
    for (const f of feuilles) {
      const v = f ? f.view : null;
      if (v && typeof v.rendre === 'function') return v;
    }
    return null;
  }

  // Recalcule et pousse les suggestions vers la vue, si ouverte.
  // forcerRerank : autorise le reclassement LLM (changement de note / manuel).
  // Une vue existe même repliée dans la barre latérale ou cachée derrière un
  // autre onglet. Tant qu'elle n'est pas RÉELLEMENT affichée, tout calcul est
  // perdu — et c'est ce qui faisait tourner Ollama pour rien. Le test porte sur
  // les dimensions du conteneur, ce qui vaut aussi en fenêtre détachée.
  vueSuggestionsVisible() {
    const v = this.vueSuggestions();
    const el = v ? v.containerEl : null;
    if (!el) return null;
    return (el.offsetWidth > 0 || el.offsetHeight > 0) ? v : null;
  }

  async majSuggestions(forcerRerank, ignorerVisibilite) {
    const vue = ignorerVisibilite ? this.vueSuggestions() : this.vueSuggestionsVisible();
    if (!vue) return;
    if (!this.settings.suggActif) { vue.rendre([], null, 'inactif'); return; }
    await this.assurerIndexSuggestions();
    const anc = this.suggAncrage;
    const file = this.app.workspace.getActiveFile();
    let cheminActif = '', requete = null, dejaLies = new Set();
    if (anc) {
      cheminActif = anc.sourcePath || (file ? file.path : '');
      requete = anc.texte;
    } else {
      if (!file || file.extension !== 'md') { if (vue.montrerAncrage) vue.montrerAncrage(null); vue.rendre([], null); return; }
      cheminActif = file.path;
      try { requete = await this.app.vault.cachedRead(file); } catch (e) { requete = ''; }
      dejaLies = this.liensExistants(requete);
    }
    if (vue.montrerAncrage) vue.montrerAncrage(anc ? anc.texte : null);
    const etiq = anc ? { basename: 'Argument sélectionné' } : file;
    const jeton = (this._suggJeton = (this._suggJeton || 0) + 1);
    const { liste, statut } = await this.suggestionsPour(cheminActif, requete, dejaLies);
    if (jeton !== this._suggJeton) return;
    vue.rendre(liste, etiq, (anc ? 'argument · ' : '') + statut);
    const reclasser = (forcerRerank || this.settings.suggRerankAuto === true)
      && this.settings.suggRerank && liste.length
      && (statut === 'sémantique' || statut === 'hybride');
    if (reclasser) {
      vue.marquerReclassement(true);
      const topN = liste.slice(0, this.settings.suggRerankTopN || 12).map((x) => Object.assign({}, x));
      const reclasse = await this.reclasserLLM(requete, topN);
      if (jeton !== this._suggJeton) return;
      vue.marquerReclassement(false);
      if (reclasse && reclasse.length) vue.rendre(reclasse, etiq, (anc ? 'argument · ' : '') + statut + ' + LLM');
      else vue.rendre(liste, etiq, (anc ? 'argument · ' : '') + statut + ' · LLM indisponible');
    }
  }

  // Suggestions ciblées sur un passage sélectionné (clic droit).
  async suggestionsPourArgument(texte) {
    if (!texte || !texte.trim()) return;
    await this.assurerIndexSuggestions();
    const file = this.app.workspace.getActiveFile();
    const cheminActif = file ? file.path : '';
    if ((this.settings.suggArgAffichage || 'panneau') === 'flottant') {
      const { liste } = await this.suggestionsPour(cheminActif, texte, new Set());
      this.afficherFenetreArgument(texte, liste);
    } else {
      this.suggAncrage = { texte, sourcePath: cheminActif };
      await this.ouvrirVueSuggestions();
      this.majSuggestions(true, true);
    }
  }

  libererAncrage() { this.suggAncrage = null; this.majSuggestions(false, true); }

  // Un item de suggestion (cliquable, glissable, aperçu au survol).
  construireItemSugg(container, sug, hoverParent) {
    const styleDe = (d) => this.styleDuDossier(d);
    const item = container.createDiv({ cls: 'zfa-sugg-item' });
    item.setAttribute('draggable', 'true');
    const style = sug.dossier ? styleDe(sug.dossier) : null;
    if (style && style.couleur) { item.addClass('zfa-sugg-colore'); item.style.setProperty('--zfa-sugg-couleur', style.couleur); }
    const tete = item.createDiv({ cls: 'zfa-sugg-tete' });
    if (style && style.icone) { const ic = tete.createSpan({ cls: 'zfa-sugg-icone' }); obsidian.setIcon(ic, style.icone); if (style.couleur) ic.style.color = style.couleur; }
    tete.createSpan({ cls: 'zfa-sugg-lien', text: sug.titre });
    if (sug.raison) item.createDiv({ cls: 'zfa-sugg-raison', text: sug.raison });
    const pct = typeof sug.score === 'number' ? Math.round(sug.score * 100) + '%  ·  ' : '';
    item.createDiv({ cls: 'zfa-sugg-meta', text: pct + sug.basename });
    item.addEventListener('click', () => this.app.workspace.openLinkText(sug.basename, '', false));
    item.addEventListener('mouseover', (event) => this.app.workspace.trigger('hover-link', { event, source: 'zfa-suggestions', hoverParent: hoverParent || this, targetEl: item, linktext: sug.path || sug.basename, sourcePath: '' }));
    item.addEventListener('dragstart', (e) => { if (e.dataTransfer) { e.dataTransfer.setData('text/plain', '[[' + sug.basename + ']]'); e.dataTransfer.effectAllowed = 'copy'; } });
    return item;
  }

  afficherFenetreArgument(texte, suggestions) {
    this.fermerFenetreArgument();
    const el = document.createElement('div');
    el.className = 'zfa-argfen';
    el.style.top = '90px'; el.style.right = '40px';
    const header = el.createDiv({ cls: 'zfa-argfen-header' });
    header.createSpan({ cls: 'zfa-argfen-titre', text: tr("Suggestions pour l'argument") });
    const x = header.createSpan({ cls: 'zfa-argfen-x', text: tr('✕') });
    x.onmousedown = (e) => e.stopPropagation();
    x.onclick = () => this.fermerFenetreArgument();
    const snip = String(texte).replace(/\s+/g, ' ').trim();
    el.createDiv({ cls: 'zfa-argfen-arg', text: snip.slice(0, 160) + (snip.length > 160 ? '…' : '') });
    const liste = el.createDiv({ cls: 'zfa-argfen-liste' });
    if (!suggestions || !suggestions.length) liste.createDiv({ cls: 'zfa-sugg-vide', text: tr('Aucune suggestion pertinente.') });
    else for (const sug of suggestions) this.construireItemSugg(liste, sug, this);
    this.rendreDeplacable(el, header);
    document.body.appendChild(el);
    this.argFenetreEl = el;
  }

  fermerFenetreArgument() { if (this.argFenetreEl) { this.argFenetreEl.remove(); this.argFenetreEl = null; } }

  async ouvrirVueSuggestions() {
    let feuilles = this.app.workspace.getLeavesOfType('zfa-suggestions');
    if (!feuilles.length) {
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: 'zfa-suggestions', active: true });
      feuilles = this.app.workspace.getLeavesOfType('zfa-suggestions');
    }
    if (feuilles.length) this.app.workspace.revealLeaf(feuilles[0]);
    this.majSuggestions();
  }

  /* ------------------- Fusion des doublons d'auteurs -------------------- */

  baseSansConflit(n) {
    return n.replace(/\s*-?\s*MacBook Pro de .*/i, '')
            .replace(/\s*\(conflicted copy[^)]*\)/i, '')
            .replace(/\s+\(\d+\)$/, '').trim();
  }

  async detecterDoublonsAuteurs() {
    const dossier = (this.settings.dossierAuteurs || 'Auteurs').replace(/\/+$/, '');
    const noms = this.app.vault.getMarkdownFiles()
      .filter((f) => f.path.startsWith(dossier + '/'))
      .map((f) => f.basename);
    const ensemble = new Set(noms);
    const conflits = [], propres = [];
    for (const n of noms) {
      const base = this.baseSansConflit(n);
      if (base && base !== n && ensemble.has(base)) conflits.push({ nom: n, base });
      else propres.push(n);
    }
    return { conflits, clusters: clustersDoublons(propres), dossier };
  }

  async ouvrirFusionAuteurs() {
    const { conflits, clusters, dossier } = await this.detecterDoublonsAuteurs();
    if (!conflits.length && !clusters.length) { new obsidian.Notice(tr("Aucun doublon d'auteur détecté.")); return; }
    new FusionAuteursModal(this.app, this, conflits, clusters, dossier).open();
  }

  async supprimerConflitsAuteurs(conflits, dossier) {
    for (const c of conflits) {
      const f = this.app.vault.getAbstractFileByPath(dossier + '/' + c.nom + '.md');
      if (f instanceof obsidian.TFile) await this.app.fileManager.trashFile(f);
    }
  }

  async fusionnerCluster(canon, variantes, dossier) {
    const fCanon = this.app.vault.getAbstractFileByPath(dossier + '/' + canon + '.md');
    if (fCanon instanceof obsidian.TFile) {
      await this.app.fileManager.processFrontMatter(fCanon, (fm) => {
        const al = new Set(Array.isArray(fm.aliases) ? fm.aliases : (fm.aliases ? [fm.aliases] : []));
        for (const v of variantes) al.add(v);
        fm.aliases = [...al];
      });
    }
    // Redirige les liens partout dans le coffre.
    const repl = [];
    for (const v of variantes) { repl.push(['[[' + v + ']]', '[[' + canon + ']]']); repl.push(['[[' + v + '|', '[[' + canon + '|']); }
    for (const f of this.app.vault.getMarkdownFiles()) {
      let contenu = await this.app.vault.read(f); const orig = contenu;
      for (const [a, b] of repl) if (contenu.includes(a)) contenu = contenu.split(a).join(b);
      if (contenu !== orig) await this.app.vault.modify(f, contenu);
    }
    // Supprime les variantes.
    for (const v of variantes) {
      const f = this.app.vault.getAbstractFileByPath(dossier + '/' + v + '.md');
      if (f instanceof obsidian.TFile) await this.app.fileManager.trashFile(f);
    }
  }

  /* ----------------------- Module Cartes (Canvas) ------------------------ */

  vocabCartes() {
    return {
      relations: this.settings.cartesRelations || [],
      types: this.settings.cartesTypesBlocs || [],
      strict: !!this.settings.cartesStrict,
    };
  }

  // Fichier de schéma draw.io actif (.drawio.svg ou .drawio).
  estSchemaDrawio(f) {
    return !!f && (/\.drawio\.svg$/i.test(f.path) || f.extension === 'drawio');
  }

  fichierSchemaActif() {
    const f = this.app.workspace.getActiveFile();
    return this.estSchemaDrawio(f) ? f : null;
  }

  // Graphe d'un schéma draw.io : toutes les pages fusionnées.
  async grapheSchema(file) {
    let contenu = '';
    try { contenu = await this.app.vault.read(file); } catch (e) { return { nodes: [], edges: [] }; }
    const pages = pagesDepuisDrawio(contenu);
    const nodes = [], edges = [];
    pages.forEach((pg, i) => {
      const pref = pages.length > 1 ? 'p' + i + ':' : '';
      for (const n of pg.graphe.nodes) nodes.push(Object.assign({}, n, { id: pref + n.id, page: pg.nom }));
      for (const e of pg.graphe.edges) edges.push(Object.assign({}, e, { id: pref + e.id, fromNode: pref + e.fromNode, toNode: pref + e.toNode, page: pg.nom }));
    });
    // Étiquettes implicites : voir propagerEtiquettes.
    const brut = { nodes, edges, pages: pages.map((x) => x.nom) };
    return this.settings.schemaPropagerEtiquettes === false ? brut : propagerEtiquettes(brut);
  }

  async validerCarte() {
    const schema = this.fichierSchemaActif();
    if (!schema) { new obsidian.Notice(tr('Ouvrez un schéma draw.io (.drawio.svg).')); return; }
    const g = await this.grapheSchema(schema);
    new RapportCarteModal(this.app, schema.basename, analyserCarte(g, this.vocabCartes(), {})).open();
  }

  /* ------------------------- Verrou d'édition --------------------------- */

  // Les notes portant « locked: true » deviennent non modifiables. Le verrou
  // est purement visuel (contenteditable) : le fichier reste accessible aux
  // outils, notamment à la synchronisation des schémas.
  installerVerrouLecture() {
    const appliquer = () => this.appliquerVerrouLecture();
    this.registerEvent(this.app.workspace.on('file-open', appliquer));
    this.registerEvent(this.app.workspace.on('active-leaf-change', appliquer));
    this.registerEvent(this.app.workspace.on('layout-change', appliquer));
    this.registerEvent(this.app.metadataCache.on('resolved', appliquer));
    this.app.workspace.onLayoutReady(appliquer);
  }

  appliquerVerrouLecture() {
    if (this.settings.verrouLecture === false) return;
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const vue = leaf ? leaf.view : null;
      if (!vue || !vue.file || !vue.contentEl) continue;
      const fm = (this.app.metadataCache.getFileCache(vue.file) || {}).frontmatter;
      const verrou = !!(fm && (fm.locked === true || fm['zotflow-locked'] === true));
      const zone = vue.contentEl.querySelector('.cm-content');
      if (zone) zone.setAttribute('contenteditable', verrou ? 'false' : 'true');
      vue.contentEl.toggleClass('zfa-verrouillee', verrou);
    }
  }

  // Note associée à un schéma : d'abord par la propriété « graphique »,
  // sinon par la référence (nom de note = préfixe du nom du schéma).
  noteDeSchema(file) {
    const base = file.basename.replace(/\.drawio$/i, '');
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (!fm || !fm.graphique) continue;
      const cible = String(fm.graphique).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
      if (cible === base + '.drawio.svg' || cible === base || cible === file.path) return f;
    }
    // À défaut, par la référence : « FS007 - Contingence » -> note « FS007 ».
    // Les schémas peuvent vivre dans un sous-dossier (ex. « Graphiques ») et
    // les notes dans le dossier parent : on élargit donc la recherche, du plus
    // proche au plus lointain.
    const sep = base.match(/^(.*?)\s+-\s+/);
    const reference = (sep ? sep[1] : base).trim();
    if (!reference) return null;

    const dossierSchema = file.parent ? file.parent.path : '';
    const dossierParent = file.parent && file.parent.parent ? file.parent.parent.path : '';
    const homonymes = this.app.vault.getMarkdownFiles().filter((f) => f.basename === reference);
    if (!homonymes.length) return null;

    const dans = (d) => homonymes.find((f) => (f.parent ? f.parent.path : '') === d);
    return dans(dossierSchema) || dans(dossierParent) || homonymes[0];
  }

  // Recopie l'extrait lisible du schéma dans sa note. Renvoie true si écrit.
  async synchroniserSchema(file, silencieux) {
    if (!this.estSchemaDrawio(file)) return false;
    const note = this.noteDeSchema(file);
    if (!note) {
      if (!silencieux) new obsidian.Notice(tr('Aucune note associée à « ') + file.basename + ' ».');
      return false;
    }
    const graphe = await this.grapheSchema(file);
    const base = file.basename.replace(/\.drawio$/i, '');
    const sep = base.match(/^.*?\s+-\s+(.*)$/);
    const extrait = extraitSchema(graphe, sep ? sep[1].trim() : base);
    const actuel = await this.app.vault.read(note);
    const nouveau = injecterExtrait(actuel, extrait);
    if (nouveau === actuel) return false;
    await this.ecrire(note.path, nouveau, note);
    if (!silencieux) new obsidian.Notice(tr('Note « ') + note.basename + ' » synchronisée.');
    return true;
  }

  async synchroniserTousSchemas() {
    const schemas = this.app.vault.getFiles().filter((f) => this.estSchemaDrawio(f));
    if (!schemas.length) { new obsidian.Notice(tr('Aucun schéma draw.io trouvé.')); return; }
    const notice = new obsidian.Notice(tr('Synchronisation des schémas…'), 0);
    let majes = 0, sansNote = 0;
    try {
      for (const f of schemas) {
        if (!this.noteDeSchema(f)) { sansNote++; continue; }
        if (await this.synchroniserSchema(f, true)) majes++;
      }
    } finally { notice.hide(); }
    new obsidian.Notice(tr('Schémas : ') + majes + ' note(s) mise(s) à jour sur ' + schemas.length
      + (sansNote ? ', ' + sansNote + ' sans note associée.' : '.')
    );
  }

  // Agrège toutes les cartes du coffre en un graphe unique.
  async indexerCartes() {
    const vocab = this.vocabCartes();
    const noeuds = new Map();  // texte -> { texte, type, cartes:Set }
    const liens = [];
    for (const f of this.app.vault.getFiles()) {
      if (!this.estSchemaDrawio(f)) continue;
      const data = await this.grapheSchema(f);
      const a = analyserCarte(data, vocab, { blocs: {} });
      const parId = {};
      for (const b of a.blocs) {
        parId[b.id] = b.texte;
        if (!b.texte) continue;
        if (!noeuds.has(b.texte)) noeuds.set(b.texte, { texte: b.texte, type: b.type, cartes: new Set() });
        const n = noeuds.get(b.texte);
        n.cartes.add(f.basename);
        if (!n.type && b.type) n.type = b.type;
      }
      for (const l of a.liens) {
        if (!l.deTexte || !l.versTexte) continue;
        liens.push({ de: l.deTexte, vers: l.versTexte, etiquette: l.etiquette, relation: l.relation, carte: f.basename });
      }
    }
    return { noeuds: [...noeuds.values()], liens };
  }

  async interrogerGraphe() {
    const notice = new obsidian.Notice(tr('Indexation des cartes…'), 0);
    let g;
    try { g = await this.indexerCartes(); } finally { notice.hide(); }
    if (!g.noeuds.length) { new obsidian.Notice(tr('Aucun schéma draw.io trouvé (.drawio.svg).')); return; }
    const choix = g.noeuds
      .sort((a, b) => a.texte.localeCompare(b.texte))
      .map((n) => ({ nom: n.texte + (n.cartes.size > 1 ? '  (' + n.cartes.size + ' cartes)' : ''), valeur: n.texte }));
    new ChoixListeModal(this.app, 'Concept (' + g.noeuds.length + ')', choix, (c) => {
      const sortants = g.liens.filter((l) => l.de === c.valeur);
      const entrants = g.liens.filter((l) => l.vers === c.valeur);
      new VoisinageModal(this.app, c.valeur, sortants, entrants, this).open();
    }).open();
  }

  /* ------------- Export Word avec citations Zotero vivantes -------------- */

  cheminAbsoluVault(rel) {
    const ad = this.app.vault.adapter;
    if (typeof ad.getFullPath === 'function') return ad.getFullPath(rel);
    return require('path').join(ad.basePath || '', rel);
  }

  cheminScriptPandoc(nom) {
    return require('path').join(this.cheminAbsoluVault(this.manifest.dir), 'pandoc', nom);
  }

  // Applique les styles du modèle Word en remappant les identifiants pandoc.
  async remapperStyles(outPath, env) {
    const map = this.settings.exportMapStyles || {};
    if (!Object.values(map).some((v) => v && String(v).trim())) return;
    const m = Object.assign({}, map);
    if (m.BodyText) m.FirstParagraph = m.BodyText;
    const script = this.cheminScriptPandoc('remap-styles.py');
    try {
      await new Promise((resolve, reject) => {
        require('child_process').execFile('python3', [script, '--remap', outPath, JSON.stringify(m)],
          { env: env || process.env },
          (e, so, se) => e ? reject(new Error(String(se || e.message || e).slice(0, 300))) : resolve());
      });
    } catch (e) {
      new obsidian.Notice(tr('Styles du modèle non appliqués : ') + (e && e.message ? e.message : e));
      console.error('[Ariane] remap styles', e);
    }
  }

  // Liste les styles du modèle Word dans une fenêtre.
  async listerStylesModele() {
    const modele = this.settings.exportModeleWord;
    if (!modele || !require('fs').existsSync(modele)) { new obsidian.Notice(tr('Renseignez un modèle Word valide dans les réglages.')); return; }
    const script = this.cheminScriptPandoc('remap-styles.py');
    const env = Object.assign({}, process.env, { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '') });
    try {
      const out = await new Promise((resolve, reject) => {
        require('child_process').execFile('python3', [script, '--list', modele], { env, maxBuffer: 8 * 1024 * 1024 },
          (e, so, se) => e ? reject(new Error(String(se || e.message || e).slice(0, 300))) : resolve(so));
      });
      new StylesModeleModal(this.app, JSON.parse(out)).open();
    } catch (e) {
      new obsidian.Notice(tr('Lecture des styles — échec : ') + (e && e.message ? e.message : e));
    }
  }

  citekeyDepuisLien(v) {
    return String(v || '').replace(/^\[\[/, '').replace(/\]\]$/, '').replace(/\|.*$/, '').replace(/#.*/, '').replace(/^@/, '').trim();
  }

  cibleDepuisLien(v) {
    return String(v || '').replace(/^\[\[/, '').replace(/\]\]$/, '').replace(/\|.*$/, '').replace(/#.*/, '').trim();
  }

  // Résout un lien [[annotation]] en un tableau d'entrées de citation Pandoc,
  // ou null. Gère l'apparat « cité dans » pour les références citées distinctes
  // de la source et absentes de Zotero.
  resoudreCitation(cible, sourcePath, ctx) {
    ctx = ctx || {};
    const dest = this.app.metadataCache.getFirstLinkpathDest(cible, sourcePath || '');
    if (!dest) return null;
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    const src = fm['zotflow-source'];
    if (!src) {
      if (fm.citationKey) return ['@' + String(fm.citationKey).trim()];
      if (dest.basename.startsWith('@')) return ['@' + dest.basename.slice(1)];
      return null;
    }
    const srcKey = this.citekeyDepuisLien(src);
    if (!srcKey) return null;
    const page = fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '';
    // Entrée structurée : le regroupement se fait plus tard, à l'échelle de la
    // grappe, où l'on voit toutes les annotations d'une même source.
    const srcEntry = { cle: srcKey, page };
    const pages = fm['références-pages'] || {};
    let refs = fm['références-citées'];
    refs = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    const citeDansActif = this.settings.exportCiteDansActif !== false;
    const entrees = [];
    const rapportes = [];                          // travaux rapportés, absents de Zotero
    for (const rv of refs) {
      const cibleRef = this.cibleDepuisLien(rv);
      if (!cibleRef) continue;
      const ck = this.citekeyDepuisLien(rv);
      if (ck === srcKey) continue;                 // la référence est la source : rien de plus
      const pc = String(pages[cibleRef] != null ? pages[cibleRef] : '').replace(/^["']|["']$/g, '').trim();
      const locRef = pc ? ', p. ' + pc : '';       // page propre à la référence citée
      if (/^@/.test(cibleRef)) { entrees.push({ cle: ck, page: pc }); continue; } // déjà dans Zotero -> directe
      // référence en attente : présente malgré tout dans Zotero ?
      let base = null;
      if (ctx.index) {
        const ref = refDepuisNomAttente(cibleRef);
        base = ref ? trouverSourceZotero(ref, ctx.index) : null;
      }
      if (base) { entrees.push({ cle: base.replace(/^@/, ''), page: pc }); continue; } // citation directe
      // Travail rapporté, introuvable dans Zotero.
      if (citeDansActif) rapportes.push(cibleRef + locRef);
      else entrees.push({ cle: srcKey, page });    // on ne cite que la source consultée
    }
    // Les travaux rapportés d'une même source tiennent en UNE entrée. Huit
    // entrées distinctes renvoyant à la même source donnaient huit citations
    // que Zotero regroupait en effaçant le nom de l'auteur : « … cité dans
    // Raizada & Sinha, 2025, p. 1, …, cité dans 2025, p. 1, … ».
    //
    // Ils sont énumérés à la française — virgules, puis « et » — et non par des
    // points-virgules : le « ; » reste ainsi réservé à la séparation des
    // citations entre elles, si bien que le lecteur voit où le groupe finit.
    if (rapportes.length) {
      entrees.push({ cle: srcKey, page, travaux: rapportes });
    }
    return entrees.length ? entrees : [srcEntry];
  }

  // Garde-fou : le modèle se retouche dans Word, et Word y scinde les
  // jetons, quand ce n'est pas une faute de frappe qui les rend muets. Cette
  // commande dit ce que le modèle porte, et ce qui cloche, avant d'exporter.
  async verifierModeleWord() {
    const fs = require('fs');
    const script = this.cheminScriptPandoc('finition.py');
    const modele = this.settings.exportModeleWord || '';
    if (!fs.existsSync(script)) { new obsidian.Notice(tr('finition.py introuvable.')); return; }
    if (!modele || !fs.existsSync(modele)) { new obsidian.Notice(tr('Modèle Word introuvable : ') + modele); return; }
    try {
      const sortie = await new Promise((resolve) => {
        require('child_process').execFile('python3', [script, '--verifier', modele],
          { maxBuffer: 4 * 1024 * 1024 },
          (e, so, se) => resolve(String(so || '') + String(se || '')));
      });
      console.log('[Ariane] modèle —\n' + sortie);
      const alertes = sortie.split('\n').filter((l) => l.startsWith('ATTENTION'));
      new obsidian.Notice(alertes.length
        ? 'Modèle Word — ' + alertes.length + ' anomalie(s) :\n' + alertes.join('\n')
        : 'Modèle Word : aucune anomalie.\n' + sortie.trim(), alertes.length ? 0 : 12000);
    } catch (e) {
      new obsidian.Notice(tr('Vérification du modèle — échec : ') + (e && e.message ? e.message : e));
    }
  }

  async exporterWordZotero() {
    // L'export appelle pandoc et python par child_process : rien de tout cela
    // n'existe sur mobile. Le greffon se charge malgré tout, tous les modules
    // Node étant requis à l'intérieur des fonctions, mais mieux vaut un
    // message clair qu'une exception non rattrapée.
    if (obsidian.Platform && !obsidian.Platform.isDesktopApp) {
      new obsidian.Notice(tr("L'export Word demande pandoc et n'est possible que sur ordinateur."));
      return;
    }
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') { new obsidian.Notice(tr('Ouvrez la note à exporter.')); return; }
    const contenu = await this.app.vault.read(file);
    const ctx = { index: this.construireIndexZotero() };
    const resoudre = (c) => this.resoudreCitation(c, file.path, ctx);
    // Les notes anciennes portent encore des notes de bas de page ; les
    // récentes des citations en ligne. Les deux passes se complètent.
    const citeDans = this.settings.citeDans || ', cité dans ';
    let md = footnotesVersCitations(contenu, resoudre, citeDans);
    md = preparerMarkdownExport(md, resoudre, {
      citeDans,
      styleEncadre: this.settings.exportStyleEncadre || 'Items de réflexion',
      insecables: this.settings.exportInsecables !== false,
      decalerTitres: this.settings.exportDecalerTitres !== false,
      retirerNumerotation: this.settings.exportRetirerNumerotation !== false,
    });
    // La bibliographie est ajoutée APRÈS la préparation, qui supprime celle
    // d'Ariane : c'est Zotero qui produira la sienne à cet emplacement.
    if (this.settings.exportBibliographie) md += '\n\n# Bibliographie\n';
    // Active les citations « auteur dans le texte » pour les liens [[@clé]] du corps.
    md = '---\nzotero:\n  author-in-text: true\n---\n\n' + md;
    const fs = require('fs'), os = require('os'), pathMod = require('path');
    const tmp = pathMod.join(os.tmpdir(), 'ariane-export-' + Date.now() + '.md');
    fs.writeFileSync(tmp, md, 'utf8');
    await this.assurerDossier(this.settings.exportDossier);
    const outPath = pathMod.join(this.cheminAbsoluVault(this.settings.exportDossier), file.basename + '.docx');
    const notice = new obsidian.Notice(tr('Export Word (Zotero)…'), 0);
    try {
      const dirFiltre = pathMod.dirname(this.settings.exportFiltreLua);
      const env = Object.assign({}, process.env, {
        PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || ''),
        LUA_PATH: dirFiltre + '/?.lua;' + dirFiltre + '/?/init.lua;;',
      });
      const args = ['--lua-filter', this.settings.exportFiltreLua];
      const modele = this.settings.exportModeleWord;
      if (modele && fs.existsSync(modele)) args.push('--reference-doc', modele);
      args.push(tmp, '-s', '-o', outPath);
      await new Promise((resolve, reject) => {
        require('child_process').execFile(
          this.settings.exportPandocBin || 'pandoc', args,
          { maxBuffer: 64 * 1024 * 1024, env, cwd: dirFiltre },
          (e, so, se) => e ? reject(new Error(String(se || e.message || e).slice(0, 400))) : resolve());
      });
      await this.remapperStyles(outPath, env);
      await this.finirDocument(outPath, env, file);
      notice.hide();
      new obsidian.Notice(tr('Export terminé : ') + file.basename + '.docx (dans « ' + this.settings.exportDossier + ' »).');
    } catch (e) {
      notice.hide();
      new obsidian.Notice(tr('Export — échec : ') + (e && e.message ? e.message : e) + ' — pandoc installé ? Zotero lancé ?');
      console.error('[Ariane] export word', e);
    } finally {
      try { fs.unlinkSync(tmp); } catch (e) { /* */ }
    }
  }

  // Finition du .docx : en-têtes du modèle rattachés, en-tête de première page
  // alimenté par les propriétés de la note, tableaux habillés. Pandoc écrit sa
  // propre section et laisse les en-têtes du modèle orphelins dans le fichier.
  async finirDocument(chemin, env, fichier) {
    if (this.settings.exportEntetes === false) return;
    const fs = require('fs'), os = require('os'), pathMod = require('path');
    const script = this.cheminScriptPandoc('finition.py');
    if (!fs.existsSync(script)) return;

    const fm = ((this.app.metadataCache.getFileCache(fichier) || {}).frontmatter) || {};
    const date = this.dateDeNote(fichier, fm);

    // Le greffon ne décide plus de rien : il dit seulement ce que vaut chaque
    // jeton. C'est le MODÈLE qui porte les jetons, donc qui décide où va
    // quelle donnée, et laquelle apparaît. Voir la légende en fin de modèle.
    // Les liens d'Obsidian n'ont pas leur place dans un document Word : sans
    // ce nettoyage, une propriété sortait « [[Chabane Mazri]], [[Lionel
    // Garreau]] », crochets compris.
    const lisible = (x) => (this.settings.exportNettoyerLiens === false ? String(x) : valeurLisible(x));

    const valeurs = {
      titre: lisible((Array.isArray(fm.aliases) && fm.aliases[0]) || fichier.basename),
      dossier: this.dossierDeNote(fichier),
      date: this.formaterDate(date, 'court'),
      'date:long': this.formaterDate(date, 'long'),
      'réf': this.referenceDeNote(fichier, fm),
    };

    // Toutes les propriétés de la note, à double titre : nommément, pour un
    // {{propriété:clé}} du modèle, et en liste, pour ses rangs répétables. La
    // finition écarte de la liste celles que le modèle place déjà ailleurs.
    const structurelles = new Set(['position', 'aliases', 'tags', 'cssclasses']);
    const proprietes = [];
    for (const [cle, val] of Object.entries(fm)) {
      if (val == null || val === '') continue;
      const texte = lisible(Array.isArray(val) ? val.map(lisible).join(', ') : val);
      if (!texte.trim()) continue;
      valeurs['propriété:' + cle] = texte;
      if (!structurelles.has(String(cle).toLowerCase())) {
        proprietes.push([this.libellePropriete(cle), texte]);
      }
    }

    const ordres = pathMod.join(os.tmpdir(), 'ariane-finition-' + Date.now() + '.json');
    fs.writeFileSync(ordres, JSON.stringify({
      valeurs,
      proprietes,
      // Le modèle porte les préférences Zotero (ZOTERO_PREF_1, _2) que pandoc
      // n'écrit pas pour le .docx : sans elles, Word ne reconnaît pas un
      // document Zotero et refuse d'actualiser les citations. Il porte aussi
      // la section et le gabarit du tableau des propriétés.
      modele: this.settings.exportModeleWord || '',
      // Le champ ZOTERO_BIBL, que le filtre ne pose que pour l'ODT.
      bibliographie: this.settings.exportBibliographie !== false,
      styleEnteteTableau: this.settings.exportStyleEnteteTableau || 'Titre de tableau',
      styleCelluleTableau: this.settings.exportStyleCelluleTableau || 'Champ de tableau',
      // Les styles que pandoc invente pour le corps de texte sont ramenés à
      // ceux du modèle. La finition résout les noms en identifiants.
      styles: this.settings.exportMapStyles || {},
    }), 'utf8');

    try {
      const sortie = await new Promise((resolve, reject) => {
        require('child_process').execFile('python3', [script, chemin, ordres],
          { maxBuffer: 32 * 1024 * 1024, env },
          (e, so, se) => (e ? reject(new Error(String(se || e.message).slice(0, 400))) : resolve(String(so || ''))));
      });
      console.log('[Ariane] finition —', sortie.trim());
      // Rien ne doit se dérégler en silence : ce que la finition signale est
      // remonté à l'utilisateur, l'export ayant tout de même abouti.
      const alertes = sortie.split('\n').filter((l) => l.startsWith('ATTENTION'));
      if (alertes.length) {
        new obsidian.Notice(tr('Modèle Word — ') + alertes.length + ' anomalie(s) :\n'
          + alertes.join('\n') + '\n(commande « Vérifier le modèle Word » pour le détail)', 0);
      }
      try { fs.unlinkSync(chemin + '.avant-finition'); } catch (e) { /* */ }
    } catch (e) {
      new obsidian.Notice(tr('Finition non appliquée : ') + (e && e.message ? e.message : e), 10000);
      console.error('[Ariane] finition', e);
      try {
        if (fs.existsSync(chemin + '.avant-finition')) {
          fs.copyFileSync(chemin + '.avant-finition', chemin);
          fs.unlinkSync(chemin + '.avant-finition');
        }
      } catch (err) { /* on garde ce qu'on a */ }
    } finally {
      try { fs.unlinkSync(ordres); } catch (e) { /* */ }
    }
  }

  // La référence de la note pour l'en-tête principal. On cherche, dans
  // l'ordre, les propriétés que l'utilisateur a désignées ; à défaut, et s'il
  // l'a demandé, le nom du fichier fait office de référence — c'est le cas des
  // notes nommées « NP-260826-07 » ou « CR-260826-07 ».
  referenceDeNote(fichier, fm) {
    const noms = String(this.settings.exportProprieteReference || 'ref')
      .split(',').map((x) => x.trim()).filter(Boolean);
    const sansAccent = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const table = new Map();
    for (const [k, v] of Object.entries(fm || {})) table.set(sansAccent(k).replace(/\.$/, ''), v);
    for (const n of noms) {
      const v = table.get(sansAccent(n).replace(/\.$/, ''));
      if (v != null && String(v).trim()) {
        return valeurLisible(Array.isArray(v) ? v.join(', ') : v);
      }
    }
    return this.settings.exportRefDepuisNom === false ? '' : fichier.basename;
  }

  // Le dossier du coffre où vit la note, sans son numéro de rangement :
  // « 2 - Notes conceptuelles » -> « Notes conceptuelles ». C'est ce que le
  // gabarit de l'en-tête principal appelle « Type ».
  dossierDeNote(fichier) {
    const parent = fichier.parent && fichier.parent.name ? fichier.parent.name : '';
    return parent.replace(/^\s*\d+\s*-\s*/, '').trim();
  }

  // Date de création : la propriété « date » de la note si elle est lisible,
  // sinon la date de création du fichier.
  dateDeNote(fichier, fm) {
    const brute = fm && fm.date ? String(fm.date) : '';
    const d = brute ? new Date(brute) : null;
    if (d && !isNaN(d.getTime())) return d;
    const ctime = fichier.stat && fichier.stat.ctime;
    return ctime ? new Date(ctime) : new Date();
  }

  // Deux formats, ceux du modèle : « 02/07/2026 » dans l'en-tête principal,
  // « Jeudi 02 juillet 2026 » dans le tableau des propriétés.
  formaterDate(d, forme) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    if (forme === 'court') {
      return d.toLocaleDateString('fr-FR',
        { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    const t = d.toLocaleDateString('fr-FR',
      { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // « date-creation » -> « Date creation ». Les noms techniques restent lisibles.
  libellePropriete(cle) {
    const t = String(cle).replace(/[-_]+/g, ' ').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  onunload() {
    for (const t of this.antirebonds.values()) clearTimeout(t);
    this.antirebonds.clear();
    // Le cache d'embeddings n'est plus écrit à chaque frappe : il faut donc le
    // poser au plus tard ici, faute de quoi la session serait perdue.
    if (this.suggEmbMinuteur) { clearTimeout(this.suggEmbMinuteur); this.suggEmbMinuteur = null; }
    this.sauverCacheEmbeddings().catch(() => { /* fermeture en cours */ });
    // Dernier report : sans cela, les minutes de la session en cours seraient
    // perdues à la fermeture d'Obsidian ou au rechargement du greffon.
    this.reporterTemps().catch(() => { /* fermeture en cours */ });
  }

  // Infobulle dans l'explorateur : le total inscrit dans la note.
  installerInfobulleTemps() {
    if (!this.settings.tempsInfobulleExplorateur) return;
    this.registerDomEvent(document, 'mouseover', (e) => {
      const cible = e && e.target;
      if (!cible || typeof cible.closest !== 'function') return;
      const titre = cible.closest('.nav-file-title');
      if (!titre) return;
      const chemin = titre.getAttribute('data-path');
      if (!chemin || !chemin.endsWith('.md')) return;
      const minutes = this.tempsTotalDe(chemin)
        + ((this._tempsSecondes && this._tempsSecondes.get(chemin)) || 0) / 60;
      if (minutes < 1) return;
      titre.setAttribute('title', 'Temps passé : ' + dureeLisible(minutes));
    }, { capture: true });
  }

  /* Compteur d'appels dans l'explorateur retiré : voir la vue
     « Ordre et appels » de la base ZotFlow. */

  // Titre (alias) d'une annotation ciblée par un lien, ou '' si ce n'en
  // est pas une.
  titreAnnotationCiblee(cheminLien, sourcePath, pourAparte) {
    if (!cheminLien) return '';
    const dest = this.app.metadataCache.getFirstLinkpathDest(cheminLien, sourcePath || '');
    if (!dest) return '';
    const cache = this.app.metadataCache.getFileCache(dest);
    const fm = cache ? cache.frontmatter : null;
    if (!fm) return '';
    // Cibles éligibles à l'aparté : annotations ET notes conceptuelles.
    const estAnnotation = dest.path.startsWith(this.dossierA + '/') && fm['zotflow-anno-key'] !== undefined;
    // Hors annotations, c'est la famille de la note qui dit si l'aparté
    // s'applique — plus aucun type de note n'est nommé dans le code.
    const famille = estAnnotation ? null : this.familleDuChemin(dest.path, dest.basename);
    if (!estAnnotation && !famille) return '';
    // Filtrage par type, uniquement pour l'aparté sur les liens.
    if (pourAparte) {
      if (estAnnotation && !this.settings.aparteAnnotations) return '';
      if (famille && !famille.aparte) return '';
    }
    const al = fm.aliases;
    if (Array.isArray(al) && al.length) return String(al[0]);
    if (typeof al === 'string') return al;
    return '';
  }

  // Post-traitement (lecture) : ajoute « (Titre) » discret après un lien
  // d'annotation qui affiche la clé. N'écrit rien dans les notes.
  enrichirLiensAnnotation(el, ctx) {
    if (!this.settings.aliasSurLiens) return;
    const liens = el.querySelectorAll('a.internal-link');
    liens.forEach((a) => {
      const suivant = a.nextElementSibling;
      if (suivant && suivant.classList && suivant.classList.contains('zfa-lien-alias')) return;
      const cible = a.getAttribute('data-href') || a.getAttribute('href') || '';
      if (!cible || cible.includes('#')) return;
      // Alias manuel présent ([[cible|affiché]]) -> pas d'aparté auto.
      const affiche = (a.textContent || '').trim();
      const base = cible.split('/').pop().replace(/\.md$/, '');
      if (affiche && affiche !== cible && affiche !== base) return;
      const titre = this.titreAnnotationCiblee(cible, ctx && ctx.sourcePath, true);
      if (!titre) return;
      // On n'ajoute rien si le lien affiche déjà le titre.
      if (affiche === titre) return;
      const span = document.createElement('span');
      span.className = 'zfa-lien-alias';
      span.textContent = this.formatAparte(titre, cible);
      a.insertAdjacentElement('afterend', span);
    });
  }

  // Explorateur de fichiers : ajoute l'alias (titre) à côté du nom des
  // annotations et notes conceptuelles, dont le nom de fichier est cryptique.
  installerDecorateurExplorateur() {
    const planifier = () => this.antirebond('explorateur', () => this.decorerExplorateur(), 200);
    this.registerEvent(this.app.workspace.on('layout-change', planifier));
    this.registerEvent(this.app.workspace.on('active-leaf-change', planifier));
    this.registerEvent(this.app.metadataCache.on('resolved', planifier));
    const cont = document.querySelector('.nav-files-container');
    if (cont && typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(() => planifier());
      obs.observe(cont, { childList: true, subtree: true });
      this.register(() => obs.disconnect());
    }
    planifier();
  }

  decorerExplorateur() {
    const dossiers = this.dossiersDeFamille('alias');
    // Dossiers en police à largeur fixe : appartenance directe uniquement,
    // un sous-dossier n'hérite pas du réglage de son parent.
    const dossiersMono = new Set(this.dossiersDeFamille('monospace'));
    document.querySelectorAll('.nav-file-title').forEach((el) => {
      const ancien = el.querySelector('.zfa-explorer-alias');
      const path = el.getAttribute('data-path') || '';
      // Police à largeur fixe si la note est directement dans un dossier listé.
      const i = path.lastIndexOf('/');
      const dossierNote = i === -1 ? '' : path.slice(0, i);
      el.classList.toggle('zfa-nom-mono', !!(path.endsWith('.md') && dossiersMono.has(dossierNote)));
      if (!path.endsWith('.md') || !dossiers.some((d) => path === d + '.md' || path.startsWith(d + '/'))) {
        if (ancien) ancien.remove();
        return;
      }
      const alias = this.aliasDeFichier(path);
      if (!alias) { if (ancien) ancien.remove(); return; }
      if (ancien) { if (ancien.textContent !== alias) ancien.textContent = alias; return; }
      el.createSpan({ cls: 'zfa-explorer-alias', text: alias });
    });
  }

  // Premier alias du frontmatter d'un fichier, quel que soit son type.
  aliasDeFichier(path) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!f) return '';
    const cache = this.app.metadataCache.getFileCache(f);
    const al = cache && cache.frontmatter ? cache.frontmatter.aliases : null;
    if (Array.isArray(al) && al.length) return String(al[0]);
    if (typeof al === 'string' && al) return al;
    return '';
  }

  formaterAuteurs(familles, annee) {
    familles = (familles || []).filter(Boolean);
    let court = '';
    if (familles.length === 1) court = familles[0];
    else if (familles.length === 2) court = familles[0] + ' et ' + familles[1];
    else if (familles.length >= 3) court = familles[0] + ' et al.';
    return { court, complet: familles.join(', '), annee: annee || '' };
  }

  // Auteurs déduits d'un lien de référence : via les « creators » si la
  // cible en a (source Zotero), sinon via l'analyse du nom « Auteur, Année ».
  auteursDepuisReference(lien, ctx) {
    const cible = String(lien)
      .replace(/^\[\[|\]\]$/g, '')
      .replace(/\|.*$/, '')
      .replace(/#.*$/, '')
      .trim();
    if (!cible) return null;
    const dest = this.app.metadataCache.getFirstLinkpathDest(cible, ctx || '');
    if (dest) {
      const cache = this.app.metadataCache.getFileCache(dest);
      const fm = cache ? cache.frontmatter : null;
      if (fm && fm.creators) {
        const creators = (Array.isArray(fm.creators) ? fm.creators : [fm.creators]).map(sansLien);
        const familles = creators
          .map((c) => {
            const s = String(c).trim();
            return s.includes(',') ? s.split(',')[0].trim() : s.split(/\s+/).pop();
          })
          .filter(Boolean);
        const an = String(fm.year || fm.date || '').match(/\d{4}/);
        return this.formaterAuteurs(familles, an ? an[0] : '');
      }
    }
    // Pas de creators : la cible est du type « Auteur(s), Année ».
    const ref = parseNomReference(cible, this.settings);
    if (ref) return { court: ref.auteurComplet, complet: ref.auteurComplet, annee: ref.annee };
    return null;
  }

  // Auteurs de l'annotation : d'abord la référence citée, puis la source.
  auteursAnnotation(cle) {
    const anno = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!anno) return null;
    const cache = this.app.metadataCache.getFileCache(anno);
    const fmA = cache ? cache.frontmatter : null;
    if (!fmA) return null;

    // 1) Référence(s) citée(s) en priorité.
    let refs = fmA['références-citées'];
    if (refs) {
      if (!Array.isArray(refs)) refs = [refs];
      if (refs.length) {
        const r = this.auteursDepuisReference(refs[0], anno.path);
        if (r && r.court) return r;
      }
    }
    // 2) Repli : la source de l'annotation.
    const src = String(fmA['zotflow-source'] || '')
      .replace(/^\[\[|\]\]$/g, '')
      .replace(/\|.*$/, '')
      .trim();
    if (src) {
      const r = this.auteursDepuisReference('[[' + src + ']]', anno.path);
      if (r && r.court) return r;
    }
    return null;
  }

  // Texte de l'aparté, à partir du modèle configurable.
  formatAparte(titre, cle) {
    const vars = { alias: titre, title: titre, key: cle || '', auteur: '', auteurs: '', annee: '' };
    if (/\{\{\s*(auteur|auteurs|annee)\s*\}\}/.test(this.settings.modeleAparte || '')) {
      const a = this.auteursAnnotation(cle);
      if (a) {
        vars.auteur = a.court;
        vars.auteurs = a.complet;
        vars.annee = a.annee;
      }
    }
    let out = appliquerModele(this.settings.modeleAparte || ' ({{alias}})', vars);
    // Retire une parenthèse d'auteurs restée vide (ex. « (, ) » pour les notes
    // conceptuelles, qui n'ont pas d'auteur), sans toucher au reste de l'alias.
    out = out.replace(/\s*\([\s,;]*\)/g, '').replace(/\s+$/, '');
    return out;
  }

  // Applique couleur et taille de l'aparté via des variables CSS globales.
  appliquerStyleAparte() {
    const b = document.body;
    if (!b) return;
    const taille = (this.settings.aparteTaille || '').trim();
    const couleur = (this.settings.aparteCouleur || '').trim();
    if (taille) b.style.setProperty('--zfa-aparte-taille', taille);
    else b.style.removeProperty('--zfa-aparte-taille');
    if (couleur) b.style.setProperty('--zfa-aparte-couleur', couleur);
    else b.style.removeProperty('--zfa-aparte-couleur');
    const police = (this.settings.nomsMonospaceFont || '').trim();
    if (police) b.style.setProperty('--zfa-nom-mono-font', police);
    else b.style.removeProperty('--zfa-nom-mono-font');
  }

  // Commande : retire l'alias affiché des liens d'annotation
  // (« [[clé|Titre]] » -> « [[clé]] »). Ne touche pas les notes d'annotation.
  async retirerAliasLiensAnnotation() {
    const cles = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (fm && fm['zotflow-anno-key'] !== undefined) cles.add(f.basename);
    }
    if (cles.size === 0) {
      new obsidian.Notice(tr('Aucune annotation trouvée.'));
      return;
    }
    let modifs = 0;
    const re = /(?<!!)\[\[([^\]|#^\n]+)\|[^\]\n]*\]\]/g;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.path.startsWith(this.dossierA + '/')) continue;
      const contenu = await this.app.vault.read(f);
      const nouveau = contenu.replace(re, (m, cible) => {
        const t = cible.trim();
        if (cles.has(t)) {
          modifs++;
          return '[[' + t + ']]';
        }
        return m;
      });
      if (nouveau !== contenu) await this.ecrire(f.path, nouveau, f);
    }
    new obsidian.Notice(tr('Ariane : ') + modifs + ' lien(s) nettoyé(s).');
  }

  /* ------------- Glisser une annotation sur un paragraphe --------------- */

  // Éditeur CodeMirror situé sous un point de l'écran (quel que soit le
  // volet actif), pour gérer le glisser depuis la base vers la note.
  // Document de l'événement (gère les fenêtres détachées / multi-moniteurs).
  docDeEvenement(e) {
    return (e && e.view && e.view.document) ||
      (e && e.target && e.target.ownerDocument) ||
      document;
  }

  cmSousPoint(x, y, doc) {
    const d = doc || document;
    const el = d.elementFromPoint(x, y);
    const editeur = el && el.closest ? el.closest('.cm-editor') : null;
    if (!editeur) return null;
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      const cm = view && view.editor ? view.editor.cm : null;
      if (cm && cm.dom === editeur) return cm;
    }
    return null;
  }

  estAnnotationCle(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!dest || !dest.path.startsWith(this.dossierA + '/')) return false;
    const cache = this.app.metadataCache.getFileCache(dest);
    const fm = cache ? cache.frontmatter : null;
    return !!(fm && fm['zotflow-anno-key'] !== undefined);
  }

  extraireCleDepuisTexte(text) {
    if (!text) return '';
    const s = String(text).trim();
    const m = s.match(/\[\[([^\]|#\n]+)/);
    return m ? cleDeLien(m[1]) : s.split('\n')[0].trim();
  }

  // Un glisser venu d'un panneau tiers — le chat de Claudian, par exemple —
  // n'est pas un glisser interne d'Obsidian : c'est un glisser HTML natif,
  // dont la charge peut prendre des formes très diverses. On les ramène
  // toutes à un nom de note.
  cleDepuisCharge(brut) {
    if (!brut) return '';
    let s = String(brut).trim().split('\n')[0].trim();
    if (!s) return '';

    // Lien interne, la forme la plus directe.
    const w = s.match(/\[\[([^\]|#\n]+)/);
    if (w) return cleDeLien(w[1]);

    // Lien markdown : on ne garde que la cible.
    const md = s.match(/\]\(([^)]+)\)/);
    if (md) s = md[1].trim();

    // URL Obsidian : le nom de la note est dans le paramètre « file ».
    const ob = s.match(/obsidian:\/\/[^\s]*[?&]file=([^&\s]+)/i);
    if (ob) {
      try { s = decodeURIComponent(ob[1]); } catch (e) { s = ob[1]; }
    } else if (/^app:\/\//i.test(s)) {
      // Forme interne d'Obsidian pour un fichier du coffre.
      try { s = decodeURIComponent(s.replace(/^app:\/\/[^/]*\//i, '')); } catch (e) { /* brut */ }
    } else if (/%[0-9a-f]{2}/i.test(s)) {
      try { s = decodeURIComponent(s); } catch (e) { /* brut */ }
    }

    return s.replace(/^<|>$/g, '')
      .replace(/#.*$/, '')
      .replace(/\|.*$/, '')
      .replace(/\.md$/i, '')
      .trim();
  }

  // Note la cible du lien d'où part le glisser. On interroge « data-href »
  // en premier : c'est la valeur qu'Obsidian et Claudian y inscrivent, non
  // résolue, donc exploitable telle quelle.
  noterSourceGlissee(e) {
    this._sourceGlissee = '';
    const cible = e && e.target;
    if (!cible || typeof cible.closest !== 'function') return;

    let a = cible.closest('a[data-href], a.internal-link, .claudian-file-link');
    // Le glisser peut partir de l'aparté qu'Ariane accole après le lien.
    if (!a) {
      const aparte = cible.closest('.zfa-lien-alias');
      if (aparte && aparte.previousElementSibling) a = aparte.previousElementSibling;
    }
    if (a && typeof a.getAttribute === 'function') {
      this._sourceGlissee = (a.getAttribute('data-href')
        || a.getAttribute('href')
        || a.textContent
        || '').trim();
      return;
    }

    // En édition, une citation déjà posée n'est pas une balise « a » : le lien
    // est rendu sans « data-href », seul l'alias est visible. On lit donc le
    // document sous le point de départ pour y retrouver le « [[…]] » englobant.
    const cle = this.lienSousPoint(e);
    if (!cle) return;
    this._sourceGlissee = cle;

    // Réutiliser une citation, c'est la copier : sans cela l'éditeur la
    // déplacerait, et elle disparaîtrait du paragraphe d'origine. On ne force
    // cet effet que sur une cible réellement citable, pour ne pas altérer le
    // déplacement ordinaire d'un lien quelconque.
    if (e.dataTransfer && this.noteCitable(cle)) {
      try { e.dataTransfer.effectAllowed = 'copy'; } catch (err) { /* selon la source */ }
    }
  }

  // Une note peut-elle servir d'appui : annotation, ou source Zotero ?
  noteCitable(cle) {
    if (!cle) return false;
    for (const c of [cle, String(cle).split('/').pop()]) {
      const f = this.app.metadataCache.getFirstLinkpathDest(c, '');
      if (!f || f.extension !== 'md') continue;
      if (this.settings.dropToutesNotes) return true;
      const fm = ((this.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
      if (f.path.startsWith(this.dossierA + '/') && fm['zotflow-anno-key'] !== undefined) return true;
      if (fm.citationKey !== undefined) return true;
    }
    return false;
  }

  // Cible du lien interne situé sous les coordonnées d'un événement, lue dans
  // le texte source de l'éditeur. Rend '' si le point ne tombe pas dans un lien.
  lienSousPoint(e) {
    if (!e || e.clientX == null) return '';
    let cm = null;
    try {
      cm = this.cmSousPoint(e.clientX, e.clientY, this.docDeEvenement(e));
    } catch (err) { return ''; }
    if (!cm) return '';

    let pos = null;
    try { pos = cm.posAtCoords({ x: e.clientX, y: e.clientY }); } catch (err) { return ''; }
    if (pos == null) return '';

    const ligne = cm.state.doc.lineAt(pos);
    const rel = pos - ligne.from;
    for (const m of ligne.text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
      if (rel >= m.index && rel <= m.index + m[0].length) {
        return m[1].split('|')[0].split('#')[0].trim();
      }
    }
    return '';
  }

  // Quand la charge n'est pas un identifiant propre — une sélection de texte,
  // par exemple, où la clé se trouve collée au titre par l'aparté d'Ariane —
  // on y cherche les jetons qui ressemblent à une clé : citekey Zotero
  // « @auteurTitre2014 », ou clé d'annotation en capitales « TG7F24EE ».
  clesCandidates(brut) {
    const s = String(brut || '');
    const out = [];
    const ajouter = (x) => { if (x && out.indexOf(x) === -1) out.push(x); };
    for (const m of s.matchAll(/@[A-Za-zÀ-ÿ0-9_-]{4,}/g)) ajouter(m[0]);
    for (const m of s.matchAll(/\b[A-Z0-9]{6,12}\b/g)) ajouter(m[0]);
    return out;
  }

  // Récupère la clé de l'annotation glissée, en priorité via le
  // gestionnaire de glisser interne d'Obsidian (dragManager), sinon via
  // les données du presse-papier.
  obtenirCleGlissee(e) {
    const toutes = this.settings.dropToutesNotes;
    // Un fichier est-il acceptable comme appui ? Toute note markdown si
    // « toutes les notes », sinon seulement les annotations.
    const accepteFichier = (f) => {
      if (!f || !f.path || f.extension !== 'md') return false;
      if (toutes) return true;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = (cache ? cache.frontmatter : null) || {};
      // Annotation.
      if (f.path.startsWith(this.dossierA + '/') && fm['zotflow-anno-key'] !== undefined) return true;
      // Note source : citer un travail sans passer par une annotation reste
      // légitime, et c'est précisément ce qu'on glisse depuis un panneau tiers.
      return fm.citationKey !== undefined;
    };
    const accepteCible = (cible) => {
      if (!cible) return false;
      // La charge peut porter un chemin complet comme un simple nom.
      const essais = [cible, cible.split('/').pop()];
      for (const c of essais) {
        if (accepteFichier(this.app.metadataCache.getFirstLinkpathDest(c, ''))) return true;
      }
      return false;
    };
    const normaliser = (cible) => {
      const essais = [cible, cible.split('/').pop()];
      for (const c of essais) {
        const f = this.app.metadataCache.getFirstLinkpathDest(c, '');
        if (accepteFichier(f)) return f.basename;
      }
      return '';
    };
    const dm = this.app.dragManager;
    const d = dm && dm.draggable;
    if (d) {
      if (accepteFichier(d.file)) return d.file.basename;
      const arr = d.files || d.items;
      if (Array.isArray(arr)) {
        for (const f of arr) if (accepteFichier(f)) return f.basename;
      }
      for (const k of ['linktext', 'link', 'title', 'name']) {
        if (typeof d[k] === 'string') {
          const cible = this.extraireCleDepuisTexte(d[k]);
          if (accepteCible(cible)) return cible;
        }
      }
    }
    // Élément d'origine, retenu au départ du glisser. C'est la seule voie
    // quand la charge est vide, ce qui est le cas depuis un panneau tiers.
    if (this._sourceGlissee) {
      const k = normaliser(this.cleDepuisCharge(this._sourceGlissee));
      if (k) return k;
      for (const jeton of this.clesCandidates(this._sourceGlissee)) {
        const j = normaliser(jeton);
        if (j) return j;
      }
    }

    // Glisser natif : on interroge chaque format proposé, du plus explicite
    // au plus vague. Un panneau tiers ne remplit pas forcément « text/plain ».
    const dt = e && e.dataTransfer;
    if (dt) {
      const formats = ['text/plain', 'text/uri-list', 'text/x-moz-url', 'text/html'];
      const vus = [];
      for (const fmt of formats) {
        let brut = '';
        try { brut = dt.getData(fmt); } catch (err) { brut = ''; }
        if (!brut) continue;
        vus.push(fmt);

        if (fmt === 'text/html') {
          // On tente d'abord les liens du fragment, puis son texte.
          const candidats = [];
          const re = /(?:href|data-href)\s*=\s*["']([^"']+)["']/gi;
          let m;
          while ((m = re.exec(brut)) !== null) candidats.push(m[1]);
          candidats.push(brut.replace(/<[^>]*>/g, ' '));
          for (const c of candidats) {
            const k = normaliser(this.cleDepuisCharge(c));
            if (k) return k;
          }
          for (const jeton of this.clesCandidates(brut)) {
            const k = normaliser(jeton);
            if (k) return k;
          }
          continue;
        }

        for (const ligne of String(brut).split('\n')) {
          const k = normaliser(this.cleDepuisCharge(ligne));
          if (k) return k;
        }
        // La charge entière n'a rien donné : on y cherche une clé isolée.
        for (const jeton of this.clesCandidates(brut)) {
          const k = normaliser(jeton);
          if (k) return k;
        }
      }
      // Aide au diagnostic : sans cela, un dépôt refusé reste muet.
      if (this.settings.dropSignalerRefus !== false) {
        const apercu = this._sourceGlissee || (() => {
          try { return dt.getData('text/plain'); } catch (err) { return ''; }
        })();
        new obsidian.Notice(tr("Dépôt non reconnu : ")
          + (apercu ? '« ' + String(apercu).slice(0, 80) + ' »' : 'charge vide')
          + '. Aucune note du coffre ne correspond.', 6000);
      }
      console.debug('[Ariane] glisser non reconnu. Formats reçus :',
        Array.from(dt.types || []), '| exploités :', vus,
        '| text/plain :', (() => { try { return dt.getData('text/plain'); } catch (err) { return '?'; } })());
    }
    if (d) console.debug('[Ariane] objet glissé non reconnu :', Object.keys(d), d);
    return '';
  }

  // La ligne appartient-elle à un paragraphe de corps (éligible au dépôt) ?
  ligneEstParagraphe(doc, n) {
    if (n < 1 || n > doc.lines) return false;
    const t = doc.line(n).text;
    if (t.trim() === '') return false;
    if (/^#{1,6}\s/.test(t)) return false; // titre
    if (/^\s*\[\^[^\]]+\]:/.test(t)) return false; // définition de note
    if (/^[\t ]/.test(t)) return false; // ligne indentée (continuation)
    if (/^(?:!?\[\[[^\]]*\]\]\s*)+$/.test(t.trim())) return false; // ligne de liens seuls
    // exclure la zone des notes de bas de page (à partir de la 1re définition)
    for (let k = 1; k < n; k++) {
      if (/^\s*\[\^[^\]]+\]:/.test(doc.line(k).text)) return false;
    }
    return true;
  }

  // Rattache une ou plusieurs annotations à la note de bas de page du
  // paragraphe contenant la ligne donnée (création ou complément).
  // Notes concernées par une conversion : on écarte les annotations elles-mêmes
  // et les fiches Zotero, qui ne contiennent pas de rédaction.
  notesConvertibles() {
    const exclus = [this.dossierA + '/', this.dossierR + '/', 'Références/', 'Auteurs/'];
    return this.app.vault.getMarkdownFiles()
      .filter((f) => !exclus.some((d) => f.path.startsWith(d)));
  }

  /* ----------------------------- Temps passé ----------------------------- */

  demarrerCompteurTemps() {
    if (!this.settings.tempsActif) return;

    this._tempsSecondes = new Map();   // chemin -> secondes non encore reportées
    this._tempsDerniereActivite = Date.now();
    this._tempsCheminCourant = '';
    this._tempsDernierJour = jourIsoDe(new Date());

    // Toute action de l'utilisateur repousse l'inactivité. Le passage en
    // capture évite qu'un panneau tiers n'intercepte l'événement avant nous.
    const marquer = () => { this._tempsDerniereActivite = Date.now(); };
    const surDocument = (doc) => {
      for (const ev of ['keydown', 'mousedown', 'mousemove', 'wheel', 'touchstart']) {
        this.registerDomEvent(doc, ev, marquer, { capture: true, passive: true });
      }
    };
    // Les fenêtres détachées déjà ouvertes au chargement doivent être écoutées
    // elles aussi : sans cela, taper dans l'une d'elles ne repoussait jamais
    // l'inactivité, et le compteur s'y arrêtait au bout du délai.
    const docsEcoutes = new WeakSet();
    const ecouter = (doc) => {
      if (!doc || docsEcoutes.has(doc)) return;
      docsEcoutes.add(doc);
      surDocument(doc);
    };
    ecouter(document);
    try {
      this.app.workspace.iterateAllLeaves((feuille) => {
        const c = feuille && feuille.view && feuille.view.containerEl;
        if (c && c.ownerDocument) ecouter(c.ownerDocument);
      });
    } catch (e) {
      console.warn('[Ariane] fenêtres non parcourues pour le compteur :', e);
    }
    this.registerEvent(this.app.workspace.on('window-open', (_w, win) => {
      if (win && win.document) ecouter(win.document);
    }));

    // Un battement court : la précision du compte vaut mieux qu'une économie
    // de quelques réveils, et le calcul se résume à une comparaison de dates.
    this.registerInterval(window.setInterval(() => this.battementTemps(), 5000));

    if (this.settings.tempsBarreEtat) {
      this._tempsBarre = this.addStatusBarItem();
      this._tempsBarre.addClass('zfa-temps-barre');
      this._tempsBarre.addEventListener('click', () => this.ouvrirBilanTemps());
    }

    // Report en propriété à intervalle régulier, et non à chaque seconde :
    // écrire dans le fichier agite la synchronisation et les sauvegardes.
    this.registerInterval(window.setInterval(
      () => this.reporterTemps(),
      Math.max(60, this.settings.tempsEcritureSec || 300) * 1000
    ));
  }

  // La note actuellement chronométrée, ou '' si aucune ne l'est.
  noteChronometrable() {
    const feuille = this.app.workspace.activeLeaf;
    const vue = feuille && feuille.view;
    if (!vue || vue.getViewType() !== 'markdown') return '';
    // Mode lecture : on ne chronomètre que ce qui est modifiable.
    if (typeof vue.getMode === 'function' && vue.getMode() !== 'source') return '';
    const f = vue.file;
    if (!f || f.extension !== 'md') return '';

    if (this.settings.tempsIgnorerVerrouillees !== false) {
      const fm = ((this.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
      if (fm.locked === true) return '';
    }
    return f.path;
  }

  battementTemps() {
    if (!this.settings.tempsActif || !this._tempsSecondes) return;

    // Changement de jour : on clôt la veille avant de continuer.
    const jour = jourIsoDe(new Date());
    if (jour !== this._tempsDernierJour) {
      this.reporterTemps();
      const veille = this._tempsDernierJour;
      this._tempsDernierJour = jour;
      if (this.settings.tempsJournalAuto) {
        this.ecrireJournalTemps(veille).catch((e) => console.error('[Ariane] journal du temps', e));
      }
    }

    const chemin = this.noteChronometrable();
    const inactifDepuis = (Date.now() - this._tempsDerniereActivite) / 1000;
    const seuil = Math.max(10, this.settings.tempsInactiviteSec || 120);
    // Le focus doit être jugé sur la fenêtre qui porte la note. Interroger le
    // document principal revenait à déclarer en pause tout travail mené dans
    // une fenêtre détachée, sur un second écran par exemple.
    const enPause = !chemin || inactifDepuis > seuil || !this.fenetreNoteActive();

    if (!enPause) {
      this._tempsSecondes.set(chemin, (this._tempsSecondes.get(chemin) || 0) + 5);
      // Le relevé cumule des SECONDES : arrondir en minutes à chaque battement
      // accumulait une erreur de plusieurs pour cent sur une journée.
      const h = this.settings.tempsHistorique || (this.settings.tempsHistorique = {});
      const dujour = h[jour] || (h[jour] = {});
      dujour[chemin] = (dujour[chemin] || 0) + 5;
    }

    // Quitter une note reporte aussitôt son temps : on ne perd rien si
    // Obsidian se ferme brutalement.
    if (chemin !== this._tempsCheminCourant) {
      const precedent = this._tempsCheminCourant;
      this._tempsCheminCourant = chemin;
      if (precedent) this.reporterTemps(precedent);
    }

    this.rafraichirBarreTemps(chemin, enPause);
  }

  // La fenêtre portant la note active a-t-elle le focus ? On interroge son
  // propre document : chaque fenêtre détachée a le sien.
  fenetreNoteActive() {
    const feuille = this.app.workspace.activeLeaf;
    const c = feuille && feuille.view && feuille.view.containerEl;
    const doc = (c && c.ownerDocument) || document;
    try {
      return typeof doc.hasFocus === 'function' ? doc.hasFocus() : true;
    } catch (e) {
      return true;
    }
  }

  rafraichirBarreTemps(chemin, enPause) {
    if (!this._tempsBarre) return;
    if (!chemin) { this._tempsBarre.setText(''); return; }
    const totaux = this.settings.tempsTotalSecondes || {};
    const base = totaux[chemin] != null ? totaux[chemin] / 60 : this.tempsTotalDe(chemin);
    const total = base + (this._tempsSecondes.get(chemin) || 0) / 60;
    this._tempsBarre.setText((enPause ? '○ ' : '● ') + dureeLisible(total));
    this._tempsBarre.setAttr('aria-label',
      (enPause ? 'Compteur en pause — ' : 'Compteur actif — ') + chemin.split('/').pop());
  }

  // Total déjà inscrit dans la note, en minutes.
  tempsTotalDe(chemin) {
    const f = this.app.vault.getAbstractFileByPath(chemin);
    if (!(f instanceof obsidian.TFile)) return 0;
    const fm = ((this.app.metadataCache.getFileCache(f) || {}).frontmatter) || {};
    return Number(fm[this.settings.tempsPropriete || 'temps-passe']) || 0;
  }

  // Reporte en propriété les secondes accumulées. Sans argument, pour toutes
  // les notes en attente.
  async reporterTemps(cheminVoulu) {
    if (!this._tempsSecondes || !this._tempsSecondes.size) return;
    const prop = this.settings.tempsPropriete || 'temps-passe';
    const chemins = cheminVoulu ? [cheminVoulu] : Array.from(this._tempsSecondes.keys());

    const totaux = this.settings.tempsTotalSecondes || (this.settings.tempsTotalSecondes = {});

    for (const chemin of chemins) {
      const secondes = this._tempsSecondes.get(chemin) || 0;
      if (secondes < 30) continue; // sous la demi-minute, on attend
      const f = this.app.vault.getAbstractFileByPath(chemin);
      if (!(f instanceof obsidian.TFile)) { this._tempsSecondes.delete(chemin); continue; }
      try {
        // Amorçage : une note déjà porteuse d'un total le conserve.
        if (totaux[chemin] == null) totaux[chemin] = Math.round(this.tempsTotalDe(chemin) * 60);
        totaux[chemin] += secondes;
        const minutes = Math.round(totaux[chemin] / 60);
        this.marquerEcriture(f.path);
        await this.app.fileManager.processFrontMatter(f, (fm) => { fm[prop] = minutes; });
        this._tempsSecondes.delete(chemin);
      } catch (e) {
        console.error('[Ariane] report du temps impossible :', chemin, e);
      }
    }
    await this.saveSettings();
  }

  /* ------------------------- Journal quotidien --------------------------- */

  async ecrireJournalTemps(jour) {
    const j = jour || jourIsoDe(new Date());
    await this.reporterTemps();
    const releve = (this.settings.tempsHistorique || {})[j] || {};
    const lignes = Object.entries(releve)
      .map(([chemin, secondes]) => [chemin, secondes / 60])
      .filter(([, m]) => m >= 1)
      .sort((a, b) => b[1] - a[1]);

    if (!lignes.length) {
      new obsidian.Notice(tr('Aucun temps enregistré pour le ') + j + '.');
      return '';
    }

    const dossier = (this.settings.tempsDossierJournal || '9 - Journal du temps').replace(/\/+$/, '');
    if (!this.app.vault.getAbstractFileByPath(dossier)) {
      try { await this.app.vault.createFolder(dossier); } catch (e) { /* déjà là */ }
    }

    const total = lignes.reduce((s, [, m]) => s + m, 0);
    const out = ['---', 'type: journal-temps', 'date: ' + j,
      'total-minutes: ' + Math.round(total), '---',
      '# Temps de travail du ' + j, '',
      '**Total : ' + dureeLisible(total) + '** sur ' + lignes.length + ' note(s).', '',
      '| Note | Temps |', '| --- | --- |'];
    for (const [chemin, m] of lignes) {
      const nom = chemin.replace(/\.md$/, '');
      out.push('| [[' + nom + ']] | ' + dureeLisible(m) + ' |');
    }
    out.push('');

    const chemin = dossier + '/' + j + '.md';
    const existant = this.app.vault.getAbstractFileByPath(chemin);
    if (existant instanceof obsidian.TFile) {
      this.marquerEcriture(chemin);
      await this.app.vault.modify(existant, out.join('\n'));
    } else {
      await this.ecrire(chemin, out.join('\n'));
    }
    return chemin;
  }

  async ouvrirBilanTemps() {
    const chemin = await this.ecrireJournalTemps();
    if (!chemin) return;
    await this.app.workspace.openLinkText(chemin.replace(/\.md$/, ''), '', false);
  }

  // Écarte les relevés trop anciens, pour que le fichier de réglages ne gonfle
  // pas indéfiniment.
  elaguerHistoriqueTemps() {
    const h = this.settings.tempsHistorique || {};
    const garder = Math.max(7, this.settings.tempsRetenirJours || 120);
    const limite = jourIsoDe(new Date(Date.now() - garder * 24 * 3600 * 1000));
    let retires = 0;
    for (const j of Object.keys(h)) {
      if (j < limite) { delete h[j]; retires++; }
    }
    return retires;
  }

  /* --------------------- Citations repliables ---------------------------- */

  // En lecture, la citation est rendue par un « ( », des liens internes, des
  // « ; » et un « ) ». On enveloppe l'ensemble pour pouvoir le masquer par
  // CSS, en laissant une pastille cliquable à sa place.
  rendreCitationsRepliables(el) {
    if (!this.settings.citationsRepliables) return;
    // Une citation contient forcément un lien interne : en l'absence de tout
    // lien, il est inutile de parcourir les blocs. La grande majorité des
    // paragraphes sort ici, en une seule interrogation du DOM.
    if (!el.querySelector || !el.querySelector('a.internal-link')) return;

    const blocs = el.querySelectorAll('p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6');
    for (const bloc of [el, ...blocs]) {
      if (!bloc.querySelector) continue;
      if (!bloc.querySelector('a.internal-link')) continue;
      if (bloc.querySelector('.zfa-cit')) continue;
      this.envelopperCitations(bloc);
    }
  }

  // Le tableau des enfants devient obsolète dès qu'une citation est
  // enveloppée : on relance donc une passe complète après chaque prise, plutôt
  // que de poursuivre sur une liste périmée. La borne évite toute boucle
  // infinie si un cas imprévu empêchait le repérage d'avancer.
  envelopperCitations(bloc) {
    for (let passe = 0; passe < 50; passe++) {
      if (!this.envelopperUneCitation(bloc)) return;
    }
  }

  envelopperUneCitation(bloc) {
    const enfants = Array.from(bloc.childNodes);
    for (let i = 0; i < enfants.length; i++) {
      const n = enfants[i];
      if (n.nodeType !== Node.TEXT_NODE || !n.nodeValue.endsWith('(')) continue;

      // On avance tant qu'on rencontre des liens internes et des séparateurs.
      let j = i + 1;
      let liens = 0;
      let ferme = null;
      while (j < enfants.length) {
        const suivant = enfants[j];
        if (suivant.nodeType === Node.ELEMENT_NODE
            && suivant.classList && suivant.classList.contains('internal-link')) {
          liens++; j++; continue;
        }
        if (suivant.nodeType === Node.TEXT_NODE) {
          const t = suivant.nodeValue;
          if (/^\s*;\s*$/.test(t)) { j++; continue; }
          if (t.startsWith(')')) { ferme = suivant; break; }
        }
        break;
      }
      if (!liens || !ferme) continue;

      // On coupe les parenthèses des textes qui les portent.
      n.nodeValue = n.nodeValue.slice(0, -1);
      ferme.nodeValue = ferme.nodeValue.slice(1);

      const enveloppe = document.createElement('span');
      enveloppe.className = 'zfa-cit';

      const pastille = document.createElement('span');
      pastille.className = 'zfa-cit-pastille';
      pastille.textContent = String(liens);
      pastille.setAttribute('aria-label', liens > 1
        ? liens + ' références — cliquer pour déplier'
        : 'Une référence — cliquer pour déplier');
      pastille.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        enveloppe.classList.toggle('zfa-cit--ouverte');
      });

      const contenu = document.createElement('span');
      contenu.className = 'zfa-cit-contenu';
      contenu.appendChild(document.createTextNode('('));
      for (let k = i + 1; k < j; k++) contenu.appendChild(enfants[k]);
      contenu.appendChild(document.createTextNode(')'));

      enveloppe.appendChild(pastille);
      enveloppe.appendChild(contenu);
      bloc.insertBefore(enveloppe, ferme);
      return true;
    }
    return false;
  }

  // L'état de repliement se lit sur le corps du document : le mode lecture est
  // ainsi piloté par la seule feuille de style, sans nouveau rendu.
  appliquerEtatCitations() {
    this._citVersion = (this._citVersion || 0) + 1;
    // Même reprise en main côté lecture : une citation dépliée d'un clic porte
    // sa propre exception, qui doit céder devant la commande globale.
    for (const e of document.querySelectorAll('.zfa-cit--ouverte')) {
      e.classList.remove('zfa-cit--ouverte');
    }
    document.body.classList.toggle(
      'zfa-citations-repliees',
      !!(this.settings.citationsRepliables && this.settings.citationsRepliees)
    );
    // En édition, il faut en revanche relancer le calcul des décorations.
    for (const feuille of this.app.workspace.getLeavesOfType('markdown')) {
      const cm = feuille.view && feuille.view.editor && feuille.view.editor.cm;
      if (cm && typeof cm.dispatch === 'function') {
        try { cm.dispatch({}); } catch (e) { /* vue non prête */ }
      }
    }
  }

  // L'affichage est modifié d'abord, l'enregistrement ensuite : attendre
  // l'écriture du fichier de réglages avant de rafraîchir ajoutait un délai
  // perceptible à chaque basculement.
  basculerCitations(replier) {
    this.settings.citationsRepliees = replier;
    // Aucune notification : le changement se voit à l'écran, l'annoncer en
    // plus ne fait qu'encombrer.
    this.appliquerEtatCitations();
    this.saveSettings().catch((e) => console.error('[Ariane] réglages non enregistrés :', e));
  }

  /* --------------------- Notes de lecture (notes-filles) ---------------- */

  // Table clé Zotero -> clé de citation, bâtie sur les fiches sources. Elle
  // permet de rendre à une citation de note-fille sa forme d'Ariane.
  indexParCleZotero() {
    const m = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (fm.citationKey && fm['zotero-key']) {
        m.set(String(fm['zotero-key']).trim(), '@' + String(fm.citationKey).trim());
      }
    }
    return m;
  }

  // Atomise les notes-filles d'une fiche source : une note par bloc, dans le
  // dossier des notes de lecture. Le lien vers la source suffit à la
  // réciprocité — Obsidian tient les rétroliens.
  async atomiserNotesLecture(fichierSource, parCleZotero) {
    if (this.settings.atomiserNotesLecture === false) return 0;
    const fm = (this.app.metadataCache.getFileCache(fichierSource) || {}).frontmatter || {};
    if (!fm.citationKey) return 0;
    const exclues = (this.settings.sourcesExclues || [])
      .map((x) => String(x).trim().replace(/^@/, '')).filter(Boolean);
    if (exclues.includes(String(fm.citationKey).trim())) return 0;
    const contenu = await this.app.vault.cachedRead(fichierSource);
    const blocs = extraireNotesFilles(contenu);
    if (!blocs.length) return 0;

    const table = parCleZotero || this.indexParCleZotero();
    const racine = this.settings.dossierNotesLecture || '2 - Notes de lecture';
    const dossier = racine + '/' + fichierSource.basename;
    await this.assurerDossier(racine);
    await this.assurerDossier(dossier);

    let faits = 0;
    for (const bloc of blocs) {
      const chemin = dossier + '/' + bloc.cle + '.md';
      const existant = this.app.vault.getAbstractFileByPath(chemin);
      if (existant) {
        const fmx = (this.app.metadataCache.getFileCache(existant) || {}).frontmatter || {};
        if (fmx['zotflow-locked'] === false || fmx.locked === true) continue; // note reprise à la main
      }
      const corps = citationsZotflowVersAriane(bloc.corps, table);
      const entete = [
        '---',
        'aliases:',
        '  - ' + JSON.stringify(bloc.titre || bloc.cle),
        'cssclasses:',
        '  - note-de-lecture',
        'zotflow-note-key: ' + bloc.cle,
        'zotflow-source: "[[' + fichierSource.basename + ']]"',
        'type: lecture',
        'zotflow-auto: true',
        '---',
        '',
      ].join('\n');
      await this.ecrire(chemin, entete + corps + '\n', existant || null);
      faits += 1;
    }
    return faits;
  }

  // Passe sur toutes les fiches sources. L'index des clés Zotero n'est bâti
  // qu'une fois : le refaire par source coûterait 736 lectures à chaque tour.
  async atomiserToutesNotesLecture() {
    const table = this.indexParCleZotero();
    let sources = 0, notes = 0;
    const notice = new obsidian.Notice(tr('Notes de lecture : atomisation…'), 0);
    try {
      for (const f of this.app.vault.getMarkdownFiles()) {
        const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
        if (!fm.citationKey) continue;
        const n = await this.atomiserNotesLecture(f, table);
        if (n) { sources += 1; notes += n; }
      }
    } finally {
      notice.hide();
    }
    new obsidian.Notice(tr('Notes de lecture : ') + notes + ' note(s) depuis ' + sources + ' source(s).');
    return notes;
  }

  /* ----------------------- Retour vers Zotero --------------------------- */

  // Les deux vues de lecture de zotflow. Leur état de feuille porte, tel quel,
  // { libraryID, itemKey } — et cette clé est celle de la PIÈCE JOINTE, la
  // même que Zotero attend. Aucun détour par la fiche source n'est nécessaire.
  estLecteurZotflow(vue) {
    if (!vue || typeof vue.getViewType !== 'function') return false;
    const t = vue.getViewType();
    return t === 'zotflow-zotero-reader-view' || t === 'zotflow-local-zotero-reader-view';
  }

  cibleLecteurZotflow(feuille) {
    if (!feuille || typeof feuille.getViewState !== 'function') return null;
    let etat = null;
    try { etat = (feuille.getViewState() || {}).state || null; } catch (e) { return null; }
    if (!etat || !etat.itemKey) return null;
    return { libraryID: etat.libraryID, itemKey: String(etat.itemKey) };
  }

  // La page en cours. On tente d'abord la vue vivante — sans rien supposer de
  // sa structure interne, qui appartient à zotflow — puis on se rabat sur
  // l'état que zotflow persiste dans ses réglages.
  async pageDuLecteur(vue, cible) {
    const sonder = (o, profondeur) => {
      if (!o || typeof o !== 'object' || profondeur > 3) return null;
      const p = o.primaryViewState;
      if (p && typeof p.pageIndex === 'number') return p.pageIndex;
      if (typeof o.pageIndex === 'number') return o.pageIndex;
      for (const cle of ['state', 'reader', 'viewer', 'viewState', '_state']) {
        const v = sonder(o[cle], profondeur + 1);
        if (v !== null) return v;
      }
      return null;
    };
    let idx = null;
    try { idx = sonder(vue, 0); } catch (e) { idx = null; }
    if (idx === null && cible) {
      try {
        const chemin = this.manifest.dir.replace(/[^/]+$/, 'zotflow') + '/data.json';
        if (await this.app.vault.adapter.exists(chemin)) {
          const d = JSON.parse(await this.app.vault.adapter.read(chemin));
          const e = (d.viewStates || {})[cible.libraryID + ':' + cible.itemKey];
          const p = e && e.primaryViewState;
          if (p && typeof p.pageIndex === 'number') idx = p.pageIndex;
        }
      } catch (e) { /* réglages de zotflow illisibles : on ouvrira sans page */ }
    }
    return (typeof idx === 'number' && idx >= 0) ? idx + 1 : null;   // pageIndex est à base zéro
  }

  async ouvrirLecteurDansZotero(feuille) {
    const f = feuille || this.app.workspace.activeLeaf;
    const cible = this.cibleLecteurZotflow(f);
    if (!cible) { new obsidian.Notice(tr("Ce n'est pas un lecteur ZotFlow.")); return; }
    const page = await this.pageDuLecteur(f ? f.view : null, cible);
    const uri = 'zotero://open-pdf/library/items/' + cible.itemKey
      + (page ? '?page=' + page : '');
    try {
      window.open(uri);
      console.log('[Ariane] Zotero —', uri);
    } catch (e) {
      new obsidian.Notice(tr('Ouverture dans Zotero impossible : ') + (e && e.message ? e.message : e));
    }
  }

  // Un bouton dans la barre d'actions du lecteur. On parcourt TOUTES les
  // feuilles, y compris celles des fenêtres détachées : trois fonctionnalités
  // se sont déjà cassées pour n'avoir couvert que la fenêtre principale.
  decorerLecteursZotflow() {
    this.app.workspace.iterateAllLeaves((feuille) => {
      const vue = feuille ? feuille.view : null;
      if (!this.estLecteurZotflow(vue)) return;
      if (vue._arianeBoutonZotero) return;
      if (typeof vue.addAction !== 'function') return;   // zotflow a changé : on n'insiste pas
      try {
        vue.addAction('external-link', 'Ouvrir dans Zotero (même page)',
          () => this.ouvrirLecteurDansZotero(feuille));
        vue._arianeBoutonZotero = true;
      } catch (e) { console.debug('[Ariane] bouton Zotero non posé', e); }
    });
  }

  // La fiche source de zotflow porte ses pièces jointes sous « ## Attachments »,
  // chacune sous la forme :
  //   - [nom.pdf](obsidian://zotflow?type=open-attachment&libraryID=…&key=T5HPDH45)
  // C'est cette clé de pièce jointe — et non celle de la référence — que Zotero
  // attend pour ouvrir le PDF.
  async cleAttachement(fichierSource) {
    try {
      const texte = await this.app.vault.cachedRead(fichierSource);
      const bloc = texte.split(/^##\s+Attachments\s*$/m)[1];
      if (!bloc) return null;
      const avant = bloc.split(/^##\s+/m)[0];
      const m = avant.match(/type=open-attachment[^)\n]*?[&;]key=([A-Za-z0-9]+)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  // Rend { source, annoKey, page, libraryId } si la note active se rattache à
  // Zotero, sinon null. Vaut pour une annotation comme pour une fiche source.
  cibleZotero(fichier) {
    const f = fichier || this.app.workspace.getActiveFile();
    if (!f || f.extension !== 'md') return null;
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    if (fm.citationKey) {
      return { source: f, annoKey: null, page: '', libraryId: fm['library-id'] || '' };
    }
    const src = fm['zotflow-source'];
    if (!src) return null;
    const cible = String(src).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const source = this.app.metadataCache.getFirstLinkpathDest(cible, f.path);
    if (!source) return null;
    const fms = (this.app.metadataCache.getFileCache(source) || {}).frontmatter || {};
    return {
      source,
      annoKey: fm['zotflow-anno-key'] ? String(fm['zotflow-anno-key']).trim() : null,
      page: fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '',
      libraryId: fms['library-id'] || '',
    };
  }

  async ouvrirDansZotero(fichier) {
    // Depuis un lecteur ZotFlow, la feuille active dit tout : on n'a pas
    // besoin de la note.
    if (!fichier) {
      const f = this.app.workspace.activeLeaf;
      if (f && this.estLecteurZotflow(f.view)) { await this.ouvrirLecteurDansZotero(f); return; }
    }
    const cible = this.cibleZotero(fichier);
    if (!cible) { new obsidian.Notice(tr('Cette note ne se rattache pas à une source Zotero.')); return; }
    const fms = (this.app.metadataCache.getFileCache(cible.source) || {}).frontmatter || {};
    const att = await this.cleAttachement(cible.source);
    let uri;
    if (att) {
      // Zotero replace le lecteur sur l'annotation quand on la lui nomme ;
      // à défaut, sur la page. Sans pièce jointe, on se rabat sur la fiche.
      const ancre = cible.annoKey
        ? '?annotation=' + encodeURIComponent(cible.annoKey)
        : (cible.page ? '?page=' + encodeURIComponent(cible.page) : '');
      uri = 'zotero://open-pdf/library/items/' + att + ancre;
    } else if (fms['zotero-key']) {
      uri = 'zotero://select/library/items/' + String(fms['zotero-key']).trim();
    } else {
      new obsidian.Notice(tr('Aucune pièce jointe ni clé Zotero dans « ') + cible.source.basename + ' ».');
      return;
    }
    try {
      window.open(uri);
      console.log('[Ariane] Zotero —', uri);
    } catch (e) {
      new obsidian.Notice(tr('Ouverture dans Zotero impossible : ') + (e && e.message ? e.message : e));
    }
  }

  /* -------------------------- Bibliographie ----------------------------- */

  // Note source (@citekey) correspondant à une clé citée : elle-même si c'en
  // est une, sinon la source de l'annotation.
  sourceDeCle(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(String(cle), '');
    if (!dest) return null;
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    if (fm.citationKey) return dest;
    const src = fm['zotflow-source'];
    if (!src) return null;
    const cible = String(src).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const f = this.app.metadataCache.getFirstLinkpathDest(cible, dest.path);
    return f || null;
  }

  // Sources citées dans le corps, dans l'ordre d'apparition, sans doublon.
  sourcesCitees(contenu) {
    const corps = corpsCitable(contenu);
    const vues = new Map();
    for (const m of corps.matchAll(/\[\[([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]/g)) {
      const f = this.sourceDeCle(cleDeLien(m[1]));
      if (f && !vues.has(f.path)) vues.set(f.path, f);
    }
    return [...vues.values()];
  }

  async majBibliographie(file, silencieux) {
    if (!file || file.extension !== 'md') return false;
    const avant = await this.app.vault.read(file);
    const sources = this.sourcesCitees(avant);

    // Aucune citation et aucun bloc existant : on n'ajoute rien.
    if (!sources.length && avant.indexOf(ZFA_BIBLIO_DEBUT) === -1) return false;

    const modele = this.settings.biblioModele;
    const champ = this.settings.biblioChamp || 'bibliographie';

    const entrees = [];
    for (const f of sources) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      // Référence déjà formatée par zotflow, sinon repli sur le modèle libre.
      let texte = nettoyerEntreeBiblio(fm[champ]);
      if (!texte) texte = entreeBiblio(f.basename, fm, modele);
      if (!texte) continue;
      entrees.push({
        texte,
        cle: f.basename,
        tri: entreeBiblio(f.basename, fm, '{{auteurs}} {{annee}}') || texte,
      });
    }

    if (this.settings.biblioTri !== 'apparition') {
      entrees.sort((a, b) => a.tri.localeCompare(b.tri, 'fr'));
    }

    const lignes = entrees.map((e) => (this.settings.biblioLien === false
      ? e.texte
      : entreeCliquable(e.texte, e.cle, this.settings.biblioLienTexte)));
    const bloc = construireBibliographie(lignes, this.settings.biblioTitre);
    const apres = injecterBibliographie(avant, bloc);
    if (apres === avant) return false;
    await this.ecrire(file.path, apres, file);
    if (!silencieux) new obsidian.Notice(tr('Bibliographie : ') + entrees.length + ' source(s).');
    return true;
  }

  async majBibliographieToutes() {
    const notes = this.notesConvertibles();
    const notice = new obsidian.Notice(tr('Bibliographies…'), 0);
    let n = 0;
    try {
      for (const f of notes) { if (await this.majBibliographie(f, true)) n++; }
    } finally { notice.hide(); }
    new obsidian.Notice(tr('Bibliographie mise à jour dans ') + n + ' note(s).');
  }

  // Une clé désigne-t-elle une annotation ou une note source citable ?
  estCitable(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(String(cle), '');
    if (!dest) return false;
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    return fm['zotflow-anno-key'] !== undefined || !!fm.citationKey;
  }

  async rafraichirCitations(portee) {
    let fichiers;
    if (portee === 'active') {
      const f = this.app.workspace.getActiveFile();
      if (!f || f.extension !== 'md') { new obsidian.Notice(tr('Ouvrez une note.')); return; }
      fichiers = [f];
    } else {
      fichiers = this.notesConvertibles();
    }
    const notice = new obsidian.Notice(tr('Rafraîchissement des citations…'), 0);
    let notes = 0, total = 0;
    try {
      for (const f of fichiers) {
        const avant = await this.app.vault.read(f);
        if (avant.indexOf('|') === -1) continue;
        const r = rafraichirLibelles(avant, (c) => this.libelleCitation(c), (c) => this.estCitable(c));
        if (!r.n || r.texte === avant) continue;
        await this.ecrire(f.path, r.texte, f);
        notes++; total += r.n;
      }
    } finally { notice.hide(); }
    new obsidian.Notice(total
      ? total + ' citation(s) mise(s) à jour dans ' + notes + ' note(s).'
      : 'Toutes les citations sont déjà à jour.');
  }

  // Libellé lisible d'une annotation : « Méric et al., 2009, p. 2 ».
  // Met en forme un libellé « Auteurs, année, p. X » à partir de composants.
  formatCitation(a, page, cle) {
    const vars = {
      auteur: a ? a.court : '',
      auteurs: a ? a.court : '',
      auteursComplets: a ? a.complet : '',
      annee: a ? a.annee : '',
      page: page || '',
      key: cle || '',
    };
    return appliquerModele(this.settings.modeleCitation || '{{auteurs}}, {{annee}}, p. {{page}}', vars)
      .replace(/,\s*p\.\s*(?=$|[;,)])/g, '')
      .replace(/\s*,\s*(?=,)/g, '')
      .replace(/^[\s,;]+|[\s,;]+$/g, '')
      .replace(/\s{2,}/g, ' ');
  }

  // Libellé d'une citation. Trois cas :
  //  - note source : ses propres auteurs, sans page ;
  //  - annotation sans référence citée : auteurs de la source + page ;
  //  - annotation citant un travail tiers : ce travail, suivi de « cité dans »
  //    et de la source réellement consultée — sauf si ce travail figure lui
  //    aussi dans Zotero, auquel cas il est cité directement.
  libelleCitation(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    const fm = dest ? ((this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {}) : {};

    if (fm['zotflow-anno-key'] === undefined) {
      return this.formatCitation(this.auteursDepuisReference('[[' + cle + ']]', ''), '', cle) || cle;
    }

    const pageAnno = fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '';
    const src = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const libSource = this.formatCitation(
      src ? this.auteursDepuisReference('[[' + src + ']]', dest ? dest.path : '') : null, pageAnno, cle);

    // Références citées distinctes de la source. Une annotation peut en
    // porter plusieurs : elles sont toutes retenues, et non la première
    // seulement. Celles qui figurent dans Zotero sont citées directement,
    // les autres sont regroupées derrière un unique « cité dans ».
    let refs = fm['références-citées'];
    refs = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    const pages = fm['références-pages'] || {};
    const sep = this.settings.separateurCitation || ' ; ';
    const directes = [];
    const indirectes = [];

    for (const rv of refs) {
      const cible = String(rv).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').replace(/#.*/, '').trim();
      if (!cible || cible === src) continue;

      const pageRef = String(pages[cible] != null ? pages[cible] : '').replace(/^["']|["']$/g, '').trim();
      const dansZotero = cible.startsWith('@')
        || !!(this.app.metadataCache.getFirstLinkpathDest(cible, '')
          && ((this.app.metadataCache.getFileCache(
            this.app.metadataCache.getFirstLinkpathDest(cible, '')) || {}).frontmatter || {}).citationKey);

      const libRef = this.formatCitation(
        this.auteursDepuisReference('[[' + cible + ']]', dest ? dest.path : ''), pageRef, cible);
      if (!libRef) continue;

      // Consultée directement : citation simple. Sinon : citation de seconde main.
      (dansZotero ? directes : indirectes).push(libRef);
    }

    const morceaux = [];
    if (directes.length) morceaux.push(directes.join(sep));

    if (indirectes.length) {
      if (this.settings.citationsIndirectesAbregees !== false) {
        // Forme abrégée : la source porte le nombre de travaux qu'elle
        // rapporte. La portée du « cité dans » cesse d'être ambiguë, puisque
        // les emprunts sont rattachés à leur source au lieu d'être alignés
        // à côté des citations directes.
        morceaux.push(libSource + ' ' + this.marqueEmprunt(indirectes.length));
      } else {
        // Forme complète. L'accord au pluriel signale au moins qu'il y a
        // plusieurs emprunts derrière un même « cité dans ».
        const mention = this.settings.citeDans || ', cité dans ';
        // « \b » ne marque pas de frontière après « é », qui n'est pas un
        // caractère de mot : on vise donc explicitement « cité dans ».
        const accorde = indirectes.length > 1
          ? mention.replace(/cité(\s+dans)/, 'cités$1')
          : mention;
        morceaux.push(indirectes.join(sep) + accorde + libSource);
      }
    }
    if (morceaux.length) return morceaux.join(sep);

    return libSource || cle;
  }

  // Motif du compteur, dérivé du modèle de réglage : « ⟨{{n}}⟩ » -> /⟨(\d+)⟩/
  motifEmprunt() {
    const modele = this.settings.citationsMarqueEmprunt || '⟨{{n}}⟩';
    const echappe = modele.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(echappe.replace('\\{\\{n\\}\\}', '(\\d+)').replace('{{n}}', '(\\d+)'));
  }

  // Infobulle listant les travaux rapportés, en liens cliquables. Une seule
  // bulle vit à la fois ; elle se ferme au départ du pointeur.
  ouvrirBulleEmprunts(ancre, cle) {
    this.fermerBulleEmprunts();
    const emprunts = this.empruntsDeAnnotation(cle);
    if (!emprunts.length) return;

    const bulle = document.createElement('div');
    bulle.className = 'zfa-bulle-emprunts';

    const source = this.sourceLisible(cle);
    const entete = bulle.createDiv({ cls: 'zfa-bulle-entete' });
    entete.setText(emprunts.length > 1
      ? 'Travaux rapportés par ' + (source || 'cette source')
      : 'Travail rapporté par ' + (source || 'cette source'));

    for (const e of emprunts) {
      const l = bulle.createDiv({ cls: 'zfa-bulle-item' });
      const a = l.createEl('a', { cls: 'internal-link', text: e.libelle });
      a.setAttr('href', e.cible);
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.app.workspace.openLinkText(e.cible, e.chemin, ev.ctrlKey || ev.metaKey);
        this.fermerBulleEmprunts();
      });
    }

    document.body.appendChild(bulle);
    const r = ancre.getBoundingClientRect();
    bulle.style.left = Math.max(8, Math.min(r.left, window.innerWidth - bulle.offsetWidth - 8)) + 'px';
    const dessous = r.bottom + 6;
    bulle.style.top = (dessous + bulle.offsetHeight > window.innerHeight
      ? Math.max(8, r.top - bulle.offsetHeight - 6) : dessous) + 'px';

    // La bulle reste tant que le pointeur est sur elle ou sur le compteur.
    let sortie = null;
    const partir = () => { sortie = window.setTimeout(() => this.fermerBulleEmprunts(), 220); };
    const rester = () => { if (sortie) { window.clearTimeout(sortie); sortie = null; } };
    ancre.addEventListener('mouseleave', partir);
    bulle.addEventListener('mouseenter', rester);
    bulle.addEventListener('mouseleave', partir);
    this._bulleEmprunts = bulle;
  }

  fermerBulleEmprunts() {
    if (this._bulleEmprunts) {
      this._bulleEmprunts.remove();
      this._bulleEmprunts = null;
    }
  }

  // En lecture : le compteur est un morceau de texte dans le lien de citation.
  // On l'isole pour lui accrocher la bulle, sans toucher au lien lui-même.
  enrichirCompteursEmprunts(el) {
    if (!el.querySelectorAll) return;
    const motif = this.motifEmprunt();
    for (const a of el.querySelectorAll('a.internal-link')) {
      if (a.querySelector('.zfa-emprunt')) continue;
      const cle = (a.getAttribute('data-href') || a.getAttribute('href') || '')
        .replace(/#.*$/, '').trim();
      if (!cle) continue;
      for (const noeud of Array.from(a.childNodes)) {
        if (noeud.nodeType !== Node.TEXT_NODE) continue;
        const m = noeud.nodeValue.match(motif);
        if (!m) continue;
        const apres = noeud.splitText(m.index);
        apres.nodeValue = apres.nodeValue.slice(m[0].length);
        const marque = document.createElement('span');
        marque.className = 'zfa-emprunt';
        marque.textContent = m[0];
        marque.setAttribute('aria-label', m[1] + ' travaux rapportés');
        marque.addEventListener('mouseenter', () => this.ouvrirBulleEmprunts(marque, cle));
        a.insertBefore(marque, apres);
        break;
      }
    }
  }

  // Compteur d'emprunts accolé à la source consultée.
  marqueEmprunt(n) {
    const modele = this.settings.citationsMarqueEmprunt || '⟨{{n}}⟩';
    return modele.replace(/\{\{n\}\}/g, String(n));
  }

  // Références rapportées par une annotation, pour l'infobulle du compteur.
  // Rend les cibles telles qu'écrites, afin qu'elles restent cliquables.
  empruntsDeAnnotation(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!dest) return [];
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    if (fm['zotflow-anno-key'] === undefined) return [];

    const src = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    let refs = fm['références-citées'];
    refs = Array.isArray(refs) ? refs : (refs ? [refs] : []);
    const pages = fm['références-pages'] || {};
    const out = [];
    for (const rv of refs) {
      const cible = String(rv).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').replace(/#.*/, '').trim();
      if (!cible || cible === src) continue;
      const dansZotero = cible.startsWith('@')
        || !!(this.app.metadataCache.getFirstLinkpathDest(cible, '')
          && ((this.app.metadataCache.getFileCache(
            this.app.metadataCache.getFirstLinkpathDest(cible, '')) || {}).frontmatter || {}).citationKey);
      if (dansZotero) continue; // citée directement, elle figure déjà en clair
      const page = String(pages[cible] != null ? pages[cible] : '').replace(/^["']|["']$/g, '').trim();
      const libelle = this.formatCitation(
        this.auteursDepuisReference('[[' + cible + ']]', dest.path), page, cible) || cible;
      out.push({ cible, libelle, chemin: dest.path });
    }
    return out;
  }

  // Source consultée d'une annotation, pour l'en-tête de l'infobulle.
  sourceLisible(cle) {
    const dest = this.app.metadataCache.getFirstLinkpathDest(cle, '');
    if (!dest) return '';
    const fm = (this.app.metadataCache.getFileCache(dest) || {}).frontmatter || {};
    const src = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    if (!src) return '';
    const page = fm.page != null ? String(fm.page).replace(/^["']|["']$/g, '').trim() : '';
    return this.formatCitation(this.auteursDepuisReference('[[' + src + ']]', dest.path), page, cle) || src;
  }



  // Mode « citation classique » : insère « ([[clé|Auteur, année, p. X]]) » au
  // point visé, ou complète le groupe de citations déjà présent à cet endroit.
  attacherCitation(cm, lineNumber, cles, insertOffset) {
    const doc = cm.state.doc;
    const docStr = doc.toString();
    const ligneFin = doc.line(lineNumber);
    const sep = this.settings.separateurCitation || ' ; ';

    // La citation se place toujours AVANT la ponctuation finale. En dépôt sur
    // la phrase, l'offset est déjà calculé ainsi ; en dépôt sur le paragraphe,
    // on vise la ponctuation qui termine la ligne.
    let pos;
    if (insertOffset != null) {
      pos = insertOffset;
    } else {
      const txt = ligneFin.text;
      const mFin = masquerLiens(txt).match(/[.?!…][ \t]*$/);
      if (mFin) {
        let i = mFin.index;
        while (i > 0 && /[ \t\u00a0\u202f]/.test(txt[i - 1])) i--;
        pos = ligneFin.from + i;
      } else {
        pos = ligneFin.to;
      }
    }

    // Ne pas citer deux fois la même annotation dans le voisinage immédiat.
    const voisinage = docStr.slice(Math.max(0, pos - 400), pos + 400);
    const entrees = cles
      .filter((c) => voisinage.indexOf('[[' + c + '|') === -1)
      .map((c) => '[[' + c + '|' + this.libelleCitation(c) + ']]');

    const modif = composerCitation(docStr, pos, entrees, sep);
    if (!modif) return false;
    cm.dispatch({ changes: [modif] });
    return true;
  }

  attacherAnnotationParagraphe(cm, lineNumber, cles, insertOffset) {
    cles = (Array.isArray(cles) ? cles : [cles]).filter(Boolean);
    if (!cles.length) return false;
    return this.attacherCitation(cm, lineNumber, cles, insertOffset);
  }

  // Retire dynamiquement les définitions de notes de bas de page orphelines
  // (appel disparu) gérées par le plugin. Déclenché, avec anti-rebond, à
  // chaque modification de l'éditeur.
  nettoyageNotesOrphelines(editor) {
    if (!this.settings.nettoyerNotesOrphelines) return;
    if (!editor || !editor.cm) return;
    const cm = editor.cm;
    const docStr = cm.state.doc.toString();
    const ranges = rangesNotesOrphelines(docStr, this.settings.titreSectionNotes || '');
    if (!ranges.length) return;
    cm.dispatch({ changes: ranges.map((r) => ({ from: r.from, to: r.to })) });
  }

  /* ------------------------------ Événements DnD ------------------------- */

  surDragOverParagraphe(e) {
    if (!this.settings.dropSurParagraphe) return;
    const doc = this.docDeEvenement(e);
    const cm = this.cmSousPoint(e.clientX, e.clientY, doc);
    if (!cm) { this.nettoyerZoneDrop(); return; }
    const pos = cm.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null || !this.ligneEstParagraphe(cm.state.doc, cm.state.doc.lineAt(pos).number)) {
      this.nettoyerZoneDrop();
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    // Sur le texte -> mode phrase ; dans la marge gauche du paragraphe -> mode paragraphe.
    if (this.modeDrop(e, doc) === 'phrase' && this.effetPhrase) {
      this.surlignerPhrase(cm, pos);
      return;
    }
    this.effacerSurlignagePhrase();
    const ligneDom = this.ligneDomPour(cm, cm.state.doc.lineAt(pos).from);
    if (ligneDom && ligneDom !== this.zoneDrop) {
      if (this.zoneDrop) this.zoneDrop.classList.remove('zfa-drop-cible');
      ligneDom.classList.add('zfa-drop-cible');
      this.zoneDrop = ligneDom;
    }
  }

  // Détermine le mode de dépôt selon la position du survol : sur le texte
  // (au-dessus d'une .cm-line) -> « phrase » ; dans la marge gauche -> « paragraphe ».
  modeDrop(e, doc) {
    const el = doc.elementFromPoint(e.clientX, e.clientY);
    const surTexte = el && el.closest && el.closest('.cm-line');
    return surTexte ? 'phrase' : 'paragraphe';
  }

  // Retrouve l'élément .cm-line correspondant à une position, même quand le
  // survol a lieu dans la marge (hors de tout .cm-line sous le curseur).
  ligneDomPour(cm, pos) {
    try {
      const d = cm.domAtPos(pos);
      let n = d && d.node;
      if (n && n.nodeType === 3) n = n.parentElement;
      return n && n.closest ? n.closest('.cm-line') : null;
    } catch (e) {
      return null;
    }
  }

  // Surligne, via une décoration CodeMirror, la phrase visée sous le point de dépôt.
  surlignerPhrase(cm, pos) {
    const ligne = cm.state.doc.lineAt(pos);
    const localOff = pos - ligne.from;
    const from = ligne.from + debutPhrase(ligne.text, localOff);
    const to = ligne.from + finDePhrase(ligne.text, localOff);
    // Retire un éventuel surlignage de paragraphe hérité.
    if (this.zoneDrop) { this.zoneDrop.classList.remove('zfa-drop-cible'); this.zoneDrop = null; }
    if (to <= from) { this.effacerSurlignagePhrase(); return; }
    if (this.cmPhrase && this.cmPhrase !== cm) this.effacerSurlignagePhrase();
    if (this.cmPhrase === cm && this.phraseRange && this.phraseRange.from === from && this.phraseRange.to === to) return;
    this.cmPhrase = cm;
    this.phraseRange = { from, to };
    try { cm.dispatch({ effects: this.effetPhrase.of({ from, to }) }); } catch (e) { /* silencieux */ }
  }

  effacerSurlignagePhrase() {
    if (this.cmPhrase && this.effetPhrase) {
      try { this.cmPhrase.dispatch({ effects: this.effetPhrase.of(null) }); } catch (e) { /* silencieux */ }
    }
    this.cmPhrase = null;
    this.phraseRange = null;
  }

  surDropParagraphe(e) {
    if (!this.settings.dropSurParagraphe) return;
    const doc = this.docDeEvenement(e);
    const cm = this.cmSousPoint(e.clientX, e.clientY, doc);
    if (!cm) { this.nettoyerZoneDrop(); return; }
    const pos = cm.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) { this.nettoyerZoneDrop(); return; }
    const n = cm.state.doc.lineAt(pos).number;
    if (!this.ligneEstParagraphe(cm.state.doc, n)) { this.nettoyerZoneDrop(); return; }
    // Dépôt groupé depuis le panier flottant, sinon annotation unique glissée.
    let cles;
    if (this.glisseDepuisPanier && this.panier && this.panier.length) {
      cles = this.panier.slice();
    } else {
      const cle = this.obtenirCleGlissee(e);
      if (!cle) { this.nettoyerZoneDrop(); return; }
      cles = [cle];
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    // Dépôt sur le texte -> fin de la phrase visée ; dans la marge -> paragraphe.
    let insertOffset;
    if (this.modeDrop(e, doc) === 'phrase') {
      const ligne = cm.state.doc.lineAt(pos);
      insertOffset = ligne.from + finDePhraseAvantPonct(ligne.text, pos - ligne.from);
    }
    this.attacherAnnotationParagraphe(cm, n, cles, insertOffset);
    this.nettoyerZoneDrop();
  }

  nettoyerZoneDrop() {
    if (this.zoneDrop) {
      this.zoneDrop.classList.remove('zfa-drop-cible');
      this.zoneDrop = null;
    }
    this.effacerSurlignagePhrase();
  }

  /* --------------------------- Panier flottant --------------------------- */

  basculerPanier() {
    if (this.panierEl) this.fermerPanier();
    else this.creerPanier();
  }

  fermerPanier() {
    if (this.panierEl) {
      this.panierEl.remove();
      this.panierEl = null;
      this.panierListe = null;
    }
  }

  creerPanier() {
    const el = document.createElement('div');
    el.className = 'zfa-panier';
    el.style.top = '80px';
    el.style.right = '30px';

    const header = el.createDiv({ cls: 'zfa-panier-header' });
    this.panierTitre = header.createSpan({ cls: 'zfa-panier-titre', text: tr("Panier d'annotations") });
    const fermer = header.createSpan({ cls: 'zfa-panier-fermer', text: tr('✕') });
    fermer.onclick = () => this.fermerPanier();

    this.panierListe = el.createDiv({ cls: 'zfa-panier-liste' });

    const pied = el.createDiv({ cls: 'zfa-panier-pied' });
    const poignee = pied.createDiv({ cls: 'zfa-panier-deposer', text: tr('⇱ Glisser sur un paragraphe') });
    poignee.setAttribute('draggable', 'true');
    poignee.addEventListener('dragstart', (e) => {
      this.glisseDepuisPanier = true;
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', 'zfa-panier');
        e.dataTransfer.effectAllowed = 'copy';
      }
    });
    poignee.addEventListener('dragend', () => { this.glisseDepuisPanier = false; });

    const btns = pied.createDiv({ cls: 'zfa-panier-boutons' });
    const bDep = btns.createEl('button', { cls: 'zfa-panier-btn', text: tr('Déposer sur le curseur') });
    bDep.onclick = () => this.deposerPanierSurCurseur();
    const bVide = btns.createEl('button', { cls: 'zfa-panier-btn', text: tr('Vider') });
    bVide.onclick = () => this.viderPanier();

    this.rendreDeplacable(el, header);

    // Recevoir des annotations glissées dans le panier.
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      if (!this.glisseDepuisPanier) el.classList.add('zfa-panier-survol');
    });
    el.addEventListener('dragleave', () => el.classList.remove('zfa-panier-survol'));
    el.addEventListener('drop', (e) => {
      el.classList.remove('zfa-panier-survol');
      if (this.glisseDepuisPanier) return; // ne pas s'auto-recevoir
      const cle = this.obtenirCleGlissee(e);
      if (cle) {
        e.preventDefault();
        e.stopPropagation();
        this.ajouterAuPanier(cle);
      }
    });

    document.body.appendChild(el);
    this.panierEl = el;
    this.rendrePanier();
  }

  rendreDeplacable(el, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, actif = false;
    const surMouvement = (e) => {
      if (!actif) return;
      el.style.left = (ox + e.clientX - sx) + 'px';
      el.style.top = (oy + e.clientY - sy) + 'px';
      el.style.right = 'auto';
    };
    const surRelache = () => {
      actif = false;
      document.removeEventListener('mousemove', surMouvement);
      document.removeEventListener('mouseup', surRelache);
    };
    handle.addEventListener('mousedown', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('zfa-panier-fermer')) return;
      const rect = el.getBoundingClientRect();
      ox = rect.left; oy = rect.top; sx = e.clientX; sy = e.clientY;
      el.style.left = rect.left + 'px';
      el.style.top = rect.top + 'px';
      el.style.right = 'auto';
      actif = true;
      document.addEventListener('mousemove', surMouvement);
      document.addEventListener('mouseup', surRelache);
      e.preventDefault();
    });
  }

  ajouterAuPanier(cle) {
    if (!this.panier.includes(cle)) this.panier.push(cle);
    this.rendrePanier();
  }

  retirerDuPanier(cle) {
    this.panier = this.panier.filter((c) => c !== cle);
    this.rendrePanier();
  }

  viderPanier() {
    this.panier = [];
    this.rendrePanier();
  }

  rendrePanier() {
    if (this.panierTitre) {
      this.panierTitre.textContent = "Panier d'annotations (" + this.panier.length + ')';
    }
    if (!this.panierListe) return;
    this.panierListe.empty();
    if (!this.panier.length) {
      this.panierListe.createDiv({ cls: 'zfa-panier-vide', text: tr('Glissez des annotations ici…') });
      return;
    }
    for (const cle of this.panier) {
      const item = this.panierListe.createDiv({ cls: 'zfa-panier-item' });
      const titre = this.titreAnnotationCiblee(cle, '') || cle;
      item.createSpan({ cls: 'zfa-panier-item-txt', text: titre });
      const x = item.createSpan({ cls: 'zfa-panier-item-x', text: tr('✕') });
      x.onclick = () => this.retirerDuPanier(cle);
    }
  }

  deposerPanierSurCurseur() {
    const view = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view || !view.editor || !view.editor.cm) {
      new obsidian.Notice(tr('Ouvrez une note en mode édition.'));
      return;
    }
    if (!this.panier.length) {
      new obsidian.Notice(tr('Le panier est vide.'));
      return;
    }
    const cm = view.editor.cm;
    const n = view.editor.getCursor().line + 1;
    if (!this.ligneEstParagraphe(cm.state.doc, n)) {
      new obsidian.Notice(tr('Placez le curseur dans un paragraphe.'));
      return;
    }
    this.attacherAnnotationParagraphe(cm, n, this.panier.slice());
    new obsidian.Notice(this.panier.length + ' annotation(s) déposée(s) en note de bas de page.');
  }

  /* ------------- Tag « orpheline » (annotations à 0 appel) --------------- */

  // Ajoute ou retire le tag orpheline dans l'entête, sans toucher au corps.
  async appliquerTagOrpheline(file, orpheline) {
    const tag = this.settings.tagOrpheline || 'orphelin';
    this.marquerEcriture(file.path);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      let tags = fm.tags;
      if (Array.isArray(tags)) { /* garder */ }
      else if (typeof tags === 'string' && tags.trim()) tags = [tags];
      else tags = [];
      tags = tags.filter((t) => String(t).replace(/^#/, '') !== tag);
      if (orpheline) tags.push(tag);
      if (tags.length) fm.tags = tags;
      else delete fm.tags;
    });
  }

  // Met à jour le tag orpheline sur toutes les annotations selon leur
  // nombre d'appels (notes distinctes qui les citent).
  async synchroniserTagsOrphelines() {
    if (!this.settings.marquerOrphelines) return;
    const tag = this.settings.tagOrpheline || 'orphelin';
    const resolved = this.app.metadataCache.resolvedLinks || {};
    const counts = new Map();
    for (const source in resolved) {
      for (const cible in resolved[source]) {
        if (cible === source) continue;
        counts.set(cible, (counts.get(cible) || 0) + 1);
      }
    }
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-anno-key'] === undefined) continue;
      const orpheline = (counts.get(f.path) || 0) === 0;
      let present = false;
      const tg = fm.tags;
      if (Array.isArray(tg)) present = tg.some((t) => String(t).replace(/^#/, '') === tag);
      else if (typeof tg === 'string') present = tg.replace(/^#/, '') === tag;
      if (orpheline !== present) await this.appliquerTagOrpheline(f, orpheline);
    }
  }

  async retirerTousTagsOrphelines() {
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-anno-key'] === undefined) continue;
      await this.appliquerTagOrpheline(f, false);
    }
  }

  async loadSettings() {
    const charge = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, charge || {});
    this.settings.correspondancesSuffixe = migrerCorrespondances(this.settings.correspondancesSuffixe);
    if (!Array.isArray(this.settings.profils) || this.settings.profils.length === 0) {
      this.settings.profils = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.profils));
    }
    definirLangue(this.settings.langue || 'auto');

    // Reprise des anciens réglages de dossiers vers la table des familles.
    const migrees = this.migrerFamilles();
    if (migrees) console.log('[Ariane] familles de notes reprises des anciens réglages :', migrees);

    // Migration : titre cliquable (ancien modèle par défaut -> nouveau).
    const ancienModele = '**{{title}}**\n\n{{image}}\n\n{{paraphrase}}\n\n{{citation}}\n\nSource : {{source}}\n\n{{references}}';
    if (this.settings.modeleNote === ancienModele) this.settings.modeleNote = DEFAULT_SETTINGS.modeleNote;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /* --------------------- Renommage d'une propriété ---------------------- */

  // Changer le nom d'une propriété dans les réglages ne touche que les
  // écritures À VENIR : les notes déjà écrites gardent l'ancien nom. D'où cet
  // outil, qui reporte l'ancienne valeur sur la nouvelle dans tout le coffre.
  notesAvecPropriete(nom) {
    const cle = String(nom || '').trim();
    if (!cle) return [];
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (fm && Object.prototype.hasOwnProperty.call(fm, cle)) out.push(f);
    }
    return out;
  }

  // Rend { faites, ignorees, echecs }. Une note qui porte déjà la nouvelle
  // propriété n'est pas touchée : on ne remplace jamais une valeur existante.
  async renommerPropriete(ancien, nouveau) {
    const a = String(ancien || '').trim();
    const n = String(nouveau || '').trim();
    if (!a || !n || a === n) return { faites: 0, ignorees: 0, echecs: 0 };
    let faites = 0, ignorees = 0, echecs = 0;
    for (const f of this.notesAvecPropriete(a)) {
      try {
        let saute = false;
        this.marquerEcriture(f.path);
        await this.app.fileManager.processFrontMatter(f, (fm) => {
          if (!Object.prototype.hasOwnProperty.call(fm, a)) { saute = true; return; }
          if (Object.prototype.hasOwnProperty.call(fm, n) && fm[n] !== null && fm[n] !== '') {
            saute = true; return;
          }
          fm[n] = fm[a];
          delete fm[a];
        });
        if (saute) ignorees += 1; else faites += 1;
      } catch (e) {
        echecs += 1;
        console.error('[Ariane] renommage de propriété', f.path, e);
      }
    }
    return { faites, ignorees, echecs };
  }

  /* --------------------------- Profil portable --------------------------- */

  // Ce qui ne voyage pas : chemins absolus et adresses de services locaux.
  // Un profil partagé ne doit jamais imposer l'installation de qui l'a écrit.
  static get CLES_MACHINE() {
    return ['exportPandocBin', 'exportFiltreLua', 'exportModeleWord',
            'suggOllamaUrl', 'suggLmStudioUrl'];
  }

  // Ce qui ne voyage pas non plus : l'état accumulé, propre au coffre.
  static get CLES_ETAT() {
    return ['tempsTotalSecondes', 'tempsHistorique', 'rattachementsIgnores',
            'famillesNotes', 'dossierAnnotations', 'dossierNotesLecture',
            'dossierReferences', 'dossierBibliographies', 'exportDossier',
            'dossierTaches', 'tempsDossierJournal'];
  }

  profilExportable(avecOrganisation) {
    const hors = new Set(ZotflowAtomiser.CLES_MACHINE);
    if (!avecOrganisation) for (const k of ZotflowAtomiser.CLES_ETAT) hors.add(k);
    const out = {};
    for (const [k, v] of Object.entries(this.settings)) if (!hors.has(k)) out[k] = v;
    return { ariane: this.manifest.version, profil: out };
  }

  async ecrireProfil(avecOrganisation) {
    const nom = 'Ariane - profil' + (avecOrganisation ? ' (avec organisation)' : '') + '.json';
    const chemin = this.manifest.dir + '/' + nom;
    await this.app.vault.adapter.write(chemin,
      JSON.stringify(this.profilExportable(avecOrganisation), null, 2));
    return chemin;
  }

  // À l'import, on ne touche jamais aux clés de machine, même si le fichier
  // en contient : le chemin de pandoc de quelqu'un d'autre n'a aucun sens ici.
  async importerProfil(texte) {
    let j = null;
    try { j = JSON.parse(texte); } catch (e) { return { erreur: 'Fichier illisible (JSON invalide).' }; }
    const profil = (j && j.profil) || j;
    if (!profil || typeof profil !== 'object') return { erreur: 'Ce fichier ne contient pas de profil.' };
    const machine = new Set(ZotflowAtomiser.CLES_MACHINE);
    let n = 0;
    for (const [k, v] of Object.entries(profil)) {
      if (machine.has(k)) continue;
      if (!(k in DEFAULT_SETTINGS)) continue;   // clé inconnue : on l'ignore
      this.settings[k] = v;
      n += 1;
    }
    await this.saveSettings();
    return { poses: n, version: j && j.ariane };
  }

  /* ------------------------ Familles de notes --------------------------- */

  // Une famille : un libellé, un ou PLUSIEURS dossiers, un préfixe facultatif,
  // et ce qu'Ariane doit en faire. Rien n'y est imposé : c'est l'utilisateur
  // qui décrit son organisation, et non le greffon qui présume la sienne.
  familles() {
    const brut = Array.isArray(this.settings.famillesNotes) ? this.settings.famillesNotes : [];
    return brut.map((f) => ({
      nom: String((f && f.nom) || '').trim(),
      dossiers: (Array.isArray(f && f.dossiers) ? f.dossiers : [])
        .map((d) => String(d || '').trim().replace(/^\/+|\/+$/g, '')).filter(Boolean),
      prefixe: String((f && f.prefixe) || '').trim(),
      aparte: (f && f.aparte) !== false,
      suggestions: !!(f && f.suggestions),
      couleur: String((f && f.couleur) || '').trim(),
      icone: String((f && f.icone) || '').trim(),
      monospace: !!(f && f.monospace),
      alias: !!(f && f.alias),
    })).filter((f) => f.dossiers.length || f.prefixe);
  }

  // Une note appartient à une famille par son dossier — sous-dossiers compris —
  // ou par son préfixe de nom. Le dossier prime : le préfixe n'est qu'un
  // filet de sécurité pour les notes rangées ailleurs.
  familleDuChemin(chemin, basename) {
    const c = String(chemin || '');
    const n = String(basename || c.split('/').pop() || '').replace(/\.md$/i, '');
    const fams = this.familles();
    for (const f of fams) {
      if (f.dossiers.some((d) => c === d + '.md' || c.startsWith(d + '/'))) return f;
    }
    for (const f of fams) {
      if (f.prefixe && n.startsWith(f.prefixe)) return f;
    }
    return null;
  }

  // Tous les dossiers dont les notes nourrissent les suggestions.
  dossiersSuggeres() {
    const out = [];
    for (const f of this.familles()) {
      if (!f.suggestions) continue;
      for (const d of f.dossiers) if (!out.includes(d)) out.push(d);
    }
    return out;
  }

  // Couleur et icône d'un dossier, portées par sa famille.
  styleDuDossier(dossier) {
    const d = String(dossier || '').trim();
    for (const f of this.familles()) {
      if (f.dossiers.includes(d)) return { couleur: f.couleur, icone: f.icone };
    }
    return {};
  }

  dossiersDeFamille(propriete) {
    const out = [];
    for (const f of this.familles()) {
      if (!f[propriete]) continue;
      for (const d of f.dossiers) if (!out.includes(d)) out.push(d);
    }
    return out;
  }

  // Reprise des anciens réglages : l'utilisateur ne doit rien ressaisir. On ne
  // migre qu'une fois, et seulement si la table est encore vide.
  // Propose un rôle par dossier dont le nom s'en approche. On ne remplit que
  // les rôles restés vides : jamais on n'écrase un choix de l'utilisateur.
  proposerRoles() {
    const racines = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const parts = f.path.split('/');
      for (let i = 1; i <= Math.min(2, parts.length - 1); i++) racines.add(parts.slice(0, i).join('/'));
    }
    const sansAccent = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const indices = [
      ['dossierAnnotations', ['annotation']],
      ['dossierNotesLecture', ['note de lecture', 'notes de lecture', 'lecture']],
      ['dossierReferences', ['reference en attente', 'references en attente', 'en attente']],
      ['dossierTaches', ['tache', 'taches']],
      ['dossierBibliographies', ['bibliographie citee', 'bibliographies citees', 'biblio']],
      ['exportDossier', ['livrable', 'export', 'document']],
      ['tempsDossierJournal', ['journal']],
    ];
    let poses = 0;
    for (const [cle, mots] of indices) {
      if (this.settings[cle]) continue;
      let choisi = null;
      for (const d of racines) {
        const n = sansAccent(d);
        if (mots.some((m) => n.includes(m))) {
          if (!choisi || d.length < choisi.length) choisi = d;
        }
      }
      if (choisi) { this.settings[cle] = choisi; poses += 1; }
    }
    return poses;
  }

  // Propose une famille par dossier qui porte des notes — sous-dossiers
  // compris, car les vôtres comptent : les comptes-rendus et les notes
  // préparatoires vivent sous « Livrables ». Le préfixe est DÉDUIT des noms de
  // fichiers : si toutes les notes d'un dossier commencent pareil, c'en est un.
  familiesProposees() {
    const parDossier = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const parts = f.path.split('/');
      if (parts.length < 2) continue;
      const dossier = parts.slice(0, -1).join('/');
      if (dossier.startsWith('.')) continue;
      if (!parDossier.has(dossier)) parDossier.set(dossier, []);
      parDossier.get(dossier).push(f.basename);
    }
    // Un dossier dont TOUS les sous-dossiers sont déjà proposés n'apporte rien.
    const deja = new Set();
    for (const f of this.familles()) for (const d of f.dossiers) deja.add(d);
    const out = [];
    for (const [dossier, noms] of [...parDossier.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))) {
      if (deja.has(dossier) || noms.length < 2) continue;
      // Annotations et notes de lecture sont rangées PAR SOURCE : des dizaines
      // de sous-dossiers « @citekey », qui n'ont pas à devenir autant de
      // familles. On les écarte par leur rôle et par leur nom.
      const parents = [this.settings.dossierAnnotations, this.settings.dossierNotesLecture].filter(Boolean);
      if (parents.some((r) => dossier.startsWith(r + '/'))) continue;
      if (dossier.split('/').pop().startsWith('@')) continue;
      out.push({
        nom: dossier.replace(/^\d+\s*-\s*/, '').split('/').pop(),
        dossiers: [dossier],
        prefixe: prefixeCommun(noms),
        aparte: true, suggestions: false, couleur: '', icone: '',
        monospace: false, alias: false,
      });
    }
    return out;
  }

  migrerFamilles() {
    if (Array.isArray(this.settings.famillesNotes) && this.settings.famillesNotes.length) return 0;
    const s = this.settings;
    const styles = s.suggStylesDossiers || {};
    const mono = new Set((s.dossiersMonospace || []).map((x) => String(x).trim()));
    const alias = new Set((s.dossiersAliasExplorateur || []).map((x) => String(x).trim()));
    const parDossier = new Map();
    const ajouter = (dossier, champs) => {
      const d = String(dossier || '').trim().replace(/^\/+|\/+$/g, '');
      if (!d) return;
      const f = parDossier.get(d) || {
        nom: d.replace(/^\d+\s*-\s*/, '').split('/').pop(),
        dossiers: [d], prefixe: '', aparte: true, suggestions: false,
        couleur: '', icone: '', monospace: false, alias: false,
      };
      Object.assign(f, champs);
      parDossier.set(d, f);
    };
    for (const d of (s.suggDossiersCandidats || [])) {
      ajouter(d, { suggestions: true, couleur: (styles[d] || {}).couleur || '', icone: (styles[d] || {}).icone || '' });
    }
    if (s.dossierNotesConceptuelles) {
      ajouter(s.dossierNotesConceptuelles, {
        nom: 'Note conceptuelle',
        prefixe: s.prefixeNoteConceptuelle || '',
        aparte: s.aparteConceptuelles !== false,
      });
    }
    for (const d of mono) ajouter(d, { monospace: true });
    for (const d of alias) ajouter(d, { alias: true });
    if (!parDossier.size) return 0;
    this.settings.famillesNotes = [...parDossier.values()];
    return this.settings.famillesNotes.length;
  }

  get dossierA() {
    return this.settings.dossierAnnotations;
  }
  get dossierR() {
    return this.settings.dossierReferences;
  }

  get dossierT() {
    return this.settings.dossierTaches || '8 - Tâches';
  }

  /* ------------------------- Utilitaires d'écriture ------------------------- */

  marquerEcriture(chemin) {
    this.ecrituresRecentes.set(chemin, Date.now());
  }

  ecritePlugin(chemin) {
    const t = this.ecrituresRecentes.get(chemin);
    return t !== undefined && Date.now() - t < FENETRE_ECRITURE_MS;
  }

  antirebond(cle, fn, delai) {
    clearTimeout(this.antirebonds.get(cle));
    this.antirebonds.set(
      cle,
      setTimeout(() => {
        this.antirebonds.delete(cle);
        Promise.resolve(fn()).catch((e) => console.error('[Ariane]', e));
      }, delai || DELAI_ANTIREBOND_MS)
    );
  }

  async ecrire(chemin, contenu, fichierExistant) {
    this.marquerEcriture(chemin);
    const f = fichierExistant || this.app.vault.getAbstractFileByPath(chemin);
    if (f instanceof obsidian.TFile) await this.app.vault.modify(f, contenu);
    else await this.app.vault.create(chemin, contenu);
  }

  async supprimerFichier(file) {
    this.marquerEcriture(file.path);
    await this.app.fileManager.trashFile(file);
  }

  async assurerDossier(chemin) {
    if (!this.app.vault.getAbstractFileByPath(chemin)) {
      this.marquerEcriture(chemin);
      await this.app.vault.createFolder(chemin);
    }
  }

  nettoyerNomFichier(nom) {
    return nom.replace(/[\\/:*?"<>|]/g, '').trim();
  }

  nomFichierAnnotation(bloc) {
    const brut = appliquerModele(this.settings.formatNomFichier || '{{key}}_{{title}}', {
      key: bloc.cle,
      title: bloc.titre,
    });
    const nom = this.nettoyerNomFichier(brut).replace(/[.\s]+$/, '');
    return nom || bloc.cle;
  }

  indexAnnotationsParCle() {
    const map = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (fm && fm['zotflow-auto'] === true && fm['zotflow-anno-key']) {
        map.set(String(fm['zotflow-anno-key']), f);
      }
    }
    return map;
  }

  /* ------------------------------ Index Zotero ------------------------------ */

  // Construit une entrée d'index Zotero à partir du frontmatter d'un fichier.
  // Renvoie toujours un objet ; « citkey » vide = ce n'est pas une source Zotero.
  entreeIndex(file) {
    const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
    const citkey = fm.citationKey || (file.basename.startsWith('@') ? file.basename.slice(1) : '');
    const creators = fm.creators
      ? (Array.isArray(fm.creators) ? fm.creators : [fm.creators]).map(sansLien)
      : [];
    const surnames = creators
      .map((c) => sansAccents(String(c).trim().split(/\s+/).pop()))
      .filter((x) => x.length > 0);
    const anneeMatch = String(fm.year || fm.date || '').match(/\d{4}/);
    const creatorsFull = [];
    for (const c of creators) {
      const nom = nomCompletAuteur(c);
      if (nom && !creatorsFull.includes(nom)) creatorsFull.push(nom);
    }
    return {
      basename: file.basename,
      citkey,
      premier: surnames[0] || '',
      surnames,
      creatorsFull,
      titre: fm.title || '',
      doi: normDoi(fm.doi),
      annee: anneeMatch ? anneeMatch[0] : '',
    };
  }

  construireIndexZotero() {
    const idx = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const e = this.entreeIndex(file);
      if (e.citkey) idx.push(e);
    }
    return idx;
  }

  estSourceZoteroFrontmatter(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache ? cache.frontmatter : null;
    return !!((fm && fm.citationKey) || file.basename.startsWith('@'));
  }

  /* --------------------------- Atomisation source --------------------------- */

  async commandeNoteActive() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new obsidian.Notice(tr('Aucune note active.'));
      return;
    }
    const contenu = await this.app.vault.read(file);
    if (!contenu.includes(this.settings.marqueurSource)) {
      new obsidian.Notice(tr("Cette note ne contient pas d'annotations reconnues."));
      return;
    }
    await this.atomiseSource(file);
  }

  async atomiserTout() {
    let n = 0;
    for (const file of this.app.vault.getMarkdownFiles()) {
      const contenu = await this.app.vault.read(file);
      if (contenu.includes(this.settings.marqueurSource)) {
        await this.atomiseSource(file);
        n++;
      }
    }
    new obsidian.Notice(tr('Ariane : ') + n + ' source(s) atomisée(s).');
  }

  async atomiseSource(file) {
    const cfg = this.settings;
    const contenu = await this.app.vault.read(file);
    if (!contenu.includes(cfg.marqueurSource)) return;

    const idx = this.construireIndexZotero();
    const blocs = extraireBlocs(contenu, cfg);

    // Dossier cible des annotations : sous-dossier par source si activé.
    const dossierCible = cfg.regrouperParSource
      ? this.dossierA + '/' + this.nettoyerNomFichier(file.basename)
      : this.dossierA;

    // Aucune annotation compatible : retirer les annotations désormais
    // orphelines de cette source, puis le sous-dossier une fois vidé.
    if (blocs.length === 0) {
      if (cfg.propagerSuppressions) {
        await this.nettoyerSupprimees(file.basename, new Set());
      }
      if (cfg.regrouperParSource) {
        const d = this.app.vault.getAbstractFileByPath(dossierCible);
        if (d instanceof obsidian.TFolder && d.children.length === 0) {
          this.marquerEcriture(dossierCible);
          await this.app.fileManager.trashFile(d);
        }
      }
      return;
    }

    await this.assurerDossier(this.dossierA);
    if (dossierCible !== this.dossierA) await this.assurerDossier(dossierCible);

    let creees = 0;
    let majes = 0;
    let renommees = 0;
    const clesPresentes = new Set();
    const parCle = this.indexAnnotationsParCle();
    const canoniques = this.indexCanoniques();

    for (const bloc of blocs) {
      clesPresentes.add(bloc.cle);

      for (const r of bloc.refs) {
        if (r.estAuteurSeul) continue; // auteur seul : pas de note de référence
        const z = cfg.rattachementZotero ? trouverSourceZotero(r, idx) : null;
        if (!z) await this.assurerReference(r, canoniques);
      }

      const fmSource = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
      const canon = construireNote(bloc, file.basename, idx, cfg,
        { collections: fmSource.collections, canoniques });
      const existant = parCle.get(bloc.cle);

      const base = this.nomFichierAnnotation(bloc);
      let cible = dossierCible + '/' + base + '.md';
      const occupant = this.app.vault.getAbstractFileByPath(cible);
      if (occupant instanceof obsidian.TFile && (!existant || occupant.path !== existant.path)) {
        cible = dossierCible + '/' + base + ' (' + bloc.cle + ').md';
      }

      if (existant instanceof obsidian.TFile) {
        if (existant.path !== cible) {
          this.marquerEcriture(existant.path);
          this.marquerEcriture(cible);
          await this.app.fileManager.renameFile(existant, cible);
          renommees++;
        }
        const actuel = await this.app.vault.read(existant);
        if (actuel !== canon) {
          await this.ecrire(existant.path, canon, existant);
          majes++;
        }
      } else {
        await this.ecrire(cible, canon);
        creees++;
      }
    }

    if (cfg.propagerSuppressions) {
      await this.nettoyerSupprimees(file.basename, clesPresentes);
    }

    // Notes d'auteur (nom complet) pour les auteurs de cette source.
    if (cfg.liensAuteurs) {
      const entreeSrc = idx.find((z) => z.basename === file.basename);
      await this.assurerNotesAuteurs(file.basename, (entreeSrc && entreeSrc.creatorsFull) || []);
    }

    if (creees || majes || renommees) {
      new obsidian.Notice(tr('ZotFlow [') + file.basename + '] : ' + creees + ' créée(s), ' + majes + ' maj, ' + renommees + ' renommée(s).'
      );
    }
  }

  // Nom canonique par clé de libellé. Deux écritures qui ne diffèrent que par
  // une conjonction, un accent, un trait d'union ou une virgule désignent la
  // même référence : « Castan~er » et « Castaner », « Gentner et al., » et
  // « Gentner, et al., ». Il n'y a rien à arbitrer là-dedans, c'est
  // déterministe, et cela se règle à la création plutôt qu'après coup.
  indexCanoniques() {
    const m = new Map();
    const dossier = this.dossierR;
    if (!dossier) return m;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(dossier + '/')) continue;
      const k = cleLibelle(f.basename);
      if (!k) continue;
      const ancien = m.get(k);
      if (!ancien) { m.set(k, f.basename); continue; }
      // Départage, dans cet ordre et sans dépendre de l'ordre des fichiers, qui
      // n'est pas garanti : d'abord la forme normalisée sur les conjonctions,
      // puis la plus petite dans l'ordre des caractères. Ce second critère
      // retient les formes lisibles : « Castaner » avant « Castan~er »,
      // « Gentner et al. » avant « Gentner, et al. », « Garcia-Aristizabal »
      // avant « GarciaAristizabal ».
      const normNeuf = normaliserConjAuteurs(f.basename) === f.basename;
      const normAncien = normaliserConjAuteurs(ancien) === ancien;
      if (normNeuf !== normAncien) { if (normNeuf) m.set(k, f.basename); continue; }
      if (f.basename < ancien) m.set(k, f.basename);
    }
    return m;
  }

  // Rend le nom de note à employer : celui qui existe déjà sous une écriture
  // équivalente, sinon celui de la référence, la note étant alors créée.
  async assurerReference(ref, canoniques) {
    const k = cleLibelle(ref.nom);
    const deja = canoniques && k ? canoniques.get(k) : null;
    if (deja) return deja;
    const nom = this.nettoyerNomFichier(ref.nom);
    const chemin = this.dossierR + '/' + nom + '.md';
    if (!this.app.vault.getAbstractFileByPath(chemin)) {
      await this.assurerDossier(this.dossierR);
      await this.ecrire(chemin, construireReference(ref, this.settings));
    }
    if (canoniques && k) canoniques.set(k, nom);
    return nom;
  }

  // Renomme les notes de référence « … et … » / « … and … » en « … & … »
  // (en conservant « et al. »), via l'API Obsidian pour préserver les liens.
  // « March et Smith, 1995 » et « March & Smith, 1995 » sont la même référence.
  // parseNomReference normalise déjà les conjonctions à la création, donc seules
  // les notes antérieures à ce garde-fou subsistent. Renommer ne suffit pas :
  // quand la forme normalisée existe déjà, il faut FUSIONNER, ce que l'ancienne
  // version refusait de faire en comptant un « conflit ». Elle échouait donc
  // exactement sur les cas qui la justifient.
  async normaliserConjonctionsReferences() {
    const dossier = this.dossierR;
    const fichiers = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(dossier + '/'));
    let renommees = 0, fusionnees = 0, liens = 0, echecs = 0;
    const avis = new obsidian.Notice(tr('Normalisation…'), 0);
    for (const f of fichiers) {
      const nouveauNom = this.nettoyerNomFichier(normaliserConjAuteurs(f.basename));
      if (nouveauNom === f.basename) continue;
      const cible = dossier + '/' + nouveauNom + '.md';
      const existante = this.app.vault.getAbstractFileByPath(cible);
      if (existante) {
        const c = this.indexCitations().get(f.basename) || { total: 0, sources: new Map() };
        const n = await this.fusionnerReferences(
          { nom: f.basename, fichier: f, citations: c.total }, nouveauNom, true);
        fusionnees += 1; liens += n;
        avis.setMessage(tr('Normalisation : ') + (renommees + fusionnees) + ' / ' + fichiers.length);
        continue;
      }
      try {
        await this.app.fileManager.renameFile(f, cible);
        renommees += 1;
      } catch (e) {
        echecs += 1;
        console.error('[Ariane] normalisation', f.basename, e);
      }
    }
    avis.hide();
    new obsidian.Notice(tr('Conjonctions : ') + renommees + ' ' + tr('renommée(s)')
      + ', ' + fusionnees + ' ' + tr('fusionnée(s)') + ' (' + liens + ' ' + tr('lien(s)') + ')'
      + (echecs ? ', ' + echecs + ' ' + tr('en échec') : '') + '.', 10000);
  }

  async nettoyerSupprimees(sourceBasename, clesPresentes) {
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-auto'] !== true) continue;
      if (!String(fm['zotflow-source'] || '').includes(sourceBasename)) continue;
      const cle = fm['zotflow-anno-key'];
      if (cle && !clesPresentes.has(cle)) {
        await this.supprimerAnnotation(f, cle);
      }
    }
  }

  async supprimerAnnotation(file, cle) {
    await this.supprimerFichier(file);
    if (this.settings.propagerSuppressions) await this.retirerLiens(cle);
  }

  // Propagation de la suppression d'une SOURCE (supprimée dans Zotero) :
  // retire toutes ses annotations, son sous-dossier vidé, et les fiches
  // auteurs qui ne dépendaient que de cette source.
  async surSuppressionSource(basename) {
    const annotations = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache ? cache.frontmatter : null;
      if (!fm || fm['zotflow-auto'] !== true) continue;
      const s = String(fm['zotflow-source'] || '')
        .replace(/^\[\[|\]\]$/g, '')
        .replace(/\|.*$/, '')
        .trim();
      if (s === basename) annotations.push({ f, cle: fm['zotflow-anno-key'] });
    }
    const dossierSource = this.dossierA + '/' + this.nettoyerNomFichier(basename);
    const dossier = this.app.vault.getAbstractFileByPath(dossierSource);
    const dossierExiste = dossier instanceof obsidian.TFolder;
    // Rien qui rattache ce fichier à une source atomisée : on n'y touche pas.
    if (annotations.length === 0 && !dossierExiste) return;

    for (const { f, cle } of annotations) {
      if (cle) await this.supprimerAnnotation(f, cle);
      else await this.supprimerFichier(f);
    }

    // Sous-dossier de la source, une fois vidé.
    const d = this.app.vault.getAbstractFileByPath(dossierSource);
    if (d instanceof obsidian.TFolder && d.children.length === 0) {
      this.marquerEcriture(dossierSource);
      await this.app.fileManager.trashFile(d);
    }

    await this.nettoyerAuteursSource(basename);
  }

  // Fiches auteurs pointant vers une source supprimée : retire le lien ; si la
  // fiche ne pointe plus vers aucune source, elle est mise à la corbeille.
  async nettoyerAuteursSource(basename) {
    if (!this.settings.liensAuteurs) return;
    const dossier = this.settings.dossierAuteurs;
    if (!(this.app.vault.getAbstractFileByPath(dossier) instanceof obsidian.TFolder)) return;
    const lien = '[[' + basename + ']]';
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(dossier + '/')) continue;
      const contenu = await this.app.vault.read(f);
      if (!contenu.includes(lien)) continue;
      const lignes = contenu.split('\n').filter((l) => !l.includes(lien));
      const resteUnLien = /\[\[[^\]]+\]\]/.test(lignes.join('\n'));
      const cache = this.app.metadataCache.getFileCache(f);
      const estFicheAuteur = !!(cache && cache.frontmatter && cache.frontmatter.type === 'auteur');
      if (!resteUnLien && estFicheAuteur) {
        await this.supprimerFichier(f);
      } else {
        const nouveau = lignes.join('\n');
        if (nouveau !== contenu) await this.ecrire(f.path, nouveau, f);
      }
    }
  }

  async retirerLiens(cible) {
    const re = new RegExp('!?\\[\\[' + echapperRegex(cible) + '(\\|[^\\]]*)?\\]\\]', 'g');
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.path.startsWith(this.dossierA + '/')) continue;
      const contenu = await this.app.vault.read(f);
      re.lastIndex = 0;
      if (!re.test(contenu)) continue;

      const lignes = contenu.split('\n').map((l) => {
        re.lastIndex = 0;
        if (!re.test(l)) return l;
        re.lastIndex = 0;
        return l
          .replace(re, '')
          .replace(/[ \t]{2,}/g, ' ')
          .replace(/\s+;\s*$/, '')
          .replace(/^\s*;\s*/, '')
          .replace(/[ \t]+$/g, '');
      });
      const nettoyees = lignes.filter((l) => !/^\s*([-*+]|\d+\.)\s*$/.test(l));
      const nouveau = nettoyees.join('\n');
      if (nouveau !== contenu) await this.ecrire(f.path, nouveau, f);
    }
  }

  /* ------------------------------ Verrouillage ------------------------------ */

  async verrouiller(file) {
    if (!this.settings.verrouillage) return;
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache ? cache.frontmatter : null;
    if (!fm || fm['zotflow-auto'] !== true) return;

    const cle = fm['zotflow-anno-key'];
    const srcNom = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '');
    if (!cle || !srcNom) return;

    const source = this.app.metadataCache.getFirstLinkpathDest(srcNom, file.path);
    if (!source) return;

    const contenu = await this.app.vault.read(source);
    const blocs = extraireBlocs(contenu, this.settings);
    const bloc = blocs.find((b) => b.cle === cle);
    if (!bloc) {
      if (this.settings.propagerSuppressions) await this.supprimerAnnotation(file, cle);
      return;
    }
    const idx = this.construireIndexZotero();
    const fmSrc = (this.app.metadataCache.getFileCache(source) || {}).frontmatter || {};
    const canon = construireNote(bloc, source.basename, idx, this.settings, { collections: fmSrc.collections });
    const actuel = await this.app.vault.read(file);
    if (actuel !== canon) await this.ecrire(file.path, canon, file);
  }

  /* ------------------------ Rattachement Zotero (réf.) ----------------------- */

  async rattacherReferencesZotero(zoteroFile) {
    if (!this.settings.rattachementZotero) return;
    const entree = this.entreeIndex(zoteroFile);
    const creatorsFull = entree.creatorsFull;
    if (!entree.premier || !entree.annee) return;

    if (!this.app.vault.getAbstractFileByPath(this.dossierR)) return;
    // Index complet (pour juger l'unicité d'un appariement fort).
    const index = this.settings.rattachementAutoCertain ? this.construireIndexZotero() : null;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierR + '/')) continue;
      const ref = parseNomReference(f.basename, this.settings);
      if (!ref) continue;
      if (ref.annee && ref.annee4 && ref.annee !== ref.annee4) continue; // suffixe -> assistant
      if (appariementSource(ref, entree)) {
        // Correspondance CERTAINE (unique appariement fort dans toute la
        // bibliothèque) -> rattachement automatique, sans confirmation.
        const certaine = index && trouverSourceZotero(ref, index) === zoteroFile.basename;
        if (!certaine && !(await this.deciderRattachement(f.basename, zoteroFile, entree))) continue;
        await this.remplacerLiens(f.basename, zoteroFile.basename);
        await this.supprimerFichier(f);
        await this.assurerNotesAuteurs(zoteroFile.basename, creatorsFull);
      }
    }
  }

  // Balaye toutes les références en attente et rattache automatiquement celles
  // qui ont une correspondance Zotero certaine (unique appariement fort), sans
  // confirmation. Les cas ambigus (plusieurs candidats, « et al. », 2005a/b)
  // sont laissés à l'assistant.
  async rattacherToutesReferences() {
    if (!this.app.vault.getAbstractFileByPath(this.dossierR)) {
      new obsidian.Notice(tr('Aucun dossier de références en attente.'));
      return;
    }
    const index = this.construireIndexZotero();
    let attachees = 0, ambigues = 0, sansSource = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierR + '/')) continue;
      const ref = parseNomReference(f.basename, this.settings);
      if (!ref) continue;
      if (ref.annee && ref.annee4 && ref.annee !== ref.annee4) { ambigues++; continue; }
      const base = trouverSourceZotero(ref, index);
      if (base) {
        await this.remplacerLiens(f.basename, base);
        await this.supprimerFichier(f);
        const e = index.find((z) => z.basename === base);
        if (e) await this.assurerNotesAuteurs(base, e.creatorsFull || []);
        attachees++;
      } else {
        (candidatsSource(ref, index).length ? (ambigues++) : (sansSource++));
      }
    }
    new obsidian.Notice(tr('Références : ') + attachees + ' rattachée(s) automatiquement, ' + ambigues +
      ' ambiguë(s) (assistant), ' + sansSource + ' sans source Zotero.'
    );
  }

  // Notes d'auteur dédiées : pour chaque auteur (nom complet Zotero) d'une
  // source, garantit une note Auteurs/<Nom complet>.md qui pointe vers la
  // source. Entièrement sous contrôle du plugin (indépendant de ZotFlow).
  async assurerNotesAuteurs(sourceBasename, auteursFull) {
    if (!this.settings.liensAuteurs || !auteursFull || auteursFull.length === 0) return;
    const dossier = this.settings.dossierAuteurs;
    await this.assurerDossier(dossier);
    const lien = '[[' + sourceBasename + ']]';
    for (const auteur of auteursFull) {
      const chemin = dossier + '/' + this.nettoyerNomFichier(auteur) + '.md';
      const f = this.app.vault.getAbstractFileByPath(chemin);
      const { nom, prenom } = separerNomPrenom(auteur);
      if (f instanceof obsidian.TFile) {
        const contenu = await this.app.vault.read(f);
        if (!contenu.includes(lien)) {
          await this.ecrire(chemin, contenu.replace(/\s*$/, '') + '\n' + lien + '\n', f);
        }
        // Rétro-remplit nom/prénom si absents.
        const fmc = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
        const manque = (nom && !fmc.nom) || (prenom && (fmc['prénom'] == null || fmc['prénom'] === ''));
        if (manque) {
          this.marquerEcriture(f.path);
          await this.app.fileManager.processFrontMatter(f, (fm) => {
            if (nom && !fm.nom) fm.nom = nom;
            if (prenom && (fm['prénom'] == null || fm['prénom'] === '')) fm['prénom'] = prenom;
          });
        }
      } else {
        const tete = '---\ntype: auteur\n'
          + (nom ? 'nom: ' + JSON.stringify(nom) + '\n' : '')
          + (prenom ? 'prénom: ' + JSON.stringify(prenom) + '\n' : '')
          + '---\n\n';
        await this.ecrire(chemin, tete + lien + '\n');
      }
    }
  }

  // Tranche un rattachement ambigu avec le modèle local. Renvoie true, false,
  // ou null si le modèle est injoignable (on retombe alors sur la fenêtre).
  async deciderRattachementIA(refNom, entree) {
    try {
      const auteurs = (entree.creatorsFull || []).join(', ');
      const prompt =
        'Tu aides un chercheur à relier une référence citée à une fiche bibliographique.\n\n'
        + 'Référence citée, telle qu\'elle apparaît dans un texte :\n"' + refNom + '"\n\n'
        + 'Fiche candidate :\n'
        + '- Auteurs : ' + (auteurs || '(inconnus)') + '\n'
        + '- Année : ' + (entree.annee || '(inconnue)') + '\n'
        + '- Titre : ' + (entree.titre || '(inconnu)') + '\n\n'
        + 'Désignent-elles le même travail ? Sois prudent : en cas de doute sérieux '
        + '(auteurs différents, homonymie possible, année incohérente), réponds false.\n'
        + 'Réponds UNIQUEMENT en JSON : {"meme": true} ou {"meme": false}.';
      const brut = await this.genererJson(prompt, 64);
      if (!brut) return null;
      let obj = null;
      try { obj = JSON.parse(brut); } catch (e) {
        const m = brut.match(/\{[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) { obj = null; } }
      }
      if (!obj) return null;
      const v = obj.meme !== undefined ? obj.meme : obj.same;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return /^(true|oui|yes)$/i.test(v.trim());
      return null;
    } catch (e) {
      console.debug('[Ariane] rattachement IA', e);
      return null;
    }
  }

  // Décision pour un couple (référence en attente, fiche Zotero) : mémoire
  // persistante d'abord, puis modèle local, puis vous. Une question posée une
  // fois ne revient jamais, même après une nouvelle synchronisation zotflow.
  async deciderRattachement(refNom, zoteroFile, entree) {
    if (!this.settings.rattachementsDecides) this.settings.rattachementsDecides = {};
    const memo = this.settings.rattachementsDecides;
    const cle = refNom + ' => ' + zoteroFile.basename;
    if (Object.prototype.hasOwnProperty.call(memo, cle)) return memo[cle] === true;

    let ok = null;
    if (this.settings.rattachementIA !== false) {
      ok = await this.deciderRattachementIA(refNom, entree);
    }
    if (ok === null) {
      ok = await this.confirmerRattachement(refNom, zoteroFile.basename, entree.creatorsFull);
    }
    memo[cle] = ok === true;
    await this.saveSettings();
    return ok === true;
  }

  // Fenêtre de validation d'un rattachement (anti-homonymie). Renvoie une
  // promesse booléenne. Sans validation activée, renvoie true directement.
  confirmerRattachement(refNom, sourceBasename, auteursFull) {
    if (!this.settings.validationRattachement) return Promise.resolve(true);
    const cle = refNom + '|' + sourceBasename;
    if (this.rattachementsIgnores && this.rattachementsIgnores.has(cle)) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      const texte =
        'Rattacher la référence citée « ' + refNom + ' » à la source Zotero « ' +
        sourceBasename + ' »' +
        (auteursFull && auteursFull.length ? ' (auteurs : ' + auteursFull.join(', ') + ')' : '') +
        ' ? Vérifiez qu\'il ne s\'agit pas d\'un homonyme.';
      new ConfirmationRattachement(this.app, texte, (ok) => {
        if (!ok && this.rattachementsIgnores) this.rattachementsIgnores.add(cle);
        resolve(ok);
      }).open();
    });
  }

  // Assistant : lie la note de référence active (ex. « Aven, 2005a ») à la
  // bonne fiche Zotero parmi les candidats auteur+année, mémorise le choix,
  // remplace les liens et retire la note provisoire.
  async assistantLiageReference() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md' || !file.path.startsWith(this.dossierR + '/')) {
      new obsidian.Notice(tr('Ouvrez une note de référence (dossier « ') + this.dossierR + ' »).');
      return;
    }
    const ref = parseNomReference(file.basename, this.settings);
    if (!ref) {
      new obsidian.Notice(tr('Nom de référence non reconnu (attendu « Auteur, Année »).'));
      return;
    }
    const candidats = candidatsSource(ref, this.construireIndexZotero()).map((c) => c.entree);
    if (!candidats.length) {
      new obsidian.Notice(tr('Aucune fiche Zotero pour « ') + (ref.premierAuteur || '') + ', ' + (ref.annee4 || ref.annee) + ' ».');
      return;
    }
    new ChoixSourceModal(this.app, file.basename, candidats, async (choix) => {
      if (!choix) return;
      if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
      this.settings.correspondancesSuffixe[ref.nom] = { __defaut: choix };
      await this.saveSettings();
      await this.remplacerLiens(file.basename, choix);
      const entree = candidats.find((c) => c.basename === choix);
      if (entree) await this.assurerNotesAuteurs(choix, entree.creatorsFull || []);
      await this.supprimerFichier(file);
      new obsidian.Notice(tr('Référence « ') + file.basename + ' » liée à « ' + choix + ' ».');
    }).open();
  }

  async remplacerLiens(ancien, nouveau) {
    const re = new RegExp('\\[\\[' + echapperRegex(ancien) + '(\\|[^\\]]*)?\\]\\]', 'g');
    for (const f of this.app.vault.getMarkdownFiles()) {
      const contenu = await this.app.vault.read(f);
      re.lastIndex = 0;
      if (!re.test(contenu)) continue;
      const nouveauContenu = contenu.replace(re, '[[' + nouveau + ']]');
      if (nouveauContenu !== contenu) await this.ecrire(f.path, nouveauContenu, f);
    }
  }

  /* ===================== Arbitrage des références en attente ================ *
   * Mesuré sur un vrai coffre : sur 631 références en attente, 19 seulement se
   * rattachent par auteur et année. Les autres demandent un arbitrage humain,
   * et pour arbitrer il faut voir ce que la référence désigne réellement. D'où
   * la résolution par la bibliographie de la source citante : l'article qui
   * cite « Aven & Renn, 2009a » donne dans sa propre liste de références le
   * titre et le DOI de ce qu'il désigne.
   * ========================================================================= */

  // Le rattachement complet : mémoriser le choix, réécrire tous les liens du
  // coffre, créer les notes d'auteurs, retirer la note provisoire. C'est le
  // même geste que l'assistant sur note active, factorisé pour que les deux
  // chemins ne divergent jamais.
  async rattacherReference(entree, cible) {
    if (!cible) return;
    if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
    this.settings.correspondancesSuffixe[entree.nom] = { __defaut: cible };
    await this.saveSettings();
    await this.remplacerLiens(entree.nom, cible);
    const z = this.construireIndexZotero().find((x) => x.basename === cible);
    if (z) await this.assurerNotesAuteurs(cible, z.creatorsFull || []);
    await this.supprimerFichier(entree.fichier);
    new obsidian.Notice(tr('Référence « ') + entree.nom + ' » liée à « ' + cible + ' ».');
  }

  // « à acquérir » ou « écartée », inscrit dans la note elle-même pour que la
  // décision survive à une réinstallation du greffon.
  async marquerReference(entree, etat) {
    const f = entree.fichier;
    const contenu = await this.app.vault.read(f);
    let neuf;
    if (/^---\n[\s\S]*?\n---/.test(contenu)) {
      const sansLigne = contenu.replace(/^(---\n[\s\S]*?)^arbitrage:.*\n([\s\S]*?---)/m, '$1$2');
      neuf = etat
        ? sansLigne.replace(/^(---\n)/, '$1arbitrage: ' + JSON.stringify(etat) + '\n')
        : sansLigne;
    } else {
      neuf = etat ? '---\narbitrage: ' + JSON.stringify(etat) + '\n---\n\n' + contenu : contenu;
    }
    await this.ecrire(f.path, neuf, f);
  }

  // Inscrit dans la note en attente l'œuvre retenue. C'est la seule écriture
  // que l'arbitrage produit, et elle est réversible : deux propriétés.
  async ecrireIdentification(entree, verdict) {
    if (!verdict || !verdict.titre) return;
    const f = entree.fichier;
    const contenu = await this.app.vault.read(f);
    const pose = (texte, cle, valeur) => {
      const sans = texte.replace(new RegExp('^' + cle + ':.*\\n', 'm'), '');
      return valeur ? sans.replace(/^(---\n)/, '$1' + cle + ': ' + JSON.stringify(valeur) + '\n') : sans;
    };
    let neuf = contenu;
    if (!/^---\n[\s\S]*?\n---/.test(neuf)) neuf = '---\n---\n\n' + neuf;
    neuf = pose(neuf, 'titre-cité', verdict.titre);
    neuf = pose(neuf, 'doi', verdict.doi || '');
    await this.ecrire(f.path, neuf, f);
    new obsidian.Notice(tr('Identification écrite : ') + '« ' + verdict.titre.slice(0, 60) + ' »');
  }

  // Réparation : d'anciennes versions découpaient « Dupont, Martin, & Durand »
  // en laissant l'esperluette collée au dernier nom, d'où des liens « [[& X]] »
  // qui ne pointent nulle part. Le découpage est corrigé, restent les résidus.
  async reparerLiensAuteurs() {
    const motif = /\[\[\s*&\s+([^\]|#]+?)\s*(\|[^\]]*)?\]\]/g;
    let fichiers = 0, liens = 0;
    const touches = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const contenu = await this.app.vault.cachedRead(f);
      motif.lastIndex = 0;
      if (!motif.test(contenu)) continue;
      motif.lastIndex = 0;
      let n = 0;
      const neuf = contenu.replace(motif, (tout, nom, alias) => {
        n += 1;
        return '[[' + nom.trim() + (alias || '') + ']]';
      });
      if (neuf === contenu) continue;
      await this.ecrire(f.path, neuf, f);
      fichiers += 1; liens += n;
      touches.push(f.basename);
    }
    if (!fichiers) new obsidian.Notice(tr('Aucun lien d’auteur à réparer.'));
    else new obsidian.Notice(tr('Liens d’auteurs réparés : ') + liens + tr(' dans ') + fichiers + tr(' note(s).'));
    console.log('[Ariane] liens d’auteurs réparés dans :', touches);
    return liens;
  }

  /* ------------- Compléter une référence depuis son DOI -------------------- *
   * L'arbitrage identifie l'œuvre ; il n'en donne que le titre et le DOI, parce
   * que c'est tout ce qu'une entrée de bibliographie contient. La fiche
   * complète, elle, se demande à Crossref sur le DOI lui-même : auteurs avec
   * leurs prénoms, revue ou éditeur, type, année.
   * ------------------------------------------------------------------------ */

  async ficheDepuisDoi(doi) {
    const d = normDoi(doi);
    if (!d) return null;
    const q = this.paramMailto();
    const j = await this.apiGetJson(
      'https://api.crossref.org/works/' + encodeURIComponent(d) + (q ? '?' + q : ''));
    const m = j && j.message ? j.message : null;
    if (!m) return null;
    const parts = (m.issued && m.issued['date-parts']) || [];
    const auteurs = (m.author || [])
      .map((a) => String((a.given || '') + ' ' + (a.family || a.name || '')).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return {
      doi: d,
      titre: String((m.title || [])[0] || '').trim(),
      auteurs,
      annee: String((parts[0] || [])[0] || '').trim(),
      revue: String((m['container-title'] || [])[0] || '').trim(),
      editeur: String(m.publisher || '').trim(),
      type: String(m.type || '').trim(),
      url: String(m.URL || '').trim(),
    };
  }

  // La fiche récupérée doit parler du même travail : l'année et le nom cité
  // doivent s'y retrouver. Sinon on ne l'écrit pas. Un DOI erroné, cela arrive,
  // et une fausse fiche dans une thèse coûte plus cher qu'une fiche absente.
  ficheConcorde(fiche, nomReference) {
    if (!fiche || !fiche.titre) return false;
    const m = String(nomReference).match(/^(.*?),\s*(\d{4})/);
    if (!m) return true;
    if (fiche.annee && fiche.annee !== m[2]) return false;
    const premier = sansAccents(m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop());
    if (!premier || !fiche.auteurs.length) return true;
    return fiche.auteurs.some((a) => sansAccents(a).split(/[^a-z0-9]+/).includes(premier));
  }

  async completerReference(entree, doi) {
    const fiche = await this.ficheDepuisDoi(doi);
    if (!fiche) { new obsidian.Notice(tr('Fiche introuvable pour ce DOI.')); return false; }
    if (!this.ficheConcorde(fiche, entree.nom)) {
      new obsidian.Notice(tr('La fiche du DOI ne concorde pas avec « ') + entree.nom + ' ». '
        + tr('Rien n’a été écrit.'), 9000);
      return false;
    }
    const f = entree.fichier;
    this.marquerEcriture(f.path);
    await this.app.fileManager.processFrontMatter(f, (fm) => {
      // L'alias porte le titre : c'est lui que lit l'aparté, et c'est par lui
      // que la référence devient trouvable ailleurs qu'en « Auteur, Année ».
      const al = Array.isArray(fm.aliases) ? fm.aliases : (fm.aliases ? [fm.aliases] : []);
      if (!al.includes(fiche.titre)) fm.aliases = [fiche.titre].concat(al.filter((x) => x !== fiche.titre));
      fm['titre-cité'] = fiche.titre;
      fm.doi = fiche.doi;
      if (fiche.auteurs.length) fm.auteurs = fiche.auteurs;
      if (fiche.annee) fm.annee = fiche.annee;
      if (fiche.revue) fm.revue = fiche.revue;
      if (fiche.editeur) fm['éditeur'] = fiche.editeur;
      if (fiche.type) fm['type-œuvre'] = fiche.type;
      if (fiche.url) fm.url = fiche.url;
    });
    // Le corps ne portait que des noms de famille, « [[Bowker]] », alors que
    // les notes d'auteurs du coffre sont en noms complets. On les aligne.
    if (fiche.auteurs.length) {
      const contenu = await this.app.vault.read(f);
      const corps = contenu.replace(/^---\n[\s\S]*?\n---\n?/, '');
      const reste = corps.replace(/^\s*\[\[[^\]]+\]\]\s*$/gm, '').trim();
      const liens = fiche.auteurs.map((a) => '[[' + a + ']]').join('\n');
      const fmBloc = (contenu.match(/^---\n[\s\S]*?\n---\n?/) || [''])[0];
      await this.ecrire(f.path, fmBloc + '\n' + liens + (reste ? '\n\n' + reste : '') + '\n', f);
      await this.assurerNotesAuteurs(entree.nom, fiche.auteurs);
    }
    return true;
  }

  /* --------------------- Fusionner deux libellés --------------------------- *
   * « Gawer & Cusumano, 2014 » et « Gawer, 2014 » désignent parfois le même
   * article et comptent séparément : le signal d'acquisition en est dilué. La
   * fusion réunit les liens sous un seul libellé et mémorise le renvoi.
   * ------------------------------------------------------------------------ */

  async fusionnerReferences(depuis, vers, silencieux) {
    if (!depuis || !vers || depuis.nom === vers) return 0;
    const n = await this.remplacerLiens(depuis.nom, vers);
    const cible = this.app.vault.getMarkdownFiles().find((f) => f.basename === vers);
    if (cible) {
      // Le libellé absorbé est conservé en propriété : il reste cherchable, et
      // l'on sait sous quelles formes ce travail a été cité.
      this.marquerEcriture(cible.path);
      await this.app.fileManager.processFrontMatter(cible, (fm) => {
        const l = Array.isArray(fm['libellés']) ? fm['libellés'] : (fm['libellés'] ? [fm['libellés']] : []);
        if (!l.includes(depuis.nom)) l.push(depuis.nom);
        fm['libellés'] = l;
      });
    }
    if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
    this.settings.correspondancesSuffixe[depuis.nom] = { __defaut: vers };
    await this.saveSettings();
    await this.marquerReference(depuis, 'fusionnée');
    if (!silencieux) {
      new obsidian.Notice(tr('Fusionnée : ') + depuis.nom + ' → ' + vers
        + ' (' + n + ' ' + tr('lien(s)') + ').', 8000);
    }
    return n;
  }

  /* ------------------- Détacher une œuvre d'un libellé --------------------- *
   * « Renn, 2008 » recouvre deux travaux selon l'article citant. On crée une
   * note pour l'œuvre minoritaire, nommée par SON titre, et la table renvoie
   * chaque source vers la bonne. Le libellé d'origine garde son nom : aucun
   * lien existant ne se casse ailleurs.
   * ------------------------------------------------------------------------ */

  async detacherOeuvre(entree, oeuvre, silencieux) {
    if (!oeuvre || !oeuvre.sources || !oeuvre.sources.length) return null;
    const nom = this.nettoyerNomFichier(nomOeuvreDetachee(entree.nom, oeuvre.titre));
    if (nom === entree.nom) { new obsidian.Notice(tr('Titre insuffisant pour détacher.')); return null; }
    const chemin = this.dossierR + '/' + nom + '.md';
    if (!this.app.vault.getAbstractFileByPath(chemin)) {
      const fm = ['---', 'aliases:', '  - ' + JSON.stringify(oeuvre.titre || nom),
        'type: reference-citee'];
      if (oeuvre.doi) fm.push('doi: ' + JSON.stringify(oeuvre.doi));
      if (oeuvre.titre) fm.push('titre-cité: ' + JSON.stringify(oeuvre.titre));
      fm.push('libellés:'); fm.push('  - ' + JSON.stringify(entree.nom));
      fm.push('détachée-de: ' + JSON.stringify('[[' + entree.nom + ']]'));
      fm.push('---');
      await this.ecrire(chemin, fm.join('\n') + '\n');
    }
    if (!this.settings.correspondancesSuffixe) this.settings.correspondancesSuffixe = {};
    const table = Object.assign({}, this.settings.correspondancesSuffixe[entree.nom] || {});
    for (const src of oeuvre.sources) table[src] = nom;
    this.settings.correspondancesSuffixe[entree.nom] = table;
    await this.saveSettings();

    // On ne réécrit que les notes des sources concernées : les autres gardent
    // leur lien vers le libellé d'origine, qui reste valide.
    const motif = new RegExp('\\[\\[' + echapperRegex(entree.nom) + '(\\|[^\\]]*)?\\]\\]', 'g');
    const cibles = new Set(oeuvre.sources);
    let n = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fmc = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const src = cleDeLien(sansLien(fmc['zotflow-source'] || ''));
      if (!src || !cibles.has(src)) continue;
      const contenu = await this.app.vault.cachedRead(f);
      motif.lastIndex = 0;
      if (!motif.test(contenu)) continue;
      motif.lastIndex = 0;
      const neuf = contenu.replace(motif, (tout, alias) => '[[' + nom + (alias || '') + ']]');
      if (neuf === contenu) continue;
      await this.ecrire(f.path, neuf, f);
      n += 1;
    }
    if (!silencieux) {
      new obsidian.Notice(tr('Détachée : ') + nom + ' (' + n + ' ' + tr('lien(s)') + ').', 8000);
    }
    return { nom, liens: n };
  }

  /* ------------------ Détachement automatique ------------------------------ *
   * Quand la bibliographie de deux sources désigne deux travaux pour un même
   * libellé, il n'y a rien à arbitrer : chacune a raison pour son article. On
   * crée la note de l'œuvre minoritaire et la table renvoie chaque source vers
   * la sienne. Le libellé d'origine garde son nom, donc aucun lien valide ne
   * se casse.
   *
   * Cela suit la génération des bibliographies, seul moment où l'identification
   * change, plutôt que d'être une commande de plus.
   * ------------------------------------------------------------------------ */

  // Symétrique du détachement : deux libellés qui désignent le même travail se
  // réunissent d'eux-mêmes. Le libellé le plus cité l'emporte.
  async fusionnerAutomatiquement(silencieux) {
    const { parOeuvre } = await this.indexOeuvres();
    let n = 0, liens = 0;
    for (const o of parOeuvre.values()) {
      if (!o.libelles || o.libelles.length < 2) continue;
      const notes = [];
      for (const nom of o.libelles) {
        const f = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + nom + '.md');
        if (f instanceof obsidian.TFile) notes.push({ nom, fichier: f });
      }
      if (notes.length < 2) continue;
      const cites = this.indexCitations();
      notes.sort((a, b) => ((cites.get(b.nom) || {}).total || 0) - ((cites.get(a.nom) || {}).total || 0)
        || a.nom.localeCompare(b.nom));
      const garde = notes[0].nom;
      for (const autre of notes.slice(1)) {
        liens += await this.fusionnerReferences(autre, garde, true);
        n += 1;
      }
    }
    if (!silencieux && !n) new obsidian.Notice(tr('Aucun libellé à fusionner.'));
    console.log('[Ariane] fusions automatiques :', n, 'libellés,', liens, 'liens');
    return n;
  }

  // La résolution vivait en mémoire, recalculée à chaque ouverture du volet, et
  // n'était écrite dans les notes que par un geste manuel. Tout ce qui lit les
  // notes voyait donc des références non identifiées alors qu'elles l'étaient.
  // On inscrit ce qui ne souffre aucun doute : une seule œuvre pour ce libellé.
  async ecrireIdentificationsAutomatiquement(silencieux) {
    const { parRef } = await this.indexOeuvres();
    let n = 0;
    for (const [libelle, e] of parRef) {
      if (!e.oeuvres || e.oeuvres.length !== 1) continue;
      const o = e.oeuvres[0];
      if (!o.titre || !titreCredible(o.titre)) continue;
      const f = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + libelle + '.md');
      if (!(f instanceof obsidian.TFile)) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      // On n'écrase pas une identification déjà posée, ni ce que l'utilisateur
      // a corrigé à la main.
      if (fm['titre-cité']) continue;
      this.marquerEcriture(f.path);
      await this.app.fileManager.processFrontMatter(f, (x) => {
        x['titre-cité'] = o.titre;
        if (o.doi) x.doi = o.doi;
        const al = Array.isArray(x.aliases) ? x.aliases : (x.aliases ? [x.aliases] : []);
        if (!al.includes(o.titre)) x.aliases = [o.titre].concat(al);
      });
      n += 1;
    }
    if (!silencieux) {
      new obsidian.Notice(n ? tr('Identifications écrites : ') + n : tr('Rien de nouveau à identifier.'));
    }
    console.log('[Ariane] identifications écrites :', n);
    return n;
  }

  async detacherAutomatiquement(silencieux) {
    const { parRef } = await this.indexOeuvres();
    const aTraiter = [];
    for (const [libelle, e] of parRef) {
      if (!e.oeuvres || e.oeuvres.length < 2) continue;
      const f = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + libelle + '.md');
      if (!(f instanceof obsidian.TFile)) continue;
      aTraiter.push({ entree: { nom: libelle, fichier: f }, oeuvres: e.oeuvres });
    }
    if (!aTraiter.length) {
      if (!silencieux) new obsidian.Notice(tr('Aucun libellé à détacher.'));
      return 0;
    }
    let notes = 0, liens = 0;
    for (const t of aTraiter) {
      // L'œuvre la plus attestée garde le libellé ; les autres sont détachées.
      const tries = t.oeuvres.slice().sort((a, b) => b.n - a.n);
      // Prudence : on ne sépare que sur une preuve symétrique. Deux DOI
      // distincts, ou aucun DOI de part et d'autre. Quand une seule des deux
      // entrées porte un DOI, l'écart peut n'être qu'une lacune de l'une des
      // bibliographies : le chapitre « Risk Governance: An Application… » et le
      // livre « Handbook of performability engineering » qui le contient sont
      // le même travail, et rien dans les titres ne le dit.
      const separables = (a, b) => (a.doi && b.doi) ? a.doi !== b.doi : (!a.doi && !b.doi);
      for (const o of tries.slice(1)) {
        if (!separables(tries[0], o)) continue;
        const r = await this.detacherOeuvre(t.entree, o, true);
        if (r) { notes += 1; liens += r.liens; }
      }
    }
    if (!silencieux) {
      new obsidian.Notice(tr('Détachements : ') + notes + ' ' + tr('note(s)')
        + ', ' + liens + ' ' + tr('lien(s)') + '.', 9000);
    }
    console.log('[Ariane] détachements automatiques :', notes, 'notes,', liens, 'liens');
    return notes;
  }

  // Ouvre le PDF d'une source dans le lecteur ZotFlow, à l'intérieur d'Obsidian.
  // Le lecteur accepte une page : navigation={"pageIndex":N}, en base zéro.
  async ouvrirPdfSource(sourceBasename, page) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === sourceBasename);
    if (!f) { new obsidian.Notice(tr('Note introuvable : ') + sourceBasename); return; }
    const cle = await this.cleAttachement(f);
    if (!cle) { new obsidian.Notice(tr('Cette source n’a pas de PDF attaché.')); return; }
    const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const lib = fm['library-id'] || '';
    let url = 'obsidian://zotflow?type=open-attachment&libraryID=' + encodeURIComponent(lib)
      + '&key=' + encodeURIComponent(cle);
    if (page) {
      url += '&navigation=' + encodeURIComponent(JSON.stringify({ pageIndex: Math.max(0, page - 1) }));
    }
    window.open(url);
  }

  async ouvrirNote(basename) {
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === basename);
    if (f) await this.app.workspace.getLeaf(true).openFile(f);
    else new obsidian.Notice(tr('Note introuvable : ') + basename);
  }

  async ouvrirVueReferences() {
    const ex = this.app.workspace.getLeavesOfType(TYPE_VUE_REFS);
    if (ex.length) { this.app.workspace.revealLeaf(ex[0]); return; }
    const feuille = this.app.workspace.getRightLeaf(false);
    if (!feuille) return;
    await feuille.setViewState({ type: TYPE_VUE_REFS, active: true });
    this.app.workspace.revealLeaf(feuille);
  }

  cheminBibliographies() {
    const rel = this.app.vault.configDir + '/plugins/' + this.manifest.id + '/bibliographies.json';
    const base = (this.app.vault.adapter && this.app.vault.adapter.basePath) || '';
    return base ? require('path').join(base, rel) : null;
  }

  // Deux formes ont coexisté dans le cache : les tableaux « reference » bruts de
  // Crossref, et la forme d'Ariane { auteurs, annee, titre, doi, brut }. On
  // convertit à la lecture, pour n'en manipuler qu'une seule ensuite.
  static normaliserEntree(e) {
    if (!e || typeof e !== 'object') return null;
    if (Array.isArray(e.auteurs) || e.annee !== undefined) return e; // déjà normalisée
    const brut = String(e.unstructured || '').trim();
    const decoupe = e._ariane || null;
    const auteur = String(e.author || '').trim();
    const auteurs = decoupe && decoupe.auteurs && decoupe.auteurs.length
      ? decoupe.auteurs
      : (auteur ? auteur.split(/[^\p{L}\p{M}'-]+/u).filter((x) => x.length > 1) : []);
    return {
      auteurs,
      annee: String(e.year || (decoupe && decoupe.annee) || '').trim(),
      titre: String(e['article-title'] || e['volume-title'] || (decoupe && decoupe.titre) || '').trim(),
      revue: String(e['journal-title'] || (decoupe && decoupe.revue) || '').trim(),
      doi: normDoi(e.DOI),
      brut,
    };
  }

  static normaliserBiblio(liste) {
    return (liste || []).map((e) => ZotflowAtomiser.normaliserEntree(e)).filter(Boolean);
  }

  chargerBibliographies() {
    if (this.bibliographies) return this.bibliographies;
    const c = this.cheminBibliographies();
    try {
      this.bibliographies = c ? JSON.parse(require('fs').readFileSync(c, 'utf8')) : {};
    } catch (e) {
      this.bibliographies = {};
    }
    return this.bibliographies;
  }

  // Les références citées d'une source, dans la forme d'Ariane, quelle que soit
  // la manière dont elles sont entrées dans le cache.
  /* ------------- La bibliographie lue dans le PDF lui-même ----------------- *
   * Crossref ne connaît que ce qui porte un DOI. Or les livres n'en ont
   * souvent pas, et ce sont eux qui portent les références les plus citées :
   * Dresch 2015 à lui seul cite March & Smith, Romme et van Aken, invisibles
   * autrement. Zotero garde sur le disque le texte extrait de chaque PDF, dans
   * « storage/<clé>/.zotero-ft-cache ». On y lit la bibliographie directement.
   * ------------------------------------------------------------------------ */

  racineZotero() {
    const regle = (this.settings.dossierZotero || '').trim();
    if (regle) return regle;
    const os = require('os');
    return require('path').join(os.homedir(), 'Zotero');
  }

  // Le texte extrait d'une pièce jointe, mis en cache mémoire : un PDF pèse
  // deux cent cinquante mille caractères, on ne le relit pas par référence.
  texteAttachement(cle) {
    if (!cle) return '';
    if (!this._textesPdf) this._textesPdf = {};
    if (Object.prototype.hasOwnProperty.call(this._textesPdf, cle)) return this._textesPdf[cle];
    const chemin = require('path').join(this.racineZotero(), 'storage', cle, '.zotero-ft-cache');
    let t = '';
    try { t = require('fs').readFileSync(chemin, 'utf8'); } catch (e) { t = ''; }
    this._textesPdf[cle] = t;
    return t;
  }

  // Une entrée de bibliographie porte le nom SUIVI d'initiales, « March, S. T.
  // (1995) », ce qu'un appel en cours de texte n'écrit jamais : « (March and
  // Smith 1995) ». C'est ce discriminant qui distingue les deux, et il est
  // fiable — vérifié sur huit références d'un même ouvrage.
  static entreeDansTexte(texte, nomFamille, annee) {
    if (!texte || !nomFamille || !annee) return null;
    let motif;
    try {
      motif = new RegExp(echapperRegex(nomFamille)
        + ',\\s*(?:[A-Z]\\.\\s*){1,4}[^\\n]{0,120}?\\b' + annee + '\\b[^\\n]{0,320}', 'g');
    } catch (e) { return null; }
    let brut = null;
    let m;
    while ((m = motif.exec(texte)) !== null) {
      const s = m[0].replace(/\s+/g, ' ').trim();
      if (!brut || s.length > brut.length) brut = s;
    }
    if (!brut) return null;
    // Couper à l'entrée suivante, qui commence par « Nom, X. ».
    const suivante = /\s(?:[A-Z][\wÀ-ÿ'’-]+(?:\s[A-Z][\wÀ-ÿ'’-]+)?,\s*(?:[A-Z]\.\s*){1,4})/;
    const apres = brut.indexOf(annee) + annee.length;
    const d = suivante.exec(brut.slice(apres));
    if (d) brut = brut.slice(0, apres + d.index).trim();
    let titre = '';
    const mt = new RegExp(annee + '\\)?\\s*[.,]\\s*(.+?)(?:\\.\\s|\\.$)').exec(brut);
    if (mt) titre = mt[1].trim();
    return { brut, titre };
  }

  // Cherche dans le PDF d'une source ce qu'elle dit d'un libellé cité.
  async entreePdfPourSource(sourceBasename, libelle) {
    const m = String(libelle).match(/^(.*?),\s*(\d{4})/);
    if (!m) return null;
    const nom = m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop();
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === sourceBasename);
    if (!f) return null;
    const cle = await this.cleAttachement(f);
    if (!cle) return null;
    const t = this.texteAttachement(cle);
    if (!t) return null;
    const e = ZotflowAtomiser.entreeDansTexte(t, nom, m[2]);
    if (!e || !e.titre || e.titre.length < 8) return null;
    return { auteurs: [nom.toLowerCase()], annee: m[2], titre: e.titre,
      revue: '', doi: '', brut: e.brut, viaPdf: true };
  }

  // Clé de pièce jointe par source, construite une fois : candidatsPourSource
  // est synchrone et ne peut pas lire les notes.
  async indexAttachements() {
    if (this._attachements) return this._attachements;
    const m = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.estSourceZoteroFrontmatter(f)) continue;
      const cle = await this.cleAttachement(f);
      if (cle) m.set(f.basename, cle);
    }
    this._attachements = m;
    return m;
  }

  bibliographieDeDoi(doi) {
    const d = normDoi(doi);
    if (!d) return null;
    const brut = this.chargerBibliographies()[d];
    if (!brut) return null;
    if (!this._biblioNorm) this._biblioNorm = {};
    if (!this._biblioNorm[d]) this._biblioNorm[d] = ZotflowAtomiser.normaliserBiblio(brut);
    return this._biblioNorm[d];
  }

  async ecrireBibliographies() {
    const c = this.cheminBibliographies();
    if (!c) return;
    try {
      require('fs').writeFileSync(c, JSON.stringify(this.bibliographies || {}), 'utf8');
    } catch (e) {
      console.error('[Ariane] Cache de bibliographies non écrit :', e);
    }
  }

  // Qui cite quoi. Une annotation porte « zotflow-source » et
  // « références-citées » : le croisement des deux donne, pour chaque référence
  // en attente, les sources qui la mentionnent et combien de fois.
  indexCitations() {
    const parRef = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const src = sansLien(fm['zotflow-source'] || '');
      const refs = fm['références-citées'];
      if (!src || !refs) continue;
      const liste = Array.isArray(refs) ? refs : [refs];
      for (const brut of liste) {
        const nom = cleDeLien(sansLien(brut));
        if (!nom || nom === src) continue;
        if (!parRef.has(nom)) parRef.set(nom, { total: 0, sources: new Map() });
        const e = parRef.get(nom);
        e.total += 1;
        e.sources.set(src, (e.sources.get(src) || 0) + 1);
      }
    }
    return parRef;
  }

  // Toutes les références en attente, avec ce qu'on sait d'elles.
  indexReferencesAttente() {
    const dossier = this.dossierR;
    const citations = this.indexCitations();
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!dossier || !f.path.startsWith(dossier + '/')) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (fm.type !== 'reference-citee') continue;
      const c = citations.get(f.basename) || { total: 0, sources: new Map() };
      out.push({
        fichier: f,
        nom: f.basename,
        doi: normDoi(fm.doi),
        titre: String(fm['titre-cité'] || '').trim(),
        etat: String(fm['arbitrage'] || '').trim(),
        complete: Array.isArray(fm.auteurs) && fm.auteurs.length > 0 && !!fm['titre-cité'],
        citations: c.total,
        sources: [...c.sources.entries()].sort((a, b) => b[1] - a[1]),
      });
    }
    out.sort((a, b) => b.citations - a.citations || a.nom.localeCompare(b.nom));
    return out;
  }

  // Les passages surlignés où une référence est citée. C'est la matière que
  // demande la résolution fine : le texte de l'article autour de l'appel de
  // citation, qui dit de quoi il retourne.
  indexPassages() {
    const parRef = new Map();
    const marque = '[!' + (this.settings.calloutCitation || 'quote') + ']';
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const src = sansLien(fm['zotflow-source'] || '');
      const refs = fm['références-citées'];
      if (!src || !refs) continue;
      const liste = (Array.isArray(refs) ? refs : [refs]).map((x) => cleDeLien(sansLien(x)));
      const noms = liste.filter((n) => n && n !== src);
      if (!noms.length) continue;
      parRef.set('__fichiers__', true);
      for (const nom of noms) {
        if (!parRef.has(nom)) parRef.set(nom, []);
        parRef.get(nom).push({ fichier: f, source: src, marque });
      }
    }
    parRef.delete('__fichiers__');
    return parRef;
  }

  // Le passage surligné d'une note d'annotation, tel que le modèle l'a écrit.
  async passageDe(fichier, marque) {
    const t = await this.app.vault.cachedRead(fichier);
    const i = t.indexOf('> ' + marque);
    if (i < 0) return '';
    const lignes = [];
    for (const l of t.slice(i).split('\n').slice(1)) {
      const m = l.match(/^>\s?(.*)$/);
      if (!m) break;
      if (/^\[!/.test(m[1].trim())) break;
      lignes.push(m[1]);
    }
    return lignes.join(' ').replace(/\s{2,}/g, ' ').trim();
  }

  // Fenêtre de texte autour de l'appel de citation dans le passage. C'est elle
  // qui départage deux entrées de bibliographie du même auteur et de la même
  // année : le sujet de la phrase ressemble au titre du bon travail.
  fenetreCitation(passage, nomFamille) {
    if (!passage || !nomFamille) return '';
    const p = sansAccents(passage);
    const i = p.indexOf(sansAccents(nomFamille));
    if (i < 0) return passage;
    const mots = passage.split(/\s+/);
    let compte = 0, index = 0;
    for (let k = 0; k < mots.length; k++) {
      compte += mots[k].length + 1;
      if (compte > i) { index = k; break; }
    }
    return mots.slice(Math.max(0, index - 25), index + 25).join(' ');
  }

  // Les candidats de bibliographie d'un libellé chez UNE source, classés. Sorti
  // de la résolution pour que le comptage par œuvre s'appuie exactement sur le
  // même appariement, sans en écrire un second qui divergerait.
  candidatsPourSource(libelle, source, passage) {
    const m = String(libelle).match(/^(.*?),\s*(\d{4})([a-z]?)/);
    if (!m) return [];
    const premier2 = m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop();
    const premier = sansAccents(premier2);
    const annee = m[2];
    const suffixe = m[3] || '';
    const fiche = this.construireIndexZotero().find((z) => z.basename === source);
    const liste = fiche && fiche.doi ? this.bibliographieDeDoi(fiche.doi) : null;
    // Crossref muet — le cas de tous les livres, qui n'ont pas de DOI : on lit
    // la bibliographie dans le texte du PDF lui-même.
    const versPdf = () => {
      const cle = this._attachements ? this._attachements.get(source) : null;
      const e = cle ? ZotflowAtomiser.entreeDansTexte(this.texteAttachement(cle), premier2, annee) : null;
      if (!e || !titreCredible(e.titre)) return [];
      return [{ titre: e.titre, doi: '', brut: e.brut, revue: '', score: 0, viaPdf: true }];
    };
    // Crossref muet, le cas de tous les livres, qui n'ont pas de DOI.
    if (!liste || !liste.length) return versPdf();
    const sac = new Set(tokeniser(this.fenetreCitation(passage || '', premier)));

    const cands = [];
    for (const e of liste) {
      if (String(e.annee || '') !== annee) continue;
      const brut = sansAccents(e.brut || '');
      const noms = (e.auteurs || []).map((x) => sansAccents(String(x).split(/\s+/).pop()));
      const colle = noms.length
        ? noms.includes(premier)
        : brut.split(/[^a-z0-9]+/).filter(Boolean)[0] === premier;
      if (!colle) continue;
      // Crossref rend parfois la référence entière en guise de titre. On en
      // extrait le vrai titre, faute de quoi la note détachée s'appellerait
      // « (Lawrence, M.G., S) », un début de liste d'auteurs.
      let titre = String(e.titre || '').trim();
      if (titre && !titreCredible(titre)) titre = titreDansReference(titre, annee);
      const doi = normDoi(e.doi);
      if (!titre && !doi) continue;
      cands.push({ titre, doi, brut, revue: String(e.revue || '').trim(), score: 0 });
    }
    if (!cands.length) return [];

    if (suffixe) {
      const explicite = cands.filter((c) => c.brut.includes(annee + suffixe));
      if (explicite.length) {
        for (const c of explicite) c.score += 100;
      } else {
        const rang = suffixe.charCodeAt(0) - 97;
        const tries = cands.slice().sort((x, y) => x.titre.localeCompare(y.titre));
        if (tries[rang]) tries[rang].score += 60;
      }
    }
    for (const c of cands) {
      let ctx = 0;
      for (const mot of tokeniser(c.titre)) if (sac.has(mot)) ctx += 3;
      c.score += Math.min(ctx, 30);
    }
    // Crossref a répondu mais ne mentionne pas cette référence : sa liste est
    // souvent incomplète. Le PDF, lui, porte la bibliographie entière.
    if (!cands.length) return versPdf();

    cands.sort((a, b) => b.score - a.score);
    return cands;
  }

  /* ------------------ Compter par œuvre, non par libellé ------------------- *
   * Le libellé agrège mal : « Gawer & Cusumano, 2014 » et « Gawer, 2014 » sont
   * le même article et comptent séparément, tandis que « Iansiti & Levien,
   * 2004 » cumule six citations pour DEUX ouvrages distincts. Compter par œuvre
   * répare les deux, et c'est ce compte qui doit guider une acquisition.
   * ------------------------------------------------------------------------ */

// Deux entrées désignent le même travail quand l'une des deux commence ou
  // contient l'autre au-delà de douze caractères : « Co-opetition » et
  // « Co‐opetition: A revolutionary mindset… », « Designing interactive
  // strategy » et « From value chain… designing interactive strategy ». Deux
  // DOI distincts restent deux œuvres, quel que soit le titre.
  static fondreOeuvresProches(liste) {
    const clef = (t) => sansAccents(t || '')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const out = [];
    for (const o of liste) {
      const ko = clef(o.titre);
      const jumeau = out.find((x) => {
        if (x.doi && o.doi) return x.doi === o.doi;
        if (x.doi !== o.doi && (x.doi || o.doi)) return false;
        const kx = clef(x.titre);
        if (!ko || !kx) return false;
        const court = ko.length < kx.length ? ko : kx;
        const long = ko.length < kx.length ? kx : ko;
        if (court.length >= 12 && long.includes(court)) return true;
        // Un mot d'écart ne fait pas deux œuvres : « Design science in
        // information systems research » et « Design research in information
        // systems research » sortent du même PDF, à une coquille près.
        const a = new Set(court.split(' ').filter((w) => w.length > 2));
        const b = new Set(long.split(' ').filter((w) => w.length > 2));
        if (a.size < 3 || b.size < 3) return false;
        let communs = 0;
        for (const w of a) if (b.has(w)) communs += 1;
        return communs / Math.max(a.size, b.size) >= 0.75;
      });
      if (!jumeau) { out.push(o); continue; }
      jumeau.n += o.n;
      for (const sr of o.sources) if (!jumeau.sources.includes(sr)) jumeau.sources.push(sr);
      if ((o.titre || '').length > (jumeau.titre || '').length) jumeau.titre = o.titre;
      if (!jumeau.doi && o.doi) jumeau.doi = o.doi;
    }
    return out;
  }

  async indexOeuvres(passages) {
    const P = passages || this.indexPassages();
    await this.indexAttachements();
    const parRef = new Map();
    const parOeuvre = new Map();

    for (const [libelle, occurrences] of P) {
      const oeuvres = new Map();
      let nonResolues = 0;
      for (const occ of occurrences) {
        const passage = await this.passageDe(occ.fichier, occ.marque);
        const c = this.candidatsPourSource(libelle, occ.source, passage)[0];
        const cle = c ? cleOeuvre(c.titre, c.doi) : '';
        if (!cle) { nonResolues += 1; continue; }
        if (!oeuvres.has(cle)) {
          oeuvres.set(cle, { cle, titre: c.titre, doi: c.doi, revue: c.revue,
            viaPdf: !!c.viaPdf, n: 0, sources: [] });
        }
        const o = oeuvres.get(cle);
        o.n += 1;
        if (!o.sources.includes(occ.source)) o.sources.push(occ.source);
        if (c.titre.length > (o.titre || '').length) o.titre = c.titre;
        if (!o.doi && c.doi) o.doi = c.doi;
      }
      // Une occurrence non résolue ne fonde pas une œuvre : elle rejoint la
      // seule connue quand il n'y en a qu'une. Sans cette règle, « Bowker &
      // Star, 1999 » passait pour deux travaux, l'un identifié et l'autre non.
      const liste = ZotflowAtomiser.fondreOeuvresProches([...oeuvres.values()]);
      // La clé doit être recalculée après la fonte : le titre retenu est le plus
      // complet des deux, et sans ce recalcul la clé restait celle du premier
      // venu. Deux libellés désignant la même œuvre gardaient alors des clés
      // différentes, et la détection des fusions tombait à zéro.
      for (const o of liste) o.cle = cleOeuvre(o.titre, o.doi) || o.cle;
      if (liste.length === 1) liste[0].n += nonResolues;
      const total = occurrences.length;
      parRef.set(libelle, { oeuvres: liste, nonResolues: liste.length === 1 ? 0 : nonResolues, total });
      for (const o of liste) {
        if (!parOeuvre.has(o.cle)) {
          parOeuvre.set(o.cle, { cle: o.cle, titre: o.titre, doi: o.doi,
            viaPdf: !!o.viaPdf, n: 0, libelles: [] });
        }
        const g = parOeuvre.get(o.cle);
        g.n += o.n;
        if (!g.libelles.includes(libelle)) g.libelles.push(libelle);
        if ((o.titre || '').length > (g.titre || '').length) g.titre = o.titre;
        if (!g.doi && o.doi) g.doi = o.doi;
      }
    }
    return { parRef, parOeuvre };
  }

  // Résolution d'une référence en attente, source par source.
  //
  // On ne retient plus « la première source qui répond ». Une même note,
  // « Renn, 2008 », peut désigner deux travaux différents selon l'article qui
  // la cite : mesuré, sur les neuf références résolues par au moins deux
  // sources, cinq divergent et deux désignent réellement deux œuvres. Prendre
  // la première venue choisissait au hasard, et le hasard s'est déjà écrit dans
  // le coffre.
  //
  // L'égalité des noms est stricte sur les mots : « han » CONTENU dans
  // « hannah » rattachait Han et al. 2017 à Hannah 2018.
  async resoudreParBibliographie(entree, passages) {
    await this.indexAttachements();
    const biblio = this.chargerBibliographies();
    const m = entree.nom.match(/^(.*?),\s*(\d{4})([a-z]?)/);
    if (!m) return null;
    const premier = sansAccents(m[1].split(/\s+(?:et al\.?|&|and|et)\s+|,/)[0].trim().split(/\s+/).pop());
    const annee = m[2];
    const suffixe = m[3] || '';
    const index = this.construireIndexZotero();
    const occurrences = (passages || this.indexPassages()).get(entree.nom) || [];

    const parSource = [];
    for (const occ of occurrences) {
      const fiche = index.find((z) => z.basename === occ.source);
      const liste = fiche && fiche.doi ? this.bibliographieDeDoi(fiche.doi) : null;
      if (!liste || !liste.length) continue;
      const passage = await this.passageDe(occ.fichier, occ.marque);
      const sac = new Set(tokeniser(this.fenetreCitation(passage, premier)));

      // Un seul appariement dans tout le greffon : la copie qui vivait ici a
      // divergé une fois, un garde-fou n'ayant été posé que sur l'autre.
      const cands = this.candidatsPourSource(entree.nom, occ.source, passage);
      if (!cands.length) continue;
      const ecart = cands.length > 1 ? cands[0].score - cands[1].score : 999;
      parSource.push({
        source: occ.source, fichier: occ.fichier, passage,
        candidats: cands, retenu: cands[0], sur: cands.length === 1 || ecart >= 3,
      });
    }
    if (!parSource.length) return null;

    // Regroupement en œuvres distinctes. La comparaison des titres est plus
    // délicate qu'il n'y paraît : mesuré sur un vrai coffre, trois « conflits »
    // sur cinq n'en étaient pas. « Co-opetition » et « Co‐opetition: A
    // revolutionary mindset… » diffèrent par un trait d'union Unicode et un
    // sous-titre ; « Designing interactive strategy » est la troncature de
    // « From value chain to value constellation: designing interactive
    // strategy ». D'où : normalisation dure, puis un titre qui commence l'autre
    // désigne le même travail. Un titre vide ne fonde jamais une œuvre à part.
    const clefTitre = (t) => sansAccents(t)
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const oeuvres = [];
    for (const p of parSource) {
      const c = p.retenu;
      const kt = clefTitre(c.titre);
      let o = null;
      if (c.doi) o = oeuvres.find((x) => x.doi && x.doi === c.doi);
      if (!o && kt) {
        o = oeuvres.find((x) => {
          if (x.doi && c.doi && x.doi !== c.doi) return false; // deux DOI distincts : deux œuvres
          const kx = clefTitre(x.titre);
          if (!kx) return true;
          const court = kt.length < kx.length ? kt : kx;
          const long = kt.length < kx.length ? kx : kt;
          // Contenu, et pas seulement en tête : « Designing interactive
          // strategy » est le SOUS-titre de « From value chain to value
          // constellation: designing interactive strategy ». Le seuil de douze
          // caractères écarte les rapprochements fortuits.
          return court.length >= 12 && long.includes(court);
        });
      }
      // Entrée sans titre ni DOI : elle rejoint la première œuvre plutôt que
      // d'en inventer une seconde à partir de rien.
      if (!o && !kt && !c.doi) o = oeuvres[0];
      if (!o) {
        o = { cle: c.doi || kt, titre: c.titre, doi: c.doi, revue: c.revue, sources: [] };
        oeuvres.push(o);
      }
      // Un titre plus complet vaut mieux qu'un titre tronqué.
      if (c.titre.length > (o.titre || '').length) o.titre = c.titre;
      if (!o.doi && c.doi) o.doi = c.doi;
      o.sources.push(p.source);
    }
    oeuvres.sort((a, b) => b.sources.length - a.sources.length);

    const t = parSource.find((x) => x.sur) || parSource[0];
    return {
      parSource, oeuvres,
      conflit: oeuvres.length > 1,
      source: t.source, passage: t.passage, sur: t.sur && oeuvres.length === 1,
      doi: t.retenu.doi, titre: t.retenu.titre, revue: t.retenu.revue,
      autres: t.candidats.slice(1).map((x) => ({ titre: x.titre, doi: x.doi })),
    };
  }



  /* ------------- Découpage des entrées de bibliographie brutes ------------- *
   * Mesuré : sur 5917 entrées en cache, 2988 portent un titre, 1974 ne portent
   * rien d'exploitable, et 955 n'existent qu'en texte brut, du genre
   * « Baldwin C. Y.(2014).Bottlenecks modules… (Working Paper No. 15-028) ».
   * Aucune expression régulière n'en vient à bout. Un modèle, si.
   *
   * Règle : le modèle propose, il ne décide jamais. Chaque extraction est
   * recoupée avec le texte d'origine, l'année et le nom devant s'y retrouver,
   * faute de quoi elle est jetée. Une fausse référence dans une thèse est un
   * dégât autrement plus grave qu'une référence non résolue.
   * ------------------------------------------------------------------------ */

  // Le modèle rend parfois « {"annee":["2012"]} » au lieu d'une chaîne : on
  // accepte les deux plutôt que de perdre l'extraction sur une vétille.
  static premier(v) {
    if (Array.isArray(v)) return v.length ? String(v[0]).trim() : '';
    return String(v == null ? '' : v).trim();
  }

  // Recoupement avec le texte d'origine. C'est ici que se joue la confiance.
  validerDecoupage(extrait, brut) {
    const b = sansAccents(brut);
    const annee = ZotflowAtomiser.premier(extrait.annee);
    if (!/^\d{4}$/.test(annee) || !b.includes(annee)) return null;
    const auteurs = (Array.isArray(extrait.auteurs) ? extrait.auteurs : [extrait.auteurs])
      .map((x) => sansAccents(String(x || '')).split(/\s+/)[0])
      .filter((x) => x.length > 1);
    if (!auteurs.length) return null;
    const mots = new Set(b.split(/[^a-z0-9]+/).filter(Boolean));
    if (!mots.has(auteurs[0])) return null;
    const titre = ZotflowAtomiser.premier(extrait.titre);
    // Un titre que le texte d'origine ne contient pas est une invention.
    if (titre.length < 8 || !b.includes(sansAccents(titre).slice(0, 24))) return null;
    return { auteurs, annee, titre, revue: ZotflowAtomiser.premier(extrait.revue) };
  }

  async decouperBibliographies() {
    const biblio = this.chargerBibliographies();
    const aFaire = [];
    for (const doi of Object.keys(biblio)) {
      const liste = biblio[doi] || [];
      const norm = this.bibliographieDeDoi(doi) || [];
      for (let i = 0; i < norm.length; i++) {
        const e = norm[i];
        if (e.titre) continue;
        if (!e.brut || e.brut.length < 20) continue;
        aFaire.push({ doi, i, brut: e.brut });
      }
    }
    if (!aFaire.length) { new obsidian.Notice(tr('Rien à découper.')); return 0; }

    const consigne = tr("Tu reçois une référence bibliographique brute. Rends STRICTEMENT un objet JSON avec les clés auteurs (liste de noms de famille), annee (chaîne de 4 chiffres), titre (le titre de l'œuvre, sans la revue ni l'éditeur), revue (ou chaîne vide). Aucun texte hors du JSON.")
      + '\n\n' + tr('Référence :') + '\n';

    const avis = new obsidian.Notice(tr('Découpage : 0 / ') + aFaire.length, 0);
    let n = 0, gardes = 0, jetes = 0;
    this.decoupageEnCours = true;
    for (const t of aFaire) {
      if (!this.decoupageEnCours) break;
      const rep = await this.genererJsonRefs(consigne + t.brut, 320);
      n += 1;
      avis.setMessage(tr('Découpage : ') + n + ' / ' + aFaire.length
        + '  (' + gardes + ' ' + tr('retenus') + ', ' + jetes + ' ' + tr('rejetés') + ')');
      if (!rep) { jetes += 1; continue; }
      let brutJson = String(rep).trim();
      const d = brutJson.indexOf('{'), f = brutJson.lastIndexOf('}');
      if (d >= 0 && f > d) brutJson = brutJson.slice(d, f + 1);
      let extrait;
      try { extrait = JSON.parse(brutJson); } catch (e) { jetes += 1; continue; }
      const valide = this.validerDecoupage(extrait, t.brut);
      if (!valide) { jetes += 1; continue; }
      // On écrit dans la forme normalisée, qui est celle du cache désormais.
      const cible = (this.bibliographieDeDoi(t.doi) || [])[t.i];
      if (!cible) { jetes += 1; continue; }
      cible.titre = valide.titre;
      cible.revue = cible.revue || valide.revue || '';
      if (!cible.auteurs || !cible.auteurs.length) cible.auteurs = valide.auteurs;
      if (!cible.annee) cible.annee = valide.annee;
      this.bibliographies[t.doi] = this.bibliographieDeDoi(t.doi);
      gardes += 1;
      // Écriture régulière : un lot de mille entrées ne doit pas être perdu
      // parce qu'Obsidian a été fermé en cours de route.
      if (gardes % 25 === 0) await this.ecrireBibliographies();
    }
    this.decoupageEnCours = false;
    await this.ecrireBibliographies();
    avis.hide();
    if (gardes) {
      await this.fusionnerAutomatiquement(true);
      await this.detacherAutomatiquement(true);
      await this.ecrireIdentificationsAutomatiquement(true);
    }
    new obsidian.Notice(tr('Découpage terminé : ') + gardes + ' ' + tr('retenus')
      + ', ' + jetes + ' ' + tr('rejetés') + '.');
    return gardes;
  }

  // Une passe unique sur les sources citantes qui portent un DOI. Mesuré : 69
  // appels suffisent pour couvrir 631 références en attente, et le résultat est
  // conservé sur disque, donc le volet s'ouvre ensuite sans réseau.
  async rafraichirBibliographies(forcer) {
    const biblio = this.chargerBibliographies();
    const index = this.construireIndexZotero();
    const refs = this.indexReferencesAttente();
    const besoins = new Set();
    for (const r of refs) {
      for (const [src] of r.sources) {
        const fiche = index.find((z) => z.basename === src);
        if (fiche && fiche.doi && (forcer || !(fiche.doi in biblio))) besoins.add(fiche.doi);
      }
    }
    if (!besoins.size) {
      new obsidian.Notice(tr('Bibliographies déjà à jour.'));
      return 0;
    }
    const liste = [...besoins];
    const avis = new obsidian.Notice(tr('Bibliographies : 0 / ') + liste.length, 0);
    let n = 0;
    for (const doi of liste) {
      // On passe par le chemin unique : il interroge Crossref puis OpenAlex,
      // complète les entrées qui n'ont qu'un DOI, et écrit dans le cache
      // partagé. Une seconde requête maison faisait double emploi.
      await this.apiRefsPourDoi(doi);
      n += 1;
      avis.setMessage(tr('Bibliographies : ') + n + ' / ' + liste.length);
      if (this.dernierAppelReseau) await new Promise((r) => setTimeout(r, 300));
    }
    avis.hide();
    new obsidian.Notice(tr('Bibliographies récupérées : ') + n);
    return n;
  }

  /* --------------- Références citées via API bibliographique ---------------- */

  paramMailto() {
    const e = (this.settings.apiEmail || '').trim();
    return e ? 'mailto=' + encodeURIComponent(e) : '';
  }

  async apiGetJson(url) {
    try {
      const rep = await obsidian.requestUrl({ url, method: 'GET', throw: false });
      if (rep && rep.status >= 200 && rep.status < 300) {
        return rep.json !== undefined ? rep.json : JSON.parse(rep.text);
      }
    } catch (e) {
      console.debug('[Ariane] apiGetJson', url, e);
    }
    return null;
  }

  async apiCrossref(doi) {
    const q = this.paramMailto();
    const url = 'https://api.crossref.org/works/' + encodeURIComponent(doi) + (q ? '?' + q : '');
    const json = await this.apiGetJson(url);
    return json ? refsDepuisCrossref(json) : [];
  }

  async apiOpenAlex(doi) {
    const q = this.paramMailto();
    const base = 'https://api.openalex.org';
    const w = await this.apiGetJson(base + '/works/doi:' + doi + '?select=referenced_works' + (q ? '&' + q : ''));
    const ids = (w && w.referenced_works) || [];
    const refs = [];
    for (let i = 0; i < ids.length; i += 50) {
      const lot = ids.slice(i, i + 50).map((x) => String(x).replace(/^https?:\/\/openalex\.org\//i, ''));
      const rep = await this.apiGetJson(
        base + '/works?filter=ids.openalex:' + lot.join('|') +
        '&per-page=50&select=id,doi,title,publication_year,authorships' + (q ? '&' + q : '')
      );
      if (rep && rep.results) refs.push(...refsDepuisOpenAlexWorks(rep.results));
    }
    return refs;
  }

  async apiRefsPourDoi(doi, forcer) {
    doi = normDoi(doi);
    if (!doi) return [];
    // Le cache est partagé avec le volet d'arbitrage : générer une
    // bibliographie l'alimente, et l'ouvrir n'appelle plus le réseau. Les deux
    // fonctions interrogeaient les mêmes DOI chacune de son côté.
    this.dernierAppelReseau = false;
    if (!forcer) {
      const enCache = this.bibliographieDeDoi(doi);
      if (enCache && enCache.length) return enCache;
    }
    this.dernierAppelReseau = true;
    const src = this.settings.apiSource || 'auto';
    let refs;
    if (src === 'crossref') refs = await this.apiCrossref(doi);
    else if (src === 'openalex') refs = await this.apiOpenAlex(doi);
    else {
      refs = await this.apiCrossref(doi); // Crossref d'abord (couverture, un appel)
      if (!refs.length) refs = await this.apiOpenAlex(doi); // sinon OpenAlex
    }
    const finales = await this.enrichirRefsParDoi(refs);
    if (finales && finales.length) {
      this.chargerBibliographies()[doi] = finales;
      if (this._biblioNorm) delete this._biblioNorm[doi];
      await this.ecrireBibliographies();
    }
    return finales;
  }

  // Complète les références qui n'ont qu'un DOI (fréquent avec Crossref) en
  // récupérant titre / année / auteurs via OpenAlex, par lots. Échoue en
  // silence : au pire les références restent « sans titre ».
  async enrichirRefsParDoi(refs) {
    const manquants = (refs || []).filter((r) => r.doi && (!r.titre || !r.auteurs || !r.auteurs.length));
    const dois = [...new Set(manquants.map((r) => r.doi))];
    if (!dois.length) return refs;
    const q = this.paramMailto();
    const parDoi = new Map();
    for (let i = 0; i < dois.length; i += 40) {
      const lot = dois.slice(i, i + 40);
      const url = 'https://api.openalex.org/works?filter=doi:' + lot.join('|') +
        '&per-page=40&select=doi,title,publication_year,authorships' + (q ? '&' + q : '');
      const rep = await this.apiGetJson(url);
      for (const w of (rep && rep.results) || []) {
        const d = normDoi(w.doi || '');
        if (d) parDoi.set(d, w);
      }
    }
    for (const r of refs) {
      const w = r.doi ? parDoi.get(r.doi) : null;
      if (!w) continue;
      if (!r.titre) r.titre = String(w.title || '').trim();
      if (!r.annee && w.publication_year) r.annee = String(w.publication_year);
      if (!r.auteurs || !r.auteurs.length) {
        r.auteurs = (w.authorships || [])
          .map((a) => nomFamille((a.author && a.author.display_name) || a.raw_author_name || ''))
          .filter(Boolean);
      }
    }
    return refs;
  }

  sourceParDoi(doi, index) {
    const d = normDoi(doi);
    if (!d) return null;
    for (const z of index || []) if (z.doi && z.doi === d) return z.basename;
    return null;
  }

  doiDeSource(file) {
    const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter;
    return normDoi(fm && fm.doi);
  }

  // Une référence citée (parseNomReference) correspond-elle à une réf. API ?
  refCorrespondApi(ref, apiRef) {
    return appariementSource(ref, { surnames: apiRef.auteurs || [], annee: apiRef.annee }) != null;
  }

  // Notes de référence en attente citées par une source (via ses annotations).
  referencesEnAttenteDeSource(sourceBasename) {
    const noms = new Set();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(this.dossierA + '/')) continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (!fm || fm['zotflow-auto'] !== true) continue;
      const s = String(fm['zotflow-source'] || '').replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
      if (s !== sourceBasename) continue;
      let refs = fm['références-citées'];
      if (!refs) continue;
      if (!Array.isArray(refs)) refs = [refs];
      for (const r of refs) {
        const cible = String(r).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
        if (!cible) continue;
        const dest = this.app.metadataCache.getFirstLinkpathDest(cible, f.path);
        if (dest && dest.path.startsWith(this.dossierR + '/')) noms.add(dest.basename);
      }
    }
    return [...noms];
  }

  async enrichirReference(refFile, apiRef) {
    this.marquerEcriture(refFile.path);
    await this.app.fileManager.processFrontMatter(refFile, (fm) => {
      if (apiRef.titre) fm['titre-cité'] = apiRef.titre;
      if (apiRef.doi) fm['doi'] = apiRef.doi;
    });
  }

  // Commande : générer la note de bibliographie citée d'une source.
  ligneRefTexte(a) {
    const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
    const aut = (a.auteurs || []).map(cap).join(', ');
    const t = a.titre || a.brut || '(sans titre)';
    const d = a.doi ? '`' + a.doi + '`' : '`—`';
    return '- ' + (aut ? aut + ' ' : '') + (a.annee ? '(' + a.annee + ') ' : '') + '— ' + t + '  ' + d;
  }

  // Génère la note de bibliographie citée d'une source, à trois statuts, et
  // rattache / enrichit dynamiquement ses références en attente au passage.
  async genererBibliographieSource(fileArg, silencieux) {
    if (!this.settings.apiReferencesCitees) {
      if (!silencieux) new obsidian.Notice(tr('Références citées via API : désactivé dans les réglages.'));
      return null;
    }
    const file = fileArg || this.app.workspace.getActiveFile();
    if (!file || !this.estSourceZoteroFrontmatter(file)) {
      if (!silencieux) new obsidian.Notice(tr('Ouvrez une note source Zotero.'));
      return null;
    }
    const doi = this.doiDeSource(file);
    if (!doi) { if (!silencieux) new obsidian.Notice(tr("Cette source n'a pas de DOI.")); return null; }
    if (!silencieux) new obsidian.Notice(tr('Récupération de la bibliographie…'));
    const apiRefs = await this.apiRefsPourDoi(doi);
    if (!apiRefs.length) { if (!silencieux) new obsidian.Notice(tr("Aucune référence citée trouvée pour ce DOI.")); return null; }

    const index = this.construireIndexZotero();
    const pendings = this.referencesEnAttenteDeSource(file.basename)
      .map((nm) => ({ nom: nm, ref: parseNomReference(nm, this.settings) }))
      .filter((x) => x.ref);
    // Combien d'entrées de la bibliographie répondent à chaque référence en
    // attente ? Au-delà d'une, l'appariement auteur-année ne désigne rien : on
    // classe la référence sans écrire d'identification. C'est ce silence qui
    // avait inscrit un mauvais « Renn, 2008 » dans le coffre.
    const ambigues = new Set();
    for (const x of pendings) {
      let n = 0;
      for (const a of apiRefs) if (this.refCorrespondApi(x.ref, a)) n += 1;
      if (n > 1) ambigues.add(x.nom);
    }

    const dejaMatch = new Set();
    const secZotero = [];
    const secAttente = [];
    const secSeule = [];

    for (const a of apiRefs) {
      const zBase = a.doi ? this.sourceParDoi(a.doi, index) : null;
      const pm = pendings.find((x) => !dejaMatch.has(x.nom) && this.refCorrespondApi(x.ref, a));
      if (zBase) {
        // Présente dans Zotero : rattache la référence en attente correspondante.
        if (pm) {
          await this.remplacerLiens(pm.nom, zBase);
          const pf = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + pm.nom + '.md');
          if (pf instanceof obsidian.TFile) await this.supprimerFichier(pf);
          const e = index.find((z) => z.basename === zBase);
          if (e) await this.assurerNotesAuteurs(zBase, e.creatorsFull || []);
          dejaMatch.add(pm.nom);
        }
        secZotero.push('[[' + zBase + ']]');
      } else if (pm) {
        // Référence en attente (citée en annotation, absente de Zotero) : enrichie.
        const pf = this.app.vault.getAbstractFileByPath(this.dossierR + '/' + pm.nom + '.md');
        if (pf instanceof obsidian.TFile && !ambigues.has(pm.nom)) await this.enrichirReference(pf, a);
        dejaMatch.add(pm.nom);
        // On inscrit à côté du lien ce que la bibliographie dit de cette
        // référence. Sans cela la note ne montre qu'un « Auteur, Année » qui ne
        // distingue rien, alors que l'identification vient d'être trouvée et
        // écrite dans la note en attente : elle était invérifiable.
        secAttente.push('[[' + pm.nom + ']] ' + this.ligneRefTexte(a).replace(/^- /, '— ')
          + (ambigues.has(pm.nom) ? '  *(plusieurs entrées possibles : à arbitrer)*' : ''));
      } else {
        // Bibliographie seule : texte, hors graphe.
        secSeule.push(this.ligneRefTexte(a));
      }
    }
    // Celles que la bibliographie ne mentionne pas restent nues : c'est une
    // information en soi, et il ne faut pas laisser croire à une identification.
    for (const x of pendings) if (!dejaMatch.has(x.nom)) secAttente.push('[[' + x.nom + ']]  *(non trouvée dans cette bibliographie)*');

    const uniq = (arr) => [...new Set(arr)];
    const zList = uniq(secZotero);
    const aList = uniq(secAttente);
    const sList = uniq(secSeule);

    const lignes = [
      '---',
      'type: bibliographie-citée',
      'source: ' + JSON.stringify('[[' + file.basename + ']]'),
      'nb-references: ' + apiRefs.length,
      'nb-dans-zotero: ' + zList.length,
      'nb-en-attente: ' + aList.length,
      '---',
      '',
      '# Bibliographie citée — ' + file.basename,
      '',
      '> ' + zList.length + ' dans Zotero · ' + aList.length + ' en attente · ' +
        sList.length + ' hors corpus (sur ' + apiRefs.length + ').',
      '',
      '## Dans Zotero',
      ...(zList.length ? zList.map((l) => '- ' + l) : ['*(aucune)*']),
      '',
      '## Références en attente (citées dans vos annotations)',
      ...(aList.length ? aList.map((l) => '- ' + l) : ['*(aucune)*']),
      '',
      '## Bibliographie seule (non citées — hors graphe)',
      ...(sList.length ? sList : ['*(aucune)*']),
    ];
    await this.assurerDossier(this.settings.dossierBibliographies);
    const nomBiblio = this.nettoyerNomFichier((this.settings.prefixeBibliographie || '') + file.basename);
    const chemin = this.settings.dossierBibliographies + '/' + nomBiblio + '.md';
    await this.ecrire(chemin, lignes.join('\n') + '\n');
    if (!silencieux) {
      new obsidian.Notice(tr('Bibliographie : ') + zList.length + ' dans Zotero, ' + aList.length + ' en attente, ' +
        sList.length + ' hors corpus.'
      );
      const nf = this.app.vault.getAbstractFileByPath(chemin);
      if (nf instanceof obsidian.TFile) this.app.workspace.getLeaf(false).openFile(nf);
    }
    return { zotero: zList.length, attente: aList.length, seule: sList.length, total: apiRefs.length };
  }

  // Batch : génère les bibliographies pour toutes les sources ZotFlow à DOI.
  async genererToutesBibliographies() {
    if (!this.settings.apiReferencesCitees) { new obsidian.Notice(tr('Références citées via API : désactivé.')); return; }
    if (this.bibliosEnCours) { new obsidian.Notice(tr('Génération déjà en cours.')); return; }
    const sources = this.app.vault
      .getMarkdownFiles()
      .filter((f) => this.estSourceZoteroFrontmatter(f) && this.doiDeSource(f));
    if (!sources.length) { new obsidian.Notice(tr('Aucune source Zotero avec DOI.')); return; }

    this.bibliosEnCours = true;
    // Une notification persistante, mise à jour à chaque source. L'ancienne
    // version en créait une neuve toutes les dix sources, qui s'effaçait au
    // bout de quelques secondes : entre deux, l'écran ne disait plus rien.
    const avis = new obsidian.Notice('', 0);
    const debut = Date.now();
    let ok = 0, vide = 0, i = 0, reseau = 0;

    for (const f of sources) {
      if (!this.bibliosEnCours) break;
      i++;
      const ecoule = (Date.now() - debut) / 1000;
      const reste = reseau > 0 && i > 1
        ? Math.round((ecoule / i) * (sources.length - i))
        : null;
      avis.setMessage(tr('Bibliographies : ') + i + ' / ' + sources.length
        + '  ·  ' + ok + ' ' + tr('générée(s)') + ', ' + vide + ' ' + tr('sans résultat')
        + (reste !== null ? '\n' + tr('Reste environ ') + dureeLisible(Math.ceil(reste / 60)) : '')
        + '\n' + f.basename.slice(0, 46));
      try {
        const r = await this.genererBibliographieSource(f, true);
        if (r) ok++; else vide++;
      } catch (e) {
        vide++;
        console.error('[Ariane] biblio', f.basename, e);
      }
      // La temporisation ne vaut que pour le réseau. Une source déjà en cache
      // n'appelle personne : la faire attendre 1,2 s coûtait un quart d'heure
      // sur sept cents sources.
      if (this.dernierAppelReseau) { reseau++; await new Promise((res) => setTimeout(res, 1200)); }
    }
    const arrete = !this.bibliosEnCours;
    this.bibliosEnCours = false;
    avis.hide();
    // L'identification vient de changer : les libellés à double sens se
    // détachent d'eux-mêmes, sans rien demander.
    if (!arrete) {
      await this.fusionnerAutomatiquement(true);
      await this.detacherAutomatiquement(true);
      await this.ecrireIdentificationsAutomatiquement(true);
    }
    new obsidian.Notice((arrete ? tr('Génération interrompue : ') : tr('Bibliographies terminées : '))
      + ok + ' ' + tr('générée(s)') + ', ' + vide + ' ' + tr('sans résultat')
      + ', ' + tr('sur ') + i + '. ' + reseau + ' ' + tr('appel(s) réseau') + '.', 12000);
  }

  /* -------------------------------- Événements ------------------------------- */

  surModification(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== 'md') return;
    if (this.ecritePlugin(file.path)) return;

    if (file.path.startsWith(this.dossierA + '/')) {
      if (this.settings.verrouillage) {
        this.antirebond('lock:' + file.path, () => this.verrouiller(file));
      }
      return;
    }
    if (!this.settings.regenerationAuto && !this.settings.rattachementZotero) return;
    this.antirebond('src:' + file.path, async () => {
      const contenu = await this.app.vault.read(file);
      if (this.settings.regenerationAuto && contenu.includes(this.settings.marqueurSource)) {
        await this.atomiseSource(file);
      }
      if (this.settings.rattachementZotero && this.estSourceZoteroFrontmatter(file)) {
        await this.rattacherReferencesZotero(file);
      }
    });
  }

  surCreation(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== 'md') return;
    if (this.ecritePlugin(file.path)) return;
    if (!this.settings.regenerationAuto && !this.settings.rattachementZotero) return;
    this.antirebond('src:' + file.path, async () => {
      const contenu = await this.app.vault.read(file);
      if (this.settings.regenerationAuto && contenu.includes(this.settings.marqueurSource)) {
        await this.atomiseSource(file);
      }
      if (this.settings.rattachementZotero && this.estSourceZoteroFrontmatter(file)) {
        await this.rattacherReferencesZotero(file);
      }
    });
  }

  surSuppression(file) {
    if (!(file instanceof obsidian.TFile) || file.extension !== 'md') return;
    if (this.ecritePlugin(file.path)) return;
    if (!this.settings.propagerSuppressions) return;
    if (file.path.startsWith(this.dossierA + '/')) {
      this.antirebond('del:' + file.path, () => this.retirerLiens(file.basename));
    } else {
      // Une source supprimée (dans Zotero) : retirer ses annotations, son
      // sous-dossier, et les fiches auteurs qui n'en dépendaient que d'elle.
      this.antirebond('delsrc:' + file.path, () => this.surSuppressionSource(file.basename));
    }
  }

  /* ============================== Tâches =============================== */

  // Référence d'une tâche : T, l'année sur deux chiffres, le rang dans l'année.
  // Le rang ne réemploie jamais un numéro libéré : une référence est définitive,
  // et deux tâches distinctes ne doivent jamais avoir porté le même nom.
  // L'horodatage employé par les notes conceptuelles est écarté à dessein, un
  // lot importé produisant plusieurs objets dans la même minute.
  static referenceTacheSuivante(noms, annee) {
    const prefixe = 'T' + String(annee % 100).padStart(2, '0') + '-';
    let max = 0;
    for (const nom of noms || []) {
      if (typeof nom !== 'string' || !nom.startsWith(prefixe)) continue;
      const m = nom.slice(prefixe.length).match(/^(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return prefixe + String(max + 1).padStart(3, '0');
  }

  // La famille d'une tâche n'est pas déclarée, elle se déduit du champ rempli.
  // Un champ « famille » pourrait contredire les champs présents ; son absence
  // rend la contradiction impossible.
  // L'ordre est aussi celui de la priorité quand plusieurs sont remplis.
  static champTache(fm) {
    const ordre = ['source', 'livrable', 'fichier'];
    const remplis = ordre.filter((c) => fm && String(fm[c] == null ? '' : fm[c]).trim());
    return { retenu: remplis[0] || null, conflits: remplis.length > 1 ? remplis : [] };
  }

  static familleTache(fm) {
    const retenu = ZotflowAtomiser.champTache(fm).retenu;
    if (retenu === 'source') return 'lecture';
    return retenu ? 'production' : 'action';
  }

  // Une valeur YAML citée. Les intitulés portent des apostrophes, des deux
  // points et des guillemets typographiques : les citer systématiquement évite
  // d'avoir à décider au cas par cas.
  static yamlChaine(v) {
    const s = String(v == null ? '' : v);
    if (!s) return '';
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  // Le corps d'une note de tâche neuve. Tous les champs du schéma sont émis,
  // y compris vides : l'éditeur de propriétés d'Obsidian ne montre que ce qui
  // existe, et une tâche dont les champs manquent est une tâche qu'on ne pense
  // pas à remplir. Un champ vide s'écrit sans espace en fin de ligne, que
  // certains éditeurs suppriment et qui ferait alors diverger le fichier.
  static corpsNouvelleTache(champs) {
    const c = champs || {};
    const q = ZotflowAtomiser.yamlChaine;
    const ligne = (cle, val) => cle + ':' + (val ? ' ' + val : '');
    const intitule = c.intitule || 'Sans titre';
    const jour = c.aujourdhui || '';
    const l = [];
    l.push('---');
    l.push('aliases:');
    l.push('  - ' + q(intitule));
    l.push('type: tache');
    l.push(ligne('statut', c.statut || 'à faire'));
    l.push(ligne('priorite', c.priorite));
    l.push(ligne('debut', c.debut));
    l.push(ligne('echeance', c.echeance));
    l.push('avancement: ' + (Number(c.avancement) || 0));
    l.push('termine-le:');
    l.push('jalon: ' + (c.jalon ? 'true' : 'false'));
    l.push('parent:');
    l.push('bloque-par: []');
    l.push(ligne('source', q(c.source)));
    l.push(ligne('livrable', q(c.livrable)));
    l.push(ligne('fichier', q(c.fichier)));
    l.push(ligne('liste', q(c.liste)));
    l.push('rappel-id:');
    l.push(ligne('cree', jour));
    l.push(ligne('modifie', jour));
    l.push('---');
    l.push('');
    l.push('# ' + intitule);
    l.push('');
    l.push('## Note de travail');
    l.push('');
    l.push('## Journal');
    l.push('');
    return l.join('\n');
  }

  // Une production porte soit une note du coffre, soit un fichier du disque.
  // Monsieur ne veut pas trancher au moment de créer la tâche : la forme de ce
  // qu'il saisit suffit à décider. Seul un chemin absolu désigne le disque, ce
  // qui laisse « 3 - Notes conceptuelles/NC-… » du côté des notes malgré ses
  // barres obliques.
  static livrableOuFichier(saisie) {
    const v = String(saisie == null ? '' : saisie).trim();
    if (!v) return { champ: null, valeur: '' };
    if (v.startsWith('/') || v.startsWith('~/') || v.startsWith('file://')) {
      return { champ: 'fichier', valeur: v };
    }
    const nu = v.replace(/^\[\[|\]\]$/g, '');
    return { champ: 'livrable', valeur: '[[' + nu + ']]' };
  }

  // Libellé d'une fiche Zotero dans le sélecteur. Tout y est réuni pour que la
  // recherche approchée morde sur l'auteur, l'année, le titre ou la clé : on ne
  // retient pas une clé de citation par cœur.
  static libelleSource(fm, basename) {
    const f = fm || {};
    const auteurs = []
      .concat(f.creators || [])
      .map((c) => String(c).replace(/^\[\[|\]\]$/g, '').trim())
      .filter(Boolean);
    const bouts = [];
    if (auteurs.length) bouts.push(auteurs.slice(0, 3).join(', '));
    if (f.year) bouts.push('(' + f.year + ')');
    if (f.title) bouts.push('— ' + String(f.title));
    bouts.push('· ' + basename);
    return bouts.join(' ');
  }

  // Contenu du bloc d'accès, sans ses marques. Une action n'en a pas besoin :
  // un bloc vide dans chaque note d'action ne serait que du bruit.
  static blocTache(fm, meta) {
    const c = ZotflowAtomiser.champTache(fm);
    if (!c.retenu) return '';
    const l = [];
    if (c.conflits.length) {
      l.push('> [!warning] ' + tr('Conflit de champs') + ' : ' + c.conflits.join(', ')
             + '. ' + tr('Seul le premier est retenu.'));
      l.push('');
    }
    if (c.retenu === 'source') {
      l.push('**' + tr('Source') + '** ' + String(fm.source).trim());
      const acces = [];
      if (meta && meta.uriPdf) acces.push('[' + tr('Ouvrir le PDF') + '](' + meta.uriPdf + ')');
      if (meta && meta.uriZotero) acces.push('[' + tr('Ouvrir dans Zotero') + '](' + meta.uriZotero + ')');
      if (acces.length) { l.push(''); l.push(acces.join('  ·  ')); }
    } else if (c.retenu === 'livrable') {
      l.push('**' + tr('Livrable') + '** ' + String(fm.livrable).trim());
    } else {
      const chemin = String(fm.fichier).trim();
      l.push('**' + tr('Fichier') + '** `' + chemin.split('/').pop() + '`');
      if (meta && (meta.modifie || meta.ouvert)) {
        const bouts = [];
        if (meta.modifie) bouts.push(tr('modifié le') + ' ' + meta.modifie);
        if (meta.ouvert) bouts.push(tr('ouvert le') + ' ' + meta.ouvert);
        l.push('');
        l.push('*' + bouts.join('  ·  ') + '*');
      }
    }
    return l.join('\n');
  }

  // Les fiches Zotero du coffre, prêtes pour une recherche approchée. On les
  // reconnaît à leur clé de citation plutôt qu'à leur dossier, qui varie.
  sourcesZoteroPourChoix() {
    const out = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (f.basename.charAt(0) !== '@') continue;
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter;
      if (!fm || !fm.citationKey) continue;
      out.push({ nom: ZotflowAtomiser.libelleSource(fm, f.basename), cle: f.basename });
    }
    out.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return out;
  }

  // Interroge Spotlight pour les deux dates d'un fichier externe. mdls est
  // fourni par macOS et ne demande aucune installation. Avec -raw les valeurs
  // sont séparées par un octet nul ; un fichier absent ou non indexé ne rend
  // rien qui ressemble à une date, et le filtre le laisse tomber.
  async metadonneesFichier(chemin) {
    const abs = chemin.startsWith('~/')
      ? require('os').homedir() + chemin.slice(1)
      : chemin.replace(/^file:\/\//, '');
    return new Promise((resolve) => {
      require('child_process').execFile('mdls', [
        '-raw', '-name', 'kMDItemContentModificationDate',
        '-name', 'kMDItemLastUsedDate', abs,
      ], (err, sortie) => {
        if (err || !sortie) return resolve(null);
        const dates = String(sortie).split('\0')
          .map((x) => x.trim())
          .map((x) => (/^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : ''));
        if (!dates[0] && !dates[1]) return resolve(null);
        resolve({ modifie: dates[0] || '', ouvert: dates[1] || '' });
      });
    });
  }

  // Rassemble ce que le bloc a besoin de savoir et que seule l'application
  // connaît : les deux URI d'une lecture, les deux dates d'un fichier externe.
  // Le calcul des URI réemploie cleAttachement, déjà écrite pour le volet des
  // références : la clé de la pièce jointe ne se déduit pas de la clé de
  // citation, elle se lit dans la fiche.
  async accesTache(fm) {
    const c = ZotflowAtomiser.champTache(fm);
    if (c.retenu === 'fichier') return this.metadonneesFichier(String(fm.fichier).trim());
    if (c.retenu !== 'source') return null;
    const base = String(fm.source).replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').trim();
    const f = this.app.vault.getMarkdownFiles().find((x) => x.basename === base);
    if (!f) return null;
    const fms = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    const out = {};
    const cle = await this.cleAttachement(f);
    if (cle) {
      out.uriPdf = 'obsidian://zotflow?type=open-attachment&libraryID='
        + encodeURIComponent(fms['library-id'] || '') + '&key=' + encodeURIComponent(cle);
    }
    if (fms['zotero-key']) {
      out.uriZotero = 'zotero://select/library/items/' + String(fms['zotero-key']).trim();
    }
    return (out.uriPdf || out.uriZotero) ? out : null;
  }

  // Réécrit le bloc marqué de la note. Il se pose sous le titre s'il n'existe
  // pas encore, et disparaît si la tâche cesse de désigner quoi que ce soit.
  async majBlocTache(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = (cache && cache.frontmatter) || {};
    if (fm.type !== 'tache') return false;
    const meta = await this.accesTache(fm);
    const interieur = ZotflowAtomiser.blocTache(fm, meta);
    const bloc = interieur ? ZFA_TACHE_DEBUT + '\n' + interieur + '\n' + ZFA_TACHE_FIN : '';
    let texte = await this.app.vault.read(file);
    const debut = texte.indexOf(ZFA_TACHE_DEBUT);
    const fin = texte.indexOf(ZFA_TACHE_FIN);
    if (debut !== -1 && fin > debut) {
      texte = texte.slice(0, debut) + bloc + texte.slice(fin + ZFA_TACHE_FIN.length);
    } else if (bloc) {
      texte = texte.replace(/^(# .*\n)/m, '$1\n' + bloc + '\n');
    }
    await this.app.vault.modify(file, texte);
    return true;
  }

  // Écrit une note de tâche neuve et rend son chemin. La référence se calcule
  // sur les notes déjà présentes, ce qui garantit l'unicité sans compteur
  // conservé dans les réglages, lequel se désynchroniserait du coffre.
  async creerTache(champs) {
    const dossier = this.dossierT;
    await this.assurerDossier(dossier);
    const noms = this.app.vault.getMarkdownFiles()
      .filter((f) => f.path.startsWith(dossier + '/'))
      .map((f) => f.basename);
    const reference = ZotflowAtomiser.referenceTacheSuivante(noms, new Date().getFullYear());
    const chemin = dossier + '/' + reference + '.md';
    const jour = new Date().toISOString().slice(0, 10);
    await this.ecrire(chemin, ZotflowAtomiser.corpsNouvelleTache(Object.assign({}, champs, {
      aujourdhui: jour,
      liste: (champs && champs.liste) || this.settings.listeRappelsDefaut,
    })));
    return chemin;
  }
}

/* =========================================================================
 * Onglet de réglages
 * ========================================================================= */

class ZotflowAtomiserSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const maj = async () => this.plugin.saveSettings();
    containerEl.createEl('h2', { text: tr('Ariane') });

    const onglets = [
      [tr('Général'), 'settings', (c) => this.ongletGeneral(c, s, maj)],
      [tr('Dossiers & familles'), 'folder-tree', (c) => this.ongletDossiers(c, s, maj)],
      [tr('Affichage'), 'eye', (c) => this.ongletAffichage(c, s, maj)],
      [tr('Citations & bibliographie'), 'quote', (c) => this.ongletCitations(c, s, maj)],
      [tr('Suggestions'), 'sparkles', (c) => this.ongletSuggestions(c, s, maj)],
      [tr('Contenu des notes'), 'file-text', (c) => this.ongletContenu(c, s, maj)],
      [tr('Références & auteurs'), 'users', (c) => this.ongletReferences(c, s, maj)],
      [tr('Temps passé'), 'timer', (c) => this.ongletTemps(c, s, maj)],
      [tr('Schémas'), 'git-branch', (c) => this.ongletSchemas(c, s, maj)],
      [tr('Export Word'), 'file-output', (c) => this.ongletExport(c, s, maj)],
      [tr('Avancé'), 'wrench', (c) => this.ongletAvance(c, s, maj)],
    ];
    if (typeof this._ongletActif !== 'number' || this._ongletActif >= onglets.length) this._ongletActif = 0;

    const barre = containerEl.createDiv({ cls: 'zfa-onglets' });
    const corps = containerEl.createDiv();
    const rendre = (i) => {
      this._ongletActif = i;
      corps.empty();
      Array.from(barre.children).forEach((b, k) => b.toggleClass('is-active', k === i));
      onglets[i][2](corps);
    };
    onglets.forEach(([nom, icone], i) => {
      const b = barre.createEl('button', { cls: 'zfa-onglet' });
      const ic = b.createSpan({ cls: 'zfa-onglet-icone' });
      obsidian.setIcon(ic, icone);
      b.createSpan({ cls: 'zfa-onglet-nom', text: nom });
      b.setAttribute('aria-label', nom);
      b.onclick = () => rendre(i);
    });
    rendre(this._ongletActif);
  }

  /* ---------------- Table des familles de notes (réglages) --------------- */

  // Une ligne par famille, réordonnable au glisser-déposer. C'est le cœur de
  // la généralisation : plus aucun type de note n'est nommé dans le code, tout
  // vient d'ici.
  _tableFamilles(parent, s, maj) {
    const rendre = () => {
      hote.empty();
      const familles = Array.isArray(s.famillesNotes) ? s.famillesNotes : (s.famillesNotes = []);
      if (!familles.length) {
        hote.createDiv({ cls: 'zfa-fam-vide', text: tr("Aucune famille. Ajoutez-en une, ou laissez Ariane proposer celles de votre coffre.") });
      }
      familles.forEach((f, i) => {
        const ligne = hote.createDiv({ cls: 'zfa-fam' });
        ligne.setAttribute('draggable', 'true');

        // Réordonnancement : on ne transporte que le rang, jamais l'objet.
        ligne.addEventListener('dragstart', (ev) => {
          ev.dataTransfer.setData('text/zfa-famille', String(i));
          ev.dataTransfer.effectAllowed = 'move';
          ligne.addClass('zfa-fam-glissee');
        });
        ligne.addEventListener('dragend', () => ligne.removeClass('zfa-fam-glissee'));
        ligne.addEventListener('dragover', (ev) => {
          if (!ev.dataTransfer.types.includes('text/zfa-famille')) return;
          ev.preventDefault(); ligne.addClass('zfa-fam-cible');
        });
        ligne.addEventListener('dragleave', () => ligne.removeClass('zfa-fam-cible'));
        ligne.addEventListener('drop', async (ev) => {
          ligne.removeClass('zfa-fam-cible');
          const depuis = parseInt(ev.dataTransfer.getData('text/zfa-famille'), 10);
          if (isNaN(depuis) || depuis === i) return;
          ev.preventDefault();
          const [x] = familles.splice(depuis, 1);
          familles.splice(i, 0, x);
          await maj(); rendre();
        });

        const tete = ligne.createDiv({ cls: 'zfa-fam-tete' });
        const poignee = tete.createSpan({ cls: 'zfa-fam-poignee' });
        obsidian.setIcon(poignee, 'grip-vertical');
        poignee.setAttribute('aria-label', tr('Glisser pour réordonner'));

        const nom = tete.createEl('input', { cls: 'zfa-fam-nom', type: 'text' });
        nom.placeholder = tr('Nom de la famille');
        nom.value = f.nom || '';
        nom.onchange = async () => { f.nom = nom.value.trim(); await maj(); };

        const pastille = tete.createEl('input', { cls: 'zfa-fam-couleur', type: 'color' });
        pastille.value = f.couleur || '#888888';
        pastille.setAttribute('aria-label', tr('Couleur dans le panneau de suggestions'));
        pastille.onchange = async () => { f.couleur = pastille.value; await maj(); };

        const icone = tete.createEl('input', { cls: 'zfa-fam-icone', type: 'text' });
        icone.placeholder = tr('icône');
        icone.value = f.icone || '';
        icone.setAttribute('aria-label', tr("Nom d'icône Lucide, ex. « book »"));
        icone.onchange = async () => { f.icone = icone.value.trim(); await maj(); };

        const monter = tete.createEl('button', { cls: 'zfa-fam-bouton' });
        obsidian.setIcon(monter, 'chevron-up');
        monter.setAttribute('aria-label', tr('Monter'));
        monter.onclick = async () => {
          if (i === 0) return;
          familles.splice(i - 1, 0, familles.splice(i, 1)[0]); await maj(); rendre();
        };
        const descendre = tete.createEl('button', { cls: 'zfa-fam-bouton' });
        obsidian.setIcon(descendre, 'chevron-down');
        descendre.setAttribute('aria-label', tr('Descendre'));
        descendre.onclick = async () => {
          if (i >= familles.length - 1) return;
          familles.splice(i + 1, 0, familles.splice(i, 1)[0]); await maj(); rendre();
        };
        const suppr = tete.createEl('button', { cls: 'zfa-fam-bouton zfa-fam-suppr' });
        obsidian.setIcon(suppr, 'trash-2');
        suppr.setAttribute('aria-label', tr('Retirer cette famille'));
        suppr.onclick = async () => { familles.splice(i, 1); await maj(); rendre(); this.plugin.decorerExplorateur(); };

        const corps = ligne.createDiv({ cls: 'zfa-fam-corps' });
        const champ = (libelle, valeur, aide, sur) => {
          const bloc = corps.createDiv({ cls: 'zfa-fam-champ' });
          bloc.createEl('label', { text: libelle });
          const e = bloc.createEl('input', { type: 'text' });
          e.value = valeur; e.placeholder = aide;
          e.onchange = async () => { await sur(e.value); };
          return e;
        };
        champ(tr('Dossiers'), (f.dossiers || []).join(', '),
          tr('un ou plusieurs, séparés par des virgules'),
          async (v) => {
            f.dossiers = v.split(',').map((x) => x.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean);
            await maj(); this.plugin.invaliderIndexSuggestions(); this.plugin.decorerExplorateur();
          });
        champ(tr('Préfixe'), f.prefixe || '', 'ex. NC-  (facultatif)',
          async (v) => { f.prefixe = v.trim(); await maj(); });

        const cases = ligne.createDiv({ cls: 'zfa-fam-cases' });
        const bascule = (libelle, cle, aide, apres) => {
          const et = cases.createEl('label', { cls: 'zfa-fam-case' });
          const cb = et.createEl('input', { type: 'checkbox' });
          cb.checked = !!f[cle];
          et.createSpan({ text: libelle });
          if (aide) et.setAttribute('aria-label', aide);
          cb.onchange = async () => { f[cle] = cb.checked; await maj(); if (apres) apres(); };
        };
        bascule(tr('Aparté'), 'aparte', tr("Afficher le titre après un lien vers une note de cette famille"));
        bascule(tr('Suggestions'), 'suggestions', tr('Ces notes nourrissent le panneau de suggestions'),
          () => this.plugin.invaliderIndexSuggestions());
        bascule(tr('Chasse fixe'), 'monospace', tr("Police à largeur fixe dans l'explorateur"),
          () => this.plugin.decorerExplorateur());
        bascule(tr('Alias'), 'alias', tr("Afficher l'alias plutôt que le nom de fichier"),
          () => this.plugin.decorerExplorateur());
      });
    };

    const hote = parent.createDiv({ cls: 'zfa-familles' });
    const barre = parent.createDiv({ cls: 'zfa-fam-barre' });
    new obsidian.Setting(barre)
      .addButton((b) => b.setButtonText(tr('Ajouter une famille')).setCta().onClick(async () => {
        (s.famillesNotes = s.famillesNotes || []).push({
          nom: '', dossiers: [], prefixe: '', aparte: true,
          suggestions: false, couleur: '', icone: '', monospace: false, alias: false,
        });
        await maj(); rendre();
      }))
      .addButton((b) => b.setButtonText(tr('Proposer depuis mon coffre')).onClick(async () => {
        const proposees = this.plugin.familiesProposees();
        if (!proposees.length) { new obsidian.Notice(tr('Aucun dossier à proposer.')); return; }
        s.famillesNotes = (s.famillesNotes || []).concat(proposees);
        await maj(); rendre();
        new obsidian.Notice(proposees.length + ' famille(s) proposée(s) — à ajuster.');
      }));
    rendre();
  }

  _section(parent, titre, desc) {
    const st = new obsidian.Setting(parent).setName(titre).setHeading();
    if (desc) st.setDesc(desc);
    return st;
  }
  _aide(parent, txt) {
    const p = parent.createEl('div', { text: txt, cls: 'setting-item-description' });
    p.style.margin = '2px 0 10px';
    return p;
  }

  _sectionProfil(c, s, maj) {
    this._section(c, tr('Profil de réglages'));
    this._aide(c, tr("Un profil rassemble vos réglages pour les partager ou les retrouver ailleurs. Les chemins propres à cette machine — pandoc, filtre Lua, modèle Word, adresses des services d'inférence — n'y figurent jamais, et un profil importé ne les touche pas."));
    new obsidian.Setting(c)
      .setName(tr('Exporter'))
      .setDesc(tr("Écrit un fichier JSON dans le dossier du greffon. « Avec organisation » y ajoute vos dossiers et vos familles de notes ; sans, le profil ne contient que les réglages de fonctionnement."))
      .addButton((b) => b.setButtonText(tr('Exporter')).onClick(async () => {
        try {
          const chemin = await this.plugin.ecrireProfil(false);
          new obsidian.Notice(tr('Profil écrit : ') + chemin);
        } catch (e) { new obsidian.Notice(tr('Échec : ') + (e && e.message ? e.message : e)); }
      }))
      .addButton((b) => b.setButtonText(tr('Avec organisation')).onClick(async () => {
        try {
          const chemin = await this.plugin.ecrireProfil(true);
          new obsidian.Notice(tr('Profil écrit : ') + chemin);
        } catch (e) { new obsidian.Notice(tr('Échec : ') + (e && e.message ? e.message : e)); }
      }));
    new obsidian.Setting(c)
      .setName(tr('Importer'))
      .setDesc(tr("Collez ici le contenu d'un fichier de profil. Les réglages inconnus sont ignorés."))
      .addTextArea((t) => {
        t.inputEl.rows = 3;
        t.setPlaceholder(tr('{ "ariane": "…", "profil": { … } }'));
        this._profilColle = '';
        t.onChange((v) => { this._profilColle = v; });
      })
      .addButton((b) => b.setButtonText(tr('Importer')).setWarning().onClick(async () => {
        if (!this._profilColle || !this._profilColle.trim()) { new obsidian.Notice(tr('Rien à importer.')); return; }
        const r = await this.plugin.importerProfil(this._profilColle);
        if (r.erreur) { new obsidian.Notice(r.erreur); return; }
        new obsidian.Notice(r.poses + ' réglage(s) repris' + (r.version ? ' (profil Ariane ' + r.version + ')' : '') + '.');
        this.display();
      }));
  }

  ongletGeneral(c, s, maj) {
    new obsidian.Setting(c)
      .setName(tr('Langue'))
      .setDesc(tr("« Automatique » suit la langue d'Obsidian. Le greffon parle français et anglais ; toute autre langue affiche l'anglais."))
      .addDropdown((d) => d
        .addOption('auto', tr('Automatique'))
        .addOption('fr', tr('Français'))
        .addOption('en', tr('English'))
        .setValue(s.langue || 'auto')
        .onChange(async (v) => { s.langue = v; definirLangue(v); await maj(); this.display(); }));

    this._sectionProfil(c, s, maj);
    new obsidian.Setting(c)
      .setName(tr('Ré-atomiser tout le coffre'))
      .setDesc(tr('Régénère toutes les annotations à partir des sources.'))
      .addButton((b) => b.setButtonText(tr('Lancer')).setCta().onClick(() => this.plugin.atomiserTout()));

    this._section(c, tr('Automatisation'));
    new obsidian.Setting(c)
      .setName(tr('Régénération automatique'))
      .setDesc(tr('Régénère les annotations à chaque modification de la source.'))
      .addToggle((t) => t.setValue(s.regenerationAuto).onChange(async (v) => { s.regenerationAuto = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Verrouiller les notes automatiques'))
      .setDesc(tr('Restaure toute édition manuelle des notes générées.'))
      .addToggle((t) => t.setValue(s.verrouillage).onChange(async (v) => { s.verrouillage = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Notes verrouillées non modifiables'))
      .setDesc(tr('Les notes portant « locked: true » (fiches graphiques, notes importées) ne peuvent pas être éditées par inadvertance.'))
      .addToggle((t) => t.setValue(s.verrouLecture !== false).onChange(async (v) => {
        s.verrouLecture = v; await maj(); this.plugin.appliquerVerrouLecture();
      }));
    new obsidian.Setting(c)
      .setName(tr('Propager les suppressions'))
      .setDesc(tr("Supprime la note quand l'annotation disparaît de la source et retire ses liens. Action destructive."))
      .addToggle((t) => t.setValue(s.propagerSuppressions).onChange(async (v) => { s.propagerSuppressions = v; await maj(); }));

    this._section(c, tr('Renommer une propriété'));
    this._aide(c, tr("Changer le nom d'une propriété dans les réglages ne vaut que pour les écritures à venir : les notes déjà écrites gardent l'ancien nom. Cet outil reporte l'ancienne valeur sur la nouvelle dans tout le coffre. Une note qui porte déjà la nouvelle propriété n'est jamais écrasée."));
    this._renAncien = this._renAncien || '';
    this._renNouveau = this._renNouveau || '';
    new obsidian.Setting(c)
      .setName(tr('Ancien nom → nouveau nom'))
      .addText((t) => t.setPlaceholder(tr('temps-passe')).setValue(this._renAncien).onChange((v) => { this._renAncien = v.trim(); }))
      .addText((t) => t.setPlaceholder(tr('temps')).setValue(this._renNouveau).onChange((v) => { this._renNouveau = v.trim(); }))
      .addButton((b) => b.setButtonText(tr('Compter')).onClick(() => {
        const n = this.plugin.notesAvecPropriete(this._renAncien).length;
        new obsidian.Notice(this._renAncien
          ? n + ' note(s) portent « ' + this._renAncien + ' ».'
          : tr('Indiquez le nom actuel de la propriété.'));
      }))
      .addButton((b) => b.setButtonText(tr('Renommer')).setWarning().onClick(async () => {
        if (!this._renAncien || !this._renNouveau) { new obsidian.Notice(tr('Indiquez les deux noms.')); return; }
        const avis = new obsidian.Notice(tr('Renommage en cours…'), 0);
        const r = await this.plugin.renommerPropriete(this._renAncien, this._renNouveau);
        avis.hide();
        new obsidian.Notice(r.faites + ' note(s) renommée(s)'
          + (r.ignorees ? ', ' + r.ignorees + ' laissée(s) intacte(s)' : '')
          + (r.echecs ? ', ' + r.echecs + ' en échec' : '') + '.');
      }));

    new obsidian.Setting(c)
      .setName(tr('Correspondances de références mémorisées'))
      .setDesc(tr("Les rapprochements que vous avez confirmés à la main entre une référence en attente et une source Zotero. Les oublier vous fera reposer la question."))
      .addButton((b) => b.setButtonText(tr('Oublier')).setWarning().onClick(async () => {
        const n = Object.keys(s.correspondancesSuffixe || {}).length;
        s.correspondancesSuffixe = {};
        await maj();
        new obsidian.Notice(n + ' correspondance(s) oubliée(s).');
      }));

    this._section(c, tr('Réinitialisation'));
    new obsidian.Setting(c)
      .setName(tr('Rétablir les réglages par défaut'))
      .addButton((b) =>
        b.setButtonText(tr('Réinitialiser')).setWarning().onClick(async () => {
          this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
          await this.plugin.saveSettings();
          this.display();
        })
      );
  }

  ongletDossiers(c, s, maj) {
    // ---- Les RÔLES : les emplacements dont Ariane a besoin pour travailler.
    // Ils sont vides par défaut : le greffon ne présume d'aucune organisation.
    this._section(c, tr('Rôles — où Ariane range ses productions'));
    this._aide(c, tr("Ces dossiers ne décrivent pas vos types de notes, mais les emplacements dont Ariane a besoin. Laissez vide ce dont vous ne vous servez pas."));
    const role = (nom, cle, desc) => new obsidian.Setting(c)
      .setName(nom).setDesc(desc)
      .addText((t) => t.setValue(s[cle] || '').setPlaceholder(tr('chemin dans le coffre'))
        .onChange(async (v) => { s[cle] = v.trim().replace(/^\/+|\/+$/g, ''); await maj(); }));
    role(tr('Annotations atomisées'), 'dossierAnnotations', tr("Une note par annotation Zotero."));
    role(tr('Notes de lecture'), 'dossierNotesLecture', tr("Notes-filles Zotero, attachées à la référence entière."));
    role(tr('Références en attente'), 'dossierReferences', tr("Références citées mais pas encore dans Zotero."));
    role(tr('Tâches'), 'dossierTaches', tr("Une note par tâche."));
    role(tr('Bibliographies citées'), 'dossierBibliographies', tr("Une note de bibliographie par source."));
    role(tr('Documents exportés'), 'exportDossier', tr("Sortie de l'export Word."));
    role(tr('Journal du temps'), 'tempsDossierJournal', tr("Journaux quotidiens du compteur de temps."));
    new obsidian.Setting(c)
      .setName(tr('Sources à ne jamais atomiser'))
      .setDesc(tr("Une clé de citation par ligne. Certains modules de Zotero rangent leurs réglages dans un élément de la bibliothèque, qui remonte alors comme une source : « AddonItem » en est le cas le plus courant. Les notes sans prose sont déjà écartées d'elles-mêmes."))
      .addTextArea((t) => {
        t.inputEl.rows = 3;
        t.setPlaceholder('AddonItem');
        t.setValue((s.sourcesExclues || []).join('\n'));
        t.onChange(async (v) => {
          s.sourcesExclues = v.split('\n').map((x) => x.trim().replace(/^@/, '')).filter(Boolean);
          await maj();
        });
      });
    new obsidian.Setting(c)
      .setName(tr('Atomiser les notes de lecture'))
      .setDesc(tr("Les notes-filles Zotero — attachées à la référence entière, non à un passage — deviennent des notes à part, citables et reliées à leur source."))
      .addToggle((t) => t.setValue(s.atomiserNotesLecture !== false).onChange(async (v) => { s.atomiserNotesLecture = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Détecter les dossiers de mon coffre'))
      .setDesc(tr("Propose un rôle par dossier dont le nom s'en approche. Rien n'est écrit sans votre relecture."))
      .addButton((b) => b.setButtonText(tr('Proposer')).onClick(async () => {
        const n = this.plugin.proposerRoles();
        await maj(); this.display();
        new obsidian.Notice(n ? n + ' rôle(s) proposé(s) — vérifiez-les.' : tr('Rien à proposer.'));
      }));

    this._section(c, tr("Nommage des annotations"));
    new obsidian.Setting(c)
      .setName(tr('Regrouper par source'))
      .setDesc(tr('Range chaque annotation dans un sous-dossier au nom de sa source (@citekey).'))
      .addToggle((t) => t.setValue(s.regrouperParSource).onChange(async (v) => { s.regrouperParSource = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Format du nom de fichier'))
      .setDesc(tr('Variables : {{key}}, {{title}}. Ex. « {{key}}_{{title}} » (recommandé), « {{title}} » ou « {{key}} ».'))
      .addText((t) => t.setValue(s.formatNomFichier).onChange(async (v) => { s.formatNomFichier = v.trim() || '{{key}}_{{title}}'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Modèle d'alias"))
      .setDesc(tr("Variables : {{key}}, {{title}}. Vide = pas d'alias."))
      .addText((t) => t.setValue(s.aliasTemplate).onChange(async (v) => { s.aliasTemplate = v; await maj(); }));

    // ---- Les FAMILLES : la description de VOTRE organisation.
    this._section(c, tr('Familles de notes'));
    this._aide(c, tr("Décrivez vos types de notes. Une famille couvre un ou plusieurs dossiers, éventuellement un préfixe de nom, et dit ce qu'Ariane doit en faire : afficher le titre après les liens, nourrir les suggestions, changer l'apparence dans l'explorateur. Glissez les lignes pour les réordonner — la première qui couvre une note l'emporte."));
    this._tableFamilles(c, s, maj);
  }

  ongletAffichage(c, s, maj) {
    this._section(c, tr('Aparté (titre sur les liens)'));
    new obsidian.Setting(c)
      .setName(tr('Afficher le titre en aparté'))
      .setDesc(tr("Ajoute le titre après un lien d'annotation ou de note conceptuelle qui affiche la clé (lecture et édition)."))
      .addToggle((t) => t.setValue(s.aliasSurLiens).onChange(async (v) => { s.aliasSurLiens = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Aperçu au survol hors éditeur'))
      .setDesc(tr("Affiche l'aperçu natif au survol des liens internes dans les vues qui ne le font pas (ex. chat Claudian, panneaux)."))
      .addToggle((t) => t.setValue(s.hoverPartout !== false).onChange(async (v) => { s.hoverPartout = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('— Aparté sur les annotations'))
      .setDesc(tr('Afficher l’aparté pour les liens vers des notes d’annotation.'))
      .addToggle((t) => t.setValue(s.aparteAnnotations).setDisabled(!s.aliasSurLiens).onChange(async (v) => { s.aparteAnnotations = v; await maj(); }));
    this._aide(c, tr("L'aparté sur les autres notes, et l'affichage de l'alias dans l'explorateur, se règlent famille par famille — onglet « Dossiers & familles »."));

    new obsidian.Setting(c).setName(tr('Noms codés en police monospace')).setHeading();
    this._aide(c, tr("Affiche en police à largeur fixe les notes des dossiers listés. Liste vide : aucun. Le texte reste normal (recherche et tri intacts)."));
    new obsidian.Setting(c)
      .setName(tr('Police'))
      .setDesc(tr('Nom de la police monospace (vide = police de code d’Obsidian).'))
      .addText((t) => t.setPlaceholder(tr('var(--font-monospace)')).setValue(s.nomsMonospaceFont || '').onChange(async (v) => { s.nomsMonospaceFont = v.trim(); await maj(); this.plugin.appliquerStyleAparte(); }));
    this._aide(c, tr("Les dossiers concernés se cochent famille par famille — onglet « Dossiers & familles »."));
    new obsidian.Setting(c)
      .setName(tr("Format de l'aparté"))
      .setDesc(tr("Variables : {{alias}} (titre), {{key}}, {{auteur}}, {{auteurs}}, {{annee}}. Ex. « ({{alias}}) », « ({{auteur}}, {{annee}}) »."))
      .addText((t) => t.setValue(s.modeleAparte).onChange(async (v) => { s.modeleAparte = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Couleur de l'aparté"))
      .setDesc(tr("Couleur CSS. Vide = atténuée. Ex. « #999 », « var(--text-faint) »."))
      .addText((t) => t.setValue(s.aparteCouleur).onChange(async (v) => { s.aparteCouleur = v.trim(); await maj(); this.plugin.appliquerStyleAparte(); }));
    new obsidian.Setting(c)
      .setName(tr("Taille de l'aparté"))
      .setDesc(tr("Ex. « 0.8em », « 11px »."))
      .addText((t) => t.setValue(s.aparteTaille).onChange(async (v) => { s.aparteTaille = v.trim() || '0.8em'; await maj(); this.plugin.appliquerStyleAparte(); }));

  }

  ongletCitations(c, s, maj) {
    this._section(c, tr('Citations indirectes'));
    this._aide(c, tr("Quand une annotation rapporte des travaux que vous n'avez pas consultés, la source consultée porte un compteur des travaux qu'elle rapporte, au lieu de les nommer tous dans le fil du texte. Le survol du compteur les affiche en liens cliquables. Les références déjà présentes dans Zotero restent citées en clair, puisque vous les avez lues. Après changement, lancer « Citations : rafraîchir les libellés » pour réécrire les notes."));
    new obsidian.Setting(c)
      .setName(tr('Abréger les citations indirectes'))
      .setDesc(tr("Décoché, tous les auteurs rapportés sont nommés, suivis de « cité dans » et de la source."))
      .addToggle((t) => t.setValue(s.citationsIndirectesAbregees !== false).onChange(async (v) => {
        s.citationsIndirectesAbregees = v; await maj();
      }));
    new obsidian.Setting(c)
      .setName(tr('Forme du compteur'))
      .setDesc(tr("{{n}} tient la place du nombre de travaux rapportés."))
      .addText((t) => t.setValue(s.citationsMarqueEmprunt || '⟨{{n}}⟩').onChange(async (v) => {
        s.citationsMarqueEmprunt = v.trim() || '⟨{{n}}⟩'; await maj();
      }));

    this._section(c, tr('Repliement des citations'));
    this._aide(c, tr("Une citation entre parenthèses cède la place à une pastille portant le nombre de références. Un clic sur la pastille déplie cette citation seule ; les commandes « Citations : tout replier » et « tout déplier » agissent sur l'ensemble, comme le bouton de la barre latérale. En édition, une citation se déplie d'elle-même dès que le curseur y entre."));
    new obsidian.Setting(c)
      .setName(tr('Activer le repliement'))
      .setDesc(tr('Décoché, les citations restent toujours visibles et les commandes sans effet.'))
      .addToggle((t) => t.setValue(s.citationsRepliables !== false).onChange(async (v) => {
        s.citationsRepliables = v; await maj(); this.plugin.appliquerEtatCitations();
      }));
    new obsidian.Setting(c)
      .setName(tr('Replier par défaut'))
      .setDesc(tr("État au démarrage. Les commandes le modifient et l'enregistrent."))
      .addToggle((t) => t.setValue(s.citationsRepliees === true).onChange(async (v) => {
        s.citationsRepliees = v; await maj(); this.plugin.appliquerEtatCitations();
      }));

    this._section(c, tr('Glisser-déposer & notes de bas de page'));
    new obsidian.Setting(c)
      .setName(tr('Déposer une note sur un paragraphe'))
      .setDesc(tr("Glisser un lien de note sur un paragraphe l'ajoute à sa note de bas de page. Déposer ailleurs reste normal."))
      .addToggle((t) => t.setValue(s.dropSurParagraphe).onChange(async (v) => { s.dropSurParagraphe = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Signaler les dépôts non reconnus'))
      .setDesc(tr("Affiche un message quand un élément déposé ne correspond à aucune note du coffre, au lieu de ne rien faire."))
      .addToggle((t) => t.setValue(s.dropSignalerRefus !== false).onChange(async (v) => { s.dropSignalerRefus = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Accepter n'importe quelle note"))
      .setDesc(tr("Si activé, tout lien de note peut être déposé. Sinon, seules les annotations."))
      .addToggle((t) => t.setValue(s.dropToutesNotes).onChange(async (v) => { s.dropToutesNotes = v; await maj(); }));
    this._aide(c, tr('Cible automatique : en survolant le texte, l’appel de note se place en fin de la phrase visée ; en survolant la marge gauche du paragraphe, il se place en fin de paragraphe. La zone visée est surlignée pendant le glisser.'));
    new obsidian.Setting(c)
      .setName(tr('Titre de la section des notes'))
      .addText((t) => t.setValue(s.titreSectionNotes).onChange(async (v) => { s.titreSectionNotes = v.trim() || 'Annotations de lecture associées'; await maj(); }));

    new obsidian.Setting(c).setName(tr('Citations')).setHeading();
    this._aide(c, tr('Une annotation ou une source déposée sur une phrase insère sa référence en ligne, entre parenthèses, avant la ponctuation finale.'));
    new obsidian.Setting(c)
      .setName(tr('Format de la citation'))
      .setDesc(tr('Variables : {{auteurs}}, {{auteursComplets}}, {{annee}}, {{page}}, {{key}}. Les fragments restés vides sont retirés.'))
      .addText((t) => t.setValue(s.modeleCitation || '').onChange(async (v) => { s.modeleCitation = v.trim() || '{{auteurs}}, {{annee}}, p. {{page}}'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Apparat « cité dans »'))
      .setDesc(tr("Quand une annotation cite un travail absent de Zotero — donc non consulté directement — la citation prend la forme « Moulin et Gérard, 2026, p. 345, cité dans Aven, 2012, p. 34 ». Si ce travail figure dans Zotero, il est cité directement. Texte inséré entre les deux références :"))
      .addText((t) => t.setValue(s.citeDans != null ? s.citeDans : ', cité dans ').onChange(async (v) => { s.citeDans = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Séparateur entre citations'))
      .addText((t) => t.setValue(s.separateurCitation || '').onChange(async (v) => { s.separateurCitation = v || ' ; '; await maj(); }));

    new obsidian.Setting(c).setName(tr('Bibliographie de fin de note')).setHeading();
    this._aide(c, tr('Ariane relève les annotations et les sources citées dans le corps de la note, puis entretient une bibliographie en fin de note, à la manière de Zotero dans Word.'));
    new obsidian.Setting(c)
      .setName(tr('Mise à jour automatique'))
      .setDesc(tr('Régénère la bibliographie après une pause dans la frappe.'))
      .addToggle((t) => t.setValue(s.biblioAuto !== false).onChange(async (v) => { s.biblioAuto = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Titre de la section'))
      .addText((t) => t.setValue(s.biblioTitre || '').onChange(async (v) => { s.biblioTitre = v.trim() || 'Bibliographie'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Champ de référence formatée'))
      .setDesc(tr('Propriété des notes sources contenant la référence mise en forme par zotflow (filtre « bibliography »). Le style se règle dans zotflow. Champ absent : Ariane utilise le modèle libre ci-dessous.'))
      .addText((t) => t.setValue(s.biblioChamp || '').onChange(async (v) => { s.biblioChamp = v.trim() || 'bibliographie'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Renvoi vers la note source'))
      .setDesc(tr('Ajoute un lien après chaque référence. Il est placé à la suite, et non autour du texte, afin de préserver les italiques du style bibliographique.'))
      .addToggle((t) => t.setValue(s.biblioLien !== false).onChange(async (v) => { s.biblioLien = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Libellé du renvoi'))
      .addText((t) => t.setValue(s.biblioLienTexte != null ? s.biblioLienTexte : '↗').onChange(async (v) => { s.biblioLienTexte = v || '↗'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Format des entrées (repli, si le champ est absent)'))
      .setDesc(tr('Variables : {{auteurs}}, {{auteursComplets}}, {{annee}}, {{titre}}, {{publication}}, {{doi}}, {{url}}, {{type}}, {{cle}}. Les fragments vides sont retirés.'))
      .addTextArea((t) => {
        t.inputEl.rows = 2;
        t.setValue(s.biblioModele || '');
        t.onChange(async (v) => { s.biblioModele = v.trim() || '{{auteurs}} ({{annee}}). {{titre}}. *{{publication}}*.'; await maj(); });
      });
    new obsidian.Setting(c)
      .setName(tr('Ordre'))
      .addDropdown((d) => {
        d.addOption('auteur', tr('Alphabétique (auteur, année)'));
        d.addOption('apparition', tr('Ordre d’apparition dans la note'));
        d.setValue(s.biblioTri === 'apparition' ? 'apparition' : 'auteur');
        d.onChange(async (v) => { s.biblioTri = v; await maj(); });
      });
    new obsidian.Setting(c)
      .setName(tr('Supprimer les notes de bas de page orphelines'))
      .setDesc(tr("Quand l'appel [^n] disparaît, retire sa définition. N'agit que sur les notes contenant des liens d'annotation."))
      .addToggle((t) => t.setValue(s.nettoyerNotesOrphelines).onChange(async (v) => { s.nettoyerNotesOrphelines = v; await maj(); }));

    this._section(c, tr('Graphe'));
    new obsidian.Setting(c)
      .setName(tr('Taguer les annotations non citées'))
      .setDesc(tr('Ajoute un tag aux annotations à zéro appel, pour les colorer dans le graphe.'))
      .addToggle((t) => t.setValue(s.marquerOrphelines).onChange(async (v) => {
        s.marquerOrphelines = v;
        await maj();
        if (v) this.plugin.synchroniserTagsOrphelines();
        else this.plugin.retirerTousTagsOrphelines();
      }));
    new obsidian.Setting(c)
      .setName(tr('Nom du tag « orpheline »'))
      .setDesc('Sans le #. Utilisez « tag:#' + (s.tagOrpheline || 'orphelin') + ' » dans un groupe du graphe.')
      .addText((t) => t.setValue(s.tagOrpheline).onChange(async (v) => { s.tagOrpheline = v.trim().replace(/^#/, '') || 'orphelin'; await maj(); }));
  }

  ongletTemps(c, s, maj) {
    this._aide(c, tr("Le compteur mesure le temps passé dans une note ouverte en édition. Il se met en pause dès que le clavier et la souris se taisent, ou que la fenêtre perd le focus : il compte donc le travail effectif, non la présence devant l'écran. Le total est inscrit en minutes dans une propriété de la note."));

    new obsidian.Setting(c)
      .setName(tr('Activer le compteur'))
      .addToggle((t) => t.setValue(s.tempsActif !== false).onChange(async (v) => { s.tempsActif = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Propriété où inscrire le total'))
      .setDesc(tr('En minutes, dans le frontmatter de chaque note.'))
      .addText((t) => t.setValue(s.tempsPropriete || 'temps-passe').onChange(async (v) => { s.tempsPropriete = v.trim() || 'temps-passe'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Pause après ce silence"))
      .setDesc(tr("En secondes, sans clavier ni souris. 120 convient à la rédaction, où l'on s'arrête pour réfléchir ; 30 ne compte que la frappe."))
      .addText((t) => t.setValue(String(s.tempsInactiviteSec || 120)).onChange(async (v) => { s.tempsInactiviteSec = Math.max(10, parseInt(v, 10) || 120); await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Écrire dans la note au plus tous les'))
      .setDesc(tr("En secondes. Espacer les écritures évite d'agiter la synchronisation ; le temps en attente n'est jamais perdu, il est reporté en quittant la note."))
      .addText((t) => t.setValue(String(s.tempsEcritureSec || 300)).onChange(async (v) => { s.tempsEcritureSec = Math.max(60, parseInt(v, 10) || 300); await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Ignorer les notes verrouillées'))
      .setDesc(tr("Les notes portant « locked: true » ne sont pas chronométrées."))
      .addToggle((t) => t.setValue(s.tempsIgnorerVerrouillees !== false).onChange(async (v) => { s.tempsIgnorerVerrouillees = v; await maj(); }));

    this._section(c, tr('Affichage'));
    new obsidian.Setting(c)
      .setName(tr("Barre d'état"))
      .setDesc(tr("Temps de la note en cours. Le point est plein quand le compteur tourne, vide en pause. Un clic ouvre le journal du jour."))
      .addToggle((t) => t.setValue(s.tempsBarreEtat !== false).onChange(async (v) => { s.tempsBarreEtat = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Infobulle dans l'explorateur"))
      .addToggle((t) => t.setValue(s.tempsInfobulleExplorateur !== false).onChange(async (v) => { s.tempsInfobulleExplorateur = v; await maj(); }));

    this._section(c, tr('Journal quotidien'));
    new obsidian.Setting(c)
      .setName(tr('Dossier du journal'))
      .addText((t) => t.setValue(s.tempsDossierJournal || '').onChange(async (v) => { s.tempsDossierJournal = v.trim() || '9 - Journal du temps'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Écrire le journal automatiquement'))
      .setDesc(tr('Au changement de jour, la veille est consignée.'))
      .addToggle((t) => t.setValue(s.tempsJournalAuto !== false).onChange(async (v) => { s.tempsJournalAuto = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Conserver le relevé quotidien'))
      .setDesc(tr("En jours. Ce relevé sert au journal ; passé ce délai il est effacé des réglages, les totaux inscrits dans les notes demeurent."))
      .addText((t) => t.setValue(String(s.tempsRetenirJours || 120)).onChange(async (v) => { s.tempsRetenirJours = Math.max(7, parseInt(v, 10) || 120); await maj(); }));
  }

  ongletSchemas(c, s, maj) {
    this._section(c, tr('Vocabulaire des schémas'));
    this._aide(c, tr("Les étiquettes admises sur vos schémas. Une liste vide n'impose rien. Un terme par ligne."));
    new obsidian.Setting(c)
      .setName(tr('Relations admises'))
      .setDesc(tr("Étiquettes portées par les flèches, ex. « précède », « contredit »."))
      .addTextArea((t) => {
        t.inputEl.rows = 4;
        t.setValue((s.cartesRelations || []).join('\n'));
        t.onChange(async (v) => { s.cartesRelations = v.split('\n').map((x) => x.trim()).filter(Boolean); await maj(); });
      });
    new obsidian.Setting(c)
      .setName(tr('Types de blocs admis'))
      .setDesc(tr('Étiquettes portées par les formes, ex. « concept », « acteur ».'))
      .addTextArea((t) => {
        t.inputEl.rows = 4;
        t.setValue((s.cartesTypesBlocs || []).join('\n'));
        t.onChange(async (v) => { s.cartesTypesBlocs = v.split('\n').map((x) => x.trim()).filter(Boolean); await maj(); });
      });
    new obsidian.Setting(c)
      .setName(tr('Vocabulaire strict'))
      .setDesc(tr("Signale en erreur toute étiquette hors des listes ci-dessus. Sans cela, elles sont seulement signalées comme inconnues."))
      .addToggle((t) => t.setValue(!!s.cartesStrict).onChange(async (v) => { s.cartesStrict = v; await maj(); }));

    this._aide(c, tr('Schémas draw.io (.drawio.svg) et notes associées. L’éditeur lui-même est fourni par le plugin Ariane-graph.'));

    new obsidian.Setting(c)
      .setName(tr('Recopier le contenu dans la note'))
      .setDesc(tr('Entretient un encart « Contenu du schéma » dans la note associée, ce qui rend les blocs et relations cherchables.'))
      .addToggle((t) => t.setValue(s.schemaSyncAuto !== false).onChange(async (v) => { s.schemaSyncAuto = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Étiquettes implicites'))
      .setDesc(tr('Quand plusieurs flèches partent d’un même bloc et qu’une seule porte une étiquette, elle vaut pour tout le faisceau. Sans effet si deux étiquettes différentes coexistent.'))
      .addToggle((t) => t.setValue(s.schemaPropagerEtiquettes !== false).onChange(async (v) => { s.schemaPropagerEtiquettes = v; await maj(); }));

    this._section(c, tr('Export SVG'));
    new obsidian.Setting(c)
      .setName(tr('Police'))
      .addText((t) => t.setValue(s.cartesSvgPolice || 'Helvetica').onChange(async (v) => { s.cartesSvgPolice = v.trim() || 'Helvetica'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Corps (pt)'))
      .addText((t) => t.setValue(String(s.cartesSvgTaille || 10)).onChange(async (v) => { s.cartesSvgTaille = Number(v) || 10; await maj(); }));
  }

  ongletSuggestions(c, s, maj) {
    const rafraichir = () => this.plugin.majSuggestions(false, true);
    const reindexer = () => { this.plugin.invaliderIndexSuggestions(); this.plugin.majSuggestions(false, true); };

    this._section(c, tr("Suggestions dynamiques d'annotations"));
    this._aide(c, tr("Un panneau latéral propose, au fil de ce que vous écrivez, les notes les plus proches. Tout est local, gratuit et hors-ligne. Ouvrez-le via l'icône ✦ du ruban ou la commande dédiée."));
    new obsidian.Setting(c)
      .setName(tr('Activer les suggestions'))
      .addToggle((t) => t.setValue(s.suggActif).onChange(async (v) => { s.suggActif = v; await maj(); rafraichir(); }));
    new obsidian.Setting(c)
      .setName(tr('Suggestions par argument (clic droit)'))
      .setDesc(tr('Où afficher les suggestions déclenchées par clic droit sur une sélection.'))
      .addDropdown((d) => d.addOption('panneau', tr('Panneau latéral (ancré)')).addOption('flottant', tr('Fenêtre flottante'))
        .setValue(s.suggArgAffichage || 'panneau').onChange(async (v) => { s.suggArgAffichage = v; await maj(); }));
    this._aide(c, tr("Les dossiers puisés par les suggestions, leur couleur et leur icône se règlent famille par famille — onglet « Dossiers & familles », case « Suggestions »."))
    new obsidian.Setting(c)
      .setName(tr('Nombre de suggestions'))
      .addSlider((sl) => sl.setLimits(3, 20, 1).setValue(s.suggK).setDynamicTooltip().onChange(async (v) => { s.suggK = v; await maj(); rafraichir(); }));
    new obsidian.Setting(c)
      .setName(tr('Seuil de pertinence'))
      .setDesc(tr('Score final minimal (en %) pour qu\'une note soit proposée. Plus haut = plus sélectif.'))
      .addSlider((sl) => sl.setLimits(1, 60, 1).setValue(Math.round((s.suggSeuil || 0.18) * 100)).setDynamicTooltip().onChange(async (v) => { s.suggSeuil = v / 100; await maj(); rafraichir(); }));
    new obsidian.Setting(c)
      .setName(tr('Délai avant recalcul (ms)'))
      .setDesc(tr('Temps d’inactivité dans la frappe avant de rafraîchir.'))
      .addText((t) => t.setValue(String(s.suggAntirebond)).onChange(async (v) => { const n = parseInt(v, 10); s.suggAntirebond = Number.isFinite(n) && n >= 100 ? n : 900; await maj(); }));

    this._section(c, tr('Découpage des bibliographies'));
    this._aide(c, tr("Une entrée de bibliographie sur six n'existe qu'en texte brut, qu'aucune expression régulière ne découpe. Un modèle s'en charge. Il propose, il ne décide pas : chaque extraction est recoupée avec le texte d'origine, l'année, le nom et le titre devant s'y retrouver, sinon elle est jetée."));
    new obsidian.Setting(c)
      .setName(tr('Moteur du découpage'))
      .addDropdown((d) => d
        .addOption('ollama', 'Ollama')
        .addOption('lmstudio', 'LM Studio')
        .addOption('mistral', 'Mistral')
        .addOption('claude', tr('Claude en ligne de commande'))
        .setValue(s.refsFournisseur || 'ollama')
        .onChange(async (v) => { s.refsFournisseur = v; await maj(); this.display(); }));
    if (s.refsFournisseur !== 'claude') {
      new obsidian.Setting(c)
        .setName(tr('Modèle'))
        .setDesc(tr('llama3.2 suffit largement pour cette tâche.'))
        .addText((t) => t.setValue(s.refsModele || 'llama3.2')
          .onChange(async (v) => { s.refsModele = v.trim() || 'llama3.2'; await maj(); }));
    }
    if (s.refsFournisseur === 'mistral') {
      new obsidian.Setting(c)
        .setName(tr('Clé Mistral'))
        .setDesc(tr('Conservée dans les réglages du greffon, sur votre machine.'))
        .addText((t) => { t.setValue(s.refsCleMistral || '')
          .onChange(async (v) => { s.refsCleMistral = v.trim(); await maj(); });
          t.inputEl.type = 'password'; });
    }
    if (s.refsFournisseur === 'claude') {
      new obsidian.Setting(c)
        .setName(tr('Commande'))
        .setDesc(tr('Chemin du binaire, si « claude » ne suffit pas.'))
        .addText((t) => t.setValue(s.refsCheminClaude || 'claude')
          .onChange(async (v) => { s.refsCheminClaude = v.trim() || 'claude'; await maj(); }));
    }
    new obsidian.Setting(c)
      .setName(tr('Lancer le découpage'))
      .setDesc(tr("Une passe sur les entrées en texte brut, mise en cache. Interruptible, et reprise là où elle s'était arrêtée."))
      .addButton((b) => b.setButtonText(tr('Découper')).setCta()
        .onClick(() => this.plugin.decouperBibliographies()))
      .addButton((b) => b.setButtonText(tr('Arrêter'))
        .onClick(() => { this.plugin.decoupageEnCours = false; }));

    this._section(c, tr('Moteur de pertinence'));
    this._aide(c, tr("Lexical : mots en commun (aucune dépendance). Sémantique : comprend le sens via des embeddings locaux (Ollama). Hybride : combine les deux (recommandé). En l'absence d'Ollama, le moteur bascule automatiquement sur le lexical."));
    new obsidian.Setting(c)
      .setName(tr('Moteur'))
      .addDropdown((d) => d
        .addOption('lexical', tr('Lexical (mots)'))
        .addOption('semantique', tr('Sémantique (embeddings)'))
        .addOption('hybride', tr('Hybride (recommandé)'))
        .setValue(s.suggMoteur || 'hybride')
        .onChange(async (v) => { s.suggMoteur = v; await maj(); reindexer(); this.display(); }));
    if (s.suggMoteur === 'hybride') {
      new obsidian.Setting(c)
        .setName(tr('Poids du sémantique'))
        .setDesc(tr('Part du score sémantique dans l’hybride (le reste est lexical).'))
        .addSlider((sl) => sl.setLimits(0, 100, 5).setValue(Math.round((s.suggPoidsSemantique || 0.7) * 100)).setDynamicTooltip().onChange(async (v) => { s.suggPoidsSemantique = v / 100; await maj(); rafraichir(); }));
    }

    if (s.suggMoteur === 'semantique' || s.suggMoteur === 'hybride') {
      // ---- Le service d'inférence, quel qu'il soit. Ollama était nommé
      // partout, jusque dans les titres ; il n'est plus qu'un choix parmi deux.
      const lm = (s.suggFournisseur || 'ollama') === 'lmstudio';
      const nomService = lm ? 'LM Studio' : 'Ollama';
      this._section(c, tr("Service d'inférence local"));
      this._aide(c, lm
        ? "LM Studio, par son API compatible OpenAI. Chargez un modèle d'embeddings et un modèle de langue dans l'onglet « Developer », serveur démarré. Identifiants tels que LM Studio les affiche, par exemple « text-embedding-bge-m3-latest »."
        : "Ollama. Dans un terminal : « ollama pull bge-m3 » pour les embeddings, « ollama pull llama3.2 » pour le reclassement. Modèle conseillé en français : bge-m3, multilingue ; plus léger : nomic-embed-text.");
      new obsidian.Setting(c)
        .setName(tr('Service'))
        .setDesc(tr("Changer de service réencode l'index : les vecteurs de deux modèles ne se comparent pas."))
        .addDropdown((d) => d
          .addOption('ollama', tr('Ollama'))
          .addOption('lmstudio', tr('LM Studio'))
          .setValue(s.suggFournisseur || 'ollama')
          .onChange(async (v) => { s.suggFournisseur = v; await maj(); this.display(); }));
      new obsidian.Setting(c)
        .setName(tr('Adresse'))
        .setDesc(tr('Propre à cette machine : jamais reprise dans un profil exporté.'))
        .addText((t) => t
          .setPlaceholder(lm ? 'http://localhost:1234' : 'http://localhost:11434')
          .setValue((lm ? s.suggLmStudioUrl : s.suggOllamaUrl) || '')
          .onChange(async (v) => {
            const url = v.trim() || (lm ? 'http://localhost:1234' : 'http://localhost:11434');
            if (lm) s.suggLmStudioUrl = url; else s.suggOllamaUrl = url;
            await maj();
          }));
      new obsidian.Setting(c)
        .setName(tr("Modèle d'embeddings"))
        .setDesc(tr("Sert à mesurer la proximité de sens entre vos notes."))
        .addText((t) => t.setValue(s.suggModeleEmbed).onChange(async (v) => { s.suggModeleEmbed = v.trim() || 'bge-m3'; await maj(); reindexer(); }))
        .addButton((b) => b.setButtonText(tr('Tester')).onClick(async () => {
          new obsidian.Notice(tr('Test en cours…'));
          const ok = await this.plugin.testerEncodage();
          new obsidian.Notice(ok
            ? nomService + ' répond : encodage disponible.'
            : 'Échec : ' + nomService + ' injoignable, ou modèle « ' + (s.suggModeleEmbed || 'bge-m3') + ' » absent.');
        }));

      this._section(c, tr('Reclassement par modèle de langue'));
      this._aide(c, tr("Un modèle de langue relit les meilleurs candidats et les remet en ordre. C'est de loin le poste le plus lourd du greffon : il ne part que sur demande, par le bouton ✨ du panneau."));
      new obsidian.Setting(c)
        .setName(tr('Activer le reclassement'))
        .addToggle((t) => t.setValue(s.suggRerank).onChange(async (v) => { s.suggRerank = v; await maj(); this.display(); }));
      if (s.suggRerank) {
        new obsidian.Setting(c)
          .setName(tr('Modèle de langue'))
          .addText((t) => t.setValue(s.suggModeleLLM).onChange(async (v) => { s.suggModeleLLM = v.trim() || 'llama3.2'; await maj(); }))
          .addButton((b) => b.setButtonText(tr('Tester')).onClick(async () => {
            new obsidian.Notice(tr('Test du modèle…'));
            const ok = await this.plugin.testerLLM();
            new obsidian.Notice(ok
              ? tr('Le modèle répond : le reclassement est disponible.')
              : 'Échec : modèle « ' + (s.suggModeleLLM || 'llama3.2') + ' » injoignable sur ' + nomService + '.');
          }));
        new obsidian.Setting(c)
          .setName(tr('Reclasser automatiquement'))
          .setDesc(tr("Déconseillé. Activé, le modèle repart à chaque changement de note — c'est ce qui faisait tourner la ventilation sans répit."))
          .addToggle((t) => t.setValue(s.suggRerankAuto === true).onChange(async (v) => { s.suggRerankAuto = v; await maj(); }));
        new obsidian.Setting(c)
          .setName(tr('Candidats soumis'))
          .setDesc(tr('Nombre de meilleurs candidats relus par le modèle.'))
          .addSlider((sl) => sl.setLimits(5, 30, 1).setValue(s.suggRerankTopN || 12).setDynamicTooltip().onChange(async (v) => { s.suggRerankTopN = v; await maj(); }));
        new obsidian.Setting(c)
          .setName(tr('Afficher la justification'))
          .setDesc(tr("Une phrase expliquant pourquoi chaque note est proposée. Sans elle, le reclassement est un peu plus rapide."))
          .addToggle((t) => t.setValue(s.suggRerankJustif !== false).onChange(async (v) => { s.suggRerankJustif = v; await maj(); this.plugin.majSuggestions(false, true); }));

        this._aide(c, tr("Garde-fous. Sans borne de longueur, un modèle qui ne referme pas sa réponse peut tourner plusieurs minutes à pleine charge : c'est arrivé, et mesuré."));
        new obsidian.Setting(c)
          .setName(tr('Longueur maximale de la réponse'))
          .setDesc(tr('En jetons.'))
          .addText((t) => t.setValue(String(s.suggRerankJetons || 400)).onChange(async (v) => { s.suggRerankJetons = Math.max(60, parseInt(v, 10) || 400); await maj(); }));
        new obsidian.Setting(c)
          .setName(tr('Délai maximal'))
          .setDesc(tr("En secondes. Au-delà, Ariane rend la main et garde le classement sans le modèle."))
          .addText((t) => t.setValue(String(s.suggRerankDelaiSec || 45)).onChange(async (v) => { s.suggRerankDelaiSec = Math.max(5, parseInt(v, 10) || 45); await maj(); }));
      }
    }

    this._section(c, tr('Maintenance'));
    new obsidian.Setting(c)
      .setName(tr("Reconstruire l'index maintenant"))
      .setDesc(tr('Réindexe les dossiers candidats et réencode si nécessaire.'))
      .addButton((b) => b.setButtonText(tr('Reconstruire')).onClick(async () => {
        const n = await this.plugin.construireIndexSuggestions();
        new obsidian.Notice(tr('Index reconstruit (') + n + ' notes).');
        this.plugin.majSuggestions(false, true);
      }));
  }

  ongletContenu(c, s, maj) {
    this._aide(c, tr('Variables : {{title}}, {{titleLink}} (titre cliquable vers l’annotation dans le PDF), {{annotationUrl}}, {{key}}, {{paraphrase}}, {{image}}, {{citation}}, {{highlight}}, {{source}}, {{page}}, {{pageLine}}, {{references}}, {{referenceLinks}}, {{sourceName}}.'));
    new obsidian.Setting(c)
      .setName(tr('Modèle de corps de note'))
      .addTextArea((t) => {
        t.setValue(s.modeleNote).onChange(async (v) => { s.modeleNote = v; await maj(); });
        t.inputEl.rows = 6;
        t.inputEl.style.width = '100%';
        t.inputEl.style.fontFamily = 'monospace';
      });
    new obsidian.Setting(c)
      .setName(tr('Inclure le texte surligné (citation)'))
      .setDesc(tr('Intègre le surlignage via {{citation}} (encadré) ou {{highlight}} (brut).'))
      .addToggle((t) => t.setValue(s.inclureCitation).onChange(async (v) => { s.inclureCitation = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Type d'encadré de citation"))
      .setDesc(tr('Callout pour {{citation}} : quote, cite, note, info…'))
      .addText((t) => t.setValue(s.calloutCitation).onChange(async (v) => { s.calloutCitation = v.trim() || 'quote'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Libellé des références'))
      .addText((t) => t.setValue(s.labelReferences).onChange(async (v) => { s.labelReferences = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Libellé de la page'))
      .addText((t) => t.setValue(s.labelPage).onChange(async (v) => { s.labelPage = v; await maj(); }));
  }

  ongletReferences(c, s, maj) {
    new obsidian.Setting(c)
      .setName(tr('Référence par défaut = source'))
      .setDesc(tr('Si une annotation ne cite aucune référence, utilise sa source Zotero.'))
      .addToggle((t) => t.setValue(s.referenceParDefautSource).onChange(async (v) => { s.referenceParDefautSource = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Rattachement aux sources Zotero'))
      .setDesc(tr('Relie les références en attente aux fiches Zotero par auteurs + année. Les correspondances certaines (un seul appariement possible) sont toujours rattachées sans rien demander ; ce réglage ne concerne que les cas ambigus.'))
      .addDropdown((d) => {
        d.addOption('desactive', tr('Désactivé'));
        d.addOption('certain', tr('Certaines seulement, ignorer les ambiguës'));
        d.addOption('ia', tr('Trancher les ambiguës par le modèle local'));
        d.addOption('manuel', tr('Me demander pour les ambiguës'));
        const v = s.rattachementZotero === false ? 'desactive'
          : (s.rattachementIA !== false ? 'ia'
            : (s.validationRattachement ? 'manuel' : 'certain'));
        d.setValue(v);
        d.onChange(async (val) => {
          s.rattachementZotero = val !== 'desactive';
          s.rattachementAutoCertain = true;
          s.rattachementIA = val === 'ia';
          s.validationRattachement = val === 'manuel';
          await maj();
        });
      });
    new obsidian.Setting(c)
      .setName(tr('Oublier les décisions enregistrées'))
      .setDesc('Une décision prise sur un couple référence/fiche n’est jamais reposée. Ce bouton remet le compteur à zéro (' + Object.keys(s.rattachementsDecides || {}).length + ' décision(s) en mémoire).')
      .addButton((b) => b.setButtonText(tr('Oublier')).onClick(async () => {
        s.rattachementsDecides = {};
        await maj();
        new obsidian.Notice(tr('Décisions de rattachement oubliées.'));
        this.display();
      }));
    new obsidian.Setting(c)
      .setName(tr('Fiches auteurs'))
      .setDesc(tr('Maintient une note par auteur pointant vers ses sources.'))
      .addToggle((t) => t.setValue(s.liensAuteurs).onChange(async (v) => { s.liensAuteurs = v; await maj(); }));

    new obsidian.Setting(c)
      .setName(tr('Dossier des auteurs'))
      .addText((t) => t.setValue(s.dossierAuteurs).onChange(async (v) => { s.dossierAuteurs = v.trim() || 'Auteurs'; await maj(); }));
    this._section(c, tr('Bibliographies citées (API)'));
    this._aide(c, tr("Récupère la bibliographie d'une source via Crossref/OpenAlex (commandes « Confirmer les références en attente » et « Générer la bibliographie citée »)."));
    new obsidian.Setting(c)
      .setName(tr('Activer la récupération via API'))
      .addToggle((t) => t.setValue(s.apiReferencesCitees).onChange(async (v) => { s.apiReferencesCitees = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Source des données'))
      .setDesc(tr('« auto » = Crossref puis OpenAlex. OpenAlex couvre mieux, Crossref est plus direct.'))
      .addDropdown((d) => d
        .addOption('auto', tr('Auto (Crossref puis OpenAlex)'))
        .addOption('crossref', tr('Crossref'))
        .addOption('openalex', tr('OpenAlex'))
        .setValue(s.apiSource || 'auto')
        .onChange(async (v) => { s.apiSource = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Email (pool poli)'))
      .setDesc(tr('Recommandé : de meilleures limites de débit avec un email.'))
      .addText((t) => t.setPlaceholder(tr('vous@exemple.fr')).setValue(s.apiEmail || '').onChange(async (v) => { s.apiEmail = v.trim(); await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Dossier des bibliographies'))
      .addText((t) => t.setValue(s.dossierBibliographies || '').onChange(async (v) => { s.dossierBibliographies = v.trim() || '6 - Bibliographies citées'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Préfixe des notes de bibliographie'))
      .setDesc(tr("Ajouté devant le nom de la source (ex. « Biblio - @cle »). Peut être vide."))
      .addText((t) => t.setValue(s.prefixeBibliographie || '').onChange(async (v) => { s.prefixeBibliographie = v; await maj(); }));

    new obsidian.Setting(c)
      .setName(tr('Dossier des références citées'))
      .addText((t) => t.setValue(s.dossierReferences).onChange(async (v) => { s.dossierReferences = v.trim() || 'Références citées'; await maj(); }));
  }

  ongletExport(c, s, maj) {
    this._aide(c, tr('Exporte la note active en .docx où chaque note de bas de page devient une citation Zotero vivante (via Pandoc + filtre BetterBibTeX). Zotero doit tourner ; pandoc doit être installé (brew install pandoc). Commande : « Exporter en Word avec citations Zotero (Pandoc) ».'));

    new obsidian.Setting(c).setName(tr('Moteur')).setHeading();
    new obsidian.Setting(c)
      .setName(tr('Chemin de pandoc'))
      .addText((t) => t.setValue(s.exportPandocBin).onChange(async (v) => { s.exportPandocBin = v.trim() || 'pandoc'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Filtre Lua (BetterBibTeX)'))
      .setDesc(tr('pandoc-zotero-live-citemarkers.lua avec ses dépendances.'))
      .addText((t) => t.setValue(s.exportFiltreLua).onChange(async (v) => { s.exportFiltreLua = v.trim(); await maj(); }));

    new obsidian.Setting(c).setName(tr('Mise en page (modèle Word)')).setHeading();
    new obsidian.Setting(c)
      .setName(tr('Modèle Word (styles)'))
      .setDesc(tr('.docx dont les styles seront appliqués (titres, corps, citation, etc.).'))
      .addText((t) => t.setValue(s.exportModeleWord || '').onChange(async (v) => { s.exportModeleWord = v.trim(); await maj(); }))
      .addButton((b) => b.setButtonText(tr('Voir les styles')).onClick(() => this.plugin.listerStylesModele()));
    this._aide(c, tr('Associez chaque niveau markdown à un nom de style de votre modèle (laisser vide = style pandoc par défaut).'));
    s.exportMapStyles = s.exportMapStyles || { Heading1: '', Heading2: '', Heading3: '', Heading4: '', BodyText: 'Corps de texte', BlockText: 'Citation intense', Compact: 'Corps de texte' };
    for (const [cle, lbl] of [['Heading1', tr('Titre 1  (#)')], ['Heading2', tr('Titre 2  (##)')], ['Heading3', tr('Titre 3  (###)')], ['Heading4', tr('Titre 4  (####)')], ['BodyText', 'Corps de texte'], ['BlockText', tr('Citation  (>)')]]) {
      new obsidian.Setting(c)
        .setName(lbl)
        .addText((t) => t.setValue(s.exportMapStyles[cle] || '').onChange(async (v) => { s.exportMapStyles[cle] = v.trim(); await maj(); }));
    }

    new obsidian.Setting(c).setName(tr('Références citées (apparat « cité dans »)')).setHeading();
    this._aide(c, tr("Quand une annotation cite une référence absente de Zotero, la citation prend la forme : « Auteurs, année<texte ci-dessous>Source, p. XX ». Si la référence citée existe dans Zotero, elle est citée directement."));
    new obsidian.Setting(c)
      .setName(tr('Espaces insécables'))
      .setDesc(tr("Rend insécables les espaces déjà présentes devant « ; », « : », « ! », « ? » et « » », et après « « ». Aucune espace n'est ajoutée : les adresses, les heures et les grappes de citation restent intactes."))
      .addToggle((t) => t.setValue(s.exportInsecables !== false).onChange(async (v) => { s.exportInsecables = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Apparat « cité dans » à l'export"))
      .setDesc(tr("Activé, un travail rapporté mais absent de Zotero est cité sous la forme « Fan et al., 2022, cité dans Raizada & Sinha, 2025, p. 1 ». Désactivé, seule la source réellement consultée est citée. Sans effet sur les travaux présents dans Zotero, toujours cités directement."))
      .addToggle((t) => t.setValue(s.exportCiteDansActif !== false).onChange(async (v) => { s.exportCiteDansActif = v; await maj(); }));
    this._section(c, tr('Mise en forme du document'));
    new obsidian.Setting(c)
      .setName(tr('Décaler les titres d’un cran'))
      .setDesc(tr("« # » est le titre du document, pas une partie : « ## » devient donc Titre 1 dans Word."))
      .addToggle((t) => t.setValue(s.exportDecalerTitres !== false).onChange(async (v) => { s.exportDecalerTitres = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Retirer la numérotation saisie à la main'))
      .setDesc(tr("« 2.1 Titre » devient « Titre » : Word numérote seul."))
      .addToggle((t) => t.setValue(s.exportRetirerNumerotation !== false).onChange(async (v) => { s.exportRetirerNumerotation = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Rattacher les en-têtes du modèle'))
      .setDesc(tr("Pandoc écrit sa propre section et laisse les en-têtes orphelins. Désactiver ne se justifie qu'en cas de difficulté."))
      .addToggle((t) => t.setValue(s.exportEntetes !== false).onChange(async (v) => { s.exportEntetes = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Retirer les crochets des propriétés'))
      .setDesc(tr("Une propriété « [[Chabane Mazri]] » sort « Chabane Mazri ». Vaut pour les liens simples, les liens à alias et les liens markdown."))
      .addToggle((t) => t.setValue(s.exportNettoyerLiens !== false).onChange(async (v) => { s.exportNettoyerLiens = v; await maj(); }));

    this._section(c, tr('Styles du modèle employés'));
    this._aide(c, tr("Noms de styles tels qu'ils figurent dans votre modèle Word. Ariane les résout en identifiants — « Corps de texte » se range sous « Corpsdetexte »."));
    const style = (nom, cle, defaut, desc) => new obsidian.Setting(c)
      .setName(nom).setDesc(desc || '')
      .addText((t) => t.setPlaceholder(defaut).setValue(s[cle] || '')
        .onChange(async (v) => { s[cle] = v.trim() || defaut; await maj(); }));
    style(tr('Encadrés'), 'exportStyleEncadre', 'Items de réflexion', tr("Style du contenu des mises en avant « > [!info] »."));
    style(tr('En-tête de tableau'), 'exportStyleEnteteTableau', 'Titre de tableau', tr("Première ligne des tableaux markdown."));
    style(tr('Cellule de tableau'), 'exportStyleCelluleTableau', 'Champ de tableau', tr("Lignes suivantes."));

    this._section(c, tr('Référence de la note'));
    this._aide(c, tr("Le jeton {{réf}} de votre modèle. Ariane cherche les propriétés ci-dessous, dans l'ordre, accents et majuscules indifférents."));
    new obsidian.Setting(c)
      .setName(tr('Propriétés à consulter'))
      .setDesc(tr('Séparées par des virgules.'))
      .addText((t) => t.setPlaceholder(tr('ref, reference, réf')).setValue(s.exportProprieteReference || '')
        .onChange(async (v) => { s.exportProprieteReference = v.trim() || 'ref'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('À défaut, le nom du fichier'))
      .setDesc(tr("Vos notes s'appellent « NP-260826-07 » ou « CR-260826-07 » : le nom fait alors référence. Désactivé, le champ reste vide si aucune propriété n'est trouvée."))
      .addToggle((t) => t.setValue(s.exportRefDepuisNom !== false).onChange(async (v) => { s.exportRefDepuisNom = v; await maj(); }));

    this._aide(c, tr("Le texte de liaison — « , cité dans » — se règle une seule fois, dans l'onglet « Citations & bibliographie ». Il vaut pour les citations en ligne comme pour l'export."));

    new obsidian.Setting(c).setName(tr('Sortie')).setHeading();
    new obsidian.Setting(c)
      .setName(tr('Dossier de sortie'))
      .addText((t) => t.setValue(s.exportDossier).onChange(async (v) => { s.exportDossier = v.trim() || '5 - Livrables'; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Emplacement de bibliographie'))
      .setDesc(tr('Ajoute un titre « Bibliographie » où insérer la bibliographie dans Word (Zotero > Add Bibliography).'))
      .addToggle((t) => t.setValue(s.exportBibliographie !== false).onChange(async (v) => { s.exportBibliographie = v; await maj(); }));
  }


  ongletAvance(c, s, maj) {
    this._section(c, tr('Analyse (expressions régulières)'), tr("À ne modifier qu'en connaissance de cause."));
    new obsidian.Setting(c)
      .setName(tr('Marqueur de source'))
      .setDesc(tr('Chaîne détectant une note source à traiter.'))
      .addText((t) => t.setValue(s.marqueurSource).onChange(async (v) => { s.marqueurSource = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Regex de bloc'))
      .setDesc(tr('Groupe 1 = clé stable, groupe 2 = contenu.'))
      .addText((t) => t.setValue(s.blocRegex).onChange(async (v) => { s.blocRegex = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Regex de page'))
      .addText((t) => t.setValue(s.pageRegex).onChange(async (v) => { s.pageRegex = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Regex d'image"))
      .addText((t) => t.setValue(s.imageRegex).onChange(async (v) => { s.imageRegex = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Retirer les parenthèses des références'))
      .addToggle((t) => t.setValue(s.retirerParentheses).onChange(async (v) => { s.retirerParentheses = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Séparateur de citations'))
      .addText((t) => t.setValue(s.separateurCitations).onChange(async (v) => { s.separateurCitations = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr("Séparateur d'auteurs (regex)"))
      .addText((t) => t.setValue(s.separateurAuteurs).onChange(async (v) => { s.separateurAuteurs = v; await maj(); }));

    this._section(c, tr('Notes de référence provisoires'));
    new obsidian.Setting(c)
      .setName(tr('Modèle'))
      .setDesc(tr('Variables : {{authorLinks}}, {{name}}, {{year}}, {{firstAuthor}}.'))
      .addTextArea((t) => {
        t.setValue(s.modeleReference).onChange(async (v) => { s.modeleReference = v; await maj(); });
        t.inputEl.rows = 4;
        t.inputEl.style.width = '100%';
        t.inputEl.style.fontFamily = 'monospace';
      });

    this._section(c, tr('Profils de standard'));
    this._aide(c, tr('Liste JSON. Pour chaque bloc, le premier profil dont « titreRegex » correspond est retenu.'));
    let profilsErreur;
    new obsidian.Setting(c)
      .setName(tr('Profils (JSON)'))
      .addTextArea((t) => {
        t.setValue(JSON.stringify(s.profils, null, 2)).onChange(async (v) => {
          try {
            const p = JSON.parse(v);
            if (Array.isArray(p) && p.length > 0) {
              s.profils = p;
              if (profilsErreur) profilsErreur.setText('');
              await maj();
            } else if (profilsErreur) {
              profilsErreur.setText(tr('Le JSON doit être un tableau non vide.'));
            }
          } catch (e) {
            if (profilsErreur) profilsErreur.setText(tr('JSON invalide : ') + e.message);
          }
        });
        t.inputEl.rows = 8;
        t.inputEl.style.width = '100%';
        t.inputEl.style.fontFamily = 'monospace';
      });
    profilsErreur = c.createEl('div', { text: tr(''), cls: 'setting-item-description' });
    profilsErreur.style.color = 'var(--text-error)';

    this._section(c, tr('Bibliographies lues dans les PDF'));
    this._aide(c, tr("Crossref ne connaît que ce qui porte un DOI, or les livres n'en ont souvent pas et ce sont eux qui portent les références les plus citées. Zotero garde le texte extrait de chaque PDF : Ariane y lit la bibliographie directement."));
    new obsidian.Setting(c)
      .setName(tr('Dossier de données Zotero'))
      .setDesc(tr('Vide : détection automatique dans votre dossier personnel.'))
      .addText((t) => t.setValue(s.dossierZotero || '')
        .setPlaceholder(require('path').join(require('os').homedir(), 'Zotero'))
        .onChange(async (v) => { s.dossierZotero = v.trim(); this.plugin._textesPdf = null; await maj(); }));

    this._section(c, tr('Annotations sans titre'));
    this._aide(c, tr("Par défaut, une annotation dont le commentaire ne correspond à aucun profil est ignorée : elle ne devient pas une note. Activez l'option ci-dessous pour l'atomiser quand même, avec un titre déduit de son contenu."));
    new obsidian.Setting(c)
      .setName(tr('Atomiser les annotations sans titre'))
      .setDesc(tr('Le commentaire entier devient la paraphrase et le titre est déduit.'))
      .addToggle((t) => t.setValue(s.titreFacultatif === true).onChange(async (v) => { s.titreFacultatif = v; await maj(); }));
    new obsidian.Setting(c)
      .setName(tr('Déduire le titre à partir de'))
      .setDesc(tr("À défaut, l'autre source est utilisée, puis la clé Zotero."))
      .addDropdown((d) => {
        d.addOption('paraphrase', tr('Le commentaire'));
        d.addOption('surlignage', tr('Le texte surligné'));
        d.setValue(s.titreReplSource === 'surlignage' ? 'surlignage' : 'paraphrase');
        d.onChange(async (v) => { s.titreReplSource = v; await maj(); });
      });
    new obsidian.Setting(c)
      .setName(tr('Longueur maximale du titre déduit'))
      .setDesc(tr('En caractères. La coupe se fait à la fin de la première phrase, sinon au dernier mot entier.'))
      .addText((t) => {
        t.setValue(String(s.titreReplLongueur || 60)).onChange(async (v) => {
          const n = parseInt(v, 10);
          s.titreReplLongueur = isNaN(n) ? 60 : Math.max(10, Math.min(200, n));
          await maj();
        });
        t.inputEl.type = 'number';
      });
  }
}

/* =========================================================================
 * Fenêtre de confirmation d'un rattachement (anti-homonymie)
 * ========================================================================= */

class ConfirmationRattachement extends obsidian.Modal {
  constructor(app, texte, onChoix) {
    super(app);
    this.texte = texte;
    this.onChoix = onChoix;
    this.repondu = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: tr('Ariane — rattachement') });
    contentEl.createEl('p', { text: this.texte });
    const row = contentEl.createDiv();
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.justifyContent = 'flex-end';
    row.style.marginTop = '14px';
    const non = row.createEl('button', { text: tr('Ignorer') });
    non.addEventListener('click', () => this.repondre(false));
    const oui = row.createEl('button', { text: tr('Confirmer') });
    oui.addClass('mod-cta');
    oui.addEventListener('click', () => this.repondre(true));
  }
  repondre(v) {
    if (this.repondu) return;
    this.repondu = true;
    this.close();
    this.onChoix(v);
  }
  onClose() {
    this.contentEl.empty();
    if (!this.repondu) {
      this.repondu = true;
      this.onChoix(false);
    }
  }
}

// Fenêtre de choix de la fiche Zotero pour une référence suffixée (2005a/b).
class ChoixSourceModal extends obsidian.Modal {
  constructor(app, refNom, candidats, onChoix) {
    super(app);
    this.refNom = refNom;
    this.candidats = candidats;
    this.onChoix = onChoix;
    this.repondu = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Ariane — lier « ' + this.refNom + ' »' });
    contentEl.createEl('p', { text: tr('Choisissez la fiche Zotero correspondante :') });
    for (const c of this.candidats) {
      const etiquette = c.basename +
        (c.creatorsFull && c.creatorsFull.length ? '  —  ' + c.creatorsFull.join(', ') : '') +
        (c.titre ? '  —  ' + c.titre : '');
      const b = contentEl.createEl('button', { text: etiquette });
      b.style.display = 'block';
      b.style.width = '100%';
      b.style.textAlign = 'left';
      b.style.marginBottom = '6px';
      b.addEventListener('click', () => this.choisir(c.basename));
    }
    const row = contentEl.createDiv();
    row.style.textAlign = 'right';
    row.style.marginTop = '10px';
    const annuler = row.createEl('button', { text: tr('Annuler') });
    annuler.addEventListener('click', () => this.choisir(null));
  }
  choisir(v) {
    if (this.repondu) return;
    this.repondu = true;
    this.close();
    this.onChoix(v);
  }
  onClose() {
    this.contentEl.empty();
    if (!this.repondu) {
      this.repondu = true;
      this.onChoix(null);
    }
  }
}

/* ---------------- Formulaire de création d'une tâche ------------------- */

class ModaleNouvelleTache extends obsidian.Modal {
  constructor(app, greffon, surValidation) {
    super(app);
    this.greffon = greffon;
    this.surValidation = surValidation;
    this.repondu = false;
    this.champs = {
      intitule: '', statut: 'à faire', priorite: '', debut: '', echeance: '',
      avancement: 0, jalon: false, source: '', livrable: '', fichier: '',
      liste: greffon.settings.listeRappelsDefaut,
    };
    this.famille = 'action';
    this.saisieProduction = '';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: tr('Ariane — nouvelle tâche') });
    this.corps = contentEl.createDiv();
    this.dessiner();
  }

  // Le formulaire se redessine à chaque changement de famille : c'est elle qui
  // décide du seul champ de désignation offert, et en offrir plusieurs à la
  // fois inviterait à remplir la contradiction que le schéma interdit.
  dessiner() {
    this.corps.empty();
    const c = this.corps;

    new obsidian.Setting(c).setName(tr('Intitulé'))
      .addText((t) => t.setValue(this.champs.intitule)
        .onChange((v) => { this.champs.intitule = v; }));

    new obsidian.Setting(c).setName(tr('Famille'))
      .addDropdown((d) => d
        .addOption('action', tr('Action'))
        .addOption('lecture', tr('Lecture'))
        .addOption('production', tr('Production'))
        .setValue(this.famille)
        .onChange((v) => {
          this.famille = v;
          this.champs.source = '';
          this.champs.livrable = '';
          this.champs.fichier = '';
          this.saisieProduction = '';
          this.dessiner();
        }));

    if (this.famille === 'lecture') {
      // On ne retient pas 739 clés de citation par cœur : la source se cherche
      // par auteur, année ou titre, et le choix s'affiche pour être relu.
      const choisie = this.champs.source
        ? this.champs.source.replace(/^\[\[|\]\]$/g, '')
        : tr('aucune pour l instant');
      new obsidian.Setting(c).setName(tr('Source Zotero'))
        .setDesc(choisie)
        .addButton((b) => b.setButtonText(tr('Chercher…')).onClick(() => {
          const items = this.greffon.sourcesZoteroPourChoix();
          if (!items.length) {
            new obsidian.Notice(tr('Aucune fiche Zotero trouvée dans le coffre.'));
            return;
          }
          new ChoixListeModal(this.app, tr('Auteur, titre, année ou clé…'), items, (it) => {
            if (it) this.champs.source = '[[' + it.cle + ']]';
            this.dessiner();
          }).open();
        }));
    } else if (this.famille === 'production') {
      // Note du coffre ou fichier du disque : la forme de la saisie tranche,
      // et rien n'oblige à trancher tout de suite, le champ pouvant rester vide.
      new obsidian.Setting(c).setName(tr('Ce qui est produit'))
        .setDesc(tr('Une note du coffre, ou le chemin absolu d un fichier. Peut rester vide.'))
        .addText((t) => t.setPlaceholder(tr('NC-202607081912  ou  /Users/…/soutenance.pptx'))
          .setValue(this.saisieProduction || '')
          .onChange((v) => {
            this.saisieProduction = v;
            const r = ZotflowAtomiser.livrableOuFichier(v);
            this.champs.livrable = r.champ === 'livrable' ? r.valeur : '';
            this.champs.fichier = r.champ === 'fichier' ? r.valeur : '';
          }));
    }

    const dateur = (nom, cle) => new obsidian.Setting(c).setName(nom)
      .addText((t) => {
        t.inputEl.type = 'date';
        t.setValue(this.champs[cle]).onChange((v) => { this.champs[cle] = v.trim(); });
      });
    if (!this.champs.jalon) dateur(tr('Début'), 'debut');
    dateur(tr('Échéance'), 'echeance');

    new obsidian.Setting(c).setName(tr('Priorité'))
      .addDropdown((d) => d
        .addOption('', tr('(aucune)'))
        .addOption('haute', tr('haute'))
        .addOption('moyenne', tr('moyenne'))
        .addOption('basse', tr('basse'))
        .setValue(this.champs.priorite)
        .onChange((v) => { this.champs.priorite = v; }));

    new obsidian.Setting(c).setName(tr('Jalon'))
      .setDesc(tr("Repère de calendrier : seule l'échéance est retenue."))
      .addToggle((t) => t.setValue(this.champs.jalon)
        .onChange((v) => { this.champs.jalon = v; this.dessiner(); }));

    new obsidian.Setting(c).setName(tr('Liste Apple Rappels'))
      .addText((t) => t.setValue(this.champs.liste)
        .onChange((v) => { this.champs.liste = v.trim(); }));

    const ligne = c.createDiv();
    ligne.style.textAlign = 'right';
    ligne.style.marginTop = '10px';
    const annuler = ligne.createEl('button', { text: tr('Annuler') });
    annuler.addEventListener('click', () => this.repondre(null));
    const creer = ligne.createEl('button', { text: tr('Créer') });
    creer.style.marginLeft = '6px';
    creer.addEventListener('click', () => {
      if (!this.champs.intitule.trim()) {
        new obsidian.Notice(tr('Une tâche sans intitulé ne se retrouve pas.'));
        return;
      }
      if (this.champs.jalon) this.champs.debut = '';
      this.repondre(this.champs);
    });
  }

  repondre(v) {
    if (this.repondu) return;
    this.repondu = true;
    this.close();
    this.surValidation(v);
  }

  onClose() {
    this.contentEl.empty();
    if (!this.repondu) {
      this.repondu = true;
      this.surValidation(null);
    }
  }
}

/* ---------------- Vue latérale : Suggestions ZotFlow ------------------- */
/* =========================================================================
 * Volet d'arbitrage des références en attente
 * ========================================================================= */

const TYPE_VUE_REFS = 'zfa-references';

class VueReferencesAttente extends obsidian.ItemView {
  constructor(feuille, greffon) {
    super(feuille);
    this.greffon = greffon;
    this.filtre = 'tous';
    this.deplies = new Set();
    this.choisies = new Set();
  }

  getViewType() { return TYPE_VUE_REFS; }
  getDisplayText() { return tr('Références en attente'); }
  // « library » entrait en collision : icon-folder la pose déjà sur le dossier
  // « 98 - Bibliographie », celui-là même qui contient ces références. La
  // balance dit d'ailleurs mieux ce que fait ce volet.
  getIcon() { return 'scale'; }

  async onOpen() {
    this.contentEl.addClass('zfa-refs');
    await this.preparer();
  }

  // Un seul calcul à l'ouverture : résoudre 631 références à chaque clic
  // d'onglet rendrait le volet inutilisable.
  async preparer() {
    const c = this.contentEl;
    c.empty();
    c.createDiv({ cls: 'zfa-refs-vide', text: tr('Analyse des références…') });
    const g = this.greffon;
    const toutes = g.indexReferencesAttente();
    const index = g.construireIndexZotero();
    const passages = g.indexPassages();
    // Le compteur qui guide une acquisition doit porter sur l'ŒUVRE, pas sur le
    // libellé : deux libellés d'un même article diluent le signal, et un libellé
    // qui recouvre deux ouvrages le gonfle à tort.
    const { parRef, parOeuvre } = await g.indexOeuvres(passages);
    this.parOeuvre = parOeuvre;

    this.lignes = [];
    for (const r of toutes) {
      const ref = parseNomReference(r.nom, g.settings);
      const candidats = ref ? candidatsSource(ref, index).map((x) => x.entree) : [];
      const auto = ref ? trouverSourceZotero(ref, index) : null;
      const biblio = await g.resoudreParBibliographie(r, passages);
      const doi = r.doi || (biblio && biblio.doi) || '';
      let dansZotero = null;
      if (doi) {
        const z = index.find((x) => x.doi && x.doi === doi);
        if (z) dansZotero = z.basename;
      }
      const compte = parRef.get(r.nom) || { oeuvres: [], nonResolues: r.citations, total: r.citations };
      const l = { r, ref, candidats, auto, biblio, dansZotero, doi, verdict: null,
        oeuvres: compte.oeuvres, nonResolues: compte.nonResolues };
      // Le rang d'acquisition : la plus citée des œuvres du libellé.
      l.poids = compte.oeuvres.length
        ? Math.max.apply(null, compte.oeuvres.map((o) => o.n))
        : compte.total;
      l.etat = this.classer(l);
      this.lignes.push(l);
    }
    this.lignes.sort((a, b) => b.poids - a.poids || a.r.nom.localeCompare(b.r.nom));
    this.rendre();
  }

  rendre() {
    const c = this.contentEl;
    c.empty();
    const lignes = this.lignes || [];

    const compte = (e) => lignes.filter((l) => l.etat === e).length;
    // Cinq onglets, et chacun dit ce qu'il y a à faire. Les états que le greffon
    // règle seul, détachement et fusion, n'ont plus d'onglet : ils ne demandent
    // rien.
    const onglets = [
      ['tous', tr('Toutes'), lignes.length],
      ['rattachable', tr('À rattacher'), compte('rattachable')],
      ['identifiee', tr('À acquérir'), compte('identifiee')],
      ['inconnue', tr('Non résolues'), compte('inconnue')],
      ['ecartee', tr('Mises de côté'), compte('ecartee') + compte('fusionnee')],
    ];
    const barre = c.createDiv({ cls: 'zfa-refs-barre' });
    for (const [cle, nom, n] of onglets) {
      const b = barre.createEl('button', { cls: 'zfa-refs-onglet', text: nom + ' (' + n + ')' });
      if (this.filtre === cle) b.addClass('zfa-refs-actif');
      b.onclick = () => { this.filtre = cle; this.rendre(); };
    }
    const outils = c.createDiv({ cls: 'zfa-refs-outils' });
    const bMaj = outils.createEl('button', { text: tr('Récupérer les bibliographies') });
    bMaj.onclick = async () => { await this.greffon.rafraichirBibliographies(false); await this.preparer(); };
    const bRe = outils.createEl('button', { text: tr('Recalculer') });
    bRe.onclick = () => this.preparer();
    if (this.enCours) {
      const bStop = outils.createEl('button', { cls: 'mod-warning', text: tr('Arrêter le lot') });
      bStop.onclick = () => { this.enCours = false; };
    }

    const visibles = lignes.filter((l) => this.filtre === 'tous' || l.etat === this.filtre);
    this.rendreSelection(c, visibles);

    const corps = c.createDiv({ cls: 'zfa-refs-liste' });
    if (!visibles.length) {
      corps.createDiv({ cls: 'zfa-refs-vide', text: tr('Rien dans cette catégorie.') });
      return;
    }
    for (const l of visibles) this.rendreLigne(corps, l);
  }

  // Recalcule une seule ligne après une action, plutôt que de refaire les 631.
  async rafraichirLigne(l) {
    const g = this.greffon;
    const index = g.construireIndexZotero();
    const toutes = g.indexReferencesAttente();
    const r = toutes.find((x) => x.nom === l.r.nom);
    if (!r) { // la note a disparu : la ligne aussi
      this.lignes = (this.lignes || []).filter((x) => x !== l);
      this.rendre();
      return;
    }
    l.r = r;
    l.ref = parseNomReference(r.nom, g.settings);
    l.candidats = l.ref ? candidatsSource(l.ref, index).map((x) => x.entree) : [];
    l.auto = l.ref ? trouverSourceZotero(l.ref, index) : null;
    l.biblio = await g.resoudreParBibliographie(r);
    l.doi = r.doi || (l.biblio && l.biblio.doi) || '';
    const z = l.doi ? index.find((x) => x.doi && x.doi === l.doi) : null;
    l.dansZotero = z ? z.basename : null;
    l.etat = this.classer(l);
    this.rendre();
  }

  classer(l) {
    if (l.r.etat === 'fusionnée') return 'fusionnee';
    if (l.r.etat === 'écartée') return 'ecartee';
    if (l.r.etat === 'à acquérir') return 'acquerir';
    if (l.auto || l.dansZotero) return 'rattachable';
    if (l.doi || (l.oeuvres || []).length || (l.biblio && l.biblio.titre)) return 'identifiee';
    return 'inconnue';
  }

  bouton(parent, texte, icone, action, cta) {
    const b = parent.createEl('button', { cls: 'zfa-ref-action' + (cta ? ' mod-cta' : '') });
    if (icone) { const i = b.createSpan(); obsidian.setIcon(i, icone); }
    b.createSpan({ text: texte });
    b.onclick = (e) => { e.stopPropagation(); action(); };
    return b;
  }

  // Sélection multiple : les gestes d'arbitrage sont longs et répétitifs, les
  // enchaîner un par un n'a pas de sens sur six cents références.
  rendreSelection(c, visibles) {
    const g = this.greffon;
    const choisies = visibles.filter((l) => this.choisies.has(l.r.nom));
    const barre = c.createDiv({ cls: 'zfa-refs-selection' });

    const tout = barre.createEl('input', { type: 'checkbox', cls: 'zfa-ref-coche' });
    tout.checked = visibles.length > 0 && choisies.length === visibles.length;
    tout.indeterminate = choisies.length > 0 && choisies.length < visibles.length;
    tout.onclick = () => {
      if (tout.checked) for (const l of visibles) this.choisies.add(l.r.nom);
      else for (const l of visibles) this.choisies.delete(l.r.nom);
      this.rendre();
    };
    barre.createSpan({ cls: 'zfa-ref-faible',
      text: choisies.length
        ? choisies.length + ' / ' + visibles.length + ' ' + tr('sélectionnée(s)')
        : tr('Tout sélectionner dans cet onglet') });
    if (!choisies.length) return;

    // Le geste principal du lot : aller chercher chez Crossref auteurs, revue et
    // éditeur pour tout ce qui porte un DOI.
    const avecDoi = choisies.filter((l) => l.doi && !l.r.complete);
    if (avecDoi.length) {
      this.bouton(barre, tr('Compléter') + ' (' + avecDoi.length + ')', 'download-cloud',
        () => this.enLot(avecDoi, tr('Complétion'), async (l) => {
          const ok = await g.completerReference(l.r, l.doi);
          await new Promise((r) => setTimeout(r, 300));
          return ok;
        }), true);
    }
    const rattachables = choisies.filter((l) => l.dansZotero || l.auto);
    if (rattachables.length) {
      this.bouton(barre, tr('Rattacher') + ' (' + rattachables.length + ')', 'link',
        () => this.enLot(rattachables, tr('Rattachement'), async (l) => {
          await g.rattacherReference(l.r, l.dansZotero || l.auto);
          return true;
        }), true);
    }
    this.bouton(barre, tr('À acquérir'), 'shopping-cart',
      () => this.enLot(choisies, tr('Marquage'), async (l) => {
        await g.marquerReference(l.r, 'à acquérir'); return true;
      }));
    this.bouton(barre, tr('Écarter'), 'eye-off',
      () => this.enLot(choisies, tr('Marquage'), async (l) => {
        await g.marquerReference(l.r, 'écartée'); return true;
      }));
    this.bouton(barre, tr('Désélectionner'), 'x', () => { this.choisies.clear(); this.rendre(); });
  }

  // Un lot avance visiblement et s'interrompt : l'arbitrage prend plusieurs
  // secondes par référence, personne ne doit rester devant une fenêtre figée.
  async enLot(lignes, intitule, action) {
    if (this.enCours) { new obsidian.Notice(tr('Un traitement est déjà en cours.')); return; }
    this.enCours = true;
    const avis = new obsidian.Notice(intitule + ' : 0 / ' + lignes.length, 0);
    let n = 0, ok = 0;
    for (const l of lignes) {
      if (!this.enCours) break;
      try { if (await action(l)) ok += 1; } catch (e) { console.error('[Ariane] lot', e); }
      n += 1;
      avis.setMessage(intitule + ' : ' + n + ' / ' + lignes.length + '  (' + ok + ' ' + tr('aboutis') + ')');
    }
    this.enCours = false;
    avis.hide();
    new obsidian.Notice(intitule + ' — ' + ok + ' / ' + n + ' ' + tr('aboutis') + '.');
    // Les marquages changent l'état lu dans les notes : on recharge.
    await this.preparer();
  }

  rendreLigne(parent, l) {
    const g = this.greffon;
    const el = parent.createDiv({ cls: 'zfa-ref zfa-ref-' + l.etat + '-etat' });
    const ouvert = this.deplies.has(l.r.nom);

    /* ------------------------------ La ligne ------------------------------ */
    const tete = el.createDiv({ cls: 'zfa-ref-tete' });
    const coche = tete.createEl('input', { type: 'checkbox', cls: 'zfa-ref-coche' });
    coche.checked = this.choisies.has(l.r.nom);
    coche.onclick = (e) => {
      e.stopPropagation();
      if (coche.checked) this.choisies.add(l.r.nom); else this.choisies.delete(l.r.nom);
      this.rendre();
    };
    tete.createSpan({ cls: 'zfa-ref-chevron', text: ouvert ? '▾' : '▸' });
    tete.createSpan({ cls: 'zfa-ref-nom', text: l.r.nom });
    const resume = l.r.titre || (l.biblio && l.biblio.titre) || '';
    if (resume) tete.createSpan({ cls: 'zfa-ref-resume', text: resume });
    tete.createSpan({ cls: 'zfa-ref-compteur', text: (l.poids || 0) + '×' });
    if (l.r.etat) tete.createSpan({ cls: 'zfa-ref-etiquette', text: l.r.etat });
    tete.onclick = () => {
      if (ouvert) this.deplies.delete(l.r.nom); else this.deplies.add(l.r.nom);
      this.rendre();
    };
    if (!ouvert) return;

    const d = el.createDiv({ cls: 'zfa-ref-detail' });

    /* --------------------------- 1. Ce que c'est -------------------------- */
    const ident = d.createDiv({ cls: 'zfa-ref-section' });
    ident.createDiv({ cls: 'zfa-ref-num', text: tr('Identification') });
    const cible = l.dansZotero || l.auto;
    const oeuvres = l.oeuvres || [];

    if (cible) {
      const e = g.construireIndexZotero().find((x) => x.basename === cible);
      ident.createDiv({ cls: 'zfa-ref-fort', text: e && e.titre ? e.titre : cible });
      ident.createDiv({ cls: 'zfa-ref-faible', text: tr('Déjà dans votre Zotero : ') + cible });
    } else if (oeuvres.length > 1) {
      ident.createDiv({ cls: 'zfa-ref-fort',
        text: tr('Ce libellé recouvre ') + oeuvres.length + tr(' travaux différents.') });
      for (const o of oeuvres) {
        const li = ident.createDiv({ cls: 'zfa-ref-oeuvre' });
        const t = li.createDiv({ cls: 'zfa-ref-texte' });
        t.createSpan({ cls: 'zfa-ref-compteur', text: o.n + '×  ' });
        t.createSpan({ text: o.titre || o.doi });
        li.createDiv({ cls: 'zfa-ref-faible', text: o.sources.join(', ') });
        if (o.doi) this.ligneDoi(li, o.doi);
      }
    } else if (oeuvres.length === 1) {
      ident.createDiv({ cls: 'zfa-ref-fort', text: oeuvres[0].titre || oeuvres[0].doi });
      if (oeuvres[0].doi) this.ligneDoi(ident, oeuvres[0].doi);
      ident.createDiv({ cls: 'zfa-ref-faible',
        text: oeuvres[0].n + tr(' citation(s), d’après la bibliographie de ') + oeuvres[0].sources.join(', ') });
    } else if (l.r.titre) {
      ident.createDiv({ cls: 'zfa-ref-fort', text: l.r.titre });
      if (l.r.doi) this.ligneDoi(ident, l.r.doi);
    } else {
      ident.createDiv({ cls: 'zfa-ref-faible',
        text: tr('Non identifiée : aucune bibliographie de source citante ne la mentionne.') });
    }

    /* ----------------------- 2. Sur quoi je me fonde ---------------------- */
    const preuve = d.createDiv({ cls: 'zfa-ref-section' });
    preuve.createDiv({ cls: 'zfa-ref-num',
      text: tr('Sources citantes') + '  ·  ' + l.r.sources.length + ' ' + tr('source(s)') });
    const parSource = new Map();
    for (const p of (l.biblio && l.biblio.parSource) || []) parSource.set(p.source, p);
    if (!l.r.sources.length) {
      preuve.createDiv({ cls: 'zfa-ref-faible', text: tr('Aucune source identifiée.') });
    }
    for (const [src, n] of l.r.sources.slice(0, 8)) {
      const ls = preuve.createDiv({ cls: 'zfa-ref-source' });
      const ent = ls.createDiv({ cls: 'zfa-ref-source-tete' });
      ent.createSpan({ cls: 'zfa-ref-source-nom', text: src });
      ent.createSpan({ cls: 'zfa-ref-compteur', text: n + '×' });
      const p = parSource.get(src);
      if (p) {
        const bb = ls.createDiv({ cls: 'zfa-ref-biblio' });
        bb.createDiv({ cls: 'zfa-ref-texte',
          text: (p.sur ? '' : '≈ ') + (p.retenu.titre || p.retenu.doi) });
        if (p.retenu.doi) bb.createDiv({ cls: 'zfa-ref-faible', text: p.retenu.doi });
        if (p.arbitre) {
          bb.createDiv({ cls: 'zfa-ref-arbitre',
            text: tr('Le modèle lit ici : ') + p.arbitre.oeuvre.titre });
        }
      } else {
        ls.createDiv({ cls: 'zfa-ref-faible', text: tr('Bibliographie indisponible pour cette source.') });
      }
      const bs = ls.createDiv({ cls: 'zfa-ref-barre-actions' });
      this.bouton(bs, tr('La source'), 'file-text', () => g.ouvrirNote(src));
      if (p && p.fichier) {
        this.bouton(bs, tr("L'annotation"), 'pen', () => this.app.workspace.getLeaf(true).openFile(p.fichier));
      }
      // Dernier recours : aller lire la bibliographie dans le PDF, quand ni
      // Crossref ni le texte extrait n'ont rien donné.
      this.bouton(bs, tr('Le PDF'), 'file-search', () => g.ouvrirPdfSource(src));
    }

    /* --------------------------- 3. Que faire ----------------------------- */
    const faire = d.createDiv({ cls: 'zfa-ref-section' });
    faire.createDiv({ cls: 'zfa-ref-num', text: tr('Actions') });
    const actes = faire.createDiv({ cls: 'zfa-ref-barre-actions' });

    // Une seule action mise en avant, celle que l'état appelle.
    if (cible) {
      this.bouton(actes, tr('Rattacher à cette fiche'), 'link', async () => {
        await g.rattacherReference(l.r, cible);
        this.lignes = (this.lignes || []).filter((x) => x !== l);
        this.rendre();
      }, true);
    } else if (l.doi && !l.r.complete) {
      this.bouton(actes, tr('Compléter depuis le DOI'), 'download-cloud', async () => {
        await g.completerReference(l.r, l.doi);
        await this.rafraichirLigne(l);
      }, true);
    }

    this.bouton(actes, l.r.etat === 'à acquérir' ? tr('Ne plus marquer') : tr('À acquérir'),
      'shopping-cart', () => g.marquerReference(l.r, l.r.etat === 'à acquérir' ? '' : 'à acquérir')
        .then(() => this.rafraichirLigne(l)));
    this.bouton(actes, l.r.etat === 'écartée' ? tr('Réintégrer') : tr('Écarter'),
      'eye-off', () => g.marquerReference(l.r, l.r.etat === 'écartée' ? '' : 'écartée')
        .then(() => this.rafraichirLigne(l)));
    this.bouton(actes, tr('Ouvrir la note'), 'file',
      () => this.app.workspace.getLeaf(true).openFile(l.r.fichier));

    // Les autres fiches Zotero possibles restent accessibles, sans encombrer.
    const restants = (l.candidats || []).filter((x) => x.basename !== cible);
    if (restants.length) {
      const det = faire.createEl('details', { cls: 'zfa-ref-repli' });
      det.createEl('summary', { text: restants.length + ' ' + tr('autre(s) fiche(s) Zotero possible(s)') });
      for (const cand of restants.slice(0, 5)) {
        const lc = det.createDiv({ cls: 'zfa-ref-candidat' });
        lc.createDiv({ cls: 'zfa-ref-texte', text: cand.titre || cand.basename });
        lc.createDiv({ cls: 'zfa-ref-faible', text: cand.basename });
        const bb = lc.createDiv({ cls: 'zfa-ref-barre-actions' });
        this.bouton(bb, tr('Rattacher'), 'link', async () => {
          await g.rattacherReference(l.r, cand.basename);
          this.lignes = (this.lignes || []).filter((x) => x !== l);
          this.rendre();
        });
        this.bouton(bb, tr('Voir la fiche'), 'file-text', () => g.ouvrirNote(cand.basename));
      }
    }
  }

  // Le verdict d'ensemble : les sources arbitrées désignent-elles la même œuvre ?


  ligneDoi(parent, doi) {
    const el = parent.createDiv({ cls: 'zfa-ref-doi' });
    el.createSpan({ text: doi });
    const c = el.createEl('button', { cls: 'zfa-ref-mini', text: tr('Copier') });
    c.onclick = () => { navigator.clipboard.writeText(doi); new obsidian.Notice(tr('Copié : ') + doi); };
    const o = el.createEl('button', { cls: 'zfa-ref-mini', text: tr('Ouvrir') });
    o.onclick = () => window.open('https://doi.org/' + doi);
  }

  async onClose() { this.contentEl.empty(); }
}

class VueSuggestionsZotflow extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() { return 'zfa-suggestions'; }
  getDisplayText() { return tr('Suggestions (Ariane)'); }
  getIcon() { return 'sparkles'; }

  async onOpen() {
    const c = this.contentEl;
    c.empty();
    c.addClass('zfa-sugg');
    const entete = c.createDiv({ cls: 'zfa-sugg-entete' });
    entete.createSpan({ cls: 'zfa-sugg-titre', text: tr('Suggestions') });
    const rafr = entete.createEl('button', { cls: 'zfa-sugg-refresh', text: tr('⟳') });
    rafr.setAttribute('aria-label', tr('Rafraîchir les suggestions (sans modèle de langue)'));
    rafr.onclick = () => this.plugin.majSuggestions(false, true);
    // Le reclassement par modèle de langue est le poste le plus lourd de tout
    // le greffon. Il ne part plus tout seul : il attend ce bouton.
    this.affiner = entete.createEl('button', { cls: 'zfa-sugg-refresh', text: tr('✨') });
    this.affiner.setAttribute('aria-label', tr('Affiner par le modèle de langue'));
    this.affiner.onclick = () => this.plugin.majSuggestions(true, true);
    this.pause = entete.createEl('button', { cls: 'zfa-sugg-refresh' });
    this.majBoutonPause();
    this.pause.onclick = async () => {
      this.plugin.settings.suggActif = !this.plugin.settings.suggActif;
      await this.plugin.saveSettings();
      this.majBoutonPause();
      this.plugin.majSuggestions(false, true);
    };
    this.filtres = c.createDiv({ cls: 'zfa-sugg-filtres' });
    this.construireFiltres();
    this.info = c.createDiv({ cls: 'zfa-sugg-info' });
    this.ancre = c.createDiv({ cls: 'zfa-sugg-ancre' }); this.ancre.style.display = 'none';
    this.barre = null;
    this.barreJauge = null;
    this.liste = c.createDiv({ cls: 'zfa-sugg-liste' });
    // À l'ouverture, la vue n'a pas encore ses dimensions : on passe outre le
    // test de visibilité, mais sans lancer le modèle de langue.
    this.plugin.majSuggestions(false, true);
  }

  majBoutonPause() {
    if (!this.pause) return;
    const actif = this.plugin.settings.suggActif;
    this.pause.setText(actif ? '⏸' : '▶');
    this.pause.setAttribute('aria-label',
      actif ? tr('Suspendre les suggestions') : tr('Reprendre les suggestions'));
  }

  // Cases à cocher : un type de note par dossier candidat.
  construireFiltres() {
    if (!this.filtres) return;
    this.filtres.empty();
    const s = this.plugin.settings;
    const dossiers = this.plugin.dossiersSuggeres();
    if (dossiers.length < 2) { this.filtres.style.display = 'none'; return; }
    this.filtres.style.display = '';

    for (const dossier of dossiers) {
      const masque = (s.suggDossiersMasques || []).includes(dossier);
      const et = this.filtres.createEl('label', { cls: 'zfa-sugg-filtre' });
      const cb = et.createEl('input', { type: 'checkbox' });
      cb.checked = !masque;
      // Étiquette : le nom que l'utilisateur a donné à la famille, à défaut
      // le nom du dossier débarrassé de son numéro.
      const fam = this.plugin.familles().find((x) => x.dossiers.includes(dossier));
      et.createSpan({ text: (fam && fam.nom) || dossier.replace(/^\d+\s*-\s*/, '').split('/').pop() });
      et.setAttribute('aria-label', dossier);
      cb.onchange = async () => {
        const masques = new Set(s.suggDossiersMasques || []);
        if (cb.checked) masques.delete(dossier); else masques.add(dossier);
        s.suggDossiersMasques = [...masques];
        await this.plugin.saveSettings();
        this.plugin.majSuggestions(false, true);
      };
    }
  }

  montrerAncrage(texte) {
    if (!this.ancre) return;
    this.ancre.empty();
    if (!texte) { this.ancre.style.display = 'none'; return; }
    this.ancre.style.display = '';
    const snip = String(texte).replace(/\s+/g, ' ').trim();
    this.ancre.createSpan({ cls: 'zfa-sugg-ancre-txt', text: '📌 ' + snip.slice(0, 120) + (snip.length > 120 ? '…' : '') });
    const x = this.ancre.createSpan({ cls: 'zfa-sugg-ancre-x', text: tr('✕') });
    x.setAttribute('aria-label', tr("Relâcher l'argument"));
    x.onclick = () => this.plugin.libererAncrage();
  }

  marquerReclassement(actif) {
    if (this.info) this.info.toggleClass('zfa-sugg-occupe', !!actif);
    this._reclassement = !!actif;
  }

  // Affiche l'avancement de l'indexation sémantique.
  // fait === -1 signale un échec (Ollama injoignable).
  marquerIndexation(fait, total, termine) {
    if (!this.info) return;
    if (fait === -1) {
      this.info.setText(tr('Ollama injoignable — repli lexical.'));
      if (this.barre) { this.barre.remove(); this.barre = null; }
      return;
    }
    if (termine || (total && fait >= total)) {
      if (this.barre) { this.barre.remove(); this.barre = null; }
      return;
    }
    const pct = total ? Math.round((fait / total) * 100) : 0;
    this.info.setText('Indexation sémantique… ' + fait + ' / ' + total + ' (' + pct + '%)');
    if (!this.barre) {
      this.barre = this.info.insertAdjacentElement('afterend', createDiv({ cls: 'zfa-sugg-barre' }));
      this.barreJauge = this.barre.createDiv({ cls: 'zfa-sugg-jauge' });
    }
    if (this.barreJauge) this.barreJauge.style.width = pct + '%';
  }

  rendre(suggestions, file, etat) {
    if (!this.liste) return;
    this.liste.empty();
    if (this.info) {
      this.info.removeClass('zfa-sugg-occupe');
      if (etat === 'inactif') this.info.setText(tr('Suggestions désactivées dans les réglages.'));
      else if (file) this.info.setText((file.basename) + (etat ? '  ·  ' + etat : ''));
      else this.info.setText(tr('Ouvrez une note pour voir des suggestions.'));
    }
    if (!suggestions || !suggestions.length) {
      if (etat !== 'inactif') this.liste.createDiv({ cls: 'zfa-sugg-vide', text: tr('Aucune suggestion pertinente.') });
      return;
    }
    const styleDe = (d) => this.plugin.styleDuDossier(d);
    for (const sug of suggestions) {
      const item = this.liste.createDiv({ cls: 'zfa-sugg-item' });
      item.setAttribute('draggable', 'true');
      const style = sug.dossier ? styleDe(sug.dossier) : null;
      if (style && style.couleur) {
        item.addClass('zfa-sugg-colore');
        item.style.setProperty('--zfa-sugg-couleur', style.couleur);
      }
      const tete = item.createDiv({ cls: 'zfa-sugg-tete' });
      if (style && style.icone) {
        const ic = tete.createSpan({ cls: 'zfa-sugg-icone' });
        obsidian.setIcon(ic, style.icone);
        if (style.couleur) ic.style.color = style.couleur;
      }
      tete.createSpan({ cls: 'zfa-sugg-lien', text: sug.titre });
      if (sug.raison) item.createDiv({ cls: 'zfa-sugg-raison', text: sug.raison });
      const pct = typeof sug.score === 'number' ? Math.round(sug.score * 100) + '%  ·  ' : '';
      item.createDiv({ cls: 'zfa-sugg-meta', text: pct + sug.basename });
      item.addEventListener('click', () => {
        this.plugin.app.workspace.openLinkText(sug.basename, '', false);
      });
      // Aperçu natif au survol (« Page preview »).
      item.addEventListener('mouseover', (event) => {
        this.plugin.app.workspace.trigger('hover-link', {
          event,
          source: 'zfa-suggestions',
          hoverParent: this,
          targetEl: item,
          linktext: sug.path || sug.basename,
          sourcePath: '',
        });
      });
      item.addEventListener('dragstart', (e) => {
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', '[[' + sug.basename + ']]');
          e.dataTransfer.effectAllowed = 'copy';
        }
      });
    }
  }

  async onClose() { this.contentEl.empty(); }
}

/* --------------------- Fenêtres du module Cartes ------------------------ */

// Sélecteur générique à filtre (relations, types, concepts).
class ChoixListeModal extends obsidian.FuzzySuggestModal {
  constructor(app, titre, items, onChoix) {
    super(app);
    this.items = items || [];
    this.onChoix = onChoix;
    this.setPlaceholder(titre);
  }
  getItems() { return this.items; }
  getItemText(it) { return it.nom; }
  onChooseItem(it) { if (this.onChoix) this.onChoix(it); }
}

// Rapport de conformité d'une carte.
class RapportCarteModal extends obsidian.Modal {
  constructor(app, nom, analyse) { super(app); this.nom = nom; this.a = analyse; }
  onOpen() {
    const c = this.contentEl;
    c.createEl('h3', { text: 'Carte « ' + this.nom + ' »' });
    const a = this.a;
    const typés = a.blocs.filter((b) => b.type).length;
    const relTypées = a.liens.filter((l) => l.relation).length;
    c.createEl('p', {
      cls: 'zfa-dedup-info',
      text: a.blocs.length + ' bloc(s), dont ' + typés + ' typé(s) · '
        + a.liens.length + ' relation(s), dont ' + relTypées + ' conforme(s).',
    });
    if (!a.problemes.length) { c.createEl('p', { text: tr('Aucun problème détecté.') }); return; }
    const groupes = {
      'lien-muet': tr('Flèches sans étiquette'),
      'hors-vocabulaire': tr('Étiquettes hors vocabulaire'),
      soupape: tr('Liens non typés (soupape)'),
      'bloc-sans-type': tr('Blocs sans type'),
      'type-inconnu': tr('Types inconnus'),
    };
    const liste = c.createDiv();
    liste.style.maxHeight = '50vh';
    liste.style.overflow = 'auto';
    for (const [cle, titre] of Object.entries(groupes)) {
      const items = a.problemes.filter((p) => p.type === cle);
      if (!items.length) continue;
      liste.createEl('h4', { text: titre + ' (' + items.length + ')' });
      const ul = liste.createEl('ul');
      for (const it of items.slice(0, 60)) ul.createEl('li', { text: it.texte });
      if (items.length > 60) liste.createEl('p', { cls: 'zfa-dedup-info', text: '…et ' + (items.length - 60) + ' autre(s).' });
    }
  }
  onClose() { this.contentEl.empty(); }
}

// Affichage d'un texte (DSL) avec copie.
class TexteModal extends obsidian.Modal {
  constructor(app, titre, texte) { super(app); this.titre = titre; this.texte = texte; }
  onOpen() {
    const c = this.contentEl;
    c.createEl('h3', { text: this.titre });
    const ta = c.createEl('textarea', { cls: 'zfa-dsl-zone' });
    ta.value = this.texte;
    ta.rows = 18;
    const pied = c.createDiv({ cls: 'zfa-dedup-pied' });
    const b = pied.createEl('button', { text: tr('Copier') });
    b.onclick = () => { navigator.clipboard.writeText(this.texte); new obsidian.Notice(tr('DSL copié.')); };
  }
  onClose() { this.contentEl.empty(); }
}

// Voisinage d'un concept dans le graphe agrégé.
class VoisinageModal extends obsidian.Modal {
  constructor(app, concept, sortants, entrants, plugin) {
    super(app); this.concept = concept; this.sortants = sortants; this.entrants = entrants; this.plugin = plugin;
  }
  onOpen() {
    const c = this.contentEl;
    c.createEl('h3', { text: this.concept });
    const bloc = (titre, liens, sens) => {
      c.createEl('h4', { text: titre + ' (' + liens.length + ')' });
      if (!liens.length) { c.createEl('p', { cls: 'zfa-dedup-info', text: tr('—') }); return; }
      const ul = c.createEl('ul');
      for (const l of liens) {
        const et = l.etiquette && l.etiquette.trim() ? l.etiquette.trim() : '?';
        const autre = sens === 'sortant' ? l.vers : l.de;
        const li = ul.createEl('li');
        li.createSpan({ text: sens === 'sortant' ? '— ' + et + ' → ' : '← ' + et + ' — ' });
        li.createSpan({ text: autre, cls: 'zfa-voisin-cible' });
        li.createSpan({ cls: 'zfa-dedup-info', text: '   [' + l.carte + ']' });
      }
    };
    const zone = c.createDiv();
    zone.style.maxHeight = '55vh';
    zone.style.overflow = 'auto';
    bloc(tr('Relations sortantes'), this.sortants, 'sortant');
    bloc(tr('Relations entrantes'), this.entrants, 'entrant');
  }
  onClose() { this.contentEl.empty(); }
}

class StylesModeleModal extends obsidian.Modal {
  constructor(app, noms) { super(app); this.noms = Array.isArray(noms) ? noms : []; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Styles du modèle Word (' + this.noms.length + ')' });
    contentEl.createEl('p', { text: tr('Copiez le nom exact du style voulu dans les champs de mapping des réglages.'), cls: 'zfa-dedup-info' });
    const liste = contentEl.createDiv();
    liste.style.maxHeight = '52vh';
    liste.style.overflow = 'auto';
    for (const n of this.noms) {
      const row = liste.createDiv({ cls: 'zfa-style-row' });
      row.createSpan({ text: n });
      const b = row.createEl('button', { text: tr('Copier') });
      b.onclick = () => { navigator.clipboard.writeText(n); new obsidian.Notice(tr('Copié : ') + n); };
    }
  }
  onClose() { this.contentEl.empty(); }
}

class FusionAuteursModal extends obsidian.Modal {
  constructor(app, plugin, conflits, clusters, dossier) {
    super(app);
    this.plugin = plugin; this.conflits = conflits; this.dossier = dossier;
    this.choix = clusters.map((grp) => ({ membres: grp, inclure: true, canon: meilleurCanonique(grp) }));
  }
  onOpen() {
    const c = this.contentEl;
    c.createEl('h3', { text: tr("Fusionner les doublons d'auteurs") });
    if (this.conflits.length) {
      c.createEl('p', { text: this.conflits.length + ' copie(s) de conflit à supprimer :' });
      const ul = c.createEl('ul');
      for (const cf of this.conflits) ul.createEl('li', { text: cf.nom });
    }
    if (this.choix.length) {
      c.createEl('p', { text: this.choix.length + ' groupe(s) de variantes. Décochez ceux à ne pas fusionner ; choisissez la fiche à conserver.' });
      this.choix.forEach((ch) => {
        const box = c.createDiv({ cls: 'zfa-dedup-ligne' });
        const cb = box.createEl('input', { type: 'checkbox' }); cb.checked = ch.inclure;
        cb.onchange = () => { ch.inclure = cb.checked; };
        const sel = box.createEl('select', { cls: 'dropdown' });
        for (const m of ch.membres) { const o = sel.createEl('option', { text: m, value: m }); if (m === ch.canon) o.selected = true; }
        sel.onchange = () => { ch.canon = sel.value; };
        box.createSpan({ cls: 'zfa-dedup-info', text: ' ← conserver ; fusionne : ' + ch.membres.join(', ') });
      });
    } else {
      c.createEl('p', { text: tr('Aucune variante de nom détectée.') });
    }
    const pied = c.createDiv({ cls: 'zfa-dedup-pied' });
    const ok = pied.createEl('button', { text: tr('Fusionner'), cls: 'mod-cta' });
    ok.onclick = () => this.executer();
    pied.createEl('button', { text: tr('Annuler') }).onclick = () => this.close();
  }
  async executer() {
    this.close();
    const notice = new obsidian.Notice(tr('Fusion des auteurs…'), 0);
    try {
      if (this.conflits.length) await this.plugin.supprimerConflitsAuteurs(this.conflits, this.dossier);
      let n = 0;
      for (const ch of this.choix) {
        if (!ch.inclure) continue;
        const variantes = ch.membres.filter((m) => m !== ch.canon);
        if (variantes.length) { await this.plugin.fusionnerCluster(ch.canon, variantes, this.dossier); n += variantes.length; }
      }
      notice.hide();
      new obsidian.Notice(tr('Auteurs : ') + this.conflits.length + ' conflit(s) supprimé(s), ' + n + ' variante(s) fusionnée(s).');
    } catch (e) { notice.hide(); new obsidian.Notice(tr('Fusion — échec : ') + (e && e.message ? e.message : e)); console.error('[Ariane] fusion auteurs', e); }
  }
  onClose() { this.contentEl.empty(); }
}

module.exports = ZotflowAtomiser;

// Exposition des fonctions pures pour les tests.
module.exports._test = {
  DEFAULT_SETTINGS,
  echapperRegex,
  nomCompletAuteur,
  appliquerModele,
  parseNomReference,
  parseAuteurSeul,
  compilerProfils,
  extraireBlocs,
  trouverSourceZotero,
  appariementSource,
  candidatsSource,
  surnamesReference,
  construireNote,
  construireReference,
  normaliserConjAuteurs,
  horodatageNC,
  rangesNotesOrphelines,
  normDoi,
  nomFamille,
  refsDepuisCrossref,
  refsDepuisOpenAlexWorks,
  tokeniser,
  frequenceTermes,
  calculerIdf,
  vecteurTfIdf,
  cosinusTfIdf,
  hacherTexte,
  normaliserVecteur,
  cosinusVecteurs,
  normNom,
  surnameKey,
  memePersonne,
  clustersDoublons,
  meilleurCanonique,
};
