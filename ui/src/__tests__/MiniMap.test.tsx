import { cleanup, render, waitFor } from "@testing-library/react";
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
    fitBoundsCalls: unknown[] = [];
    moveLayerCalls: Array<{ id: string; beforeId?: string }> = [];
    sources = new Map<string, Source>();
    layers: Array<{ id: string }> = [];
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

    addLayer(layer: { id: string }, beforeId?: string) {
      const nextLayer = { id: layer.id };
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

    await waitFor(() => expect(map.easeToCalls.length).toBeGreaterThan(0));

    expect(map.easeToCalls[0]).toMatchObject({
      center: [11, 47],
      duration: 0,
    });
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

  it("keeps the camera locked to the route start until the ride starts", async () => {
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
    await waitFor(() => expect(map.easeToCalls.length).toBeGreaterThan(0));

    rerender(<MiniMap {...routeProps} positionM={400} lockToRouteStart />);
    await waitFor(() => expect(map.easeToCalls.length).toBeGreaterThan(1));
    expect(map.easeToCalls.at(-1)).toMatchObject({ center: [11, 47] });

    rerender(<MiniMap {...routeProps} positionM={400} lockToRouteStart={false} />);
    await waitFor(() => expect(map.easeToCalls.length).toBeGreaterThan(2));
    expect(map.easeToCalls.at(-1)).toMatchObject({ center: [11.004, 47.002] });
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

    await waitFor(() => expect(map.getLayer("ghost-halo")).toBeTruthy());
    expect(map.getLayer("ghost")).toBeTruthy();
    expect(map.getSource("ghost")?.data).toMatchObject({
      geometry: { coordinates: [11.001, 47.0005] },
    });
  });

  it("updates ghost coordinates without reordering layers on every tick", async () => {
    const { MiniMap } = await import("../features/ride/components/MiniMap");
    const routeProps = {
      coords: [[47, 11], [47.001, 11.002]] as Array<[number, number]>,
      cumDist: [0, 200],
      positionM: 100,
      isDark: false,
      viewMode: "chase" as const,
    };
    const { rerender } = render(
      <MiniMap
        {...routeProps}
        ghostLat={47.0005}
        ghostLng={11.001}
      />
    );

    const map = mapboxMock.MockMap.instances[0];
    map.trigger("load");
    map.trigger("idle");

    await waitFor(() => expect(map.getLayer("ghost-halo")).toBeTruthy());
    const moveLayerCountAfterCreate = map.moveLayerCalls.length;

    rerender(
      <MiniMap
        {...routeProps}
        ghostLat={47.0007}
        ghostLng={11.0014}
      />
    );

    await waitFor(() => {
      expect(map.getSource("ghost")?.data).toMatchObject({
        geometry: { coordinates: [11.0014, 47.0007] },
      });
    });
    expect(map.moveLayerCalls).toHaveLength(moveLayerCountAfterCreate);
  });
});
