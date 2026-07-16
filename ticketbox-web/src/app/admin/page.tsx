"use client";

import { ChangeEvent, FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminOrder,
  ArtistBio,
  CheckinConflict,
  CheckerAccount,
  CheckerAssignment,
  ConcertDetail,
  ConcertForm,
  ConcertStats,
  ConcertSummary,
  TicketType,
  TicketTypeForm,
  adminGet,
  adminJson,
  clearSession,
  createCheckerAccount,
  createCheckerAssignment,
  readSession,
  toConcertRequest,
  toTicketTypeRequest,
  uploadArtistPdf,
  VipImportSummary,
  uploadVipCsv,
  VipGuestResponse,
  getVipGuests,
  deleteVipGuest,
  deleteConcert,
  deleteTicketType,
  getCheckerAccounts,
  getCheckerAssignments,
  resetCheckerPassword,
  updateCheckerAssignmentState,
  updateCheckerStatus
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

type AssignmentForm = {
  concertId: string;
  gateId: string;
  laneId: string;
  deviceId: string;
  allowedZones: string;
  state: CheckerAssignment["state"];
};

const EMPTY_ASSIGNMENT: AssignmentForm = {
  concertId: "",
  gateId: "",
  laneId: "",
  deviceId: "",
  allowedZones: "",
  state: "ACTIVE"
};

type AdminSection = "dashboard" | "concerts" | "checkers" | "vip" | "checkins" | "refunds";

const ADMIN_SECTIONS: Array<{ id: AdminSection; label: string; description: string }> = [
  { id: "dashboard", label: "Dashboard", description: "Operational overview" },
  { id: "concerts", label: "Concerts", description: "Event setup and inventory" },
  { id: "checkers", label: "Checkers & Gates", description: "Staff access and assignments" },
  { id: "vip", label: "VIP Guests", description: "Imports and guest directory" },
  { id: "checkins", label: "Check-ins", description: "Entry stats and conflicts" },
  { id: "refunds", label: "Refunds", description: "Manual refund queue" }
];

export default function AdminDashboardPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AdminSection>("dashboard");
  const [sessionEmail, setSessionEmail] = useState("");
  const [checkers, setCheckers] = useState<CheckerAccount[]>([]);
  const [checkerEmail, setCheckerEmail] = useState("");
  const [checkerPassword, setCheckerPassword] = useState("");
  const [checkerSearch, setCheckerSearch] = useState("");
  const [checkerLoading, setCheckerLoading] = useState(true);
  const [checkerSaving, setCheckerSaving] = useState(false);
  const [checkerMessage, setCheckerMessage] = useState("");
  const [checkerError, setCheckerError] = useState("");
  const [resettingCheckerId, setResettingCheckerId] = useState("");
  const [replacementPassword, setReplacementPassword] = useState("");
  const [managingCheckerId, setManagingCheckerId] = useState("");
  const [checkerAssignments, setCheckerAssignments] = useState<Record<string, CheckerAssignment[]>>({});
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(EMPTY_ASSIGNMENT);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
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
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vipSummaries, setVipSummaries] = useState<VipImportSummary[]>([]);
  const [importing, setImporting] = useState(false);
  const [vipGuests, setVipGuests] = useState<VipGuestResponse[]>([]);
  const [vipSearchQuery, setVipSearchQuery] = useState("");
  const [vipImportMessage, setVipImportMessage] = useState("");
  const [vipImportError, setVipImportError] = useState("");
  const [vipDirectoryMessage, setVipDirectoryMessage] = useState("");
  const [vipDirectoryError, setVipDirectoryError] = useState("");
  const [vipDirectoryLoading, setVipDirectoryLoading] = useState(false);
  const [pendingVipFile, setPendingVipFile] = useState<File | null>(null);
  const [deletingVipId, setDeletingVipId] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const workspaceRequestRef = useRef(0);
  const selectedIdRef = useRef("");


  useEffect(() => {
    const session = readSession();
    if (!session || session.role !== "ORGANIZER") {
      router.replace("/admin/login");
      return;
    }
    setSessionEmail(session.email);
    void Promise.all([loadConcerts(), loadCheckers()]);
  }, [router]);

  useEffect(() => {
    function syncSectionFromHash() {
      const section = window.location.hash.slice(1);
      if (ADMIN_SECTIONS.some((item) => item.id === section)) {
        setActiveSection(section as AdminSection);
      }
    }
    syncSectionFromHash();
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (!selectedId) {
      workspaceRequestRef.current += 1;
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
  const activeSectionMeta = ADMIN_SECTIONS.find((section) => section.id === activeSection) || ADMIN_SECTIONS[0];
  const vipImportNeedsAttention = vipSummaries.some(
    (summary) => summary.skipped > 0 || summary.errored > 0 || summary.archive === "error"
  );

  const filteredCheckers = useMemo(() => {
    const query = checkerSearch.trim().toLowerCase();
    return query
      ? checkers.filter((checker) => checker.email.toLowerCase().includes(query))
      : checkers;
  }, [checkerSearch, checkers]);

  async function loadCheckers() {
    setCheckerLoading(true);
    setCheckerError("");
    try {
      setCheckers(await getCheckerAccounts());
    } catch (caught) {
      setCheckerError(caught instanceof Error ? caught.message : "Could not load checker accounts");
    } finally {
      setCheckerLoading(false);
    }
  }

  async function submitCheckerAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckerSaving(true);
    setCheckerMessage("");
    setCheckerError("");
    try {
      const checker = await createCheckerAccount(checkerEmail.trim(), checkerPassword);
      setCheckers((current) => [checker, ...current]);
      setCheckerEmail("");
      setCheckerPassword("");
      setCheckerMessage(`Checker account ${checker.email} created.`);
    } catch (caught) {
      setCheckerError(caught instanceof Error ? caught.message : "Could not create checker account");
    } finally {
      setCheckerSaving(false);
    }
  }

  async function toggleCheckerStatus(checker: CheckerAccount) {
    const enabled = !checker.enabled;
    if (!enabled && !window.confirm(`Disable ${checker.email}? Existing sessions will end immediately.`)) {
      return;
    }
    setCheckerSaving(true);
    setCheckerMessage("");
    setCheckerError("");
    try {
      const updated = await updateCheckerStatus(checker.id, enabled);
      setCheckers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setCheckerMessage(`${updated.email} ${updated.enabled ? "enabled" : "disabled"}.`);
    } catch (caught) {
      setCheckerError(caught instanceof Error ? caught.message : "Could not update checker status");
    } finally {
      setCheckerSaving(false);
    }
  }

  async function submitCheckerPassword(event: FormEvent<HTMLFormElement>, checker: CheckerAccount) {
    event.preventDefault();
    setCheckerSaving(true);
    setCheckerMessage("");
    setCheckerError("");
    try {
      await resetCheckerPassword(checker.id, replacementPassword);
      setResettingCheckerId("");
      setReplacementPassword("");
      setCheckerMessage(`Password reset for ${checker.email}. Existing sessions were ended.`);
    } catch (caught) {
      setCheckerError(caught instanceof Error ? caught.message : "Could not reset checker password");
    } finally {
      setCheckerSaving(false);
    }
  }

  async function toggleGateManagement(checker: CheckerAccount) {
    if (managingCheckerId === checker.id) {
      setManagingCheckerId("");
      return;
    }
    setManagingCheckerId(checker.id);
    setResettingCheckerId("");
    setAssignmentForm({ ...EMPTY_ASSIGNMENT, concertId: selectedId || concerts[0]?.id || "" });
    if (checkerAssignments[checker.id]) {
      return;
    }
    setAssignmentLoading(true);
    setCheckerError("");
    try {
      const assignments = await getCheckerAssignments(checker.id);
      setCheckerAssignments((current) => ({ ...current, [checker.id]: assignments }));
    } catch (caught) {
      setCheckerError(caught instanceof Error ? caught.message : "Could not load gate assignments");
    } finally {
      setAssignmentLoading(false);
    }
  }

  async function submitCheckerAssignment(event: FormEvent<HTMLFormElement>, checker: CheckerAccount) {
    event.preventDefault();
    const allowedZones = Array.from(new Set(
      assignmentForm.allowedZones.split(",").map((zone) => zone.trim()).filter(Boolean)
    ));
    if (allowedZones.length === 0) {
      setCheckerError("Enter at least one allowed zone.");
      return;
    }
    setAssignmentSaving(true);
    setCheckerMessage("");
    setCheckerError("");
    try {
      const assignment = await createCheckerAssignment(assignmentForm.concertId, {
        checkerId: checker.id,
        deviceId: assignmentForm.deviceId.trim() || undefined,
        gateId: assignmentForm.gateId.trim(),
        laneId: assignmentForm.laneId.trim() || undefined,
        allowedZones,
        state: assignmentForm.state
      });
      const assignments = await getCheckerAssignments(checker.id);
      setCheckerAssignments((current) => ({ ...current, [checker.id]: assignments }));
      setAssignmentForm((current) => ({ ...EMPTY_ASSIGNMENT, concertId: current.concertId }));
      setCheckerMessage(`Gate ${assignment.gateId} assigned to ${checker.email}.`);
    } catch (caught) {
      setCheckerError(caught instanceof Error ? caught.message : "Could not create gate assignment");
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function changeAssignmentState(assignment: CheckerAssignment, state: CheckerAssignment["state"]) {
    if (assignment.state === state) {
      return;
    }
    setAssignmentSaving(true);
    setCheckerMessage("");
    setCheckerError("");
    try {
      const updated = await updateCheckerAssignmentState(assignment, state);
      const assignments = await getCheckerAssignments(assignment.checkerId);
      setCheckerAssignments((current) => ({ ...current, [assignment.checkerId]: assignments }));
      setCheckerMessage(`${updated.gateId} assignment changed to ${updated.state.toLowerCase()}.`);
    } catch (caught) {
      setCheckerError(caught instanceof Error ? caught.message : "Could not update gate assignment");
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function loadConcerts() {
    setLoading(true);
    setError("");
    try {
      const owned = await adminGet<ConcertSummary[]>("/api/admin/concerts");
      setConcerts(owned);
      setSelectedId((current) => owned.some((concert) => concert.id === current)
        ? current
        : owned[0]?.id || "");
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
    const requestId = ++workspaceRequestRef.current;
    setWorkspaceLoading(true);
    setVipDirectoryLoading(true);
    setVipGuests([]);
    setVipSummaries([]);
    setPendingVipFile(null);
    setVipSearchQuery("");
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
      if (requestId !== workspaceRequestRef.current) {
        return;
      }
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
      setPendingVipFile(null);
      setTicketForm(EMPTY_TICKET);
    } catch (caught) {
      if (requestId === workspaceRequestRef.current) {
        handleError(caught);
      }
    } finally {
      if (requestId === workspaceRequestRef.current) {
        setWorkspaceLoading(false);
        setVipDirectoryLoading(false);
      }
    }
  }

  async function loadBio(concertId: string) {
    try {
      const nextBio = await adminGet<ArtistBio>(`/api/admin/concerts/${concertId}/artist-bio`);
      if (selectedIdRef.current === concertId) {
        setBio(nextBio);
        setBioDraft(nextBio.artistBioDraft || "");
      }
    } catch (caught) {
      if (selectedIdRef.current === concertId) {
        handleError(caught);
      }
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

  async function handleDeleteConcert() {
    if (!detail?.id) return;
    if (!window.confirm(`WARNING: This will permanently delete the concert "${detail.name}" and all associated orders, tickets, check-in history, and assignments. Are you absolutely sure you want to proceed?`)) {
      return;
    }
    await runAction(async () => {
      await deleteConcert(detail.id);
      setDetail(null);
      setSelectedId("");
      setForm(EMPTY_CONCERT);
      setBio(null);
      setStats(null);
      setConflicts([]);
      setRefunds([]);
      await loadConcerts();
      setMessage("Concert permanently deleted.");
    });
  }

  async function handleDeleteTicketType(ticketTypeId: string, ticketTypeName: string) {
    if (!detail?.id) return;
    if (!window.confirm(`Are you sure you want to delete the ticket type "${ticketTypeName}"? This will delete all tickets of this type.`)) {
      return;
    }
    await runAction(async () => {
      await deleteTicketType(detail.id, ticketTypeId);
      if (ticketForm.id === ticketTypeId) {
        setTicketForm(EMPTY_TICKET);
      }
      await loadWorkspace(detail.id);
      setMessage("Ticket type deleted.");
    });
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

  async function processVipFile(file: File) {
    if (!detail) {
      setVipImportError("Select a concert before importing a VIP guest list.");
      return;
    }
    const concertId = detail.id;
    setImporting(true);
    setVipImportMessage("");
    setVipImportError("");
    try {
      const summaries = await uploadVipCsv(file, concertId);
      if (selectedIdRef.current !== concertId) {
        return;
      }
      setVipSummaries(summaries);
      if (summaries.length === 0) {
        setVipImportMessage("No summaries returned from CSV upload.");
      } else {
        const totalRows = summaries.reduce((acc, s) => acc + s.totalRows, 0);
        const inserted = summaries.reduce((acc, s) => acc + s.inserted, 0);
        const updated = summaries.reduce((acc, s) => acc + s.updated, 0);
        const deactivated = summaries.reduce((acc, s) => acc + s.deactivated, 0);
        const skipped = summaries.reduce((acc, s) => acc + s.skipped, 0);
        const errored = summaries.reduce((acc, s) => acc + s.errored, 0);
        const failed = summaries.some((summary) => summary.archive === "error");
        const result = `Rows ${totalRows}: ${inserted} inserted, ${updated} updated, ${deactivated} deactivated, ${skipped} skipped, ${errored} errors.`;
        if (failed) {
          setVipImportError(`${result} Review the import summary below.`);
        } else {
          setVipImportMessage(result);
        }
      }
      setPendingVipFile(null);
      await refreshVipDirectory(concertId);
    } catch (caught) {
      if (selectedIdRef.current === concertId) {
        setVipImportError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      setImporting(false);
    }
  }

  async function handleVipCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      reviewVipFile(file);
    }
  }

  function reviewVipFile(file: File) {
    setVipImportMessage("");
    setVipImportError("");
    if (!detail) {
      setVipImportError("Select a concert before choosing a VIP CSV.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setVipImportError("Only CSV files are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setVipImportError("VIP CSV files must be 5MB or smaller.");
      return;
    }
    setPendingVipFile(file);
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer?.files?.[0];
    if (file) {
      reviewVipFile(file);
    }
  };

  async function handleDeleteVip(vipId: string, vipName: string) {
    if (!detail?.id) return;
    if (!window.confirm(`Are you sure you want to remove VIP guest "${vipName}"?`)) {
      return;
    }
    const concertId = detail.id;
    setVipDirectoryMessage("");
    setVipDirectoryError("");
    setDeletingVipId(vipId);
    try {
      await deleteVipGuest(concertId, vipId);
      await refreshVipDirectory(concertId);
      if (selectedIdRef.current === concertId) {
        setVipDirectoryMessage(`Successfully removed VIP guest "${vipName}".`);
      }
    } catch (caught) {
      if (selectedIdRef.current === concertId) {
        setVipDirectoryError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      setDeletingVipId("");
    }
  }

  async function refreshVipDirectory(concertId: string) {
    setVipDirectoryLoading(true);
    setVipDirectoryError("");
    try {
      const nextVips = await getVipGuests(concertId);
      if (selectedIdRef.current === concertId) {
        setVipGuests(nextVips);
      }
    } catch (caught) {
      if (selectedIdRef.current === concertId) {
        setVipDirectoryError(caught instanceof Error ? caught.message : "Could not load VIP guests");
      }
    } finally {
      if (selectedIdRef.current === concertId) {
        setVipDirectoryLoading(false);
      }
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

      <nav
        aria-label="Admin sections"
        className="sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-neutral-950 bg-white px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        <div className="flex min-w-max items-stretch gap-1 py-2">
          {ADMIN_SECTIONS.map((section) => (
            <a
              aria-current={activeSection === section.id ? "page" : undefined}
              className={`inline-flex min-h-11 items-center border px-4 py-2 text-sm font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 ${
                activeSection === section.id
                  ? "border-neutral-950 bg-neutral-950 text-white"
                  : "border-transparent text-neutral-700 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-950"
              }`}
              href={`#${section.id}`}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </a>
          ))}
        </div>
      </nav>

      {message ? <p className={`${ui.alertSuccess} mt-6`}>{message}</p> : null}
      {error ? <p className={`${ui.alertError} mt-6`} role="alert">{error}</p> : null}

      {activeSection === "dashboard" ? (
        <section className={`${ui.panel} mt-6`} aria-labelledby="admin-workspaces-title">
            <h2 className="text-xl font-bold" id="admin-workspaces-title">Workspaces</h2>
            <p className={`${ui.muted} mt-2`}>Each workspace shows only the tools needed for that task.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ADMIN_SECTIONS.filter((section) => section.id !== "dashboard").map((section) => (
                <a
                  className="group min-h-24 border border-neutral-300 p-4 text-neutral-950 no-underline transition-colors hover:border-neutral-950 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                  href={`#${section.id}`}
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                >
                  <strong className="block text-base">{section.label}</strong>
                  <span className="mt-2 block text-sm leading-6 text-neutral-600">{section.description}</span>
                </a>
              ))}
            </div>
        </section>
      ) : null}

      {activeSection === "checkers" ? <section className={`${ui.panel} mt-6`} aria-labelledby="checker-accounts-title">
        <div className={ui.sectionHeading}>
          <div>
            <p className={ui.eyebrow}>Access</p>
            <h2 className="mt-2 text-2xl font-bold" id="checker-accounts-title">Checker accounts</h2>
            <p className={`${ui.muted} mt-2`}>Create gate staff credentials, reset passwords, and end access without removing audit history.</p>
          </div>
          <span className={ui.statusBadge}>{checkers.filter((checker) => checker.enabled).length} active</span>
        </div>

        {checkerMessage ? <p className={`${ui.alertSuccess} mt-5`} aria-live="polite">{checkerMessage}</p> : null}
        {checkerError ? <p className={`${ui.alertError} mt-5`} role="alert">{checkerError}</p> : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <form className={ui.form} onSubmit={submitCheckerAccount}>
            <h3 className="text-lg font-bold">Create checker</h3>
            <label>
              Email
              <input
                autoComplete="email"
                maxLength={320}
                required
                type="email"
                value={checkerEmail}
                onChange={(event) => setCheckerEmail(event.target.value)}
              />
            </label>
            <label>
              Temporary password
              <input
                autoComplete="new-password"
                minLength={8}
                required
                type="password"
                value={checkerPassword}
                onChange={(event) => setCheckerPassword(event.target.value)}
              />
            </label>
            <button className={ui.primaryButton} disabled={checkerSaving} type="submit">
              {checkerSaving ? "Saving..." : "Create checker"}
            </button>
          </form>

          <div>
            <label className="grid gap-2 text-sm font-medium text-neutral-950">
              Search checker accounts
              <input
                className="min-h-11 w-full border border-neutral-500 bg-white px-3 py-2 text-base font-normal outline-none focus:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                placeholder="checker@ticketbox.vn"
                type="search"
                value={checkerSearch}
                onChange={(event) => setCheckerSearch(event.target.value)}
              />
            </label>

            <div className={`${ui.tableWrap} mt-4`}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCheckers.map((checker) => (
                    <Fragment key={checker.id}>
                      <tr>
                        <td className="font-semibold">{checker.email}</td>
                        <td><span className={ui.statusBadge}>{checker.enabled ? "Active" : "Disabled"}</span></td>
                        <td>{formatDate(checker.createdAt)}</td>
                        <td>
                          <div className={ui.actionRow}>
                            <button
                              aria-expanded={managingCheckerId === checker.id}
                              className={`${ui.secondaryButton} ${ui.compactButton}`}
                              disabled={checkerSaving || assignmentSaving}
                              type="button"
                              onClick={() => void toggleGateManagement(checker)}
                            >
                              {managingCheckerId === checker.id ? "Close gates" : "Manage gates"}
                            </button>
                            <button
                              className={`${ui.secondaryButton} ${ui.compactButton}`}
                              disabled={checkerSaving}
                              type="button"
                              onClick={() => {
                                setManagingCheckerId("");
                                setResettingCheckerId(checker.id);
                                setReplacementPassword("");
                              }}
                            >
                              Reset password
                            </button>
                            <button
                              className={`${checker.enabled ? ui.dangerButton : ui.secondaryButton} ${ui.compactButton}`}
                              disabled={checkerSaving}
                              type="button"
                              onClick={() => void toggleCheckerStatus(checker)}
                            >
                              {checker.enabled ? "Disable" : "Enable"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {managingCheckerId === checker.id ? (
                        <tr>
                          <td colSpan={4}>
                            <div className="grid gap-5 py-2 xl:grid-cols-[20rem_minmax(0,1fr)]">
                              <form className={ui.form} onSubmit={(event) => submitCheckerAssignment(event, checker)}>
                                <fieldset className="grid gap-4" disabled={!checker.enabled || assignmentSaving}>
                                  <legend className="text-lg font-bold">New gate assignment</legend>
                                  {!checker.enabled ? <p className={ui.muted}>Enable this account before assigning a gate.</p> : null}
                                  <label>
                                    Concert
                                    <select
                                      className="mt-2 min-h-11 w-full border border-neutral-500 bg-white px-3 py-2 text-base font-normal outline-none focus:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                                      required
                                      value={assignmentForm.concertId}
                                      onChange={(event) => setAssignmentForm((current) => ({ ...current, concertId: event.target.value }))}
                                    >
                                      <option value="">Select concert</option>
                                      {concerts.map((concert) => <option key={concert.id} value={concert.id}>{concert.name}</option>)}
                                    </select>
                                  </label>
                                  <label>
                                    Gate
                                    <input
                                      maxLength={255}
                                      placeholder="GATE-A"
                                      required
                                      value={assignmentForm.gateId}
                                      onChange={(event) => setAssignmentForm((current) => ({ ...current, gateId: event.target.value }))}
                                    />
                                  </label>
                                  <label>
                                    Lane <span className="font-normal text-neutral-600">(optional)</span>
                                    <input
                                      maxLength={255}
                                      placeholder="LANE-1"
                                      value={assignmentForm.laneId}
                                      onChange={(event) => setAssignmentForm((current) => ({ ...current, laneId: event.target.value }))}
                                    />
                                  </label>
                                  <label>
                                    Allowed zones
                                    <input
                                      placeholder="SVIP, VIP"
                                      required
                                      value={assignmentForm.allowedZones}
                                      onChange={(event) => setAssignmentForm((current) => ({ ...current, allowedZones: event.target.value }))}
                                    />
                                    <span className="mt-1 block text-xs font-normal text-neutral-600">Separate multiple zones with commas.</span>
                                  </label>
                                  <label>
                                    Device <span className="font-normal text-neutral-600">(optional)</span>
                                    <input
                                      maxLength={255}
                                      placeholder="device-1"
                                      value={assignmentForm.deviceId}
                                      onChange={(event) => setAssignmentForm((current) => ({ ...current, deviceId: event.target.value }))}
                                    />
                                  </label>
                                  <label>
                                    Initial state
                                    <select
                                      className="mt-2 min-h-11 w-full border border-neutral-500 bg-white px-3 py-2 text-base font-normal outline-none focus:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                                      value={assignmentForm.state}
                                      onChange={(event) => setAssignmentForm((current) => ({
                                        ...current,
                                        state: event.target.value as CheckerAssignment["state"]
                                      }))}
                                    >
                                      <option value="ACTIVE">Active</option>
                                      <option value="STANDBY">Standby</option>
                                      <option value="INACTIVE">Inactive</option>
                                    </select>
                                  </label>
                                  <button className={ui.primaryButton} type="submit">
                                    {assignmentSaving ? "Assigning..." : "Assign gate"}
                                  </button>
                                </fieldset>
                              </form>

                              <div>
                                <div className={ui.sectionHeading}>
                                  <div>
                                    <h4 className="text-lg font-bold">Assigned gates</h4>
                                    <p className={`${ui.muted} mt-1`}>Set an assignment inactive to retain its audit history.</p>
                                  </div>
                                  <span className={ui.statusBadge}>{(checkerAssignments[checker.id] || []).length} total</span>
                                </div>
                                <div className={`${ui.tableWrap} mt-4`}>
                                  <table className={ui.table}>
                                    <thead>
                                      <tr>
                                        <th>Concert</th>
                                        <th>Gate / lane</th>
                                        <th>Zones</th>
                                        <th>Device</th>
                                        <th>State</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(checkerAssignments[checker.id] || []).map((assignment) => (
                                        <tr key={assignment.id}>
                                          <td>{concerts.find((concert) => concert.id === assignment.concertId)?.name || shortId(assignment.concertId)}</td>
                                          <td className="font-semibold">{assignment.gateId}{assignment.laneId ? ` / ${assignment.laneId}` : ""}</td>
                                          <td>{assignment.allowedZones.join(", ")}</td>
                                          <td>{assignment.deviceId || "Any"}</td>
                                          <td>
                                            <select
                                              aria-label={`State for ${assignment.gateId}`}
                                              className="min-h-10 border border-neutral-500 bg-white px-2 py-1 text-sm outline-none focus:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:opacity-50"
                                              disabled={assignmentSaving}
                                              value={assignment.state}
                                              onChange={(event) => void changeAssignmentState(
                                                assignment,
                                                event.target.value as CheckerAssignment["state"]
                                              )}
                                            >
                                              <option value="ACTIVE">Active</option>
                                              <option value="STANDBY">Standby</option>
                                              <option value="INACTIVE">Inactive</option>
                                            </select>
                                          </td>
                                        </tr>
                                      ))}
                                      {assignmentLoading ? <tr><td colSpan={5}>Loading gate assignments...</td></tr> : null}
                                      {!assignmentLoading && (checkerAssignments[checker.id] || []).length === 0 ? (
                                        <tr><td colSpan={5}>No gate assignments yet.</td></tr>
                                      ) : null}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {resettingCheckerId === checker.id ? (
                        <tr>
                          <td colSpan={4}>
                            <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => submitCheckerPassword(event, checker)}>
                              <label className="grid min-w-64 flex-1 gap-2 text-sm font-medium">
                                New password for {checker.email}
                                <input
                                  autoComplete="new-password"
                                  className="min-h-11 border border-neutral-500 bg-white px-3 py-2 text-base font-normal outline-none focus:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                                  minLength={8}
                                  required
                                  type="password"
                                  value={replacementPassword}
                                  onChange={(event) => setReplacementPassword(event.target.value)}
                                />
                              </label>
                              <button className={`${ui.primaryButton} ${ui.compactButton}`} disabled={checkerSaving} type="submit">Save password</button>
                              <button
                                className={`${ui.ghostButton} ${ui.compactButton}`}
                                disabled={checkerSaving}
                                type="button"
                                onClick={() => {
                                  setResettingCheckerId("");
                                  setReplacementPassword("");
                                }}
                              >
                                Cancel
                              </button>
                            </form>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                  {!checkerLoading && filteredCheckers.length === 0 ? (
                    <tr><td colSpan={4}>{checkers.length === 0 ? "No checker accounts yet." : "No checker accounts match this search."}</td></tr>
                  ) : null}
                  {checkerLoading ? <tr><td colSpan={4}>Loading checker accounts...</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section> : null}

      {activeSection !== "dashboard" && activeSection !== "checkers" ? <section className="mt-6">
        <section className={ui.panel} aria-labelledby="event-context-title">
          <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className={ui.eyebrow}>Event context</p>
              <h2 className="mt-2 text-2xl font-bold" id="event-context-title">Choose concert</h2>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-neutral-950">
              Current concert
              <select
                className="min-h-11 w-full border border-neutral-500 bg-white px-3 py-2 text-base font-normal text-neutral-950 outline-none transition-colors focus:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loading || workspaceLoading || importing || saving || Boolean(deletingVipId) || concerts.length === 0}
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                <option disabled value="">
                  {activeSection === "concerts" && !detail ? "New concert draft" : "Select a concert"}
                </option>
                {concerts.map((concert) => (
                  <option key={concert.id} value={concert.id}>
                    {concert.name} - {concert.eventCode}
                  </option>
                ))}
              </select>
            </label>
            {activeSection === "concerts" ? (
              <button
                className={ui.secondaryButton}
                disabled={workspaceLoading || importing || saving || Boolean(deletingVipId)}
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
                New concert
              </button>
            ) : null}
          </div>
          {loading ? <p className={`${ui.muted} mt-4`}>Loading concerts...</p> : null}
          {workspaceLoading ? <p className={`${ui.muted} mt-4`} role="status">Loading event workspace...</p> : null}
          {!loading && concerts.length === 0 ? <p className={`${ui.muted} mt-4`}>No concerts yet.</p> : null}
          {selectedConcert ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-neutral-300 pt-4 text-sm text-neutral-700">
              <StatusBadge status={selectedConcert.status} />
              <span><strong className="text-neutral-950">Code:</strong> {selectedConcert.eventCode}</span>
              <span><strong className="text-neutral-950">Venue:</strong> {selectedConcert.venue}</span>
              <span><strong className="text-neutral-950">Date:</strong> {formatDate(selectedConcert.eventDate)}</span>
            </div>
          ) : null}
        </section>

        <section className="mt-6" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-5 border-b border-neutral-950 pb-5">
            <div>
              <p className={ui.eyebrow}>{activeSectionMeta.label}</p>
              <h2 className="mt-2 text-3xl font-black">
                {workspaceLoading ? "Loading concert" : detail?.name || (activeSection === "concerts" ? "New concert" : "Choose a concert")}
              </h2>
              {selectedConcert ? <p className={`${ui.muted} mt-2`}>{selectedConcert.venue}</p> : null}
            </div>
            {detail && activeSection === "concerts" ? (
              <div className={ui.actionRow}>
                <button className={ui.secondaryButton} disabled={saving || detail.status !== "DRAFT"} type="button" onClick={publishConcert}>
                  Publish
                </button>
                <button className={ui.dangerButton} disabled={saving || detail.status === "CANCELLED"} type="button" onClick={cancelConcert}>
                  Cancel
                </button>
                <button className={ui.dangerButton} disabled={saving} type="button" onClick={handleDeleteConcert}>
                  Delete Concert
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            {activeSection === "concerts" ? <section className={`${ui.panel} xl:col-span-2`} aria-labelledby="concert-form-title">
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
            </section> : null}

            {activeSection === "concerts" ? <section className={ui.panel} aria-labelledby="ticket-form-title">
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
                <div className="flex flex-wrap gap-3">
                  <button className={ui.secondaryButton} disabled={!detail || saving} type="submit">
                    {ticketForm.id ? "Update ticket type" : "Add ticket type"}
                  </button>
                  {ticketForm.id ? (
                    <button
                      className={ui.dangerButton}
                      disabled={!detail || saving}
                      type="button"
                      onClick={() => void handleDeleteTicketType(ticketForm.id!, ticketForm.name)}
                    >
                      Delete
                    </button>
                  ) : null}
                  {ticketForm.id ? (
                    <button
                      className={ui.ghostButton}
                      type="button"
                      onClick={() => setTicketForm(EMPTY_TICKET)}
                    >
                      Cancel Edit
                    </button>
                  ) : null}
                </div>
              </form>
              <div className="mt-5 grid border-t border-neutral-300">
                {detail?.ticketTypes.map((ticket) => (
                  <button className="flex min-h-12 items-center justify-between gap-4 border-b border-neutral-300 py-3 text-left text-sm transition-colors hover:text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950" key={ticket.id} type="button" onClick={() => setTicketForm(fromTicket(ticket))}>
                    <span>{ticket.name} / {ticket.zone}</span>
                    <strong>{ticket.remainingQuantity}/{ticket.totalQuantity}</strong>
                  </button>
                ))}
              </div>
            </section> : null}

            {activeSection === "concerts" ? <section className={ui.panel} aria-labelledby="bio-title">
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
            </section> : null}

            {activeSection === "checkins" ? <section className={`${ui.panel} xl:col-span-2`} aria-labelledby="stats-title">
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
            </section> : null}

            {activeSection === "vip" ? <section className={ui.panel} aria-labelledby="vip-import-title">
              <div className={ui.sectionHeading}>
                <div>
                  <h3 className="text-xl font-bold" id="vip-import-title">VIP guest snapshot</h3>
                  <p className={`${ui.muted} mt-2`}>
                    Upload the latest complete guest list for the selected concert.
                  </p>
                </div>
                {detail ? <span className={ui.statusBadge}>{detail.eventCode}</span> : null}
              </div>

              <div className={`${ui.alertWarning} mt-4`}>
                Guests missing from a valid CSV are deactivated for this concert. If any row is invalid, deactivation is skipped to protect the existing list.
              </div>

              <div className="mt-4 grid gap-4">
                <label
                  className={`grid min-h-36 cursor-pointer place-content-center gap-2 border border-dashed p-5 text-center transition-colors ${
                    dragActive ? "border-neutral-950 bg-neutral-100" : "border-neutral-500 hover:bg-neutral-50"
                  } ${!detail || importing || workspaceLoading ? "pointer-events-none opacity-50" : ""}`}
                  aria-disabled={!detail || importing || workspaceLoading}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <span className="font-semibold text-neutral-900">Drop a VIP CSV here or choose a file</span>
                  <span className="text-xs leading-5 text-neutral-600">
                    Required columns: event_code and phone. Optional: name, sponsor, zone. Maximum 5MB.
                  </span>
                  <input
                    accept=".csv,text/csv"
                    className="hidden"
                    disabled={!detail || importing || workspaceLoading}
                    type="file"
                    onChange={handleVipCsvUpload}
                  />
                </label>

                {pendingVipFile && detail ? (
                  <div className="border border-neutral-950 p-4" role="group" aria-label="Review VIP import">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      <div>
                        <p className="font-semibold">{pendingVipFile.name}</p>
                        <p className={`${ui.muted} mt-1`}>
                          {formatFileSize(pendingVipFile.size)} / {detail.name} / {detail.eventCode}
                        </p>
                      </div>
                      <span className={ui.statusBadge}>Ready to import</span>
                    </div>
                    <p className={`${ui.muted} mt-3`}>
                      The backend will reject the file if any event_code points to another concert.
                    </p>
                    <div className={`${ui.actionRow} mt-4`}>
                      <button
                        className={ui.primaryButton}
                        disabled={importing}
                        type="button"
                        onClick={() => void processVipFile(pendingVipFile)}
                      >
                        {importing ? "Importing..." : "Import snapshot"}
                      </button>
                      <button
                        className={ui.ghostButton}
                        disabled={importing}
                        type="button"
                        onClick={() => setPendingVipFile(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {vipImportMessage ? (
                  <p className={vipImportNeedsAttention ? ui.alertWarning : ui.alertSuccess} role="status">
                    {vipImportMessage}
                  </p>
                ) : null}
                {vipImportError ? <p className={ui.alertError} role="alert">{vipImportError}</p> : null}
              </div>

              {vipSummaries.length > 0 ? (
                <div className="mt-5">
                  <h4 className="mb-3 text-sm font-semibold">Latest import result</h4>
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
                        {vipSummaries.map((summary) => (
                          <tr key={`${summary.fileName}:${summary.archive}:${summary.message}`}>
                            <td>
                              <span className="block font-semibold">{summary.fileName}</span>
                              {summary.archived && summary.archive ? (
                                <span className="mt-1 block text-xs text-neutral-500">Archive: {summary.archive}</span>
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
                            <td className="min-w-64">{summary.message || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </section> : null}

            {activeSection === "vip" ? <section className={ui.panel} aria-labelledby="vip-directory-title">
              <div className={ui.sectionHeading}>
                <div>
                  <h3 className="text-xl font-bold" id="vip-directory-title">VIP guest directory</h3>
                  <p className={`${ui.muted} mt-2`}>
                    {detail ? `${detail.name} / ${detail.eventCode}` : "Choose a concert to view its active guest list."}
                  </p>
                </div>
                <span className={ui.statusBadge}>{vipGuests.length} active</span>
              </div>

              {vipDirectoryMessage ? <p className={`${ui.alertSuccess} mt-4`}>{vipDirectoryMessage}</p> : null}
              {vipDirectoryError ? <p className={`${ui.alertError} mt-4`} role="alert">{vipDirectoryError}</p> : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  aria-label="Filter VIP guests"
                  className="min-h-11 w-full border border-neutral-500 bg-white px-3 py-2 text-base font-normal text-neutral-950 outline-none transition-colors focus:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:opacity-50"
                  disabled={!detail || vipDirectoryLoading}
                  placeholder="Filter by name, phone, sponsor, or zone..."
                  type="search"
                  value={vipSearchQuery}
                  onChange={(e) => setVipSearchQuery(e.target.value)}
                />
                <button
                  className={ui.secondaryButton}
                  disabled={!detail || vipDirectoryLoading}
                  type="button"
                  onClick={() => detail && void refreshVipDirectory(detail.id)}
                >
                  {vipDirectoryLoading ? "Refreshing..." : "Refresh list"}
                </button>
              </div>
              <p className={`${ui.muted} mt-3`} aria-live="polite">
                Showing {filteredVips.length} of {vipGuests.length} guests
              </p>

              <div className="mt-5">
                {vipDirectoryLoading && vipGuests.length === 0 ? (
                  <p className={ui.muted} role="status">Loading VIP guests...</p>
                ) : filteredVips.length > 0 ? (
                  <>
                    <div className="grid gap-3 sm:hidden">
                      {filteredVips.map((vip) => (
                        <article className="border border-neutral-300 p-4" key={vip.id}>
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="font-semibold">{vip.name}</h4>
                            {vip.entered ? (
                              <span className="inline-flex shrink-0 border border-neutral-950 bg-neutral-950 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white">
                                Entered
                              </span>
                            ) : (
                              <span className={`${ui.statusBadge} shrink-0`}>Registered</span>
                            )}
                          </div>
                          <dl className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                            <dt className="text-neutral-600">Phone</dt>
                            <dd>{vip.phoneMasked}</dd>
                            <dt className="text-neutral-600">Sponsor</dt>
                            <dd>{vip.sponsor || "-"}</dd>
                            <dt className="text-neutral-600">Zone</dt>
                            <dd><span className={ui.statusBadge}>{vip.zone}</span></dd>
                            {vip.enteredAt ? (
                              <>
                                <dt className="text-neutral-600">Entered</dt>
                                <dd>{formatDate(vip.enteredAt)}</dd>
                              </>
                            ) : null}
                          </dl>
                          <button
                            className={`${ui.dangerButton} mt-4 w-full`}
                            disabled={Boolean(deletingVipId)}
                            type="button"
                            onClick={() => handleDeleteVip(vip.id, vip.name)}
                          >
                            {deletingVipId === vip.id ? "Removing..." : "Remove guest"}
                          </button>
                        </article>
                      ))}
                    </div>
                    <div className={`${ui.tableWrap} hidden sm:block`}>
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
                                  disabled={Boolean(deletingVipId)}
                                  type="button"
                                  onClick={() => handleDeleteVip(vip.id, vip.name)}
                                >
                                  {deletingVipId === vip.id ? "Removing..." : "Remove"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className={ui.muted}>
                    {vipGuests.length === 0
                      ? "No VIP guests have been registered for this event."
                      : "No VIP guests match your search filter."}
                  </p>
                )}
              </div>
            </section> : null}



            {activeSection === "checkins" ? <section className={`${ui.panel} xl:col-span-2`} aria-labelledby="conflicts-title">
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
            </section> : null}

            {activeSection === "refunds" ? <section className={`${ui.panel} xl:col-span-2`} aria-labelledby="refunds-title">
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
            </section> : null}
          </div>
        </section>
      </section> : null}
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

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
