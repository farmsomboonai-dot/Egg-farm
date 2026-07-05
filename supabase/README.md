# Supabase — ขั้นตอนตั้งค่า (ระบบขายไข่ SJF Farm)

แอปนี้รันแบบ **ไม่มี build** (CDN) จึงต่อ Supabase ผ่าน JS client ทาง CDN ได้เลย ไม่ต้องลง Node

## 1) สร้างโปรเจกต์
1. ไป https://supabase.com → New project (free tier พอ)
2. ตั้งชื่อ + รหัสผ่าน database (จดไว้) → เลือก region ใกล้ไทย (เช่น Singapore)

## 2) สร้างตาราง
1. เมนูซ้าย → **SQL Editor** → New query
2. วางเนื้อหาไฟล์ [`schema.sql`](schema.sql) ทั้งหมด → **Run**
3. ควรได้ตารางครบใน **Table Editor** (customers, production, bills, ...)

## 3) เอาคีย์มาต่อแอป
เมนู **Project Settings → API** จะเห็น:
- **Project URL** เช่น `https://xxxx.supabase.co`
- **anon public** key (ยาว ๆ) — ตัวนี้ปลอดภัยที่จะอยู่ในโค้ดฝั่งเว็บ (ถูกคุมด้วย RLS)

> ⚠️ **ห้าม** เอา `service_role` key ใส่โค้ด/ขึ้น git เด็ดขาด — มันข้าม RLS ได้ทั้งหมด
> (`.gitignore` กัน `.env`/`secrets.*` ไว้แล้ว)

ส่ง **Project URL + anon key** ให้ผม → ผมจะ:
- ใส่ลงไฟล์ config (`app/supabase-config.js`)
- เพิ่ม `import` ตัว client จาก `https://esm.sh/@supabase/supabase-js@2`
- แปลงชั้นข้อมูลจาก `localStorage` → Supabase ทีละส่วน (เริ่มลูกค้า/ผลผลิต ก่อน)

## 4) ความปลอดภัย (สำคัญ)
`schema.sql` เปิด **RLS** ทุกตาราง แต่ช่วงแรกใส่ policy `anon_all` (อนุญาตทุกคนที่มี anon key อ่าน/เขียนได้) เพื่อให้ต้นแบบใช้งานได้ทันที

**เฟสถัดไป** (ตามที่คุยเรื่องสิทธิ์รายผู้ใช้): เปิด **Auth (login)** แล้วรัดสิทธิ์ตาม `role` ใน `profiles`
- `owner` เจ้าของ — ทั้งหมด
- `clerk` เสมียนโรงคัดไข่ — ขาย/บิล/สต็อก
- `livestock` สัตวบาล — ผลผลิต/โรงเรือน

(ตัวอย่าง policy แบบรัดสิทธิ์อยู่ท้ายไฟล์ `schema.sql` แล้ว)

## แผนการย้ายข้อมูล (migration) — ทำทีละเฟส
| เฟส | ย้าย | สถานะ |
|-----|------|-------|
| 0 | ออกแบบ schema + SQL | ✅ (ไฟล์นี้) |
| 1 | ลูกค้า + กลุ่ม + สินค้า + หลัง (reference) | รอ project |
| 2 | ผลผลิตรายวัน + คลัง/นับจริง | รอ |
| 3 | บิล + ชำระเงิน + ขาย | รอ |
| 4 | แผงไข่ + ร่าง | รอ |
| 5 | Auth + role + รัด RLS | รอ |
| 6 | รายจ่าย/ต้นทุน (เฟส 2 ของ roadmap) | รอ |
