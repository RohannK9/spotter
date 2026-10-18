import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";

vi.mock("../components/TripMap", () => ({
  default: () => <div>Map test placeholder</div>,
}));
afterEach(() => vi.unstubAllGlobals());

it("aborts a pending analysis when inputs change and ignores a stale response", async () => {
  let analysisSignal: AbortSignal | null = null;
  let finish: (value: Response) => void = () => {};
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("health"))
      return Promise.resolve(new Response(JSON.stringify({ mode: "demo" })));
    analysisSignal = init?.signal as AbortSignal;
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  fireEvent.click(await screen.findByText("Use Denver → Salt Lake City demo"));
  fireEvent.click(screen.getByRole("button", { name: /Analyze routes/ }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /Analyzing trip/ }),
    ).toBeDisabled(),
  );
  fireEvent.change(screen.getByLabelText("Load weight"), {
    target: { value: "40000" },
  });
  expect(analysisSignal!.aborted).toBe(true);
  expect(screen.getByRole("button", { name: /Analyze routes/ })).toBeEnabled();
  await act(async () =>
    finish(
      new Response(
        JSON.stringify({ routes: [], recommendation: { route_id: "STALE" } }),
      ),
    ),
  );
  expect(screen.queryByText(/STALE/)).not.toBeInTheDocument();
  expect(screen.getByText(/Previous analysis canceled/)).toBeVisible();
});
