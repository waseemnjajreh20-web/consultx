/**
 * CosmicBackground — Pure CSS animated deep-space background.
 * Renders shooting stars, cosmic dust, and a glowing blueprint grid.
 * All animation is CSS keyframe driven — zero JavaScript animation logic.
 */
export default function CosmicBackground() {
  return (
    <div className="cosmic-bg" aria-hidden="true">
      {/* Shooting stars — CSS animated at -45deg */}
      <div className="shooting-star" />
      <div className="shooting-star" />
      <div className="shooting-star" />
      <div className="shooting-star" />
      <div className="shooting-star" />
      <div className="shooting-star" />
      <div className="shooting-star" />
      <div className="shooting-star" />

      {/* Cosmic dust — box-shadow particle layers */}
      <div className="cosmic-dust" />
      <div className="cosmic-dust-2" />

      {/* Blueprint grid with faint cyan glow */}
      <div className="absolute inset-0 blueprint-grid-glow opacity-[0.15]" />

      {/* Radial vignette for depth */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
        }}
      />
    </div>
  );
}
