import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const combos = await prisma.combinedBet.findMany({ where: { botId: id }, select: { id: true } });
  const comboIds = combos.map((c) => c.id);
  await prisma.combinedBetLeg.deleteMany({ where: { combinedBetId: { in: comboIds } } });
  await prisma.combinedBet.deleteMany({ where: { botId: id } });
  await prisma.bet.deleteMany({ where: { botId: id } });
  await prisma.matchAnalysis.deleteMany({ where: { botId: id } });
  await prisma.bot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bot = await prisma.bot.findUnique({
    where: { id },
    include: { bets: { orderBy: { createdAt: "desc" } } },
  });

  if (!bot) return NextResponse.json({ error: "Bot introuvable" }, { status: 404 });
  return NextResponse.json(bot);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  // Status-only toggle (from bot card)
  if (body.status !== undefined && Object.keys(body).length === 1) {
    if (body.status !== "active" && body.status !== "paused") {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }
    const bot = await prisma.bot.update({ where: { id }, data: { status: body.status } });
    return NextResponse.json(bot);
  }

  // Full edit
  const { name, systemPrompt, minEdge, maxKelly, sports, enableCombined, alsoIndividual, maxComboLegs, status } = body;
  const data: Record<string, unknown> = {};
  if (name        !== undefined) data.name         = name;
  if (systemPrompt !== undefined) data.systemPrompt = systemPrompt;
  if (minEdge     !== undefined) data.minEdge      = minEdge;
  if (maxKelly    !== undefined) data.maxKelly      = maxKelly;
  if (sports      !== undefined) data.sports        = Array.isArray(sports) ? sports.join(",") : sports;
  if (enableCombined  !== undefined) data.enableCombined  = enableCombined;
  if (alsoIndividual  !== undefined) data.alsoIndividual  = alsoIndividual;
  if (maxComboLegs    !== undefined) data.maxComboLegs    = maxComboLegs;
  if (status      !== undefined) data.status        = status;

  const bot = await prisma.bot.update({ where: { id }, data });
  return NextResponse.json(bot);
}
