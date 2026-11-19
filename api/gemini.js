/*
  Agri-Share Kisan Advisor: server-side Gemini proxy (Vercel Serverless Function).
  The API key stays on the server, so it is never shipped in the public JavaScript bundle.

  Vercel > Project > Settings > Environment Variables:
    GEMINI_API_KEY   your key from https://aistudio.google.com/apikey   (required)
    GEMINI_MODEL     optional, default "gemini-2.5-flash"

  GET  /api/gemini  -> { ok: true, configured: boolean, model }   (health check, no Gemini call)
  POST /api/gemini  { system, contents, voice, json } -> { text } or { error }
    contents may include one voice clip: { inlineData: { mimeType: "audio/wav", data: "<base64>" } }
    json: true returns structured JSON text: { "heard": "...", "reply": "..." }
*/
const MAX_TURNS = 24;
const MAX_CHARS = 60000;            // text in the conversation
const MAX_AUDIO_B64 = 3_500_000;    // about 80 s of 16 kHz mono WAV, under Vercel's 4.5 MB body limit
const AUDIO_TYPES = /^audio\/(wav|x-wav|mp3|mpeg|aiff|aac|ogg|flac|webm|mp4)$/;

export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY || "";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") return res.status(200).json({ ok: true, configured: !!key, model });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!key) return res.status(503).json({ error: "GEMINI_API_KEY is not set on the server" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const { system, contents, voice, json } = body || {};
  if (!Array.isArray(contents) || !contents.length || contents.length > MAX_TURNS) return res.status(400).json({ error: "Invalid conversation" });
  let textSize = String(system || "").length, audioSize = 0, clips = 0;
  for (const turn of contents) {
    if (!turn || !Array.isArray(turn.parts) || !["user", "model"].includes(turn.role)) return res.status(400).json({ error: "Invalid conversation turn" });
    for (const part of turn.parts) {
      if (part && typeof part.text === "string") textSize += part.text.length;
      else if (part && part.inlineData && AUDIO_TYPES.test(String(part.inlineData.mimeType)) && typeof part.inlineData.data === "string") { audioSize += part.inlineData.data.length; clips += 1; }
      else return res.status(400).json({ error: "Only text and audio parts are allowed" });
    }
  }
  if (textSize > MAX_CHARS) return res.status(413).json({ error: "Conversation too long" });
  if (clips > 1 || audioSize > MAX_AUDIO_B64) return res.status(413).json({ error: "Voice message too long" });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
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
    if (!r.ok) return res.status(r.status).json({ error: (data.error && data.error.message) || `Gemini HTTP ${r.status}` });
    const cand = data.candidates && data.candidates[0];
    const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("").trim();
    if (!text) return res.status(502).json({ error: `Empty answer (${(cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || "no candidates"})` });
    return res.status(200).json({ text, model });
  } catch (e) {
    return res.status(502).json({ error: `Gemini unreachable: ${e && e.message ? e.message : e}` });
  }
}
