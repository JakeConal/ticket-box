import { NextRequest } from "next/server";
import { currentSession } from "../../../lib/audience-server";

export async function GET(request: NextRequest) {
  return currentSession(request);
}
