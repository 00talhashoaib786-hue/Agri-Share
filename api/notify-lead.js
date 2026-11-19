/*
  Agri-Share: instant email alert for an unmatched farmer lead (no machine within 25-100 km).
  Vercel Serverless Function. Always answers JSON and never fails just because email isn't set up yet.

  Vercel > Project > Settings > Environment Variables (any ONE of these enables email):
    RESEND_API_KEY          https://resend.com  (optional RESEND_FROM, default "Agri-Share <onboarding@resend.dev>";
                            onboarding@resend.dev only delivers to the Resend account's own email until a domain is verified)
    WEB3FORMS_ACCESS_KEY    https://web3forms.com  (the access key is created for the receiving email address)
  LEAD_ALERT_EMAIL          optional, default the founder's address below

  POST /api/notify-lead  { farmerName, farmerPhone, farmerEmail, district, village, machineType, hours, offeredRate, radiusChecked, requestId, lang }
    -> { ok: true, sent: boolean, via: "resend" | "web3forms" | "none" }
*/
const FOUNDER_EMAIL = "00talhashoaib786@gmail.com";
const LIMITS = { farmerName: 80, farmerPhone: 20, farmerEmail: 120, district: 60, village: 80, machineType: 40, hours: 8, offeredRate: 12, radiusChecked: 10, requestId: 30, lang: 5 };

// best-effort throttle per IP inside one warm function instance (stops casual inbox flooding)
const recent = new Map();
const WINDOW_MS = 10 * 60 * 1000, MAX_PER_WINDOW = 5;
function throttled(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter((ts) => now - ts < WINDOW_MS);
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 500) recent.clear();
  return list.length > MAX_PER_WINDOW;
}

