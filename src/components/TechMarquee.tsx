import {
  Flame, ShieldCheck, Shield, BrainCircuit, ScanSearch, Globe,
  Bell, DoorOpen, Table2, Layers,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

const BADGES = [
  { Icon: Flame,        textAr: "NFPA 13 - أنظمة الرش التلقائي",     textEn: "NFPA 13 - Sprinkler Systems",         accent: "cyan"    },
  { Icon: Flame,        textAr: "NFPA 14 - أنظمة الأنابيب القائمة",  textEn: "NFPA 14 - Standpipe Systems",         accent: "amber"   },
  { Icon: Flame,        textAr: "NFPA 20 - مضخات الحريق",            textEn: "NFPA 20 - Fire Pumps",                accent: "crimson" },
  { Icon: Bell,         textAr: "NFPA 72 - أنظمة الإنذار",           textEn: "NFPA 72 - Fire Alarm Systems",        accent: "cyan"    },
  { Icon: DoorOpen,     textAr: "NFPA 101 - كود سلامة الحياة",        textEn: "NFPA 101 - Life Safety Code",         accent: "amber"   },
  { Icon: ShieldCheck,  textAr: "SBC 201 - الكود السعودي للبناء",     textEn: "SBC 201 - Saudi Building Code",       accent: "crimson" },
  { Icon: Shield,       textAr: "SBC 801 - كود الحماية من الحرائق",   textEn: "SBC 801 - Fire Protection Code",      accent: "cyan"    },
  { Icon: BrainCircuit, textAr: "تحليل بصري بالذكاء الاصطناعي",      textEn: "AI Visual Drawing Analysis",          accent: "amber"   },
  { Icon: ScanSearch,   textAr: "مراجعة المخططات الهندسية",           textEn: "Engineering Drawing Review",          accent: "crimson" },
  { Icon: Globe,        textAr: "SFPE - هندسة الحماية من الحرائق",    textEn: "SFPE - Fire Protection Engineering",  accent: "cyan"    },
  { Icon: Table2,       textAr: "تحليل متطلبات الإشغال",              textEn: "Occupancy Requirements Analysis",     accent: "amber"   },
  { Icon: Layers,       textAr: "3 أوضاع ذكية للاستشارة",            textEn: "3 Smart Consultation Modes",          accent: "crimson" },
] as const;

const ACCENT_STYLES: Record<string, { border: string; bg: string; glow: string; text: string }> = {
  cyan:    { border: "rgba(0,212,255,0.45)",  bg: "rgba(0,212,255,0.07)",  glow: "0 0 10px rgba(0,212,255,0.25)",  text: "#00D4FF" },
  amber:   { border: "rgba(255,140,0,0.45)",  bg: "rgba(255,140,0,0.07)",  glow: "0 0 10px rgba(255,140,0,0.25)",  text: "#FF8C00" },
  crimson: { border: "rgba(220,20,60,0.45)",  bg: "rgba(220,20,60,0.07)",  glow: "0 0 10px rgba(220,20,60,0.25)",  text: "#DC143C" },
};

const Badge = ({ Icon, textAr, textEn, accent }: (typeof BADGES)[number]) => {
  const { language } = useLanguage();
  const s = ACCENT_STYLES[accent];
  return (
    <div
      className="flex items-center gap-2 shrink-0 mx-3 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 hover:scale-105 cursor-default"
      style={{
        background: "rgba(17,24,39,0.75)",
        border: `1px solid ${s.border}`,
        boxShadow: s.glow,
        color: "hsl(var(--foreground))",
        backdropFilter: "blur(6px)",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = s.bg;
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 18px ${s.border}`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = "rgba(17,24,39,0.75)";
        (e.currentTarget as HTMLElement).style.boxShadow = s.glow;
      }}
    >
      <Icon size={14} strokeWidth={1.5} style={{ color: s.text, flexShrink: 0 }} />
      <span>{language === "ar" ? textAr : textEn}</span>
    </div>
  );
};

export default function TechMarquee() {
  return (
    <div className="relative w-full overflow-hidden border-y border-border/20 bg-background/40 backdrop-blur-sm py-4">
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      {/* Reverse-direction track */}
      <div className="flex animate-marquee-reverse hover:[animation-play-state:paused]">
        {[...BADGES, ...BADGES].map((b, i) => (
          <Badge key={i} {...b} />
        ))}
      </div>
    </div>
  );
}
