🇬🇧 [English](./README.md) | 🇫🇷 **Français**

# Vinted Backend

Une API REST backend pour une marketplace de vêtements d'occasion inspirée de Vinted : authentification par token, gestion des annonces (upload d'image compris), recherche/filtrage avec pagination.

![CI](https://github.com/dan0203/vinted-backend/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)

## Sommaire

- [À propos](#à-propos)
- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Référence de l'API](#référence-de-lapi)
- [Démarrage](#démarrage)
- [Sécurité](#sécurité)
- [Limitations connues / pistes d'amélioration](#limitations-connues--pistes-damélioration)
- [Historique du projet](#historique-du-projet)
- [Projet lié](#projet-lié)
- [Licence](#licence)

## À propos

Cette API a été développée pendant un bootcamp full-stack chez [Le Réacteur](https://www.lereacteur.io/) (2026), sur le modèle du backend de Vinted : comptes utilisateurs, publication d'annonces avec hébergement d'image, catalogue d'annonces filtrable et paginé. C'est un projet d'apprentissage, pas un service en production — mais construit avec les mêmes principes (architecture en couches, gestion d'erreurs centralisée, validation des entrées, mots de passe hashés) qu'un vrai service utiliserait.

Le projet a été repris en septembre 2026 pour une passe de consolidation dédiée : migration du hachage de mot de passe de SHA-256 vers bcrypt, correction d'un vecteur de ReDoS, correction d'un gestionnaire d'erreur global cassé, ajout d'ESLint/Prettier et d'une CI — voir [Historique du projet](#historique-du-projet).

Aucune démo n'est actuellement déployée ; voir [Démarrage](#démarrage) pour le lancer en local.

## Fonctionnalités

- **Authentification** : inscription et connexion avec mot de passe hashé (bcrypt) ; un token d'accès JWT de courte durée est renvoyé dans le corps de la réponse et un refresh token tournant est délivré dans un cookie `httpOnly`.
- **Autorisation** : seul le propriétaire d'une annonce, ou le compte lui-même, peut la modifier ou la supprimer.
- **Annonces** : publication, remplacement complet (PUT) ou modification partielle (PATCH), et suppression d'une annonce, avec une photo principale et jusqu'à 5 photos secondaires hébergées sur Cloudinary.
- **Comptes** : modifier son propre username/avatar/newsletter (PUT/PATCH) ou supprimer son propre compte (DELETE), ce qui supprime aussi toutes ses annonces.
- **Recherche & filtres** : filtrage par titre (insensible à la casse, protégé contre le ReDoS), par fourchette de prix, tri par prix (croissant/décroissant), pagination.
- **Gestion d'erreurs centralisée** : chaque erreur porte un statut HTTP et un message JSON ; les erreurs internes inattendues sont journalisées côté serveur mais ne fuitent jamais leurs détails au client.

## Stack technique

| Catégorie             | Choix                                                                                                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime / framework   | Node.js, Express 5 (routing, middlewares)                                                                                                                                                                                                                                   |
| Base de données / ODM | MongoDB, Mongoose                                                                                                                                                                                                                                                           |
| Validation            | [Joi](https://joi.dev/) (validation par schéma, toutes les routes)                                                                                                                                                                                                          |
| Authentification      | Tokens d'accès JWT (`jsonwebtoken`) + refresh token tournant dans un cookie `httpOnly` (`cookie-parser`), [bcryptjs](https://github.com/dcodeIO/bcrypt.js) pour le hachage des mots de passe, `uid2` pour la génération des tokens de refresh/confirmation/réinitialisation |
| Upload de fichiers    | [express-fileupload](https://github.com/richardgirges/express-fileupload) + [Cloudinary](https://cloudinary.com/) pour l'hébergement d'images                                                                                                                               |
| Documentation API     | [swagger-jsdoc](https://github.com/Surnet/swagger-jsdoc) + [swagger-ui-express](https://github.com/scottie1984/swagger-ui-express) (OpenAPI 3.0, générée depuis les commentaires JSDoc des fichiers de routes)                                                              |
| Outillage             | ESLint + Prettier, CI GitHub Actions (lint à chaque push/PR)                                                                                                                                                                                                                |

_(Les paquets utilitaires comme `cors` et `dotenv` servent à la configuration standard et ne sont pas listés comme des choix d'architecture.)_

## Référence de l'API

URL de base : `http://localhost:3000` (ou le `PORT` configuré). Tous les corps de requête/réponse sont en JSON, sauf `publish`/`PUT`/`PATCH` qui attendent du `multipart/form-data` (nécessaire pour l'upload de fichiers, même sur les requêtes qui n'envoient que des champs texte).

Les routes authentifiées attendent un header `Authorization: Bearer <accessToken>`, avec le token d'accès renvoyé par l'inscription/connexion/refresh. Ce token est de courte durée (15 minutes) ; une fois expiré, appelle `POST /users/refresh` (pas de corps - il lit le cookie `httpOnly` `refreshToken` posé par l'inscription/connexion/refresh) pour en obtenir un nouveau sans redemander de reconnexion.

Une documentation interactive et explorable, générée à partir de ces mêmes routes, est servie à `/api-docs/` (document OpenAPI brut à `/api-docs.json`) - une requête vers `/api-docs` sans le slash final redirige vers cette adresse.

| Méthode | Route             | Auth                         | Description                                                                                                                                                                                                 |
| ------- | ----------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST    | `/users/signup`   | —                            | Créer un compte. Corps : `email`, `password` (6 caractères min.), `username`, `newsletter` (optionnel).                                                                                                     |
| POST    | `/users/login`    | —                            | Se connecter. Corps : `email`, `password`.                                                                                                                                                                  |
| POST    | `/users/refresh`  | —                            | Pas de corps - lit le cookie `refreshToken`. Le fait tourner et renvoie un nouveau `accessToken`. `401` si le cookie est absent, inconnu, expiré, ou déjà remplacé par rotation.                            |
| POST    | `/users/logout`   | —                            | Pas de corps - lit le cookie `refreshToken` s'il existe et l'invalide, puis efface le cookie. Répond toujours `200`, même sans aucun cookie.                                                                |
| GET     | `/users/:id`      | —                            | Récupérer le profil public d'un utilisateur (`_id`, `account.username`, `account.avatar`, `newsletter`).                                                                                                    |
| PUT     | `/users/:id`      | ✅ (soi-même uniquement)     | Remplacer son profil. `multipart/form-data` : `username` (requis), `avatar` (fichier, optionnel) et `newsletter` optionnels — omettre `avatar` le laisse inchangé, il n'est jamais vidé implicitement.      |
| PATCH   | `/users/:id`      | ✅ (soi-même uniquement)     | Modifier partiellement son profil — n'envoyer que `username`, `avatar` et/ou `newsletter`.                                                                                                                  |
| DELETE  | `/users/:id`      | ✅ (soi-même uniquement)     | Supprimer son propre compte, avec suppression en cascade de toutes ses annonces (et leurs images Cloudinary).                                                                                               |
| POST    | `/offers/publish` | ✅                           | Publier une annonce. `multipart/form-data` : `title`, `description`, `price`, `brand`, `size`, `color`, `condition`, `city`, un fichier `picture` obligatoire, et jusqu'à 5 fichiers `pictures` optionnels. |
| GET     | `/offers`         | —                            | Lister les annonces. Paramètres de requête : `title`, `priceMin`, `priceMax`, `sort` (`price-asc` \| `price-desc`, croissant par défaut), `page` (défaut 1, 20 par page).                                   |
| GET     | `/offers/:id`     | —                            | Récupérer une annonce.                                                                                                                                                                                      |
| PUT     | `/offers/:id`     | ✅ (propriétaire uniquement) | Remplacer une annonce. Même corps que `publish` — l'ensemble des champs est requis, `picture` inclus ; omettre `pictures` vide les images secondaires.                                                      |
| PATCH   | `/offers/:id`     | ✅ (propriétaire uniquement) | Modifier partiellement une annonce — n'envoyer que les champs à changer. `pictures`, si envoyé, remplace tout le lot d'images secondaires ; `picture` et `pictures` sont indépendants l'un de l'autre.      |
| DELETE  | `/offers/:id`     | ✅ (propriétaire uniquement) | Supprimer une annonce et toutes ses images Cloudinary.                                                                                                                                                      |

### Exemples

Inscription :

```bash
curl -i -X POST http://localhost:3000/users/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"secret123","username":"jane"}'
```

```
Set-Cookie: refreshToken=h8g7f6e5d4c3b2a1...; Path=/users; HttpOnly; SameSite=Lax
```

```json
{
    "_id": "66f1a2b3c4d5e6f7a8b9c0d1",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "account": { "username": "jane" }
}
```

Obtenir un nouveau token d'accès une fois expiré (pas de corps - le refresh token ne circule que dans le cookie posé ci-dessus) :

```bash
curl -X POST http://localhost:3000/users/refresh \
  -H "Cookie: refreshToken=h8g7f6e5d4c3b2a1..."
```

Publier une annonce (propriétaire uniquement, `multipart/form-data` ; `pictures` peut être répété jusqu'à 5 fois pour les images secondaires) :

```bash
curl -X POST http://localhost:3000/offers/publish \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -F "title=Veste en jean vintage" \
  -F "description=Bon état, portée quelques fois" \
  -F "price=25" \
  -F "brand=Levi's" \
  -F "size=M" \
  -F "color=Bleu" \
  -F "condition=Bon état" \
  -F "city=Paris" \
  -F "picture=@veste.jpg" \
  -F "pictures=@veste-dos.jpg" \
  -F "pictures=@veste-etiquette.jpg"
```

Rechercher des annonces :

```bash
curl "http://localhost:3000/offers?title=veste&priceMin=10&priceMax=50&sort=price-asc&page=1"
```

```json
{
    "count": 1,
    "page": 1,
    "totalPages": 1,
    "offers": [
        {
            "_id": "66f1a2b3c4d5e6f7a8b9c0d2",
            "name": "Veste en jean vintage",
            "price": 25,
            "details": {
                "brand": "Levi's",
                "size": "M",
                "color": "Bleu",
                "condition": "Bon état",
                "city": "Paris"
            },
            "image": { "secure_url": "https://res.cloudinary.com/..." },
            "pictures": [
                {
                    "secure_url": "https://res.cloudinary.com/.../veste-dos.jpg"
                },
                {
                    "secure_url": "https://res.cloudinary.com/.../veste-etiquette.jpg"
                }
            ],
            "owner": { "_id": "...", "account": { "username": "jane" } }
        }
    ]
}
```

Les réponses d'erreur ont toujours cette forme :

```json
{ "message": "Title is mandatory" }
```

## Démarrage

**Prérequis** : Node.js 18+, une base MongoDB (par exemple un cluster gratuit [MongoDB Atlas](https://www.mongodb.com/atlas)), et un compte gratuit [Cloudinary](https://cloudinary.com/) pour l'hébergement d'images.

```bash
git clone https://github.com/dan0203/vinted-backend.git
cd vinted-backend
npm install
cp .env.example .env
# renseigner .env — voir ci-dessous
npm start
```

Le serveur se connecte à MongoDB et à Cloudinary au démarrage, et refuse de démarrer si la connexion à la base échoue.

### Variables d'environnement

| Variable                | Description                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MONGODB_URI`           | Chaîne de connexion MongoDB (le cluster uniquement — le nom de la base `vinted` est défini dans le code via l'option `dbName` de Mongoose, donc ne pas inclure de nom de base ni de slash final dans l'URI). |
| `CLOUDINARY_CLOUD_NAME` | Depuis ton tableau de bord Cloudinary.                                                                                                                                                                       |
| `CLOUDINARY_API_KEY`    | Depuis ton tableau de bord Cloudinary.                                                                                                                                                                       |
| `CLOUDINARY_API_SECRET` | Depuis ton tableau de bord Cloudinary — à garder secret, ne jamais committer.                                                                                                                                |
| `JWT_SECRET`            | Secret utilisé pour signer/vérifier les tokens d'accès — à garder secret, ne jamais committer.                                                                                                               |
| `PORT`                  | Optionnel, `3000` par défaut.                                                                                                                                                                                |

`.env` est ignoré par Git ; `.env.example` documente les noms de variables attendus. Si tu déploies un jour cette API (Render, Railway, etc.), renseigne ces mêmes variables dans les réglages d'environnement/secrets de cette plateforme — rien de spécifique à préfixer ici, puisque c'est un backend Node/Express classique utilisant `dotenv` (contrairement à un frontend Vite ou Create React App, où une variable doit être préfixée `VITE_`/`REACT_APP_` pour être exposée au navigateur).

## Sécurité

- Les mots de passe sont hashés avec **bcrypt** (10 tours de salage) — jamais stockés ni renvoyés en clair.
- L'authentification repose sur un token d'accès JWT de courte durée (15 minutes), vérifié à chaque requête vers une route protégée via le middleware `isAuthenticated`, plus un refresh token tournant délivré uniquement dans un cookie `httpOnly` (jamais dans un corps JSON) - chaque `POST /users/refresh` le remplace, donc un refresh token émis précédemment cesse immédiatement de fonctionner dès qu'un nouveau est émis.
- La propriété est vérifiée côté serveur, de façon atomique avec l'écriture elle-même (un seul `findOneAndUpdate`/`findOneAndDelete` filtré par `{ _id, owner }`) : une annonce qui existe mais appartient à quelqu'un d'autre renvoie `404`, comme une annonce inexistante, pour qu'un non-propriétaire ne puisse pas distinguer les deux cas. Les routes de compte (`PUT`/`PATCH`/`DELETE /users/:id`) renvoient `403` à la place pour le même cas — `GET /users/:id` étant déjà public, cacher l'existence d'un compte n'apporterait rien ici.
- Joi valide et nettoie les entrées de toutes les routes avant qu'elles n'atteignent la base de données.
- L'endpoint de recherche par titre échappe les caractères spéciaux de regex avant de construire le pattern de recherche, fermant un vecteur de ReDoS (une chaîne fournie par l'utilisateur, utilisée telle quelle comme source de regex, peut déclencher un backtracking catastrophique).
- Le gestionnaire d'erreur global renvoie un message générique `Internal server error` pour les erreurs inattendues et journalise l'erreur réelle uniquement côté serveur — aucune stack trace ni détail interne ne fuite jamais au client.
- Les champs de réponse Cloudinary potentiellement sensibles (comme `api_key`) sont volontairement exclus du schéma d'image stocké.

## Limitations connues / pistes d'amélioration

- **CORS / taille des payloads** : `cors()` accepte actuellement n'importe quelle origine, et `express.json()` n'a pas de limite de taille explicite. C'est acceptable pour un projet démo/portfolio, mais un déploiement en production devrait restreindre CORS à des origines précises et plafonner la taille des requêtes.
- **Couverture de tests partielle** : une suite Jest/Supertest couvre les routes `user` et `offers` — inscription/connexion, vérifications de propriété, filtrage, erreurs de validation, le champ multi-images `pictures`, le nettoyage PUT/PATCH/DELETE — avec une instance MongoDB isolée en mémoire (`mongodb-memory-server`), sans aucune base de test partagée. Cloudinary lui-même est mocké (`utils/cloudinary.js`), donc les vrais appels réseau à l'API Cloudinary ne sont pas exercés.
- **Indexation partielle** : `price` a désormais un index (ajouté pour accélérer le tri et le filtrage par fourchette de prix à mesure que le volume de données grandit). `name` n'en a pas — la recherche par titre utilise un regex non ancré et insensible à la casse (`new RegExp(escapeRegex(title), 'i')`), qu'un index classique ne peut pas accélérer. Une vraie solution serait un [index texte](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-text/) MongoDB avec l'opérateur `$text`, ou un moteur de recherche dédié (Atlas Search) — un vrai changement d'implémentation, pas juste un index à ajouter.

## Historique du projet

39 commits répartis en deux phases, visibles dans l'historique : une première version en mars 2026 (API de base, validation Joi/manuelle, upload Cloudinary, vérifications de propriété), puis une passe de consolidation dédiée en septembre 2026 (migration vers bcrypt, correction du ReDoS, un vrai bug trouvé et corrigé dans le middleware d'erreur global, ESLint/Prettier, CI, `.env.example`). Workflow en une seule branche — pas de branches de fonctionnalité sur ce projet-ci, mais des messages de commit descriptifs et des changements ciblés.

## Projet lié

[vinted-frontend](https://github.com/dan0203/vinted-frontend) est un client React construit à l'origine sur les routes `/users/*`/`/offers/*` de cette API — à noter que son étape de paiement appelle directement l'endpoint de paiement partagé du Réacteur plutôt que ce backend, donc le flux de paiement n'est pas autoporté de bout en bout. La forme des réponses `offers` a été renommée depuis (voir [Référence de l'API](#référence-de-lapi)) ; le frontend n'a pas encore été mis à jour en conséquence.

## Licence

[MIT](./LICENSE)

---

Développé par [Dan Zerbib](https://github.com/dan0203) — [portfolio](https://dan0203.github.io)
