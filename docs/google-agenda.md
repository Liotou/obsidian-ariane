# Relier Ariane à Google Agenda

Ariane peut synchroniser les créneaux de vos tâches avec Google Agenda, dans
les deux sens : chaque créneau devient un événement dans le calendrier Google
de sa famille, et un événement déplacé dans Google déplace le créneau.

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

## 2. Activer l'API Google Calendar

1. Menu, **API et services**, puis **Bibliothèque**.
2. Cherchez « Google Calendar API », ouvrez-la, puis **Activer**.

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
   fond**.
2. Source : **Google Agenda (synchronisé, compte Google)**.
3. Collez l'**identifiant client** et le **code secret du client**.
4. Cliquez sur **Relier mon compte Google**. Votre navigateur ouvre la page de
   connexion de Google.
5. Google prévient que l'application n'est pas validée : cliquez sur
   **Paramètres avancés**, puis **Accéder à Ariane**. Acceptez l'accès à
   l'agenda.
6. La page affiche « Ariane est reliée à Google Agenda » : fermez l'onglet.

## 6. Choisir les calendriers

- Chaque famille de tâches porte un champ **Calendrier Google** (Réglages,
  Tâches, Familles de tâches) : le **nom** d'un de vos calendriers Google.
- À défaut, le **calendrier par défaut** de la rubrique Agenda en fond.
- Le bouton **Voir les calendriers** liste les noms que vous pouvez utiliser.

Ensuite, **Synchroniser** envoie les créneaux. La synchronisation automatique
suit chaque créneau modifié, et relève les déplacements toutes les cinq
minutes.

## Ce qu'Ariane garde, et où

- Les jetons de connexion restent dans les réglages d'Ariane, sur votre
  machine ; ils ne partent jamais dans un profil exporté.
- Chaque note de tâche garde, par créneau, l'identifiant de son événement
  (propriété « Google ID »).
- Pour tout délier : le bouton à côté de « Relier mon compte Google ». Vous
  pouvez aussi retirer l'accès depuis votre compte Google (Sécurité,
  « Applications tierces »).
