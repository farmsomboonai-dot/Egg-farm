-- ============================================================================
--  migrate-003-line.sql — ตารางเก็บปลายทาง LINE (กลุ่ม/ห้อง/ผู้ใช้ ที่บอทถูกเพิ่ม)
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run  (รันซ้ำได้)
--  ใช้คู่กับ Edge Function: supabase/functions/line-bot
-- ============================================================================
create table if not exists line_config (
  id          text primary key default 'default',
  target_type text,            -- group | room | user
  target_id   text,            -- groupId / roomId / userId ล่าสุดที่บอทถูกเพิ่ม
  updated_at  timestamptz default now()
);

alter table line_config enable row level security;
drop policy if exists "anon_all" on line_config;
create policy "anon_all" on line_config for all to anon, authenticated using (true) with check (true);
