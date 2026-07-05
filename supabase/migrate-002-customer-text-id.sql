-- ============================================================================
--  migrate 002 — เปลี่ยน customers.id (และ FK ที่อ้างถึง) จาก uuid → text
--  เหตุผล: แอปใช้ id ลูกค้าเป็น string (r1, npt1, c<timestamp>) ไม่ใช่ uuid
--  ปลอดภัย: ตาราง customers/bills/payments/tray_records/drafts ยัง "ว่าง" (มีแต่ houses/products/groups)
--  วิธีใช้: Supabase → SQL Editor → วางทั้งหมด → Run
-- ============================================================================
begin;

drop table if exists drafts       cascade;
drop table if exists tray_records cascade;
drop table if exists payments     cascade;
drop table if exists bills        cascade;
drop table if exists customers    cascade;

create table customers (
  id         text primary key,          -- ใช้ id เดิมจากแอป (r1, npt1, c<timestamp>)
  code       text,
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
create index idx_customers_code  on customers(code);
create index idx_customers_group on customers(group_id);
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

create table bills (
  no                text primary key,
  bill_date         date,
  ts                bigint,
  customer_id       text references customers(id),
  customer_snapshot jsonb,
  items             jsonb,
  egg_total         numeric default 0,
  deposit_charge    numeric default 0,
  delivery_fee      numeric default 0,
  discount          numeric default 0,
  wht_pct           numeric default 0,
  wht_amt           numeric default 0,
  total             numeric default 0,
  grand_total       numeric default 0,
  net_pay           numeric default 0,
  tray_summary      jsonb,
  deposit_lines     jsonb,
  note              text,
  created_at        timestamptz default now()
);
create index idx_bills_customer on bills(customer_id);
create index idx_bills_date on bills(bill_date);

create table payments (
  bill_no    text primary key references bills(no) on delete cascade,
  paid       numeric default 0,
  paid_date  date,
  method     text,
  slip_url   text,
  created_at timestamptz default now()
);

create table tray_records (
  id            text primary key,
  customer_id   text references customers(id),
  rt_date       date,
  received      jsonb,
  sorted        jsonb,
  status        text,
  sorter        text,
  sorted_date   date,
  replaced_good jsonb,
  replacements  jsonb,
  from_bill     text references bills(no),
  created_at    timestamptz default now()
);

create table drafts (
  id          text primary key,
  draft_date  date,
  customer_id text references customers(id),
  data        jsonb,
  updated_at  timestamptz default now()
);

-- RLS (anon_all เริ่มต้น เหมือนตารางอื่น — รัดสิทธิ์ตาม role ทีหลัง)
do $$
declare t text;
begin
  foreach t in array array['customers','bills','payments','tray_records','drafts'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "anon_all" on %I;', t);
    execute format($p$create policy "anon_all" on %I for all to anon, authenticated using (true) with check (true);$p$, t);
  end loop;
end $$;

commit;
