import { useState, useRef } from "react";
import type { OutgoingMessage } from "../types/route";

interface PreRideScreenProps {
  /** Called when the user chooses "load route" or "free ride"; parent dismisses the screen. */
  onStarted: () => void;
  /** WebSocket sendMessage from useTelemetry. */
  sendMessage: (msg: OutgoingMessage | object) => void;
}

export function PreRideScreen({ onStarted, sendMessage }: PreRideScreenProps) {
  const [path, setPath] = useState<string>("");
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".gpx")) {
      setFileError("Keine .gpx-Datei ausgewählt");
      return;
    }
    setFileError(null);
    // Browsers do not expose file.path for security; pre-fill the text input
    // with the filename and let the user paste/adjust the absolute path.
    // (See 04-04-PLAN interfaces block: path transport is locked to "path string over WS".)
    if (!path) setPath(file.name);
  };

  const handleLoad = () => {
    const trimmed = path.trim();
    if (!trimmed) {
      setFileError("Bitte absoluten Pfad eingeben");
      return;
    }
    sendMessage({ type: "load_route", path: trimmed });
    onStarted();
  };

  const handleFreeRide = () => {
    onStarted();
  };

  return (
    <div className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-[#F9FAFB] text-[32px] font-bold tabular-nums">RideOS</h1>
      <p className="text-[#6B7280] text-[20px] font-normal">Strecke wählen oder ohne Route starten</p>

      <div className="flex flex-col gap-4 w-full max-w-md">
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx"
          onChange={handleFileSelect}
          className="text-[#F9FAFB] text-[12px] bg-[#111111] border border-[#4B5563] rounded p-2"
        />
        <input
          type="text"
          value={path}
          placeholder="Absoluter Pfad zur GPX-Datei"
          onChange={(e) => setPath(e.target.value)}
          className="text-[#F9FAFB] text-[20px] bg-[#111111] border border-[#4B5563] rounded p-2 tabular-nums"
        />
        {fileError && (
          <span className="text-[#EF4444] text-[12px]">{fileError}</span>
        )}
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={handleLoad}
          className="min-h-[44px] min-w-[44px] px-6 py-3 bg-[#3B82F6] text-[#F9FAFB] text-[20px] font-bold rounded"
        >
          Strecke laden
        </button>
        <button
          type="button"
          onClick={handleFreeRide}
          className="min-h-[44px] min-w-[44px] px-6 py-3 bg-[#111111] border border-[#4B5563] text-[#F9FAFB] text-[20px] font-normal rounded"
        >
          Ohne Strecke starten
        </button>
      </div>

      <p className="text-[#6B7280] text-[12px]">Tipp: Pfad aus Finder → „Als Pfad kopieren" → hier einfügen.</p>
    </div>
  );
}
