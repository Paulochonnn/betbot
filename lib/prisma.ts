import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma_v2: PrismaClient };

function createPrisma() {
  const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma_v2 ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma_v2 = prisma;

