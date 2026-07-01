#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const baseUrl = (process.env.BASE_URL || "http://localhost:8088").replace(/\/$/, "");
const password = process.env.SEED_PASSWORD || "password";
const aiBioSmoke = ["1", "true", "yes"].includes((process.env.AI_BIO_SMOKE || "").toLowerCase());
const aiBioPressKit = process.env.AI_BIO_PRESS_KIT || "import-samples/artist-press-kit-sample.pdf";
const aiBioTimeoutMs = Number(process.env.AI_BIO_SMOKE_TIMEOUT_MS || 90000);

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

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireNoPublicLeak(payload) {
  const serialized = JSON.stringify(payload);
  for (const field of ["artistBioDraft", "artist_bio_draft", "bioError", "bio_error", "artistPdfUri", "artist_pdf_uri"]) {
    if (serialized.includes(field)) {
      throw new Error(`Public response leaked ${field}`);
    }
  }
}

async function uploadArtistPdf(concertId, token) {
  const pdf = await readFile(aiBioPressKit);
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), "artist-press-kit-sample.pdf");

  const response = await fetch(`${baseUrl}/api/admin/concerts/${concertId}/artist-pdf`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (response.status !== 202) {
    throw new Error(`POST /api/admin/concerts/${concertId}/artist-pdf returned ${response.status}: ${text}`);
  }
  return data;
}

async function waitForArtistBioDraft(concertId, token) {
  const deadline = Date.now() + aiBioTimeoutMs;
  let lastReview = null;

  while (Date.now() < deadline) {
    const review = await request("GET", `/api/admin/concerts/${concertId}/artist-bio`, { token });
    lastReview = review.data;
    if (review.data?.bioStatus === "DRAFT" && hasText(review.data.artistBioDraft)) {
      return review.data;
    }
    if (review.data?.bioStatus === "FAILED") {
      throw new Error(`AI bio generation failed: ${review.data.bioError || "unknown error"}`);
    }
    await sleep(2000);
  }

  throw new Error(`Timed out waiting for AI bio draft; last status was ${lastReview?.bioStatus || "unknown"}`);
}

async function runArtistBioSmoke(concertId, organizerToken) {
  const before = await request("GET", `/api/concerts/${concertId}`);
  requireNoPublicLeak(before.data);
  const previousPublicBio = before.data?.artistBio || "";

  await uploadArtistPdf(concertId, organizerToken);
  const draftReview = await waitForArtistBioDraft(concertId, organizerToken);
  const draftText = draftReview.artistBioDraft;

  const duringDraft = await request("GET", `/api/concerts/${concertId}`);
  requireNoPublicLeak(duringDraft.data);
  if (duringDraft.data?.artistBio !== previousPublicBio) {
    throw new Error("Public artist bio changed before organizer publish");
  }
  if (JSON.stringify(duringDraft.data).includes(draftText)) {
    throw new Error("Draft artist bio leaked in public concert response");
  }

  const published = await request("POST", `/api/admin/concerts/${concertId}/artist-bio/publish`, { token: organizerToken });
  if (!hasText(published.data?.publicArtistBio)) {
    throw new Error("Publish did not return public artist bio text");
  }

  const afterPublish = await request("GET", `/api/concerts/${concertId}`);
  requireNoPublicLeak(afterPublish.data);
  if (afterPublish.data?.artistBio !== published.data.publicArtistBio) {
    throw new Error("Published artist bio was not visible in public concert response");
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

  if (aiBioSmoke) {
    await runArtistBioSmoke(concertId, organizer);
  }

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
