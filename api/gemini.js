/*
  Agri-Share Kisan Advisor: server-side Gemini proxy (Vercel Serverless Function).
  The API key stays on the server, so it is never shipped in the public JavaScript bundle.

  Vercel > Project > Settings > Environment Variables:
    GEMINI_API_KEY   your key from https://aistudio.google.com/apikey   (required)
    GEMINI_MODEL     optional, default "gemini-2.5-flash"

  GET  /api/gemini  -> { ok: true, configured: boolean, model }   (health check, no Gemini call)
  POST /api/gemini  { system, contents, voice } -> { text } or { error }
*/
const MAX_TURNS = 24;
const MAX_CHARS = 60000;

export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY || "";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") return res.status(200).json({ ok: true, configured: !!key, model });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!key) return res.status(503).json({ error: "GEMINI_API_KEY is not set on the server" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const { system, contents, voice } = body || {};
  if (!Array.isArray(contents) || !contents.length || contents.length > MAX_TURNS) return res.status(400).json({ error: "Invalid conversation" });
  const size = JSON.stringify(contents).length + String(system || "").length;
  if (size > MAX_CHARS) return res.status(413).json({ error: "Conversation too long" });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: String(system) }] } } : {}),
        contents,
        generationConfig: {
          temperature: voice ? 0.6 : 0.45,
          maxOutputTokens: voice ? 300 : 900,
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
