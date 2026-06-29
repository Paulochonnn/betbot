process.env.DATABASE_URL = "file:./dev.db";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const deleted = await prisma.matchAnalysis.deleteMany({
    where: { botId: "cmoifw8gc00008c55gaotzfdy" }
  });
  console.log("Deleted:", deleted.count);
  await prisma.$disconnect();
}
main().catch(console.error);
