import { useState, useRef, useCallback } from "react";
import type { OutgoingMessage } from "../types/route";

interface PreRideScreenProps {
  onStarted: () => void;
  sendMessage: (msg: OutgoingMessage | object) => void;
}

export function PreRideScreen({ onStarted, sendMessage }: PreRideScreenProps) {
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
      sendMessage({ type: "load_route_content", content });
      onStarted();
    };
    reader.onerror = () => {
      setFileError("Datei konnte nicht gelesen werden");
      setLoading(false);
    };
    reader.readAsText(file);
  }, [sendMessage, onStarted]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  return (
    <div
      className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-8 p-6"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <h1 className="text-[#F9FAFB] text-[32px] font-bold tabular-nums">RideOS</h1>
      <p className="text-[#6B7280] text-[20px] font-normal">Strecke wählen oder ohne Route starten</p>

      <div
        className={`flex flex-col items-center justify-center gap-4 w-full max-w-md border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer ${
          dragging ? "border-[#3B82F6] bg-[#1a1a2e]" : "border-[#4B5563] bg-[#111111]"
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx"
          onChange={handleFileChange}
          className="hidden"
        />
        <span className="text-[#9CA3AF] text-[16px] text-center">
          {loading
            ? "Wird geladen…"
            : dragging
            ? "GPX-Datei hier ablegen"
            : "GPX-Datei auswählen oder hierher ziehen"}
        </span>
        <span className="text-[#6B7280] text-[12px]">.gpx</span>
        {fileError && (
          <span className="text-[#EF4444] text-[12px]">{fileError}</span>
        )}
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={() => onStarted()}
        className="min-h-[44px] min-w-[44px] px-6 py-3 bg-[#111111] border border-[#4B5563] text-[#F9FAFB] text-[20px] font-normal rounded disabled:opacity-50"
      >
        Ohne Strecke starten
      </button>
    </div>
  );
}
