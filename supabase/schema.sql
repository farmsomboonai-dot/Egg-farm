-- ============================================================================
--  ระบบขายไข่ ฟาร์มไข่สมบูรณ์ (SJF Farm) — Supabase schema
--  วิธีใช้: เปิด Supabase Dashboard → SQL Editor → วางไฟล์นี้ทั้งหมด → Run
--  (idempotent: รันซ้ำได้ ใช้ IF NOT EXISTS / create or replace)
-- ============================================================================

-- gen_random_uuid()
create extension if not exists pgcrypto;

-- ทริกเกอร์อัปเดต updated_at อัตโนมัติ
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 1) ข้อมูลอ้างอิง (reference)
-- ---------------------------------------------------------------------------
create table if not exists customer_groups (
  id   text primary key,               -- เช่น 'retail', 'branch', 'delivery_mk'
  name text not null,
  sort int default 0
);

create table if not exists products (
  id       text primary key,           -- เช่น n0..n5, w18..w23, s_white, g_bub ...
  name     text not null,
  category text not null,               -- 'เบอร์' | 'คละ' | 'ตกเกรด' | 'พิเศษ'
  unit     text default 'แผง',          -- แผง / กก / ถุง
  sort     int default 0,
  active   boolean default true
);

create table if not exists houses (
  id       text primary key,           -- 'H2'..'H6'
  name     text,
  active   boolean default true,
  sort     int default 0
);

-- ---------------------------------------------------------------------------
-- 2) ลูกค้า
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id         uuid primary key default gen_random_uuid(),
  code       text,                      -- KK-001 ...
  name       text not null,
  company    text,
  tax_id     text,
  phone      text,
  address    text,
  group_id   text references customer_groups(id),
  active     boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_customers_code  on customers(code);
create index if not exists idx_customers_group on customers(group_id);
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) ผลผลิตรายวัน รายหลัง  (ไข่ดีเบอร์ = ฟอง, ตกเกรด = แผง, สุ่มตรวจตอกไข่)
-- ---------------------------------------------------------------------------
create table if not exists production (
  id         uuid primary key default gen_random_uuid(),
  prod_date  date not null,
  house_id   text not null references houses(id),
  chickens   int  default 0,           -- ยอดไก่คงเหลือ
  ber        jsonb default '{}'::jsonb, -- {"0":ฟอง,...,"5":ฟอง}
  offgrade   jsonb default '{}'::jsonb, -- {"จัมโบ้":แผง,"บุบ":แผง,...}
  inspect    jsonb,                     -- {"count":4,"result":"..."} สุ่มตรวจ
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (prod_date, house_id)
);
create index if not exists idx_production_date on production(prod_date);
create trigger trg_production_updated before update on production
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) คลัง/ยอดนับจริงรายวัน (ยกมา + คงเหลือ(นับจริง) ต่อสินค้า ต่อวัน)
--    ยกมาวันถัดไป = คงเหลือของวันก่อน (rolling)  ; opening ใส่เฉพาะวันแรก
-- ---------------------------------------------------------------------------
create table if not exists stock_counts (
  id         uuid primary key default gen_random_uuid(),
  count_date date not null,
  product_id text not null references products(id),
  opening    int,                       -- ยกมา (ใส่เฉพาะวันเริ่มต้น ; null = ใช้ rolling)
  remain     int,                       -- คงเหลือนับจริง (17:00)
  unique (count_date, product_id)
);
create index if not exists idx_stock_counts_date on stock_counts(count_date);

-- ---------------------------------------------------------------------------
-- 5) บิลขาย + รายการชำระเงิน
-- ---------------------------------------------------------------------------
create table if not exists bills (
  no                text primary key,   -- IVE6906-xxxx
  bill_date         date,
  ts                bigint,             -- timestamp จริงตอนออกบิล (ใช้กรองช่วงเวลา)
  customer_id       uuid references customers(id),
  customer_snapshot jsonb,             -- สำเนาข้อมูลลูกค้า ณ ตอนออกบิล
  items             jsonb,             -- [{productId,name,qty,price,weight,subtotal}]
  egg_total         numeric default 0,
  deposit_charge    numeric default 0,
  delivery_fee      numeric default 0,
  discount          numeric default 0,
  wht_pct           numeric default 0,
  wht_amt           numeric default 0,
  total             numeric default 0,  -- ยอดบิลนี้ (ไม่รวมยอดค้างยกมา)
  grand_total       numeric default 0,  -- รวมยอดค้างยกมา
  net_pay           numeric default 0,
  tray_summary      jsonb,
  deposit_lines     jsonb,
  note              text,
  created_at        timestamptz default now()
);
create index if not exists idx_bills_customer on bills(customer_id);
create index if not exists idx_bills_date on bills(bill_date);

