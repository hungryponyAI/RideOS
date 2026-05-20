import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RideDiagExportButton } from "../shared/diagnostics/RideDiagExportButton";
import {
  incrementRideDiagCounter,
  resetRideDiagForTests,
} from "../shared/diagnostics/rideDiagnostics";

describe("RideDiagExportButton", () => {
  beforeEach(() => {
    resetRideDiagForTests();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    resetRideDiagForTests();
    vi.restoreAllMocks();
  });

  it("is hidden until ride diagnostics are enabled", () => {
    render(<RideDiagExportButton />);
    expect(screen.queryByTestId("ride-diag-export")).toBeNull();
  });

  it("copies the diagnostic snapshot when clicked", async () => {
    window.history.replaceState(null, "", "/?rideDiag=1");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    incrementRideDiagCounter("frames", 2);

    render(<RideDiagExportButton />);
    fireEvent.click(screen.getByTestId("ride-diag-export"));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain('"frames": 2');
  });
});
