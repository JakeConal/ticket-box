import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest } from "../../../lib/audience-server";

export async function GET(request: NextRequest) {
  const session = sessionFromRequest(request);
  return session ? NextResponse.json(session) : new NextResponse(null, { status: 204 });
}
