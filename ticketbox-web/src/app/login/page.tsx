"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { loginAudience } from "../../lib/audience-api";
import { ui } from "../../components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("audience1@ticketbox.vn");
  const [password, setPassword] = useState("password");
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
    <main className={ui.authPage}>
      <section className="w-full max-w-md border border-neutral-950 bg-white p-6 sm:p-8" aria-labelledby="login-title">
        <div>
          <p className={ui.eyebrow}>TicketBox</p>
          <h1 className="mt-3 text-3xl font-black" id="login-title">Audience sign in</h1>
          <p className={`${ui.muted} mt-3`}>Use an audience or organizer account to buy tickets and view e-tickets.</p>
        </div>
        <form className={`${ui.form} mt-8`} onSubmit={submit}>
          <label>
            Email
            <input autoComplete="email" inputMode="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className={ui.alertError} role="alert">{error}</p> : null}
          <button className={ui.primaryButton} disabled={submitting} type="submit">
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <Link className={`${ui.secondaryButton} mt-3`} href="/register">Create account</Link>
      </section>
    </main>
  );
}

function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}
