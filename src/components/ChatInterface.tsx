import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, ArrowLeft, ArrowRight, Flame, FileText, AlertTriangle, RefreshCw, BookOpen, FlaskConical, ClipboardList, MessageSquare, Plus, Paperclip, FolderOpen, X, Eye, UserCircle, ShieldCheck, Lock, Copy, Share2, FileDown } from "lucide-react";
import { usePendingFiles } from "@/hooks/usePendingFiles";
import FilePreviewGrid from "@/components/FilePreviewGrid";
import TrialCountdownBanner from "./TrialCountdownBanner";
import TrialExpiryModal from "./TrialExpiryModal";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getSuggestedQuestionKeys } from "@/lib/suggestions";
import { useLanguage } from "@/hooks/useLanguage";
import { LanguageToggle } from "@/components/LanguageToggle";
import consultxIcon from "@/assets/consultx-platform-logo.png";
import ChatMarkdownRenderer from "./ChatMarkdownRenderer";
import AnalysisResultCard, { isVisionAnalysisResponse, isComplianceTextResponse } from "./AnalysisResultCard";
import ConversationsList from "./ConversationsList";
import BottomNav from "./BottomNav";
import { useConversations } from "@/hooks/useConversations";
import { useSubscription } from "@/hooks/useSubscription";
import { useLaunchTrial } from "@/hooks/useLaunchTrial";
import { useIsMobile } from "@/hooks/use-mobile";
import InChatUpgradePrompt from "./InChatUpgradePrompt";
import LaunchTrialWelcomeBanner from "./LaunchTrialWelcomeBanner";
import { TrialDaysIndicator } from "./ModeUsageIndicator";
import SourcePanel, { CLOSED_PANEL, SourcePanelState } from "@/components/SourcePanel";
import { resolveAllSources, resolveSourcesWithMeta, formatSourceLabel, type ChunkPageMeta } from "@/utils/sourceMetadata";
import { usePreferences } from "@/hooks/usePreferences";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isValid?: boolean;
  sources?: string[];
  sourceMeta?: ChunkPageMeta[];
  dbId?: string;
  imageUrl?: string;
  imageUrls?: string[];
  mode?: ChatMode;
  hasImage?: boolean; // for history trimming in تحليلي mode
}

// Special divider message type
interface DividerMessage {
  id: string;
  type: "divider";
  mode: ChatMode;
  timestamp: Date;
}

// In-chat upgrade prompt (trial expired)
interface UpgradeItem {
  id: string;
  type: "upgrade";
  variant: "trial_expired";
  mode?: ChatMode;
  timestamp: Date;
}

type ChatItem = Message | DividerMessage | UpgradeItem;

interface ChatInterfaceProps {
  onBack: () => void;
  /**
   * When set, source-panel state is synced to parent (AppShell) which renders
   * the source panel as a 3rd pane. ChatInterface will NOT render its own
   * SourcePanel overlay when this prop is provided.
   */
  onSourceStateChange?: (state: SourcePanelState) => void;
  /**
   * Populated by ChatInterface so the parent can imperatively trigger
   * the conversation history modal (e.g. from the sidebar).
   */
  historyTriggerRef?: React.MutableRefObject<(() => void) | null>;
}

