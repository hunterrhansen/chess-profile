import test from "node:test";
import assert from "node:assert/strict";
import { createApi, serverUrl } from "../src/lib/api.ts";
test("host config accepts HTTPS but never URLs containing credentials", () => {
  assert.equal(
    serverUrl("https://knightly.example/"),
    "https://knightly.example",
  );
  for (const url of [
    "http://knightly.example",
    "https://user:pass@knightly.example",
    "https://knightly.example?token=abc",
  ])
    assert.throws(() => serverUrl(url));
});
test("API sends a fresh session token and the server grading contract", async () => {
  let seen;
  const api = createApi(
    "https://knightly.example",
    async () => "session-token",
    async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ correct: true }), { status: 200 });
    },
  );
  const body = {
    game_id: 7,
    ply: 9,
    uci: "e1e8",
    hinted: true,
    redo: true,
    seconds: 4,
  };
  assert.deepEqual(await api("/api/deck/answer", body), { correct: true });
  assert.equal(seen.url, "https://knightly.example/api/deck/answer");
  assert.equal(seen.init.headers.Authorization, "Bearer session-token");
  assert.equal(seen.init.method, "POST");
  assert.deepEqual(JSON.parse(seen.init.body), body);
});
test("signed-out requests never reach the server", async () => {
  let called = false;
  const api = createApi(
    "https://knightly.example",
    async () => null,
    async () => {
      called = true;
      return new Response();
    },
  );
  await assert.rejects(api("/api/deck"), /Sign in/);
  assert.equal(called, false);
});
test("session rejection is actionable and does not expose raw response content", async () => {
  const api = createApi(
    "https://knightly.example",
    async () => "token",
    async () => new Response("private diagnostics", { status: 401 }),
  );
  await assert.rejects(api("/api/deck"), /Sign out and sign in/);
});
test("an aborted screen request propagates cancellation to fetch", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const api = createApi(
    "https://knightly.example",
    async () => "token",
    async (url, init) => {
      assert.equal(init.signal.aborted, true);
      throw new DOMException("aborted", "AbortError");
    },
  );
  await assert.rejects(api("/api/deck", undefined, ctrl.signal), {
    name: "AbortError",
  });
});
test('answer timings separate token and network waits without exposing credentials', async () => {
  let sample;
  const api = createApi('https://knightly.example', async () => 'private-token',
    async () => new Response(JSON.stringify({correct:true}), {headers:{'Server-Timing':'engine_search;dur=300'}}),
    timing => { sample = timing; });
  await api('/api/deck/answer', {uci:'e2e4', game_id:7});
  assert.ok(sample.token_ms >= 0);
  assert.ok(sample.request_ms >= 0);
  assert.equal(sample.server_timing, 'engine_search;dur=300');
  assert.equal(JSON.stringify(sample).includes('private-token'), false);
  assert.equal(JSON.stringify(sample).includes('e2e4'), false);
});
