/*
  Agri-Share Kisan Advisor: server-side Gemini proxy (Vercel Serverless Function).
  The API key stays on the server, so it is never shipped in the public JavaScript bundle.

  Vercel > Project > Settings > Environment Variables:
    GEMINI_API_KEY   your key from https://aistudio.google.com/apikey   (required)
    GEMINI_MODEL               optional, first model to try (default "gemini-3.5-flash")
    GEMINI_FALLBACK_MODELS     optional, comma-separated fallback chain

  GET  /api/gemini  -> { ok: true, configured: boolean, model }   (health check, no Gemini call)
  POST /api/gemini  { system, contents, voice, json } -> { ok: true, text, model } or { ok: false, error, busy }
    Model chain: GEMINI_MODEL, then gemini-3.5-flash -> gemini-3.5-flash-lite -> gemini-flash-latest (4.5 s each)
    on 503 / 429 / 404 from Google. busy: true means every model was temporarily unavailable.
    contents may include one voice clip: { inlineData: { mimeType: "audio/wav", data: "<base64>" } }
    json: true returns structured JSON text: { "heard": "...", "reply": "..." }
*/
const MAX_TURNS = 24;
const MAX_CHARS = 60000;            // text in the conversation
const MAX_AUDIO_B64 = 1_400_000;    // the app sends at most ~15 s of 16 kHz mono WAV (~640 KB base64); generous headroom
const AUDIO_TYPES = /^audio\/(wav|x-wav|wave|mp3|mpeg|aiff|aac|ogg|flac|webm|mp4|m4a|x-m4a)$/;
const DEADLINE_MS = 20000;          // whole request, all models included (vercel.json allows 30 s)
const PER_MODEL_MS = 4500;          // a busy model fails over fast instead of eating the whole budget
// Tried in order after GEMINI_MODEL when Google answers 503 (busy), 429 (rate limit), 404 (retired model) or is slow.
// Override without a redeploy of code: GEMINI_FALLBACK_MODELS="model-a,model-b" in Vercel.
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-flash-latest")
  .split(",").map((m) => m.trim()).filter(Boolean);
const RETRY_STATUS = new Set([503, 429, 404]);

