"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, FileText, MoreHorizontal, Pencil, RefreshCw, Search, Trash2, X } from "lucide-react";
import { studioV2Api, studioV2PageTileURL, StudioSessionSummaryDTO } from "@/lib/studio-v2/api";
import { useAuth } from "@/context/AuthContext";

function sessionTitle(item: StudioSessionSummaryDTO) {
  const title = item.session.title?.trim();
  if (title) return title;
  const filename = item.document.original_filename || item.document.original_file_name || "";
  return filename.replace(/\.pdf$/i, "") || "Untitled Studio Session";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently edited";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Skeletons({ compact }: { compact: boolean }) {
  return <div className={compact ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3"} aria-label="Loading Studio sessions" aria-busy="true">
    {Array.from({ length: compact ? 3 : 5 }).map((_, index) => <div key={index} className={compact ? "h-72 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--surface-card)]" : "h-28 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--surface-card)]"} />)}
  </div>;
}

function SessionCard({ item, onDelete, onRename, compact, now }: { item: StudioSessionSummaryDTO; onDelete: (item: StudioSessionSummaryDTO) => void; onRename: (item: StudioSessionSummaryDTO) => void; compact: boolean; now: number }) {
  const expired = new Date(item.session.expires_at).getTime() <= now;
  const title = sessionTitle(item);
  const filename = item.document.original_filename || item.document.original_file_name || "PDF document";
  const tile = item.preview_page_id && item.active_version?.id ? studioV2PageTileURL(item.session.id, item.active_version.id, item.preview_page_id) : "";
  return <article className={`group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-md ${compact ? "" : "flex items-center gap-5 p-4"}`}>
    <div className={compact ? "aspect-[16/9] border-b border-[var(--border)] bg-[var(--surface-secondary)]" : "h-20 w-28 shrink-0 rounded-xl bg-[var(--surface-secondary)]"}>
      {tile ? <img src={tile} alt="" className="h-full w-full object-cover opacity-90" /> : <div className="flex h-full items-center justify-center text-[var(--accent)]"><FileText size={compact ? 30 : 24} /></div>}
    </div>
    <div className={compact ? "p-4" : "min-w-0 flex-1"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h3 className="truncate text-sm font-bold text-[var(--foreground)]">{title}</h3><p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{filename}</p></div>
        <div className="relative shrink-0"><details><summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]" aria-label={`Actions for ${title}`}><MoreHorizontal size={18} /></summary><div className="absolute right-0 top-9 z-20 w-36 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-1 shadow-xl"><button onClick={() => onRename(item)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--surface-hover)]"><Pencil size={13}/> Rename</button><button onClick={() => onDelete(item)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-red-500 hover:bg-red-500/10"><Trash2 size={13}/> Delete</button></div></details></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted-foreground)]"><span>{item.document.initial_page_count} {item.document.initial_page_count === 1 ? "page" : "pages"}</span><span>Edited {formatDate(item.session.last_accessed_at)}</span><span className={expired ? "text-amber-600" : "text-emerald-600"}>{expired ? "Expired" : "Saved"}</span></div>
      <Link href={expired ? "#" : `/studio-v2?session_id=${encodeURIComponent(item.session.id)}`} aria-disabled={expired} onClick={(event) => { if (expired) event.preventDefault(); }} className={`mt-4 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-bold transition ${expired ? "cursor-not-allowed bg-[var(--surface-secondary)] text-[var(--muted-foreground)]" : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"}`}>{expired ? "Session unavailable" : "Continue editing"}</Link>
    </div>
  </article>;
}

export default function StudioSessions({ compact = false }: { compact?: boolean }) {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [items, setItems] = useState<StudioSessionSummaryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"edited" | "created">("edited");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "delete" | "rename"; item: StudioSessionSummaryDTO } | null>(null);
  const [title, setTitle] = useState("");
  const [now] = useState(() => Date.now());
  const pageSize = compact ? 6 : 12;

  const load = useCallback(async () => { if (authLoading || !isLoggedIn) return; setLoading(true); setError(null); try { const response = await studioV2Api.listSessions({ query, sort, page, pageSize }); setItems(response.sessions || []); setTotal(response.total || 0); } catch (err) { setError(err instanceof Error ? err.message : "We couldn't load your Studio sessions."); } finally { setLoading(false); } }, [authLoading, isLoggedIn, page, pageSize, query, sort]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const visibleItems = useMemo(() => compact ? items.slice(0, 6) : items, [compact, items]);
  if (authLoading || (!isLoggedIn && loading)) return null;
  if (!isLoggedIn) return null;

  const openRename = (item: StudioSessionSummaryDTO) => { setTitle(sessionTitle(item)); setDialog({ kind: "rename", item }); };
  const confirm = async () => { if (!dialog) return; try { if (dialog.kind === "delete") { await studioV2Api.deleteSession(dialog.item.session.id); setItems((current) => current.filter((item) => item.session.id !== dialog.item.session.id)); setTotal((current) => Math.max(0, current - 1)); } else { const response = await studioV2Api.renameSession(dialog.item.session.id, title); setItems((current) => current.map((item) => item.session.id === dialog.item.session.id ? { ...item, session: { ...item.session, title: response.title } } : item)); } setDialog(null); } catch (err) { setError(err instanceof Error ? err.message : "The session action failed."); } };

  return <section className={compact ? "space-y-5" : "mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6 lg:px-8"}>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-[var(--accent)]"><BookOpen size={18}/><span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">Workspace library</span></div><h2 className={compact ? "mt-2 text-2xl font-black" : "mt-2 text-3xl font-black"}>Studio Sessions</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">Continue editing your saved PDF Studio work.</p></div>{compact ? <Link href="/dashboard/studio-sessions" className="text-sm font-bold text-[var(--accent)] hover:underline">View all <span aria-hidden="true">→</span></Link> : null}</div>
    {!compact && <div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" size={16}/><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search sessions or PDF filenames" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-card)] py-3 pl-10 pr-4 text-sm outline-none focus:border-[var(--accent)]" /></label><select value={sort} onChange={(event) => { setSort(event.target.value as "edited" | "created"); setPage(1); }} aria-label="Sort Studio sessions" className="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-3 py-3 text-sm outline-none focus:border-[var(--accent)]"><option value="edited">Last edited</option><option value="created">Recently created</option></select></div>}
    {loading ? <Skeletons compact={compact} /> : error ? <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center"><p className="text-sm font-semibold">{error}</p><button onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold"><RefreshCw size={14}/> Try again</button></div> : visibleItems.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-card)] px-6 py-14 text-center"><FileText className="mx-auto text-[var(--muted-foreground)]" size={32}/><h3 className="mt-4 text-base font-bold">No Studio sessions yet</h3><p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">Your saved Studio work will appear here so you can continue editing whenever you return.</p><Link href="/studio-v2" className="mt-5 inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-xs font-bold text-white">Open PDF Studio</Link></div> : <div className={compact ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>{visibleItems.map((item) => <SessionCard key={item.session.id} item={item} onDelete={(selected) => setDialog({ kind: "delete", item: selected })} onRename={openRename} compact={compact} now={now}/>)}</div>}
    {!compact && pages > 1 && <div className="flex items-center justify-between border-t border-[var(--border)] pt-4"><span className="text-xs text-[var(--muted-foreground)]">Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-[var(--border)] p-2 disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={16}/></button><button disabled={page === pages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-[var(--border)] p-2 disabled:opacity-40" aria-label="Next page"><ChevronRight size={16}/></button></div></div>}
    {dialog && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="presentation">
        <div role="dialog" aria-modal="true" aria-labelledby="studio-session-dialog-title" className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div><h2 id="studio-session-dialog-title" className="text-lg font-black">{dialog.kind === "delete" ? "Delete session?" : "Rename session"}</h2>{dialog.kind === "delete" && <p className="mt-2 text-sm text-[var(--muted-foreground)]">This will permanently remove the saved Studio session. Your exported PDFs will not be affected.</p>}</div>
            <button onClick={() => setDialog(null)} aria-label="Close dialog"><X size={18}/></button>
          </div>
          {dialog.kind === "rename" && <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} className="mt-5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" />}
          <div className="mt-6 flex justify-end gap-2"><button onClick={() => setDialog(null)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-bold">Cancel</button><button onClick={() => void confirm()} disabled={dialog.kind === "rename" && !title.trim()} className={`rounded-lg px-4 py-2 text-xs font-bold text-white ${dialog.kind === "delete" ? "bg-red-600" : "bg-[var(--accent)]"}`}>{dialog.kind === "delete" ? "Delete" : <><Check size={14} className="mr-1 inline"/> Save</>}</button></div>
        </div>
      </div>
    )}
  </section>;
}
