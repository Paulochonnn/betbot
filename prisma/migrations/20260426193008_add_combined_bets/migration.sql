-- CreateTable
CREATE TABLE "CombinedBet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "combinedOdds" REAL NOT NULL,
    "estimatedProb" REAL NOT NULL,
    "edge" REAL NOT NULL,
    "stake" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "profit" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "CombinedBet_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CombinedBetLeg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "combinedBetId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "sportKey" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "matchDate" DATETIME NOT NULL,
    "pick" TEXT NOT NULL,
    "odds" REAL NOT NULL,
    "estimatedProb" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "CombinedBetLeg_combinedBetId_fkey" FOREIGN KEY ("combinedBetId") REFERENCES "CombinedBet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "bankroll" REAL NOT NULL,
    "initialBankroll" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "maxKelly" REAL NOT NULL DEFAULT 0.05,
    "minEdge" REAL NOT NULL DEFAULT 0.05,
    "sports" TEXT NOT NULL DEFAULT 'soccer,tennis,basketball',
    "systemPrompt" TEXT NOT NULL,
    "enableCombined" BOOLEAN NOT NULL DEFAULT false,
    "maxComboLegs" INTEGER NOT NULL DEFAULT 2,
    "lastRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Bot" ("bankroll", "createdAt", "id", "initialBankroll", "lastRunAt", "maxKelly", "minEdge", "name", "sports", "status", "systemPrompt") SELECT "bankroll", "createdAt", "id", "initialBankroll", "lastRunAt", "maxKelly", "minEdge", "name", "sports", "status", "systemPrompt" FROM "Bot";
DROP TABLE "Bot";
ALTER TABLE "new_Bot" RENAME TO "Bot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
