import { OudenaLogo } from "./OudenaLogo";
import { useDeviceStatus } from "../../features/settings/hooks/useDeviceStatus";

interface Props {
  right?: React.ReactNode;
}

export function ScreenHeader({ right }: Props) {
  const { kickrConnected } = useDeviceStatus();

  return (
    <header className="shrink-0 flex items-center px-4 sm:px-8 py-5 border-b border-[var(--border)]">
      <OudenaLogo height={40} />
      <div className="ml-auto flex items-center gap-1.5">
        {right ?? (
          <>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                kickrConnected
                  ? "bg-[var(--success)] animate-pulse motion-reduce:animate-none"
                  : "bg-[var(--border)]"
              }`}
            />
            <p className={`text-xs ${kickrConnected ? "text-[var(--success)]" : "text-[var(--text-subtle)]"}`}>
              {kickrConnected ? "Trainer verbunden" : "Trainer nicht verbunden"}
            </p>
          </>
        )}
      </div>
    </header>
  );
}
