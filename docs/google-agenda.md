# Relier Ariane à Google Agenda et Google Tasks

Ariane peut synchroniser les créneaux de vos tâches avec Google Agenda, dans
les deux sens : chaque créneau devient un événement dans le calendrier Google
de sa famille, et un événement déplacé dans Google déplace le créneau. Elle
peut aussi envoyer vos rappels dans **Google Tasks** (Réglages, Tâches,
Rappels, destination « Google Tasks »). Un seul compte relié sert les deux.

La connexion passe par **votre propre application Google**. Elle n'appartient
qu'à vous : aucune adresse, aucun compte ni aucun jeton n'est partagé avec
qui que ce soit, et rien n'est publié avec Ariane. Comptez cinq minutes, une
seule fois.

Si vous voulez seulement **voir** vos événements Google en fond du
calendrier, sans rien synchroniser, l'adresse secrète iCal de l'agenda suffit
(Réglages, Tâches, Agenda en fond, source « Google Agenda (adresse iCal) ») :
ce guide est inutile.

## 1. Créer le projet

1. Ouvrez la [console Google Cloud](https://console.cloud.google.com/), avec
   le compte Google de votre agenda.
2. En haut, ouvrez le sélecteur de projet, puis **Nouveau projet**. Nommez-le
   par exemple « Ariane », puis **Créer**.

## 2. Activer les API

1. Menu, **API et services**, puis **Bibliothèque**.
2. Cherchez « Google Calendar API », ouvrez-la, puis **Activer**.
3. Pour les rappels, cherchez aussi « Google Tasks API », puis **Activer**.

## 3. L'écran de consentement

1. **API et services**, puis **Écran de consentement OAuth** (ou « Google
   Auth Platform »).
2. Type d'utilisateur : **Externe**.
3. Nom de l'application : « Ariane ». Adresse d'assistance : la vôtre. Elle
   n'est montrée qu'aux personnes qui se connectent à **votre** application,
   c'est-à-dire à vous seul.
4. Accès aux données (champs d'application) : vous pouvez ne rien ajouter ;
   Ariane les demande elle-même à la connexion.
5. **Audience**, ou « Utilisateurs tests » : ajoutez votre propre adresse.
6. **Important** : passez l'application **en production** (bouton « Publier
   l'application »). En mode « Test », Google fait expirer la connexion au
   bout de sept jours. En production, sans vérification par Google, elle
   reste valable ; Google affiche seulement un avertissement à la connexion.

## 4. Créer l'identifiant client

1. **API et services**, puis **Identifiants** (ou « Clients »).
2. **Créer des identifiants**, puis **ID client OAuth**.
3. Type d'application : **Application de bureau**. Nom : « Ariane ».
4. Google affiche l'**ID client** (il finit par `apps.googleusercontent.com`)
   et le **code secret du client**. Gardez cette fenêtre ouverte.

## 5. Relier Ariane

1. Dans Obsidian : Réglages, Ariane, onglet **Tâches**, rubrique **Agenda en
   fond** (ou rubrique **Rappels**, destination « Google Tasks », si vous ne
   voulez que les rappels).
2. Source : **Google Agenda (synchronisé, compte Google)**.
3. Collez l'**identifiant client** et le **code secret du client**.
4. Cliquez sur **Relier mon compte Google**. Votre navigateur ouvre la page de
   connexion de Google.
5. Google prévient que l'application n'est pas validée : cliquez sur
   **Paramètres avancés**, puis **Accéder à Ariane**. Acceptez l'accès à
   l'agenda et aux tâches.
6. La page affiche « Ariane est reliée à votre compte Google » : fermez
   l'onglet.

Un compte relié avant l'arrivée de Google Tasks dans Ariane n'a autorisé que
l'agenda : cliquez sur **Relier à nouveau** pour ajouter les tâches.

## 6. Choisir les calendriers

- Chaque famille de tâches porte un champ **Calendrier Google** (Réglages,
  Tâches, Familles de tâches) : le **nom** d'un de vos calendriers Google.
- À défaut, le **calendrier par défaut** de la rubrique Agenda en fond.
- Le bouton **Voir les calendriers** liste les noms que vous pouvez utiliser.

Ensuite, **Synchroniser** envoie les créneaux. La synchronisation automatique
suit chaque créneau modifié, et relève les déplacements toutes les cinq
minutes.

## 7. Les rappels dans Google Tasks

- Chaque famille de tâches porte un champ **Liste de rappels** : le nom
  d'une liste de Google Tasks, créée au besoin. À défaut, la **liste de
  rappels par défaut** de la rubrique Rappels ; vide, la liste par défaut du
  compte.
- Google Tasks ne garde que le **jour** de l'échéance : l'heure reste dans la
  note, et n'est jamais effacée par la relève.
- Cocher une tâche dans Google Tasks termine la tâche du coffre ; une tâche
  ajoutée à la main dans une liste surveillée devient une tâche du coffre.

## Ce qu'Ariane garde, et où

- Les jetons de connexion restent dans les réglages d'Ariane, sur votre
  machine ; ils ne partent jamais dans un profil exporté.
- Chaque note de tâche garde, par créneau, l'identifiant de son événement
  (propriété « Google ID »), et l'identifiant de son rappel (propriété
  « Rappel ID », préfixée « google: »).
- Pour tout délier : le bouton à côté de « Relier mon compte Google ». Vous
  pouvez aussi retirer l'accès depuis votre compte Google (Sécurité,
  « Applications tierces »).
