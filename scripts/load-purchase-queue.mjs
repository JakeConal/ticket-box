#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL || "http://localhost:8088").replace(/\/$/, "");
const users = Number.parseInt(process.env.LOAD_USERS || "500", 10);
const password = process.env.LOAD_PASSWORD || "password123";
const runId = process.env.LOAD_RUN_ID || `${Date.now()}`;
const setupDelayMs = Number.parseInt(process.env.LOAD_SETUP_DELAY_MS || "750", 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(method, path, { token, body, expected = [200, 201], attempts = 6 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (response.status === 429 && attempts > 1) {
    const retryAfter = Number.parseInt(response.headers.get("retry-after") || "1", 10);
    await sleep(Math.max(1, retryAfter) * 1000);
    return request(method, path, { token, body, expected, attempts: attempts - 1 });
  }
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} returned ${response.status}: ${text}`);
  }
  return data;
}

async function registerAndLogin(index) {
  const email = `load-${runId}-${index}@ticketbox.local`;
  await request("POST", "/api/auth/register", {
    body: { email, password },
    expected: [201, 409],
  });
  const auth = await request("POST", "/api/auth/login", {
    body: { email, password },
  });
  return auth.accessToken;
}

async function main() {
  const list = await request("GET", "/api/concerts", { expected: [200] });
  const concert = (list.content || [])[0];
  if (!concert?.id) {
    throw new Error("No published concert found for queue simulation");
  }

  const started = Date.now();
  const tokens = [];
  for (let index = 0; index < users; index += 1) {
    tokens.push(await registerAndLogin(index));
    if (setupDelayMs > 0 && index < users - 1) {
      await sleep(setupDelayMs);
    }
  }
  const entries = await Promise.all(tokens.map((token) =>
    request("POST", `/api/queue/${concert.id}/enter`, { token, expected: [200] })
  ));

  const activeEntries = entries.filter((entry) => entry.active);
  const positions = activeEntries
    .map((entry) => entry.position)
    .filter((position) => Number.isInteger(position));
  const uniquePositions = new Set(positions);

  if (positions.length !== uniquePositions.size) {
    throw new Error("Queue positions were not unique for active entries");
  }

  console.log(JSON.stringify({
    baseUrl,
    users,
    concertId: concert.id,
    activeEntries: activeEntries.length,
    inactiveEntries: entries.length - activeEntries.length,
    uniquePositions: uniquePositions.size,
    durationMs: Date.now() - started,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
