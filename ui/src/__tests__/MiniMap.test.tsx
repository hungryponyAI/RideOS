import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mapboxMock = vi.hoisted(() => {
  type Source = {
    data: unknown;
    setData: (data: unknown) => void;
  };

  class MockMap {
    static instances: MockMap[] = [];

    options: unknown;
    easeToCalls: unknown[] = [];
    fitBoundsCalls: unknown[] = [];
    sources = new Map<string, Source>();
    layers: Array<{ id: string }> = [];
    private handlers = new Map<string, Array<() => void>>();

    constructor(options: unknown) {
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

    addLayer(layer: { id: string }) {
      this.layers.push({ id: layer.id });
    }

    getLayer(id: string) {
      return this.layers.find((layer) => layer.id === id);
    }

    moveLayer(id: string) {
      const layer = this.getLayer(id);
      if (!layer) return;
      this.layers = [...this.layers.filter((candidate) => candidate.id !== id), layer];
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
});
