import { NextResponse } from "next/server";
import { resolvePendingBets } from "@/lib/resolve";

export async function POST() {
  const resolved = await resolvePendingBets();
  return NextResponse.json({
    message: resolved > 0 ? `${resolved} pari(s) résolu(s)` : "Aucun pari à résoudre",
    resolved,
  });
}
