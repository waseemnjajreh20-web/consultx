import { useCallback, useEffect, useRef, useState } from "react";
import { X, ExternalLink, ArrowLeft, BookOpen, Printer, Loader2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { resolveAllSources, formatSourceLabel, SourceMeta } from "@/utils/sourceMetadata";
import { fetchSignedPdfUrl } from "@/utils/sourcePdfUrl";
import { supabase } from "@/integrations/supabase/client";
import { PdfHighlightViewer } from "@/components/PdfHighlightViewer";

// ── Visual constants matching ConsultX dark identity ─────────────────────────
const PANEL_BG    = "rgba(10, 14, 20, 0.97)";
const BORDER_COLOR = "rgba(0, 212, 255, 0.15)";
const ACCENT      = "#00D4FF";

// ── Public state shape ────────────────────────────────────────────────────────
export interface SourcePanelState {
  open: boolean;
  sources: string[];
  activeMeta: SourceMeta | null;
}

export const CLOSED_PANEL: SourcePanelState = {
  open: false,
  sources: [],
  activeMeta: null,
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface SourcePanelProps {
  state: SourcePanelState;
  language: "ar" | "en";
  onClose: () => void;
  onSelectSource: (meta: SourceMeta) => void;
  onBack: () => void;
  /**
   * "overlay" (default) — fixed-position slide-over with backdrop.
   * "pane"              — fills its flex parent; no backdrop, no fixed positioning.
   */
  mode?: "overlay" | "pane";
}

// ════════════════════════════════════════════════════════════════════════════
// Shared sub-components
// ════════════════════════════════════════════════════════════════════════════

function PanelHeader({
  isListView,
  activeMeta,
  isRtl,
  language,
  onBack,
  onClose,
  // Source navigation (shown in PDF view when there are multiple sources)
  sourceIndex,
  sourceTotal,
  onPrevSource,
  onNextSource,
}: {
  isListView: boolean;
  activeMeta: SourceMeta | null;
  isRtl: boolean;
  language: "ar" | "en";
  onBack: () => void;
  onClose: () => void;
  sourceIndex: number;
  sourceTotal: number;
  onPrevSource: () => void;
  onNextSource: () => void;
}) {
  const handlePrint = () => {
    const printLogo   = localStorage.getItem("cx_print_logo")   !== "false";
    const printHeader = localStorage.getItem("cx_print_header") !== "false";
    const printFooter = localStorage.getItem("cx_print_footer") !== "false";
    const logo        = localStorage.getItem("cx_company_logo")   || "";
    const companyName = localStorage.getItem("cx_company_name")   || "";
    const reportHdr   = localStorage.getItem("cx_report_header") || "";
    const reportFtr   = localStorage.getItem("cx_report_footer") || "";

    const showHeader = (printLogo && (logo || companyName)) || (printHeader && reportHdr);
    const showFooter = printFooter && reportFtr;

    const panel = document.querySelector(".print-source-panel");
    const injected: HTMLElement[] = [];

    if (panel && showHeader) {
      const el = document.createElement("div");
      el.className = "cx-print-only";
      el.style.cssText = "padding:10px 16px;border-bottom:1px solid #ccc;background:#fff;color:#000;";
      if (printLogo && logo) {
        const img = document.createElement("img");
        img.src = logo;
        img.style.cssText = "height:36px;max-width:120px;display:block;margin-bottom:4px;";
        el.appendChild(img);
      }
      if (printLogo && companyName) {
        const d = document.createElement("div");
        d.style.cssText = "font-weight:600;font-size:13px;";
        d.textContent = companyName;
        el.appendChild(d);
      }
      if (printHeader && reportHdr) {
        const d = document.createElement("div");
        d.style.cssText = "font-size:11px;margin-top:4px;white-space:pre-wrap;";
        d.textContent = reportHdr;
        el.appendChild(d);
      }
      panel.insertBefore(el, panel.firstChild);
      injected.push(el);
    }

    if (panel && showFooter) {
      const el = document.createElement("div");
      el.className = "cx-print-only";
      el.style.cssText = "padding:8px 16px;border-top:1px solid #ccc;background:#fff;color:#000;font-size:11px;white-space:pre-wrap;margin-top:auto;";
      el.textContent = reportFtr;
      panel.appendChild(el);
      injected.push(el);
    }

    window.print();
    // Clean up injected print-only elements after the print dialog closes
    setTimeout(() => injected.forEach(el => el.remove()), 500);
  };

  // Shared button style — rounded, subtle hover, clean focus ring
  const iconBtn =
    "flex-shrink-0 p-1.5 rounded-lg transition-all duration-150 " +
    "text-white/40 hover:text-white hover:bg-white/10 " +
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(0,212,255,0.5)] " +
    "active:bg-white/15 active:scale-95";

  return (
    <div
      className="flex items-center gap-2 px-3 py-3 flex-shrink-0"
      style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}
    >
      {/* Back — only in PDF view */}
      {!isListView && (
        <button onClick={onBack} className={iconBtn} aria-label={isRtl ? "رجوع" : "Back"}>
          <ArrowLeft className="w-4 h-4" />
        </button>
      )}

      <BookOpen className="w-3.5 h-3.5 flex-shrink-0 opacity-70" style={{ color: ACCENT }} />

      <span className="flex-1 text-[13px] font-medium text-white/90 truncate min-w-0 leading-tight">
        {isListView
          ? (isRtl ? "المصادر المرجعية" : "Source References")
          : activeMeta
          ? (activeMeta.documentCode === "UNKNOWN" ? activeMeta.title : formatSourceLabel(activeMeta, language))
          : ""}
      </span>

      {/* Source prev/next — only in PDF view when multiple sources exist */}
      {!isListView && sourceTotal > 1 && (
        <div
          className="flex items-center gap-0.5 flex-shrink-0 rounded-lg px-1 py-0.5"
          style={{ background: "rgba(0,212,255,0.07)", border: "1px solid rgba(0,212,255,0.15)" }}
        >
          <button
            onClick={onPrevSource}
            disabled={sourceIndex <= 0}
            className="p-1 rounded-md transition-all duration-150 disabled:opacity-25 hover:bg-white/10 active:scale-90"
            aria-label={isRtl ? "المصدر السابق" : "Previous source"}
          >
            {isRtl ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
          <span
            className="text-[11px] tabular-nums font-medium px-1 select-none"
            style={{ color: "rgba(0,212,255,0.85)" }}
          >
            {sourceIndex >= 0 ? sourceIndex + 1 : "·"}/{sourceTotal}
          </span>
          <button
            onClick={onNextSource}
            disabled={sourceIndex >= sourceTotal - 1}
            className="p-1 rounded-md transition-all duration-150 disabled:opacity-25 hover:bg-white/10 active:scale-90"
            aria-label={isRtl ? "المصدر التالي" : "Next source"}
          >
            {isRtl ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </div>
      )}

      {/* External link — only in PDF view. Opening in a new tab now requires
          fetching a fresh short-lived signed URL (the underlying storage
          bucket is private), so this is a button with an async click
          handler rather than a plain <a href>. */}
      {!isListView && activeMeta?.pdfUrl && (
        <button
          onClick={async () => {
            const result = await fetchSignedPdfUrl(activeMeta.pdfPath);
            if (result) window.open(result.url, "_blank", "noopener,noreferrer");
          }}
          className={iconBtn}
          aria-label={isRtl ? "فتح في نافذة جديدة" : "Open in new tab"}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Print — only in PDF view */}
      {!isListView && activeMeta?.pdfUrl && (
        <button onClick={handlePrint} className={iconBtn} aria-label={isRtl ? "طباعة" : "Print"}>
          <Printer className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Close */}
      <button onClick={onClose} className={iconBtn} aria-label={isRtl ? "إغلاق" : "Close"}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function PanelBody({
  isListView,
  resolvedSources,
  activeMeta,
  isRtl,
  language,
  onSelectSource,
}: {
  isListView: boolean;
  resolvedSources: SourceMeta[];
  activeMeta: SourceMeta | null;
  isRtl: boolean;
  language: "ar" | "en";
  onSelectSource: (meta: SourceMeta) => void;
}) {
  if (isListView) {
    return (
      <div className="h-full overflow-y-auto py-2">
        {resolvedSources.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            {isRtl ? "لا توجد مصادر" : "No sources available"}
          </p>
        ) : (
          resolvedSources.map((meta) => {
            const isStructuredTable = meta.origin === "structured_table";
            return (
            <button
              key={meta.pdfPath ?? meta.sourceFile}
              onClick={() => (meta.pdfUrl ? onSelectSource(meta) : undefined)}
              className={[
                "w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all duration-150",
                "border-b border-white/5 last:border-0",
                meta.pdfUrl
                  ? "hover:bg-white/[0.06] active:bg-white/10 cursor-pointer"
                  : isStructuredTable
                  ? "cursor-default"
                  : "cursor-default opacity-40",
              ].join(" ")}
              disabled={!meta.pdfUrl}
            >
              {/* Left accent bar for available sources */}
              {meta.pdfUrl && (
                <div
                  className="absolute left-0 top-[3px] bottom-[3px] w-0.5 rounded-r opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: ACCENT }}
                />
              )}
              <BookOpen
                className="w-4 h-4 mt-0.5 flex-shrink-0"
                style={{ color: meta.pdfUrl ? ACCENT : isStructuredTable ? "#FFC107" : "rgba(255,255,255,0.2)" }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white/90 leading-snug">
                  {formatSourceLabel(meta, language)}
                </p>
                {meta.documentCode !== "UNKNOWN" && (
                  <p className="text-[11px] font-mono mt-0.5 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    <span>{meta.documentCode}</span>
                    {meta.sectionRef && (meta.sectionConfidence === "high" || meta.sectionConfidence === "medium") && (
                      <span
                        className="text-[10px] px-1.5 py-px rounded"
                        style={{ background: "rgba(0,212,255,0.12)", color: ACCENT }}
                        title={isRtl ? "رقم القسم المسترجع" : "Retrieved section number"}
                      >
                        {isRtl ? `القسم ${meta.sectionRef}` : `Section ${meta.sectionRef}`}
                      </span>
                    )}
                    {meta.sectionRef && meta.sectionConfidence === "ambiguous" && (
                      <span
                        className="text-[10px] px-1.5 py-px rounded"
                        style={{ background: "rgba(255,193,7,0.16)", color: "#FFC107" }}
                        title={isRtl ? "يحتاج تحقق من المصدر" : "Needs source verification"}
                      >
                        {isRtl ? `القسم ${meta.sectionRef}؟` : `Section ${meta.sectionRef}?`}
                      </span>
                    )}
                  </p>
                )}
                {meta.pageStart !== null && meta.pageEnd !== null && (
                  <p className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                    <span>
                      {isRtl
                        ? `صفحات ${meta.pageStart}–${meta.pageEnd}`
                        : `pp. ${meta.pageStart}–${meta.pageEnd}`}
                    </span>
                    {meta.precision === "page_range" && (
                      <span
                        className="text-[10px] px-1 py-px rounded"
                        style={{ background: "rgba(0,212,255,0.12)", color: ACCENT }}
                      >
                        {isRtl ? "دقيق" : "exact"}
                      </span>
                    )}
                  </p>
                )}
              </div>
              {meta.pdfUrl && (
                <ExternalLink className="w-3 h-3 mt-1 flex-shrink-0" style={{ color: "rgba(255,255,255,0.2)" }} />
              )}
            </button>
            );
          })
        )}
      </div>
    );
  }

  if (activeMeta?.pdfUrl) {
    return <PdfFrame meta={activeMeta} isRtl={isRtl} />;
  }

  // R19B: Structured-table sources — dedicated informational view
  if (activeMeta?.origin === "structured_table") {
    const tableRef = activeMeta.tableRef ?? activeMeta.sectionRef ?? "—";
    const codeLabel = activeMeta.documentCode.replace("-", " ");
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <div
          className="flex items-center justify-center w-14 h-14 rounded-full"
          style={{ background: "rgba(255,193,7,0.1)", border: "1px solid rgba(255,193,7,0.25)" }}
        >
          <BookOpen className="w-6 h-6" style={{ color: "#FFC107" }} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white/90">
            {isRtl ? `${codeLabel} — جدول ${tableRef}` : `${codeLabel} — Table ${tableRef}`}
          </p>
          <p className="text-xs text-white/45 leading-relaxed max-w-[260px]">
            {isRtl
              ? "هذا المصدر مستخرج من قاعدة بيانات الجداول المنظمة — لا يوجد PDF مرتبط."
              : "This source is extracted from the structured tables database — no linked PDF."}
          </p>
        </div>
      </div>
    );
  }

  // Fallback: regular source with no PDF URL — no raw filename exposed
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
      <BookOpen className="w-10 h-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground text-center">
        {isRtl
          ? "ملف PDF لهذا المصدر غير متوفر حالياً."
          : "The PDF for this source is not currently available."}
      </p>
    </div>
  );
}

// ── PDF iframe with load / error handling ─────────────────────────────────────
// The underlying PDF now lives behind a signed URL (the bucket is private),
// so the actual URL must be fetched asynchronously per source. `status`
// covers both "fetching the signed URL" and "loading it into the iframe" —
// both show the same loading overlay; only a genuine failure (unknown/
// rejected path, network error, or the iframe itself failing) shows the
// error overlay.
/**
 * Best-effort: fetch a distinctive snippet of the retrieved chunk's text to
 * anchor the live highlight. Keys on (file_name, page_start) — both reliable
 * even where sbc_documents.section_number drifts from the true heading. The
 * leading slice skips the running-header noise at the top of the chunk body.
 * Returns null on any miss so the viewer simply shows the page with no box.
 */
async function fetchHighlightSnippet(
  sourceFile: string | null | undefined,
  pageStart: number | null,
): Promise<string | null> {
  if (!sourceFile || pageStart == null) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("sbc_documents")
      .select("content")
      .eq("file_name", sourceFile)
      .eq("page_start", pageStart)
      .limit(1);
    const content: string = data?.[0]?.content ?? "";
    if (!content) return null;
    return content.length >= 100 ? content.slice(80, 280) : content;
  } catch {
    return null;
  }
}

function PdfFrame({ meta, isRtl }: { meta: SourceMeta; isRtl: boolean }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [snippet, setSnippet] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);

  // Key on pdfPath + page so a jump within the same PDF re-anchors correctly.
  const requestKey = `${meta.pdfPath ?? ""}#page=${meta.pageStart ?? 1}`;
  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevKeyRef.current === requestKey) return;
    prevKeyRef.current = requestKey;

    let cancelled = false;
    setStatus("loading");
    setSignedUrl(null);
    setSnippet(null);
    setFallback(false);

    (async () => {
      // Fetch the signed URL and the highlight anchor together so the pdf.js
      // viewer mounts ONCE with both (avoids a second, expensive page render).
      const [urlRes, snip] = await Promise.all([
        fetchSignedPdfUrl(meta.pdfPath),
        fetchHighlightSnippet(meta.sourceFile, meta.pageStart),
      ]);
      if (cancelled) return;
      if (!urlRes) { setStatus("error"); return; }
      setSignedUrl(urlRes.url);
      setSnippet(snip);
      setStatus("ready");
    })();

    return () => { cancelled = true; };
  }, [requestKey, meta.pdfPath, meta.sourceFile, meta.pageStart]);

  const onFallback = useCallback(() => setFallback(true), []);
  const iframeSrc = signedUrl ? `${signedUrl}#page=${meta.pageStart ?? 1}` : null;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Loading overlay — while fetching the signed URL */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 pointer-events-none"
        style={{
          background: "rgba(10,14,20,0.88)",
          opacity: status === "loading" ? 1 : 0,
          transition: "opacity 0.25s ease",
        }}
      >
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: ACCENT }} />
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
          {isRtl ? "جاري تحميل…" : "Loading…"}
        </span>
      </div>

      {/* Error overlay */}
      {status === "error" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 z-20"
          style={{ background: "rgba(10,14,20,0.97)" }}
        >
          <AlertTriangle className="w-7 h-7" style={{ color: "#f97316" }} />
          <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.55)" }}>
            {isRtl ? "تعذّر تحميل PDF داخل اللوحة." : "Could not load PDF in panel."}
          </p>
          <button
            onClick={async () => {
              const url = signedUrl ?? (await fetchSignedPdfUrl(meta.pdfPath))?.url;
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 hover:opacity-90 active:scale-95"
            style={{ background: "rgba(0,212,255,0.15)", color: ACCENT, border: `1px solid rgba(0,212,255,0.3)` }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {isRtl ? "فتح في نافذة جديدة" : "Open in new tab"}
          </button>
        </div>
      )}

      {/* Primary: pdf.js viewer with live cited-text highlight. Falls back to
          the native iframe on ANY pdf.js failure, so we never regress below
          the previous behaviour. */}
      {status === "ready" && signedUrl && !fallback && (
        <PdfHighlightViewer
          url={signedUrl}
          pageNumber={meta.pageStart ?? 1}
          highlightText={snippet}
          isRtl={isRtl}
          onFallback={onFallback}
        />
      )}
      {status === "ready" && signedUrl && fallback && iframeSrc && (
        <iframe
          key={iframeSrc}
          src={iframeSrc}
          className="w-full h-full border-0"
          title={meta.title}
          allow="fullscreen"
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SourcePanel — exported component
// ════════════════════════════════════════════════════════════════════════════
export default function SourcePanel({
  state,
  language,
  onClose,
  onSelectSource,
  onBack,
  mode = "overlay",
}: SourcePanelProps) {
  const isRtl = language === "ar";
  const isPaneMode = mode === "pane";
  const resolvedSources = resolveAllSources(state.sources);
  const { activeMeta } = state;
  const isListView = activeMeta === null;

  // ── Within-panel source navigation ──────────────────────────────────────────
  const pdfSources = resolvedSources.filter(m => !!m.pdfUrl);
  const sourceIndex = activeMeta
    ? pdfSources.findIndex(m => m.pdfUrl === activeMeta.pdfUrl)
    : -1;
  const navigatePrev = () => {
    if (sourceIndex > 0) onSelectSource(pdfSources[sourceIndex - 1]);
  };
  const navigateNext = () => {
    if (sourceIndex < pdfSources.length - 1) onSelectSource(pdfSources[sourceIndex + 1]);
  };

  // Close on Escape
  useEffect(() => {
    if (!state.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.open, onClose]);

  if (!state.open) return null;

  // ── Pane mode: fills its AppShell flex column ───────────────────────────
  if (isPaneMode) {
    return (
      <div
        className="print-source-panel flex flex-col w-full h-full"
        style={{ background: PANEL_BG }}
        dir={isRtl ? "rtl" : "ltr"}
      >
        <PanelHeader
          isListView={isListView}
          activeMeta={activeMeta}
          isRtl={isRtl}
          language={language}
          onBack={onBack}
          onClose={onClose}
          sourceIndex={sourceIndex}
          sourceTotal={pdfSources.length}
          onPrevSource={navigatePrev}
          onNextSource={navigateNext}
        />
        <div className="flex-1 overflow-hidden">
          <PanelBody
            isListView={isListView}
            resolvedSources={resolvedSources}
            activeMeta={activeMeta}
            isRtl={isRtl}
            language={language}
            onSelectSource={onSelectSource}
          />
        </div>
      </div>
    );
  }

  // ── Overlay mode: fixed slide-over ──────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="print-source-panel fixed top-0 bottom-0 z-50 flex flex-col w-full sm:w-[480px] lg:w-[520px]"
        style={{
          [isRtl ? "left" : "right"]: 0,
          background: PANEL_BG,
          borderLeft: isRtl ? "none" : `1px solid ${BORDER_COLOR}`,
          borderRight: isRtl ? `1px solid ${BORDER_COLOR}` : "none",
          boxShadow: "0 0 40px rgba(0,0,0,0.6)",
        }}
        dir={isRtl ? "rtl" : "ltr"}
      >
        <PanelHeader
          isListView={isListView}
          activeMeta={activeMeta}
          isRtl={isRtl}
          language={language}
          onBack={onBack}
          onClose={onClose}
          sourceIndex={sourceIndex}
          sourceTotal={pdfSources.length}
          onPrevSource={navigatePrev}
          onNextSource={navigateNext}
        />
        {/* R19: iOS safe-area-inset-bottom so content isn't clipped behind home indicator */}
        <div className="flex-1 overflow-hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <PanelBody
            isListView={isListView}
            resolvedSources={resolvedSources}
            activeMeta={activeMeta}
            isRtl={isRtl}
            language={language}
            onSelectSource={onSelectSource}
          />
        </div>
      </div>
    </>
  );
}
