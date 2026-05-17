export function RouteProfileIcon({
  seed: _seed,
  selected = false,
  size = 112,
}: {
  seed: string;
  selected?: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 104 104"
      role="img"
      aria-label="Fahrradprofil"
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
      <circle
        cx="33"
        cy="64"
        r="13"
        fill="none"
        stroke="var(--text)"
        strokeWidth="3.5"
      />
      <circle
        cx="71"
        cy="64"
        r="13"
        fill="none"
        stroke="var(--text)"
        strokeWidth="3.5"
      />
      <g
        fill="none"
        stroke="var(--text)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M33 64 H52 L45 43 L33 64" />
        <path d="M52 64 L61 43 H45" />
        <path d="M61 43 L71 64" />
        <path d="M45 43 L42 35" />
        <path d="M38 35 H49" />
        <path d="M61 43 L67 35 H73" />
        <path d="M73 35 C78 35 81 39 79 44 C78 47 74 48 72 47" />
      </g>
      <circle cx="33" cy="64" r="3" fill="var(--text)" />
      <circle cx="71" cy="64" r="3" fill="var(--text)" />
    </svg>
  );
}
