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

  const bet = await prisma.bet.findUnique({ where: { id } });
  if (!bet) return NextResponse.json({ error: "Pari introuvable" }, { status: 404 });
  if (bet.status !== "pending") {
    return NextResponse.json({ error: "Pari déjà résolu" }, { status: 400 });
  }

  const profit = status === "won" ? bet.stake * (bet.odds - 1) : -bet.stake;

  await prisma.$transaction([
    prisma.bet.update({
      where: { id },
      data: { status, profit, resolvedAt: new Date() },
    }),
    prisma.bot.update({
      where: { id: bet.botId },
      data: {
        bankroll: {
          increment: status === "won" ? bet.stake + profit : 0,
        },
      },
    }),
  ]);

  return NextResponse.json({ ok: true, profit });
}
