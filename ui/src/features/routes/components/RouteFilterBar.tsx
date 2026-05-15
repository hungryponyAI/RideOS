import type { RouteLibraryEntry } from "../../../shared/types/route";

export type RouteFilter = "short" | "flat" | "easy" | "recovery" | "climb" | "ghost" | "favorites";

const FILTER_LABELS: Record<RouteFilter, string> = {
  short: "Kurz",
  flat: "Flach",
  easy: "Leicht",
  recovery: "Erholung",
  climb: "Bergig",
  ghost: "Ghost",
  favorites: "Favoriten",
};

interface Props {
  active: Set<RouteFilter>;
  routes: RouteLibraryEntry[];
  favorites: Set<string>;
  onChange: (next: Set<RouteFilter>) => void;
}

export function applyRouteFilters(
  routes: RouteLibraryEntry[],
  active: Set<RouteFilter>,
  favorites: Set<string>,
): RouteLibraryEntry[] {
  if (active.size === 0) return routes;
  return routes.filter((r) => {
    const gainPerKm = r.distance_km > 0 ? r.elevation_gain_m / r.distance_km : 0;
    for (const f of active) {
      if (f === "short" && r.distance_km > 25) return false;
      if (f === "flat" && gainPerKm >= 8) return false;
      if (f === "easy" && (r.distance_km > 30 || gainPerKm >= 12)) return false;
      if (f === "recovery" && (r.distance_km > 20 || gainPerKm >= 8)) return false;
      if (f === "climb" && gainPerKm < 20) return false;
      if (f === "ghost" && r.best_time_s === null) return false;
      if (f === "favorites" && !favorites.has(r.id)) return false;
    }
    return true;
  });
}

function countMatches(
  filter: RouteFilter,
  routes: RouteLibraryEntry[],
  favorites: Set<string>,
): number {
  return applyRouteFilters(routes, new Set([filter]), favorites).length;
}

export function RouteFilterBar({ active, routes, favorites, onChange }: Props) {
  const filters: RouteFilter[] = ["short", "flat", "easy", "recovery", "climb", "ghost", "favorites"];

  const toggle = (f: RouteFilter) => {
    const next = new Set(active);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    onChange(next);
  };

  const availableFilters = filters.filter((f) => countMatches(f, routes, favorites) > 0);
  if (availableFilters.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {availableFilters.map((f) => {
        const isActive = active.has(f);
        const count = countMatches(f, routes, favorites);
        return (
          <button
            key={f}
            type="button"
            onClick={() => toggle(f)}
            className={`flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors duration-150 cursor-pointer ${
              isActive
                ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                : "bg-transparent border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            }`}
          >
            {f === "favorites" && (
              <svg width="8" height="8" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            )}
            {FILTER_LABELS[f]}
            {count > 0 && !isActive && (
              <span className="text-[9px] text-[var(--text-subtle)]">{count}</span>
            )}
          </button>
        );
      })}
      {active.size > 0 && (
        <button
          type="button"
          onClick={() => onChange(new Set())}
          className="text-[10px] text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors duration-150 cursor-pointer px-1"
        >
          ✕ Zurücksetzen
        </button>
      )}
    </div>
  );
}
