import { Component, type ErrorInfo, type ReactNode } from "react";
import { recordRideDiag } from "../shared/diagnostics/rideDiagnostics";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RideOS] UI crash boundary caught an error", error, info);
    recordRideDiag("error", "react error boundary", {
      message: error.message,
      stack: error.stack ?? null,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen w-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center px-6">
        <div className="max-w-md w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-elevated">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-subtle)]">
            RideOS
          </p>
          <h1 className="mt-2 text-xl font-semibold">Anzeige wurde wiederhergestellt</h1>
          <p className="mt-3 text-sm text-[var(--text-muted)] leading-relaxed">
            Die Oberfläche ist in einen sicheren Zustand gewechselt, statt leer zu bleiben.
            Lade die Ansicht neu, um weiterzufahren.
          </p>
          <button
            type="button"
            className="mt-5 min-h-[44px] rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-white"
            onClick={() => window.location.reload()}
          >
            Ansicht neu laden
          </button>
        </div>
      </div>
    );
  }
}
