---
name: "ariane-commentaires"
description: "Lit et traite les commentaires en marge que Monsieur pose dans ses notes Obsidian (module « Commentaires en marge » d'Ariane, format de Margin Annotations) : retrouve les commentaires d'une note, révise le passage commenté selon la demande, marque le commentaire comme résolu ou y répond. À utiliser dès que Monsieur parle de ses commentaires, de ses remarques en marge, de « traiter les commentaires », de « relire selon mes commentaires », ou qu'une note contient des balises <span class=\"ann-s\"> ou <span class=\"ann-e\">."
---

# Les commentaires en marge de Monsieur

Monsieur commente ses notes comme dans Word : il sélectionne un passage et
écrit un commentaire, qu'Ariane montre dans une carte en marge. Dans le
fichier, le commentaire tient dans **deux balises vides**, autour du passage :

```html
<span class="ann-s" data-id="k3f9" data-color="yellow"></span>le passage commenté<span class="ann-e" data-id="k3f9" data-color="yellow" data-note="Le commentaire" data-author="Moi" data-time="2026-10-31 18:20"></span>
```

- Les deux balises d'un même commentaire partagent leur `data-id` (quatre
  caractères). `ann-s` ouvre, `ann-e` ferme ; le texte entre les deux est le
  passage commenté. Il peut couvrir plusieurs lignes ou paragraphes.
- Tout est sur la balise de fin : `data-note` (le commentaire),
  `data-author`, `data-time` (`AAAA-MM-JJ HH:mm`), `data-resolved="1"` quand
  il est résolu, et `data-replies`, la discussion : un tableau JSON
  d'objets `{"a": auteur, "t": heure, "c": texte}`.
- Autour d'un bloc de code, les balises sont seules sur leur ligne, hors des
  clôtures ; dans un tableau, elles restent dans une seule cellule.

## Traiter les commentaires d'une note

1. **Ne traiter que les commentaires ouverts** : ceux dont la balise de fin
   ne porte pas `data-resolved="1"`. Ne rien changer au texte qui n'est
   pas commenté.
2. **Réviser le passage** selon le commentaire et sa discussion
   (`data-replies`), entre les deux balises.
3. **Puis le marquer résolu** : ajouter `data-resolved="1"` à sa balise de
   fin. Ne jamais supprimer les balises : Monsieur relit et décide. Rouvrir
   un commentaire, c'est retirer cet attribut.
4. **En cas de doute**, ne pas modifier et ne pas résoudre : ajouter une
   réponse à la fin de `data-replies` (créer l'attribut s'il manque), par
   exemple `{"a":"Claude","t":"2026-10-31 18:30","c":"Ma question"}`, avec
   l'heure réelle.

Préférer une modification ciblée de la balise (remplacer la balise de fin
entière) à une réécriture du fichier.

## Écrire une valeur d'attribut

Les valeurs sont échappées en entités HTML, pour qu'aucune syntaxe
d'Obsidian ne s'y anime et que la balise reste sur une ligne :

| Caractère | Entité | Caractère | Entité |
|---|---|---|---|
| `"` | `&#34;` | `&` | `&amp;` |
| `<` | `&lt;` | `>` | `&gt;` |
| saut de ligne | `&#10;` | `[` `]` | `&#91;` `&#93;` |
| `\|` | `&#124;` | `#` | `&#35;` |
| `$` | `&#36;` | `%` | `&#37;` |
| `=` | `&#61;` | `` ` `` | `&#96;` |
| `~` | `&#126;` | | |

Pour lire une valeur, faire l'inverse. `data-replies` est du JSON, lui-même
échappé de la même façon.

## Ce qu'il ne faut pas faire

- Ne pas poser de commentaire dans une note qu'Ariane ou ZotFlow réécrivent
  (notes d'annotation, notes de lecture, fiches Zotero) : il y serait perdu.
- Ne pas ajouter de guide ni de commentaire HTML en fin de note : Ariane n'en
  écrit pas, et Monsieur tient à des notes propres.
- Ne pas confondre avec les annotations Zotero (notes d'annotation
  d'Ariane, clé `zotflow-anno-key`) : ce sont des surlignages de PDF, pas
  des commentaires en marge.
