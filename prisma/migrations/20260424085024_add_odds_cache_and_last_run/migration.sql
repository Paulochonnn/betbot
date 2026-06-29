-- AlterTable
ALTER TABLE "Bot" ADD COLUMN "lastRunAt" DATETIME;

-- CreateTable
CREATE TABLE "OddsCache" (
    "sportKey" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL
);
