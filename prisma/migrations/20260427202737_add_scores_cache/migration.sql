-- CreateTable
CREATE TABLE "ScoresCache" (
    "sportKey" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL
);
