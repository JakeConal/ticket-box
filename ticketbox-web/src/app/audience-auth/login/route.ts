import { NextRequest } from "next/server";
import { authPost } from "../../../lib/audience-server";

export async function POST(request: NextRequest) {
  return authPost(request, "/api/auth/login");
}