async function readBody(req) {
  let b;
  try { b = req.body; } catch (e) { return null; }
  if (b && typeof b === "object" && !Buffer.isBuffer(b)) return b;
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b === "string" && b.trim()) { try { return JSON.parse(b); } catch (e) { return null; } }
  try {
    const chunks = [];
    for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// Read a key from the environment: trims spaces/newlines and surrounding quotes (common copy-paste mistakes)
const envKey = (...names) => {
  for (const n of names) {
    const v = String(process.env[n] || "").trim().replace(/^["']+|["']+$/g, "").trim();
    if (v) return { value: v, source: n };
  }
  return { value: "", source: null };
};

const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const waLink = (phone) => {
  let d = String(phone || "").replace(/\D/g, "");
  if (/^03\d{9}$/.test(d)) d = "92" + d.slice(1);
  return d.length >= 10 ? `https://wa.me/${d}` : "";
};

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") { res.setHeader("Allow", "POST, OPTIONS"); return res.status(204).end(); }
    const w3 = envKey("WEB3FORMS_ACCESS_KEY", "VITE_WEB3FORMS_ACCESS_KEY");
    const resend = envKey("RESEND_API_KEY");
    // diagnostics only (never the key itself): open /api/notify-lead on the live site to check
    if (req.method === "GET") return res.status(200).json({
      ok: true,
      hasWeb3FormsKey: Boolean(w3.value),
      web3FormsKeySource: w3.source,
      hasResendKey: Boolean(resend.value),
      email: resend.value ? "resend" : w3.value ? "web3forms" : "none",
      vercelEnv: process.env.VERCEL_ENV || "unknown", // production / preview / development: env vars are set per environment
    });
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const body = await readBody(req);
    if (!body || typeof body !== "object") return res.status(400).json({ ok: false, error: "Request body is not valid JSON" });
    const lead = {};
    for (const [k, max] of Object.entries(LIMITS)) lead[k] = String(body[k] == null ? "" : body[k]).trim().slice(0, max);
    if (!lead.farmerPhone && !lead.farmerEmail) return res.status(400).json({ ok: false, error: "A phone number or email is required" });

    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    if (throttled(ip)) return res.status(429).json({ ok: false, error: "Too many alerts, please wait a few minutes" });

    const to = process.env.LEAD_ALERT_EMAIL || FOUNDER_EMAIL;
    const subject = `Unmatched farmer lead: ${lead.machineType || "machine"} in ${lead.district || "unknown district"} (no owner within ${lead.radiusChecked || "100"} km)`;
    const rows = [
      ["Farmer", lead.farmerName], ["Phone", lead.farmerPhone], ["Email", lead.farmerEmail],
      ["District", lead.district], ["Village", lead.village], ["Machine needed", lead.machineType],
      ["Hours", lead.hours], ["Offered rate (PKR/hr)", lead.offeredRate], ["Radius checked (km)", lead.radiusChecked], ["Request ID", lead.requestId],
    ].filter(([, v]) => v);
    const text = `No registered machine was available for this farmer.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nCall: ${lead.farmerPhone || "-"}  WhatsApp: ${waLink(lead.farmerPhone) || "-"}\nAlso saved in the Admin Panel under "Urgent Unmatched Farmer Leads".`;
    const html = `<h2 style="font-family:sans-serif;color:#145A32">Urgent: unmatched farmer lead</h2>
<p style="font-family:sans-serif">No registered machine was available within ${esc(lead.radiusChecked || "100")} km. Please arrange one from the offline network.</p>
<table style="font-family:sans-serif;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5C3A21"><b>${esc(k)}</b></td><td style="padding:4px 0">${esc(v)}</td></tr>`).join("")}</table>
${lead.farmerPhone ? `<p style="font-family:sans-serif"><a href="tel:${esc(lead.farmerPhone)}">Call farmer</a>${waLink(lead.farmerPhone) ? ` &middot; <a href="${waLink(lead.farmerPhone)}">WhatsApp farmer</a>` : ""}</p>` : ""}`;

    const reasons = []; // why email was not sent (returned to the app and logged; never contains a key)
    if (resend.value) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resend.value}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.RESEND_FROM || "Agri-Share <onboarding@resend.dev>", to: [to], subject, html, text, ...(lead.farmerEmail ? { reply_to: lead.farmerEmail } : {}) }),
      });
      if (r.ok) return res.status(200).json({ ok: true, sent: true, via: "resend" });
      const err = await r.json().catch(() => ({}));
      const why = `resend HTTP ${r.status}: ${(err && (err.message || err.name)) || "rejected"}`;
      reasons.push(why); console.error("[api/notify-lead] Resend failed:", why);
    }
    if (w3.value) {
      try {
        const r = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Agri-Share-Lead-Alerts/1.0" },
          body: JSON.stringify({ access_key: w3.value, subject, from_name: "Agri-Share Leads", message: text, ...(lead.farmerEmail ? { replyto: lead.farmerEmail } : {}) }),
        });
        const raw = await r.text();
        let j = {}; try { j = JSON.parse(raw); } catch (e) { j = { message: `non-JSON reply: ${raw.replace(/\s+/g, " ").slice(0, 120)}` }; }
        if (r.ok && j.success !== false) return res.status(200).json({ ok: true, sent: true, via: "web3forms" });
        const why = `web3forms HTTP ${r.status}: ${j.message || "rejected"}`;
        reasons.push(why); console.error("[api/notify-lead] Web3Forms failed:", why);
      } catch (e) {
        const why = `web3forms unreachable: ${e && e.message ? e.message : e}`;
        reasons.push(why); console.error("[api/notify-lead]", why);
      }
    } else {
      const why = "no Web3Forms key in this deployment (WEB3FORMS_ACCESS_KEY empty or not set for this environment; redeploy after adding it)";
      reasons.push(why); console.warn("[api/notify-lead] Web3Forms skipped:", why, "| VERCEL_ENV =", process.env.VERCEL_ENV || "unknown");
    }
    // no email sent: the lead is still saved in Firestore by the app; "reason" says why
    return res.status(200).json({ ok: true, sent: false, via: "none", reason: reasons.join(" | ") });
  } catch (err) {
    console.error("[api/notify-lead] unexpected error:", err);
    try { if (!res.headersSent) return res.status(200).json({ ok: true, sent: false, via: "none", note: "email step failed" }); } catch (e) { /* gone */ }
  }
}
