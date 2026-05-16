import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../app/ErrorBoundary";

function CrashingChild(): ReactElement {
  throw new Error("synthetic render failure");
}

describe("ErrorBoundary", () => {
  it("renders a recovery fallback instead of a blank screen", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <CrashingChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("Anzeige wurde wiederhergestellt")).toBeTruthy();
    expect(screen.getByText("Ansicht neu laden")).toBeTruthy();

    spy.mockRestore();
  });
});
