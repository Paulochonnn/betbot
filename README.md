# BetBot Simulator

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![AWS](https://img.shields.io/badge/AWS-Serverless-FF9900?logo=amazon-aws)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)
![License](https://img.shields.io/badge/licence-MIT-green)

Plateforme de simulation de paris sportifs pilotée par LLM. Le bot récupère des cotes sportives en temps réel, les analyse via un modèle de langage, et décide de placer ou non un pari simulé selon le **critère de Kelly**.

> ⚠️ Projet de simulation uniquement — aucun argent réel n'est engagé.

---

## Sommaire

- [Fonctionnement](#fonctionnement)
- [Critère de Kelly](#critère-de-kelly)
- [Architecture AWS](#architecture-aws)
- [Stack technique](#stack-technique)
- [Structure du projet](#structure-du-projet)
- [Coût estimé](#coût-estimé-aws)
- [Lancer en local](#lancer-en-local)
- [Licence](#licence)

---

## Fonctionnement

1. L'utilisateur crée un **bot** avec une stratégie personnalisée (system prompt) et des paramètres (bankroll, Kelly max, edge minimum)
2. Il déclenche manuellement une analyse depuis le dashboard
3. Lambda **Run Bot** récupère les cotes disponibles via The Odds API
4. Les matchs sont envoyés par chunks au LLM via OpenRouter
5. Le LLM analyse chaque match et retourne une décision (`BET` / `SKIP`) avec une probabilité estimée
6. Le **critère de Kelly** calcule la mise optimale selon la bankroll et l'edge détecté
7. Les décisions sont stockées dans RDS PostgreSQL et affichées sur le dashboard
8. L'utilisateur résout manuellement les paris une fois les matchs terminés

Plusieurs bots peuvent tourner en parallèle avec des stratégies différentes, permettant de comparer leurs performances dans le temps.

---

## Critère de Kelly

Le critère de Kelly est une formule mathématique qui calcule la fraction optimale de la bankroll à miser pour maximiser la croissance à long terme :

```
f = (b × p - q) / b
```

- `f` — fraction de la bankroll à miser
- `b` — cote nette (cote - 1)
- `p` — probabilité estimée de gagner
- `q` — probabilité estimée de perdre (1 - p)

Un paramètre `maxKelly` limite la mise maximale par pari pour contrôler le risque. Un paramètre `minEdge` filtre les paris sans valeur suffisante.

---

## Architecture AWS

![Architecture](docs/architecture.png)

### Composants

**Hors VPC**
- **CloudFront** — CDN mondial, point d'entrée HTTPS du dashboard
- **S3** — Stockage des fichiers statiques Next.js (accessible uniquement via CloudFront)
- **API Gateway** — Point d'entrée unique pour toutes les requêtes API REST

**VPC privé**
- **Lambda Bots** — CRUD des bots et leurs stratégies
- **Lambda Bets** — CRUD des paris individuels
- **Lambda Combined** — Gestion des paris combinés
- **Lambda Resolve** — Résolution et mise à jour des paris (lecture/écriture RDS uniquement)
- **Lambda Stats** — Statistiques et performances
- **Lambda Run Bot** — Cœur du système : récupération des cotes, analyse LLM, décision Kelly
- **RDS PostgreSQL** — Base de données relationnelle (bots, paris, stats)
- **Secrets Manager** — Stockage sécurisé des clés API (accessible par Run Bot uniquement)
- **NAT Gateway** — Accès internet sortant depuis le VPC vers les APIs externes

**APIs externes**
- **The Odds API** — Cotes sportives en temps réel
- **OpenRouter** — Passerelle LLM (Gemini 2.0 Flash par défaut)

### Décisions techniques

**RDS PostgreSQL plutôt que DynamoDB**
Le schéma est relationnel avec des foreign keys entre `Bot`, `Bet`, `CombinedBet` et `CombinedBetLeg`. DynamoDB est inadapté à ce type de structure. Prisma ORM permet de garder le même code en changeant uniquement le provider de `sqlite` à `postgresql`.

**6 Lambdas distinctes plutôt qu'une Lambda unique**
Chaque Lambda correspond à une route API existante — la migration est naturelle et la séparation des responsabilités est claire. Chaque fonction dispose de ses propres permissions IAM (principe du moindre privilège) : seule Run Bot accède à Secrets Manager et à la NAT Gateway.

**Déclenchement manuel plutôt qu'EventBridge**
Le run du bot et la résolution des paris sont déclenchés manuellement depuis le dashboard pour contrôler les coûts des APIs externes (The Odds API et OpenRouter sont facturés à la requête).

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js 14, TypeScript, Three.js |
| ORM | Prisma |
| Base de données | PostgreSQL (RDS) / SQLite (local) |
| Runtime | Node.js 18+ (Lambda) |
| LLM | OpenRouter — Gemini 2.0 Flash |
| Cotes | The Odds API |
| Infra | AWS (Lambda, RDS, API Gateway, CloudFront, S3) |
| IaC | Terraform *(à venir)* |

---

## Structure du projet

```
betbot-simulator/
├── app/
│   ├── api/
│   │   ├── bots/          # CRUD bots
│   │   ├── bets/          # CRUD paris
│   │   ├── combined-bets/ # Paris combinés
│   │   ├── resolve/       # Résolution des paris
│   │   ├── stats/         # Statistiques
│   │   └── debug-llm/     # Debug appels LLM
│   └── bots/              # Pages frontend
├── lib/
│   ├── claude.ts          # Intégration OpenRouter + logique LLM
│   ├── kelly.ts           # Calcul du critère de Kelly
│   ├── odds.ts            # Intégration The Odds API
│   ├── prisma.ts          # Client Prisma
│   └── resolve.ts         # Logique de résolution des paris
├── prisma/
│   └── schema.prisma      # Schéma de base de données
├── docs/
│   ├── architecture.png   # Schéma d'architecture AWS
│   └── architecture.drawio
└── README.md
```

---

## Coût estimé AWS

| Service | Usage estimé | Coût mensuel |
|---------|-------------|--------------|
| Lambda | ~500 invocations/mois | < 0.01 $ |
| RDS PostgreSQL (t3.micro) | Toujours actif | ~15 $ |
| NAT Gateway | ~1 GB/mois | ~5 $ |
| Secrets Manager | 2 secrets | ~0.80 $ |
| S3 + CloudFront | Trafic faible | < 1 $ |
| API Gateway | ~500 requêtes/mois | < 0.01 $ |
| **Total estimé** | | **~22 $/mois** |

> Le coût dominant est le RDS (instance toujours active). Une optimisation possible : passer en RDS Aurora Serverless pour ne payer qu'à l'usage.

---

## Lancer en local

### Prérequis

- Node.js 18+
- npm 9+

### Installation

```bash
git clone https://github.com/TON_USERNAME/betbot-simulator.git
cd betbot-simulator
npm install
```

### Configuration

Créer un fichier `.env` à la racine :

```env
# Base de données (local)
DATABASE_URL="file:./dev.db"

# OpenRouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODELS=google/gemini-2.0-flash-001

# The Odds API
ODDS_API_KEY=...
```

### Lancer

```bash
npx prisma migrate dev
npm run dev
```

L'app est disponible sur [http://localhost:3000](http://localhost:3000).

---

## Roadmap

- [x] Architecture locale (Next.js + SQLite)
- [x] Schéma d'architecture AWS
- [ ] Migration RDS PostgreSQL
- [ ] Déploiement Lambdas + API Gateway
- [ ] Frontend sur S3 + CloudFront
- [ ] Infrastructure as Code (Terraform)

---

## Licence

MIT © 2025 — Paul