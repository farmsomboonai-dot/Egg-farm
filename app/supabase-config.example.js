// คัดลอกไฟล์นี้เป็น "supabase-config.js" (ไฟล์จริงถูก .gitignore) แล้วใส่ค่าจาก
// Supabase → Project Settings → API :
//   SB_URL  = Project URL   เช่น https://xxxxxxxxxxxx.supabase.co
//   SB_ANON = anon / publishable key  (อันที่ปลอดภัยฝั่งเว็บ — อย่าใส่ secret/service_role)
window.SB_URL  = "https://YOUR-PROJECT-REF.supabase.co";
window.SB_ANON = "YOUR-ANON-OR-PUBLISHABLE-KEY";

// (ไม่บังคับ) แจ้งเตือน/สรุปเข้า LINE — ตั้งเมื่อ deploy ฟังก์ชัน line-bot แล้ว
// ดูขั้นตอนที่ supabase/LINE-SETUP.md
// window.SB_FN_URL   = "https://YOUR-PROJECT-REF.functions.supabase.co";
// window.SB_FARM_KEY = "ตั้งรหัสลับให้ตรงกับ FARM_KEY ในฟังก์ชัน";
