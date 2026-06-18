import { NextRequest } from "next/server";
import { proxyProtected } from "../../../../../lib/audience-server";

export async function POST(request: NextRequest, context: { params: Promise<{ concertId: string }> }) {
  const { concertId } = await context.params;
  return proxyProtected(request, `/api/queue/${concertId}/enter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
}
