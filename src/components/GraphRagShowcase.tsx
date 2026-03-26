import { useEffect, useRef, useState, useCallback } from "react";
import { useLanguage } from "@/hooks/useLanguage";

// ─────────────────────────────────────────────────────────────────────────────
// 3D Knowledge Graph Canvas — Pure Canvas, Zero Dependencies
// ─────────────────────────────────────────────────────────────────────────────

interface Node3D {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  radius: number;
  color: string;
  glow: string;
  community: number;
  label: string;
}

interface Edge3D {
  from: number;
  to: number;
  color: string;
}

// Community color palette (mapped to ConsultX brand)
const COMMUNITY_COLORS = [
  { fill: "#00D4FF", glow: "rgba(0,212,255,0.6)" },   // Cyan — Primary
  { fill: "#FF8C00", glow: "rgba(255,140,0,0.5)" },    // Amber — Standard
  { fill: "#DC143C", glow: "rgba(220,20,60,0.5)" },    // Crimson — Analysis
  { fill: "#7C3AED", glow: "rgba(124,58,237,0.5)" },   // Violet
  { fill: "#10B981", glow: "rgba(16,185,129,0.5)" },   // Emerald
  { fill: "#F59E0B", glow: "rgba(245,158,11,0.5)" },   // Gold
  { fill: "#3B82F6", glow: "rgba(59,130,246,0.5)" },   // Blue
  { fill: "#EC4899", glow: "rgba(236,72,153,0.5)" },   // Pink
];

// SBC node labels for realistic simulation
const NODE_LABELS = [
  "SBC 201", "SBC 801", "NFPA 13", "NFPA 72", "فئة الإشغال", "مقاومة الحريق",
  "أنظمة الإطفاء", "مسافات الإخلاء", "الكشف المبكر", "التهوية الميكانيكية",
  "الدرج المحمي", "جدار مقاوم", "رشاشات تلقائية", "إنذار صوتي",
  "مخرج طوارئ", "الحمل الحراري", "المسافة القصوى", "التقسيم الحريقي",
  "الممرات الآمنة", "كاشف الدخان", "خزان المياه", "مضخة الحريق",
  "فصل الخطورة", "البناء المقاوم", "شهادة السلامة", "تقرير الإطفاء",
  "الفحص الدوري", "التصنيف الإنشائي", "الارتفاع المسموح", "المساحة القصوى",
  "حاجز الحريق", "نظام FM-200", "CO₂ System", "Dry Chemical",
  "Wet Sprinkler", "Fire Pump", "Standpipe",
];

function generateGraph(nodeCount: number, edgeRatio: number): { nodes: Node3D[]; edges: Edge3D[] } {
  const nodes: Node3D[] = [];
  const edges: Edge3D[] = [];

  // Generate nodes in a spherical cloud with community clustering
  const communityCount = 8;
  const communityAnchors: { x: number; y: number; z: number }[] = [];

  for (let c = 0; c < communityCount; c++) {
    const phi = Math.acos(1 - 2 * (c + 0.5) / communityCount);
    const theta = Math.PI * (1 + Math.sqrt(5)) * c;
    communityAnchors.push({
      x: Math.sin(phi) * Math.cos(theta) * 200,
      y: Math.sin(phi) * Math.sin(theta) * 200,
      z: Math.cos(phi) * 200,
    });
  }

  for (let i = 0; i < nodeCount; i++) {
    const community = i % communityCount;
    const anchor = communityAnchors[community];
    const spread = 80 + Math.random() * 60;
    const colors = COMMUNITY_COLORS[community];

    nodes.push({
      x: anchor.x + (Math.random() - 0.5) * spread,
      y: anchor.y + (Math.random() - 0.5) * spread,
      z: anchor.z + (Math.random() - 0.5) * spread,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      vz: (Math.random() - 0.5) * 0.15,
      radius: 1.5 + Math.random() * 2.5,
      color: colors.fill,
      glow: colors.glow,
      community,
      label: NODE_LABELS[i % NODE_LABELS.length],
    });
  }

  // Connect nodes — preferentially within communities + some cross-community links
  const edgeCount = Math.floor(nodeCount * edgeRatio);
  const added = new Set<string>();

  for (let e = 0; e < edgeCount; e++) {
    const from = Math.floor(Math.random() * nodeCount);
    let to: number;
    if (Math.random() < 0.7) {
      // Same community
      const candidates = nodes.filter((_, j) => j !== from && nodes[j].community === nodes[from].community);
      if (candidates.length === 0) continue;
      to = nodes.indexOf(candidates[Math.floor(Math.random() * candidates.length)]);
    } else {
      // Cross-community
      to = Math.floor(Math.random() * nodeCount);
      if (to === from) continue;
    }
    const key = from < to ? `${from}-${to}` : `${to}-${from}`;
    if (added.has(key)) continue;
    added.add(key);

    const col = COMMUNITY_COLORS[nodes[from].community];
    edges.push({ from, to, color: col.glow });
  }

  return { nodes, edges };
}

