import { useDeviceStatus } from "../settings/hooks/useDeviceStatus";
import { useWS } from "../../shared/ws/useWS";
import { ScreenHeader } from "../../shared/ui/ScreenHeader";

type StatusVariant = "connected" | "searching" | "disconnected";

function DeviceCard({
  name,
  description,
  status,
}: {
  name: string;
  description: string;
  status: StatusVariant;
}) {
  const label =
    status === "connected"
      ? "Verbunden"
      : status === "searching"
      ? "Trainer wird gesucht"
      : "Getrennt";

  const dotClass =
    status === "connected"
      ? "bg-[var(--success)] animate-pulse"
      : status === "searching"
      ? "bg-[var(--warning)] animate-pulse"
      : "bg-[var(--critical)]";

  const textClass =
    status === "connected"
      ? "text-[var(--success)]"
      : status === "searching"
      ? "text-[var(--warning)]"
      : "text-[var(--text-subtle)]";

  return (
    <div className="flex items-center justify-between p-4 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
      <div className="flex flex-col gap-0.5 min-w-0 mr-4">
        <span className="text-sm font-medium text-[var(--text)] truncate">{name}</span>
        <span className="text-xs text-[var(--text-muted)]">{description}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className={`text-xs font-medium ${textClass}`}>{label}</span>
      </div>
    </div>
  );
}

export function DevicesScreen() {
  const { kickrConnected, clickConnected } = useDeviceStatus();
  const { status } = useWS();

  const wsSearching = status === "connecting" || status === "reconnecting";
  const kickrStatus: StatusVariant = kickrConnected
    ? "connected"
    : wsSearching || status === "connected"
    ? "searching"
    : "disconnected";

  const clickStatus: StatusVariant = clickConnected ? "connected" : "searching";

  const allConnected = kickrConnected && clickConnected;

  return (
    <div data-testid="devices-screen" className="w-full h-full bg-[var(--bg)] flex flex-col overflow-hidden">
      <ScreenHeader />
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <DeviceCard
            name="Wahoo KICKR Core"
            description="Trainer · FTMS · BLE"
            status={kickrStatus}
          />
          <DeviceCard
            name="Zwift Click"
            description="Schaltsteuerung · BLE"
            status={clickStatus}
          />
        </div>

        {!allConnected && (
          <p className="text-xs text-[var(--text-subtle)] leading-relaxed">
            {status === "disconnected"
              ? "Starte die Engine, um Geräte zu verbinden."
              : "Geräte werden automatisch verbunden, sobald sie in Reichweite sind."}
          </p>
        )}
      </div>
    </div>
  );
}
