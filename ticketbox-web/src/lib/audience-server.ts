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
const refreshCache = new Map<string, { expiresAt: number; promise: Promise<AuthResponse | null> }>();

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

export async function currentSession(request: NextRequest) {
  const session = sessionFromRequest(request);
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (session && accessToken && new Date(session.accessTokenExpiresAt).getTime() > Date.now() + 5_000) {
    return NextResponse.json(session);
  }

  const refreshed = await refreshAuth(request);
  if (!refreshed) {
    const response = new NextResponse(null, { status: 204 });
    clearAuthCookies(response);
    return response;
  }
  const response = NextResponse.json(publicSession(refreshed));
  setAuthCookies(response, refreshed);
  return response;
}

export function logoutResponse() {
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}

export async function proxyProtected(request: NextRequest, path: string, init: RequestInit = {}) {
  let accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  let refreshed: AuthResponse | null = null;
  if (!accessToken) {
    refreshed = await refreshAuth(request);
    accessToken = refreshed?.accessToken;
  }
  if (!accessToken) {
    return unauthorizedResponse();
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  let backend = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });
  if (backend.status === 401 && !refreshed) {
    refreshed = await refreshAuth(request);
    if (refreshed) {
      headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
      backend = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers
      });
    }
  }
  const text = await backend.text();
  const response = new NextResponse(text, {
    status: backend.status,
    headers: {
      "Content-Type": backend.headers.get("Content-Type") || "application/json"
    }
  });
  copyHeader(backend, response, "Idempotency-Key");
  copyHeader(backend, response, "Location");
  if (refreshed) {
    setAuthCookies(response, refreshed);
  }
  if (backend.status === 401) {
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
  let accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  let refreshed: AuthResponse | null = null;
  if (!accessToken) {
    refreshed = await refreshAuth(request);
    accessToken = refreshed?.accessToken;
  }
  if (!accessToken) {
    return unauthorizedResponse();
  }

  let backend = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "text/event-stream"
    }
  });
  if (backend.status === 401 && !refreshed) {
    refreshed = await refreshAuth(request);
    if (refreshed) {
      backend = await fetch(`${API_BASE}${path}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${refreshed.accessToken}`,
          Accept: "text/event-stream"
        }
      });
    }
  }

  if (!backend.ok || !backend.body) {
    const text = await backend.text();
    const response = new NextResponse(text, {
      status: backend.status,
      headers: {
        "Content-Type": backend.headers.get("Content-Type") || "application/json"
      }
    });
    if (refreshed) {
      setAuthCookies(response, refreshed);
    }
    if (backend.status === 401) {
      clearAuthCookies(response);
    }
    return response;
  }

  const response = new NextResponse(backend.body, {
    status: backend.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
  if (refreshed) {
    setAuthCookies(response, refreshed);
  }
  return response;
}

async function refreshAuth(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return null;
  }

  const cached = refreshCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  })
    .then(async (response) => {
      if (response.status === 401 || response.status === 403) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Authentication service unavailable (${response.status})`);
      }
      return response.json() as Promise<AuthResponse>;
    });
  const expiresAt = Date.now() + 10_000;
  refreshCache.set(refreshToken, { expiresAt, promise });
  setTimeout(() => {
    const current = refreshCache.get(refreshToken);
    if (current?.promise === promise && current.expiresAt <= Date.now()) {
      refreshCache.delete(refreshToken);
    }
  }, 10_100);
  return promise;
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
  const secure = process.env.NODE_ENV === "production";
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USER_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      expires: new Date(0)
    });
  }
}

function unauthorizedResponse() {
  const response = NextResponse.json({ message: "Authentication required" }, { status: 401 });
  clearAuthCookies(response);
  return response;
}

function copyHeader(source: Response, target: NextResponse, name: string) {
  const value = source.headers.get(name);
  if (value) {
    target.headers.set(name, value);
  }
}
