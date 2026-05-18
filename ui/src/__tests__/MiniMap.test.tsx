import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mapboxMock = vi.hoisted(() => {
  type Source = {
    data: unknown;
    setData: (data: unknown) => void;
  };

  class MockMap {
    static instances: MockMap[] = [];
    static failConstructor = false;

    options: unknown;
    easeToCalls: unknown[] = [];
    jumpToCalls: unknown[] = [];
    fitBoundsCalls: unknown[] = [];
    moveLayerCalls: Array<{ id: string; beforeId?: string }> = [];
    setPaintCalls: Array<{ layerId: string; property: string; value: unknown }> = [];
    sources = new Map<string, Source>();
    layers: Array<{ id: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }> = [];
    private handlers = new Map<string, Array<() => void>>();

    constructor(options: unknown) {
      if (MockMap.failConstructor) throw new Error("mapbox constructor failed");
      this.options = options;
      MockMap.instances.push(this);
    }

    once(event: string, handler: () => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    }

    trigger(event: string) {
      const handlers = this.handlers.get(event) ?? [];
      this.handlers.set(event, []);
      handlers.forEach((handler) => handler());
    }

    setConfigProperty() {}
    setTerrain() {}
    resize() {}
    stop() {}
    remove() {}

    easeTo(options: unknown) {
      this.easeToCalls.push(options);
    }

    jumpTo(options: unknown) {
      this.jumpToCalls.push(options);
    }

    fitBounds(...options: unknown[]) {
      this.fitBoundsCalls.push(options);
    }

    addSource(id: string, source: { data?: unknown }) {
      this.sources.set(id, {
        data: source.data,
        setData(data: unknown) {
          this.data = data;
        },
      });
    }

    getSource(id: string) {
      return this.sources.get(id);
    }

    addLayer(layer: { id: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }, beforeId?: string) {
      const nextLayer = { id: layer.id, paint: layer.paint, layout: layer.layout };
      if (!beforeId) {
        this.layers.push(nextLayer);
        return;
      }
      const beforeIndex = this.layers.findIndex((candidate) => candidate.id === beforeId);
      if (beforeIndex === -1) {
        this.layers.push(nextLayer);
        return;
      }
      this.layers.splice(beforeIndex, 0, nextLayer);
    }

    getLayer(id: string) {
      return this.layers.find((layer) => layer.id === id);
    }

    moveLayer(id: string, beforeId?: string) {
      this.moveLayerCalls.push({ id, beforeId });
      const layer = this.getLayer(id);
      if (!layer) return;
      const withoutLayer = this.layers.filter((candidate) => candidate.id !== id);
      if (!beforeId) {
        this.layers = [...withoutLayer, layer];
        return;
      }
      const beforeIndex = withoutLayer.findIndex((candidate) => candidate.id === beforeId);
      if (beforeIndex === -1) {
        this.layers = [...withoutLayer, layer];
        return;
      }
      withoutLayer.splice(beforeIndex, 0, layer);
      this.layers = withoutLayer;
    }

    setPaintProperty(layerId: string, property: string, value: unknown) {
      this.setPaintCalls.push({ layerId, property, value });
    }

    getStyle() {
      return { layers: this.layers };
    }
  }

  return { MockMap };
});

vi.mock("mapbox-gl", () => ({
  default: {
    accessToken: "",
    prewarm: vi.fn(),
    Map: mapboxMock.MockMap,
    LngLatBounds: class {},
  },
}));

const rafState = { queue: [] as Array<(t: number) => void>, cancelled: false };

async function pumpFrames(times: number) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      const q = rafState.queue;
      rafState.queue = [];
      const now = performance.now() + (i + 1) * 16;
      q.forEach((cb) => {
        if (!rafState.cancelled) cb(now);
      });
    });
  }
}

