"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { loginOrganizer } from "../../../lib/admin-api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("organizer@ticketbox.vn");
  const [password, setPassword] = useState("password123");
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
    <main className="admin-login-shell">
      <section className="login-panel" aria-labelledby="admin-login-title">
        <div>
          <p className="eyebrow">TicketBox Admin</p>
          <h1 id="admin-login-title">Organizer sign in</h1>
          <p className="muted">
            Manage concerts, inventory, check-in audits, bios, and refund queues from one workspace.
          </p>
        </div>

        <form className="form-grid" onSubmit={submit}>
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
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
