/**
 * ComplianceReportButton.tsx — "تقرير الامتثال" button, gated behind
 * COMPLIANCE_REPORT_UI (src/lib/featureFlags.ts). Rendered next to each
 * message's UtilityBar (Copy/Export/PDF, src/components/ChatInterface.tsx).
 * Clicking it always builds a report for the WHOLE open conversation (every
 * question/answer pair collected so far), not just the one message the
 * button happens to sit next to — a compliance report is a
 * conversation-level artifact, same as the source-of-truth plan in
 * docs/launch/building-profile-notes.md section 2.
 *
 * Building-profile row is fetched fresh on click (not cached from the
 * header's BuildingProfileCard) so the report always reflects what's
 * actually saved, even if BuildingProfileCard hasn't mounted/loaded yet in
 * this render. public.building_profiles is already applied in production
 * (docs/db/20260903_building_profiles.sql) — a missing/absent row is a
 * normal "no profile attached" case, handled gracefully by
 * buildComplianceReportHtml itself, not an error.
 *
 * Print pattern: same Blob + URL.createObjectURL + window.open as
 * UtilityBar's handlePdf in ChatInterface.tsx. The one difference: handlePdf
 * builds its own HTML string with a `window.onload = () => window.print()`
 * baked in; buildComplianceReportHtml() (src/lib/complianceReport.ts, not
 * owned by this file) returns a plain static document with no such script,
 * so printing is triggered from the OPENER side instead via `win.onload`.
 */
import { useState } from "react";
import { FileCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { BuildingProfile } from "@/lib/buildingProfile";
import {
  buildComplianceReportHtml,
  buildComplianceReportFilename,
  type ComplianceReportItem,
  type ComplianceCitation,
} from "@/lib/complianceReport";
import { resolveSourcesWithMeta, resolveAllSources, type ChunkPageMeta } from "@/utils/sourceMetadata";
import type { CitationStatusItem } from "./ChatMarkdownRenderer";

/**
 * Minimal shape this component needs from a chat message — duck-typed
 * against ChatInterface.tsx's own (unexported) `Message` so no import /
 * circular dependency is required. `messages` (already `Message[]`) is
 * structurally compatible and can be passed straight through.
 */
export interface ReportableMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  sourceMeta?: ChunkPageMeta[];
  citationStatuses?: CitationStatusItem[];
  mode?: "primary" | "standard" | "analysis" | string;
  timestamp: Date;
}

function buildCitations(message: ReportableMessage): ComplianceCitation[] {
  if (message.citationStatuses && message.citationStatuses.length > 0) {
    return message.citationStatuses.map((c) => ({
      code: c.code,
      section: c.section,
      page: c.page ?? null,
      status: c.status,
    }));
  }
  if (message.sources && message.sources.length > 0) {
    const resolved = message.sourceMeta && message.sourceMeta.length > 0
      ? resolveSourcesWithMeta(message.sources, message.sourceMeta)
      : resolveAllSources(message.sources);
    return resolved.map((m) => ({
      code: m.documentCode === "UNKNOWN" ? m.title : m.documentCode.replace("-", " "),
      section: m.sectionRef,
      page: m.pageStart != null ? (m.pageEnd != null && m.pageEnd !== m.pageStart ? `${m.pageStart}-${m.pageEnd}` : m.pageStart) : null,
    }));
  }
  return [];
}

/** Pairs consecutive user->assistant turns into report items, in conversation order. */
function buildReportItems(messages: ReportableMessage[]): ComplianceReportItem[] {
  const items: ComplianceReportItem[] = [];
  let pendingQuestion = "";
  for (const m of messages) {
    if (m.role === "user") {
      pendingQuestion = m.content;
      continue;
    }
    items.push({
      question: pendingQuestion,
      answerMarkdown: m.content,
      citations: buildCitations(m),
      mode: m.mode ?? "primary",
      createdAt: m.timestamp.toISOString(),
    });
    pendingQuestion = "";
  }
  return items;
}

interface ComplianceReportButtonProps {
  conversationId: string | null;
  userId: string | null;
  messages: ReportableMessage[];
  engineerName?: string;
  language: "ar" | "en" | string;
}

export default function ComplianceReportButton({ conversationId, userId, messages, engineerName, language }: ComplianceReportButtonProps) {
  const { toast } = useToast();
  const isAr = language !== "en";
  const [building, setBuilding] = useState(false);

  const handleClick = async () => {
    if (building) return;
    setBuilding(true);
    try {
      let profile: Partial<BuildingProfile> | null = null;
      if (conversationId) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let query = (supabase as any).from("building_profiles").select("*").eq("conversation_id", conversationId);
          if (userId) query = query.eq("user_id", userId);
          const { data } = await query.maybeSingle();
          profile = (data as BuildingProfile) ?? null;
        } catch {
          profile = null; // no row / table unreachable — report renders its own "no profile" section
        }
      }

      const generatedAt = new Date().toISOString();
      const meta = {
        projectName: profile?.name?.trim() || "",
        engineerName,
        generatedAt,
        language: (isAr ? "ar" : "en") as "ar" | "en",
      };

      const html = buildComplianceReportHtml({
        profile,
        items: buildReportItems(messages),
        assumptions: [],
        openItems: [],
        meta,
      });
      const filename = buildComplianceReportFilename(meta);

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) {
        win.document.title = filename;
        win.onload = () => { try { win.focus(); win.print(); } catch { /* user can print manually */ } };
        win.onunload = () => URL.revokeObjectURL(url);
      } else {
        URL.revokeObjectURL(url);
        toast({
          title: isAr ? "تعذّر فتح نافذة التقرير" : "Could not open the report window",
          description: isAr ? "تحقّق من مانع النوافذ المنبثقة." : "Check your popup blocker.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: isAr ? "تعذّر توليد تقرير الامتثال" : "Could not generate the compliance report",
        variant: "destructive",
      });
    } finally {
      setBuilding(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={building}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-border/40 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-50"
      title={isAr ? "توليد تقرير امتثال لهذه المحادثة" : "Generate a compliance report for this conversation"}
    >
      {building ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileCheck className="w-3 h-3" />}
      <span>{isAr ? "تقرير الامتثال" : "Compliance report"}</span>
    </button>
  );
}
