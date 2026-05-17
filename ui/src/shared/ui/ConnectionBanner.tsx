import { memo } from "react";
import type { ConnectionStatus } from "../types/telemetry";

interface Props {
  status: ConnectionStatus;
  trainerConnected?: boolean;
}

export const ConnectionBanner = memo(function ConnectionBanner({ status, trainerConnected }: Props) {
  if (status === "live" || status === "connected") {
    const isTrainerConnected = trainerConnected ?? true;
    return (
      <div
        className="h-7 w-full flex items-center justify-end px-4 gap-2 bg-[var(--surface)] border-b border-[var(--border)]"
        role="status"
        aria-label={isTrainerConnected ? "Verbindungsstatus: Trainer verbunden" : "Verbindungsstatus: Trainer nicht verbunden"}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isTrainerConnected ? "bg-[var(--success)] animate-pulse motion-reduce:animate-none" : "bg-[var(--warning)]"}`}
        />
        <span className={`text-[10px] font-medium ${isTrainerConnected ? "text-[var(--success)]" : "text-[var(--warning)]"}`}>
          {isTrainerConnected ? "Trainer verbunden" : "Trainer nicht verbunden"}
        </span>
      </div>
    );
  }

  if (status === "connecting" || status === "reconnecting") {
    return (
      <div className="h-7 w-full flex items-center justify-center gap-2 bg-[var(--surface)] border-b border-[var(--border)]" role="status">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse motion-reduce:animate-none shrink-0" />
        <span className="text-[10px] font-medium text-[var(--warning)]">
          {status === "reconnecting" ? "Verbindung wird wiederhergestellt" : "Verbindung wird aufgebaut"}
        </span>
      </div>
    );
  }

  return (
    <div className="h-7 w-full flex items-center justify-center gap-2 bg-[var(--critical)]/10 border-b border-[var(--critical)]/30" role="alert">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--critical)] shrink-0" />
      <span className="text-[10px] font-medium text-[var(--critical)]">Trainerverbindung unterbrochen</span>
    </div>
  );
});
