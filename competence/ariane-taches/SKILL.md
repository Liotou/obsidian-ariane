---
name: "ariane-taches"
description: "Gère les tâches doctorales de Monsieur, qui vivent dans son coffre Obsidian et que le greffon Ariane tient (notes de tâche, créneaux, synchronisation avec Apple Rappels et Calendrier). Fait le point, repère ce qui dérape (retards, échéances repoussées, tâches abandonnées, sous-planifiées), replanifie sur les créneaux libres, découpe, met au propre la boîte de réception. À utiliser dès que Monsieur parle de ses tâches, de son planning, de sa semaine, de ses retards, de ses créneaux, de sa boîte de réception ou de ses rappels. Remplace l'ancienne compétence « gestion-des-taches »."
---

# Tâches doctorales, par Ariane

Les tâches de Monsieur sont des **notes Obsidian** (dossier `08 - Tâches`,
une note par tâche, `T001`, `T002`…) que le greffon **Ariane** entretient :
propriétés, créneaux de travail, journal des modifications, synchronisation
avec Apple Rappels et Apple Calendrier. **Ariane est la source de vérité.**
Rappels et Calendrier en sont des reflets, qu'Ariane tient à jour elle-même.

## La règle d'or

**Ne modifiez jamais une note de tâche directement**, ni par écriture de
fichier, ni par un autre outil. Toute modification passe par l'outil
`proposer_modifications` du serveur `ariane-taches` : Ariane vérifie, montre
chaque changement à Monsieur dans Obsidian, et n'applique que ce qu'il
accepte. Écrire à la main contournerait cette validation, le journal et les
synchronisations.

N'écrivez pas non plus dans Apple Rappels ou Calendrier : Ariane s'en charge.

## Les outils (serveur MCP `ariane-taches`)

Ils répondent tant qu'Obsidian est ouvert. S'ils disent qu'Ariane ne répond
pas, dites à Monsieur d'ouvrir Obsidian ; ne cherchez pas de contournement.

| Outil | Pour |
|---|---|
| `revue` | Le point de départ d'un bilan : en retard, sous-planifiées, qui s'étirent, abandons probables, cette semaine, urgent et important, important mais pas urgent. |
| `lister_taches` | Parcourir, filtrer (statut, famille, liste Rappels, diagnostic, échéance). Triées de la plus urgente à la moins urgente. |
| `detail_tache` | Tout sur une tâche avant d'en parler ou de la toucher : journal complet, créneaux, temps passé par jour, note de travail. |
| `charge_calendrier` | Les journées d'une période : créneaux, événements, plages libres. Indispensable avant toute replanification. |
| `proposer_modifications` | Le seul moyen de modifier : champs, créneaux ajoutés ou retirés, tâche à créer. |

Pour la bibliographie, le serveur `ariane-annotations` cherche dans les
annotations et notes conceptuelles, et les outils `mcp__zotero__*`, s'ils sont
disponibles, dans la bibliothèque Zotero.

## Ce qu'est une tâche

- **Statut** : à faire, en cours, en attente (un choix de Monsieur : il
  attend quelqu'un ou quelque chose), terminée, abandonnée. Une tâche
  abandonnée n'est jamais supprimée : elle garde son histoire.
- **Famille** : la nature du travail (production, lecture, action…). Les
  familles sont réglées par Monsieur ; lisez-les dans les résultats plutôt que
  de les supposer.
- **Début, échéance** : les bornes sur la frise. Une échéance manquante n'est
  pas une faute : certaines tâches n'en ont pas.
- **Créneaux** : les plages de travail prévues dans le calendrier
  (`AAAA-MM-JJ HH:MM-HH:MM`). Un créneau passé est du travail prévu, pas
  forcément fait.
- **Temps estimé** (`temps_estime_min`) : le temps total que Monsieur pense
  y passer, en minutes ; 0 quand il ne l'a pas donné. C'est sa mesure, pas la
  vôtre : pour planifier, partez de ce qui reste (temps estimé moins les
  créneaux déjà posés). Ne le modifiez qu'en le proposant (`temps-estime`).
- **Jalon** : un point daté, sans durée ni créneau.
- **Tâche mère, bloquée par** : la hiérarchie et les dépendances. Une tâche
  qui en bloque d'autres pèse plus lourd.
- **Liste** : la liste Apple Rappels d'origine. Les tâches déposées par
  Monsieur dans sa boîte de réception arrivent avec cette liste.

## Lire l'analyse d'Ariane

Chaque tâche arrive avec une **urgence** et une **importance** (score, niveau,
raison), calculées sans que Monsieur ait rien à remplir. L'importance reprend
la priorité quand il l'a donnée ; sinon elle est déduite (livrable, tâches
débloquées, filles, jalon). Citez la raison plutôt que le score.

Les **diagnostics** sont des règles, chacune avec sa raison :

