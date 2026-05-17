interface Props {
  variant?: "mark" | "wordmark";
  height?: number;
  className?: string;
}

export function OudenaLogo({ variant = "wordmark", height = 48, className }: Props) {
  if (variant === "mark") {
    return (
      <svg width={height} height={height} viewBox="-6 -6 108 108" fill="none" role="img" aria-label="OUDENA" className={className}>
        <g stroke="#74AFCB" strokeLinecap="round" strokeLinejoin="round" strokeWidth="7">
          <path d="M96 48A48 48 0 1 1 48 0" />
          <path d="M26 50 L75 44" opacity="0.82" />
        </g>
      </svg>
    );
  }

  const width = Math.round(height * 580 / 180);
  return (
    <svg width={width} height={height} viewBox="0 0 580 180" fill="none" role="img" aria-label="OUDENA" className={className}>
      <g transform="translate(52 42)" stroke="#74AFCB" strokeLinecap="round" strokeLinejoin="round">
        <path d="M96 48A48 48 0 1 1 48 0" strokeWidth="7" />
        <path d="M26 50 L75 44" strokeWidth="7" opacity="0.82" />
      </g>
      <text
        x="190"
        y="106"
        fill="currentColor"
        fontFamily="Inter, 'SF Pro Display', 'Segoe UI', Arial, sans-serif"
        fontSize="52"
        fontWeight="300"
        letterSpacing="22"
      >
        OUDENA
      </text>
    </svg>
  );
}
