# Rapport Pro Web — déploiement sur Vercel

Ce dossier contient la version web de l'application (multi-utilisateurs,
avec compte email/mot de passe), prête à être poussée sur votre dépôt
GitHub puis déployée sur Vercel.

## 1. Architecture (pour comprendre ce qui a changé)

- **Frontend** : `public/` — HTML/CSS/JS pur, aucune compilation nécessaire.
  Servi tel quel par Vercel comme site statique.
- **Backend** : `api/index.py` — une API Flask, déployée comme fonction
  serverless Python par Vercel. Toutes les routes `/api/...` y sont gérées.
  **Ce fichier est volontairement unique et autonome** (base de données,
  authentification, stockage des logos, génération du .docx et même le
  modèle Word embarqué en base64 y sont tous regroupés) : le runtime Python
  de Vercel ne déploie que le fichier de la fonction lui-même et n'embarque
  pas automatiquement des fichiers ou dossiers voisins (un `api/_lib/`, un
  `templates/` séparé...). Avoir tout dans un seul fichier élimine ce risque
  une fois pour toutes — c'est moins élégant à lire, mais fiable.
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
  copie encodée en base64 directement dans `api/index.py` (constante
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
  `api/index.py` par le contenu de ce fichier.

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
3. Vercel détecte le fichier `vercel.json` à la racine : laissez les
   réglages par défaut ("Other" / aucun framework), ne changez ni le
   *Build Command* ni l'*Output Directory*.
4. Cliquez **Deploy**. Le premier déploiement va fonctionner pour la partie
   statique et l'API, mais l'inscription/connexion échouera tant que la
   base de données n'est pas créée (étape suivante) — c'est normal.

## 4. Créer la base de données (Vercel Postgres)

1. Dans votre projet Vercel, onglet **Storage → Create Database → Postgres**
   (offre gratuite "Hobby" largement suffisante pour démarrer).
2. Une fois créée, Vercel propose de la **relier au projet** (bouton
   "Connect Project") : acceptez. Cela ajoute automatiquement les variables
   d'environnement `POSTGRES_URL` / `DATABASE_URL` dont `api/_lib/db.py` a
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
   utilisée par `api/_lib/blob.py` pour l'upload des logos.

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
python3 api/index.py
```

L'app tourne alors sur `http://127.0.0.1:5000`, avec une base SQLite locale
(aucune configuration requise) et un dossier `/tmp/rapport_pro_blobs` pour
les logos. Ouvrez simplement `public/index.html` dans un navigateur après
avoir adapté les appels `fetch()` si besoin, ou plus simplement servez tout
le dossier avec Flask directement sur `http://127.0.0.1:5000/`.

## 9. Note sur `vercel.json` (si vous le modifiez un jour)

`vercel.json` contient une règle `rewrites` explicite qui envoie
uniquement les chemins `/api/...` vers `api/index.py` :

```json
{
  "outputDirectory": "public",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.py" }
  ]
}
```

Cette règle est nécessaire : sans elle, Vercel traite parfois la fonction
Python comme gestionnaire par défaut de **toutes** les routes non
reconnues, y compris `/` — ce qui fait que Flask répond avec son propre
404 ("Not Found / The requested URL was not found on the server") à la
place de la page d'accueil statique (`public/index.html`). Avec cette
règle, seules les requêtes commençant par `/api/` sont envoyées à Flask
(qui reçoit bien le chemin complet d'origine, ex. `/api/auth/login`, pas
le chemin de destination de la règle) ; tout le reste (`/`, `/app.js`,
`/styles.css`, etc.) est servi normalement comme fichier statique depuis
`public/`.

Si un jour `/api/...` se met à retourner un 404 générique Flask alors que
la route existe bien dans `api/index.py`, vérifiez que cette règle
`rewrites` est toujours présente et orthographiée exactement ainsi.

La seule route qui en dépendrait (`/local-blob/<key>`, utilisée pour
resservir un logo en développement local sans compte Vercel Blob) n'est
donc disponible qu'en local (`python3 api/index.py`), pas en production —
sans incidence une fois Vercel Blob relié au projet (étape 5), puisque
cette route n'est alors jamais utilisée.

## 10. En cas d'erreur « 404 NOT_FOUND » sur la page (page Vercel, pas Flask)

Si c'est la page d'erreur **de Vercel** (pas celle de Flask) qui s'affiche
sur la page d'accueil :

1. Dans **Project Settings → General → Build & Development Settings**,
   vérifiez que *Output Directory* vaut `public` (ou *Automatic*).
2. Repoussez le code et relancez un déploiement (**Deployments → ⋯ → Redeploy**).
3. Dans l'onglet **Deployments → [déploiement] → Functions**, `api/index.py`
   doit être listée : si elle n'apparaît pas, regardez l'onglet **Build
   Logs** pour une erreur d'installation de dépendances.

## 11. Limites connues de cette version web

- **Pas de génération PDF côté serveur** : la conversion .docx → PDF que
  faisait l'app de bureau s'appuyait sur Word ou LibreOffice installés sur
  votre machine ; ce n'est pas disponible sur l'hébergement serverless
  Vercel. Le bouton "Générer le rapport" télécharge directement le .docx,
  que chacun peut ouvrir et, si besoin, exporter en PDF depuis Word.
- **Signatures et photos** ne sont pas conservées entre deux rapports : il
  faut les refournir (ou redessiner la signature) à chaque génération,
  comme avec l'app de bureau.
