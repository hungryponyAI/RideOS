const ROUTE_PATTERNS = [
  "M24 66 L38 54 L50 60 L66 42 L80 48",
  "M24 60 L40 60 L40 45 L56 45 L56 30 L78 30",
  "M24 68 L40 50 L54 56 L70 36 L82 36",
  "M24 58 C35 44 45 44 54 54 S72 65 82 46",
  "M24 64 L38 48 L52 48 L66 32 L82 32",
  "M24 62 C38 62 38 42 52 42 C66 42 66 24 82 24",
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

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 104 104"
      role="img"
      aria-label="Routenprofil"
      className="block"
    >
      <rect
        x="5"
        y="5"
        width="94"
        height="94"
        rx="22"
        fill="var(--surface)"
        stroke={selected ? "var(--accent)" : "var(--border)"}
        strokeWidth={selected ? 2 : 1.25}
      />
      <path
        d="M22 74 H82"
        fill="none"
        stroke="var(--border)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="66" r="2.75" fill="var(--accent)" />
      <circle cx="82" cy="48" r="2.75" fill="var(--accent)" opacity="0.72" />
    </svg>
  );
}
