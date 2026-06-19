#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL || "http://localhost:8088").replace(/\/$/, "");
const password = process.env.SEED_PASSWORD || "password";

async function request(method, path, { token, body, expected = [200], headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} returned ${response.status}: ${text}`);
  }
  return { status: response.status, headers: response.headers, data };
}

async function login(email) {
  const { data } = await request("POST", "/api/auth/login", {
    body: { email, password },
  });
  if (!data?.accessToken) {
    throw new Error(`Login did not return an access token for ${email}`);
  }
  return data.accessToken;
}

function requireNoPublicLeak(payload) {
  const serialized = JSON.stringify(payload);
  for (const field of ["artistBioDraft", "artist_bio_draft", "bioError", "bio_error"]) {
    if (serialized.includes(field)) {
      throw new Error(`Public response leaked ${field}`);
    }
  }
}

const run = async () => {
  const publicList = await request("GET", "/api/concerts");
  const concerts = publicList.data?.content || [];
  if (concerts.length < 4) {
    throw new Error(`Expected at least 4 published concerts, got ${concerts.length}`);
  }
  requireNoPublicLeak(publicList.data);

  const concert = concerts.find((item) => item.eventCode === "ATSH-HCM-2026") || concerts[0];
  const concertId = concert.id;
  const detail = await request("GET", `/api/concerts/${concertId}`);
  requireNoPublicLeak(detail.data);

  const audience = await login("audience1@ticketbox.vn");
  const organizer = await login("organizer@ticketbox.vn");
  const checker = await login("checker1@ticketbox.vn");

  await request("POST", `/api/queue/${concertId}/enter`, { token: audience });
  const queueStatus = await request("GET", `/api/queue/${concertId}/status`, { token: audience });
  if (typeof queueStatus.data?.active !== "boolean") {
    throw new Error("Queue status did not include active boolean");
  }

  await request("POST", "/api/tickets/purchase", {
    expected: [401],
    body: { ticketTypeId: "00000000-0000-0000-0000-000000000000", quantity: 1, paymentProvider: "VNPAY" },
  });
  await request("POST", "/api/tickets/purchase", {
    token: checker,
    expected: [403],
    body: { ticketTypeId: "00000000-0000-0000-0000-000000000000", quantity: 1, paymentProvider: "VNPAY" },
  });

  await request("GET", `/api/checker/key-bundle?concertId=${concertId}`, { token: checker });
  await request("GET", `/api/checker/assignments?concertId=${concertId}`, { token: checker });
  await request("GET", `/api/checker/assignments?concertId=${concertId}`, { token: audience, expected: [403] });
  await request("GET", `/api/admin/concerts/${concertId}/stats`, { token: audience, expected: [403] });
  await request("GET", `/api/admin/concerts/${concertId}/stats`, { token: organizer });

  const registeredEmail = `smoke-${Date.now()}@ticketbox.local`;
  const registered = await request("POST", "/api/auth/register", {
    expected: [201],
    body: { email: registeredEmail, password: "password123" },
  });
  if (registered.data?.role !== "AUDIENCE") {
    throw new Error("Registration did not default to AUDIENCE");
  }

  console.log(`OK final smoke against ${baseUrl}`);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