// Vercel may hand the body over as an object, a string, a Buffer, or not parse it at all.
// Its req.body getter can also THROW on malformed input, so every access is guarded.
async function readBody(req) {
  let b;
  try { b = req.body; } catch (e) { return null; }
  if (b && typeof b === "object" && !Buffer.isBuffer(b)) return b;
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b === "string" && b.trim()) { try { return JSON.parse(b); } catch (e) { return null; } }
  // body not parsed yet: read the raw stream
  try {
    const chunks = [];
    for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
const fail = (res, status, error) => res.status(status).json({ ok: false, error });

export default async function handler(req, res) {
  // Whatever happens, answer with JSON: an uncaught error would make Vercel serve its HTML error page
  try {
    return await handle(req, res);
  } catch (err) {
    console.error("[api/gemini] unexpected error:", err);
    try { if (!res.headersSent) return res.status(500).json({ ok: false, error: `Server error: ${err && err.message ? err.message : String(err)}` }); } catch (e) { /* response already gone */ }
  }
}

async function handle(req, res) {
  const key = process.env.GEMINI_API_KEY || "";
  const model = process.env.GEMINI_MODEL || FALLBACK_MODELS[0] || "gemini-flash-latest";
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // Preflight: the app calls this route from the same origin, so no cross-site access is granted
  // (a wildcard CORS header would let any website spend this project's Gemini quota)
  if (req.method === "OPTIONS") { res.setHeader("Allow", "GET, POST, OPTIONS"); return res.status(204).end(); }
  if (req.method === "GET") return res.status(200).json({ ok: true, configured: !!key, model });
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST, OPTIONS"); return fail(res, 405, "Method not allowed"); }
  if (!key) return fail(res, 503, "GEMINI_API_KEY is not set on the server");

  const body = await readBody(req);
  if (!body) return fail(res, 400, "Request body is not valid JSON");
  const { system, contents, voice, json } = body;
  if (!Array.isArray(contents) || !contents.length || contents.length > MAX_TURNS) return fail(res, 400, "Invalid conversation");
  let textSize = String(system || "").length, audioSize = 0, clips = 0;
  for (const turn of contents) {
    if (!turn || !Array.isArray(turn.parts) || !["user", "model"].includes(turn.role)) return fail(res, 400, "Invalid conversation turn");
    for (const part of turn.parts) {
      if (part && typeof part.text === "string") textSize += part.text.length;
      else if (part && part.inlineData && AUDIO_TYPES.test(String(part.inlineData.mimeType)) && typeof part.inlineData.data === "string") { audioSize += part.inlineData.data.length; clips += 1; }
      else return fail(res, 400, `Unsupported part (audio type "${part && part.inlineData ? part.inlineData.mimeType : "none"}")`);
    }
  }
  if (textSize > MAX_CHARS) return fail(res, 413, "Conversation too long");
  if (clips > 1 || audioSize > MAX_AUDIO_B64) return fail(res, 413, `Voice message too large (${Math.round(audioSize / 1024)} KB)`);
  // normalise audio types Gemini documents (WAV / MP3 / AAC / OGG ...); m4a and mp4 audio are AAC
  for (const turn of contents) for (const part of turn.parts) if (part.inlineData) {
    const m = String(part.inlineData.mimeType).toLowerCase();
    part.inlineData.mimeType = /wav|wave/.test(m) ? "audio/wav" : /m4a|mp4|aac/.test(m) ? "audio/aac" : /mpeg|mp3/.test(m) ? "audio/mp3" : m;
  }

  const models = [...new Set([model, ...FALLBACK_MODELS])];
  const startedAt = Date.now();
  const tried = [];
  let last = { status: 502, error: "Gemini did not answer" };
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const remaining = DEADLINE_MS - (Date.now() - startedAt);
    if (remaining < 1500) break;
    // 4.5 s per model; the last model in the chain may use what is left so a long answer can still finish
    const isLast = i === models.length - 1;
    const opts = { system, contents, voice, json };
    let r = await callGemini(key, m, opts, isLast ? remaining : Math.min(PER_MODEL_MS, remaining));
    // HTTP 400 on the full request (unsupported thinkingConfig / responseSchema): one retry with the minimal request
    if (r.status === 400 && !r.minimal) r = await callGemini(key, m, opts, isLast ? DEADLINE_MS - (Date.now() - startedAt) : Math.min(PER_MODEL_MS, DEADLINE_MS - (Date.now() - startedAt)), true);
    if (r.ok) return res.status(200).json({ ok: true, text: r.text, model: m, ...(tried.length ? { fallbackFrom: tried } : {}) });
    tried.push(`${m}: ${r.status}`);
    last = r;
    if (!(RETRY_STATUS.has(r.status) || r.status === 504)) break; // a real error (bad key, bad request): don't hide it
    console.warn(`[api/gemini] ${m} answered ${r.status}, trying the next model`);
  }
  const busy = tried.length > 0 && tried.every((x) => /: (503|429|404|504)$/.test(x));
  return res.status(last.status || 502).json({ ok: false, busy, error: busy ? `All Gemini models busy (${tried.join(", ")})` : last.error, tried });
}

// Models that reject extra generation fields (thinkingConfig, responseSchema) with HTTP 400 get a minimal request
const MINIMAL_MODELS = /flash-lite|flash-latest/;
function buildRequest(model, { system, contents, voice, json }, minimal) {
  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: String(system) }] };
  if (minimal) {
    // only standard fields; JSON shape for voice turns is requested in the system instruction instead
    body.generationConfig = { maxOutputTokens: 220, temperature: 0.4 };
  } else {
    body.generationConfig = {
      temperature: voice ? 0.6 : 0.45,
      maxOutputTokens: voice ? 400 : 900,
      ...(json ? { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { heard: { type: "STRING" }, reply: { type: "STRING" } }, required: ["heard", "reply"] } } : {}),
      // no "thinking" for flash models: fast voice replies, and the output budget is not used up
      ...(/flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    };
  }
  return body;
}

async function callGemini(key, model, opts, timeoutMs, forceMinimal = false) {
  const minimal = forceMinimal || MINIMAL_MODELS.test(model);
  const reqBody = buildRequest(model, opts, minimal);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs));
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(reqBody),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error(`[api/gemini] ${model} HTTP ${r.status} (${minimal ? "minimal" : "full"} request). Request keys: ${Object.keys(reqBody).join(", ")}; generationConfig keys: ${Object.keys(reqBody.generationConfig || {}).join(", ")}. Google said: ${(data.error && data.error.message) || "-"}`);
      return { ok: false, status: r.status, minimal, error: `Gemini ${r.status} (${model}): ${(data.error && data.error.message) || "request rejected"}` };
    }
    const cand = data.candidates && data.candidates[0];
    const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("").trim();
    if (!text) return { ok: false, status: 502, error: `Gemini returned no text (${model}: ${(cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || "no candidates"})` };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, status: 504, error: e && e.name === "AbortError" ? `Gemini (${model}) did not answer in time` : `Gemini unreachable: ${e && e.message ? e.message : e}` };
  } finally {
    clearTimeout(timer);
  }
}
