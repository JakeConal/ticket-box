"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { loginAudience } from "../../lib/audience-api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("audience1@ticketbox.vn");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const session = await loginAudience(email, password);
      if (session?.role === "CHECKER") {
        setError("Checker accounts cannot purchase tickets.");
        return;
      }
      router.replace(nextPath());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">TicketBox</p>
          <h1 id="login-title">Audience sign in</h1>
          <p className="muted">Use an audience or organizer account to buy tickets and view e-tickets.</p>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Email
            <input autoComplete="email" inputMode="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <Link className="secondary-button" href="/register">Create account</Link>
      </section>
    </main>
  );
}

function nextPath() {
  return new URLSearchParams(window.location.search).get("next") || "/";
}
