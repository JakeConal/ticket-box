import { NextRequest } from "next/server";
import { proxyProtected } from "../../../../lib/audience-server";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyProtected(request, `/api/orders/${id}`);
}
