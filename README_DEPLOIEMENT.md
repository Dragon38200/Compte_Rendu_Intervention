# Rapport Pro Web — déploiement sur Vercel

Ce dossier contient la version web de l'application (multi-utilisateurs,
avec compte email/mot de passe), prête à être poussée sur votre dépôt
GitHub puis déployée sur Vercel.

## 1. Architecture (pour comprendre ce qui a changé)

- **Frontend** : `public/` — HTML/CSS/JS pur, aucune compilation nécessaire.
  Vercel sert automatiquement tout fichier placé dans `public/**` comme
  fichier statique, à son chemin d'origine (`public/index.html` → `/`,
  `public/app.js` → `/app.js`, etc.).
- **Backend** : `index.py` **à la racine du dépôt** (pas dans un sous-dossier
  `api/`) — une API Flask détectée automatiquement par Vercel ("Flask
  framework preset"). C'est important : Vercel ne reconnaît ce mode
  automatique que si le fichier exportant l'objet Flask `app` s'appelle
  `index.py` (ou `app.py`/`main.py`/`server.py`/`wsgi.py`/`asgi.py`) et se
  trouve **à la racine** (ou dans `src/`/`app/`). Placé dans `api/`, Vercel
  bascule dans un autre mode ("fonction par fichier") où `api/index.py` ne
  répond qu'à l'URL exacte `/api` et pas à ses sous-routes comme
  `/api/auth/login` — ce qui provoque des 404 sur toutes les routes de
  l'API. Avec `index.py` à la racine, Flask gère toutes les requêtes qui ne
  correspondent pas à un fichier statique de `public/`, donc toutes les
  routes `/api/...` fonctionnent normalement.
  **Ce fichier est volontairement unique et autonome** (base de données,
  authentification, stockage des logos, génération du .docx et même le
  modèle Word embarqué en base64 y sont tous regroupés), pour éviter tout
  risque lié à des imports de fichiers voisins — c'est moins élégant à
  lire, mais fiable.
- **Aucun `vercel.json` n'est nécessaire** pour ce projet : la détection
  Flask + la convention `public/**` suffisent, sans configuration de
  routes ou de rewrites.
- **Base de données** : PostgreSQL (via Vercel Postgres, gratuit en petit
  volume), pour les comptes, clients, sites, techniciens et logos. En
  développement local sans base configurée, l'app bascule automatiquement
  sur un fichier SQLite (`/tmp/rapport_pro_dev.db`) — rien à installer pour
  tester en local.
- **Stockage fichiers** : Vercel Blob, pour les logos enregistrés dans la
  bibliothèque (un espace serverless n'a pas de disque persistant entre deux
  requêtes). Les photos et signatures d'un rapport, elles, ne sont jamais
  stockées : elles transitent seulement le temps de générer le .docx.
- **Génération du rapport** : logique identique à l'application de bureau,
  portée sans dépendance à Qt.
- **Modèle Word** (`templates/Fond de Page Rapport.docx`) : conservé dans le
  dépôt pour référence, mais la fonction déployée utilise en réalité une
  copie encodée en base64 directement dans `index.py` (constante
  `_TEMPLATE_DOCX_B64`), pour la même raison de fiabilité de déploiement.
  **Si vous changez un jour ce modèle Word**, il faut régénérer cette
  constante :
  ```bash
  python3 -c "
  import base64
  with open('templates/Fond de Page Rapport.docx', 'rb') as f:
      print(base64.b64encode(f.read()).decode())
  " > /tmp/nouveau_b64.txt
  ```
  puis remplacer le contenu de `_TEMPLATE_DOCX_B64 = "..."` dans
  `index.py` par le contenu de ce fichier.

Chaque utilisateur a son propre compte (email + mot de passe) et sa propre
bibliothèque clients/techniciens/logos, isolée des autres comptes.

## 2. Pousser le code sur GitHub

Depuis ce dossier (`rapport-pro-web`) :

```bash
git init
git add .
git commit -m "Version web initiale de Rapport Pro"
git branch -M main
git remote add origin https://github.com/<votre-compte>/<votre-repo>.git
git push -u origin main
```

(remplacez l'URL par celle de votre dépôt GitHub déjà créé).

## 3. Importer le projet sur Vercel

1. Sur [vercel.com](https://vercel.com), **Add New → Project**.
2. Choisissez votre dépôt GitHub `rapport-pro-web`.
3. Vercel détecte automatiquement `index.py` comme application Flask et
   `public/` comme dossier de fichiers statiques : laissez les réglages
   par défaut (Framework Preset sur *Other*, Build Command et Output
   Directory vides/automatiques — ne forcez pas *Output Directory* sur
   `public`, cela peut interférer avec la détection Flask).
4. Cliquez **Deploy**. Le premier déploiement va fonctionner pour la partie
   statique et l'API, mais l'inscription/connexion échouera tant que la
   base de données n'est pas créée (étape suivante) — c'est normal.

## 4. Créer la base de données (Vercel Postgres)

1. Dans votre projet Vercel, onglet **Storage → Create Database → Postgres**
   (offre gratuite "Hobby" largement suffisante pour démarrer).
2. Une fois créée, Vercel propose de la **relier au projet** (bouton
   "Connect Project") : acceptez. Cela ajoute automatiquement les variables
   d'environnement `POSTGRES_URL` / `DATABASE_URL` dont `index.py` a
   besoin — vous n'avez rien à copier-coller.
3. Toujours dans l'onglet Storage de la base, ouvrez **Query** (ou
   connectez-vous avec `psql` via la chaîne de connexion fournie), puis
   collez-y le contenu du fichier `schema.sql` de ce dossier et exécutez-le.
   Cela crée les tables `users`, `clients`, `sites`, `techniciens`, `logos`.
   **Cette étape n'est à faire qu'une seule fois.**

## 5. Créer le stockage de fichiers (Vercel Blob)

1. Toujours dans **Storage → Create Database → Blob**.
2. Reliez-le au projet de la même façon ("Connect Project"). Cela ajoute
   automatiquement la variable d'environnement `BLOB_READ_WRITE_TOKEN`
   utilisée par `index.py` pour l'upload des logos.

## 6. Variable d'environnement de sécurité (obligatoire)

Dans **Project Settings → Environment Variables**, ajoutez :

| Nom | Valeur |
|---|---|
| `JWT_SECRET` | une longue chaîne aléatoire (ex: générez-la avec `openssl rand -hex 32`) |

Cette clé signe les sessions de connexion. Sans elle, l'app utilise une
valeur par défaut non sécurisée — **ne déployez pas en production sans
l'avoir changée**.

## 7. Redéployer

Après avoir relié Postgres et Blob et ajouté `JWT_SECRET`, retournez dans
l'onglet **Deployments** et relancez un déploiement ("Redeploy") pour que
les nouvelles variables d'environnement soient prises en compte.

Votre application est alors disponible à l'URL fournie par Vercel
(`https://<votre-projet>.vercel.app`), avec un nom de domaine personnalisé
possible depuis **Project Settings → Domains** si vous en avez un.

## 8. Tester en local avant de pousser une modification

```bash
pip install -r requirements.txt
python3 index.py
```

L'app tourne alors sur `http://127.0.0.1:5000`, avec une base SQLite locale
(aucune configuration requise) et un dossier `/tmp/rapport_pro_blobs` pour
les logos. Ouvrez simplement `public/index.html` dans un navigateur après
avoir adapté les appels `fetch()` si besoin, ou plus simplement servez tout
le dossier avec Flask directement sur `http://127.0.0.1:5000/`.

## 9. Pourquoi il ne faut PAS de `api/index.py` ni de `vercel.json` pour ce projet

Ce projet ne contient **aucun `vercel.json`**, volontairement. Vercel
propose deux façons différentes de déployer du Python, et il ne faut pas
les mélanger :

- **Détection de framework (celle utilisée ici)** : si un fichier nommé
  `index.py`, `app.py`, `main.py`, `server.py`, `wsgi.py` ou `asgi.py` est
  présent **à la racine** du dépôt (ou dans `src/`/`app/`) et exporte un
  objet Flask `app`, Vercel route **toutes** les requêtes qui ne
  correspondent pas à un fichier de `public/**` vers cette application.
  Toutes les routes définies avec `@app.get(...)`, `@app.post(...)`, etc.
  fonctionnent alors normalement, y compris leurs sous-chemins
  (`/api/auth/login`, `/api/clients/12`, ...).
- **Fonctions fichier par fichier (`/api/*.py`)** : si ce même fichier est
  placé dans un dossier `api/`, Vercel bascule dans un mode différent où
  chaque fichier `.py` de `api/` devient une fonction indépendante,
  accessible **uniquement à son chemin de fichier exact** — `api/index.py`
  répond alors seulement à `/api`, jamais à `/api/auth/login` et consorts,
  qui renvoient un 404. C'est l'erreur qui s'est produite ici après une
  tentative de rangement dans `api/` : visuellement plus propre, mais
  incompatible avec une API Flask qui gère elle-même son routage interne.

**Résumé** : gardez `index.py` à la racine, ne le déplacez jamais dans un
dossier `api/`, et n'ajoutez pas de `vercel.json` avec des `rewrites` ou un
`outputDirectory` — la détection automatique de Flask + la convention
`public/**` suffisent et fonctionnent ensemble sans aucune configuration.

La route `/local-blob/<key>` (resservir un logo en développement local
sans compte Vercel Blob) n'est disponible qu'en local
(`python3 index.py`), pas en production — sans incidence une fois Vercel
Blob relié au projet (étape 5), puisque cette route n'est alors jamais
utilisée.

## 10. En cas d'erreur 404 sur la page d'accueil ou sur l'API

- Si c'est la page d'erreur **de Vercel** ("404: NOT_FOUND", avec un ID
  d'erreur) qui s'affiche sur la page d'accueil : dans **Project Settings
  → General → Build & Development Settings**, vérifiez que *Output
  Directory* est sur **Automatic / vide** (pas forcé sur `public`), et que
  rien ne force un *Build Command*. Redéployez ensuite.
- Si c'est le 404 **de Flask** ("Not Found — The requested URL was not
  found on the server...") qui s'affiche, que ce soit sur `/` ou sur une
  route `/api/...` qui existe pourtant dans `index.py` : vérifiez que
  `index.py` est bien à la racine du dépôt (pas dans `api/`) et qu'aucun
  `vercel.json` ne redéfinit le routage (voir section 9).
- Dans tous les cas, l'onglet **Deployments → [déploiement] → Functions**
  doit lister une fonction correspondant à `index.py` : si elle n'apparaît
  pas, regardez l'onglet **Build Logs** pour une erreur d'installation de
  dépendances.

## 11. Limites connues de cette version web

- **Pas de génération PDF côté serveur** : la conversion .docx → PDF que
  faisait l'app de bureau s'appuyait sur Word ou LibreOffice installés sur
  votre machine ; ce n'est pas disponible sur l'hébergement serverless
  Vercel. Le bouton "Générer le rapport" télécharge directement le .docx,
  que chacun peut ouvrir et, si besoin, exporter en PDF depuis Word.
- **Signatures et photos** ne sont pas conservées entre deux rapports : il
  faut les refournir (ou redessiner la signature) à chaque génération,
  comme avec l'app de bureau.
