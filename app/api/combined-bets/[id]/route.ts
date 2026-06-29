import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status } = await req.json() as { status: "won" | "lost" };

  if (status !== "won" && status !== "lost") {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }

  const combo = await prisma.combinedBet.findUnique({ where: { id } });
  if (!combo) return NextResponse.json({ error: "Combiné introuvable" }, { status: 404 });
  if (combo.status !== "pending") {
    return NextResponse.json({ error: "Combiné déjà résolu" }, { status: 400 });
  }

  const profit = status === "won" ? combo.stake * (combo.combinedOdds - 1) : -combo.stake;

  await prisma.$transaction([
    prisma.combinedBet.update({
      where: { id },
      data: { status, profit, resolvedAt: new Date() },
    }),
    prisma.bot.update({
      where: { id: combo.botId },
      data: {
        bankroll: {
          increment: status === "won" ? combo.stake + profit : 0,
        },
      },
    }),
  ]);

  return NextResponse.json({ ok: true, profit });
}
