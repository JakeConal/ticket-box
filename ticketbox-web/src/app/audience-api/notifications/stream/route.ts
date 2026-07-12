import { NextRequest } from "next/server";
import { proxyProtectedStream } from "../../../../lib/audience-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyProtectedStream(request, "/api/notifications/stream");
}
