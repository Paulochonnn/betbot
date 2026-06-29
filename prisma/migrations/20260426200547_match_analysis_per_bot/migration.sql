-- Vider le cache partagé existant avant de recréer la table avec botId
DELETE FROM "MatchAnalysis";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MatchAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "pick" TEXT,
    "odds" REAL NOT NULL,
    "estimatedProb" REAL NOT NULL,
    "edge" REAL NOT NULL,
    "reasoning" TEXT NOT NULL,
    "oddsHash" TEXT NOT NULL,
    "matchDate" DATETIME NOT NULL,
    "analyzedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchAnalysis_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
DROP TABLE "MatchAnalysis";
ALTER TABLE "new_MatchAnalysis" RENAME TO "MatchAnalysis";
CREATE UNIQUE INDEX "MatchAnalysis_botId_matchId_key" ON "MatchAnalysis"("botId", "matchId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
