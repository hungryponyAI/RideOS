import { type ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}

export function HudPanel({ children, className = "", elevated = false }: Props) {
  return (
    <div
      className={`bg-[var(--surface-soft)] backdrop-blur-md border border-[var(--border)] rounded-xl ${elevated ? "shadow-elevated" : "shadow-soft"} ${className}`}
    >
      {children}
    </div>
  );
}
