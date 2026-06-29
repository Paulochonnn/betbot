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
    "alsoIndividual" BOOLEAN NOT NULL DEFAULT false,
    "maxComboLegs" INTEGER NOT NULL DEFAULT 2,
    "lastRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Bot" ("bankroll", "createdAt", "enableCombined", "id", "initialBankroll", "lastRunAt", "maxComboLegs", "maxKelly", "minEdge", "name", "sports", "status", "systemPrompt") SELECT "bankroll", "createdAt", "enableCombined", "id", "initialBankroll", "lastRunAt", "maxComboLegs", "maxKelly", "minEdge", "name", "sports", "status", "systemPrompt" FROM "Bot";
DROP TABLE "Bot";
ALTER TABLE "new_Bot" RENAME TO "Bot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
