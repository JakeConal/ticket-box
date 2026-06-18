"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { registerAudience } from "../../lib/audience-api";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await registerAudience(email, password);
      router.replace(nextPath());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="login-panel" aria-labelledby="register-title">
        <div>
          <p className="eyebrow">TicketBox</p>
          <h1 id="register-title">Create an audience account</h1>
          <p className="muted">New public registrations are created with audience permissions.</p>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Email
            <input autoComplete="email" inputMode="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input autoComplete="new-password" minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>
        <Link className="ghost-button" href="/login">I already have an account</Link>
      </section>
    </main>
  );
}

function nextPath() {
  return new URLSearchParams(window.location.search).get("next") || "/";
}
