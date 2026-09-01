/**
 * SignedChatImage + ConversationFilesModal (2026-09-01)
 *
 * The chat-images bucket is PRIVATE (privacy fix: it used to be public, which
 * exposed every uploaded client drawing to anyone with the URL). Attachments
 * are therefore displayed through short-lived SIGNED urls.
 *
 * Stored values come in four historical shapes and all must keep working:
 *   - blob:/data: preview URLs on the optimistic message  → passed through
 *   - full public URLs saved by the old code ("…/object/public/chat-images/X")
 *     → path extracted, signed
 *   - bare storage paths saved by the new code ("{uid}/{file}.jpg") → signed
 *   - anything else → placeholder, never a broken request
 */
import { useEffect, useMemo, useState } from "react";
import { X, Trash2, Download, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "chat-images";
const TTL_SECONDS = 3600;

// Signed-url cache so a conversation full of thumbnails signs each object once.
const urlCache = new Map<string, { url: string; expiresAt: number }>();

/** Storage path for a stored attachment value, or null when it's not ours. */
export function chatImagePath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith("blob:") || stored.startsWith("data:")) return null;
  const m = stored.match(/\/chat-images\/(.+?)(\?.*)?$/);
  if (m) return decodeURIComponent(m[1]);
  if (!stored.startsWith("http")) return stored; // bare path (new format)
  return null;
}

export async function resolveChatImageUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith("blob:") || stored.startsWith("data:")) return stored;
  const path = chatImagePath(stored);
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.expiresAt > Date.now() + 30_000) return hit.url;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    urlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 });
    return data.signedUrl;
  } catch {
    return null;
  }
}

export function SignedChatImage({
  stored, alt, className, title, onOpen,
}: {
  stored: string;
  alt: string;
  className?: string;
  title?: string;
  /** Called with the RESOLVED (signed/preview) url — use for the enlarge dialog. */
  onOpen?: (resolvedUrl: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(
    stored.startsWith("blob:") || stored.startsWith("data:") ? stored : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (stored.startsWith("blob:") || stored.startsWith("data:")) { setUrl(stored); return; }
    setUrl(null); setFailed(false);
    resolveChatImageUrl(stored).then((u) => {
      if (cancelled) return;
      if (u) setUrl(u); else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [stored]);

  if (failed) {
    return (
      <div className={className} style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 96, minHeight: 72, background: "hsl(var(--muted) / 0.3)", border: "1px dashed hsl(var(--border))", borderRadius: 8, fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
        تعذّر تحميل المرفق
      </div>
    );
  }
  if (!url) {
    return <div className={className} style={{ minWidth: 96, minHeight: 72, background: "hsl(var(--muted) / 0.25)", borderRadius: 8 }} />;
  }
  return (
    <img
      src={url}
      alt={alt}
      title={title}
      className={className}
      onClick={onOpen ? () => onOpen(url) : undefined}
      onError={() => setFailed(true)}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ConversationFilesModal — every attachment of the open conversation in one
// place: preview grid, enlarge, download, delete (owner-only via storage RLS).
// ─────────────────────────────────────────────────────────────────────────────
export function ConversationFilesModal({
  open, onClose, storedUrls, isRtl, onOpenImage,
}: {
  open: boolean;
  onClose: () => void;
  /** All stored attachment values of the conversation, message order. */
  storedUrls: string[];
  isRtl: boolean;
  onOpenImage: (resolvedUrl: string) => void;
}) {
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const files = useMemo(
    () => storedUrls.map((s) => ({ stored: s, path: chatImagePath(s) })).filter((f) => f.path),
    [storedUrls],
  );

  if (!open) return null;

  const handleDelete = async (path: string) => {
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (!error) setDeleted((prev) => new Set(prev).add(path));
    } catch { /* keep the tile; nothing destructive happened */ }
  };

  const handleDownload = async (stored: string, idx: number) => {
    const u = await resolveChatImageUrl(stored);
    if (!u) return;
    const a = document.createElement("a");
    a.href = u; a.download = `attachment-${idx + 1}.jpg`; a.target = "_blank"; a.rel = "noopener";
    a.click();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        dir={isRtl ? "rtl" : "ltr"}
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border border-border/60 bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Paperclip className="w-4 h-4 text-primary" />
            {isRtl ? `ملفات المحادثة (${files.length})` : `Conversation files (${files.length})`}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground" aria-label="close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {isRtl ? "لا توجد مرفقات في هذه المحادثة بعد." : "No attachments in this conversation yet."}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {files.map((f, idx) => (
              <div key={f.path} className="relative group rounded-xl border border-border/50 overflow-hidden bg-muted/20">
                {deleted.has(f.path!) ? (
                  <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
                    {isRtl ? "حُذف" : "Deleted"}
                  </div>
                ) : (
                  <>
                    <SignedChatImage
                      stored={f.stored}
                      alt={`file-${idx + 1}`}
                      className="w-full h-32 object-cover cursor-pointer"
                      onOpen={onOpenImage}
                    />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 p-1.5 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDownload(f.stored, idx)} title={isRtl ? "تنزيل" : "Download"} className="p-1.5 rounded-md bg-black/40 text-white hover:bg-black/70">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(f.path!)} title={isRtl ? "حذف نهائي" : "Delete"} className="p-1.5 rounded-md bg-black/40 text-red-300 hover:bg-red-600/80 hover:text-white">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-[11px] text-muted-foreground">
          {isRtl
            ? "المرفقات خاصة بحسابك وتُعرض عبر روابط موقّتة. الحذف نهائي من التخزين."
            : "Attachments are private to your account and served via short-lived links. Delete removes the file permanently."}
        </p>
      </div>
    </div>
  );
}
