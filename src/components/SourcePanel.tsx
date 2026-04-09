import { useEffect } from "react";
import { X, ExternalLink, ArrowLeft, BookOpen, Printer } from "lucide-react";
import { resolveAllSources, formatSourceLabel, SourceMeta } from "@/utils/sourceMetadata";

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
}: {
  isListView: boolean;
  activeMeta: SourceMeta | null;
  isRtl: boolean;
  language: "ar" | "en";
  onBack: () => void;
  onClose: () => void;
}) {
  const handlePrint = () => window.print();

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
      style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}
    >
      {/* Back — only in PDF view */}
      {!isListView && (
        <button
          onClick={onBack}
          className="p-1.5 rounded-md text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
          aria-label={isRtl ? "رجوع" : "Back"}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
      )}

      <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: ACCENT }} />
      <span className="flex-1 text-sm font-medium text-white truncate">
        {isListView
          ? (isRtl ? "المصادر المرجعية" : "Source References")
          : activeMeta
          ? (activeMeta.documentCode === "UNKNOWN" ? activeMeta.title : formatSourceLabel(activeMeta, language))
          : ""}
      </span>

      {/* External link — only in PDF view */}
      {!isListView && activeMeta?.pdfUrl && (
        <a
          href={activeMeta.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
          aria-label={isRtl ? "فتح في نافذة جديدة" : "Open in new tab"}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      )}

      {/* Print — only in PDF view */}
      {!isListView && activeMeta?.pdfUrl && (
        <button
          onClick={handlePrint}
          className="p-1.5 rounded-md text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
          aria-label={isRtl ? "طباعة" : "Print"}
        >
          <Printer className="w-4 h-4" />
        </button>
      )}

      {/* Close */}
      <button
        onClick={onClose}
        className="p-1.5 rounded-md text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
        aria-label={isRtl ? "إغلاق" : "Close"}
      >
        <X className="w-4 h-4" />
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
          resolvedSources.map((meta) => (
            <button
              key={meta.pdfPath ?? meta.sourceFile}
              onClick={() => (meta.pdfUrl ? onSelectSource(meta) : undefined)}
              className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
              disabled={!meta.pdfUrl}
            >
              <BookOpen
                className="w-4 h-4 mt-0.5 flex-shrink-0"
                style={{ color: meta.pdfUrl ? ACCENT : "rgba(255,255,255,0.3)" }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white leading-snug">
                  {formatSourceLabel(meta, language)}
                </p>
                {meta.documentCode !== "UNKNOWN" && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono">
                    {meta.documentCode}
                  </p>
                )}
                {meta.pageStart !== null && meta.pageEnd !== null && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isRtl
                      ? `صفحات ${meta.pageStart}–${meta.pageEnd}`
                      : `Pages ${meta.pageStart}–${meta.pageEnd}`}
                  </p>
                )}
                {!meta.pdfUrl && (
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {isRtl ? "المصدر غير متوفر" : "Source not available"}
                  </p>
                )}
              </div>
              {meta.pdfUrl && (
                <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
              )}
            </button>
          ))
        )}
      </div>
    );
  }

  if (activeMeta?.pdfUrl) {
    return (
      <iframe
        src={`${activeMeta.pdfUrl}#page=${activeMeta.pageStart ?? 1}`}
        className="w-full h-full border-0"
        title={activeMeta.title}
        allow="fullscreen"
      />
    );
  }

  // Fallback: no PDF URL
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
      <BookOpen className="w-10 h-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground text-center">
        {isRtl
          ? "ملف PDF لهذا المصدر غير متوفر."
          : "The PDF for this source is not available."}
      </p>
      <p className="text-xs text-muted-foreground/60 text-center font-mono break-all">
        {activeMeta?.sourceFile}
      </p>
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
    </>
  );
}
