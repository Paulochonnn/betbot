# BetBot Simulator — Brief V1 pour Claude Code

## Contexte du projet

Simulateur de paris sportifs virtuels piloté par une IA (Claude). Des bots autonomes analysent de vrais matchs avec de vraies cotes, placent des paris virtuels, et gèrent leur bankroll selon leur stratégie. Aucun vrai argent, aucun vrai pari sur une plateforme externe.

L'objectif de la V1 est de poser des fondations solides et évolutives : **un seul bot**, le cycle complet de bout en bout, et un dashboard fonctionnel. Les fonctionnalités multi-bots et avancées viendront ensuite par itérations.

---

## Stack technique

| Élément | Choix | Raison |
|---|---|---|
| Framework | Next.js 14 (App Router) | Frontend + API routes dans un seul projet |
| Base de données | SQLite via Prisma | Zéro config en local, migration facile vers Postgres |
| IA | Anthropic API (Claude) | Cerveau d'analyse du bot |
| Cotes en temps réel | The Odds API | Gratuite 500 req/mois, couvre foot/tennis/basket |
| Scores / résultats | The Odds API (scores endpoint) | Même provider, cohérent |
| Style | Tailwind CSS | Rapide, propre |
| Hébergement V1 | Local (Node.js) | Dev local d'abord, Vercel + Postgres après |

---

## Schéma de base de données (Prisma)

```prisma
model Bot {
  id            String   @id @default(cuid())
  name          String
  bankroll      Float
  initialBankroll Float
  status        String   @default("active") // "active" | "paused"
  maxKelly      Float    @default(0.05)     // fraction max de la bankroll à miser
  minEdge       Float    @default(0.05)     // edge minimum pour parier (ex: 0.05 = 5%)
  sports        String   @default("soccer,tennis,basketball") // sports autorisés, séparés par virgule
  systemPrompt  String   // instructions texte libres définissant la personnalité du bot
  createdAt     DateTime @default(now())
  bets          Bet[]
}

model Bet {
  id            String   @id @default(cuid())
  botId         String
  bot           Bot      @relation(fields: [botId], references: [id])
  matchId       String   // ID externe The Odds API
  sport         String
  league        String
  homeTeam      String
  awayTeam      String
  pick          String   // équipe/joueur sélectionné
  odds          Float    // cote au moment du pari
  estimatedProb Float    // probabilité estimée par Claude
  edge          Float    // edge calculé = estimatedProb - (1/odds)
  stake         Float    // montant misé (Kelly)
  reasoning     String   // raisonnement complet de Claude
  status        String   @default("pending") // "pending" | "won" | "lost" | "void"
  profit        Float?   // null jusqu'à résolution
  matchDate     DateTime
  createdAt     DateTime @default(now())
  resolvedAt    DateTime?
}
```

---

## Architecture des fichiers Next.js

```
betbot-simulator/
├── app/
│   ├── page.tsx                    # Dashboard principal
│   ├── bots/
│   │   └── new/page.tsx            # Formulaire création bot
│   └── api/
│       ├── bots/
│       │   ├── route.ts            # GET (liste) + POST (création)
│       │   └── [id]/
│       │       ├── route.ts        # GET + PATCH (pause/resume)
│       │       └── run/route.ts    # POST — déclenche un cycle d'analyse
│       ├── bets/
│       │   └── route.ts            # GET historique des paris
│       └── resolve/
│           └── route.ts            # POST — récupère scores et résout les paris pending
├── lib/
│   ├── prisma.ts                   # Client Prisma singleton
│   ├── odds.ts                     # Wrapper The Odds API
│   ├── claude.ts                   # Wrapper Anthropic API
│   └── kelly.ts                    # Calcul du critère de Kelly
├── prisma/
│   └── schema.prisma
└── .env.local
    # ANTHROPIC_API_KEY=
    # ODDS_API_KEY=
```

---

## Logique métier détaillée

### 1. Cycle d'analyse d'un bot — `POST /api/bots/[id]/run`

```
1. Récupérer le bot en DB
2. Vérifier que status === "active"
3. Appeler The Odds API → matchs à venir dans les 24h (sports du bot)
4. Filtrer les matchs pour lesquels le bot n'a pas déjà un pari "pending"
5. Pour chaque match :
   a. Construire le prompt Claude avec : infos du match, cotes bookmaker, bankroll actuelle, systemPrompt du bot
   b. Appeler Claude → réponse JSON structurée (voir format ci-dessous)
   c. Si decision === "BET" et edge >= bot.minEdge :
      - Calculer stake via Kelly (plafonné à bot.maxKelly)
      - Enregistrer le pari en DB
      - Déduire le stake de la bankroll du bot
6. Retourner le résumé du cycle (matchs analysés, paris placés)
```

### 2. Format de réponse Claude (JSON strict)

Claude doit répondre uniquement avec ce JSON, sans markdown :

```json
{
  "decision": "BET" | "SKIP",
  "pick": "nom de l'équipe ou joueur | null",
  "odds": 2.10,
  "estimated_prob": 0.52,
  "edge": 0.047,
  "stake_suggestion": "ignored — calculé par Kelly côté serveur",
  "reasoning": "Explication détaillée en 3-5 phrases du raisonnement"
}
```

### 3. Résolution des paris — `POST /api/resolve`

