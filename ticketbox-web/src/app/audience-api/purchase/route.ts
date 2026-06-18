import { NextRequest } from "next/server";
import { proxyProtectedJson } from "../../../lib/audience-server";

export async function POST(request: NextRequest) {
  return proxyProtectedJson(request, "/api/tickets/purchase");
}
