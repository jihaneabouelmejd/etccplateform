# 🍯 ETCC Platform — Guide de démarrage complet

## Prérequis
- Node.js 18+
- Docker + Docker Compose
- npm ou yarn

## 🚀 Démarrage en 5 minutes

### 1. Configurer les variables d'environnement
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### 2. Lancer PostgreSQL + Redis + MinIO
```bash
docker-compose up -d
```

### 3. Backend — installer et lancer
```bash
cd backend
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run start:dev
```
API disponible sur: http://localhost:4000/api
Swagger docs: http://localhost:4000/api/docs

### 4. Frontend — installer et lancer (nouveau terminal)
```bash
cd frontend
npm install
npm run dev
```
App disponible sur: http://localhost:3000

## 👤 Identifiants initiaux
| Rôle       | Login   | Password      |
|------------|---------|---------------|
| 👑 Admin    | admin   | Admin2026!    |
| ⭐ Gérant   | youssef | Youssef2026!  |
| 📊 Comptable| fatima  | Fatima2026!   |
| 👷 Employé  | karim   | Karim2026!    |

## 📡 API Endpoints principaux
```
POST   /api/auth/login
GET    /api/auth/me
POST   /api/auth/logout

GET    /api/devis
POST   /api/devis
GET    /api/devis/:id
PATCH  /api/devis/:id/status
GET    /api/devis/:id/lines-for-bl
POST   /api/bc/from-devis/:devisId
POST   /api/bl
GET    /api/invoices
POST   /api/invoices/from-bl

GET    /api/pdf/devis/:id?lang=FR
GET    /api/pdf/bl/:id?lang=AR
GET    /api/pdf/invoice/:id?lang=FR

GET    /api/stock/products
POST   /api/stock/products
POST   /api/rapprochement/import
GET    /api/alertes
```