```
1. Récupérer tous les paris avec status === "pending" dont matchDate est passée
2. Pour chaque pari, appeler The Odds API scores endpoint avec le matchId
3. Si le score est disponible :
   a. Déterminer won / lost selon le pick
   b. Calculer profit : won → stake * (odds - 1) | lost → -stake
   c. Mettre à jour la bankroll du bot
   d. Mettre à jour le pari en DB (status, profit, resolvedAt)
```

### 4. Calcul Kelly — `lib/kelly.ts`

```typescript
export function kellyStake(bankroll: number, prob: number, odds: number, maxFraction: number): number {
  const b = odds - 1;
  const q = 1 - prob;
  const kelly = (b * prob - q) / b;
  const fraction = Math.max(0, Math.min(kelly, maxFraction));
  return parseFloat((bankroll * fraction).toFixed(2));
}
```

---

## Prompt système envoyé à Claude

Ce prompt est construit dynamiquement à chaque analyse :

```
Tu es un bot de paris sportifs virtuels.

--- TA PERSONNALITÉ ---
{bot.systemPrompt}

--- TES PARAMÈTRES ---
- Edge minimum pour parier : {bot.minEdge * 100}%
- Mise max (Kelly) : {bot.maxKelly * 100}% de la bankroll
- Bankroll actuelle : €{bot.bankroll}

--- LE MATCH À ANALYSER ---
Sport : {sport}
Compétition : {league}
{homeTeam} vs {awayTeam}
Date : {matchDate}
Cotes bookmaker :
{outcomes.map(o => `  - ${o.name} : ${o.price}`).join('\n')}

--- INSTRUCTIONS ---
1. Estime la probabilité réelle de chaque issue en te basant sur tes connaissances
2. Calcule l'edge : ta probabilité estimée - probabilité implicite du bookmaker (1/cote)
3. Si edge >= {bot.minEdge * 100}% sur une issue, décide BET, sinon SKIP
4. Rédige ton raisonnement en français
5. Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après
```

---

## Dashboard — ce qu'il faut afficher (page.tsx)

### Section principale — État du bot
- Nom du bot
- Bankroll actuelle vs bankroll initiale (€ + %)
- Statut : actif / en pause
- Bouton **Lancer un cycle** → appelle `POST /api/bots/[id]/run`
- Bouton **Pause / Reprendre** → appelle `PATCH /api/bots/[id]`
- Bouton **Résoudre les paris** → appelle `POST /api/resolve`

### Section — Paris en cours
Table : Match | Pick | Cote | Mise | Edge | Date | Raisonnement (expandable)

### Section — Historique
Table : Match | Pick | Cote | Mise | Résultat | Profit/Perte | Date
- Filtre : tous / gagnés / perdus

### Section — Stats
- Nb total de paris
- Win rate (%)
- ROI (%)
- Profit total (€)

---

## Formulaire de création d'un bot — `/bots/new`

Champs :
- **Nom** (text)
- **Bankroll de départ** (number, €)
- **Sports autorisés** (checkboxes : Football, Tennis, Basket)
- **Edge minimum** (slider : 1% → 20%, défaut 5%)
- **Mise max Kelly** (slider : 1% → 15%, défaut 5%)
- **Instructions / Personnalité** (textarea libre) — ex : "Tu es agressif, tu cherches les outsiders avec de grandes cotes. Tu acceptes plus de risque."

---

## Variables d'environnement (.env.local)

```
ANTHROPIC_API_KEY=sk-ant-...
ODDS_API_KEY=...   # Obtenir sur https://the-odds-api.com (plan gratuit suffisant)
DATABASE_URL="file:./dev.db"
```

---

## Précisions UI / UX

### Langue
- Toute l'interface est en **français**
- Les prompts envoyés à Claude demandent un raisonnement en **français**

### Authentification
- **Pas de login, pas de multi-utilisateurs** — outil 100% perso, accès direct au dashboard sans compte

### Affichage du raisonnement des paris
- Dans les tables (paris en cours + historique) : afficher un **résumé court** (1 phrase, les 120 premiers caractères du reasoning)
- Un bouton **"Voir le détail"** ou une ligne cliquable pour expand et lire le raisonnement complet de Claude
- Le raisonnement complet est stocké dans le champ `reasoning` en DB (texte libre, 3-5 phrases)

---

## Ce qui N'est PAS dans la V1 (à faire après)

- Multi-bots (l'architecture DB le supporte déjà, juste l'UI à étendre)
- Graphes de performance (courbe de bankroll dans le temps)
- Notifications (email, webhook)
- Authentification utilisateur
- Déploiement cloud (Vercel + Postgres)
- Paris non-sportifs

---

## Instructions pour Claude Code

1. Initialiser le projet Next.js 14 avec App Router et Tailwind
2. Installer et configurer Prisma avec SQLite
3. Créer le schéma Prisma et générer le client
4. Implémenter les wrappers `lib/odds.ts`, `lib/claude.ts`, `lib/kelly.ts`
5. Implémenter les API routes dans l'ordre : bots → bets → resolve
6. Créer le formulaire `/bots/new`
7. Créer le dashboard `page.tsx`
8. Tester le cycle complet avec un bot de test

Commencer par demander les clés API à l'utilisateur avant de lancer le dev.
