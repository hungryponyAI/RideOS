const ROUTE_PATTERNS = [
  "M18 68 C30 48 43 49 54 34 S78 19 82 42 C86 62 66 70 52 58 S31 49 22 33",
  "M18 60 C30 58 34 42 45 42 H58 C70 42 69 25 82 24",
  "M20 66 C31 30 48 78 60 42 C66 24 76 29 84 18",
  "M18 58 C27 50 33 30 46 34 C56 37 54 62 66 62 C75 62 78 42 86 34",
  "M18 64 C26 62 27 48 36 48 H52 C65 48 65 28 78 28 H86",
  "M20 54 C32 28 45 70 58 44 C68 24 76 46 84 28",
] as const;

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function RouteProfileIcon({
  seed,
  selected = false,
  size = 112,
}: {
  seed: string;
  selected?: boolean;
  size?: number;
}) {
  const hash = hashSeed(seed);
  const path = ROUTE_PATTERNS[hash % ROUTE_PATTERNS.length];
  const rotate = (hash % 7) - 3;
  const offset = (hash % 9) - 4;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 104 104"
      role="img"
      aria-label="Routenprofil"
      className="block drop-shadow-[0_18px_38px_rgba(0,0,0,0.18)]"
    >
      <rect
        x="4"
        y="4"
        width="96"
        height="96"
        rx="24"
        fill="var(--surface)"
        stroke={selected ? "var(--accent)" : "var(--border)"}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <circle cx="72" cy="28" r="18" fill="var(--accent)" opacity="0.10" />
      <path
        d={path}
        transform={`translate(0 ${offset}) rotate(${rotate} 52 52)`}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={path}
        transform={`translate(0 ${offset}) rotate(${rotate} 52 52)`}
        fill="none"
        stroke="rgba(255,255,255,0.58)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="64" r="3" fill="var(--accent)" />
      <circle cx="84" cy="28" r="3" fill="var(--accent)" />
    </svg>
  );
}
