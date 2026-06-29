import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  // Find all bots with combined bets enabled
  const combinedBots = await prisma.bot.findMany({
    where: { enableCombined: true },
    select: { id: true, name: true, bankroll: true },
  });

  if (combinedBots.length === 0) {
    return NextResponse.json({ message: "Aucun bot combiné trouvé.", refunded: 0, deleted: 0 });
  }

  const botIds = combinedBots.map((b) => b.id);

  // Pending single bets → refund stake
  const pendingBets = await prisma.bet.findMany({
    where: { botId: { in: botIds }, status: "pending" },
    select: { id: true, botId: true, stake: true },
  });

  // Group pending stakes by bot
  const refundsByBot = new Map<string, number>();
  for (const bet of pendingBets) {
    refundsByBot.set(bet.botId, (refundsByBot.get(bet.botId) ?? 0) + bet.stake);
  }

  // Delete all single bets (pending + resolved) for these bots
  const { count: deleted } = await prisma.bet.deleteMany({
    where: { botId: { in: botIds } },
  });

  // Refund pending stakes back to each bot's bankroll
  let totalRefunded = 0;
  for (const [botId, amount] of Array.from(refundsByBot.entries())) {
    await prisma.bot.update({
      where: { id: botId },
      data: { bankroll: { increment: amount } },
    });
    totalRefunded += amount;
  }

  const summary = combinedBots.map((b) => ({
    name: b.name,
    refunded: (refundsByBot.get(b.id) ?? 0).toFixed(2),
  }));

  return NextResponse.json({
    message: `${deleted} paris simples supprimés, €${totalRefunded.toFixed(2)} remboursés.`,
    deleted,
    refunded: totalRefunded,
    bots: summary,
  });
}
