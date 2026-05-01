import { useState, useRef, useCallback } from "react";
import type { OutgoingMessage, RouteLibraryEntry } from "../types/route";
import type { AthleteSettings } from "./SettingsPanel";
import { RouteCard } from "./RouteCard";

interface PreRideScreenProps {
  onStarted: () => void;
  sendMessage: (msg: OutgoingMessage | object) => boolean;
  routeLibrary: RouteLibraryEntry[];
  athleteSettings: AthleteSettings;
}

export function PreRideScreen({ onStarted, sendMessage, routeLibrary, athleteSettings }: PreRideScreenProps) {
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".gpx")) {
      setFileError("Keine .gpx-Datei ausgewählt");
      return;
    }
    setFileError(null);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const sent = sendMessage({ type: "load_route_content", content });
      if (!sent) {
        setFileError("Keine Verbindung zur Engine — ist sie gestartet?");
        setLoading(false);
        return;
      }
      onStarted();
    };
    reader.onerror = () => {
      setFileError("Datei konnte nicht gelesen werden");
      setLoading(false);
    };
    reader.readAsText(file);
  }, [sendMessage, onStarted]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const handleLoadSaved = useCallback((routeId: string) => {
    const sent = sendMessage({ type: "load_saved_route", route_id: routeId });
    if (sent) onStarted();
  }, [sendMessage, onStarted]);

  const handleDelete = useCallback((routeId: string) => {
    sendMessage({ type: "delete_route", route_id: routeId });
  }, [sendMessage]);

  const handleRename = useCallback((routeId: string, name: string) => {
    sendMessage({ type: "rename_route", route_id: routeId, name });
  }, [sendMessage]);

  return (
    <div className="w-screen h-screen bg-[var(--bg)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex flex-col items-center pt-8 pb-6 px-8">
        <span className="font-condensed font-bold text-[56px] text-black bg-[#FFF200] px-6 py-1 inline-block leading-none">
          RIDEOS
        </span>
        <p className="text-[11px] font-condensed font-bold tracking-widest text-[var(--text-muted)] mt-3 uppercase">
          INDOOR CYCLING ENGINE
        </p>
        <div className="h-[2px] w-full max-w-4xl bg-[#FFF200] mt-5" />
      </div>

      {/* Main two-column area */}
      <div className="flex-1 flex min-h-0 px-8 pb-8 gap-0">

        {/* Left: upload + start */}
        <div className="w-[320px] shrink-0 flex flex-col justify-center gap-4 pr-8">
          <div
            className={`flex flex-col items-center justify-center gap-3 border-2 p-8 cursor-pointer transition-colors ${
              dragging ? "border-[#FFF200] bg-[var(--surface)]" : "border-[var(--border)] bg-[var(--surface)]"
            }`}
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".gpx"
              onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
              className="hidden"
            />
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              className={loading ? "text-[#FFF200]" : "text-[var(--text-muted)]"} aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span className={`text-[11px] font-condensed font-bold tracking-widest uppercase text-center ${loading ? "text-[#FFF200]" : "text-[var(--text-muted)]"}`}>
              {loading ? "WIRD GELADEN…" : dragging ? "HIER ABLEGEN" : "GPX AUSWÄHLEN ODER ZIEHEN"}
            </span>
            {fileError && (
              <span className="text-[10px] font-condensed font-bold text-[#E10600] text-center">{fileError}</span>
            )}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => onStarted()}
            className="bg-[#FFF200] text-black font-condensed font-bold text-[13px] tracking-widest uppercase px-8 py-3 border-0 disabled:opacity-40 cursor-pointer hover:bg-white transition-colors duration-150"
          >
            OHNE STRECKE STARTEN
          </button>
        </div>

        {/* Vertical divider */}
        <div className="w-px bg-[var(--border)] shrink-0" />

        {/* Right: route library */}
        <div className="flex-1 min-w-0 flex flex-col pl-8">
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <span className="text-[11px] font-condensed font-bold tracking-[0.2em] uppercase text-[var(--label-accent)]">
              MEINE STRECKEN
            </span>
            {routeLibrary.length > 0 && (
              <span className="text-[9px] font-condensed font-bold tracking-widest text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] px-1.5 py-0.5">
                {routeLibrary.length}
              </span>
            )}
          </div>

          {routeLibrary.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[11px] font-condensed font-bold tracking-widest uppercase text-[var(--text-muted)] text-center">
                NOCH KEINE STRECKEN<br />GPX-DATEI HINZUFÜGEN
              </span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                {routeLibrary.map(route => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    onLoad={handleLoadSaved}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    athleteSettings={athleteSettings}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
