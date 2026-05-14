import { type ReactNode } from "react";

interface Props {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  variant?: "ghost" | "surface";
  active?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
}

export function IconButton({
  icon,
  label,
  onClick,
  variant = "ghost",
  active,
  type = "button",
  className = "",
}: Props) {
  const isActive = active === true;

  const base =
    "min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg cursor-pointer transition-colors duration-150";

  const styles =
    variant === "surface"
      ? `bg-[var(--surface)] border border-[var(--border)] ${isActive ? "text-[var(--accent)] border-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]"}`
      : `${isActive ? "text-[var(--accent)] bg-[var(--bg-secondary)]" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)]"}`;

  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active !== undefined ? active : undefined}
      className={`${base} ${styles} ${className}`}
    >
      {icon}
    </button>
  );
}
