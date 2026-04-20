import { memo } from "react";
import type { ConnectionStatus } from "../types/telemetry";

interface Props {
  status: ConnectionStatus;
}

export const ConnectionBanner = memo(function ConnectionBanner({ status }: Props) {
  if (status === "live") return null;

  const bgColor =
    status === "disconnected" ? "bg-red-500" : "bg-amber-500";

  const text =
    status === "disconnected"
      ? "Keine Verbindung zur Engine \u2014 Wiederverbindung l\u00e4uft"
      : "Verbindung wird hergestellt\u2026";

  return (
    <div className={`h-8 w-full flex items-center justify-center z-50 ${bgColor}`}>
      <span className="text-[12px] text-white font-normal">{text}</span>
    </div>
  );
});
