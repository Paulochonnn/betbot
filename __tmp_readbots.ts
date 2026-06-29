import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: "file:./dev.db" } } });
async function main() {
  const bots = await prisma.bot.findMany({ orderBy: { createdAt: "asc" } });
  for (const bot of bots) {
    console.log(`\n=== ${bot.name} ===`);
    console.log(`minEdge=${bot.minEdge} maxKelly=${bot.maxKelly} bankroll=${bot.bankroll} sports=${bot.sports}`);
    console.log(`enableCombined=${bot.enableCombined} maxComboLegs=${bot.maxComboLegs}`);
    console.log(`--- systemPrompt ---\n${bot.systemPrompt}`);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
