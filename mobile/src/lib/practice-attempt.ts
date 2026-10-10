export type AttemptTiming = {
  prepare_ms: number;
  request_ms: number;
  settle_ms: number;
  total_ms: number;
  status: "saved" | "failed";
};
/** Preview now; only accept a grade after the authoritative save and the local recovery settlement attempt. */
export async function checkPracticeAttempt<T>(steps: {
  preview: () => void;
  prepare: () => Promise<unknown>;
  request: () => Promise<T>;
  verdict?: (result: T) => void;
  settle: (result: T) => Promise<unknown>;
  accept: (result: T) => void;
  restore: () => void;
  report: (timing: AttemptTiming) => void;
}): Promise<void> {
  const start = performance.now();
  const timing: AttemptTiming = {
    prepare_ms: 0,
    request_ms: 0,
    settle_ms: 0,
    total_ms: 0,
    status: "failed",
  };
  async function measure<R>(
    phase: "prepare_ms" | "request_ms" | "settle_ms",
    work: () => Promise<R>,
  ) {
    const at = performance.now();
    try {
      return await work();
    } finally {
      timing[phase] = performance.now() - at;
    }
  }
  try {
    steps.preview();
    await measure("prepare_ms", steps.prepare);
    const result = await measure("request_ms", steps.request);
    steps.verdict?.(result);
    await measure("settle_ms", () => steps.settle(result));
    steps.accept(result);
    timing.status = "saved";
  } catch (error) {
    steps.restore();
    throw error;
  } finally {
    timing.total_ms = performance.now() - start;
    try {
      steps.report(timing);
    } catch {
      /* Diagnostics must never turn a saved grade into a failed attempt. */
    }
  }
}
