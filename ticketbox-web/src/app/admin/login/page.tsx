"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { loginOrganizer } from "../../../lib/admin-api";
import { ui } from "../../../components/ui";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("organizer@ticketbox.vn");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await loginOrganizer(email, password);
      router.replace("/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={ui.authPage}>
      <section className="w-full max-w-md border border-neutral-950 bg-white p-6 sm:p-8" aria-labelledby="admin-login-title">
        <div>
          <p className={ui.eyebrow}>TicketBox Admin</p>
          <h1 className="mt-3 text-3xl font-black" id="admin-login-title">Organizer sign in</h1>
          <p className={`${ui.muted} mt-3`}>
            Manage concerts, inventory, check-in audits, bios, and refund queues from one workspace.
          </p>
        </div>

        <form className={`${ui.form} mt-8`} onSubmit={submit}>
          <label>
            Email
            <input
              autoComplete="email"
              inputMode="email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? (
            <p className={ui.alertError} role="alert">
              {error}
            </p>
          ) : null}
          <button className={ui.primaryButton} disabled={submitting} type="submit">
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
