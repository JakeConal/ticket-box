import { NextRequest } from "next/server";
import { proxyProtectedRead } from "../../../../../lib/audience-server";

export async function GET(request: NextRequest, context: { params: Promise<{ concertId: string }> }) {
  const { concertId } = await context.params;
  return proxyProtectedRead(request, `/api/queue/${concertId}/status`);
}
