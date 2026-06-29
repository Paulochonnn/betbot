import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const bots = await prisma.bot.findMany({
    include: { bets: true },
    orderBy: { createdAt: "desc" },
  });

  const result = bots.map((bot) => {
    const resolved = bot.bets.filter((b) => b.status !== "pending");
    const won = resolved.filter((b) => b.status === "won");
    const totalProfit = resolved.reduce((sum, b) => sum + (b.profit ?? 0), 0);
    const roi =
      resolved.length > 0
        ? (totalProfit /
            resolved.reduce((sum, b) => sum + b.stake, 0)) *
          100
        : 0;

    return {
      id: bot.id,
      name: bot.name,
      bankroll: bot.bankroll,
      initialBankroll: bot.initialBankroll,
      status: bot.status,
      maxKelly: bot.maxKelly,
      minEdge: bot.minEdge,
      sports: bot.sports,
      systemPrompt: bot.systemPrompt,
      createdAt: bot.createdAt,
      lastRunAt: bot.lastRunAt,
      enableCombined: bot.enableCombined,
      maxComboLegs: bot.maxComboLegs,
      stats: {
        totalBets: resolved.length,
        pendingBets: bot.bets.filter((b) => b.status === "pending").length,
        wonBets: won.length,
        winRate: resolved.length > 0 ? (won.length / resolved.length) * 100 : 0,
        totalProfit,
        roi,
      },
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, bankroll, sports, maxKelly, minEdge, systemPrompt } = body;

  if (!name || !bankroll || !systemPrompt) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  const { enableCombined, alsoIndividual, maxComboLegs } = body;

  const bot = await prisma.bot.create({
    data: {
      name,
      bankroll: parseFloat(bankroll),
      initialBankroll: parseFloat(bankroll),
      sports: Array.isArray(sports) ? sports.join(",") : sports,
      maxKelly: parseFloat(maxKelly ?? 0.05),
      minEdge: parseFloat(minEdge ?? 0.05),
      systemPrompt,
      enableCombined: enableCombined === true,
      alsoIndividual: alsoIndividual === true,
      maxComboLegs: parseInt(maxComboLegs ?? 2, 10),
    },
  });

  return NextResponse.json(bot, { status: 201 });
}
