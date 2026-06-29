/*
  Warnings:

  - Added the required column `sportKey` to the `Bet` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "sportKey" TEXT NOT NULL,
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
INSERT INTO "new_Bet" ("awayTeam", "botId", "createdAt", "edge", "estimatedProb", "homeTeam", "id", "league", "matchDate", "matchId", "odds", "pick", "profit", "reasoning", "resolvedAt", "sport", "stake", "status") SELECT "awayTeam", "botId", "createdAt", "edge", "estimatedProb", "homeTeam", "id", "league", "matchDate", "matchId", "odds", "pick", "profit", "reasoning", "resolvedAt", "sport", "stake", "status" FROM "Bet";
DROP TABLE "Bet";
ALTER TABLE "new_Bet" RENAME TO "Bet";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
