import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const combos = await prisma.combinedBet.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      legs: { orderBy: { matchDate: "asc" } },
      bot:  { select: { name: true } },
    },
  });
  return NextResponse.json(combos);
}
