import { logoutResponse } from "../../../lib/audience-server";

export async function POST() {
  return logoutResponse();
}
