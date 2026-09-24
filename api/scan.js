"use strict";
// Paper scan: the browser sends one photo (or small PDF) of a paper; a vision model reads it and we return
// clean, validated records. Nothing is saved here: the administrator reviews the result and saves it from the app.
// Needs the ANTHROPIC_API_KEY environment variable (optional SCAN_MODEL, SCAN_HOURLY_LIMIT).
const A = require("./_lib/auth");
const L = require("./_lib/scanlib");

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_B64 = 3600000; // ~2.7 MB of binary; Vercel refuses request bodies above 4.5 MB
const KINDS = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "document",
};

function send(res, status, error, code) {
  res.status(status).json({ error: error, code: code });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      send(res, 405, "Method not allowed", "method");
      return;
    }
    const session = await A.requireAuth(req, res, ["admin"]);
    if (!session) return;

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      send(res, 503, "Skane a poko aktive: mete ANTHROPIC_API_KEY nan Vercel (gade DEPLOY.md).", "scan_not_configured");
      return;
    }

    const body = A.parseBody(req);
    const mime = typeof body.mime === "string" ? body.mime : "";
    const data = typeof body.image === "string" ? body.image : "";
    if (!KINDS[mime]) {
      send(res, 400, "Fòma fichye a pa sipòte (JPG, PNG, WEBP oswa PDF).", "invalid");
      return;
    }
    if (!data || data.length > MAX_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      send(res, 400, "Foto a pa valid oswa li twò gwo.", "invalid");
      return;
    }

    const limit = Number(process.env.SCAN_HOURLY_LIMIT) || 60;
    const n = await A.bump("dl:rl:scan:" + session.username, 3600);
    if (n > limit) {
      send(res, 429, "Twòp skane nan yon èdtan. Eseye pita.", "rate_limited");
      return;
    }

    const block = { type: KINDS[mime], source: { type: "base64", media_type: mime, data: data } };
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 55000);
    let r;
    try {
      r = await fetch(API_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: process.env.SCAN_MODEL || DEFAULT_MODEL,
          max_tokens: 4096,
          system: L.SYSTEM_PROMPT,
          messages: [{ role: "user", content: [block, { type: "text", text: L.userPrompt(new Date().toISOString().slice(0, 10)) }] }],
        }),
      });
    } catch (e) {
      send(res, 504, e && e.name === "AbortError" ? "Lekti papye a pran twò lontan. Eseye ankò." : "Pa ka rive nan sèvis skane a. Eseye ankò.", "scan_unreachable");
      return;
    } finally {
      clearTimeout(timer);
    }

    if (!r.ok) {
      console.error("scan upstream status:", r.status);
      if (r.status === 401 || r.status === 403) send(res, 502, "Kle API skane a pa bon. Verifye ANTHROPIC_API_KEY.", "scan_bad_key");
      else if (r.status === 429 || r.status === 529) send(res, 503, "Sèvis skane a okipe. Eseye ankò nan yon ti moman.", "scan_busy");
      else send(res, 502, "Sèvis skane a pa reponn kòrèkteman.", "scan_upstream");
      return;
    }

    const out = await r.json();
    if (out && out.stop_reason === "max_tokens") {
      send(res, 422, "Papye a gen twòp kontenè pou yon sèl skane. Skane l an plizyè foto.", "scan_too_long");
      return;
    }
    const text = ((out && out.content) || []).filter(function (b) { return b && b.type === "text"; }).map(function (b) { return b.text; }).join("\n");
    let parsed;
    try {
      parsed = L.toRecords(L.parseModelText(text));
    } catch (e) {
      send(res, 422, "Pa t kapab li papye a. Eseye ankò ak yon foto ki pi klè.", "scan_unreadable");
      return;
    }

    await A.audit(req, "scan", { records: parsed.records.length, mime: mime, kb: Math.round(data.length * 0.75 / 1024) }, session);
    res.status(200).json({ ok: true, docType: parsed.docType, notes: parsed.notes, records: parsed.records });
  } catch (err) {
    console.error("scan error:", err && err.message);
    send(res, 500, "Erè sèvè. Eseye ankò.", "server_error");
  }
};