describe("MiniMap", () => {
  beforeEach(() => {
    mapboxMock.MockMap.instances.length = 0;
    mapboxMock.MockMap.failConstructor = false;
    vi.stubEnv("VITE_MAPBOX_TOKEN", "test-token");
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    rafState.queue = [];
    rafState.cancelled = false;
    vi.stubGlobal("requestAnimationFrame", ((cb: (t: number) => void) => {
      rafState.queue.push(cb);
      return rafState.queue.length;
    }) as typeof window.requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", () => {
      rafState.cancelled = true;
      rafState.queue = [];
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("centers the initial camera on the first route coordinate", async () => {
    const { MiniMap } = await import("../features/ride/components/MiniMap");
    render(
      <MiniMap
        coords={[
          [47, 11],
          [47.001, 11.002],
          [47.002, 11.004],
        ]}
        cumDist={[0, 200, 400]}
        positionM={350}
        isDark={false}
        viewMode="chase"
      />
    );

    const map = mapboxMock.MockMap.instances[0];
    expect(map.options).toMatchObject({ center: [11, 47] });
    map.trigger("load");
    map.trigger("idle");

    await pumpFrames(3);

    await waitFor(() => expect(map.easeToCalls.length).toBeGreaterThan(0));
    expect(map.easeToCalls[0]).toMatchObject({ duration: 0 });
    expect(map.fitBoundsCalls).toHaveLength(0);
  });

  it("does not create the map before route coordinates are available", async () => {
    const { MiniMap } = await import("../features/ride/components/MiniMap");
    const { rerender } = render(
      <MiniMap
        coords={null}
        cumDist={null}
        positionM={null}
        isDark={false}
        viewMode="chase"
      />
    );

    expect(mapboxMock.MockMap.instances).toHaveLength(0);

    rerender(
      <MiniMap
        coords={[[47, 11], [47.001, 11.002]]}
        cumDist={[0, 200]}
        positionM={null}
        isDark={false}
        viewMode="chase"
      />
    );

    expect(mapboxMock.MockMap.instances[0].options).toMatchObject({
      center: [11, 47],
    });
  });

  it("shows a fallback instead of throwing when the token is missing", async () => {
    vi.stubEnv("VITE_MAPBOX_TOKEN", "");
    const { MiniMap } = await import("../features/ride/components/MiniMap");
    const { getByText } = render(
      <MiniMap
        coords={[[47, 11], [47.001, 11.002]]}
        cumDist={[0, 200]}
        positionM={100}
        isDark={false}
        viewMode="chase"
      />
    );

    expect(getByText("Mapbox Token fehlt")).toBeTruthy();
    expect(mapboxMock.MockMap.instances).toHaveLength(0);
  });

  it("shows a fallback instead of throwing when map initialization fails", async () => {
    mapboxMock.MockMap.failConstructor = true;
    const { MiniMap } = await import("../features/ride/components/MiniMap");
    const { getByText } = render(
      <MiniMap
        coords={[[47, 11], [47.001, 11.002]]}
        cumDist={[0, 200]}
        positionM={100}
        isDark={false}
        viewMode="chase"
      />
    );

    await waitFor(() => expect(getByText("Karte nicht verfügbar")).toBeTruthy());
  });

  it("keeps the ego pinned to the route start until the ride starts", async () => {
    const { MiniMap } = await import("../features/ride/components/MiniMap");
    const routeProps = {
      coords: [
        [47, 11],
        [47.001, 11.002],
        [47.002, 11.004],
      ] as Array<[number, number]>,
      cumDist: [0, 200, 400],
      isDark: false,
      viewMode: "chase" as const,
    };
    const { rerender } = render(
      <MiniMap {...routeProps} positionM={350} lockToRouteStart />
    );

    const map = mapboxMock.MockMap.instances[0];
    map.trigger("load");
    map.trigger("idle");
    await pumpFrames(5);

    await waitFor(() => {
      const ego = map.getSource("ego")?.data as { geometry: { coordinates: [number, number] } } | undefined;
      expect(ego?.geometry.coordinates).toEqual([11, 47]);
    });

    rerender(<MiniMap {...routeProps} positionM={400} lockToRouteStart />);
    await pumpFrames(5);
    const egoStillAtStart = map.getSource("ego")?.data as { geometry: { coordinates: [number, number] } } | undefined;
    expect(egoStillAtStart?.geometry.coordinates).toEqual([11, 47]);

    rerender(<MiniMap {...routeProps} positionM={400} lockToRouteStart={false} />);
    await pumpFrames(120);
    await waitFor(() => {
      const ego = map.getSource("ego")?.data as { geometry: { coordinates: [number, number] } } | undefined;
      expect(ego?.geometry.coordinates[0]).toBeCloseTo(11.004, 2);
      expect(ego?.geometry.coordinates[1]).toBeCloseTo(47.002, 3);
    });
  });

  it("renders ghost as a distinct competitor marker with halo", async () => {
    const { MiniMap } = await import("../features/ride/components/MiniMap");
    render(
      <MiniMap
        coords={[[47, 11], [47.001, 11.002]]}
        cumDist={[0, 200]}
        positionM={100}
        ghostLat={47.0005}
        ghostLng={11.001}
        isDark={false}
        viewMode="chase"
      />
    );

    const map = mapboxMock.MockMap.instances[0];
    map.trigger("load");
    map.trigger("idle");
    await pumpFrames(5);

    await waitFor(() => expect(map.getLayer("ghost-halo")).toBeTruthy());
    expect(map.getLayer("ghost")).toBeTruthy();
    const ghost = map.getSource("ghost")?.data as { geometry: { coordinates: [number, number] } } | undefined;
    expect(ghost?.geometry.coordinates[0]).toBeCloseTo(11.001, 3);
    expect(ghost?.geometry.coordinates[1]).toBeCloseTo(47.0005, 3);
  });

  it("draws the route with a wider translucent smoothed stroke", async () => {
    const {
      MiniMap,
      ROUTE_STROKE_OPACITY,
      ROUTE_STROKE_WIDTH,
    } = await import("../features/ride/components/MiniMap");
    render(
      <MiniMap
        coords={[[47, 11], [47.0005, 11.003], [47.001, 11.001], [47.0015, 11.004]]}
        cumDist={[0, 110, 220, 330]}
        positionM={100}
        isDark={false}
        viewMode="chase"
      />
    );

    const map = mapboxMock.MockMap.instances[0];
    map.trigger("load");
    map.trigger("idle");

    await waitFor(() => expect(map.getLayer("route")).toBeTruthy());
    const routeLayer = map.getLayer("route");
    expect(routeLayer?.paint).toMatchObject({
      "line-width": ROUTE_STROKE_WIDTH,
      "line-opacity": ROUTE_STROKE_OPACITY,
    });
    expect(routeLayer?.layout).toMatchObject({ "line-cap": "round", "line-join": "round" });
  });

  it("animates ghost between samples rather than snapping", async () => {
    const { MiniMap } = await import("../features/ride/components/MiniMap");
    const routeProps = {
      coords: [[47, 11], [47.002, 11]] as Array<[number, number]>,
      cumDist: [0, 222],
      positionM: 100,
      isDark: false,
      viewMode: "chase" as const,
    };
    const { rerender } = render(
      <MiniMap
        {...routeProps}
        ghostLat={47}
        ghostLng={11}
      />
    );

    const map = mapboxMock.MockMap.instances[0];
    map.trigger("load");
    map.trigger("idle");
    await pumpFrames(5);

    rerender(
      <MiniMap
        {...routeProps}
        ghostLat={47.002}
        ghostLng={11}
      />
    );
    await pumpFrames(1);

    const ghostAfterOneFrame = map.getSource("ghost")?.data as { geometry: { coordinates: [number, number] } } | undefined;
    const latNow = ghostAfterOneFrame?.geometry.coordinates[1] ?? 0;
    expect(latNow).toBeGreaterThan(47);
    expect(latNow).toBeLessThan(47.002);
  });

  it("stops the rAF loop on unmount", async () => {
    const { MiniMap } = await import("../features/ride/components/MiniMap");
    const { unmount } = render(
      <MiniMap
        coords={[[47, 11], [47.001, 11.002]]}
        cumDist={[0, 200]}
        positionM={100}
        isDark={false}
        viewMode="chase"
      />
    );
    const map = mapboxMock.MockMap.instances[0];
    map.trigger("load");
    map.trigger("idle");
    await pumpFrames(2);
    const easeBefore = map.easeToCalls.length;
    const jumpBefore = map.jumpToCalls.length;
    unmount();
    await pumpFrames(10);
    expect(map.easeToCalls.length).toBe(easeBefore);
    expect(map.jumpToCalls.length).toBe(jumpBefore);
  });
});
