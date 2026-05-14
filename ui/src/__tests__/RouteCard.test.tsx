import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RouteCard } from "../features/pre-ride/RouteCard";
import type { RouteLibraryEntry } from "../shared/types/route";

const mockRoute: RouteLibraryEntry = {
  id: "test-route-1",
  name: "Testroute",
  filename: "test.gpx",
  added_at: "2026-01-01T00:00:00Z",
  distance_km: 25.5,
  elevation_gain_m: 450,
  elevation_loss_m: 440,
  elevation_thumbnail: [100, 150, 200, 180, 120, 100],
  best_time_s: null,
  ride_count: 0,
  strava_id: null,
  sport_type: null,
  activity_date: null,
  moving_time_s: null,
};

const mockSettings = { weight_kg: 75, height_cm: 180, ftp_w: 200 };

describe("RouteCard", () => {
  it("renders route name", () => {
    const { getByText } = render(
      <RouteCard route={mockRoute} onLoad={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} athleteSettings={mockSettings} />
    );
    expect(getByText("Testroute")).toBeTruthy();
  });

  it("renders distance and elevation metadata", () => {
    const { getByText } = render(
      <RouteCard route={mockRoute} onLoad={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} athleteSettings={mockSettings} />
    );
    expect(getByText("25.5 km")).toBeTruthy();
    expect(getByText("↑450 m")).toBeTruthy();
  });

  it("rename action has accessible label", () => {
    const { getByLabelText } = render(
      <RouteCard route={mockRoute} onLoad={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} athleteSettings={mockSettings} />
    );
    expect(getByLabelText("Umbenennen")).toBeTruthy();
  });

  it("delete action has accessible label", () => {
    const { getByLabelText } = render(
      <RouteCard route={mockRoute} onLoad={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} athleteSettings={mockSettings} />
    );
    expect(getByLabelText("Löschen")).toBeTruthy();
  });

  it("calls onDelete with route id when delete is clicked", () => {
    const onDelete = vi.fn();
    const { getByLabelText } = render(
      <RouteCard route={mockRoute} onLoad={vi.fn()} onDelete={onDelete} onRename={vi.fn()} athleteSettings={mockSettings} />
    );
    fireEvent.click(getByLabelText("Löschen"));
    expect(onDelete).toHaveBeenCalledWith("test-route-1");
  });

  it("calls onLoad with route id when card is clicked", () => {
    const onLoad = vi.fn();
    const { getByText } = render(
      <RouteCard route={mockRoute} onLoad={onLoad} onDelete={vi.fn()} onRename={vi.fn()} athleteSettings={mockSettings} />
    );
    fireEvent.click(getByText("Testroute"));
    expect(onLoad).toHaveBeenCalledWith("test-route-1");
  });

  it("shows estimated time when no best time", () => {
    const { getByText } = render(
      <RouteCard route={mockRoute} onLoad={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} athleteSettings={mockSettings} />
    );
    expect(getByText("ca.")).toBeTruthy();
  });

  it("shows best time when available", () => {
    const routeWithBest = { ...mockRoute, best_time_s: 3600 };
    const { getByText } = render(
      <RouteCard route={routeWithBest} onLoad={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()} athleteSettings={mockSettings} />
    );
    expect(getByText("Bestzeit")).toBeTruthy();
  });
});
