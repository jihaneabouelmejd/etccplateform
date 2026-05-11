# 🍯 ETCC — Plateforme de gestion construction

> Plateforme bilingue (FR/AR) de gestion pour ETCC SARL avec thème Honey Light.

## 🎨 Palette de couleurs (Honey)

| Nom | HEX | Usage |
|-----|-----|-------|
| Cream | `#FDF6E9` | Background |
| Beige Soft | `#F5E6D3` | Borders |
| Beige | `#D3AF85` | Accents |
| Gold | `#F4B315` | CTAs primary |
| Orange | `#E59312` | Accents bright |
| Caramel | `#8E5915` | Text secondary |
| Brown | `#423738` | Text dark borders |
| Dark | `#1A141A` | Text primary |

## 📁 Structure du projet

```
etcc-platform/
├── frontend/          # Next.js 14 + TypeScript + Tailwind + shadcn/ui
│   └── src/
│       ├── app/       # App Router (pages)
│       ├── components/# Composants UI
│       ├── lib/       # Utilitaires
│       ├── types/     # Types TypeScript
│       └── hooks/     # Custom hooks React
│
├── backend/           # NestJS + Prisma + PostgreSQL
│   ├── src/
│   │   ├── modules/   # Modules (auth, users, invoices...)
│   │   ├── common/    # Guards, decorators, pipes
│   │   └── config/    # Configuration
│   └── prisma/        # Schema + migrations
│
└── docs/              # Documentation
```

## 🚀 Fonctionnalités

### Gestion opérationnelle
- 🏗️ **Chantiers** : budget, équipe, progression, photos
- ✅ **Tâches** : Kanban, Calendrier, progression 0-100%
- 👥 **Clients** : ICE, RC, score fiabilité, historique
- 🏢 **Fournisseurs** : RIB pour matching automatique
- 👷 **Employés** : performance, assignation

### Documents commerciaux
- 📄 **Devis** : réduction %, TVA 20%, PDF FR/AR
- 📋 **BC** : import OCR ou création interne
- 🚚 **BL** : auto-fill depuis Devis (sans prix), décrémentation stock
- 🧾 **Factures** : 2 onglets (émises/achat), signature électronique
- 📑 **Fusion PDF** : combiner BC+BL+Facture

### Finances
- 📦 **Stock** : seuils, mouvements, alertes
- 💰 **Dépenses** : validation Gérant, photos reçu
- 🏦 **Rapprochement bancaire** : matching automatique par RIB
- ⚠️ **Alertes factures manquantes** : virement/cash sans facture

### Système
- ⚙️ **Paramètres société** : Logo, ICE, RC, IF, CNSS, RIB
- ✍️ **Bibliothèque signatures** : réutilisables sur tous documents
- 👤 **Utilisateurs** : Admin crée login + password directement
- 🔔 **Notifications** : Email, Push, Règles personnalisées

## 👤 Rôles utilisateurs

| Rôle | Accès |
|------|-------|
| 👑 **Admin** | Tout + gestion utilisateurs |
| ⭐ **Gérant** | Opérationnel + commercial + validations |
| 📊 **Comptable** | Financier uniquement (pas de dépenses projet) |
| 👷 **Employé** | Ses tâches, dépenses, stock (lecture) |

## 🛠️ Stack technique

### Frontend
- **Next.js 14** (App Router)
- **TypeScript** strict
- **Tailwind CSS** + shadcn/ui
- **react-i18next** (FR/AR + RTL)
- **Zustand** (state)
- **TanStack Query** (data fetching)
- **react-hook-form** + Zod (forms)

### Backend
- **NestJS** (modular architecture)
- **Prisma ORM** + PostgreSQL 16
- **JWT** (15min) + Refresh token (httpOnly cookie)
- **bcrypt** (10 rounds) pour passwords
- **BullMQ** + Redis (background jobs)
- **Puppeteer** (PDF generation)
- **Mindee API** (OCR invoices)
- **S3/MinIO** (file storage)

### DevOps
- **Docker** + docker-compose
- **PostgreSQL 16**
- **Redis 7**

## 📖 Démarrage rapide

```bash
# 1. Installer les dépendances
cd frontend && npm install
cd ../backend && npm install

# 2. Configurer les variables d'environnement
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# 3. Démarrer PostgreSQL + Redis
docker-compose up -d

# 4. Migrations base de données
cd backend && npx prisma migrate dev && npx prisma db seed

# 5. Démarrer les serveurs
# Terminal 1 : backend
cd backend && npm run start:dev

# Terminal 2 : frontend
cd frontend && npm run dev
```

Frontend : http://localhost:3000
Backend : http://localhost:4000
API docs : http://localhost:4000/api

## 📝 Conventions

- **Commits** : Conventional Commits (feat, fix, chore, docs...)
- **Branches** : `main`, `dev`, `feature/xxx`, `fix/xxx`
- **Code style** : Prettier + ESLint
- **Tests** : Jest (backend) + Vitest (frontend)
