/*
  Warnings:

  - You are about to drop the column `botId` on the `MatchAnalysis` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MatchAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "pick" TEXT,
    "odds" REAL NOT NULL,
    "estimatedProb" REAL NOT NULL,
    "edge" REAL NOT NULL,
    "reasoning" TEXT NOT NULL,
    "oddsHash" TEXT NOT NULL,
    "matchDate" DATETIME NOT NULL,
    "analyzedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_MatchAnalysis" ("analyzedAt", "decision", "edge", "estimatedProb", "id", "matchDate", "matchId", "odds", "oddsHash", "pick", "reasoning") SELECT "analyzedAt", "decision", "edge", "estimatedProb", "id", "matchDate", "matchId", "odds", "oddsHash", "pick", "reasoning" FROM "MatchAnalysis";
DROP TABLE "MatchAnalysis";
ALTER TABLE "new_MatchAnalysis" RENAME TO "MatchAnalysis";
CREATE UNIQUE INDEX "MatchAnalysis_matchId_key" ON "MatchAnalysis"("matchId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