create table if not exists payments (
  bill_no    text primary key references bills(no) on delete cascade,
  paid       numeric default 0,
  paid_date  date,
  method     text,
  slip_url   text,                      -- เก็บลิงก์รูปสลิป (Storage) ทีหลัง
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 6) ระบบแผงไข่ (ยืม/รับคืน/คัดแยก/ทดแทน)
-- ---------------------------------------------------------------------------
create table if not exists tray_records (
  id            text primary key,       -- RT-0001
  customer_id   uuid references customers(id),
  rt_date       date,
  received      jsonb,                  -- {"ใหญ่":n,"เล็ก":n}
  sorted        jsonb,                  -- {"good":{...},"broken":{...}}
  status        text,                   -- รอคัด / รอส่งคืน / ส่งคืนแล้ว / ปิดรายการ
  sorter        text,
  sorted_date   date,
  replaced_good jsonb,
  replacements  jsonb,                  -- [{ใหญ่,เล็ก,date}]
  from_bill     text references bills(no),
  created_at    timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 7) บิลร่าง (draft)
-- ---------------------------------------------------------------------------
create table if not exists drafts (
  id         text primary key,
  draft_date date,
  customer_id uuid references customers(id),
  data       jsonb,                     -- ก้อนข้อมูลร่างทั้งหมด
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 8) รายจ่าย/ต้นทุน (เฟส 2 — 6 หมวด: ค่าไฟ/ค่าแรง/อาหาร/ยา+สิ้นเปลือง/สายพันธุ์/ค่าเสื่อม)
-- ---------------------------------------------------------------------------
create table if not exists expenses (
  id         uuid primary key default gen_random_uuid(),
  exp_date   date not null,
  category   text not null,             -- 'ค่าไฟ' | 'ค่าแรง' | 'ค่าอาหาร' | 'ค่ายา' | 'ค่าสายพันธุ์' | 'ค่าเสื่อมโรงเรือน'
  amount     numeric not null default 0,
  house_id   text references houses(id), -- null = เฉลี่ยทั้งฟาร์ม
  alloc      text default 'per_bird',   -- วิธีปันส่วน: per_bird | per_house | farm
  note       text,
  created_at timestamptz default now()
);
create index if not exists idx_expenses_date on expenses(exp_date);

-- ---------------------------------------------------------------------------
-- 9) โปรไฟล์ผู้ใช้ + สิทธิ์ (เชื่อมกับ Supabase Auth — สำหรับระบบ role ในอนาคต)
--    role: owner=เจ้าของ, clerk=เสมียนโรงคัดไข่, livestock=สัตวบาลคุมโรงเรือน
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text default 'clerk',
  created_at timestamptz default now()
);

-- ============================================================================
--  RLS (Row Level Security)
--  ⚠️ เริ่มต้น: เปิด RLS + อนุญาต anon/authenticated เต็มสิทธิ์ (ให้แอปต้นแบบใช้ได้ทันที)
--  🔒 TODO เฟสถัดไป: ทำ Auth (login) แล้วรัดสิทธิ์ตาม role ใน profiles
--     (เจ้าของ=ทั้งหมด, เสมียน=ขาย/บิล/สต็อก, สัตวบาล=ผลผลิต) — ดู block ล่างสุด
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'customer_groups','products','houses','customers','production',
    'stock_counts','bills','payments','tray_records','drafts','expenses','profiles'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "anon_all" on %I;', t);
    execute format($p$create policy "anon_all" on %I for all to anon, authenticated using (true) with check (true);$p$, t);
  end loop;
end $$;

-- ============================================================================
--  🔒 (ตัวอย่าง สำหรับเฟสรัดสิทธิ์ — ยังไม่เปิดใช้)
--  เมื่อทำ Auth แล้ว ให้ลบ policy "anon_all" ข้างบน แล้วใช้แนวนี้แทน เช่น:
--
--  create policy "prod_livestock_write" on production for all to authenticated
--    using ( (select role from profiles where id = auth.uid()) in ('owner','livestock') )
--    with check ( (select role from profiles where id = auth.uid()) in ('owner','livestock') );
--
--  create policy "bills_clerk_write" on bills for all to authenticated
--    using ( (select role from profiles where id = auth.uid()) in ('owner','clerk') )
--    with check ( (select role from profiles where id = auth.uid()) in ('owner','clerk') );
-- ============================================================================
