-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "bankroll" REAL NOT NULL,
    "initialBankroll" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "maxKelly" REAL NOT NULL DEFAULT 0.05,
    "minEdge" REAL NOT NULL DEFAULT 0.05,
    "sports" TEXT NOT NULL DEFAULT 'soccer,tennis,basketball',
    "systemPrompt" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "pick" TEXT NOT NULL,
    "odds" REAL NOT NULL,
    "estimatedProb" REAL NOT NULL,
    "edge" REAL NOT NULL,
    "stake" REAL NOT NULL,
    "reasoning" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "profit" REAL,
    "matchDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "Bet_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
