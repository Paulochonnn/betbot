-- CreateTable
CREATE TABLE "MatchAnalysis" (
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

-- CreateIndex
CREATE UNIQUE INDEX "MatchAnalysis_matchId_key" ON "MatchAnalysis"("matchId");
