-- CreateTable
CREATE TABLE "ApiStats" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "oddsRequestsUsed" INTEGER NOT NULL DEFAULT 0,
    "oddsRequestsRemaining" INTEGER NOT NULL DEFAULT 500,
    "claudeRequests" INTEGER NOT NULL DEFAULT 0,
    "claudeInputTokens" INTEGER NOT NULL DEFAULT 0,
    "claudeOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "claudeCacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
