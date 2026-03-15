import { useEffect, useRef } from "react";

// Lightweight CSS-only floating particles using pseudo-elements via inline keyframes
// We render small divs instead of canvas for simplicity & performance
const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  size: `${2 + Math.random() * 3}px`,
  duration: `${8 + Math.random() * 14}s`,
  delay: `${Math.random() * 10}s`,
  opacity: 0.12 + Math.random() * 0.18,
}));

export default function HeroParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: "#00D4FF",
            opacity: p.opacity,
            animation: `heroParticleFloat ${p.duration} ${p.delay} ease-in-out infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}