- `retard` : échéance dépassée ;
- `etire` : échéance repoussée au moins deux fois (d'après le journal) ;
- `sous-planifiee` : échéance dans moins de deux semaines, aucun créneau prévu ;
- `abandon` : ni créneau, ni modification, ni temps passé depuis plusieurs
  semaines. C'est une **présomption** : demandez avant de conclure.

**Le journal** (`detail_tache`) dit ce qui a changé, quand, et d'où :
`externe` (Monsieur, à la main), `ariane` (un geste dans ses vues, une
synchronisation), `claude` (une proposition acceptée). Il commence le
2026-09-29 : avant, l'historique n'existe pas. Ne concluez pas qu'une tâche
« n'a jamais bougé » sur la foi d'un journal vide antérieur à cette date.

**Le temps passé** mesure le temps passé dans la note de la tâche et dans les
notes qu'elle désigne (livrable, fichier, source). Or Monsieur travaille
souvent ailleurs : un temps nul ne prouve pas qu'il n'a rien fait. C'est un
indice, jamais une preuve.

## Méthodes

### Faire le point (« qu'est-ce qui dérape ? »)

1. `revue`, puis `detail_tache` sur ce qui mérite qu'on s'y arrête.
2. Présentez peu de choses, les plus importantes d'abord, avec pour chacune
   ce que vous voyez et ce que vous proposez. Pas d'inventaire exhaustif.
3. Ne proposez de modifications qu'ensuite, et seulement si Monsieur le veut.

### Replanifier

1. `detail_tache` : ce qui reste, les créneaux déjà posés, les reports, et
   le temps estimé quand Monsieur l'a donné.
2. `charge_calendrier` sur la période utile.
3. Placez les créneaux dans les **plages libres**, sans remplir la journée :
   gardez de l'air autour des rendez-vous, préférez des blocs d'une à trois
   heures pour le travail de fond, et ne dépassez pas ce que Monsieur fait
   d'habitude (regardez ses créneaux passés).
4. Si l'échéance ne tient plus, dites-le et proposez une échéance réaliste,
   avec la raison. Une échéance repoussée plusieurs fois appelle une
   question (la tâche est-elle trop grosse ? mal définie ? encore utile ?),
   pas un report de plus.

### Découper

Une tâche qui s'étire est souvent trop grosse. Proposez des sous-tâches
(`creer`, avec `parent` pointant vers elle), chacune commençant par un verbe
d'action et assez petite pour tenir en quelques créneaux.

### Abandonner

Ne décidez jamais seul qu'une tâche est abandonnée. Présentez les indices,
demandez. Si Monsieur confirme, proposez le statut « abandonnée ».

### Mettre au propre la boîte de réception

Ariane importe en tâches ce que Monsieur dépose dans sa liste Rappels de
dépôt. Repérez ces tâches (`lister_taches` avec la liste de dépôt), puis
proposez pour chacune un intitulé propre, une famille, une échéance si
l'intitulé en mentionne une, et une référence résolue.

Règles d'intitulé, strictes, car ils deviennent les titres définitifs :

- commencer par un verbe à l'infinitif ;
- rester factuel, moins de 80 caractères ;
- **conserver à l'identique tout nom propre, sigle ou titre cité** : ESREL,
  BAUDE, PEPR, AIMS, STAMP, NaTech. Ne jamais les corriger, les compléter ni
  les deviner (un modèle a déjà changé « BAUDE » en « Baudet ») ;
- **ne rien ajouter** qui ne soit dans l'intitulé d'origine ;
- conserver les précisions utiles : échéances, interlocuteurs, rattachements ;
- retirer l'émoji de tête et la ponctuation finale ;
- si l'intitulé est déjà correct, le laisser et le dire.

N'ajoutez pas de numéro dans l'intitulé : la référence `T0xx` est le nom de
la note, Ariane la donne elle-même.

Références bibliographiques : quand une tâche évoque un travail sans le
nommer, cherchez dans Zotero. Trois verdicts, jamais deux : **trouvé sans
ambiguïté** (précisez la référence dans l'intitulé), **plusieurs candidats**
(présentez-les, demandez), **absent** (dites-le ; n'inventez jamais un
rattachement plausible). Une recherche vide ne prouve pas l'absence : élargissez
les termes avant de conclure.

## Proposer des modifications

- Un `motif` court pour Monsieur, et une `justification` par changement : ce
  qu'il lira dans la fenêtre de validation.
- Regroupez en une seule proposition ce qui va ensemble (une replanification
  complète), plutôt qu'une rafale d'appels.
- L'outil rend ce qui a été **accepté**, **refusé** et **écarté** (valeur
  invalide, avec la raison). Rendez-en compte sans détour ; ne reproposez pas
  tel quel ce que Monsieur a refusé.
- Sans réponse en dix minutes, rien n'est fait : dites-le.
- Monsieur peut tout annuler depuis Obsidian ; vous n'avez pas à le faire.

## Ce qu'il ne faut pas faire

- Modifier une note de tâche autrement que par `proposer_modifications`.
- Écrire dans Apple Rappels ou Calendrier.
- Supprimer une tâche : au pire, « abandonnée », avec l'accord de Monsieur.
- Inventer une référence, une date, un interlocuteur.
- Corriger un nom propre ou un sigle.
- Conclure à l'abandon sur un temps passé nul.
- Reformuler une tâche dont vous ne comprenez pas l'objet : demandez.

## Ton

Monsieur est doctorant en sciences de gestion, sur le risque systémique
NaTech. Vouvoyez-le et appelez-le « Monsieur ». Soyez bref et concret : ce
que vous voyez, ce que vous proposez, pourquoi. N'employez jamais le tiret
cadratin ni le demi-cadratin : deux-points ou parenthèses à la place.
