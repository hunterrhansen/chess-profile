export type FeedbackQuality = "best" | "excellent" | "good" | "wrong";
export type PracticeFeedback = {
  version: number;
  key: string;
  fen: string;
  grades: Record<string, FeedbackQuality>;
  complete: boolean;
};
export type DeckCard = {
  game_id: number;
  ply: number;
  pattern: string | null;
  reviews: number;
  fen_before: string;
  color: "white" | "black";
  san: string;
  uci: string;
  move_number: number;
  classification: string;
  opponent: string | null;
  played_at: string;
  win_pct_before: number | null;
  prev_uci: string | null;
  feedback?: PracticeFeedback | null;
};
export type DeckToday = {
  server_day: string;
  total: number;
  mastered: number;
  learning: number;
  new: number;
  today: { done: number; total: number };
  card: DeckCard | null;
  results: {
    game_id: number;
    ply: number;
    correct: boolean;
    mark: string;
    san: string;
    opponent: string | null;
  }[];
};
export type DeckAnswer = {
  correct: boolean;
  quality: "best" | "excellent" | "good" | "wrong" | "shown";
  rating: string | null;
  best_uci: string;
  best_san: string;
  mastered: boolean;
  due: string | null;
};
export type Api = <T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) => Promise<T>;
export function serverUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use your Knightly server's HTTPS URL without credentials or query parameters.",
    );
  return url.origin;
}
export type ApiTiming = {
  token_ms: number;
  request_ms: number;
  server_timing: string | null;
};
export function createApi(
  base: string,
  getToken: () => Promise<string | null>,
  fetcher: typeof fetch = fetch,
  onTiming?: (timing: ApiTiming) => void,
): Api {
  return async <T>(path: string, body?: unknown, signal?: AbortSignal) => {
    if (!path.startsWith("/api/")) throw new Error("Invalid Knightly API path");
    const tokenStart = performance.now();
    const token = await getToken();
    const tokenMs = performance.now() - tokenStart;
    if (!token)
      throw new Error("Sign in to Knightly before accessing your data.");
    const requestStart = performance.now();
    let serverTiming: string | null = null;
    try {
      const response = await request(
        `${base}${path}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal,
        },
        fetcher,
      );
      serverTiming = response.headers.get("Server-Timing");
      if (!response.ok) {
        if (response.status === 401)
          throw new Error(
            "Your session wasn't accepted. Sign out and sign in again. The server may need native-app authentication enabled.",
          );
        let detail = "";
        try {
          const value = await response.json();
          if (typeof value.detail === "string") detail = value.detail;
        } catch {
          /* Non-JSON error page. */
        }
        throw new Error(
          detail ||
            `Knightly couldn't complete the request (${response.status}). Try again.`,
        );
      }
      return (await response.json()) as T;
    } finally {
      if (path === "/api/deck/answer" && onTiming) {
        try {
          onTiming({
            token_ms: tokenMs,
            request_ms: performance.now() - requestStart,
            server_timing: serverTiming,
          });
        } catch {
          /* Diagnostics must never change the save result. */
        }
      }
    }
  };
}

/** Use a plain AbortController: Expo Go doesn't need browser-only AbortSignal helpers. */
export async function request(
  url: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
) {
  const controller = new AbortController();
  const parent = init.signal;
  const cancel = () => controller.abort();
  if (parent?.aborted) cancel();
  else parent?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 20000);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", cancel);
  }
}
