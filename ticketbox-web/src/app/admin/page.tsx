"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminOrder,
  ArtistBio,
  CheckinConflict,
  ConcertDetail,
  ConcertForm,
  ConcertStats,
  ConcertSummary,
  TicketType,
  TicketTypeForm,
  adminGet,
  adminJson,
  clearSession,
  readSession,
  toConcertRequest,
  toTicketTypeRequest,
  uploadArtistPdf,
  VipImportSummary,
  triggerVipImport,
  VipGuestResponse,
  getVipGuests,
  deleteVipGuest
} from "../../lib/admin-api";
import { ui } from "../../components/ui";

const EMPTY_CONCERT: ConcertForm = {
  name: "",
  description: "",
  venue: "",
  eventDate: "",
  eventCode: "",
  artistBio: "",
  seatMapSvg: "<svg viewBox=\"0 0 640 360\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"640\" height=\"360\" fill=\"#f8fafc\"/><text x=\"320\" y=\"180\" text-anchor=\"middle\" fill=\"#0f172a\">Seat map</text></svg>"
};

const EMPTY_TICKET: TicketTypeForm = {
  name: "SVIP",
  zone: "SVIP",
  price: "3500000",
  totalQuantity: "200",
  remainingQuantity: "",
  saleOpensAt: "",
  perUserLimit: "2"
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [sessionEmail, setSessionEmail] = useState("");
  const [concerts, setConcerts] = useState<ConcertSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<ConcertDetail | null>(null);
  const [form, setForm] = useState<ConcertForm>(EMPTY_CONCERT);
  const [ticketForm, setTicketForm] = useState<TicketTypeForm>(EMPTY_TICKET);
  const [bio, setBio] = useState<ArtistBio | null>(null);
  const [bioDraft, setBioDraft] = useState("");
  const [stats, setStats] = useState<ConcertStats | null>(null);
  const [conflicts, setConflicts] = useState<CheckinConflict[]>([]);
  const [refunds, setRefunds] = useState<AdminOrder[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vipSummaries, setVipSummaries] = useState<VipImportSummary[]>([]);
  const [importing, setImporting] = useState(false);
  const [vipGuests, setVipGuests] = useState<VipGuestResponse[]>([]);
  const [vipSearchQuery, setVipSearchQuery] = useState("");
  const [vipImportMessage, setVipImportMessage] = useState("");
  const [vipImportError, setVipImportError] = useState("");
  const [vipDirectoryMessage, setVipDirectoryMessage] = useState("");
  const [vipDirectoryError, setVipDirectoryError] = useState("");


  useEffect(() => {
    const session = readSession();
    if (!session || session.role !== "ORGANIZER") {
      router.replace("/admin/login");
      return;
    }
    setSessionEmail(session.email);
    void loadConcerts();
  }, [router]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    void loadWorkspace(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || bio?.bioStatus !== "GENERATING") {
      return;
    }
    const timer = window.setInterval(() => {
      void loadBio(selectedId);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [bio?.bioStatus, selectedId]);

  const selectedConcert = useMemo(
    () => concerts.find((concert) => concert.id === selectedId) ?? null,
    [concerts, selectedId]
  );
  const bioStatus = bio?.bioStatus || "Not started";
  const hasPublicBio = Boolean((bio?.publicArtistBio || detail?.artistBio || "").trim());
  const bioGenerating = bio?.bioStatus === "GENERATING";
  const bioFailed = bio?.bioStatus === "FAILED";
  const bioStatusLabel = bioGenerating ? "PROCESSING" : bioStatus;

  async function loadConcerts() {
    setLoading(true);
    setError("");
    try {
      const owned = await adminGet<ConcertSummary[]>("/api/admin/concerts");
      setConcerts(owned);
      setSelectedId((current) => current || owned[0]?.id || "");
      if (owned.length === 0) {
        setDetail(null);
        setForm(EMPTY_CONCERT);
      }
    } catch (caught) {
      handleError(caught);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspace(concertId: string) {
    setError("");
    try {
      const [nextDetail, nextStats, nextBio, nextConflicts, nextRefunds, nextVips] = await Promise.all([
        adminGet<ConcertDetail>(`/api/concerts/${concertId}`),
        adminGet<ConcertStats>(`/api/admin/concerts/${concertId}/stats`),
        adminGet<ArtistBio>(`/api/admin/concerts/${concertId}/artist-bio`),
        adminGet<CheckinConflict[]>(`/api/admin/concerts/${concertId}/checkin-conflicts`),
        adminGet<AdminOrder[]>(`/api/admin/orders?concertId=${concertId}&status=REFUND_REQUIRED`),
        getVipGuests(concertId)
      ]);
      setDetail(nextDetail);
      setForm(fromDetail(nextDetail));
      setStats(nextStats);
      setBio(nextBio);
      setBioDraft(nextBio.artistBioDraft || "");
      setConflicts(nextConflicts);
      setRefunds(nextRefunds);
      setVipGuests(nextVips);
      setVipSearchQuery("");
      setVipImportMessage("");
      setVipImportError("");
      setVipDirectoryMessage("");
      setVipDirectoryError("");
      setTicketForm(EMPTY_TICKET);
    } catch (caught) {
      handleError(caught);
    }
  }

  async function loadBio(concertId: string) {
    try {
      const nextBio = await adminGet<ArtistBio>(`/api/admin/concerts/${concertId}/artist-bio`);
      setBio(nextBio);
      setBioDraft(nextBio.artistBioDraft || "");
    } catch (caught) {
      handleError(caught);
    }
  }

  async function submitConcert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const body = toConcertRequest(form);
      const saved = detail
        ? await adminJson<ConcertDetail>(`/api/admin/concerts/${detail.id}`, "PUT", body)
        : await adminJson<ConcertDetail>("/api/admin/concerts", "POST", body);
      setDetail(saved);
      setSelectedId(saved.id);
      await loadConcerts();
      setMessage(detail ? "Concert updated." : "Concert created.");
    } catch (caught) {
      handleError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function submitTicketType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const body = toTicketTypeRequest(ticketForm);
      const path = ticketForm.id
        ? `/api/admin/concerts/${detail.id}/ticket-types/${ticketForm.id}`
        : `/api/admin/concerts/${detail.id}/ticket-types`;
      await adminJson<TicketType>(path, ticketForm.id ? "PUT" : "POST", body);
      await loadWorkspace(detail.id);
      setMessage(ticketForm.id ? "Ticket type updated." : "Ticket type added.");
    } catch (caught) {
      handleError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function publishConcert() {
    if (!detail) {
      return;
    }
    await runAction(async () => {
      await adminJson<ConcertDetail>(`/api/admin/concerts/${detail.id}/publish`, "POST");
      await loadConcerts();
      await loadWorkspace(detail.id);
      setMessage("Concert published.");
    });
  }

  async function cancelConcert() {
    if (!detail || !window.confirm("Cancel this concert and move paid orders to refund review?")) {
      return;
    }
    await runAction(async () => {
      await adminJson<void>(`/api/admin/concerts/${detail.id}`, "DELETE");
      await loadConcerts();
      await loadWorkspace(detail.id);
      setMessage("Concert cancelled.");
    });
  }

  async function saveBioDraft() {
    if (!detail) {
      return;
    }
    await runAction(async () => {
      const nextBio = await adminJson<ArtistBio>(`/api/admin/concerts/${detail.id}/artist-bio`, "PUT", {
        draftText: bioDraft
      });
      setBio(nextBio);
      setMessage("Artist bio draft saved.");
    });
  }

  async function publishBio() {
    if (!detail) {
      return;
    }
    await runAction(async () => {
      const nextBio = await adminJson<ArtistBio>(`/api/admin/concerts/${detail.id}/artist-bio/publish`, "POST");
      setBio(nextBio);
      await loadWorkspace(detail.id);
      setMessage("Artist bio published.");
    });
  }

  async function rejectBio() {
    if (!detail) {
      return;
    }
    await runAction(async () => {
      const nextBio = await adminJson<ArtistBio>(`/api/admin/concerts/${detail.id}/artist-bio/reject`, "POST", {
        reason: "Rejected from admin dashboard"
      });
      setBio(nextBio);
      setBioDraft("");
      await loadWorkspace(detail.id);
      setMessage("Artist bio rejected.");
    });
  }

  async function handlePdfUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!detail || !file) {
      return;
    }
    await runAction(async () => {
      await uploadArtistPdf(detail.id, file);
      await loadBio(detail.id);
      setMessage("PDF accepted. Bio generation started.");
    });
  }

  async function handleSeatMapUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    setForm((current) => ({ ...current, seatMapSvg: text }));
  }

  async function markRefunded(orderId: string) {
    if (!detail) {
      return;
    }
    await runAction(async () => {
      await adminJson<void>(`/api/admin/orders/${orderId}/mark-refunded`, "POST");
      setRefunds(await adminGet<AdminOrder[]>(`/api/admin/orders?concertId=${detail.id}&status=REFUND_REQUIRED`));
      setMessage("Order marked refunded.");
    });
  }

  async function handleVipImport() {
    setImporting(true);
    setVipImportMessage("");
    setVipImportError("");
    try {
      const summaries = await triggerVipImport();
      setVipSummaries(summaries);
      if (summaries.length === 0) {
        setVipImportMessage("No new files found to process.");
      } else {
        setVipImportMessage(`Successfully processed ${summaries.length} import file(s).`);
      }
      setTimeout(() => {
        setVipImportMessage("");
      }, 5000);
      if (detail?.id) {
        const nextVips = await getVipGuests(detail.id);
        setVipGuests(nextVips);
      }
    } catch (caught) {
      setVipImportError(caught instanceof Error ? caught.message : String(caught));
      setTimeout(() => {
        setVipImportError("");
      }, 5000);
    } finally {
      setImporting(false);
    }
  }

  async function handleDeleteVip(vipId: string, vipName: string) {
    if (!detail?.id) return;
    if (!window.confirm(`Are you sure you want to remove VIP guest "${vipName}"?`)) {
      return;
    }
    setVipDirectoryMessage("");
    setVipDirectoryError("");
    try {
      await deleteVipGuest(detail.id, vipId);
      const nextVips = await getVipGuests(detail.id);
      setVipGuests(nextVips);
      setVipDirectoryMessage(`Successfully removed VIP guest "${vipName}".`);
      setTimeout(() => {
        setVipDirectoryMessage("");
      }, 5000);
    } catch (caught) {
      setVipDirectoryError(caught instanceof Error ? caught.message : String(caught));
      setTimeout(() => {
        setVipDirectoryError("");
      }, 5000);
    }
  }

  const filteredVips = useMemo(() => {
    const query = vipSearchQuery.trim().toLowerCase();
    if (!query) {
      return vipGuests;
    }
    return vipGuests.filter(
      (vip) =>
        vip.name.toLowerCase().includes(query) ||
        vip.phoneMasked.toLowerCase().includes(query) ||
        (vip.sponsor && vip.sponsor.toLowerCase().includes(query)) ||
        vip.zone.toLowerCase().includes(query)
    );
  }, [vipGuests, vipSearchQuery]);

  async function runAction(action: () => Promise<void>) {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await action();
    } catch (caught) {
      handleError(caught);
    } finally {
      setSaving(false);
    }
  }

  function handleError(caught: unknown) {
    const nextError = caught instanceof Error ? caught.message : "Action failed";
    if (nextError.includes("Organizer session required")) {
      router.replace("/admin/login");
      return;
    }
    setError(nextError);
  }

  function signOut() {
    clearSession();
    router.replace("/admin/login");
  }

  return (
    <main className={ui.adminPage}>
      <header className="flex flex-wrap items-end justify-between gap-6 border-y border-neutral-950 py-5">
        <div>
          <p className={ui.eyebrow}>TicketBox Admin</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Organizer workspace</h1>
          <p className={`${ui.muted} mt-3`}>Manage event setup, inventory, check-in exceptions, and refund queues.</p>
        </div>
        <div className={ui.navActions}>
          <span className="hidden max-w-56 truncate text-sm text-neutral-600 sm:inline">{sessionEmail}</span>
          <button className={ui.ghostButton} type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {message ? <p className={`${ui.alertSuccess} mt-6`}>{message}</p> : null}
      {error ? <p className={`${ui.alertError} mt-6`} role="alert">{error}</p> : null}

      <section className="mt-6 grid gap-6 xl:grid-cols-[23rem_minmax(0,1fr)]">
        <aside className="border border-neutral-950 p-5" aria-label="Concert list">
          <div className={ui.sectionHeading}>
            <div>
              <p className={ui.eyebrow}>Events</p>
              <h2 className="mt-2 text-2xl font-bold">Concerts</h2>
            </div>
            <button
              className={ui.secondaryButton}
              type="button"
              onClick={() => {
                setDetail(null);
                setSelectedId("");
                setForm(EMPTY_CONCERT);
                setBio(null);
                setStats(null);
                setConflicts([]);
                setRefunds([]);
              }}
            >
              New
            </button>
          </div>
          {loading ? <p className={`${ui.muted} mt-5`}>Loading concerts...</p> : null}
          <div className={`${ui.tableWrap} mt-5`}>
            <table className={`${ui.table} min-w-[33rem]`}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {concerts.map((concert) => (
                  <tr
                    className={concert.id === selectedId ? "bg-neutral-100" : ""}
                    key={concert.id}
                  >
                    <td>
                      <button className={ui.rowButton} type="button" onClick={() => setSelectedId(concert.id)}>
                        <strong>{concert.name}</strong>
                        <span>{concert.eventCode}</span>
                      </button>
                    </td>
                    <td>
                      <StatusBadge status={concert.status} />
                    </td>
                    <td>{formatDate(concert.eventDate)}</td>
                  </tr>
                ))}
                {concerts.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No concerts yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </aside>

        <section aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-5 border-b border-neutral-950 pb-5">
            <div>
              <p className={ui.eyebrow}>{detail ? "Editing" : "Creating"}</p>
              <h2 className="mt-2 text-3xl font-black">{detail?.name || "New concert"}</h2>
              {selectedConcert ? <p className={`${ui.muted} mt-2`}>{selectedConcert.venue}</p> : null}
            </div>
            {detail ? (
              <div className={ui.actionRow}>
                <button className={ui.secondaryButton} disabled={saving || detail.status !== "DRAFT"} type="button" onClick={publishConcert}>
                  Publish
                </button>
                <button className={ui.dangerButton} disabled={saving || detail.status === "CANCELLED"} type="button" onClick={cancelConcert}>
                  Cancel
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className={`${ui.panel} xl:col-span-2`} aria-labelledby="concert-form-title">
              <h3 className="text-xl font-bold" id="concert-form-title">Concert details</h3>
              <form className={`${ui.form} mt-5 md:grid-cols-2`} onSubmit={submitConcert}>
                <label>
                  Name
                  <input required value={form.name} onChange={(event) => setFormValue("name", event.target.value)} />
                </label>
                <label>
                  Event code
                  <input required value={form.eventCode} onChange={(event) => setFormValue("eventCode", event.target.value)} />
                </label>
                <label>
                  Venue
                  <input required value={form.venue} onChange={(event) => setFormValue("venue", event.target.value)} />
                </label>
                <label>
                  Event date
                  <input required type="datetime-local" value={form.eventDate} onChange={(event) => setFormValue("eventDate", event.target.value)} />
                </label>
                <label className="md:col-span-2">
                  Description
                  <textarea value={form.description} onChange={(event) => setFormValue("description", event.target.value)} />
                </label>
                <label className="md:col-span-2">
                  Published artist bio
                  <textarea value={form.artistBio} onChange={(event) => setFormValue("artistBio", event.target.value)} />
                </label>
                <label className="md:col-span-2">
                  Seat map SVG
                  <input accept=".svg,image/svg+xml" type="file" onChange={handleSeatMapUpload} />
                  <textarea required value={form.seatMapSvg} onChange={(event) => setFormValue("seatMapSvg", event.target.value)} />
                </label>
                <button className={`${ui.primaryButton} md:col-span-2`} disabled={saving} type="submit">
                  {saving ? "Saving..." : detail ? "Save concert" : "Create concert"}
                </button>
              </form>
            </section>

            <section className={ui.panel} aria-labelledby="ticket-form-title">
              <h3 className="text-xl font-bold" id="ticket-form-title">Ticket types</h3>
              <form className={`${ui.form} mt-5`} onSubmit={submitTicketType}>
                <label>
                  Name
                  <input required value={ticketForm.name} onChange={(event) => setTicketValue("name", event.target.value)} />
                </label>
                <label>
                  Zone
                  <input required value={ticketForm.zone} onChange={(event) => setTicketValue("zone", event.target.value)} />
                </label>
                <label>
                  Price
                  <input required min="0" type="number" value={ticketForm.price} onChange={(event) => setTicketValue("price", event.target.value)} />
                </label>
                <label>
                  Total quantity
                  <input required min="1" type="number" value={ticketForm.totalQuantity} onChange={(event) => setTicketValue("totalQuantity", event.target.value)} />
                </label>
                <label>
                  Remaining quantity
                  <input min="0" type="number" value={ticketForm.remainingQuantity} onChange={(event) => setTicketValue("remainingQuantity", event.target.value)} />
                </label>
                <label>
                  Sale opens
                  <input required type="datetime-local" value={ticketForm.saleOpensAt} onChange={(event) => setTicketValue("saleOpensAt", event.target.value)} />
                </label>
                <label>
                  Per-user limit
                  <input required min="1" type="number" value={ticketForm.perUserLimit} onChange={(event) => setTicketValue("perUserLimit", event.target.value)} />
                </label>
                <button className={ui.secondaryButton} disabled={!detail || saving} type="submit">
                  {ticketForm.id ? "Update ticket type" : "Add ticket type"}
                </button>
              </form>
              <div className="mt-5 grid border-t border-neutral-300">
                {detail?.ticketTypes.map((ticket) => (
                  <button className="flex min-h-12 items-center justify-between gap-4 border-b border-neutral-300 py-3 text-left text-sm transition-colors hover:text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950" key={ticket.id} type="button" onClick={() => setTicketForm(fromTicket(ticket))}>
                    <span>{ticket.name} / {ticket.zone}</span>
                    <strong>{ticket.remainingQuantity}/{ticket.totalQuantity}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className={ui.panel} aria-labelledby="bio-title">
              <h3 className="text-xl font-bold" id="bio-title">AI artist bio</h3>
              <div className="mt-5 grid gap-3 border-y border-neutral-300 py-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span>Status</span>
                  <span className={`${ui.statusBadge} min-w-[7.75rem] items-center justify-center`}>
                    {bioGenerating ? (
                      <>
                        {bioStatusLabel}
                        <AnimatedEllipsis />
                      </>
                    ) : bioStatusLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Public bio</span>
                  <strong>{hasPublicBio ? "Published" : "Not published"}</strong>
                </div>
              </div>
              {bioGenerating ? (
                <div className="mt-4 border border-neutral-950 bg-neutral-50 px-4 py-3 text-sm text-neutral-900" role="status" aria-live="polite">
                  <p className="font-semibold">
                    Generating draft
                    <AnimatedEllipsis />
                  </p>
                  <p className="mt-1 text-neutral-600">
                    {hasPublicBio ? "A public bio is already live while the new draft is processing." : "No public bio is live yet while the first draft is processing."}
                  </p>
                </div>
              ) : null}
              {bio?.bioError ? (
                <div className={`${ui.alertError} mt-4`} role="alert">
                  <p>{bio.bioError}</p>
                  {bioFailed ? <p className="mt-2 font-normal">Retry with a text-based PDF press kit, or try again when the AI service is available.</p> : null}
                </div>
              ) : null}
              <label className="mt-4 grid gap-2 border border-dashed border-neutral-500 p-4 text-sm font-medium text-neutral-950">
                Press kit PDF
                <span className="font-normal text-neutral-600">Upload a PDF press kit with selectable text. Image-only scans may fail. Maximum size: 20MB.</span>
                <input accept="application/pdf,.pdf" disabled={!detail || saving} type="file" onChange={handlePdfUpload} />
              </label>
              <label className={`${ui.form} mt-4`}>
                Draft text
                <textarea placeholder={bioGenerating ? "Generating draft..." : undefined} value={bioDraft} onChange={(event) => setBioDraft(event.target.value)} />
              </label>
              <div className={`${ui.actionRow} mt-4`}>
                <button className={ui.secondaryButton} disabled={!detail || saving || !bioDraft.trim()} type="button" onClick={saveBioDraft}>
                  Save draft
                </button>
                <button className={ui.primaryButton} disabled={!detail || saving || !bioDraft.trim()} type="button" onClick={publishBio}>
                  Publish bio
                </button>
                <button className={ui.ghostButton} disabled={!detail || saving} type="button" onClick={rejectBio}>
                  Reject
                </button>
              </div>
            </section>

            <section className={ui.panel} aria-labelledby="stats-title">
              <h3 className="text-xl font-bold" id="stats-title">Stats</h3>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Metric label="Revenue" value={formatMoney(stats?.revenueTotal || 0)} />
                <Metric label="Check-ins" value={String(stats?.checkinCount || 0)} />
              </div>
              <div className="mt-5 grid gap-3">
                {stats?.ticketsSoldPerType.map((item) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3 text-sm" key={item.ticketTypeId}>
                    <div>
                      <span className="block text-neutral-700">{item.name}</span>
                      <div className="mt-2 h-2 bg-neutral-200">
                        <div className="h-full bg-neutral-950" style={{ width: `${Math.min(100, item.soldQuantity * 8)}%` }} />
                      </div>
                    </div>
                    <strong className="text-right">{item.soldQuantity}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className={ui.panel} aria-labelledby="vip-import-title">
              <h3 className="text-xl font-bold" id="vip-import-title">VIP Guest Import</h3>
              <p className={`${ui.muted} mt-2`}>
                Manually process pending VIP guest list CSV files from the server's import directory.
              </p>
              
              <div className="mt-4">
                <button
                  className={ui.primaryButton}
                  disabled={importing}
                  type="button"
                  onClick={handleVipImport}
                >
                  {importing ? "Importing files..." : "Trigger VIP Import"}
                </button>
                {vipImportMessage ? <p className={`${ui.alertSuccess} mt-4`}>{vipImportMessage}</p> : null}
                {vipImportError ? <p className={`${ui.alertError} mt-4`} role="alert">{vipImportError}</p> : null}
              </div>

              {vipSummaries.length > 0 ? (
                <div className="mt-5">
                  <h4 className="font-semibold text-sm mb-3">Import Summaries</h4>
                  <div className={ui.tableWrap}>
                    <table className={ui.table}>
                      <thead>
                        <tr>
                          <th>File Name</th>
                          <th>Total</th>
                          <th>Inserted</th>
                          <th>Updated</th>
                          <th>Deactivated</th>
                          <th>Skipped</th>
                          <th>Errored</th>
                          <th>Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vipSummaries.map((summary, idx) => (
                          <tr key={idx}>
                            <td>
                              <span className="font-semibold block">{summary.fileName}</span>
                              {summary.archived && summary.archive ? (
                                <span className="block text-xs text-neutral-500 mt-1">Archived to: {summary.archive}</span>
                              ) : null}
                            </td>
                            <td>{summary.totalRows}</td>
                            <td>{summary.inserted}</td>
                            <td>{summary.updated}</td>
                            <td>{summary.deactivated}</td>
                            <td>{summary.skipped}</td>
                            <td className={summary.errored > 0 ? "text-red-700 font-semibold" : ""}>
                              {summary.errored}
                            </td>
                            <td>{summary.message || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </section>

            <section className={ui.panel} aria-labelledby="vip-directory-title">
              <h3 className="text-xl font-bold" id="vip-directory-title">
                VIP Guest Directory {detail ? `— ${detail.name}` : ""}
              </h3>
              <p className={`${ui.muted} mt-2`}>
                Search and view the active list of imported VIP guests for this event.
              </p>

              {vipDirectoryMessage ? <p className={`${ui.alertSuccess} mt-4`}>{vipDirectoryMessage}</p> : null}
              {vipDirectoryError ? <p className={`${ui.alertError} mt-4`} role="alert">{vipDirectoryError}</p> : null}
              
              <div className="mt-4">
                <input
                  className="w-full border border-neutral-500 bg-white px-3 py-2 text-base font-normal text-neutral-950 outline-none transition-colors focus:border-neutral-950"
                  placeholder="Filter by name, phone, sponsor, or zone..."
                  type="text"
                  value={vipSearchQuery}
                  onChange={(e) => setVipSearchQuery(e.target.value)}
                />
              </div>

              <div className="mt-5">
                {filteredVips.length > 0 ? (
                  <div className={ui.tableWrap}>
                    <table className={ui.table}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Phone</th>
                          <th>Sponsor</th>
                          <th>Zone</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVips.map((vip) => (
                          <tr key={vip.id}>
                            <td>{vip.name}</td>
                            <td>{vip.phoneMasked}</td>
                            <td>{vip.sponsor || "-"}</td>
                            <td>
                              <span className={ui.statusBadge}>{vip.zone}</span>
                            </td>
                            <td>
                              {vip.entered ? (
                                <span className="inline-flex border border-neutral-950 bg-neutral-950 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white">
                                  Entered {vip.enteredAt ? formatDate(vip.enteredAt) : ""}
                                </span>
                              ) : (
                                <span className={ui.statusBadge}>
                                  Registered
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                className={`${ui.dangerButton} ${ui.compactButton}`}
                                type="button"
                                onClick={() => handleDeleteVip(vip.id, vip.name)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className={ui.muted}>
                    {vipGuests.length === 0
                      ? "No VIP guests have been registered for this event."
                      : "No VIP guests match your search filter."}
                  </p>
                )}
              </div>
            </section>



            <section className={`${ui.panel} xl:col-span-2`} aria-labelledby="conflicts-title">
              <h3 className="text-xl font-bold" id="conflicts-title">Check-in conflicts</h3>
              <div className={`${ui.tableWrap} mt-5`}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Checker</th>
                      <th>Gate</th>
                      <th>Zone</th>
                      <th>Device</th>
                      <th>Attempted</th>
                      <th>Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflicts.map((conflict) => (
                      <tr key={conflict.id}>
                        <td>{shortId(conflict.ticketId)}</td>
                        <td>{shortId(conflict.attemptedBy)}</td>
                        <td>{conflict.gateId}{conflict.laneId ? ` / ${conflict.laneId}` : ""}</td>
                        <td>{conflict.zone}</td>
                        <td>{conflict.deviceId}</td>
                        <td>{formatDate(conflict.attemptedAt)}</td>
                        <td>{conflict.timeDeltaSeconds}s</td>
                      </tr>
                    ))}
                    {conflicts.length === 0 ? (
                      <tr><td colSpan={7}>No conflicts recorded.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={`${ui.panel} xl:col-span-2`} aria-labelledby="refunds-title">
              <h3 className="text-xl font-bold" id="refunds-title">Refunds</h3>
              <div className={`${ui.tableWrap} mt-5`}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Buyer</th>
                      <th>Provider</th>
                      <th>Gateway ref</th>
                      <th>Reason</th>
                      <th>Paid</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.map((order) => (
                      <tr key={order.orderId}>
                        <td>{shortId(order.orderId)}</td>
                        <td>{shortId(order.userId)}</td>
                        <td>{order.paymentProvider || "-"}</td>
                        <td>{order.paymentRef || "-"}</td>
                        <td>{order.refundReason || "Manual refund required"}</td>
                        <td>{order.paidAt ? formatDate(order.paidAt) : "-"}</td>
                        <td>
                          <button className={`${ui.secondaryButton} ${ui.compactButton}`} disabled={saving} type="button" onClick={() => markRefunded(order.orderId)}>
                            Mark refunded
                          </button>
                        </td>
                      </tr>
                    ))}
                    {refunds.length === 0 ? (
                      <tr><td colSpan={7}>No refund-required orders.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </section>
    </main>
  );

  function setFormValue(field: keyof ConcertForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setTicketValue(field: keyof TicketTypeForm, value: string) {
    setTicketForm((current) => ({ ...current, [field]: value }));
  }
}

function StatusBadge({ status }: { status: ConcertSummary["status"] }) {
  return <span className={ui.statusBadge}>{status}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={ui.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AnimatedEllipsis() {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDotCount((current) => current === 3 ? 1 : current + 1);
    }, 450);
    return () => window.clearInterval(timer);
  }, []);

  return <span aria-hidden="true" className="inline-block w-4 text-left">{".".repeat(dotCount)}</span>;
}

function fromDetail(detail: ConcertDetail): ConcertForm {
  return {
    name: detail.name,
    description: detail.description || "",
    venue: detail.venue,
    eventDate: toDateTimeLocal(detail.eventDate),
    eventCode: detail.eventCode,
    artistBio: detail.artistBio || "",
    seatMapSvg: detail.seatMapSvg || ""
  };
}

function fromTicket(ticket: TicketType): TicketTypeForm {
  return {
    id: ticket.id,
    name: ticket.name,
    zone: ticket.zone,
    price: String(ticket.price),
    totalQuantity: String(ticket.totalQuantity),
    remainingQuantity: String(ticket.remainingQuantity),
    saleOpensAt: toDateTimeLocal(ticket.saleOpensAt),
    perUserLimit: String(ticket.perUserLimit)
  };
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}

function shortId(value: string) {
  return value.slice(0, 8);
}
