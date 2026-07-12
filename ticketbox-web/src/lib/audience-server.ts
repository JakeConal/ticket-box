import { NextRequest, NextResponse } from "next/server";

type AuthResponse = {
  userId: string;
  email: string;
  role: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

const ACCESS_COOKIE = "ticketbox.access";
const REFRESH_COOKIE = "ticketbox.refresh";
const USER_COOKIE = "ticketbox.user";
const API_BASE = process.env.API_INTERNAL_BASE_URL || "http://localhost:8080";

export async function authPost(request: NextRequest, path: "/api/auth/login" | "/api/auth/register") {
  const backend = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text()
  });
  const text = await backend.text();
  if (!backend.ok) {
    return new NextResponse(text, { status: backend.status });
  }

  const auth = JSON.parse(text) as AuthResponse;
  const response = NextResponse.json(publicSession(auth));
  setAuthCookies(response, auth);
  return response;
}

export function sessionFromRequest(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const rawUser = request.cookies.get(USER_COOKIE)?.value;
  if (!accessToken || !rawUser) {
    return null;
  }
  try {
    return JSON.parse(rawUser) as ReturnType<typeof publicSession>;
  } catch {
    return null;
  }
}

export function currentSession(request: NextRequest) {
  const session = sessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }
  return NextResponse.json(session);
}

export function logoutResponse() {
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}

export async function proxyProtected(request: NextRequest, path: string, init: RequestInit = {}) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  const backend = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });
  const text = await backend.text();
  const response = new NextResponse(text, {
    status: backend.status,
    headers: {
      "Content-Type": backend.headers.get("Content-Type") || "application/json"
    }
  });
  copyHeader(backend, response, "Idempotency-Key");
  copyHeader(backend, response, "Location");
  if (backend.status === 401 || backend.status === 403) {
    clearAuthCookies(response);
  }
  return response;
}

export async function proxyProtectedJson(request: NextRequest, path: string) {
  return proxyProtected(request, path, {
    method: request.method,
    headers: { "Content-Type": "application/json", "Idempotency-Key": request.headers.get("Idempotency-Key") || "" },
    body: await request.text()
  });
}

export async function proxyProtectedRead(request: NextRequest, path: string) {
  return proxyProtected(request, path, {
    method: request.method
  });
}

export async function proxyProtectedStream(request: NextRequest, path: string) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const backend = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "text/event-stream"
    }
  });

  if (!backend.ok || !backend.body) {
    const text = await backend.text();
    return new NextResponse(text, {
      status: backend.status,
      headers: {
        "Content-Type": backend.headers.get("Content-Type") || "application/json"
      }
    });
  }

  return new NextResponse(backend.body, {
    status: backend.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

function publicSession(auth: AuthResponse) {
  return {
    userId: auth.userId,
    email: auth.email,
    role: auth.role,
    accessTokenExpiresAt: auth.accessTokenExpiresAt,
    refreshTokenExpiresAt: auth.refreshTokenExpiresAt
  };
}

function setAuthCookies(response: NextResponse, auth: AuthResponse) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(ACCESS_COOKIE, auth.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(auth.accessTokenExpiresAt)
  });
  response.cookies.set(REFRESH_COOKIE, auth.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(auth.refreshTokenExpiresAt)
  });
  response.cookies.set(USER_COOKIE, JSON.stringify(publicSession(auth)), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(auth.refreshTokenExpiresAt)
  });
}

function clearAuthCookies(response: NextResponse) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USER_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(0)
    });
  }
}

function copyHeader(source: Response, target: NextResponse, name: string) {
  const value = source.headers.get(name);
  if (value) {
    target.headers.set(name, value);
  }
}
