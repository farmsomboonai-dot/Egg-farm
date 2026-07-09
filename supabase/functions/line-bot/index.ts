// ============================================================================
//  ฟาร์มไข่สมบูรณ์ (SJF Farm) — LINE relay + webhook (Supabase Edge Function)
//  บทบาท 2 อย่างในฟังก์ชันเดียว:
//    1) Webhook : LINE เรียกเข้ามา → ตรวจลายเซ็น → จำ "ปลายทาง" (กลุ่ม/ห้อง/ผู้ใช้)
//                 ที่บอทถูกเพิ่มเข้าไป (เก็บลง table line_config) + ตอบยืนยัน
//    2) Push    : แอปเรียกเข้ามา {action:"push", text, key} → ยิงข้อความไปปลายทางที่จำไว้
//
//  ตั้งค่า Secrets  (Supabase → Edge Functions → Manage secrets):
//    LINE_CHANNEL_ACCESS_TOKEN   Messaging API → Channel access token (long-lived)
//    LINE_CHANNEL_SECRET         Basic settings → Channel secret
//    FARM_KEY                    รหัสลับสั้น ๆ ที่ตั้งเอง (กันคนอื่นยิงข้อความมั่ว)
//  (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY มีให้อัตโนมัติในฟังก์ชัน)
//
//  ⚠️ deploy ด้วย verify_jwt = FALSE  (เราคุมเองด้วยลายเซ็น LINE + FARM_KEY แล้ว)
//  ดูขั้นตอนตั้งค่าทั้งหมดที่ supabase/LINE-SETUP.md
// ============================================================================

const TOKEN    = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const SECRET   = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";
const FARM_KEY = Deno.env.get("FARM_KEY") ?? "";
const SB_URL   = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SR    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---- เก็บ/อ่าน ปลายทางล่าสุด ใน table line_config (id='default') ----
async function saveTarget(type: string, id: string) {
  await fetch(`${SB_URL}/rest/v1/line_config?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: SB_SR, Authorization: `Bearer ${SB_SR}`,
      "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ id: "default", target_type: type, target_id: id, updated_at: new Date().toISOString() }),
  });
}
async function loadTarget(): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/line_config?id=eq.default&select=target_id`, {
    headers: { apikey: SB_SR, Authorization: `Bearer ${SB_SR}` },
  });
  const rows = await r.json().catch(() => []);
  return rows?.[0]?.target_id ?? null;
}

// ---- LINE Messaging API ----
async function linePush(to: string, text: string) {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  });
  return r.ok ? null : `LINE push ${r.status}: ${await r.text()}`;
}
async function lineReply(replyToken: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

// ---- ตรวจลายเซ็น webhook (X-Line-Signature = Base64(HMAC-SHA256(secret, body))) ----
async function validSignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature || !SECRET) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return b64 === signature;
}

function targetOf(src: any): { type: string; id: string } | null {
  if (!src) return null;
  if (src.type === "group" && src.groupId) return { type: "group", id: src.groupId };
  if (src.type === "room"  && src.roomId)  return { type: "room",  id: src.roomId };
  if (src.userId) return { type: "user", id: src.userId };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET")     return json({ ok: true, service: "line-bot" });

  const raw = await req.text();
  let payload: any = null;
  try { payload = JSON.parse(raw); } catch { payload = null; }

  // ---- 1) แอปสั่งส่งข้อความ (มี field action:"push") ----
  if (payload && payload.action === "push") {
    if (!FARM_KEY || payload.key !== FARM_KEY) return json({ ok: false, error: "unauthorized" }, 401);
    const text = String(payload.text ?? "").trim();
    if (!text) return json({ ok: false, error: "empty text" }, 400);
    const to = payload.target || (await loadTarget());
    if (!to) return json({ ok: false, error: "ยังไม่มีปลายทาง — เพิ่มบอทเข้ากลุ่ม/ทักบอทก่อน" }, 400);
    const err = await linePush(to, text);
    return err ? json({ ok: false, error: err }, 502) : json({ ok: true, to });
  }

  // ---- 2) LINE webhook (มี events[]) ----
  if (payload && Array.isArray(payload.events)) {
    const sig = req.headers.get("x-line-signature");
    if (!(await validSignature(raw, sig))) return json({ ok: false, error: "bad signature" }, 401);
    for (const ev of payload.events) {
      const tgt = targetOf(ev.source);
      if (tgt) await saveTarget(tgt.type, tgt.id);
      if ((ev.type === "message" || ev.type === "join" || ev.type === "follow") && ev.replyToken) {
        const where = tgt?.type === "group" ? "กลุ่มนี้" : tgt?.type === "room" ? "ห้องนี้" : "แชทนี้";
        await lineReply(ev.replyToken, `✅ เชื่อมต่อฟาร์มไข่สมบูรณ์แล้ว\nจะส่งสรุปประจำวัน/แจ้งเตือนงานมาที่${where}`);
      }
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "unknown request" }, 400);
});
