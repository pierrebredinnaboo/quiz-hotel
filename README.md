# Hotel Quiz Game 🏨

Application de quiz interactive sur les groupes hôteliers avec mode solo et multijoueur.

## 🚀 Déploiement sur Railway

### Prérequis
- Compte [Railway](https://railway.app)
- Compte GitHub
- Clé API Google Gemini

### Étapes de Déploiement

#### 1. Créer un Repository GitHub
```bash
# Initialiser Git
git init
git add .
git commit -m "Initial commit"

# Créer un repo sur GitHub, puis :
git remote add origin https://github.com/VOTRE_USERNAME/quiz-hotel.git
git branch -M main
git push -u origin main
```

#### 2. Déployer sur Railway
1. Aller sur [railway.app](https://railway.app)
2. Cliquer sur "New Project"
3. Sélectionner "Deploy from GitHub repo"
4. Choisir votre repository `quiz-hotel`
5. Railway détectera automatiquement le monorepo et créera 2 services :
   - `server` (backend)
   - `client` (frontend)

#### 3. Configurer les Variables d'Environnement

**Service `server` :**
- `GEMINI_API_KEY` : Votre clé API Google Gemini
- `PORT` : 3000 (défini automatiquement par Railway)
- `NODE_ENV` : production

**Service `client` :**
- `VITE_SOCKET_URL` : URL de votre service server (ex: `https://server-production-xxxx.up.railway.app`)

#### 4. Déploiement Automatique
Railway redéploie automatiquement à chaque push sur `main` :
```bash
git add .
git commit -m "Mise à jour"
git push
```

## 📁 Structure du Projet
```
quiz-hotel/
├── client/          # Frontend React + Vite
├── server/          # Backend Node.js + Socket.IO
├── .gitignore
└── railway.json
```

## 🛠️ Développement Local

### Installation
```bash
# Server
cd server
npm install
cp .env.example .env  # Ajouter votre GEMINI_API_KEY

# Client
cd ../client
npm install
cp .env.example .env
```

### Lancement
```bash
# Terminal 1 - Server
cd server
npm run dev

# Terminal 2 - Client
cd client
npm run dev
```

## 🎮 Fonctionnalités
- Mode Solo avec leaderboard quotidien
- Mode Multijoueur avec room codes
- Questions générées par IA (Google Gemini)
- Questions multi-select
- Configuration du nombre de questions (5-25)
- Sélection de groupes hôteliers
- Timer dynamique
- Système de streak et scoring

## 📝 License
MIT
