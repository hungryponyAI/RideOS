import { useState } from "react";
import { getRideDiagSnapshot, isRideDiagEnabled } from "./rideDiagnostics";

export function RideDiagExportButton() {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  if (!isRideDiagEnabled()) return null;

  const handleCopy = async () => {
    const payload = JSON.stringify(getRideDiagSnapshot(), null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      console.info("[RideOS diag export]", payload);
      setStatus("failed");
      window.setTimeout(() => setStatus("idle"), 2200);
    }
  };

  const label = status === "copied"
    ? "Diagnostics copied"
    : status === "failed"
      ? "Diagnostics logged"
      : "Copy diagnostics";

  return (
    <button
      type="button"
      data-testid="ride-diag-export"
      onClick={handleCopy}
      className="absolute right-4 bottom-[calc(14rem+env(safe-area-inset-bottom,0px))] z-[80] rounded-md border border-[var(--border)] bg-[var(--surface)]/85 px-3 py-2 text-[11px] font-medium text-[var(--text-muted)] shadow-elevated backdrop-blur-sm transition-colors hover:text-[var(--text)]"
    >
      {label}
    </button>
  );
}
