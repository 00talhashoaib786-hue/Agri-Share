/*
  Agri-Share Kisan Advisor: server-side Gemini proxy (Vercel Serverless Function).
  The API key stays on the server, so it is never shipped in the public JavaScript bundle.

  Vercel > Project > Settings > Environment Variables:
    GEMINI_API_KEY   your key from https://aistudio.google.com/apikey   (required)
    GEMINI_MODEL     optional, default "gemini-2.5-flash"

  GET  /api/gemini  -> { ok: true, configured: boolean, model }   (health check, no Gemini call)
  POST /api/gemini  { system, contents, voice, json } -> { ok: true, text } or { ok: false, error }
    contents may include one voice clip: { inlineData: { mimeType: "audio/wav", data: "<base64>" } }
    json: true returns structured JSON text: { "heard": "...", "reply": "..." }
*/
const MAX_TURNS = 24;
const MAX_CHARS = 60000;            // text in the conversation
const MAX_AUDIO_B64 = 1_400_000;    // the app sends at most ~15 s of 16 kHz mono WAV (~640 KB base64); generous headroom
const AUDIO_TYPES = /^audio\/(wav|x-wav|wave|mp3|mpeg|aiff|aac|ogg|flac|webm|mp4|m4a|x-m4a)$/;
const GEMINI_TIMEOUT_MS = 25000;

// Vercel may hand the body over as an object, a string or a Buffer depending on headers
async function readBody(req) {
  let b = req.body;
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
  const key = process.env.GEMINI_API_KEY || "";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") return res.status(200).json({ ok: true, configured: !!key, model });
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: String(system) }] } } : {}),
        contents,
        generationConfig: {
          temperature: voice ? 0.6 : 0.45,
          maxOutputTokens: voice ? 400 : 900,
          ...(json ? { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { heard: { type: "STRING" }, reply: { type: "STRING" } }, required: ["heard", "reply"] } } : {}),
          // 2.5 Flash "thinking" would otherwise use up the output budget and return an empty answer
          ...(/2\.5/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return fail(res, r.status, `Gemini ${r.status}: ${(data.error && data.error.message) || "request rejected"}`);
    const cand = data.candidates && data.candidates[0];
    const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("").trim();
    if (!text) return fail(res, 502, `Gemini returned no text (${(cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || "no candidates"})`);
    return res.status(200).json({ ok: true, text, model });
  } catch (e) {
    return fail(res, 504, e && e.name === "AbortError" ? `Gemini did not answer within ${GEMINI_TIMEOUT_MS / 1000} s` : `Gemini unreachable: ${e && e.message ? e.message : e}`);
  } finally {
    clearTimeout(timer);
  }
}
