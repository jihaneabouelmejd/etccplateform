# 🚂 Déploiement ETCC sur Railway

## Vue d'ensemble

```
Railway Project
├── Service: etcc-backend   (NestJS — Root directory: backend/)
├── Service: etcc-frontend  (Next.js — Root directory: frontend/)
└── Plugin:  PostgreSQL     (base de données auto-gérée)
```

---

## Étape 1 — Prérequis

1. Créer un compte sur [railway.app](https://railway.app)
2. Pusher le code sur GitHub (repo privé ou public)
3. Installer Railway CLI (optionnel) : `npm i -g @railway/cli`

---

## Étape 2 — Créer le projet Railway

1. Sur [railway.app/new](https://railway.app/new) → **Deploy from GitHub repo**
2. Sélectionner le repo `etcc-platform`
3. Railway va détecter automatiquement le projet

---

## Étape 3 — Ajouter le service Backend

Dans le projet Railway → **New Service** → **GitHub Repo** → même repo

**Settings → General :**
- **Service Name** : `etcc-backend`
- **Root Directory** : `backend`

**Settings → Build :**
- Build Command : *(laisse vide, nixpacks.toml s'en charge)*
- Start Command : `npx prisma migrate deploy && PUPPETEER_EXECUTABLE_PATH=$(which chromium) node dist/main`

---

## Étape 4 — Ajouter PostgreSQL

Dans le projet → **New** → **Database** → **PostgreSQL**

Railway génère automatiquement `DATABASE_URL` — il sera injecté dans les services.

---

## Étape 5 — Variables d'environnement du Backend

Dans **etcc-backend** → **Variables** → ajouter :

```env
# ───── App ─────
NODE_ENV=production
PORT=4000
APP_URL=https://etcc-backend-XXXX.up.railway.app   ← ton URL backend Railway
FRONTEND_URL=https://etcc-frontend-XXXX.up.railway.app  ← ton URL frontend Railway

# ───── JWT ─────
JWT_SECRET=CHANGE_MOI_CLE_SECRETE_MIN_32_CHARS
JWT_EXPIRATION=15m
JWT_REFRESH_SECRET=AUTRE_CLE_REFRESH_DIFFERENTE
JWT_REFRESH_EXPIRATION=7d

# ───── Database ─────
# DATABASE_URL est injecté automatiquement par le plugin PostgreSQL

# ───── Uploads ─────
UPLOADS_PATH=/data/uploads

# ───── Puppeteer (Chromium Linux) ─────
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium

# ───── Bcrypt ─────
BCRYPT_ROUNDS=10

# ───── Admin initial (1ère fois seulement) ─────
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=TonMotDePasseAdmin!
INITIAL_ADMIN_FIRSTNAME=Admin
INITIAL_ADMIN_LASTNAME=ETCC
```

> **Note** : Les URLs `XXXX.up.railway.app` s'affichent dans Railway après le premier déploiement.
> Mets à jour `APP_URL` et `FRONTEND_URL` après avoir récupéré ces URLs.

---

## Étape 6 — Ajouter un Volume pour les fichiers uploadés

> Sans volume, les fichiers (reçus, BL signés, etc.) sont perdus à chaque redémarrage.

Dans **etcc-backend** → **Volumes** → **Add Volume** :
- **Mount Path** : `/data/uploads`
- Railway créera un volume persistant

Puis définir la variable : `UPLOADS_PATH=/data/uploads`

---

## Étape 7 — Ajouter le service Frontend

**New Service** → **GitHub Repo** → même repo

**Settings → General :**
- **Service Name** : `etcc-frontend`
- **Root Directory** : `frontend`

**Variables → ajouter :**

```env
NODE_ENV=production
PORT=3000
BACKEND_URL=https://etcc-backend-XXXX.up.railway.app  ← URL interne backend
```

> **Astuce Railway** : Utilise la **référence de variable interne** au lieu de copier l'URL :
> Dans la variable `BACKEND_URL` du frontend → cliquer sur **Reference Variable** →
> sélectionner **etcc-backend** → **RAILWAY_PRIVATE_DOMAIN**
> Résultat : `http://${{etcc-backend.RAILWAY_PRIVATE_DOMAIN}}`
> (Plus rapide et sur le réseau privé Railway)

---

## Étape 8 — Déployer

1. Dans chaque service → **Deploy** → Railway build et démarre automatiquement
2. Le backend exécute `prisma migrate deploy` automatiquement au démarrage
3. Vérifier les logs pour `🍯 ETCC API running`

---

## Étape 9 — Premier accès

1. Aller sur l'URL du **frontend** (ex: `https://etcc-frontend-XXXX.up.railway.app`)
2. Se connecter avec :
   - Username : `admin` (ou `INITIAL_ADMIN_USERNAME`)
   - Password : `TonMotDePasseAdmin!`
3. Changer le mot de passe dans **Paramètres → Employés**

---

## Résolution de problèmes fréquents

### ❌ "Chromium introuvable" (PDFs ne se génèrent pas)
```
# Ajouter dans les variables du backend :
PUPPETEER_EXECUTABLE_PATH=$(which chromium)
```
Ou dans le Start Command Railway :
```
npx prisma migrate deploy && PUPPETEER_EXECUTABLE_PATH=$(which chromium) node dist/main
```

### ❌ Erreur CORS (frontend ne peut pas appeler le backend)
Vérifier que `FRONTEND_URL` dans le backend correspond exactement à l'URL Railway du frontend.

### ❌ Fichiers uploadés perdus après redémarrage
Configurer un Volume Railway (Étape 6) et définir `UPLOADS_PATH=/data/uploads`.

### ❌ "prisma migrate" échoue
S'assurer que `DATABASE_URL` est bien injecté depuis le plugin PostgreSQL.
Aller dans **Variables** du backend → cliquer **Reference Variable** → sélectionner la variable `DATABASE_URL` du plugin PostgreSQL.

### ❌ Cookie refresh_token non transmis
En production, Railway utilise HTTPS. La variable `NODE_ENV=production` est requise pour que
les cookies soient envoyés avec `Secure=true; SameSite=None`.

---

## Architecture de production

```
Internet
    │
    ▼
etcc-frontend (Next.js) ──── /api/* (rewrite) ────▶ etcc-backend (NestJS)
    │                                                      │
    │                                               PostgreSQL Plugin
    │                                                      │
    └─────────────── Railway Private Network ──────────────┘
```

Les deux services communiquent via le réseau privé Railway (rapide, gratuit, sécurisé).

---

## Coûts Railway estimés

| Ressource       | Plan Hobby ($5/mois) |
|-----------------|----------------------|
| Backend NestJS  | ~$2-3/mois           |
| Frontend Next.js| ~$1-2/mois           |
| PostgreSQL      | ~$1/mois             |
| Volume 1GB      | ~$0.25/mois          |
| **Total**       | **~$5-7/mois**       |

> Le plan gratuit Railway a des limitations (sleep après inactivité).
> Le plan Hobby ($5/mois) est recommandé pour usage continu.