type ChatMode = "primary" | "standard" | "analysis";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fire-safety-chat`;
const MAX_RETRIES = 3;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
// NO hard timeout — only abort on manual mode switch / navigation
// Auto-error check only after 5 minutes (300s)
const ERROR_CHECK_DELAY_MS = 300_000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Requirement 4 — Utility Bar: Copy · Export · Download PDF
// 100% inline styles — no CSS class dependency, no external hooks
// ─────────────────────────────────────────────────────────────────────────────
function UtilityBar({ content, mode, messageId, userName }: {
  content: string; mode: ChatMode; messageId: string; userName: string;
}) {
  const [copied,   setCopied]   = useState(false);
  const [exported, setExported] = useState(false);

  const accent =
    mode === "primary"  ? "#00D4FF" :
    mode === "standard" ? "#FF8C00" : "#DC143C";

  const BASE: React.CSSProperties = {
    display:        "inline-flex",
    alignItems:     "center",
    gap:            "5px",
    padding:        "3px 11px",
    borderRadius:   "6px",
    fontSize:       "0.71rem",
    fontWeight:     500,
    color:          "#7a8898",
    background:     "transparent",
    border:         "1px solid rgba(255,255,255,0.10)",
    cursor:         "pointer",
    whiteSpace:     "nowrap",
    fontFamily:     "inherit",
    letterSpacing:  "0.02em",
    transition:     "color 0.15s, border-color 0.15s, background 0.15s",
    lineHeight:     1,
  };

  const hover = (e: React.MouseEvent<HTMLButtonElement>, on: boolean) => {
    const el = e.currentTarget;
    el.style.color        = on ? accent   : "#7a8898";
    el.style.borderColor  = on ? `${accent}55` : "rgba(255,255,255,0.10)";
    el.style.background   = on ? `${accent}14` : "transparent";
  };

  // ── Copy ──────────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    console.log("[ConsultX Utility] Copy clicked");
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      console.log("[ConsultX Utility] Copied to clipboard ✓");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[ConsultX Utility] Copy failed:", err);
    }
  };

  // ── Export — Web Share API with clipboard fallback ───────────────────────
  const handleExport = async () => {
    console.log("[ConsultX Utility] Export clicked");
    try {
      if (navigator.share) {
        await navigator.share({ title: "ConsultX - تقرير هندسي", text: content });
      } else {
        await navigator.clipboard.writeText(content);
      }
      setExported(true);
      console.log("[ConsultX Utility] Export done ✓");
      setTimeout(() => setExported(false), 2000);
    } catch (err) {
      console.error("[ConsultX Utility] Export failed:", err);
    }
  };

  // ── PDF — DOM clone, branded A4 print window ─────────────────────────────
  const handlePdf = () => {
    console.log("[ConsultX Utility] PDF clicked");

    // 1. Grab fully-rendered HTML
    const contentEl  = document.getElementById(`cmr-${messageId}`);
    const renderedHtml = contentEl
      ? contentEl.innerHTML
      : `<pre style="white-space:pre-wrap">${content.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre>`;

    // 2. Carry over page stylesheets (Tailwind class fidelity)
    const styleLinks = Array.from(document.styleSheets)
      .map(ss => { try { return ss.href ? `<link rel="stylesheet" href="${ss.href}">` : ""; } catch { return ""; } })
      .filter(Boolean).join("\n");

    // 3. Timestamp
    const exportTs = new Date().toLocaleString("ar-SA");

    // 4. Read customization from localStorage (saved by CustomizationSection)
    const cxCompanyName   = localStorage.getItem("cx_company_name")   || "";
    const cxReportHeader  = localStorage.getItem("cx_report_header")  || "";
    const cxReportFooter  = localStorage.getItem("cx_report_footer")  || "";
    const cxLogo          = localStorage.getItem("cx_company_logo")   || "";

    const sc = "</" + "script>";

    // Build HTML string pieces — NO unicode escapes, plain Arabic only
    const titleText     = cxCompanyName ? cxCompanyName + " \u2014 تقرير هندسي" : "ConsultX \u2014 تقرير هندسي";
    // Header brand: use company logo + name if set, otherwise ConsultX defaults
    const logoSrc       = cxLogo || consultxIcon;
    const platformText  = cxCompanyName || "ConsultX \u2014 منصة الاستشارات الهندسية";
    const subtitleText  = "تقرير التدقيق الهندسي \u2014 اشتراطات كود البناء السعودي";
    const preparerLabel = "إعداد المهندس:";
    const dateLabel     = "تاريخ التصدير:";
    // Footer: use custom footer text if set, otherwise ConsultX default
    const footerText    = cxReportFooter || "ConsultX \u2014 منصة الاستشارات الهندسية والوقاية من الحريق";
    const pageLabel     = "صفحة ";
    const preparerFooter = "إعداد المهندس: " + userName;
    // Custom report header block (shown below the header bar if set)
    const customHeaderBlock = cxReportHeader
      ? `<div style="margin: 0 0 20px; padding: 10px 28px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 0.8rem; color: #374151; white-space: pre-line; direction: rtl;">${cxReportHeader.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`
      : "";

    const html = [
      "<!DOCTYPE html>",
      '<html dir="rtl" lang="ar">',
      "<head>",
      '<meta charset="UTF-8">',
      "<title>" + titleText + "</title>",
      '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet">',
      styleLinks,
      "<style>",
      /* Override dark-theme CSS vars so all Tailwind utility classes (text-foreground,
         bg-card, text-muted-foreground, etc.) resolve to print-safe light values.
         The <style> tag is declared AFTER the linked Tailwind sheet so equal-specificity
         :root rules here win the cascade. */
      ":root {",
      "  --background: 0 0% 100%;",
      "  --foreground: 220 40% 6%;",
      "  --card: 0 0% 100%;",
      "  --card-foreground: 220 40% 6%;",
      "  --popover: 0 0% 100%;",
      "  --popover-foreground: 220 40% 6%;",
      "  --primary: 195 70% 28%;",
      "  --primary-foreground: 0 0% 100%;",
      "  --secondary: 220 14% 96%;",
      "  --secondary-foreground: 220 40% 6%;",
      "  --muted: 220 14% 96%;",
      "  --muted-foreground: 215 16% 35%;",
      "  --accent: 195 70% 28%;",
      "  --accent-foreground: 0 0% 100%;",
      "  --destructive: 0 72% 45%;",
      "  --destructive-foreground: 0 0% 100%;",
      "  --border: 220 13% 88%;",
      "  --input: 220 13% 88%;",
      "  --ring: 195 70% 28%;",
      "}",
      "*, *::before, *::after { box-sizing: border-box; }",
      "html { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }",
      "body { font-family: 'Cairo', system-ui, sans-serif; line-height: 1.85; color: #111827; background: #ffffff; margin: 0; padding: 0 0 60px; direction: rtl; orphans: 3; widows: 3; }",
      "details { display: block !important; }",
      "details > *:not(summary) { display: block !important; }",
      "summary::marker, summary::-webkit-details-marker { display: none !important; }",
      "button { display: none !important; }",
      ".cx-hdr { background: linear-gradient(135deg, #e8f4fd 0%, #f0f8ff 100%); border-bottom: 3px solid #00D4FF; padding: 18px 28px 16px; margin-bottom: 0; display: flex; justify-content: space-between; align-items: center; gap: 16px; page-break-inside: avoid; break-inside: avoid; }",
      ".cx-hdr-brand { display: flex; align-items: center; gap: 12px; }",
      ".cx-hdr-brand img { height: 40px; width: 40px; object-fit: contain; flex-shrink: 0; }",
      ".cx-hdr-brand h1 { margin: 0 0 2px; font-size: 1.05rem; font-weight: 700; color: #0369a1; white-space: nowrap; }",
      ".cx-hdr-brand p { margin: 0; font-size: 0.72rem; color: #475569; }",
      ".cx-hdr-meta { text-align: left; font-size: 0.72rem; color: #475569; line-height: 1.9; white-space: nowrap; }",
      ".cx-hdr-meta strong { color: #1e3a5f; font-weight: 600; }",
      ".cx-content { padding: 20px 28px 0; }",
      ".consultx-bold-primary  { color: #005B70 !important; background: rgba(0,91,112,0.08) !important; border-bottom-color: #005B70 !important; }",
      ".consultx-bold-standard { color: #8B4500 !important; background: transparent !important; }",
      ".consultx-bold-analysis { color: #800000 !important; background: transparent !important; }",
      "table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 0.85rem; break-inside: avoid; }",
      "table thead th { background: #dbeafe !important; color: #1e3a5f !important; font-weight: 700; padding: 8px 12px; border-bottom: 2px solid #93c5fd; text-align: right; }",
      "table tbody tr:nth-child(even) td { background: #f9fafb !important; }",
      "table tbody tr:nth-child(odd)  td { background: #ffffff !important; }",
      "table td { padding: 7px 12px; border-bottom: 1px solid #e5e7eb; color: #111827 !important; vertical-align: top; line-height: 1.7; }",
      "details { border: 1px solid #b0d4e8 !important; background: #f0f8ff !important; margin: 8px 0; border-radius: 6px; break-inside: avoid; }",
      "summary { font-weight: 600 !important; color: #005B70 !important; padding: 8px 12px; font-size: 0.875rem; }",
      "blockquote { border-right: 3px solid #005B70 !important; background: #f0f8ff !important; color: #1e3a5f !important; padding: 8px 14px; margin: 8px 0; }",
      "h1, h2 { color: #0c2a4a !important; border-bottom-color: #93c5fd !important; page-break-after: avoid; break-after: avoid; }",
      "h3, h4 { color: #1e3a5f !important; page-break-after: avoid; break-after: avoid; }",
      "[class*='emerald'] { background: #d1fae5 !important; color: #065f46 !important; border-color: #6ee7b7 !important; }",
      "[class*='red-']    { background: #fee2e2 !important; color: #991b1b !important; border-color: #fca5a5 !important; }",
      "[class*='amber-']  { background: #fef3c7 !important; color: #92400e !important; border-color: #fcd34d !important; }",
      "[class*='emerald'], [class*='red-'], [class*='amber-'], [class*='compliance'], [class*='alert'], [class*='warning'], [class*='border-'] { break-inside: avoid; }",
      "p, li { orphans: 3; widows: 3; }",
      ".cx-footer { position: fixed; bottom: 0; left: 0; right: 0; height: 36px; border-top: 1px solid #d1d5db; background: #ffffff; display: flex; justify-content: space-between; align-items: center; padding: 0 28px; font-size: 0.68rem; color: #6b7280; z-index: 9999; }",
      ".cx-footer .cx-page-num::after { content: counter(page); }",
      "@media print { @page { size: A4; margin: 1.5cm 1.5cm 2.5cm 1.5cm; } body { color: #000000 !important; background: #ffffff !important; } .cx-footer { display: none; } }",
      "</style>",
      "</head>",
      "<body>",
      '<div class="cx-hdr">',
      '  <div class="cx-hdr-brand">',
      '    <img src="' + logoSrc + '" alt="logo" onerror="this.style.display=\'none\'">',
      "    <div>",
      "      <h1>" + platformText + "</h1>",
      "      <p>" + subtitleText + "</p>",
      "    </div>",
      "  </div>",
      '  <div class="cx-hdr-meta">',
      "    <div><strong>" + preparerLabel + "</strong> " + userName + "</div>",
      "    <div><strong>" + dateLabel + "</strong> " + exportTs + "</div>",
      "  </div>",
      "</div>",
      customHeaderBlock,
      '<div class="cx-content">' + renderedHtml + "</div>",
      '<div class="cx-footer">',
      "  <span>" + footerText + "</span>",
      '  <span class="cx-page-num">' + pageLabel + "</span>",
      "  <span>" + preparerFooter + "</span>",
      "</div>",
      "<script>",
      "  document.querySelectorAll('details').forEach(function(d) { d.setAttribute('open', ''); });",
      "  var COLOR_MAP = {",
      "    '#00d4ff': '#005B70', 'rgb(0, 212, 255)': '#005B70', 'rgba(0, 212, 255': '#005B70',",
      "    '#ff8c00': '#8B4500', 'rgb(255, 140, 0)': '#8B4500', 'rgba(255, 140, 0': '#8B4500',",
      "    '#dc143c': '#800000', 'rgb(220, 20, 60)': '#800000', 'rgba(220, 20, 60': '#800000'",
      "  };",
      "  function remapEl(el) {",
      "    if (!el.style) return;",
      "    var c = (el.style.color || '').toLowerCase();",
      "    var bc = (el.style.borderColor || el.style.borderBottomColor || '').toLowerCase();",
      "    var bg = (el.style.background || el.style.backgroundColor || '').toLowerCase();",
      "    for (var key in COLOR_MAP) {",
      "      if (c.indexOf(key) !== -1) el.style.color = COLOR_MAP[key];",
      "      if (bc.indexOf(key) !== -1) { el.style.borderColor = COLOR_MAP[key]; el.style.borderBottomColor = COLOR_MAP[key]; }",
      "      if (bg.indexOf(key) !== -1) el.style.background = 'transparent';",
      "    }",
      "    if (c === 'rgb(255, 255, 255)' || c === '#fff' || c === '#ffffff') el.style.color = '#000000';",
      "    /* Remap SVG fill attributes with neon colours */",
      "    var fill = (el.getAttribute && el.getAttribute('fill') || '').toLowerCase();",
      "    if (fill) {",
      "      for (var fk in COLOR_MAP) { if (fill.indexOf(fk) !== -1) { el.setAttribute('fill', COLOR_MAP[fk]); break; } }",
      "      if (fill === 'rgba(0, 212, 255, 0.85)' || fill.indexOf('0,212,255') !== -1) el.setAttribute('fill', '#005B70');",
      "      if (fill === 'rgba(255, 140, 0, 0.80)' || fill.indexOf('255,140,0') !== -1) el.setAttribute('fill', '#8B4500');",
      "      if (fill === 'rgba(220, 38, 38, 0.80)' || fill.indexOf('220,38,38') !== -1) el.setAttribute('fill', '#800000');",
      "    }",
      "    /* Force dark text on any element whose computed colour is very light */",
      "    try {",
      "      var comp = window.getComputedStyle(el).color;",
      "      if (comp) {",
      "        var nums = comp.match(/\\d+/g);",
      "        if (nums && nums.length >= 3) {",
      "          var r = +nums[0], g = +nums[1], b = +nums[2];",
      "          var brightness = (r * 299 + g * 587 + b * 114) / 1000;",
      "          if (brightness > 180 && !el.style.color) el.style.color = '#111827';",
      "        }",
      "      }",
      "    } catch(e) {}",
      "  }",
      "  document.querySelectorAll('*').forEach(remapEl);",
      "  document.body.style.background = '#ffffff';",
      "  document.documentElement.style.background = '#ffffff';",
      "  window.onload = function() { window.print(); };",
      sc,
      "</body>",
      "</html>",
    ].join("\n");

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, "_blank");
    if (win) {
      console.log("[ConsultX Utility] Print window opened ✓");
      win.onunload = () => URL.revokeObjectURL(url);
    } else {
      console.error("[ConsultX Utility] Popup blocked — allow popups for this site");
    }
  };

  // ── Icon helpers (no className dependency) ───────────────────────────────
  const CheckIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
  const CopyIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  );
  const ShareIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
  const PdfIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
  );

  return (
    <div style={{
      display:     "flex",
      alignItems:  "center",
      gap:         "6px",
      paddingTop:  "10px",
      marginTop:   "6px",
      borderTop:   "1px solid rgba(255,255,255,0.08)",
    }}>
      {/* Copy */}
      <button
        onClick={handleCopy}
        onMouseEnter={e => hover(e, true)}
        onMouseLeave={e => hover(e, false)}
        style={{ ...BASE, ...(copied ? { color: accent } : {}) }}
        title="نسخ النص"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span>{copied ? "تم!" : "نسخ"}</span>
      </button>

      {/* Export */}
      <button
        onClick={handleExport}
        onMouseEnter={e => hover(e, true)}
        onMouseLeave={e => hover(e, false)}
        style={{ ...BASE, ...(exported ? { color: accent } : {}) }}
        title="تصدير / مشاركة"
      >
        {exported ? <CheckIcon /> : <ShareIcon />}
        <span>{exported ? "تم!" : "تصدير"}</span>
      </button>

      {/* PDF */}
      <button
        onClick={handlePdf}
        onMouseEnter={e => hover(e, true)}
        onMouseLeave={e => hover(e, false)}
        style={BASE}
        title="تحميل PDF"
      >
        <PdfIcon />
        <span>PDF</span>
      </button>
    </div>
  );
}

// ===== MODE COLOR HELPERS =====
function getModeGlowClass(mode: ChatMode) {
  if (mode === "primary") return "mode-glow-primary";
  if (mode === "standard") return "mode-glow-standard";
  return "mode-glow-analysis";
}

function getAvatarGlowClass(mode: ChatMode) {
  if (mode === "primary") return "avatar-glow-primary";
  if (mode === "standard") return "avatar-glow-standard";
  return "avatar-glow-analysis";
}

function getModeAccentColor(mode: ChatMode) {
  if (mode === "primary") return "rgba(0, 212, 255, 0.6)";
  if (mode === "standard") return "rgba(255, 140, 0, 0.6)";
  return "rgba(220, 20, 60, 0.6)";
}

function getModeAccentBorder(mode: ChatMode) {
  if (mode === "primary") return "border-l-[#00D4FF]";
  if (mode === "standard") return "border-l-[#FF8C00]";
  return "border-l-[#DC143C]";
}

function getModeAccentBg(mode: ChatMode) {
  if (mode === "primary") return "rgba(0, 212, 255, 0.08)";
  if (mode === "standard") return "rgba(255, 140, 0, 0.08)";
  return "rgba(220, 20, 60, 0.08)";
}

function getModeDotColor(mode: ChatMode) {
  if (mode === "primary") return "#00D4FF";
  if (mode === "standard") return "#FF8C00";
  return "#DC143C";
}

function getModeButtonActiveStyle(mode: ChatMode) {
  if (mode === "primary") return { background: "rgba(0,212,255,0.15)", color: "#00D4FF", boxShadow: "0 0 10px rgba(0,212,255,0.3)" };
  if (mode === "standard") return { background: "rgba(255,140,0,0.15)", color: "#FF8C00", boxShadow: "0 0 10px rgba(255,140,0,0.3)" };
  return { background: "rgba(220,20,60,0.15)", color: "#DC143C", boxShadow: "0 0 10px rgba(220,20,60,0.3)" };
}

// ===== SOURCE NAME FORMATTER =====
function formatSourceName(fileName: string, lang: string = "ar"): string {
  // "SBC 201 - The Saudi General Building Code-251-500 extracted chunks" → "📖 SBC 201 — صفحات 251-500"
  // "SBC 801 - The Saudi Fire Protection Code (3)-1-200_extracted_chunks.json" → "📖 SBC 801 — صفحات 1-200"
  // [^-]* prevents the pattern from consuming the page-range dashes when the title contains dashes
  const match = fileName.match(/SBC\s*(\d+)[^-]*-(\d+)-(\d+)/);
  if (match) {
    return lang === "en"
      ? `📖 SBC ${match[1]} — Pages ${match[2]}-${match[3]}`
      : `📖 SBC ${match[1]} — صفحات ${match[2]}-${match[3]}`;
  }
  return fileName.replace(/\.json$/i, "").replace(/_/g, " ").trim();
}

// ===== SWITCH MARKER PARSER =====
const SWITCH_PATTERN = /\[SWITCH:(استشاري|تحليلي)\]/g;

function hasSwitchMarker(content: string): { found: boolean; targetMode: ChatMode | null; cleanContent: string } {
  const match = SWITCH_PATTERN.exec(content);
  SWITCH_PATTERN.lastIndex = 0; // reset
  if (!match) return { found: false, targetMode: null, cleanContent: content };
  const modeMap: Record<string, ChatMode> = { "استشاري": "standard", "تحليلي": "analysis" };
  const targetMode = modeMap[match[1]] || null;
  const cleanContent = content.replace(SWITCH_PATTERN, "").trim();
  SWITCH_PATTERN.lastIndex = 0;
  return { found: true, targetMode, cleanContent };
}

// ===== VALIDATION =====
function validateResponse(content: string, mode: ChatMode, language: string = "ar"): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check for switch marker first - this is a valid intentional handoff, not an error
  if (/\[SWITCH:(استشاري|تحليلي)\]/.test(content)) {
    return { valid: true, issues: [] };
  }
  
  if (mode === "primary") return { valid: true, issues: [] };
  if (mode === "analysis") {
    // Analysis mode: check for Document:/Section: references or SBC refs
    const hasRef = /Document:|Section:|SBC\s*\d{3}|المادة|الفقرة|البند|section|clause/i.test(content);
    if (!hasRef && content.length > 200) issues.push("Missing SBC references in analysis");
  } else {
    // Standard (consultant) mode: validate new A-F structure
    // Look for section markers (A through F) or reference indicators
    const hasStructuredSections = /^#{1,3}\s*[A-Fأ-و][\.\)–:]/m.test(content) 
      || /Document:|Section:|Page:|الوثيقة:|القسم:|الصفحة:/i.test(content);
    const hasCodeReference = /SBC\s*\d{3}|NFPA\s*\d|Document:|Section:/i.test(content);
    if (!hasStructuredSections && !hasCodeReference && content.length > 300) {
      issues.push("Missing structured sections or code references");
    }
  }
  return { valid: issues.length === 0, issues };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== SMART HISTORY TRIMMING =====
// ai_memory_level controls the history window:
//   "none"       → only the most recent user + assistant pair (no prior context)
//   "session"    → mode-specific defaults (current behaviour)
//   "persistent" → all real messages up to a generous cap (50) — full session memory
function trimMessageHistory(
  messages: Message[],
  mode: ChatMode,
  aiMemoryLevel: "none" | "session" | "persistent" = "session"
): ChatMessage[] {
  const real = messages.filter(m => !("type" in m));

  if (aiMemoryLevel === "none") {
    // No history — only send the last user message so the AI starts fresh each turn.
    const lastUser = [...real].reverse().find(m => m.role === "user");
    return lastUser ? [{ role: lastUser.role, content: lastUser.content }] : [];
  }

  if (aiMemoryLevel === "persistent") {
    // Send up to the last 50 real messages — full in-session memory.
    return real.slice(-50).map(m => ({ role: m.role, content: m.content }));
  }

  // "session" → original per-mode defaults
  if (mode === "primary") {
    // رئيسي: last 6 only — quick exchanges
    return real.slice(-6).map(m => ({ role: m.role, content: m.content }));
  }
  if (mode === "analysis") {
    // تحليلي: last 6, but always keep the message with an image
    const recent = real.slice(-6);
    const imageMsgIdx = [...real].reverse().findIndex(m => m.hasImage);
    const imageMsg = imageMsgIdx >= 0 ? real[real.length - 1 - imageMsgIdx] : undefined;
    if (imageMsg && !recent.includes(imageMsg)) {
      return [imageMsg, ...recent].map(m => ({ role: m.role, content: m.content }));
    }
    return recent.map(m => ({ role: m.role, content: m.content }));
  }
  // استشاري: first msg + last 10, max 15 — keep original question
  const last10 = real.slice(-10);
  const first = real[0];
  if (!first || last10.includes(first)) return last10.slice(0, 15).map(m => ({ role: m.role, content: m.content }));
  return [first, ...last10].slice(0, 15).map(m => ({ role: m.role, content: m.content }));
}

async function streamChat({
  messages, retry = false, mode = "standard", language = "ar", images,
  output_format, preferred_standards,
  onDelta, onFirstChunk, onDone, onError, onSources, onSourceMeta, signal
}: {
  messages: ChatMessage[]; retry?: boolean; mode?: ChatMode; language?: string; images?: string[];
  output_format?: string;
  preferred_standards?: string[];
  onDelta: (deltaText: string) => void;
  onFirstChunk?: () => void;
  onDone: (fullContent: string) => void;
  onError: (error: string) => void;
  onSources?: (sources: string[]) => void;
  onSourceMeta?: (meta: ChunkPageMeta[]) => void;
  signal?: AbortSignal;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    onError(language === "en" ? "Please login to continue" : "يرجى تسجيل الدخول للمتابعة");
    return;
  }
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ messages, retry, mode, language, images, output_format, preferred_standards }),
    signal,
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    if (resp.status === 429) {
      onError(errorData.error || "Daily message limit exceeded");
      return;
    }
    onError(errorData.error || (language === "en" ? "Service error occurred" : "حدث خطأ في الخدمة"));
    return;
  }
  const sourcesHeader = resp.headers.get("X-SBC-Sources");
  if (sourcesHeader && onSources) {
    const sources = sourcesHeader.split(",").filter(Boolean);
    if (sources.length > 0) onSources(sources);
  }
  const sourceMetaHeader = resp.headers.get("X-SBC-Source-Meta");
  if (sourceMetaHeader && onSourceMeta) {
    try {
      const parsed: ChunkPageMeta[] = JSON.parse(sourceMetaHeader);
      if (Array.isArray(parsed) && parsed.length > 0) onSourceMeta(parsed);
    } catch { /* ignore malformed header */ }
  }
  if (!resp.body) { onError(language === "en" ? "No response received" : "لا يوجد استجابة"); return; }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = ""; let fullContent = ""; let streamDone = false; let firstChunkFired = false;
  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { streamDone = true; break; }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) {
          if (!firstChunkFired) { firstChunkFired = true; onFirstChunk?.(); }
          fullContent += content; onDelta(content);
        }
      } catch { textBuffer = line + "\n" + textBuffer; break; }
    }
  }
  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) {
          if (!firstChunkFired) { firstChunkFired = true; onFirstChunk?.(); }
          fullContent += content; onDelta(content);
        }
      } catch { /* ignore */ }
    }
  }
  onDone(fullContent);
}

// ===== TYPING INDICATOR =====
function TypingIndicator({ mode, label }: { mode: ChatMode; label: string }) {
  const dotColor = getModeDotColor(mode);
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <span key={i} className="typing-dot" style={{ background: dotColor }} />
        ))}
      </div>
      <span className="text-sm font-medium" style={{ color: dotColor }}>{label}</span>
    </div>
  );
}

// ===== SWITCH BUTTON =====
function SwitchModeButton({ targetMode, onSwitch, language }: { targetMode: ChatMode; onSwitch: (mode: ChatMode) => void; language: string }) {
  const isStandard = targetMode === "standard";
  const bg = isStandard ? "rgba(255,140,0,0.2)" : "rgba(220,20,60,0.2)";
  const border = isStandard ? "#FF8C00" : "#DC143C";
  const color = isStandard ? "#FF8C00" : "#DC143C";
  const label = language === "en"
    ? (isStandard ? "🔄 Switch to Advisory Mode" : "🔄 Switch to Analysis Mode")
    : (isStandard ? "🔄 الانتقال للوضع الاستشاري" : "🔄 الانتقال للوضع التحليلي");

  return (
    <button
      onClick={() => onSwitch(targetMode)}
      className="switch-btn-pulse mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 hover:brightness-110"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      {label}
    </button>
  );
}

// ===== MODE DIVIDER =====
function ModeDivider({ mode, t }: { mode: ChatMode; t: (key: string) => string }) {
  const color = getModeDotColor(mode);
  const text = mode === "primary" ? t("modeDividerPrimary") : mode === "standard" ? t("modeDividerStandard") : t("modeDividerAnalysis");
  return (
    <div className="flex items-center gap-3 my-4 px-4">
      <div className="flex-1 h-px" style={{ background: `${color}40` }} />
      <span className="text-xs font-medium px-3" style={{ color, textShadow: `0 0 10px ${color}60` }}>
        {text}
      </span>
      <div className="flex-1 h-px" style={{ background: `${color}40` }} />
    </div>
  );
}

// ===== MAIN COMPONENT =====
const ChatInterface = ({ onBack, onSourceStateChange, historyTriggerRef }: ChatInterfaceProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userName =
    (user?.user_metadata as Record<string, string> | undefined)?.full_name ||
    (user?.user_metadata as Record<string, string> | undefined)?.name ||
    user?.email ||
    "مستشار ConsultX";
  const displayName = userName.includes("@") ? userName.split("@")[0] : userName;
  const isMobile = useIsMobile();
  const isAdmin = user?.email === "njajrehwaseem@gmail.com" || user?.email === "waseemnjajreh20@gmail.com";
  const { subscription, refetch: refetchSub } = useSubscription();
  const { trialData, dismissWelcomeBanner } = useLaunchTrial();
  const { profile, isEngineerTrial, isTrialExpired, isFreePlan, trialMsRemaining, markTrialExpiredModalShown } = useProfile();
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [localMessagesUsed, setLocalMessagesUsed] = useState(0);
  const [modeLockTarget, setModeLockTarget] = useState<"standard" | "analysis" | null>(null);
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [inputEnabled, setInputEnabled] = useState(true); // optimistic: re-enable on first chunk
  // waitingLevel: 0=none, 1=10s, 2=30s, 3=60s, 4=120s — used for escalating waiting messages
  const [waitingLevel, setWaitingLevel] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [autoRetrying, setAutoRetrying] = useState(false);
  const [loadingStage, setLoadingStage] = useState<"connecting" | "thinking" | "writing" | "vision_1" | "vision_2" | "vision_3" | "vision_4" | "vision_5">("connecting");
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("primary");
  const [prevMode, setPrevMode] = useState<ChatMode>("primary");
  const [isModeTransition, setIsModeTransition] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isVisionRequest, setIsVisionRequest] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const { pendingFiles, isProcessing, addFiles, removeFile, clearAll, hasFiles, allBase64Pages } = usePendingFiles();
  const [sourcePanel, setSourcePanel] = useState<SourcePanelState>(CLOSED_PANEL);
  const { preferences } = usePreferences();

  // Sync source-panel state to parent (AppShell renders it as 3rd pane)
  useEffect(() => { onSourceStateChange?.(sourcePanel); }, [sourcePanel, onSourceStateChange]);

  // Expose history-modal trigger to parent sidebar
  useEffect(() => {
    if (historyTriggerRef) historyTriggerRef.current = () => setShowHistory(true);
  }, [historyTriggerRef]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const waitingTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea as user types
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  // Reset textarea height when input is cleared (after send)
  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, [input]);
  const { toast } = useToast();
  const { t, language, dir } = useLanguage();
  const { createConversation, saveMessage, updateConversationTitle, loadConversation } = useConversations();

  // Only real messages (not dividers)
  const messages = chatItems.filter((item): item is Message => !("type" in item));

  // Dynamic suggestion cards — randomly selected from expanded pool per mode
  const [suggestionKeys] = useState(() => ({
    primary: getSuggestedQuestionKeys("primary", 3),
    standard: getSuggestedQuestionKeys("standard", 3),
    analysis: getSuggestedQuestionKeys("analysis", 3),
  }));

  const modeIcons = [BookOpen, Flame, AlertTriangle, FileText, FlaskConical, ClipboardList];
  const getIcon = (i: number) => {
    const Icon = modeIcons[i % modeIcons.length];
    return <Icon className="w-5 h-5" />;
  };

  const suggestedQuestions = suggestionKeys[chatMode].map((key, i) => ({
    icon: getIcon(i),
    text: t(key as any),
  }));

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [chatItems]);

  useEffect(() => {
    if (!isLoading) { setLoadingStage("connecting"); return; }
    if (isVisionRequest) {
      setLoadingStage("vision_1");
      const t2 = setTimeout(() => setLoadingStage("vision_2"), 3000);
      const t3 = setTimeout(() => setLoadingStage("vision_3"), 7000);
      const t4 = setTimeout(() => setLoadingStage("vision_4"), 12000);
      const t5 = setTimeout(() => setLoadingStage("vision_5"), 18000);
      return () => { clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
    }
    const timer1 = setTimeout(() => setLoadingStage("thinking"), 1000);
    const timer2 = setTimeout(() => setLoadingStage("writing"), 3000);
    const timer3 = setTimeout(() => setLoadingStage("processing" as any), 6000);
    return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
  }, [isLoading, isVisionRequest]);

  const visionStageIndex = { vision_1: 0, vision_2: 1, vision_3: 2, vision_4: 3, vision_5: 4 } as const;
  const textStageIndex: Record<string, number> = { connecting: 0, thinking: 1, writing: 2, processing: 3 };
  const isVisionStage = loadingStage.startsWith("vision_");
  const isTextStage = !isVisionStage && isLoading;

  const getLoadingMessage = () => {
    switch (loadingStage) {
      case "connecting": return t("connecting");
      case "thinking": return t("thinking");
      case "writing": return t("writing");
      case "vision_1": return t("visionStage1");
      case "vision_2": return chatMode === "standard"
        ? (language === "en" ? "Identifying required systems..." : "تحديد الأنظمة المطلوبة...")
        : t("visionStage2");
      case "vision_3": return t("visionStage3");
      case "vision_4": return t("visionStage4");
      case "vision_5": return chatMode === "standard"
        ? (language === "en" ? "Building design guidance..." : "بناء توجيهات التصميم...")
        : t("visionStage5");
      default: return t("processing");
    }
  };

  // ===== STOP LOADING HELPER =====
  const stopLoading = useCallback(() => {
    setIsLoading(false);
    setIsVisionRequest(false);
    setRetryCount(0);
    setAutoRetrying(false);
    setInputEnabled(true);
    setWaitingLevel(0);
    waitingTimersRef.current.forEach(clearTimeout);
    waitingTimersRef.current = [];
  }, []);

  // ===== TRIAL EXPIRY CHECK =====
  useEffect(() => {
    if (!profile) return;
    if (isTrialExpired() && !profile.trial_expired_modal_shown) {
      setShowExpiryModal(true);
    }
  }, [profile]);

  // ===== MODE SWITCH HANDLER — also aborts any pending request =====
  const handleModeSwitch = useCallback((newMode: ChatMode, fromAI: boolean = false) => {
    // Free plan enforcement: block standard and analysis unless launch trial is active
    const launchTrialActive = trialData?.trial_active ?? false;
    if (isFreePlan() && !launchTrialActive && (newMode === "standard" || newMode === "analysis")) {
      setModeLockTarget(newMode as "standard" | "analysis");
      return;
    }

    if (newMode === chatMode) return;

    // Abort any in-flight request when user manually switches mode
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false); setIsVisionRequest(false); setRetryCount(0);
      setInputEnabled(true); setWaitingLevel(0);
      waitingTimersRef.current.forEach(clearTimeout);
      waitingTimersRef.current = [];
    }

    setPrevMode(chatMode);
    setChatMode(newMode);

    // Insert divider into chat items
    setChatItems(prev => [...prev, {
      id: `divider-${Date.now()}`,
      type: "divider",
      mode: newMode,
      timestamp: new Date(),
    } as DividerMessage]);

    // Play transition flash
    setIsModeTransition(true);
    setTimeout(() => setIsModeTransition(false), 800);

    // Show toast with mode border color via inline style
    const modeName = newMode === "primary" ? t("primary") : newMode === "standard" ? t("standard") : t("analysis");
    const toastBorderColor = newMode === "primary" ? "#00D4FF" : newMode === "standard" ? "#FF8C00" : "#DC143C";
    toast({
      title: `${t("switchedToMode")} ${modeName}`,
      duration: 3000,
      style: { borderLeft: `4px solid ${toastBorderColor}` },
    });
  }, [chatMode, t, toast, isFreePlan, trialData]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await addFiles(e.target.files);
    if (e.target) e.target.value = "";
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await addFiles(e.target.files);
    if (e.target) e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (isMobile) return;
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => { setIsDragOver(false); };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isMobile || !e.dataTransfer?.files) return;
    await addFiles(e.dataTransfer.files);
  };

  // Clipboard paste handler
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      if (!inputEnabled) return;
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageFiles = items
        .filter(i => i.kind === "file" && ALLOWED_IMAGE_TYPES.includes(i.type))
        .map(i => i.getAsFile())
        .filter(Boolean) as File[];
      if (imageFiles.length) await addFiles(imageFiles);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [addFiles, inputEnabled]);

  const handleSendWithRetry = useCallback(async (
    chatMessages: ChatMessage[], assistantId: string, isRetry: boolean = false,
    currentRetryCount: number = 0, currentMode: ChatMode = "standard",
    convId: string | null = null, currentLanguage: string = "ar", imageBase64s?: string[],
  ) => {
    // Abort any previous request
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Clear any previous waiting timers
    waitingTimersRef.current.forEach(clearTimeout);
    waitingTimersRef.current = [];
    setWaitingLevel(0);

    // Local flag — closure-safe, always reflects current invocation
    let shouldAutoRetry = false;

    // Escalating waiting messages — no auto-cancel, just informational
    const t10  = setTimeout(() => setWaitingLevel(1), 10_000);
    const t30  = setTimeout(() => setWaitingLevel(2), 30_000);
    const t60  = setTimeout(() => setWaitingLevel(3), 60_000);
    const t120 = setTimeout(() => setWaitingLevel(4), 120_000);
    // After 5 minutes, if still loading, auto-retry once
    const t300 = setTimeout(() => {
      if (!controller.signal.aborted) {
        shouldAutoRetry = true;   // local var — always fresh, no stale closure
        setAutoRetrying(true);    // state for UI indicator only
        controller.abort();
      }
    }, 300_000);
    waitingTimersRef.current = [t10, t30, t60, t120, t300];

    let assistantContent = "";
    const upsertAssistant = (nextChunk: string) => {
      assistantContent += nextChunk;
      setChatItems(prev => {
        const existing = prev.find((item): item is Message => !("type" in item) && item.id === assistantId);
        if (existing) {
          return prev.map(item => ("type" in item) ? item : (item.id === assistantId ? { ...item, content: assistantContent } : item));
        }
        return [...prev, { id: assistantId, role: "assistant" as const, content: assistantContent, timestamp: new Date(), mode: currentMode }];
      });
    };
    let currentSources: string[] = [];
    try {
      await streamChat({
        messages: chatMessages, retry: isRetry, mode: currentMode, language: currentLanguage, images: imageBase64s,
        output_format: preferences.output_format,
        preferred_standards: preferences.preferred_standards,
        signal: controller.signal,
        onDelta: upsertAssistant,
        onFirstChunk: () => {
          // Re-enable input on first streaming chunk (optimistic)
          setInputEnabled(true);
          setWaitingLevel(0);
          waitingTimersRef.current.forEach(clearTimeout);
          waitingTimersRef.current = [];
        },
        onSources: sources => {
          currentSources = sources;
          setChatItems(prev => prev.map(item => ("type" in item) ? item : (item.id === assistantId ? { ...item, sources } : item)));
        },
        onSourceMeta: meta => {
          setChatItems(prev => prev.map(item => ("type" in item) ? item : (item.id === assistantId ? { ...item, sourceMeta: meta } : item)));
        },
        onDone: async fullContent => {
          waitingTimersRef.current.forEach(clearTimeout);
          waitingTimersRef.current = [];
          const validation = validateResponse(fullContent, currentMode, currentLanguage);
          if (!validation.valid && currentRetryCount < MAX_RETRIES - 1) {
            console.log(`Response validation failed (attempt ${currentRetryCount + 1}):`, validation.issues);
            setRetryCount(currentRetryCount + 1);
            setChatItems(prev => prev.filter(item => ("type" in item) || item.id !== assistantId));
            handleSendWithRetry(chatMessages, `${assistantId}-retry-${currentRetryCount + 1}`, true, currentRetryCount + 1, currentMode, convId, currentLanguage, imageBase64s);
          } else {
            stopLoading();
            if (convId) saveMessage(convId, "assistant", fullContent, currentSources);
            setChatItems(prev => prev.map(item =>
              ("type" in item) ? item : ((item.id === assistantId || item.id.startsWith(assistantId))
                ? { ...item, isValid: validation.valid, sources: currentSources } : item)
            ));
          }
        },
        onError: error => {
          waitingTimersRef.current.forEach(clearTimeout);
          waitingTimersRef.current = [];
          if (controller.signal.aborted) {
            // If it was the 5-min timer abort, auto-retry once
            if (shouldAutoRetry && currentRetryCount < 1) {
              shouldAutoRetry = false;
              setAutoRetrying(false);
              handleSendWithRetry(chatMessages, `${assistantId}-timeout-retry`, true, currentRetryCount + 1, currentMode, convId, currentLanguage, imageBase64s);
              return;
            }
            return; // ignore other aborts (mode switch)
          }
          if (error === "mode_locked") {
            // Backend rejected the request because this mode requires a subscription.
            // Roll back local usage (backend never incremented), switch to primary mode,
            // and show a clear bilingual explanation.
            setLocalMessagesUsed(prev => Math.max(0, prev - 1));
            stopLoading();
            setChatMode("primary");
            toast({
              title: currentLanguage === "en" ? "Mode Unavailable" : "هذا النمط غير متاح",
              description: currentLanguage === "en"
                ? "Advisory and Analytical modes require a subscription. Switched to Main mode."
                : "نمطا الاستشاري والتحليلي يتطلبان اشتراكاً. تم التحويل إلى النمط الرئيسي.",
              variant: "destructive",
            });
            return;
          }
          if (error === "trial_expired") {
            stopLoading();
            setChatItems(prev => [
              ...prev.filter(item => !("type" in item) || (item as any).id !== assistantId),
              { id: `upgrade-${Date.now()}`, type: "upgrade", variant: "trial_expired", timestamp: new Date() } as UpgradeItem,
            ]);
            return;
          }
          setLocalMessagesUsed(prev => Math.max(0, prev - 1));
          stopLoading();
          toast({ title: currentLanguage === "en" ? "Error" : "خطأ", description: error, variant: "destructive" });
        }
      });
    } catch (error: any) {
      waitingTimersRef.current.forEach(clearTimeout);
      waitingTimersRef.current = [];
      if (error?.name === "AbortError") {
        // 5-min auto-retry
        if (shouldAutoRetry && currentRetryCount < 1) {
          shouldAutoRetry = false;
          setAutoRetrying(false);
          handleSendWithRetry(chatMessages, `${assistantId}-timeout-retry`, true, currentRetryCount + 1, currentMode, convId, currentLanguage, imageBase64s);
          return;
        }
        return; // ignore mode-switch aborts
      }
      console.error("Chat error:", error);
      setLocalMessagesUsed(prev => Math.max(0, prev - 1));
      stopLoading();
      toast({ title: currentLanguage === "en" ? "Error" : "خطأ", description: currentLanguage === "en" ? "Connection error" : "حدث خطأ في الاتصال، يرجى المحاولة مرة أخرى", variant: "destructive" });
    }
  }, [toast, saveMessage, stopLoading]);

  // Sync local usage counter from subscription data
  useEffect(() => {
    if (subscription?.daily_messages_used !== undefined) {
      setLocalMessagesUsed(subscription.daily_messages_used);
    }
  }, [subscription?.daily_messages_used]);

  const dailyLimit = subscription?.daily_messages_limit ?? 10;
  const isAtDailyLimit = localMessagesUsed >= dailyLimit && dailyLimit < 9999;

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText && !hasFiles) return;
    if (isLoading) return;

    // Free-tier users (trial_expired, cancelled, etc.) proceed normally.
    // Backend enforces mode lock (403) and daily limit (429); the client-side
    // check below is a UX shortcut only — it avoids a round-trip when the
    // counter is already known to be exhausted.
    const launchTrialActive = trialData?.trial_active ?? false;

    // Check daily limit client-side (fallback for non-trial users)
    if (isAtDailyLimit && !launchTrialActive) {
      toast({
        title: t("dailyLimitExceeded"),
        description: t("upgradeForMore"),
        variant: "destructive",
      });
      return;
    }

    let currentConvId = conversationId;
    if (!currentConvId) {
      const title = messageText ? messageText.slice(0, 80) : (language === "en" ? "Image Analysis" : "تحليل صورة");
      currentConvId = await createConversation(title, chatMode === "primary" ? "standard" : chatMode);
      if (currentConvId) setConversationId(currentConvId);
    }

    // Snapshot pending files before clearing
    const filesToSend = [...pendingFiles];
    const pagesToSend = [...allBase64Pages];
    setIsVisionRequest(filesToSend.length > 0);
    clearAll();

    const userMessage: Message = {
      id: Date.now().toString(), role: "user",
      content: messageText || (language === "en" ? "Analyze this drawing" : "حلل هذا المخطط"),
      timestamp: new Date(),
      imageUrl: filesToSend.length > 0 ? filesToSend[0].previewUrl : undefined,
      mode: chatMode,
      hasImage: filesToSend.length > 0,
    };
    // Optimistic: add user message, clear input, increment local counter
    setChatItems(prev => [...prev, userMessage]);
    setInput(""); setIsLoading(true); setInputEnabled(false); setRetryCount(0);
    setLocalMessagesUsed(prev => prev + 1);

    // Parallel upload all file pages to Supabase storage
    const uploadedUrls: string[] = [];
    if (filesToSend.length > 0 && currentConvId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const allPages = filesToSend.flatMap(pf =>
            pf.base64Pages.map((b64, idx) => ({ b64, pfId: pf.id, idx }))
          );
          const results = await Promise.all(allPages.map(async ({ b64, pfId, idx }) => {
            try {
              const ext = b64.startsWith("data:image/png") ? "png" : "jpg";
              const filePath = `${session.user.id}/${Date.now()}-${pfId}-${idx}.${ext}`;
              const base64Data = b64.split(",")[1];
              if (!base64Data) return null;
              const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
              const blob = new Blob([bytes], { type: ext === "png" ? "image/png" : "image/jpeg" });
              const { error: uploadError } = await supabase.storage.from("chat-images").upload(filePath, blob);
              if (uploadError) return null;
              return supabase.storage.from("chat-images").getPublicUrl(filePath).data.publicUrl;
            } catch { return null; }
          }));
          uploadedUrls.push(...(results.filter(Boolean) as string[]));
        }
      } catch (err) { console.error("File upload error:", err); }
    }

    if (currentConvId) {
      saveMessage(currentConvId, "user", userMessage.content, [], uploadedUrls[0], uploadedUrls);
    }

    const assistantId = (Date.now() + 1).toString();
    // Build history using smart per-mode trimming
    const allRealMessages = [...messages, userMessage];
    const chatMessages = trimMessageHistory(allRealMessages, chatMode, preferences.ai_memory_level);
    handleSendWithRetry(chatMessages, assistantId, false, 0, chatMode, currentConvId, language,
      pagesToSend.length > 0 ? pagesToSend : undefined);
  };


  const handleLoadConversation = async (convId: string) => {
    const result = await loadConversation(convId);
    if (result) {
      setConversationId(convId);
      const loadedMode = (result.conversation.mode as ChatMode) || "primary";
      setChatMode(loadedMode);
      setChatItems(
        result.messages.map((m) => ({
          id: m.id, dbId: m.id, role: m.role, content: m.content, sources: m.sources,
          timestamp: new Date(m.created_at),
          imageUrl: m.image_urls?.[0] ?? m.image_url,
          imageUrls: m.image_urls,
          mode: loadedMode,
        }))
      );
      setShowHistory(false);
    }
  };

  const handleNewConversation = () => {
    setConversationId(null); setChatItems([]); setInput(""); clearAll();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Last assistant message (for loading indicator position)
  const lastChatMessage = messages[messages.length - 1];
  const showTypingIndicator = isLoading && lastChatMessage?.role !== "assistant";

  // Escalating waiting messages — no hard cancel
  const getWaitingMessage = () => {
    if (waitingLevel >= 4) return language === "en" ? "Deep analysis in progress, this may take a few minutes... 🔔" : "الاستشارة تتطلب تحليلاً معمقاً وقد تستغرق بضع دقائق ⏳";
    if (waitingLevel === 3) return language === "en" ? "Analysis is taking longer than usual... 🔍" : "التحليل يأخذ وقتاً أطول من المعتاد... 🔍";
    if (waitingLevel === 2) return language === "en" ? "Deep analysis in progress, please wait... 📚" : "جاري تحليل معمّق، يرجى الانتظار... 📚";
    if (waitingLevel === 1) {
      if (chatMode === "standard") return language === "en" ? "Identifying required systems and clauses... ⏳" : "تحديد الأنظمة والاشتراطات المطلوبة... ⏳";
      if (chatMode === "analysis") return language === "en" ? "Reviewing compliance requirements... ⏳" : "مراجعة متطلبات الامتثال... ⏳";
      return language === "en" ? "The advisor is working on your answer... ⏳" : "المستشار يعمل على إجابتك... ⏳";
    }
    if (chatMode === "standard") return language === "en" ? "📐 Extracting design facts and requirements..." : "جاري استخلاص حقائق التصميم والاشتراطات... 📐";
    if (chatMode === "analysis") return language === "en" ? "🔍 Checking compliance against SBC..." : "جاري التحقق من الامتثال للكود... 🔍";
    return language === "en" ? "Thinking..." : "جاري التفكير...";
  };

  // Mode label
  const modeLabelText = chatMode === "primary" ? t("primary") : chatMode === "standard" ? t("standard") : t("analysis");

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Image Lightbox */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setExpandedImage(null)}
        >
          <img src={expandedImage} alt="Enlarged" className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain" />
          <button className="absolute top-4 end-4 bg-card/80 text-foreground rounded-full w-8 h-8 flex items-center justify-center hover:bg-card">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* History Panel */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md h-[70vh]">
            <ConversationsList onSelectConversation={handleLoadConversation} onClose={() => setShowHistory(false)} />
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card/30 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <img src={consultxIcon} alt="ConsultX" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-lg font-bold text-gradient">{t("appName")}</h1>
            <p className="text-xs text-muted-foreground">{t("appTagline")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleNewConversation} className="text-muted-foreground hover:text-foreground" title={t("newConversation")}>
            <Plus className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowHistory(true)} className="md:hidden text-muted-foreground hover:text-foreground" title={t("previousConversations")}>
            <MessageSquare className="w-5 h-5" />
          </Button>
          <LanguageToggle />

          {/* Mode selector — hidden on mobile (BottomNav handles it) */}
          <div className="relative hidden md:flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
            {(["primary", "standard", "analysis"] as ChatMode[]).map((mode) => {
              const isActive = chatMode === mode;
              const icon = mode === "primary" ? <MessageSquare className="w-4 h-4" /> : mode === "standard" ? <ClipboardList className="w-4 h-4" /> : <FlaskConical className="w-4 h-4" />;
              const label = mode === "primary" ? t("primary") : mode === "standard" ? t("standard") : t("analysis");
              const activeStyle = isActive ? getModeButtonActiveStyle(mode) : {};
              const launchTrialActive = trialData?.trial_active ?? false;
              const isLocked = isFreePlan() && !launchTrialActive && (mode === "standard" || mode === "analysis");
              return (
                <button
                  key={mode}
                  onClick={() => handleModeSwitch(mode)}
                  title={mode === "primary" ? t("modeDesc_primary") : mode === "standard" ? t("modeDesc_standard") : t("modeDesc_analysis")}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all duration-300",
                    isActive ? "font-semibold" : "text-muted-foreground hover:text-foreground"
                  )}
                  style={activeStyle}
                >
                  {icon}
                  {isLocked && <Lock className="w-3 h-3 opacity-50" />}
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
            {/* Mode lock popup */}
            {modeLockTarget && (
              <div className="relative">
                <div
                  className="absolute z-50 text-sm rounded-xl px-4 py-3 animate-fade-in"
                  style={{
                    background: "rgba(17, 24, 39, 0.95)",
                    border: "1px solid rgba(0,212,255,0.2)",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    minWidth: "220px",
                    top: "calc(100% + 8px)",
                    right: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  <div className="flex items-start gap-2">
                    <Lock size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" style={{ color: "hsl(195 85% 50%)" }} />
                    <div>
                      <p className="font-medium text-foreground mb-1 text-xs">
                        {language === "en"
                          ? `${modeLockTarget === "standard" ? "Advisory Mode" : "Analysis Mode"} is available on the Engineer plan`
                          : `${modeLockTarget === "standard" ? "الوضع الاستشاري" : "الوضع التحليلي"} متاح في باقة مهندس`}
                      </p>
                      <button
                        onClick={() => { setModeLockTarget(null); navigate("/subscribe"); }}
                        className="text-xs font-semibold"
                        style={{ color: "hsl(195 85% 50%)" }}
                      >
                        {language === "en" ? "Upgrade →" : "ترقية ←"}
                      </button>
                    </div>
                    <button
                      onClick={() => setModeLockTarget(null)}
                      className="text-muted-foreground hover:text-foreground ms-auto"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Launch trial days remaining pill */}
            {trialData?.trial_active && !subscription?.active && (
              <TrialDaysIndicator daysRemaining={trialData.days_remaining} />
            )}
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="md:hidden text-muted-foreground hover:text-foreground">
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden sm:inline ms-1">Admin</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate("/account")} className="md:hidden text-muted-foreground hover:text-foreground">
              <UserCircle className="w-4 h-4" />
              <span className="hidden sm:inline ms-1">{displayName}</span>
            </Button>
            <Button variant="ghost" onClick={onBack} className="text-muted-foreground hover:text-foreground">
              {dir === "rtl" ? <ArrowRight className="ms-2 w-4 h-4" /> : <ArrowLeft className="me-2 w-4 h-4" />}
              {t("back")}
            </Button>
          </div>
        </div>
      </header>

      {/* Trial Expiry Modal */}
      {showExpiryModal && (
        <TrialExpiryModal
          onClose={(subscribed) => {
            setShowExpiryModal(false);
            markTrialExpiredModalShown();
          }}
        />
      )}

      {/* Trial Countdown Banner (legacy engineer trial) */}
      {isEngineerTrial() && !isTrialExpired() && profile?.trial_end && (
        <TrialCountdownBanner trialEnd={profile.trial_end} />
      )}

      {/* Launch Trial Welcome Banner — shown once to existing users on first activation */}
      {trialData?.show_welcome_banner && trialData.trial_active && (
        <LaunchTrialWelcomeBanner
          daysRemaining={trialData.days_remaining}
          onDismiss={dismissWelcomeBanner}
        />
      )}

      {/* Chat Area — drag/drop zone (desktop only) */}
      <div
        className={cn(
          "flex-1 overflow-y-auto px-4 py-6 relative",
          isDragOver && "ring-2 ring-inset ring-primary/50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag-over overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary/60 rounded-none flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Paperclip className="w-10 h-10 text-primary mx-auto mb-2" />
              <p className="text-primary font-semibold text-lg">{t("dropFilesHere")}</p>
            </div>
          </div>
        )}
        <div className="max-w-4xl mx-auto space-y-6">
          {chatItems.length === 0 ? (
            /* Welcome Screen */
            <div className="text-center py-12 space-y-8">
              <div className="space-y-4">
                <div className="relative inline-block">
                  <img
                    src={consultxIcon}
                    alt="ConsultX"
                    className={cn("w-20 h-20 mx-auto animate-float rounded-full", getAvatarGlowClass(chatMode))}
                  />
                </div>
                <h2 className="text-2xl font-bold text-foreground">
                  {language === "ar" ? `مرحباً، ${displayName}` : `Welcome, ${displayName}`}
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  {chatMode === "analysis" ? t("welcomeSubtitleAnalysis") : chatMode === "primary" ? t("welcomeSubtitlePrimary") : t("welcomeSubtitle")}
                </p>
                {chatMode === "primary" && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm" style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.3)" }}>
                    <MessageSquare className="w-4 h-4" />{t("primaryMode")}
                  </div>
                )}
                {chatMode === "analysis" && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm" style={{ background: "rgba(220,20,60,0.1)", color: "#DC143C", border: "1px solid rgba(220,20,60,0.3)" }}>
                    <FlaskConical className="w-4 h-4" />{t("analysisMode")}
                  </div>
                )}
                {chatMode === "standard" && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm" style={{ background: "rgba(255,140,0,0.1)", color: "#FF8C00", border: "1px solid rgba(255,140,0,0.3)" }}>
                    <ClipboardList className="w-4 h-4" />{t("advisoryMode")}
                  </div>
                )}
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
                  style={
                    chatMode === "standard"
                      ? { background: "rgba(255,140,0,0.08)", color: "#FF8C00", border: "1px solid rgba(255,140,0,0.25)" }
                      : chatMode === "analysis"
                      ? { background: "rgba(220,20,60,0.08)", color: "#DC143C", border: "1px solid rgba(220,20,60,0.25)" }
                      : { background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.2)" }
                  }
                >
                  <Eye className="w-4 h-4" />
                  {chatMode === "standard"
                    ? t("uploadHintAdvisory")
                    : chatMode === "analysis"
                    ? t("uploadHintAnalytical")
                    : t("uploadHint")}
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("trySuggestions")}</p>
                <div className={`flex gap-3 ${chatMode === "primary" ? "flex-row flex-wrap justify-center" : "flex-col"}`}>
                  {suggestedQuestions.map((q, i) => (
                    chatMode === "primary" ? (
                      <button
                        key={i} onClick={() => handleSend(q.text)} disabled={isLoading}
                        className="px-5 py-2.5 rounded-full text-sm transition-all duration-300 disabled:opacity-50 hover:scale-105"
                        style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }}
                      >{q.text}</button>
                    ) : (
                      <button
                        key={i} onClick={() => handleSend(q.text)} disabled={isLoading}
                        className={`flex items-center gap-3 p-4 rounded-xl bg-card/50 border border-border/50 hover:border-primary/50 hover:bg-card/80 transition-all duration-300 ${dir === "rtl" ? "text-right" : "text-left"} group disabled:opacity-50`}
                      >
                        <span className="text-primary group-hover:scale-110 transition-transform">{q.icon}</span>
                        <span className="text-foreground text-sm">{q.text}</span>
                      </button>
                    )
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Chat Items */
            chatItems.map((item) => {
              // Divider
              if ("type" in item && item.type === "divider") {
                return <ModeDivider key={item.id} mode={(item as DividerMessage).mode} t={t} />;
              }

              // In-chat upgrade prompt (mode limit hit or trial expired)
              if ("type" in item && item.type === "upgrade") {
                const upgradeItem = item as UpgradeItem;
                return (
                  <div key={item.id} className="max-w-xl mx-auto">
                    <InChatUpgradePrompt
                      variant={upgradeItem.variant}
                      mode={upgradeItem.mode}
                      language={language}
                    />
                  </div>
                );
              }

              const message = item as Message;
              const msgMode = message.mode || chatMode;
              
              // Parse switch markers for assistant messages
              let displayContent = message.content;
              let switchTarget: ChatMode | null = null;
              if (message.role === "assistant") {
                const parsed = hasSwitchMarker(message.content);
                if (parsed.found) {
                  displayContent = parsed.cleanContent;
                  switchTarget = parsed.targetMode;
                }
              }

              return (
                <div key={message.id} className={`flex gap-4 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                  {/* Avatar */}
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    message.role === "user"
                      ? "bg-primary/20 text-primary"
                      : cn("bg-card border border-border/50", getAvatarGlowClass(msgMode))
                  )}>
                    {message.role === "user"
                      ? <span className="text-lg">👤</span>
                      : <img src={consultxIcon} alt="AI" className="w-6 h-6" />
                    }
                  </div>

                  {/* Bubble */}
                  <div className={cn(
                    "flex-1 max-w-3xl rounded-2xl p-4",
                    message.role === "user"
                      ? "chat-bubble chat-bubble-user"
                      : cn(
                          "chat-bubble border-l-4",
                          getModeAccentBorder(msgMode),
                        )
                  )}
                    style={message.role === "assistant" ? {
                      background: `linear-gradient(135deg, hsl(var(--card)) 0%, hsl(220 35% 8%) 100%)`,
                      boxShadow: `inset 0 0 20px ${getModeAccentBg(msgMode)}`,
                      borderLeftColor: getModeAccentColor(msgMode).replace("0.6", "0.4"),
                    } : undefined}
                  >
                    {message.role === "user" ? (
                      <div className="space-y-2">
                        {/* Multi-image grid in history */}
                        {(message.imageUrls?.length ?? 0) > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {(message.imageUrls ?? []).map((url, idx) => (
                              <div key={idx} className="relative inline-block cursor-pointer" onClick={() => setExpandedImage(url)}>
                                <img src={url} alt={`Attachment ${idx + 1}`} className="max-w-[120px] max-h-28 rounded-lg border border-border/50 object-contain hover:opacity-90 transition-opacity" title={t("enlargeImage")} />
                                {idx === 0 && (
                                  <div className="absolute top-1 start-1 bg-primary/90 text-primary-foreground text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Eye className="w-3 h-3" />{t("visionAnalysis")}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : message.imageUrl ? (
                          <div className="relative inline-block cursor-pointer" onClick={() => setExpandedImage(message.imageUrl!)}>
                            <img src={message.imageUrl} alt="Uploaded drawing" className="max-w-xs max-h-48 rounded-lg border border-border/50 object-contain hover:opacity-90 transition-opacity" title={t("enlargeImage")} />
                            <div className="absolute top-1 start-1 bg-primary/90 text-primary-foreground text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Eye className="w-3 h-3" />{t("visionAnalysis")}
                            </div>
                          </div>
                        ) : null}
                        <p className="text-foreground">{message.content}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {isVisionAnalysisResponse(displayContent) || (msgMode === "analysis" && isComplianceTextResponse(displayContent)) ? (
                          <AnalysisResultCard content={displayContent} />
                        ) : (
                          <div
                            id={`cmr-${message.id}`}
                            onClick={(e) => {
                              const srcEl = (e.target as HTMLElement).closest('[data-src]') as HTMLElement | null;
                              if (!srcEl) return;
                              const srcKey = srcEl.dataset.src;
                              if (!message.sources?.length) return;
                              const resolved = message.sourceMeta
                                ? resolveSourcesWithMeta(message.sources, message.sourceMeta)
                                : resolveAllSources(message.sources);
                              const match = resolved.find(m =>
                                (srcKey === 'sbc201' && m.documentCode === 'SBC-201') ||
                                (srcKey === 'sbc801' && m.documentCode === 'SBC-801')
                              ) ?? resolved[0] ?? null;
                              if (match) {
                                setSourcePanel({ open: true, sources: message.sources, activeMeta: match.pdfUrl ? match : null });
                              } else if (resolved.length > 0) {
                                setSourcePanel({ open: true, sources: message.sources, activeMeta: null });
                              }
                            }}
                          >
                            <ChatMarkdownRenderer content={displayContent} mode={msgMode} />
                          </div>
                        )}
                        {/* Switch mode button */}
                        {switchTarget && (
                          <SwitchModeButton
                            targetMode={switchTarget}
                            onSwitch={(mode) => handleModeSwitch(mode, true)}
                            language={language}
                          />
                        )}
                        {message.sources && message.sources.length > 0 && (() => {
                          const resolved = message.sourceMeta
                            ? resolveSourcesWithMeta(message.sources, message.sourceMeta)
                            : resolveAllSources(message.sources);
                          return (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 border-t border-border/30">
                              <span className="text-xs text-muted-foreground flex-shrink-0">{t("sourcesLabel")}</span>
                              {resolved.map((meta) => (
                                <button
                                  key={meta.pdfPath ?? meta.sourceFile}
                                  onClick={() => {
                                    if (meta.pdfUrl) {
                                      setSourcePanel({ open: true, sources: message.sources!, activeMeta: meta });
                                    } else {
                                      setSourcePanel({ open: true, sources: message.sources!, activeMeta: null });
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors hover:opacity-80"
                                  style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.25)" }}
                                  title={meta.title}
                                >
                                  {formatSourceLabel(meta, language as "ar" | "en")}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        {/* Requirement 4 — Utility Bar */}
                        <UtilityBar
                          content={displayContent}
                          mode={msgMode}
                          messageId={message.id}
                          userName={displayName}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Typing indicator */}
          {showTypingIndicator && (
            <div className="flex gap-4">
              <div className={cn("w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center", getAvatarGlowClass(chatMode))}>
                <img src={consultxIcon} alt="AI" className="w-6 h-6" />
              </div>
              <div className="chat-bubble space-y-3" style={{ borderLeft: `3px solid ${getModeAccentColor(chatMode)}`, boxShadow: `inset 0 0 15px ${getModeAccentBg(chatMode)}` }}>
                {retryCount > 0 ? (
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 text-destructive animate-spin" />
                    <span className="text-muted-foreground">{t("retrying")} ({retryCount}/{MAX_RETRIES})...</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <TypingIndicator mode={chatMode} label={t("typingIndicator")} />
                      {waitingLevel > 0 ? (
                        <span className="text-sm font-medium animate-pulse" style={{ color: getModeDotColor(chatMode) }}>{getWaitingMessage()}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm animate-fade-in" key={loadingStage}>{getLoadingMessage()}</span>
                      )}
                    </div>
                    {/* Progress bar — vision stages (5 steps) or text stages (4 steps) */}
                    {(isVisionStage || isTextStage) && (
                      <div className="flex items-center gap-1.5 mt-2">
                        {(isVisionStage ? [0, 1, 2, 3, 4] : [0, 1, 2, 3]).map(i => {
                          const currentIdx = isVisionStage
                            ? (visionStageIndex[loadingStage as keyof typeof visionStageIndex] ?? 0)
                            : (textStageIndex[loadingStage] ?? 0);
                          const isDone = i < currentIdx;
                          const isCurrent = i === currentIdx;
                          return (
                            <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-all duration-500", isDone ? "bg-primary" : isCurrent ? "bg-primary/60 animate-pulse" : "bg-muted")} />
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-border/50 bg-card/30 backdrop-blur-xl p-4">
        <div className="max-w-4xl mx-auto">
          {/* Mode-aware file-type hint — shown only when no files pending, advisory/analytical modes */}
          {!hasFiles && !isProcessing && chatMode !== "primary" && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 mb-2">
              <Paperclip className="w-3 h-3 shrink-0" />
              <span>{chatMode === "standard" ? t("fileHintAdvisory") : t("fileHintAnalytical")}</span>
            </div>
          )}

          {/* Multi-file preview grid */}
          <FilePreviewGrid files={pendingFiles} onRemove={removeFile} isProcessing={isProcessing} mode={chatMode} />

          {/* Input box with mode glow — locked only until first chunk, then optimistically re-enabled */}
          <div
            className={cn(
              "relative flex items-end gap-3 bg-secondary/50 rounded-2xl border transition-all duration-300 p-2",
              isModeTransition
                ? (chatMode === "primary" ? "mode-flash-primary" : chatMode === "standard" ? "mode-flash-standard" : "mode-flash-analysis")
                : isLoading
                ? (chatMode === "primary" ? "mode-glow-loading-primary" : chatMode === "standard" ? "mode-glow-loading-standard" : "mode-glow-loading-analysis")
                : getModeGlowClass(chatMode),
              isModeTransition ? "scale-[1.01]" : ""
            )}
            style={{ borderColor: getModeAccentColor(chatMode).replace("0.6", "0.4") }}
          >
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple onChange={handleFileSelect} className="hidden" />
            {/* Folder upload input — desktop only */}
            {!isMobile && (
              // @ts-expect-error webkitdirectory is non-standard
              <input ref={folderInputRef} type="file" webkitdirectory="" multiple onChange={handleFolderSelect} className="hidden" />
            )}
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="shrink-0 h-10 w-10 text-muted-foreground hover:text-primary" title={t("uploadFile")} disabled={!inputEnabled}>
              <Paperclip className="w-4 h-4" />
            </Button>
            {!isMobile && (
              <Button variant="ghost" size="icon" onClick={() => folderInputRef.current?.click()} className="shrink-0 h-10 w-10 text-muted-foreground hover:text-primary" title={t("addFolder")} disabled={!inputEnabled}>
                <FolderOpen className="w-4 h-4" />
              </Button>
            )}
            <Textarea
              ref={textareaRef} value={input} onChange={e => { setInput(e.target.value); autoResize(e.target as HTMLTextAreaElement); }} onKeyDown={handleKeyDown}
              placeholder={isAtDailyLimit ? t("dailyLimitExceeded") : hasFiles ? t("imageAttached") : chatMode === "primary" ? t("placeholder_primary") : chatMode === "standard" ? t("placeholder_standard") : t("placeholder_analysis")}
              className="flex-1 bg-transparent border-0 resize-none focus-visible:ring-0 min-h-[44px] max-h-[200px] text-foreground placeholder:text-muted-foreground disabled:opacity-50"
              rows={1}
              disabled={!inputEnabled || isAtDailyLimit}
            />
            <Button variant="hero" size="icon" onClick={() => handleSend()} disabled={(!input.trim() && !hasFiles) || !inputEnabled || isAtDailyLimit} className="shrink-0 h-10 w-10">
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {/* Daily usage counter + Mode indicator */}
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-2">
              <span className="mode-indicator-dot" style={{ background: getModeDotColor(chatMode) }} />
              <span className="text-xs text-muted-foreground">
                {t("currentModeLabel")} <span className="font-medium" style={{ color: getModeDotColor(chatMode) }}>{modeLabelText}</span>
              </span>
            </div>
            {dailyLimit < 9999 && (
              <div className={cn("text-xs font-medium", isAtDailyLimit ? "text-destructive" : "text-muted-foreground")}>
                {localMessagesUsed}/{dailyLimit} {t("dailyUsageCounter")}
                {isAtDailyLimit && (
                  <Button variant="link" size="sm" className="text-xs text-primary p-0 ms-2 h-auto" onClick={() => navigate("/subscribe")}>
                    {t("upgradeForMore")}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <BottomNav
          chatMode={chatMode}
          onModeSwitch={(mode) => handleModeSwitch(mode)}
          onToggleHistory={() => setShowHistory(true)}
          onScrollToInput={() => textareaRef.current?.focus()}
          isFreePlan={isFreePlan()}
        />
      )}

      {/* Bottom padding for mobile nav */}
      {isMobile && <div className="h-16" />}

      {/* Source PDF viewer — only rendered here when not managed by AppShell */}
      {!onSourceStateChange && (
        <SourcePanel
          state={sourcePanel}
          language={language as "ar" | "en"}
          onClose={() => setSourcePanel(CLOSED_PANEL)}
          onSelectSource={(meta) => setSourcePanel(prev => ({ ...prev, activeMeta: meta }))}
          onBack={() => setSourcePanel(prev => ({ ...prev, activeMeta: null }))}
        />
      )}
    </div>
  );
};

export default ChatInterface;
