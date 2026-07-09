# ตั้งค่าแจ้งเตือน/สรุปเข้า LINE — ฟาร์มไข่สมบูรณ์ (SJF Farm)

ระบบส่ง **สรุปประจำวัน** และ **แจ้งเตือนงานไม่ครบก่อน 19:00** เข้ากลุ่ม LINE ของฟาร์ม

> เว็บส่งเข้า LINE ตรง ๆ ไม่ได้ (ติด CORS + โทเคนเป็นความลับ ห้ามอยู่ในโค้ดเว็บ)
> จึงต้องมี **ตัวกลางเล็ก ๆ 1 ตัว** = Supabase Edge Function ชื่อ `line-bot` (โค้ดอยู่ในโปรเจกต์แล้ว)

ทำ **ครั้งเดียว** ตามนี้ (ประมาณ 15–20 นาที):

---

## ขั้นที่ 1 — สร้าง LINE Official Account (บอทฟาร์ม) ฟรี
1. ไป https://developers.line.biz/console/ → เข้าด้วยบัญชี LINE ของฟาร์ม
2. **Create a new provider** → ตั้งชื่อ เช่น `SJF Farm`
3. ในผู้ให้บริการนั้น → **Create a Messaging API channel**
   - ชื่อช่อง เช่น `ฟาร์มไข่สมบูรณ์แจ้งเตือน` · เลือกหมวด/ภูมิภาคไทย
4. เปิดแท็บ **Messaging API** ของช่องที่สร้าง แล้วจดค่า 2 อย่าง:
   - **Channel access token (long-lived)** → กด *Issue* แล้วคัดลอก  → `LINE_CHANNEL_ACCESS_TOKEN`
   - (แท็บ **Basic settings**) **Channel secret** → `LINE_CHANNEL_SECRET`
5. ในแท็บ Messaging API → **ปิด** "Auto-reply messages" และ "Greeting messages" (ไม่งั้นบอทตอบรก)
   และ **เปิด** "Allow bot to join group chats"

> ⚠️ Channel access token เป็น **ความลับ** เหมือน service_role — อย่าวางในโค้ดเว็บ/อย่า commit
> เราจะเก็บมันไว้ใน **Supabase Secrets** (ฝั่งเซิร์ฟเวอร์) เท่านั้น

---

## ขั้นที่ 2 — สร้างตารางเก็บปลายทาง
Supabase Dashboard → **SQL Editor** → New query → วางไฟล์ [`migrate-003-line.sql`](migrate-003-line.sql) → **Run**

---

## ขั้นที่ 3 — Deploy ฟังก์ชัน `line-bot`
**วิธีง่าย (ไม่ต้องลง Node):** Supabase Dashboard → **Edge Functions** → **Deploy a new function** (ตัวแก้ในเว็บ)
1. ตั้งชื่อฟังก์ชัน: `line-bot`
2. วางเนื้อหาทั้งหมดจาก [`functions/line-bot/index.ts`](functions/line-bot/index.ts)
3. **สำคัญ:** ตั้ง **Verify JWT = OFF** (ปิด) — เพราะ LINE และแอปเรียกเข้ามาโดยไม่มี JWT
4. กด Deploy

จากนั้นตั้ง **Secrets** (Edge Functions → Manage secrets → Add):
| Name | ค่า |
|------|-----|
| `LINE_CHANNEL_ACCESS_TOKEN` | โทเคนจากขั้นที่ 1 |
| `LINE_CHANNEL_SECRET` | channel secret จากขั้นที่ 1 |
| `FARM_KEY` | ตั้งรหัสลับสั้น ๆ เอง เช่น `sjf-2569-xyz` (จำไว้ ใช้ในขั้นที่ 5) |

> `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` มีให้อัตโนมัติ ไม่ต้องเพิ่ม

---

## ขั้นที่ 4 — ต่อ webhook + เพิ่มบอทเข้ากลุ่ม
1. URL ของฟังก์ชันคือ: `https://<PROJECT-REF>.functions.supabase.co/line-bot`
   (ของฟาร์มนี้ REF = `supxmkecvkwpkfhyxxip`)
2. กลับไป LINE Developers → แท็บ **Messaging API** → **Webhook URL** ใส่ URL ข้างบน → **Verify** (ควรได้ Success) → เปิด **Use webhook**
3. สแกน QR ของบอท (แท็บ Messaging API) เพิ่มเป็นเพื่อน แล้ว **เชิญบอทเข้ากลุ่ม LINE ของฟาร์ม**
4. พิมพ์อะไรก็ได้ในกลุ่ม 1 ครั้ง → บอทตอบ **"✅ เชื่อมต่อฟาร์มไข่สมบูรณ์แล้ว"**
   (ตอนนี้ระบบจำ groupId ของกลุ่มนั้นไว้แล้ว — สรุป/แจ้งเตือนจะส่งเข้ากลุ่มนี้)

---

## ขั้นที่ 5 — เปิดใช้ในแอป
แก้ไฟล์ `app/supabase-config.js` (ไฟล์นี้ถูก .gitignore อยู่แล้ว) เพิ่ม 2 บรรทัด:
```js
window.SB_FN_URL   = "https://supxmkecvkwpkfhyxxip.functions.supabase.co";
window.SB_FARM_KEY = "sjf-2569-xyz";   // ต้องตรงกับ FARM_KEY ในขั้นที่ 3
```
รีเฟรชแอป → หน้า **แดชบอร์ด** จะมีปุ่ม **📤 ส่งเข้า LINE เลย** ข้างปุ่มคัดลอก
- กดส่งสรุปประจำวันเข้ากลุ่มได้ทันที
- ถ้าเลย 19:00 แล้วงานยังไม่ครบ และมีคนเปิดหน้าแดชบอร์ด → ระบบ **ส่งแจ้งเตือนเข้ากลุ่มอัตโนมัติ** (วันละครั้ง)

---

## เฟส 2 — ส่งอัตโนมัติ 19:00 แม้ไม่เปิดคอม (ทำต่อทีหลัง)
ตอนนี้การส่งอัตโนมัติทำงานเมื่อ **มีคนเปิดแอป** เพราะข้อมูลผลผลิต/การเลี้ยงยังอยู่ในเครื่อง (localStorage)
ถ้าต้องการให้ **ยิงเองเวลา 19:00 ทุกวันแม้ไม่มีใครเปิดแอป** ต้อง:
1. ซิงก์ผลผลิต/การเลี้ยงขึ้น Supabase (ตาราง `production` มีอยู่แล้วใน schema — ต่อการบันทึกให้ push ขึ้นด้วย)
2. เพิ่มฟังก์ชัน `daily-check` + ตั้ง `pg_cron` เรียกทุกวัน 19:00 (ผ่าน `pg_net`) → เช็คครบ/ไม่ครบจาก DB → ส่ง LINE
บอกได้เมื่อพร้อมทำเฟสนี้
