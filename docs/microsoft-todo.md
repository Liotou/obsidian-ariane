# Relier Ariane à Microsoft To Do

Ariane peut envoyer vos rappels dans **Microsoft To Do**, sur Windows comme
sur Mac ou Linux, avec les mêmes règles qu'Apple Rappels : chaque tâche
datée devient une tâche dans la liste de sa famille, la cocher termine la
tâche du coffre, et une tâche ajoutée à la main dans une liste surveillée
devient une tâche du coffre.

La connexion passe par **votre propre application Microsoft**. Elle
n'appartient qu'à vous : aucune adresse, aucun compte ni aucun jeton n'est
partagé, et rien n'est publié avec Ariane. Comptez dix minutes, une seule
fois. L'application est publique (au sens de Microsoft) : elle n'a pas de
secret à recopier.

## 1. Ouvrir Microsoft Entra

1. Ouvrez le [centre d'administration Microsoft Entra](https://entra.microsoft.com/)
   (ou le [portail Azure](https://portal.azure.com/), rubrique « Microsoft
   Entra ID »).
2. Avec un compte **professionnel ou scolaire** (Microsoft 365), vous y êtes
   directement, si votre organisation autorise les utilisateurs à inscrire
   des applications. Sinon, demandez-le à votre service informatique.
3. Avec un compte **personnel** (Outlook.com, Hotmail), Microsoft demande
   aujourd'hui un annuaire : créez un compte Azure gratuit, qui en crée un.

## 2. Inscrire l'application

1. **Applications**, puis **Inscriptions d'applications**, puis **Nouvelle
   inscription**.
2. Nom : « Ariane ».
3. Types de comptes pris en charge : **Comptes dans un annuaire
   d'organisation et comptes Microsoft personnels** (le plus simple, il
   accepte tous les comptes).
4. URI de redirection : plateforme **Client public/natif (mobile et
   bureau)**, adresse `http://localhost`. Microsoft accepte alors n'importe
   quel port, ce dont Ariane a besoin.
5. **Inscrire**.
6. Sur la page de l'application, copiez l'**ID d'application (client)**.

## 3. Les autorisations

1. **Autorisations de l'API**, puis **Ajouter une autorisation**, puis
   **Microsoft Graph**, puis **Autorisations déléguées**.
2. Cochez **Tasks.ReadWrite** (et, s'il est proposé, **offline_access**),
   puis **Ajouter des autorisations**.

Ariane demande elle-même ces autorisations à la connexion : cette étape les
rend seulement visibles d'avance.

## 4. Relier Ariane

1. Dans Obsidian : Réglages, Ariane, onglet **Tâches**, rubrique **Rappels**.
2. Destination : **Microsoft To Do**.
3. Collez l'**identifiant de l'application**.
4. **Annuaire** : laissez « common ». Si vous avez choisi, à l'étape 2, un
   type de comptes limité à votre organisation, mettez l'**ID de
   l'annuaire (locataire)**, affiché sur la page de l'application.
5. Cliquez sur **Relier mon compte Microsoft**. Votre navigateur ouvre la
   page de connexion de Microsoft ; acceptez l'accès à vos tâches.
6. La page affiche « Ariane est reliée à votre compte Microsoft » : fermez
   l'onglet.
7. Activez la synchronisation (interrupteur **Activer** de la rubrique).

## 5. Les listes

- Chaque famille de tâches porte un champ **Liste de rappels** : le nom
  d'une liste de To Do, créée au besoin. À défaut, la **liste de rappels par
  défaut** de la rubrique Rappels ; vide, la liste « Tâches » du compte.
- Le bouton **Voir les listes du compte** affiche les listes existantes.
- L'heure d'une tâche devient l'**alerte** du rappel ; la priorité devient
  son importance (haute, normale, basse).

## Ce qu'Ariane garde, et où

- Les jetons de connexion restent dans les réglages d'Ariane, sur votre
  machine ; ils ne partent jamais dans un profil exporté.
- Chaque note de tâche garde l'identifiant de son rappel (propriété « Rappel
  ID », préfixée « microsoft: »).
- Pour tout délier : le bouton à côté de « Relier mon compte Microsoft ».
  Vous pouvez aussi retirer l'accès depuis votre compte Microsoft
  (« Applications et services » ou « Mes applications »).