// 3D rotation matrix (Y-axis primary, X-axis secondary)
function rotateY(x: number, z: number, angle: number): [number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - z * sin, x * sin + z * cos];
}
function rotateX(y: number, z: number, angle: number): [number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [y * cos - z * sin, y * sin + z * cos];
}

// Perspective projection
function project(x: number, y: number, z: number, cx: number, cy: number, fov: number): { sx: number; sy: number; scale: number } {
  const perspective = fov / (fov + z);
  return {
    sx: cx + x * perspective,
    sy: cy + y * perspective,
    scale: perspective,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Renderer Hook
// ─────────────────────────────────────────────────────────────────────────────
function useGraphCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const graphRef = useRef<{ nodes: Node3D[]; edges: Edge3D[] } | null>(null);
  const frameRef = useRef<number>(0);
  const angleRef = useRef({ y: 0, x: 0.15 });
  const mouseRef = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Generate the graph once
    if (!graphRef.current) {
      graphRef.current = generateGraph(180, 0.9);
    }
    const { nodes, edges } = graphRef.current;

    // Resize handler
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Mouse parallax
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width - 0.5,
        y: (e.clientY - rect.top) / rect.height - 0.5,
        active: true,
      };
    };
    const onMouseLeave = () => { mouseRef.current.active = false; };
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    // Render loop
    let running = true;
    const FOV = 600;

    const render = () => {
      if (!running) return;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      const CX = W / 2;
      const CY = H / 2;

      // Clear
      ctx.clearRect(0, 0, W, H);

      // Slow auto-rotation + mouse parallax
      angleRef.current.y += 0.002;
      const targetXAngle = mouseRef.current.active ? mouseRef.current.y * 0.3 + 0.15 : 0.15;
      angleRef.current.x += (targetXAngle - angleRef.current.x) * 0.02;

      const yAngle = angleRef.current.y;
      const xAngle = angleRef.current.x;

      // Gentle drift for nodes
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        n.z += n.vz;
        // Soft boundary
        const dist = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
        if (dist > 350) {
          n.vx -= n.x * 0.0001;
          n.vy -= n.y * 0.0001;
          n.vz -= n.z * 0.0001;
        }
      }

      // Transform & project all nodes
      const projected = nodes.map(n => {
        let [rx, rz] = rotateY(n.x, n.z, yAngle);
        let [ry, rz2] = rotateX(n.y, rz, xAngle);
        return project(rx, ry, rz2, CX, CY, FOV);
      });

      // Draw edges (back-to-front not critical for edges)
      ctx.lineWidth = 0.5;
      for (const edge of edges) {
        const a = projected[edge.from];
        const b = projected[edge.to];
        if (a.scale < 0.1 || b.scale < 0.1) continue;
        const alpha = Math.min(a.scale, b.scale) * 0.25;
        ctx.strokeStyle = edge.color.replace(/[\d.]+\)$/, `${alpha})`);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }

      // Sort nodes by Z (back-to-front) for correct layering
      const sorted = nodes.map((n, i) => ({ n, p: projected[i], i }))
        .sort((a, b) => {
          let [, az] = rotateY(a.n.x, a.n.z, yAngle);
          let [, az2] = rotateX(a.n.y, az, xAngle);
          let [, bz] = rotateY(b.n.x, b.n.z, yAngle);
          let [, bz2] = rotateX(b.n.y, bz, xAngle);
          return az2 - bz2; // farther first
        });

      // Draw nodes
      for (const { n, p } of sorted) {
        if (p.scale < 0.1) continue;
        const r = n.radius * p.scale;
        const alpha = Math.min(1, p.scale * 1.2);

        // Outer glow
        const grd = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 4);
        grd.addColorStop(0, n.glow.replace(/[\d.]+\)$/, `${alpha * 0.4})`));
        grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = n.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label for larger, closer nodes
        if (p.scale > 0.65 && r > 2.2) {
          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
          ctx.font = `${Math.max(8, 10 * p.scale)}px 'Cairo', sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(n.label, p.sx, p.sy - r - 4);
        }
      }

      // Subtle orbital rings
      ctx.strokeStyle = "rgba(0,212,255,0.04)";
      ctx.lineWidth = 1;
      for (const radius of [120, 200, 280]) {
        const pr = project(radius, 0, 0, CX, CY, FOV);
        ctx.beginPath();
        ctx.ellipse(CX, CY, radius * pr.scale, radius * pr.scale * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [canvasRef]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated Counter
// ─────────────────────────────────────────────────────────────────────────────
function AnimatedCounter({ target, duration = 2500, suffix = "" }: { target: number; duration?: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const startTime = performance.now();

          const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref}>
      {value.toLocaleString("en-US")}{suffix}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component: GraphRagShowcase
// ─────────────────────────────────────────────────────────────────────────────
interface GraphRagShowcaseProps {
  onExplore?: () => void;
}

const GraphRagShowcase = ({ onExplore }: GraphRagShowcaseProps) => {
  const { t, language } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isAr = language === "ar";

  // Initialize canvas animation
  useGraphCanvas(canvasRef);

  const stats = [
    {
      value: 5701,
      labelAr: "عقدة معرفية",
      labelEn: "Knowledge Nodes",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3" />
          <circle cx="4" cy="6" r="2" /><line x1="6" y1="7" x2="9.5" y2="10.5" />
          <circle cx="20" cy="6" r="2" /><line x1="18" y1="7" x2="14.5" y2="10.5" />
          <circle cx="4" cy="18" r="2" /><line x1="6" y1="17" x2="9.5" y2="13.5" />
          <circle cx="20" cy="18" r="2" /><line x1="18" y1="17" x2="14.5" y2="13.5" />
        </svg>
      ),
      color: "#00D4FF",
      glowBg: "rgba(0,212,255,0.08)",
      border: "rgba(0,212,255,0.25)",
    },
    {
      value: 4956,
      labelAr: "علاقة هندسية",
      labelEn: "Engineering Edges",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF8C00" strokeWidth="1.5">
          <path d="M5 12h14" /><path d="M12 5v14" />
          <path d="M5 5l14 14" opacity="0.5" /><path d="M19 5L5 19" opacity="0.5" />
          <circle cx="12" cy="12" r="2" fill="#FF8C00" />
        </svg>
      ),
      color: "#FF8C00",
      glowBg: "rgba(255,140,0,0.08)",
      border: "rgba(255,140,0,0.25)",
    },
    {
      value: 36,
      labelAr: "مجتمعاً ذكياً",
      labelEn: "Smart Communities",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC143C" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <circle cx="5" cy="18" r="3" /><circle cx="19" cy="18" r="3" />
          <line x1="12" y1="12" x2="7" y2="16" opacity="0.6" />
          <line x1="12" y1="12" x2="17" y2="16" opacity="0.6" />
        </svg>
      ),
      color: "#DC143C",
      glowBg: "rgba(220,20,60,0.08)",
      border: "rgba(220,20,60,0.25)",
    },
  ];

  return (
    <section
      id="graphrag-showcase"
      className="relative w-full overflow-hidden"
      style={{
        minHeight: "680px",
        background: "linear-gradient(180deg, rgba(10,10,20,0.98) 0%, rgba(5,5,15,1) 100%)",
      }}
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* ── Background: Live 3D Canvas ─────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.85, zIndex: 0 }}
      />

      {/* ── Gradient overlays for depth ───────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 30%, rgba(5,5,15,0.85) 100%)",
          zIndex: 1,
        }}
      />

      {/* ── Top/Bottom fade strips ────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 h-24 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(5,5,15,1), transparent)", zIndex: 2 }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(5,5,15,1), transparent)", zIndex: 2 }}
      />

      {/* ── Glassmorphism Content Layer ────────────────────────────────────── */}
      <div className="relative z-10 flex items-center justify-center min-h-[680px] px-4 sm:px-6 lg:px-8 py-20">
        <div
          className="max-w-3xl w-full text-center"
          style={{
            background: "rgba(10,15,30,0.45)",
            backdropFilter: "blur(18px) saturate(1.4)",
            WebkitBackdropFilter: "blur(18px) saturate(1.4)",
            border: "1px solid rgba(0,212,255,0.12)",
            borderRadius: "20px",
            padding: "48px 36px 44px",
            boxShadow: "0 0 80px rgba(0,212,255,0.06), 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* ── Section badge ── */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 14px",
              borderRadius: "20px",
              border: "1px solid rgba(0,212,255,0.2)",
              background: "rgba(0,212,255,0.06)",
              fontSize: "0.72rem",
              fontWeight: 500,
              color: "#00D4FF",
              letterSpacing: "0.04em",
              marginBottom: "20px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
            </svg>
            {isAr ? "تقنية حصرية" : "Exclusive Technology"}
          </div>

          {/* ── Main heading ── */}
          <h2
            style={{
              fontFamily: "'Cairo', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: "clamp(1.5rem, 4vw, 2.2rem)",
              lineHeight: 1.3,
              color: "#ffffff",
              margin: "0 0 12px",
            }}
          >
            {isAr ? (
              <>
                <span style={{ color: "#00D4FF" }}>GraphRAG</span>
                {" "}
                : العقل المعرفي لكود البناء السعودي
              </>
            ) : (
              <>
                <span style={{ color: "#00D4FF" }}>GraphRAG</span>
                {" "}
                : The Knowledge Brain of Saudi Building Code
              </>
            )}
          </h2>

          {/* ── Subtitle ── */}
          <p
            style={{
              fontFamily: "'Cairo', system-ui, sans-serif",
              fontSize: "clamp(0.85rem, 2vw, 1rem)",
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.7,
              maxWidth: "560px",
              margin: "0 auto 36px",
              fontWeight: 400,
            }}
          >
            {isAr
              ? "محاكاة حية للترابط الفضائي بين أكثر من 5,700 عقدة معرفية مستخرجة من SBC 201 و SBC 801 في الوقت الحقيقي"
              : "Live simulation of the spatial interconnections between 5,700+ knowledge nodes extracted from SBC 201 & SBC 801 in real-time"}
          </p>

          {/* ── Stats Grid ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "16px",
              marginBottom: "36px",
            }}
          >
            {stats.map((stat, idx) => (
              <div
                key={idx}
                style={{
                  background: stat.glowBg,
                  border: `1px solid ${stat.border}`,
                  borderRadius: "14px",
                  padding: "20px 12px 16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px ${stat.glowBg}`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                }}
              >
                {stat.icon}
                <span
                  style={{
                    fontFamily: "'Cairo', system-ui, sans-serif",
                    fontWeight: 700,
                    fontSize: "1.75rem",
                    lineHeight: 1,
                    color: stat.color,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <AnimatedCounter target={stat.value} />
                </span>
                <span
                  style={{
                    fontSize: "0.78rem",
                    color: "rgba(255,255,255,0.55)",
                    fontWeight: 500,
                  }}
                >
                  {isAr ? stat.labelAr : stat.labelEn}
                </span>
              </div>
            ))}
          </div>

          {/* ── CTA Button ── */}
          <button
            onClick={onExplore}
            className="group"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              padding: "14px 36px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #00D4FF 0%, #0891b2 100%)",
              color: "#fff",
              fontFamily: "'Cairo', system-ui, sans-serif",
              fontWeight: 600,
              fontSize: "1rem",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 20px rgba(0,212,255,0.3), 0 0 40px rgba(0,212,255,0.1)",
              transition: "transform 0.2s, box-shadow 0.2s",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px) scale(1.03)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 32px rgba(0,212,255,0.45), 0 0 60px rgba(0,212,255,0.15)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0) scale(1)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(0,212,255,0.3), 0 0 40px rgba(0,212,255,0.1)";
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            {isAr ? "استكشف المعرفة الهندسية" : "Explore Engineering Knowledge"}
          </button>

          {/* ── Subtle descriptor ── */}
          <p
            style={{
              marginTop: "16px",
              fontSize: "0.68rem",
              color: "rgba(255,255,255,0.3)",
              fontWeight: 400,
            }}
          >
            {isAr
              ? "مبني على SBC 201 · SBC 801 · NFPA 13 · NFPA 72 — فهرسة كاملة 100%"
              : "Built on SBC 201 · SBC 801 · NFPA 13 · NFPA 72 — 100% Fully Indexed"}
          </p>
        </div>
      </div>
    </section>
  );
};

export default GraphRagShowcase;
