import consultxPlatformLogo from "@/assets/consultx-platform-logo.png";
import nfpaLogo from "@/assets/nfpa-logo.png";
import civilDefenseLogo from "@/assets/civil-defense-logo.png";
import sceLogo from "@/assets/sce-logo.jpg";
import sdaiaLogo from "@/assets/sdaia-logo.jpg";
import sbcLogo from "@/assets/sbc-logo.jpg";
import sbcCenterLogo from "@/assets/sbc-center-logo.png";
import baladyLogo from "@/assets/balady-logo.jpg";

const logos = [
  { name: "ConsultX", src: consultxPlatformLogo },
  { name: "NFPA", src: nfpaLogo },
  { name: "SBC", src: sbcLogo },
  { name: "الدفاع المدني", src: civilDefenseLogo },
  { name: "هيئة المهندسين", src: sceLogo },
  { name: "الكود الوطني", src: sbcCenterLogo },
  { name: "سدايا SDAIA", src: sdaiaLogo },
  { name: "بلدي", src: baladyLogo },
];

const LogoItem = ({ name, src }: { name: string; src: string | null }) => (
  <div className="flex items-center justify-center mx-8 shrink-0">
    {src ? (
      <div className="brand-logo-wrapper">
        <img
          src={src}
          alt={name}
          style={{ height: "40px", width: "auto", maxWidth: "100px", objectFit: "contain" }}
        />
      </div>
    ) : (
      <span className="text-sm font-semibold text-muted-foreground whitespace-nowrap">
        {name}
      </span>
    )}
  </div>
);

const LogoMarquee = () => {
  return (
    <div className="relative z-10 w-full overflow-hidden border-b border-border/30 py-4" style={{ background: "transparent" }}>
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      <div className="flex animate-marquee hover:[animation-play-state:paused]">
        {[...logos, ...logos].map((logo, i) => (
          <LogoItem key={i} name={logo.name} src={logo.src} />
        ))}
      </div>
    </div>
  );
};

export default LogoMarquee;
