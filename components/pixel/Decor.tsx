// Decorations for the wooden panels: gold rivets and vines.
// All drawn here as simple pixel SVGs (original art).

// A round gold rivet, like a little coin.
export function Rivet({ className = "" }: { className?: string }) {
  return (
    <svg className={`rivet ${className}`} width="16" height="16" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M2 0h4v1h1v1h1v4h-1v1h-1v1h-4v-1h-1v-1h-1v-4h1v-1h1z" fill="var(--outline)" />
      <path d="M2 1h4v1h1v4h-1v1h-4v-1h-1v-4h1z" fill="var(--gold)" />
      <path d="M3 2h2v1h1v2h-1v1h-2v-1h-1v-2h1z" fill="var(--gold-dark)" />
      <rect x="2" y="2" width="1" height="1" fill="var(--gold-light)" />
    </svg>
  );
}

// A little vine that hangs down from the grass.
export function Vine({ className = "", flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      className={`vine ${className}`}
      width="20"
      height="44"
      viewBox="0 0 10 22"
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M4 0h2v4h1v4h-1v4h-1v4h1v3h-2v-3h-1v-4h1v-4h1v-4h-1z" fill="var(--grass-dark)" />
      <path d="M6 3h3v2h-3zM1 7h3v2h-3zM6 11h3v2h-3zM1 15h3v2h-3z" fill="var(--grass)" />
      <path d="M7 3h2v1h-2zM1 7h2v1h-2zM7 11h2v1h-2zM1 15h2v1h-2z" fill="var(--grass-light)" />
    </svg>
  );
}
