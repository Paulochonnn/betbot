import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const botId = searchParams.get("botId");
  const status = searchParams.get("status");

  const bets = await prisma.bet.findMany({
    where: {
      ...(botId ? { botId } : {}),
      ...(status ? { status } : {}),
    },
    include: { bot: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(bets);
}
