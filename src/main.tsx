import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Stale-deploy self-heal (2026-09-01). Every production deploy renames the
// hashed chunks; a tab opened BEFORE the deploy that later lazy-loads one of
// them gets a 404/HTML module and throws — measured in production as the
// "حدث خطأ في الاتصال" toast with the user's message saved but ZERO requests
// reaching fire-safety-chat (the exception fires before fetch). Vite emits
// `vite:preloadError` exactly for this case: reload once to pick up the new
// bundle instead of stranding the user on a broken tab. The sessionStorage
// guard stops a reload loop if the network itself is down.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const KEY = "cx_chunk_reload_at";
  const last = Number(sessionStorage.getItem(KEY) ?? 0);
  if (Date.now() - last < 30_000) return; // already tried very recently
  sessionStorage.setItem(KEY, String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
