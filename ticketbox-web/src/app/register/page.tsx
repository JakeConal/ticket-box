"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { registerAudience } from "../../lib/audience-api";
import { ui } from "../../components/ui";

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
    <main className={ui.authPage}>
      <section className="w-full max-w-md border border-neutral-950 bg-white p-6 sm:p-8" aria-labelledby="register-title">
        <div>
          <p className={ui.eyebrow}>TicketBox</p>
          <h1 className="mt-3 text-3xl font-black" id="register-title">Create an audience account</h1>
          <p className={`${ui.muted} mt-3`}>New public registrations are created with audience permissions.</p>
        </div>
        <form className={`${ui.form} mt-8`} onSubmit={submit}>
          <label>
            Email
            <input autoComplete="email" inputMode="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input autoComplete="new-password" minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className={ui.alertError} role="alert">{error}</p> : null}
          <button className={ui.primaryButton} disabled={submitting} type="submit">
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>
        <Link className={`${ui.ghostButton} mt-3`} href="/login">I already have an account</Link>
      </section>
    </main>
  );
}

function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}
