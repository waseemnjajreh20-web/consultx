/**
 * E7.10A — QR code card for the case tracking workflow.
 *
 * Renders the public tracking URL as a QR. Provides:
 *   - Copy link
 *   - Download PNG / SVG
 *   - Open public preview in a new tab
 *   - Regenerate token (owner/admin only)
 *
 * The actual token is created lazily via ensure_case_public_tracking RPC the
 * first time CaseTrackingPanel mounts; this component only renders + acts on
 * the token it receives.
 */

import { useRef, useState } from "react";
import { Copy, Download, ExternalLink, RotateCcw, ShieldOff } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { buildPublicTrackingUrl } from "@/lib/enterprise/casePublicMapping";

interface Props {
  token: string;
  caseNumber: string;
  publicEnabled: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
  ar: boolean;
}

export default function CaseQRCodeCard({
  token, caseNumber, publicEnabled, canRegenerate, onRegenerate, ar,
}: Props) {
  const { toast } = useToast();
  const url = buildPublicTrackingUrl(token);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: ar ? "تم نسخ الرابط" : "Link copied" });
    } catch {
      toast({
        title: ar ? "تعذّر النسخ" : "Copy failed",
        description: url,
        variant: "destructive",
      });
    }
  };

  const downloadPng = () => {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    triggerDownload(dataUrl, `case-${caseNumber}-tracking.png`);
  };

  const downloadSvg = () => {
    const svg = svgWrapRef.current?.querySelector("svg");
    if (!svg) return;
    const cloned = svg.cloneNode(true) as SVGElement;
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const svgText = new XMLSerializer().serializeToString(cloned);
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const dataUrl = URL.createObjectURL(blob);
    triggerDownload(dataUrl, `case-${caseNumber}-tracking.svg`);
    setTimeout(() => URL.revokeObjectURL(dataUrl), 1500);
  };

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{ar ? "رمز التتبع العام" : "Public tracking QR"}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {ar
              ? "يمكن للعميل مسح هذا الرمز لمعرفة حالة معاملته."
              : "Clients scan this code to see their case status."}
          </p>
        </div>
        {!publicEnabled && (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-300 shrink-0">
            <ShieldOff className="w-3 h-3" />
            {ar ? "مُعطَّل" : "Disabled"}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center bg-white p-3 rounded-md">
        {/* Visible (rendered) canvas-based QR */}
        <div ref={canvasWrapRef} className="hidden">
          <QRCodeCanvas value={url} size={256} level="M" includeMargin />
        </div>
        {/* Visible (rendered) SVG-based QR (used both for display and for SVG download) */}
        <div ref={svgWrapRef}>
          <QRCodeSVG value={url} size={180} level="M" includeMargin />
        </div>
      </div>

      <div className="text-[11px] font-mono break-all text-muted-foreground bg-muted/20 px-2 py-1.5 rounded border border-border/30">
        {url}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={copyLink}>
          <Copy className="w-3.5 h-3.5" />
          {ar ? "نسخ الرابط" : "Copy link"}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadPng}>
          <Download className="w-3.5 h-3.5" />
          PNG
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadSvg}>
          <Download className="w-3.5 h-3.5" />
          SVG
        </Button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex">
          <Button size="sm" variant="outline" className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" />
            {ar ? "معاينة عامة" : "Public preview"}
          </Button>
        </a>
        {canRegenerate && (
          confirmRegen ? (
            <span className="inline-flex items-center gap-1.5">
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                onClick={() => { setConfirmRegen(false); onRegenerate(); }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {ar ? "تأكيد التغيير" : "Confirm"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRegen(false)}>
                {ar ? "إلغاء" : "Cancel"}
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-amber-400 hover:text-amber-300"
              onClick={() => setConfirmRegen(true)}
              title={ar ? "إنشاء رمز جديد وإلغاء القديم" : "Mint a new token and invalidate the old one"}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {ar ? "إنشاء رمز جديد" : "Regenerate"}
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
