import React, { useState, useMemo, useEffect } from "react";
import {
  Search, Plus, Minus, Trash2, Check, X, Receipt, Package, User, ChevronRight, ChevronLeft,
  AlertCircle, ShoppingCart, RotateCcw, Copy, ClipboardCheck, Send, Truck, Clock,
  Warehouse, Egg, ArrowDownToLine, Image as ImageIcon,
  FileText, Wallet, LayoutDashboard, TrendingUp, Calendar, CheckCircle2, CircleDollarSign, QrCode, Pencil, Printer,
  Bell, Settings, Wheat, Pill, Calculator,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// Supabase client — อ่าน URL/key จาก window (ตั้งใน index.html ผ่าน supabase-config.js)
// ไม่มีค่า → supabase = null → แอป fallback ใช้ localStorage เหมือนเดิม
const supabase = (typeof window !== "undefined" && window.SB_URL && window.SB_ANON)
  ? createClient(window.SB_URL, window.SB_ANON)
  : null;
if (supabase) {
  console.log("[Supabase] เชื่อมต่อ:", window.SB_URL);
  supabase.from("products").select("id", { count: "exact", head: true })
    .then(({ error, count }) => console.log(error ? "[Supabase] query error: " + error.message : "[Supabase] ✓ ตาราง products = " + count + " แถว"))
    .catch((e) => console.log("[Supabase] ✗ " + (e && e.message)));
} else {
  console.log("[Supabase] ยังไม่ตั้งค่า — ใช้ localStorage");
}

/* =================================================================
   ฟาร์มไข่สมบูรณ์ · บริษัท เอสเจเอฟ ฟาร์ม จำกัด
   ต้นแบบระบบ: ขาย → คลังรายวัน → ผลผลิตรายหลัง
   ข้อมูลทั้งหมดเป็นข้อมูลสมมติ · 1 แผง = 30 ฟอง
================================================================= */

const PER_PRADANG = 30;          // ฟองต่อแผง
const TRAY_DEPOSIT = 7;          // ค่ามัดจำแผงดำ บาท/แผง
const TRAY_DEPOSIT_ORANGE = 15;  // ค่ามัดจำแผงสีส้ม (ใช้กับไข่คละ) บาท/แผง
const VAT_RATE = 0;              // ภาษีมูลค่าเพิ่ม % (ฟาร์มไข่สดยกเว้น VAT = 0)
const fmt = (n) => (n ?? 0).toLocaleString("th-TH");
// วันที่ (local) จาก timestamp → "yyyy-mm-dd" ; ใช้ผูกบิลกับวันทำงานเวลาไม่มี workDay (บิลเก่า)
const isoFromTs = (ts) => { const d = new Date(ts || 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmt1 = (n) => (n ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 1 });
const fmt2 = (n) => (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ข้อมูลบริษัท (ตามใบเสร็จจริง)
const COMPANY = {
  name: "บริษัท เอสเจเอฟ ฟาร์ม จำกัด",
  addr1: "56/2 ม.5 ต.เบิกไพร อ.จอมบึง",
  addr2: "จ.ราชบุรี 70150",
  taxId: "0105539013602",
  branch: "สำนักงานใหญ่",
  tel: "064-545-9929, 064-426-9691",
  promptpayId: "0645459929", // ใช้สร้างรูป QR (ไม่แสดงข้อความพร้อมเพย์)
  bankName: "ธนาคารไทยพาณิชย์ (SCB)",
  bankAcctNo: "846-266-968-4",
  bankAcctName: "บจก. เอสเจเอฟ ฟาร์ม",
  bankAcctType: "ออมทรัพย์",
};

/* ---------- PromptPay QR (มาตรฐาน EMVCo ของไทย) ---------- */
// CRC16-CCITT (XMODEM) สำหรับ checksum ท้าย payload
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
// ประกอบ field TLV: id + ความยาว 2 หลัก + ค่า
const tlv = (id, val) => id + String(val.length).padStart(2, "0") + val;
// สร้าง payload พร้อมเพย์: id = เบอร์โทร (10 หลัก) หรือเลขปชช/นิติบุคคล (13 หลัก)
function promptpayPayload(id, amount) {
  const clean = (id || "").replace(/[^0-9]/g, "");
  let acc;
  if (clean.length === 13) {
    acc = "0213" + clean;                       // เลขประชาชน/นิติบุคคล
  } else {
    // เบอร์โทร → 0066 + ตัด 0 หน้า
    const phone = "0066" + clean.replace(/^0/, "");
    acc = "0113" + phone;
  }
  const merchantAccount = tlv("29", tlv("00", "A000000677010111") + acc);
  const hasAmount = amount && amount > 0;
  let payload =
    tlv("00", "01") +                           // version
    tlv("01", hasAmount ? "12" : "11") +         // 11=static, 12=dynamic(มียอด)
    merchantAccount +
    tlv("53", "764") +                          // currency THB
    (hasAmount ? tlv("54", Number(amount).toFixed(2)) : "") +
    tlv("58", "TH");                            // country
  payload += "6304";                            // CRC field id+len
  return payload + crc16(payload);
}

// แปลงจำนวนเงินเป็นข้อความภาษาไทย เช่น 6250 → "หกพันสองร้อยห้าสิบบาทถ้วน"
function bahtText(num) {
  num = Math.round((num || 0) * 100) / 100;
  const baht = Math.floor(num);
  const satang = Math.round((num - baht) * 100);
  const digits = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const places = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
  const readGroup = (s) => {
    let out = "";
    const len = s.length;
    for (let i = 0; i < len; i++) {
      const d = +s[i];
      const pos = len - i - 1;
      if (d === 0) continue;
      if (pos === 0 && d === 1 && len > 1) out += "เอ็ด";
      else if (pos === 1 && d === 2) out += "ยี่" + places[1];
      else if (pos === 1 && d === 1) out += places[1];
      else out += digits[d] + places[pos];
    }
    return out;
  };
  const readNumber = (n) => {
    if (n === 0) return "";
    const str = String(n);
    if (str.length <= 7) return readGroup(str);
    // รองรับหลักล้านขึ้นไป
    const millions = str.slice(0, str.length - 6);
    const rest = str.slice(str.length - 6);
    return readNumber(+millions) + "ล้าน" + readGroup(rest);
  };
  let text = baht === 0 ? "ศูนย์บาท" : readNumber(baht) + "บาท";
  text += satang === 0 ? "ถ้วน" : readGroup(String(satang).padStart(2, "0")) + "สตางค์";
  return text;
}

// ---------- กลุ่มลูกค้า ----------
let CUSTOMER_GROUPS = [
  { id: "retail", name: "ร้านขายปลีก (ฉันจะกินไข่สดทุกวัน)" },
  { id: "branch", name: "ร้านสาขาฟาร์มสมบูรณ์" },
  { id: "route_mk", name: "สายส่งรถฟาร์ม · แม่กลอง" },
  { id: "route_npt", name: "สายส่งรถฟาร์ม · นครปฐม" },
  { id: "route_bkk", name: "สายส่งรถฟาร์ม · กทม/นนทบุรี" },
  { id: "wholesale", name: "ขายส่ง รับเองหน้าฟาร์ม" },
  { id: "frontretail", name: "ขายปลีก หน้าฟาร์ม" },
];
// โหลดกลุ่มลูกค้าที่ผู้ใช้เพิ่มเอง (เก็บถาวรใน localStorage)
try {
  const __savedGroups = JSON.parse(localStorage.getItem("eggCustomerGroups") || "[]");
  if (Array.isArray(__savedGroups)) __savedGroups.forEach((g) => CUSTOMER_GROUPS.push(g));
} catch (e) {}
// เพิ่มกลุ่มลูกค้าใหม่ + บันทึกถาวร
function addGroupRecord(g) {
  CUSTOMER_GROUPS.push(g);
  try {
    const saved = JSON.parse(localStorage.getItem("eggCustomerGroups") || "[]");
    saved.push(g);
    localStorage.setItem("eggCustomerGroups", JSON.stringify(saved));
  } catch (e) {}
  sbUpsertGroup(g, CUSTOMER_GROUPS.length);   // ส่งขึ้นฐานข้อมูลกลางด้วย (นิยามอยู่ท้าย section ลูกค้า)
}

// ---------- ลูกค้า ----------
let CUSTOMERS = [
  // กลุ่ม 1: ร้านขายปลีก "ฉันจะกินไข่สดทุกวัน"
  { id: "r1", code: "KK-001", group: "retail", name: "ดรุณา", phone: "081-xxx-1001" },
  { id: "r2", code: "KK-002", group: "retail", name: "เดอะเบสท์โฮม", phone: "081-xxx-1002" },
  { id: "r3", code: "KK-003", group: "retail", name: "ปตท", phone: "081-xxx-1003" },
  { id: "r4", code: "KK-004", group: "retail", name: "ออมสิน", phone: "081-xxx-1004" },
  { id: "r5", code: "KK-005", group: "retail", name: "เขาวัง", phone: "081-xxx-1005" },
  { id: "r6", code: "KK-006", group: "retail", name: "แม่กลอง", phone: "081-xxx-1006" },
  { id: "r7", code: "KK-007", group: "retail", name: "นครปฐม", phone: "081-xxx-1007" },
  { id: "r8", code: "KK-008", group: "retail", name: "นนทบุรี 1", phone: "081-xxx-1008" },
  { id: "r9", code: "KK-009", group: "retail", name: "นนทบุรี 2", phone: "081-xxx-1009" },
  // กลุ่ม 2: ร้านสาขาฟาร์มสมบูรณ์
  { id: "b1", code: "KK-010", group: "branch", name: "โรงงานจอมบึง", phone: "082-xxx-2001" },
  { id: "b2", code: "KK-011", group: "branch", name: "สาขา 33", phone: "082-xxx-2002" },
  { id: "b3", code: "KK-012", group: "branch", name: "สาขา 36", phone: "082-xxx-2003" },
  { id: "b4", code: "KK-013", group: "branch", name: "สาขา 38", phone: "082-xxx-2004" },
  { id: "b5", code: "KK-014", group: "branch", name: "สาขา 31", phone: "082-xxx-2005" },
  // กลุ่ม 3: สายส่งแม่กลอง
  { id: "mk1", code: "KK-015", group: "route_mk", name: "พ่อพี่เวย์", phone: "083-xxx-3001" },
  { id: "mk3", code: "KK-016", group: "route_mk", name: "คุณติ๊ก", phone: "083-xxx-3003" },
  { id: "mk4", code: "KK-017", group: "route_mk", name: "คุณกาญ", phone: "083-xxx-3004" },
  { id: "mk5", code: "KK-018", group: "route_mk", name: "คุณยุทธ (แม่กลอง)", phone: "083-xxx-3005" },
  { id: "mk6", code: "KK-019", group: "route_mk", name: "ร้านริมเขื่อน", phone: "083-xxx-3006" },
  { id: "mk7", code: "KK-020", group: "route_mk", name: "บ. สยาม โกอินเตอร์ ฟูดส์", phone: "083-xxx-3007" },
  // กลุ่ม 4: สายส่งนครปฐม
  { id: "npt1", code: "KK-021", group: "route_npt", name: "พี่เล็ก นครปฐม", phone: "084-xxx-4001" },
  // กลุ่ม 5: สายส่ง กทม/นนทบุรี
  { id: "bkk1", code: "KK-022", group: "route_bkk", name: "คุณนัท กทม.", phone: "085-xxx-5001" },
  { id: "bkk2", code: "KK-023", group: "route_bkk", name: "นนทบุรี (สายส่ง)", phone: "085-xxx-5002" },
  // กลุ่ม 6: ขายส่ง รับเองหน้าฟาร์ม
  { id: "w1", code: "KK-024", group: "wholesale", name: "ร้านสารพัดไข่พู่", phone: "086-xxx-6001" },
  { id: "w2", code: "KK-025", group: "wholesale", name: "คุณยุทธ", phone: "086-xxx-6002" },
  // กลุ่ม 7: ขายปลีก หน้าฟาร์ม
  { id: "f1", code: "KK-026", group: "frontretail", name: "ลูกค้าปลีกหน้าฟาร์ม", phone: "-" },
];
// โหลดลูกค้าที่ผู้ใช้เพิ่มเอง (เก็บถาวรใน localStorage)
try {
  const __savedCust = JSON.parse(localStorage.getItem("eggCustomers") || "[]");
  if (Array.isArray(__savedCust)) __savedCust.forEach((c) => CUSTOMERS.push(c));
} catch (e) {}
// นำ "ส่วนที่แก้ไข" มาทับข้อมูลลูกค้า (ครอบคลุมลูกค้า seed ที่ฝังในโค้ด — แก้แล้วยังอยู่หลังรีเฟรช)
try {
  const __edits = JSON.parse(localStorage.getItem("eggCustomerEdits") || "{}");
  CUSTOMERS.forEach((c) => { if (__edits[c.id]) Object.assign(c, __edits[c.id]); });
} catch (e) {}
// เพิ่มลูกค้าใหม่ลงรายชื่อ + บันทึกถาวร
function addCustomerRecord(c) {
  CUSTOMERS.push(c);
  try {
    const saved = JSON.parse(localStorage.getItem("eggCustomers") || "[]");
    saved.push(c);
    localStorage.setItem("eggCustomers", JSON.stringify(saved));
  } catch (e) {}
  sbUpsertCustomer(c);   // ส่งขึ้นฐานข้อมูลกลางด้วย
}
// แก้ไขข้อมูลลูกค้า (id เดิม) + บันทึกถาวร — ลูกค้าที่เพิ่มเองอัปเดตใน eggCustomers, ลูกค้า seed เก็บลง eggCustomerEdits
function updateCustomerRecord(id, patch) {
  const c = CUSTOMERS.find((x) => x.id === id);
  if (c) Object.assign(c, patch);
  if (c) sbUpsertCustomer(c);   // ส่งข้อมูลที่แก้แล้ว (รวม patch) ขึ้นฐานข้อมูลกลาง
  try {
    const saved = JSON.parse(localStorage.getItem("eggCustomers") || "[]");
    const idx = saved.findIndex((x) => x.id === id);
    if (idx >= 0) {
      saved[idx] = { ...saved[idx], ...patch };
      localStorage.setItem("eggCustomers", JSON.stringify(saved));
    } else {
      const edits = JSON.parse(localStorage.getItem("eggCustomerEdits") || "{}");
      edits[id] = { ...(edits[id] || {}), ...patch };
      localStorage.setItem("eggCustomerEdits", JSON.stringify(edits));
    }
  } catch (e) {}
}
/* ---------- Supabase sync — ลูกค้า + กลุ่มลูกค้า (เฟส 1 ของการย้ายขึ้นฐานข้อมูลกลาง) ----------
   หลักการ: เชื่อมต่อได้ → ฐานข้อมูลเป็นแหล่งความจริง · localStorage เป็นตัวสำรอง/แคชออฟไลน์
   - เปิดแอป: โหลดกลุ่ม+ลูกค้าจาก DB, รายการที่มีแต่ในเครื่อง (seed ครั้งแรก/เพิ่มตอนออฟไลน์) ถูกส่งขึ้น DB ให้เอง
   - เพิ่ม/แก้ลูกค้า, เพิ่มกลุ่ม: เขียน localStorage เหมือนเดิม + ส่งขึ้น DB (ส่งไม่ผ่าน → เตือนใน console เฉย ๆ)
   - ถ้า DB ยังเป็น schema เก่า (customers.id = uuid — ยังไม่ได้รัน supabase/migrate-002) การส่งขึ้นจะไม่ผ่าน
     แอปทำงานแบบ localStorage ต่อได้ครบทุกอย่าง และจะ seed ขึ้น DB เองอัตโนมัติหลัง migration ถูกรัน */
const custToRow = (c) => ({
  id: c.id, code: c.code || null, name: c.name || "",
  company: c.company || null, tax_id: c.taxId || null,
  phone: c.phone || null, address: c.address || null, group_id: c.group || null,
});
const custFromRow = (r) => {
  const c = { id: r.id, code: r.code || "", group: r.group_id || "", name: r.name || "" };
  if (r.phone) c.phone = r.phone;
  if (r.company) c.company = r.company;
  if (r.tax_id) c.taxId = r.tax_id;
  if (r.address) c.address = r.address;
  return c;
};
function sbUpsertCustomer(c) {
  if (!supabase) return;
  supabase.from("customers").upsert(custToRow(c)).then(({ error }) => {
    if (error) console.warn("[Supabase] บันทึกลูกค้าขึ้นฐานข้อมูลไม่สำเร็จ (ข้อมูลเก็บในเครื่องแล้ว):", error.message);
  });
}
function sbUpsertGroup(g, sort) {
  if (!supabase) return;
  supabase.from("customer_groups").upsert({ id: g.id, name: g.name, sort: sort || 0 }).then(({ error }) => {
    if (error) console.warn("[Supabase] บันทึกกลุ่มลูกค้าขึ้นฐานข้อมูลไม่สำเร็จ:", error.message);
  });
}
// โหลดกลุ่ม+ลูกค้าจาก DB แล้วแทนที่รายชื่อในแอป (เรียกครั้งเดียวตอนเปิดแอป) — คืน true เมื่อโหลดสำเร็จ
async function sbSyncCustomers() {
  if (!supabase) return false;
  const [gr, cr] = await Promise.all([
    supabase.from("customer_groups").select("*").order("sort", { ascending: true }),
    supabase.from("customers").select("*").order("code", { ascending: true }),
  ]);
  if (gr.error || cr.error) {
    console.warn("[Supabase] โหลดลูกค้าไม่สำเร็จ — ใช้ข้อมูลในเครื่อง:", (gr.error || cr.error).message);
    return false;
  }
  // ส่งขึ้น DB: กลุ่ม/ลูกค้าที่ DB ยังไม่มี (ครั้งแรก = seed ทั้งชุด / ที่เพิ่มตอนออฟไลน์)
  const haveG = new Set(gr.data.map((r) => r.id));
  const haveC = new Set(cr.data.map((r) => r.id));
  const upG = CUSTOMER_GROUPS.filter((g) => !haveG.has(g.id));
  const upC = CUSTOMERS.filter((c) => !haveC.has(c.id));
  if (upG.length) {
    const { error } = await supabase.from("customer_groups")
      .upsert(upG.map((g) => ({ id: g.id, name: g.name, sort: CUSTOMER_GROUPS.indexOf(g) + 1 })));
    if (error) console.warn("[Supabase] ส่งกลุ่มลูกค้าขึ้นฐานข้อมูลไม่สำเร็จ:", error.message);
  }
  if (upC.length) {
    const { error } = await supabase.from("customers").upsert(upC.map(custToRow));
    if (error) console.warn("[Supabase] ส่งลูกค้าขึ้นฐานข้อมูลไม่สำเร็จ (ใช้ข้อมูลในเครื่องต่อ — ถ้าขึ้นว่า uuid ให้รัน supabase/migrate-002):", error.message);
    else console.log("[Supabase] ✓ ส่งลูกค้าขึ้นฐานข้อมูล " + upC.length + " ราย");
  }
  // รวมรายชื่อ: ของจาก DB (ความจริงกลาง) + ของที่มีแต่ในเครื่อง (ไม่ให้หายไม่ว่ากรณีไหน)
  const groups = [...gr.data.map((r) => ({ id: r.id, name: r.name })), ...upG];
  const custs = [...cr.data.map(custFromRow), ...upC];
  CUSTOMER_GROUPS.length = 0; groups.forEach((g) => CUSTOMER_GROUPS.push(g));
  CUSTOMERS.length = 0; custs.forEach((c) => CUSTOMERS.push(c));
  console.log("[Supabase] ✓ รายชื่อลูกค้า " + CUSTOMERS.length + " ราย (จากฐานข้อมูล " + cr.data.length + ")");
  return true;
}

// รหัสลูกค้าถัดไป — รูปแบบ KK-XXX นับต่อจากรหัส KK- ที่มีอยู่
function nextCustomerCode() {
  let max = 0;
  CUSTOMERS.forEach((c) => {
    const m = /^KK-0*(\d+)$/i.exec((c.code || "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return "KK-" + String(max + 1).padStart(3, "0");
}
// บังคับให้รหัสลูกค้าขึ้นต้นด้วย KK- เสมอ (ว่าง = ออกรหัสรันให้อัตโนมัติ)
function normalizeCustCode(raw) {
  const t = (raw || "").trim();
  if (!t) return nextCustomerCode();
  return /^KK-/i.test(t) ? t : "KK-" + t.replace(/^[-\s]+/, "");
}

/* ฟอร์มเพิ่ม/แก้ไขลูกค้า — รหัส / ชื่อ / บริษัท / เลขผู้เสียภาษี / เบอร์ / ที่อยู่ / กลุ่ม (ส่ง initial มา = โหมดแก้ไข) */
function NewCustomerModal({ groups, onClose, onAdd, initial }) {
  const editing = !!initial;
  const [code, setCode] = useState(() => editing ? (initial.code || "") : nextCustomerCode());
  const [name, setName] = useState(initial?.name || "");
  const [company, setCompany] = useState(initial?.company || "");
  const [taxId, setTaxId] = useState(initial?.taxId || "");
  const [phone, setPhone] = useState(initial && initial.phone && initial.phone !== "-" ? initial.phone : "");
  const [address, setAddress] = useState(initial?.address || "");
  const [group, setGroup] = useState(initial?.group || groups[0].id);
  const [localGroups, setLocalGroups] = useState([...groups]);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const addGroup = () => {
    const nm = newGroupName.trim();
    if (!nm) return;
    const g = { id: "g" + Date.now(), name: nm };
    addGroupRecord(g);
    setLocalGroups((prev) => [...prev, g]);
    setGroup(g.id);
    setNewGroupName("");
    setAddingGroup(false);
  };
  const valid = name.trim().length > 0;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>{editing ? "แก้ไขข้อมูลลูกค้า" : "เพิ่มลูกค้าใหม่"}</div><div style={S.modalSub}>{editing ? (initial.code ? initial.code + " · " : "") + initial.name : "กรอกรายละเอียดลูกค้า"}</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={S.ciLabel}>รหัสลูกค้า</label>
            <input style={S.fullInput} placeholder="เช่น KK-001" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.ciLabel}>เบอร์โทร</label>
            <input style={S.fullInput} inputMode="tel" placeholder="08x-xxx-xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={S.ciLabel}>ชื่อลูกค้า <span style={{ color: "#B91C1C" }}>*</span></label>
          <input style={S.fullInput} placeholder="เช่น ร้านป้าแดง" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={S.ciLabel}>ชื่อบริษัท</label>
          <input style={S.fullInput} placeholder="ชื่อนิติบุคคล (ถ้ามี)" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={S.ciLabel}>เลขประจำตัวผู้เสียภาษี</label>
          <input style={S.fullInput} inputMode="numeric" maxLength={13} placeholder="เลข 13 หลัก" value={taxId} onChange={(e) => setTaxId(e.target.value.replace(/[^0-9]/g, ""))} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={S.ciLabel}>ที่อยู่</label>
          <textarea style={{ ...S.fullInput, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} placeholder="บ้านเลขที่ / ตำบล / อำเภอ / จังหวัด" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={S.ciLabel}>กลุ่มลูกค้า</label>
            <button type="button" onClick={() => setAddingGroup((v) => !v)} style={{ background: "none", border: "none", color: ACCENT_DK, fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: 0 }}>
              {addingGroup ? "ยกเลิก" : "+ เพิ่มกลุ่มใหม่"}
            </button>
          </div>
          {addingGroup ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input style={S.fullInput} placeholder="ชื่อกลุ่มใหม่ เช่น ร้านกาแฟ" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addGroup(); }} autoFocus />
              <button type="button" onClick={addGroup} disabled={!newGroupName.trim()} style={{ ...S.primarySmBtn, opacity: newGroupName.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}>เพิ่ม</button>
            </div>
          ) : (
            <select style={S.fullInput} value={group} onChange={(e) => setGroup(e.target.value)}>
              {localGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
        </div>
        <button
          style={{ ...S.primaryBtn, ...(valid ? {} : S.confirmBtnDisabled) }}
          disabled={!valid}
          onClick={() => onAdd({ id: editing ? initial.id : ("c" + Date.now()), code: normalizeCustCode(code), group, name: name.trim(), company: company.trim(), taxId: taxId.trim(), phone: phone.trim() || "-", address: address.trim() })}
        >
          {editing ? "บันทึกการแก้ไข" : "บันทึกลูกค้า"}
        </button>
      </div>
    </div>
  );
}

/* รายการลูกค้า — ค้นหาได้ เรียงตามรหัส · mode="select" กดแถวเพื่อเลือกไปออกบิล · mode="edit" กดแถวเพื่อแก้ไข */
function CustomerCodesModal({ onClose, onPick, onEdit, mode = "select" }) {
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);   // ลูกค้าที่กำลังดูรายละเอียด (null = แสดงลิสต์)
  const editMode = mode === "edit";
  const groupName = (gid) => CUSTOMER_GROUPS.find((g) => g.id === gid)?.name || gid;
  const s = q.trim().toLowerCase();
  const rows = CUSTOMERS
    .filter((c) => !s || (c.name || "").toLowerCase().includes(s) || (c.code || "").toLowerCase().includes(s) || (c.phone || "").includes(s))
    .slice()
    .sort((a, b) => (a.code || "zzzz").localeCompare(b.code || "zzzz", "en", { numeric: true }));
  const rowClick = (c) => editMode ? (onEdit && onEdit(c)) : setDetail(c);
  const detailRows = (c) => [
    ["รหัสลูกค้า", c.code],
    ["กลุ่ม", groupName(c.group)],
    ["บริษัท", c.company],
    ["เลขผู้เสียภาษี", c.taxId],
    ["เบอร์โทร", c.phone && c.phone !== "-" ? c.phone : ""],
    ["ที่อยู่", c.address],
  ].filter(([, v]) => v);
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 460, maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        {detail ? (
          <>
            <div style={S.modalHead}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button style={{ ...S.ghostBtn, padding: "5px 10px" }} onClick={() => setDetail(null)}><ChevronLeft size={15} /> กลับ</button>
                <div style={S.modalTitle}>รายละเอียดลูกค้า</div>
              </div>
              <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
            </div>
            <div style={{ overflowY: "auto", marginTop: 12, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 4px 16px" }}>
                <div style={S.custIcon}><User size={22} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: ACCENT_DK, fontFamily: "monospace", fontSize: 14 }}>{detail.code || "—"}</div>
                  <div style={{ fontWeight: 700, color: INK, fontSize: 17 }}>{detail.name}</div>
                </div>
              </div>
              {detailRows(detail).map(([label, value]) => (
                <div key={label} style={{ display: "flex", gap: 12, padding: "9px 4px", borderBottom: "1px solid #f3efe7", alignItems: "flex-start" }}>
                  <span style={{ minWidth: 104, color: "#9b8e78", fontSize: 13, flexShrink: 0 }}>{label}</span>
                  <span style={{ flex: 1, color: INK, fontSize: 13.5, fontWeight: 600, whiteSpace: "pre-wrap" }}>{value}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                {onPick && <button style={{ ...S.primarySmBtn, flex: 1, justifyContent: "center" }} onClick={() => onPick(detail.id)}><ShoppingCart size={15} /> เลือกออกบิล</button>}
                {onEdit && <button style={{ ...S.ghostBtn, flex: 1, justifyContent: "center" }} onClick={() => onEdit(detail)}><Pencil size={15} /> แก้ไขข้อมูล</button>}
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={S.modalHead}>
              <div><div style={S.modalTitle}>{editMode ? "แก้ไขข้อมูลลูกค้า" : "รหัสลูกค้าทั้งหมด"}</div><div style={S.modalSub}>{CUSTOMERS.length} ราย · {editMode ? "กดลูกค้าที่ต้องการแก้ไข" : "กดแถวเพื่อดูรายละเอียด · กดปุ่มดินสอเพื่อแก้ไข"}</div></div>
              <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
            </div>
            <div style={S.searchBox}>
              <Search size={16} color="#9ca3af" />
              <input style={S.searchInput} placeholder="ค้นหาชื่อ / รหัส / เบอร์..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </div>
            <div style={{ overflowY: "auto", marginTop: 10, flex: 1 }}>
              {rows.length === 0 ? (
                <div style={S.hint}>ไม่พบลูกค้า</div>
              ) : rows.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 6px", borderBottom: "1px solid #f3efe7", background: editMode ? "#FDFBF6" : "transparent" }}>
                  <div onClick={() => rowClick(c)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                    <span style={{ fontWeight: 800, color: ACCENT_DK, fontFamily: "monospace", minWidth: 62, fontSize: 13.5 }}>{c.code || "—"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "#9b8e78" }}>{groupName(c.group)}{c.phone && c.phone !== "-" ? " · " + c.phone : ""}</div>
                    </div>
                  </div>
                  {!editMode && <button onClick={() => setDetail(c)} title="ดูรายละเอียด" style={{ display: "inline-flex", alignItems: "center", padding: "5px 8px", borderRadius: 8, border: "1px solid #e3ddd0", background: "#fff", color: "#9ca3af", cursor: "pointer", flexShrink: 0 }}><ChevronRight size={16} /></button>}
                  <button onClick={() => onEdit && onEdit(c)} title="แก้ไขข้อมูลลูกค้า" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: `1px solid ${editMode ? ACCENT : "#e3ddd0"}`, background: editMode ? ACCENT : "#fff", color: editMode ? "#fff" : ACCENT_DK, fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}><Pencil size={13} /> แก้ไข</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- สินค้า (ตรงตามบิลจริง) ----------
// กลุ่ม: เบอร์ / คละ(ตามน้ำหนัก) / พิเศษ / ตกเกรด
const PRODUCTS = {
  เบอร์: [
    { id: "n0", name: "เบอร์ 0", stock: 129 },
    { id: "n1", name: "เบอร์ 1", stock: 544 },
    { id: "n2", name: "เบอร์ 2", stock: 2531 },
    { id: "n3", name: "เบอร์ 3", stock: 2042 },
    { id: "n4", name: "เบอร์ 4", stock: 527 },
    { id: "n5", name: "เบอร์ 5", stock: 167 },
  ],
  คละ: [
    { id: "w18", name: "คละ 18+", stock: 0 },
    { id: "w19", name: "คละ 19+", stock: 140 },
    { id: "w20", name: "คละ 20+", stock: 330 },
    { id: "w21", name: "คละ 21+", stock: 80 },
    { id: "w22", name: "คละ 22+", stock: 0 },
    { id: "w23", name: "คละ 23+", stock: 0 },
  ],
  ตกเกรด: [
    { id: "s_white", name: "เปลือกขาว", stock: 950, wt: true },
    { id: "g_nuan", name: "นวล", stock: 33, wt: true },
    { id: "g_sand", name: "หัวทราย", stock: 45, wt: true },
    { id: "g_pueanmak", name: "เปื้อนมาก", stock: 275, wt: true },
    { id: "g_pueannoi", name: "เปื้อนน้อย", stock: 480, wt: true },
    { id: "g_bub", name: "บุบ", stock: 62, wt: true },
    { id: "g_jiw", name: "จิ๋ว", stock: 16 },
    { id: "g_tok", name: "ตอก - แก้ว", stock: 0 },
    { id: "g_toklew", name: "ตอกเหลว - กิโล", stock: 0 },
    { id: "g_tokdaeng", name: "ตอกแดงไม่แตก - กิโล", stock: 0 },
  ],
  พิเศษ: [
    { id: "s_jumbo", name: "จัมโบ้ + แฝด", stock: 23 },
  ],
};

const ALL_PRODUCTS = Object.entries(PRODUCTS).flatMap(([group, list]) =>
  list.map((p) => ({ ...p, group }))
);
const PRODUCT_BY_ID = Object.fromEntries(ALL_PRODUCTS.map((p) => [p.id, p]));

// ขนาดแผงตามชนิดไข่: เฉพาะเบอร์ 2-5 = แผงเล็ก ; ที่เหลือทั้งหมด (เบอร์ 0,1 + จัมโบ้ + ตกเกรด + คละ) = แผงใหญ่
const SMALL_TRAY_IDS = new Set(["n2", "n3", "n4", "n5"]);

// ลำดับสำหรับแสดงในรายงานคลัง (ตามรูปจริง)
const STOCK_ORDER = [
  "n0", "n1", "n2", "n3", "n4", "n5",
  "w18", "w19", "w20", "w21", "w22", "w23",
  "s_white", "g_nuan", "g_sand", "g_pueanmak", "g_pueannoi", "g_bub", "g_jiw", "g_tok", "g_toklew", "g_tokdaeng",
  "s_jumbo",
];

// ---------- ราคาล่าสุด แยกตามลูกค้า+สินค้า ----------
// เก็บ { price: บาท/แผง, date: วันที่อัปเดตราคาล่าสุด }
const LAST_PRICES = {
  npt1: { n0: { price: 130, date: "23/6/69" }, n2: { price: 110, date: "23/6/69" }, n3: { price: 100, date: "23/6/69" }, s_white: { price: 75, date: "20/6/69" }, g_rao: { price: 70, date: "18/6/69" } },
  bkk1: { n0: { price: 130, date: "23/6/69" }, n1: { price: 120, date: "23/6/69" }, n2: { price: 110, date: "23/6/69" }, n3: { price: 100, date: "21/6/69" }, s_white: { price: 75, date: "21/6/69" } },
  b2: { n0: { price: 130, date: "22/6/69" }, n2: { price: 110, date: "22/6/69" }, n3: { price: 100, date: "22/6/69" }, s_white: { price: 75, date: "22/6/69" }, g_rao: { price: 70, date: "15/6/69" }, g_jiw: { price: 65, date: "15/6/69" }, g_tok: { price: 20, date: "15/6/69" } },
  b3: { n1: { price: 120, date: "23/6/69" }, n2: { price: 110, date: "23/6/69" }, n3: { price: 100, date: "23/6/69" } },
  r8: { n2: { price: 110, date: "19/6/69" }, n3: { price: 100, date: "19/6/69" }, s_white: { price: 75, date: "19/6/69" } },
  w1: { n3: { price: 90, date: "22/6/69" }, n4: { price: 81, date: "22/6/69" }, w18: { price: 40, date: "22/6/69" }, w19: { price: 42, date: "22/6/69" }, w20: { price: 45, date: "22/6/69" }, w21: { price: 48, date: "20/6/69" }, w22: { price: 51, date: "20/6/69" }, w23: { price: 54, date: "20/6/69" } },
};

// ราคาอ้างอิงต่อแผง (fallback) — ใช้ตีมูลค่า "ส่วนต่าง" ตอนปิดยอด ถ้าไม่มีราคาจากบิลจริง
const REF_PRICE_FALLBACK = { n0: 130, n1: 120, n2: 110, n3: 100, n4: 90, n5: 85, s_white: 75, g_nuan: 60, g_sand: 55, g_pueanmak: 45, g_pueannoi: 50, g_bub: 70, g_jiw: 65, g_tok: 20, g_toklew: 20, g_tokdaeng: 25, s_jumbo: 140 };
// สาเหตุส่วนต่างตอนปิดยอด (แท็กต่อรายการ)
const DIFF_REASONS = ["แตก", "หาย", "แถม", "นับพลาด", "อื่นๆ"];
// หมวดต้นทุน 6 หมวด (บัญชีต้นทุน — ตาม roadmap ต้นทุนต่อหลังต่อรุ่น)
const EXPENSE_CATS = ["ค่าไฟ", "ค่าแรง", "ค่าอาหาร", "ค่ายา+วัสดุสิ้นเปลือง", "ค่าสายพันธุ์", "ค่าเสื่อมโรงเรือน"];

// ---------- สต๊อกยาและวิตามิน — จากชีต "สรุปยอดคงเหลือ ยา" ณ 7/7/69 (ยารักษา) ----------
// opening = คงเหลือ ณ วันตั้งต้น (since) ; เบิกใช้ = ระบบดึงจากบันทึกให้ยารายวัน (จับคู่ด้วยชื่อ) ; ราคา = บาท/หน่วย
const MED_STOCK_SINCE = "2026-07-07";
const MED_STOCK_SEED = [
  { id: "md01", name: "ทันใจ 100 ซอง/กล่อง", desc: "ยาแก้ปวด ลดไข้", unit: "กล่อง", opening: 130, price: 154, company: "อินเตอร์เวชภัณฑ์", mfg: "13/1/25", expiry: "13/1/27", since: MED_STOCK_SINCE },
  { id: "md02", name: "Acetin (อาซิติน)", desc: "ยาละลายเสมหะ", unit: "หน่วย", opening: 300, price: 154, company: "อินเตอร์เวชภัณฑ์", mfg: "02/2026", expiry: "02/2029", since: MED_STOCK_SINCE },
  { id: "md03", name: "ทาร์โลชิน 1 กก", desc: "ยารักษาระบบทางเดินหายใจ", unit: "กก.", opening: 87, price: 1700, company: "บิ๊คเคมีคอล", mfg: "20/3/26", expiry: "20/3/28", since: MED_STOCK_SINCE },
  { id: "md04", name: "โคลิเคียว 40% (500 กรัม/ถุง)", desc: "ยารักษาระบบทางเดินอาหาร", unit: "ถุง", opening: 478, price: 160, company: "บิ๊คเคมีคอล", mfg: "18/5/26", expiry: "18/5/29", since: MED_STOCK_SINCE },
  { id: "md05", name: "ด็อกซิเคียว-50", desc: "ยารักษาระบบทางเดินหายใจ", unit: "หน่วย", opening: 272, price: 1000, company: "บิ๊คเคมีคอล", mfg: "23/2/26", expiry: "23/2/28", since: MED_STOCK_SINCE },
  { id: "md06", name: "ม็อกซี่การ์ด 50% เอส 1 กก", desc: "ยารักษา แก้อักเสบติดเชื้อ หลอดลม/กล่องเสียงอักเสบ", unit: "กก.", opening: 191, price: 660, company: "บิ๊คเคมีคอล", mfg: "12/5/26", expiry: "12/5/29", since: MED_STOCK_SINCE },
  { id: "md07", name: "เอ็นโรการ์ด 10% (1 ลิตร/ขวด)", desc: "ยารักษา การติดเชื้อแทรกซ้อน", unit: "ขวด", opening: 216, price: 170, company: "บิ๊คเคมีคอล", mfg: "24/04/26", expiry: "24/04/29", since: MED_STOCK_SINCE },
  { id: "md08", name: "โนวามื็อกซิน", desc: "ยารักษา แก้อักเสบ ติดเชื้อทั่วไป", unit: "หน่วย", opening: 21, price: null, company: "แอลไอซี", mfg: "6/3/26", expiry: "6/3/29", since: MED_STOCK_SINCE },
  { id: "md09", name: "กัท โปร-พลัส (1 ลิตร/ขวด)", desc: "โปรไบโอติก บำรุงลำไส้ ปรับสมดุล", unit: "ขวด", opening: 1, price: 230, company: "บิ๊คเคมีคอล", mfg: "5/1/26", expiry: "05/01/27", since: MED_STOCK_SINCE },
  { id: "md10", name: "รีโวไลท์", desc: "วิตามิน อิเล็กโทรไลต์ ลดสเตรส เพิ่มเกลือแร่", unit: "หน่วย", opening: 78, price: 160, company: "บิ๊คเคมีคอล", mfg: "22/4/26", expiry: "22/10/26", since: MED_STOCK_SINCE },
  { id: "md11", name: "แอล-แอสคอร์บิค แอซิด", desc: "วิตามินซี เสริมภูมิต้านทาน ลดเครียด", unit: "หน่วย", opening: 100, price: 130, company: "บิ๊คเคมีคอล", mfg: "06/05/26", expiry: "06/05/27", since: MED_STOCK_SINCE },
  { id: "md12", name: "ซีลีเนี่ยม", desc: "วิตามิน บำรุงระบบสืบพันธุ์", unit: "หน่วย", opening: 275, price: 270, company: "บิ๊คเคมีคอล", mfg: "13/03/26", expiry: "-", since: MED_STOCK_SINCE },
  { id: "md13", name: "Supersan Soluble 1 ลิตร", desc: "วิตามินรวม ลดเครียด เสริมภูมิ บำรุงร่างกาย", unit: "ขวด", opening: 80, price: 580, company: "แอลไอซี", mfg: "1/9/25", expiry: "1/9/28", since: MED_STOCK_SINCE },
  { id: "md14", name: "พลูโมแม็กซ์", desc: "สมุนไพร ช่วยเคลียร์ระบบทางเดินหายใจ", unit: "หน่วย", opening: 34, price: 1250, company: "ซีเอ็ล โฟกัส", mfg: "14/5/26", expiry: "13/5/28", since: MED_STOCK_SINCE },
  { id: "md15", name: "รีไวทัล", desc: "วิตามิน ต้านไวรัส ฟื้นลำไส้", unit: "หน่วย", opening: 0, price: null, company: "แอลไอซี", mfg: "03/2025", expiry: "03/2027", since: MED_STOCK_SINCE },
  { id: "md16", name: "Poustin-C", desc: "วิตามินซี ลดการแพ้วัคซีน ฟื้นฟูจากภาวะป่วย", unit: "หน่วย", opening: 0, price: 1500, company: "แอลไอซี", mfg: "09/01/26", expiry: "08/01/28", since: MED_STOCK_SINCE },
  { id: "md17", name: "Miaphos", desc: "วิตามิน แคลเซียมบำรุงกระดูก", unit: "หน่วย", opening: 0, price: 525, company: "แอลไอซี", mfg: "07/2025", expiry: "07/2027", since: MED_STOCK_SINCE },
  { id: "md18", name: "Calcium + D3", desc: "วิตามิน แคลเซียม บำรุงเปลือกไข่", unit: "หน่วย", opening: 20, price: 525, company: "แอลไอซี", mfg: "01/2026", expiry: "01/2028", since: MED_STOCK_SINCE },
  { id: "md19", name: "เฟนโดน่า 1 L", desc: "ยาฆ่าแมลง พ่นกำจัดไร", unit: "ขวด", opening: 154, price: 1500, company: "เบสท์ เวท โซลูชั่นส์", mfg: "4/7/68", expiry: "04/07/27", since: MED_STOCK_SINCE },
  { id: "md20", name: "ลินท์ือป", desc: "ยาฆ่าแมลง พ่นกำจัดไร", unit: "หน่วย", opening: 19, price: 1000, company: "รอชัย ฟาร์ม่า", mfg: "13/03/26", expiry: "13/9/26", since: MED_STOCK_SINCE },
  { id: "md21", name: "ไอเวอร์การ์ด", desc: "ยาถ่ายพยาธิ กำจัดไร", unit: "หน่วย", opening: 230, price: 90, company: "บิ๊คเคมีคอล", mfg: "09/2025", expiry: "09/2028", since: MED_STOCK_SINCE },
];

// ---------- คลังรายวัน: ยกมา = คงเหลือเมื่อวาน (2/7/69) ----------
const STOCK_OPENING = {
  n0: 233, n1: 365, n2: 104, n3: 280, n4: 185, n5: 20,
  w18: 0, w19: 0, w20: 0, w21: 0, w22: 0, w23: 0,
  s_white: 32, s_jumbo: 0,
  g_jiw: 9, g_pueanmak: 332, g_pueannoi: 1232, g_bub: 154, g_tok: 49, g_toklew: 67, g_tokdaeng: 130, g_sand: 719, g_nuan: 760,
};
// คงเหลือ = ยอดนับจริงวันนี้ (3/7/69) — ช่อง "คงเหลือ" ใส่ตรงๆ, ขายคำนวณกลับ (ยกมา + รับเข้า − คงเหลือ)
const STOCK_REMAIN = {
  n0: 13, n1: 446, n2: 233, n3: 34, n4: 11, n5: 20,
  w18: 0, w19: 0, w20: 0, w21: 0, w22: 0, w23: 0,
  s_white: 9, s_jumbo: 0,
  g_jiw: 23, g_pueanmak: 288, g_pueannoi: 1378, g_bub: 134, g_tok: 17, g_toklew: 10, g_tokdaeng: 36, g_sand: 192, g_nuan: 191,
};
// คงเหลือ "นับจริง" ต่อวัน (ปิดยอดแล้ว) → ใช้เป็น "ยกมา" ของวันถัดไป (rolling) และ back-calc ยอดขายของวันนั้น
const STOCK_REMAIN_BY_DATE = { "2026-07-03": STOCK_REMAIN };
// รับเข้า = ยอดผลผลิต (ดึงจากตาราง HOUSES) ; เก็บ STOCK_RECEIVED ไว้เผื่อ init สต็อกภายใน
const STOCK_RECEIVED = {
  n0: 434, n1: 1417, n2: 2502, n3: 2304, n4: 680, n5: 97,
  w18: 60, w19: 200, w20: 400, w21: 120, w22: 80, w23: 40,
  s_white: 982, s_jumbo: 23,
  g_jiw: 15, g_pueanmak: 155, g_pueannoi: 324, g_bub: 157, g_tok: 60, g_sand: 0, g_nuan: 0,
};
// ตกเกรด (ชื่อในตารางผลผลิต) → รหัสสินค้าในคลัง (ใช้ตอนดึงรับเข้าจากผลผลิต)
const OFF_TO_PID = { จัมโบ้: "s_jumbo", บุบ: "g_bub", ตอก: "g_tok", จิ๋ว: "g_jiw", เปลือกขาว: "s_white", หัวทราย: "g_sand", นวล: "g_nuan", เปื้อนมาก: "g_pueanmak", เปื้อนน้อย: "g_pueannoi" };

// ---------- แผงดำ: รายการรับคืนเริ่มต้นว่าง (ผู้ใช้บันทึกเอง) ----------
const TRAY_SEED = [];
const TRAY_KINDS = ["ใหญ่", "เล็ก"];
const sumTray = (o) => (o ? (o.ใหญ่ || 0) + (o.เล็ก || 0) : 0);
// แสดงจำนวนแผงแยกใหญ่/เล็ก: ปน = "110 แผง (ใหญ่ 100 · เล็ก 10)" · ล้วน = "100 แผงใหญ่"/"10 แผงเล็ก" · ศูนย์ = "0 แผง"
function trayQty(big, small) {
  const b = big || 0, s = small || 0;
  if (b > 0 && s > 0) return `${fmt(b + s)} แผง (ใหญ่ ${fmt(b)} · เล็ก ${fmt(s)})`;
  if (s > 0) return `${fmt(s)} แผงเล็ก`;
  if (b > 0) return `${fmt(b)} แผงใหญ่`;
  return "0 แผง";
}
const trayQtyO = (o) => trayQty(o?.ใหญ่, o?.เล็ก);

// บัญชีแผงต่อลูกค้า: รวมยอดจากบิล (รับไป/คืนตอนซื้อ) + RT (คืนภายหลัง/คัดชำรุด) + สมุดเหตุการณ์ (events)
// กติกา 2026-07-07 (ตามหน้างานจริง): "แผงทุกใบที่ลูกค้าคืนต้องผ่านการคัดก่อน — แม้แต่แผงทดแทน"
//   - แผงทดแทนไม่มีทางเข้าแยกแล้ว: บันทึกเป็น รับแผงคืน → คัดแยก เหมือนแผงคืนปกติ
//   - แผงดีที่คัดได้แต่ละรอบ หักล้างค้างทดแทนรอบก่อนอัตโนมัติ ก่อนบวกชำรุดใหม่ของรอบนั้น
//   - แผงชำรุดตัวจริงที่ฟาร์มรอส่งคืนลูกค้า → เหตุการณ์ "brokenBack" · เหตุการณ์ "replace" = ข้อมูลเก่า (legacy) ยังคิดให้ถูก
// excludeBillNo: ใช้ตอนออกบิล เพื่อไม่นับบิลที่กำลังทำอยู่ (ยังไม่บันทึก)
function trayAccountOf(customerId, bills, trayRecords, excludeBillNo, trayEvents) {
  let billSent = 0, billReturned = 0, rtReturned = 0, brokenOwed = 0, brokenAtFarm = 0;
  let blackSent = 0, blackReturned = 0, orangeSent = 0, orangeReturned = 0;  // แยกชนิด เพื่อคิดมูลค่ามัดจำ
  let chargedShort = 0, carriedShort = 0, chargedDeposit = 0;                // คืนขาด: คิดเงิน vs ยกค้างคืน
  // แยกขนาด ใหญ่/เล็ก ทุกยอด (แผงส้ม = ใหญ่หมด · บิลเก่าที่ไม่มี field ขนาด → นับเป็นใหญ่ทั้งบิล)
  let sentBig = 0, sentSmall = 0, retBig = 0, retSmall = 0;
  let brokenAtFarmBig = 0, brokenAtFarmSmall = 0;
  (bills || []).forEach((b) => {
    if (b.customerId !== customerId || (excludeBillNo && b.no === excludeBillNo)) return;
    const ts = b.traySummary; if (!ts) return;
    const sentAll = (ts.blackSent || 0) + (ts.orangeSent || 0);
    const retAll = (ts.blackReturned || 0) + (ts.orangeReturned || 0);
    billSent += sentAll;
    billReturned += retAll;
    const sB = (ts.blackBig || 0) + (ts.orangeBig || 0), sS = ts.blackSmall || 0;
    if (sB + sS === sentAll) { sentBig += sB; sentSmall += sS; } else sentBig += sentAll;
    const rB = (ts.blackReturnedBig || 0) + (ts.orangeReturned || 0), rS = ts.blackReturnedSmall || 0;
    if (rB + rS === retAll) { retBig += rB; retSmall += rS; } else retBig += retAll;
    blackSent += ts.blackSent || 0; blackReturned += ts.blackReturned || 0;
    orangeSent += ts.orangeSent || 0; orangeReturned += ts.orangeReturned || 0;
    const bn = ts.blackNet || 0, on = ts.orangeNet || 0;               // แผงที่คืนขาดบิลนี้
    if (ts.shortMode === "carry") carriedShort += bn + on;             // ยกเป็นค้างคืน (ไม่คิดเงิน)
    else { chargedShort += bn + on; chargedDeposit += bn * TRAY_DEPOSIT + on * TRAY_DEPOSIT_ORANGE; }  // คิดเงิน (default)
  });
  const sortedRounds = [];   // รอบคัดตามเวลา — ใช้คิดค้างทดแทนแบบหักแผงดีอัตโนมัติ (แยกใหญ่/เล็ก: แทนข้ามขนาดไม่ได้)
  (trayRecords || []).forEach((t) => {
    if (t.customerId !== customerId) return;
    if (!t.fromBill) { rtReturned += sumTray(t.received); retBig += t.received?.ใหญ่ || 0; retSmall += t.received?.เล็ก || 0; }   // ใบจากบิลนับยอดคืนใน billReturned แล้ว → ไม่นับซ้ำ
    if (t.sorted) {
      brokenOwed += Math.max(0, sumTray(t.sorted.broken) - sumTray(t.replacedGood));   // ชำรุดสะสม (หัก legacy ทดแทนต่อใบสมัยเก่า)
      // ชำรุดตัวจริงที่ยังอยู่ที่ฟาร์ม — ใบที่ปิดด้วยเหตุการณ์คืนชำรุด (brokenBackVia) ยังต้องนับ เพราะยอดเหตุการณ์เป็นตัวหัก (ไม่งั้นหักซ้ำ)
      if (t.status !== "ส่งคืนแล้ว" || t.brokenBackVia) { brokenAtFarm += sumTray(t.sorted.broken); brokenAtFarmBig += t.sorted.broken?.ใหญ่ || 0; brokenAtFarmSmall += t.sorted.broken?.เล็ก || 0; }
      sortedRounds.push({
        iso: thShortToISO(t.date) || "", ts: 0,
        goodB: t.sorted.good?.ใหญ่ || 0, goodS: t.sorted.good?.เล็ก || 0,
        brokenB: Math.max(0, (t.sorted.broken?.ใหญ่ || 0) - (t.replacedGood?.ใหญ่ || 0)),
        brokenS: Math.max(0, (t.sorted.broken?.เล็ก || 0) - (t.replacedGood?.เล็ก || 0)),
      });
    }
  });
  // สมุดเหตุการณ์ระดับลูกค้า: รับแผงดีทดแทน (ตัดค้าง) / คืนแผงชำรุดให้ลูกค้า (ตัดกองที่ฟาร์ม)
  let evReplace = 0, evBrokenBack = 0, evBrokenBackBig = 0, evBrokenBackSmall = 0;
  (trayEvents || []).forEach((e) => {
    if (e.customerId !== customerId) return;
    const q = (e.ใหญ่ || 0) + (e.เล็ก || 0);
    if (e.type === "replace") { evReplace += q; sortedRounds.push({ iso: e.date || "", ts: e.ts || 1, repB: e.ใหญ่ || 0, repS: e.เล็ก || 0 }); }
    else if (e.type === "brokenBack") { evBrokenBack += q; evBrokenBackBig += e.ใหญ่ || 0; evBrokenBackSmall += e.เล็ก || 0; }
  });
  const balance = billSent - billReturned - rtReturned; // >0 = ยืมไป/ถืออยู่, <0 = คืนเกินกว่าที่ถือ
  const surplus = Math.max(0, -balance);                // แผงที่คืนเกินกว่าที่ถืออยู่ (ข้อมูลอ้างอิง)
  const rawOwed = Math.max(0, brokenOwed);              // ชำรุดสะสมทั้งหมด (ก่อนหักแผงดี/ทดแทน)
  // ค้างทดแทน — ไล่ตามเวลา (กติกา 2026-07-06): แต่ละรอบคัด "แผงดีที่คัดได้" หักล้างค้างเก่าก่อน แล้วชำรุดใหม่ของรอบนั้นค่อยบวกเข้า
  // (ลูกค้าเอาแผงแลกปนมากับแผงคืน — ระบบหักให้เอง) · เหตุการณ์ "รับแผงดีทดแทน" ก็หักตามเวลาเช่นกัน
  sortedRounds.sort((a, b) => (a.iso || "").localeCompare(b.iso || "") || a.ts - b.ts);
  let owedB = 0, owedS = 0;   // ค้างทดแทนแยกขนาด — แผงดีใหญ่หักค้างใหญ่ / เล็กหักเล็ก เท่านั้น
  sortedRounds.forEach((v) => {
    if (v.repB != null) { owedB = Math.max(0, owedB - v.repB); owedS = Math.max(0, owedS - v.repS); }
    else { owedB = Math.max(0, owedB - v.goodB) + v.brokenB; owedS = Math.max(0, owedS - v.goodS) + v.brokenS; }
  });
  const owed = owedB + owedS;                           // ค้างทดแทนคงเหลือรวม (รอลูกค้านำแผงดีมาคืน)
  const brokenPendingBig = Math.max(0, brokenAtFarmBig - evBrokenBackBig);
  const brokenPendingSmall = Math.max(0, brokenAtFarmSmall - evBrokenBackSmall);
  const brokenPending = brokenPendingBig + brokenPendingSmall;   // ชำรุดหลังคัดที่ฟาร์มถือรอส่งคืนลูกค้า
  const credit = surplus;                               // คืนเกิน (แสดงข้อมูล ไม่เอาไปหักอะไร)
  const owedBack = Math.max(0, balance);                // แผงที่ลูกค้ายืม/ถืออยู่ (จำนวน)
  // แยกชนิดแผงที่ยังถืออยู่ → คิดมูลค่ามัดจำที่จ่ายมาแล้ว (แผงคืนขาดถูกคิดเงินไปแล้ว = ไม่ใช่หนี้ แต่บันทึกไว้ว่ารอจ่ายคืน)
  let heldBlack = Math.max(0, blackSent - blackReturned);
  let heldOrange = Math.max(0, orangeSent - orangeReturned);
  let rt = rtReturned;                                  // แผง RT ไม่แยกชนิด → หักจากแผงดำก่อน แล้วแผงส้ม
  const rb = Math.min(heldBlack, rt); heldBlack -= rb; rt -= rb;
  const ro = Math.min(heldOrange, rt); heldOrange -= ro; rt -= ro;
  const heldCount = heldBlack + heldOrange;             // แผงที่ถืออยู่รวม (ค้างคืน + จ่ายมัดจำ)
  // แยกแผงที่ถืออยู่เป็น 2 กอง: ยกเป็นค้างคืน (หนี้จริง ไม่คิดเงิน) vs จ่ายมัดจำแล้ว (คิดเงินไปแล้ว)
  // การคืนแผงทีหลังจะหักหนี้ "ค้างคืน" ก่อน แล้วค่อยหัก "จ่ายมัดจำ" (คืนแผงที่จ่ายมัดจำ = เกิดยอดรอจ่ายคืน)
  const totalShort = chargedShort + carriedShort;
  const paidOff = Math.max(0, totalShort - owedBack);  // แผงที่คืนมาลบหนี้เก่าไปแล้ว
  const carriedCleared = Math.min(carriedShort, paidOff);
  const carriedOwed = carriedShort - carriedCleared;   // ค้างคืน (ยกยอด ไม่คิดเงิน) ที่ยังเหลือ
  const chargedHeld = Math.max(0, chargedShort - Math.max(0, paidOff - carriedCleared)); // ยืมไป/จ่ายมัดจำ ที่ยังเหลือ
  const depositHeld = chargedShort > 0 ? Math.round(chargedDeposit * chargedHeld / chargedShort) : 0; // มัดจำของแผงที่ยังถืออยู่ (บาท)
  return { billSent, billReturned, rtReturned, balance, surplus, rawOwed, owed, credit, owedBack, heldBlack, heldOrange, heldCount, carriedOwed, chargedHeld, depositHeld, brokenPending, evReplace, evBrokenBack,
    owedBig: owedB, owedSmall: owedS, brokenPendingBig, brokenPendingSmall, sentBig, sentSmall, retBig, retSmall };
}
// ข้อความแยกแผงส้ม/ดำที่ยืมไป — เน้นแผงส้มก่อน (แผงส้มมีแค่ที่ฟาร์มเรา ลูกค้าเวียนที่อื่นไม่ได้)
function heldBreakdown(acc) {
  if (!acc) return "";
  const parts = [];
  if (acc.heldOrange > 0) parts.push(`🟠 ส้ม ${fmt(acc.heldOrange)}`);
  if (acc.heldBlack > 0) parts.push(`⚫ ดำ ${fmt(acc.heldBlack)}`);
  return parts.join(" · ");
}

/* ============================================================
   App หลัก — state กลาง: bills(แหล่งขาย), productionByDate, trayStock ; stock = derived
============================================================ */
// ผลผลิตรายหลัง → จำนวนเข้าสต็อกสินค้า (แผง): ไข่ดีเบอร์ ฟอง÷30 → n0-n5 ; ตกเกรด แผงตรงตัว
function productionToStock(houses) {
  const p = {};
  (houses || []).forEach((h) => {
    Object.entries(h.grade.เบอร์).forEach(([k, fong]) => { const pid = "n" + k; p[pid] = (p[pid] || 0) + Math.round((fong || 0) / PER_PRADANG); });
    Object.entries(h.grade.ตกเกรด).forEach(([k, prang]) => { const pid = OFF_TO_PID[k]; if (pid) p[pid] = (p[pid] || 0) + (prang || 0); });
  });
  return p;
}

// ยกมาของวันหนึ่ง = คงเหลือ(นับจริง)ของวันก่อนหน้า ; วันแรกสุด = STOCK_OPENING ; ถ้าวันก่อนไม่มีนับจริง → ยกมา+ผลิต (rolling)
// counts = ยอดนับจริงต่อวัน (ปิดยอดแล้ว) ; default = seed ในโค้ด ; แอปส่ง state ที่พนักงานกรอกเข้ามาแทน
function openingForDay(date, prodByDate, counts) {
  const closed = counts || STOCK_REMAIN_BY_DATE;
  const dates = Object.keys(prodByDate || {}).sort();
  const idx = dates.indexOf(date);
  if (idx <= 0) return STOCK_OPENING;                       // วันแรก → ยกมา 2/7
  const prev = dates[idx - 1];
  if (closed[prev]) return closed[prev];                     // วันก่อนปิดยอดแล้ว → ใช้คงเหลือจริง
  const po = openingForDay(prev, prodByDate, counts);        // วันก่อนยังไม่ปิด → ยกมา + ผลิต (ยังไม่หักขายอดีต)
  const pp = productionToStock(prodByDate[prev]);
  const r = {}; ALL_PRODUCTS.forEach((p) => r[p.id] = (po[p.id] || 0) + (pp[p.id] || 0));
  return r;
}

// วันทำงานของสต็อก/คลังรายวัน (ยกมา 2/7 → ผลิต 3/7) — ผลผลิตวันนี้เข้าสต็อกอัตโนมัติ
const STOCK_DAY = "2026-07-03";

export default function App() {
  const [view, setView] = useState("sales");

  // Supabase: โหลดลูกค้า+กลุ่มจากฐานข้อมูลกลางครั้งแรกที่เปิดแอป — สำเร็จแล้ว bump เพื่อ re-render ให้เห็นรายชื่อล่าสุด
  const [, setCustSyncRev] = useState(0);
  useEffect(() => {
    let live = true;
    sbSyncCustomers().then((ok) => { if (ok && live) setCustSyncRev((v) => v + 1); });
    return () => { live = false; };
  }, []);

  // ผลผลิตรายวัน (ย้อนดูได้) — เก็บลง localStorage ; houses = ของวันที่เลือก (prodDate)
  const [productionByDate, setProductionByDate] = useState(() => {
    try { const st = JSON.parse(localStorage.getItem("eggProduction") || "{}"); return { ...PRODUCTION_SEED, ...st }; }
    catch { return { ...PRODUCTION_SEED }; }
  });
  const [prodDate, setProdDate] = useState(PROD_DEFAULT_DATE);
  useEffect(() => { try { localStorage.setItem("eggProduction", JSON.stringify(productionByDate)); } catch {} }, [productionByDate]);
  const houses = productionByDate[prodDate] || [];   // ผลผลิตรายหลังของวันที่เลือก (แก้ไข/กรอกได้)
  const setHouses = (updater) => {
    setProductionByDate((prev) => {
      const cur = prev[prodDate] || [];
      const next = typeof updater === "function" ? updater(cur) : updater;
      return { ...prev, [prodDate]: next };
    });
  };

  // วันทำงานของสต็อก/คลัง = วันผลิตล่าสุด (ขายของวันนี้) — สต็อกขายได้ "ดึงสด" จากผลผลิตวันนี้ + ยกมา − ขายแล้ว (ไม่มี state แช่แข็ง)
  const stockDay = useMemo(() => Object.keys(productionByDate).sort().pop() || STOCK_DAY, [productionByDate]);
  // ยอดนับจริงปลายวัน (ปิดยอดสิ้นวัน) ต่อวันที่ — seed จากโค้ด ⊕ ที่พนักงานกรอก (localStorage) ; วันที่มีค่า = "ปิดยอดแล้ว" → เป็นยกมาของวันถัดไป
  const [stockCounts, setStockCounts] = useState(() => {
    try { const st = JSON.parse(localStorage.getItem("eggStockCounts") || "{}"); return { ...STOCK_REMAIN_BY_DATE, ...st }; }
    catch { return { ...STOCK_REMAIN_BY_DATE }; }
  });
  useEffect(() => { try { localStorage.setItem("eggStockCounts", JSON.stringify(stockCounts)); } catch {} }, [stockCounts]);
  // ข้อมูลกำกับการปิดยอดต่อวัน: { by(ผู้ปิด), at(เวลา ts), note, reasons:{pid:สาเหตุ} } — แยกจาก stockCounts เพื่อไม่กระทบสูตร rolling
  const [closeMeta, setCloseMeta] = useState(() => { try { return JSON.parse(localStorage.getItem("eggCloseMeta") || "{}"); } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem("eggCloseMeta", JSON.stringify(closeMeta)); } catch {} }, [closeMeta]);
  const closeDay = (date, counts, meta) => {
    setStockCounts((prev) => ({ ...prev, [date]: counts }));
    setCloseMeta((prev) => ({ ...prev, [date]: { ...(meta || {}) } }));
  };
  const reopenDay = (date) => {
    setStockCounts((prev) => { const n = { ...prev }; delete n[date]; return n; });
    setCloseMeta((prev) => { const n = { ...prev }; delete n[date]; return n; });
  };
  // การเลี้ยงรายวัน (ฟอร์มตรวจติดตามการเลี้ยงไก่ไข่) — {date:{houseId:{loss,feed,water,light,meds,note}}} + รุ่นการเลี้ยงต่อโรงเรือน
  const [rearingByDate, setRearingByDate] = useState(() => { try { return JSON.parse(localStorage.getItem("eggRearing") || "{}"); } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem("eggRearing", JSON.stringify(rearingByDate)); } catch {} }, [rearingByDate]);
  const [flocks, setFlocks] = useState(() => { try { return JSON.parse(localStorage.getItem("eggFlocks") || "{}"); } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem("eggFlocks", JSON.stringify(flocks)); } catch {} }, [flocks]);
  const saveFlock = (houseId, f) => setFlocks((prev) => ({ ...prev, [houseId]: f }));
  const saveRearing = (date, houseId, data) => {
    setRearingByDate((prev) => {
      const next = { ...prev, [date]: { ...(prev[date] || {}), [houseId]: data } };
      // ไก่คงเหลือ (เริ่มเลี้ยง − คัดสะสม − ตายสะสม) → อัปเดตยอดไก่ในหน้าผลผลิตของวันเดียวกันอัตโนมัติ
      const fl = flocks[houseId];
      if (fl?.startCount) {
        const cum = rearingCum(next, houseId, date, fl);
        const remain = fl.startCount - cum.total;
        setProductionByDate((pp) => {
          const dayHouses = pp[date];
          if (!dayHouses || !dayHouses.some((h) => h.id === houseId)) return pp;
          return { ...pp, [date]: dayHouses.map((h) => h.id === houseId ? { ...h, chickens: remain } : h) };
        });
      }
      return next;
    });
  };

  // เสมียนบันทึกรับอาหารเข้า (ช่องทางที่ 2 — รีเช็คกับบันทึกของสัตวบาล) [{id,date,houseId,silo,kg,by,ts}]
  const [feedDeliveries, setFeedDeliveries] = useState(() => { try { return JSON.parse(localStorage.getItem("eggFeedDeliveries") || "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("eggFeedDeliveries", JSON.stringify(feedDeliveries)); } catch {} }, [feedDeliveries]);
  const addFeedDelivery = (x) => setFeedDeliveries((prev) => [...prev, x]);
  const deleteFeedDelivery = (id) => setFeedDeliveries((prev) => prev.filter((x) => x.id !== id));
  // 🧪 การทดลองยา/สารเสริม [{id,name,houseId,startDate,endDate,note}]
  const [medTrials, setMedTrials] = useState(() => { try { return JSON.parse(localStorage.getItem("eggMedTrials") || "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("eggMedTrials", JSON.stringify(medTrials)); } catch {} }, [medTrials]);
  const addMedTrial = (t) => setMedTrials((prev) => [...prev, t]);
  const deleteMedTrial = (id) => setMedTrials((prev) => prev.filter((x) => x.id !== id));
  // 💰 บัญชีต้นทุน — ค่าใช้จ่าย 6 หมวด [{id, date, cat, houseId("" = ทั้งฟาร์ม), amount, note, ts}]
  const [expenses, setExpenses] = useState(() => { try { return JSON.parse(localStorage.getItem("eggExpenses") || "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("eggExpenses", JSON.stringify(expenses)); } catch {} }, [expenses]);
  const addExpense = (x) => setExpenses((prev) => [x, ...prev]);
  const deleteExpense = (id) => setExpenses((prev) => prev.filter((x) => x.id !== id));

  // 💊 สต๊อกยาและวิตามิน — แคตตาล็อก (seed จากชีต 7/7/69 ; เก็บถาวรเมื่อมีแก้ไข/เพิ่ม)
  const [medStock, setMedStock] = useState(() => {
    try { const st = JSON.parse(localStorage.getItem("eggMedStock") || "[]"); return st.length ? st : MED_STOCK_SEED; }
    catch { return MED_STOCK_SEED; }
  });
  useEffect(() => { try { localStorage.setItem("eggMedStock", JSON.stringify(medStock)); } catch {} }, [medStock]);
  const addMedItem = (it) => setMedStock((prev) => [...prev, it]);
  const updateMedItem = (id, patch) => setMedStock((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));
  // สมุดวัคซีนประจำหลัง {houseId: [rows]} — H7 seed จากใบบันทึกวัคซีนฟาร์มอนุบาล
  const [vaccines, setVaccines] = useState(() => {
    try { const st = localStorage.getItem("eggVaccines"); return st ? JSON.parse(st) : VACCINE_SEED; }
    catch { return VACCINE_SEED; }
  });
  useEffect(() => { try { localStorage.setItem("eggVaccines", JSON.stringify(vaccines)); } catch {} }, [vaccines]);
  const addVaccine = (hid, row) => setVaccines((p) => ({ ...p, [hid]: [...(p[hid] || []), { ...row, id: "VC" + Date.now(), src: "ฟาร์มเรา" }] }));   // รายการที่ฟาร์มเราทำเอง (seed = ฟาร์มต้นทาง)
  const deleteVaccine = (hid, id) => setVaccines((p) => ({ ...p, [hid]: (p[hid] || []).filter((r) => r.id !== id) }));
  // สมุดผลตรวจแล็บประจำหลัง {houseId: [rows]} — เจาะเลือด (serology) / เก็บซาก (necropsy) ส่งตรวจ
  const [labTests, setLabTests] = useState(() => { try { return JSON.parse(localStorage.getItem("eggLabTests") || "{}"); } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem("eggLabTests", JSON.stringify(labTests)); } catch {} }, [labTests]);
  const addLabTest = (hid, row) => setLabTests((p) => ({ ...p, [hid]: [...(p[hid] || []), { ...row, id: "LT" + Date.now() }] }));
  const deleteLabTest = (hid, id) => setLabTests((p) => ({ ...p, [hid]: (p[hid] || []).filter((r) => r.id !== id) }));
  // ใบจองไข่ล่วงหน้า (ลูกค้าจอง / เราวางแผน) [{id, customerId, date(ISO วันส่ง), items:{pid:qty}, note, ts}]
  const [bookings, setBookings] = useState(() => { try { return JSON.parse(localStorage.getItem("eggBookings") || "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("eggBookings", JSON.stringify(bookings)); } catch {} }, [bookings]);
  const addBooking = (b) => setBookings((prev) => [{ ...b, id: "BK" + Date.now(), ts: Date.now() }, ...prev]);
  const updateBooking = (id, patch) => setBookings((prev) => prev.map((b) => b.id === id ? { ...b, ...patch } : b));
  const deleteBooking = (id) => setBookings((prev) => prev.filter((b) => b.id !== id));
  // ยอดประมาณการไข่ต่อวัน (แก้ทับค่าที่ระบบเดาได้) {dateISO: {pid: qtyแผง}}
  const [planEstimates, setPlanEstimates] = useState(() => { try { return JSON.parse(localStorage.getItem("eggPlanEstimates") || "{}"); } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem("eggPlanEstimates", JSON.stringify(planEstimates)); } catch {} }, [planEstimates]);
  const setPlanEstimate = (dateISO, pid, qty) => setPlanEstimates((p) => ({ ...p, [dateISO]: { ...(p[dateISO] || {}), [pid]: qty } }));
  // รับยาเข้าสต๊อก [{id, date, medId, qty, by}]
  const [medReceipts, setMedReceipts] = useState(() => { try { return JSON.parse(localStorage.getItem("eggMedReceipts") || "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("eggMedReceipts", JSON.stringify(medReceipts)); } catch {} }, [medReceipts]);
  const addMedReceipt = (r) => setMedReceipts((prev) => [r, ...prev]);
  const deleteMedReceipt = (id) => setMedReceipts((prev) => prev.filter((x) => x.id !== id));
  // ยอดต่อยา: เบิกใช้ = Σ จากบันทึกให้ยารายวัน (จับคู่ "ชื่อ" ตรงกัน, นับตั้งแต่วันตั้งต้นสต๊อกของยานั้น) ; คงเหลือ = ยกมา + รับ − เบิก
  const medInfo = useMemo(() => {
    const m = {};
    medStock.forEach((it) => {
      const nm = (it.name || "").trim();
      let used = 0;
      Object.keys(rearingByDate).forEach((d) => {
        if (it.since && d < it.since) return;
        Object.values(rearingByDate[d] || {}).forEach((r) => {
          (r?.medsList || []).forEach((x) => { if ((x.name || "").trim() === nm) used += parseFloat(x.qty) || 0; });
        });
      });
      const recv = medReceipts.filter((r) => r.medId === it.id).reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
      m[nm] = { id: it.id, remain: (it.opening || 0) + recv - used, used, recv, price: it.price, unit: it.unit || "หน่วย" };
    });
    return m;
  }, [medStock, medReceipts, rearingByDate]);
  // ค่ายาที่ใช้จริง ต่อเดือน/ต่อหลัง (จำนวน × ราคา จากสต๊อก) — ป้อนเข้าบัญชีต้นทุนหมวด "ค่ายา+วัสดุสิ้นเปลือง" อัตโนมัติ
  const medCostByMonth = useMemo(() => {
    const priceByName = {};
    medStock.forEach((it) => { if (it.price) priceByName[(it.name || "").trim()] = { price: it.price, since: it.since }; });
    const m = {};
    Object.keys(rearingByDate).forEach((d) => {
      Object.entries(rearingByDate[d] || {}).forEach(([hid, r]) => {
        (r?.medsList || []).forEach((x) => {
          const p = priceByName[(x.name || "").trim()]; const q = parseFloat(x.qty) || 0;
          if (!p || !q || (p.since && d < p.since)) return;
          const ym = d.slice(0, 7);
          m[ym] = m[ym] || { total: 0, byHouse: {} };
          m[ym].total += q * p.price;
          m[ym].byHouse[hid] = (m[ym].byHouse[hid] || 0) + q * p.price;
        });
      });
    });
    return m;
  }, [medStock, rearingByDate]);
  // 🌾 อาหารที่กินจริง ต่อเดือน/ต่อหลัง (กก. จากบันทึกการเลี้ยง ไซโล1+2) — × ราคาอาหาร = ค่าอาหารอัตโนมัติ
  const [feedPrice, setFeedPrice] = useState(() => { const v = parseFloat(localStorage.getItem("eggFeedPrice")); return isNaN(v) ? 0 : v; });
  useEffect(() => { try { localStorage.setItem("eggFeedPrice", String(feedPrice)); } catch {} }, [feedPrice]);
  const feedUseByMonth = useMemo(() => {
    const m = {};
    Object.keys(rearingByDate).forEach((d) => {
      const ym = d.slice(0, 7);
      Object.entries(rearingByDate[d] || {}).forEach(([hid, r]) => {
        const kg = (parseFloat(r?.feed?.s1used) || 0) + (parseFloat(r?.feed?.s2used) || 0);
        if (!kg) return;
        m[ym] = m[ym] || { kg: 0, byHouse: {} };
        m[ym].kg += kg;
        m[ym].byHouse[hid] = (m[ym].byHouse[hid] || 0) + kg;
      });
    });
    return m;
  }, [rearingByDate]);
  const feedCostByMonth = useMemo(() => {
    if (!feedPrice) return {};
    const m = {};
    Object.entries(feedUseByMonth).forEach(([ym, v]) => {
      m[ym] = { total: v.kg * feedPrice, kg: v.kg, byHouse: {} };
      Object.entries(v.byHouse).forEach(([hid, kg]) => { m[ym].byHouse[hid] = kg * feedPrice; });
    });
    return m;
  }, [feedUseByMonth, feedPrice]);

  // สต็อกแผงดีในฟาร์ม + ใบรับแผงคืน (RT) — เก็บถาวร (เดิมอยู่แค่ในหน่วยความจำ รีเฟรชแล้วหาย)
  const [trayStock, setTrayStock] = useState(() => { try { return { ใหญ่: 1240, เล็ก: 860, ...JSON.parse(localStorage.getItem("eggTrayStock") || "{}") }; } catch { return { ใหญ่: 1240, เล็ก: 860 }; } });
  useEffect(() => { try { localStorage.setItem("eggTrayStock", JSON.stringify(trayStock)); } catch {} }, [trayStock]);
  const [trayRecords, setTrayRecords] = useState(() => { try { const st = JSON.parse(localStorage.getItem("eggTrayRecords") || "[]"); return st.length ? st : TRAY_SEED; } catch { return TRAY_SEED; } });
  useEffect(() => { try { localStorage.setItem("eggTrayRecords", JSON.stringify(trayRecords)); } catch {} }, [trayRecords]);
  // สมุดเหตุการณ์แผงต่อลูกค้า (กติกาใหม่ 2026-07-06): ชำรุดสะสมจนกว่าจะบันทึก 2 เหตุการณ์นี้แยกกันคนละจังหวะ
  // [{id, type: "replace"(รับแผงดีทดแทน — ตัดยอดค้าง) | "brokenBack"(คืนแผงชำรุดให้ลูกค้า), customerId, date(ISO), ใหญ่, เล็ก, by, ts}]
  const [trayEvents, setTrayEvents] = useState(() => { try { return JSON.parse(localStorage.getItem("eggTrayEvents") || "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("eggTrayEvents", JSON.stringify(trayEvents)); } catch {} }, [trayEvents]);
  const addTrayEvent = (e) => setTrayEvents((prev) => [e, ...prev]);
  const deleteTrayEvent = (id) => setTrayEvents((prev) => prev.filter((x) => x.id !== id));

  // ประวัติบิลทั้งหมด (ใช้ในประวัติบิล / บัญชี / แดชบอร์ด) — เก็บลง localStorage เพื่อเรียกดู/Export บิลเก่าย้อนหลังได้
  const [bills, setBills] = useState(() => { try { return JSON.parse(localStorage.getItem("eggBills") || "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("eggBills", JSON.stringify(bills)); } catch {} }, [bills]);
  // การรับชำระเงิน: { billNo: { paid, date, method } } — เก็บถาวร (ตัดรูปสลิปออกกันเต็มพื้นที่ ; สถานะ/วันชำระยังอยู่)
  const [payments, setPayments] = useState(() => { try { return JSON.parse(localStorage.getItem("eggPayments") || "{}"); } catch { return {}; } });
  useEffect(() => {
    try { const lite = {}; Object.entries(payments).forEach(([k, v]) => { lite[k] = { paid: v.paid, date: v.date, method: v.method, slip: null }; }); localStorage.setItem("eggPayments", JSON.stringify(lite)); } catch {}
  }, [payments]);

  // บิลร่าง (draft) — เก็บลง localStorage เพื่อไม่ให้หายเมื่อรีเฟรช
  const [drafts, setDrafts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("eggDrafts") || "[]"); }
    catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("eggDrafts", JSON.stringify(drafts)); } catch {}
  }, [drafts]);

  // ยอดขายต่อ "วันทำงาน" — แหล่งข้อมูลเดียว = bills ที่บันทึกถาวร → คงอยู่หลังรีเฟรช, สต็อกไม่มีวันหลุดจากบิล
  // โครงสร้าง: salesByDay[workDay][productId][customerId] = แผง
  const salesByDay = useMemo(() => {
    const m = {};
    (bills || []).forEach((b) => {
      const wd = b.workDay || isoFromTs(b.ts);
      (b.items || []).forEach((it) => {
        if (!it.productId) return;                       // ข้ามรายการมัดจำ (ไม่มี productId)
        m[wd] = m[wd] || {};
        m[wd][it.productId] = m[wd][it.productId] || {};
        m[wd][it.productId][b.customerId] = (m[wd][it.productId][b.customerId] || 0) + (it.qty || 0);
      });
    });
    return m;
  }, [bills]);
  // ราคาอ้างอิงต่อแผง = ราคาล่าสุดจากบิลจริง (บิลใหม่สุดชนะ) ⊕ fallback — ใช้ตีมูลค่าส่วนต่างตอนปิดยอด
  const refPrices = useMemo(() => {
    const m = { ...REF_PRICE_FALLBACK };
    for (let i = bills.length - 1; i >= 0; i--) {
      (bills[i].items || []).forEach((it) => { const p = parseFloat(it.price) || 0; if (it.productId && p > 0) m[it.productId] = p; });
    }
    return m;
  }, [bills]);
  const salesTotals = useMemo(() => {   // ยอดขายรวมต่อสินค้า ของวันทำงานปัจจุบัน
    const day = salesByDay[stockDay] || {};
    const m = {};
    Object.entries(day).forEach(([pid, perCust]) => { m[pid] = Object.values(perCust).reduce((s, q) => s + (q || 0), 0); });
    return m;
  }, [salesByDay, stockDay]);
  const stock = useMemo(() => {   // สต็อกขายได้ = ยกมา(เมื่อวานคงเหลือ) + ผลิตวันนี้(สด) − ขายแล้ว
    const opening = openingForDay(stockDay, productionByDate, stockCounts);
    const prod = productionToStock(productionByDate[stockDay] || []);
    const s = {};
    ALL_PRODUCTS.forEach((p) => { s[p.id] = (opening[p.id] || 0) + (prod[p.id] || 0) - (salesTotals[p.id] || 0); });
    return s;
  }, [productionByDate, salesTotals, stockDay, stockCounts]);

  const addBill = (bill) => {
    const b = { ...bill, workDay: bill.workDay || stockDay };  // ผูกบิลกับ "วันทำงาน" (วันผลิตล่าสุด) เพื่อคิดสต็อก/คลังรายวัน
    setBills((prev) => [b, ...prev]);
    // ถ้าบิลมีแผงรับคืน → สร้างใบ "รอคัด" อัตโนมัติ เข้าคิวคัดแยก (fromBill = กันนับซ้ำใน trayAccountOf)
    const ts = bill.traySummary;
    const recvBig = ts ? (ts.blackReturnedBig || 0) + (ts.orangeReturned || 0) : 0;  // แผงส้ม = ใหญ่หมด
    const recvSmall = ts ? (ts.blackReturnedSmall || 0) : 0;
    if (recvBig + recvSmall > 0) {
      setTrayRecords((prev) => [{
        id: "RT-" + String(prev.length + 1).padStart(4, "0"),
        customerId: bill.customerId, date: bill.date,
        received: { ใหญ่: recvBig, เล็ก: recvSmall },
        status: "รอคัด", sorted: null, sorter: "", sortedDate: "",
        replacedGood: { ใหญ่: 0, เล็ก: 0 }, replacements: [], fromBill: bill.no,
      }, ...prev]);
    }
  };
  // รับชำระแบบ "สะสม" — ยอดที่กรอกคือเงินงวดนี้ (โมดัลตั้งค่าเริ่ม = ยอดคงค้าง) จึงบวกทับของเดิม ไม่เขียนทับ (กันงวดก่อนหน้าหาย)
  const recordPayment = (billNo, amount, method, slip) =>
    setPayments((prev) => {
      const prevPaid = prev[billNo]?.paid || 0;
      return { ...prev, [billNo]: { paid: prevPaid + amount, date: new Date().toLocaleDateString("th-TH"), method, slip: slip || prev[billNo]?.slip || null } };
    });

  return (
    <div style={S.app}>
      <style>{CSS}</style>
      <header style={S.header}>
        <div style={S.brand}>
          <div style={S.brandMark}><Egg size={20} /></div>
          <div>
            <div style={S.brandName}>ฟาร์มไข่สมบูรณ์</div>
            <div style={S.brandSub}>บริษัท เอสเจเอฟ ฟาร์ม จำกัด · ต้นแบบ · 1 แผง = 30 ฟอง</div>
          </div>
        </div>
        <nav className="mainNav" style={S.nav}>
          {[
            { id: "sales", icon: <ShoppingCart size={16} />, label: "ขายไข่" },
            { id: "bills", icon: <FileText size={16} />, label: "ประวัติบิล" },
            { id: "account", icon: <Wallet size={16} />, label: "บัญชีลูกหนี้" },
            { id: "dash", icon: <LayoutDashboard size={16} />, label: "แดชบอร์ด" },
            { id: "stockprod", icon: <Warehouse size={16} />, label: "คลัง·ผลผลิต" },
            { id: "book", icon: <Calendar size={16} />, label: "จอง·วางแผน" },
            { id: "tray", icon: <RotateCcw size={16} />, label: "บัญชีแผงไข่" },
            { id: "rear", icon: <ClipboardCheck size={16} />, label: "เก็บสถิติการเลี้ยง" },
            { id: "feed", icon: <Wheat size={16} />, label: "อาหารไก่" },
            { id: "med", icon: <Pill size={16} />, label: "ยาและวิตามิน" },
            { id: "cost", icon: <Calculator size={16} />, label: "บัญชีต้นทุน" },
          ].map((t) => (
            <button
              key={t.id}
              style={{ ...S.navBtn, ...(view === t.id ? S.navBtnActive : {}) }}
              onClick={() => setView(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </header>

      {view === "sales" && <SalesView stock={stock} addBill={addBill} bills={bills} payments={payments} trayStock={trayStock} setTrayStock={setTrayStock} trayRecords={trayRecords} trayEvents={trayEvents} drafts={drafts} setDrafts={setDrafts} />}
      {view === "bills" && <BillHistoryView bills={bills} payments={payments} />}
      {view === "account" && <AccountView bills={bills} payments={payments} recordPayment={recordPayment} />}
      {view === "dash" && <DashboardView bills={bills} payments={payments} />}
      {view === "stockprod" && <StockProdView
        stockProps={{ salesByDay, productionByDate, defaultDay: stockDay, stockCounts, closeMeta, refPrices, onCloseDay: closeDay, onReopenDay: reopenDay }}
        prodProps={{ houses, setHouses, prodDate, setProdDate, production: productionByDate }} />}
      {view === "rear" && <RearingView rearingByDate={rearingByDate} saveRearing={saveRearing} flocks={flocks} saveFlock={saveFlock} production={productionByDate} medTrials={medTrials} medStock={medStock} medInfo={medInfo} vaccines={vaccines} addVaccine={addVaccine} deleteVaccine={deleteVaccine} labTests={labTests} addLabTest={addLabTest} deleteLabTest={deleteLabTest} />}
      {view === "feed" && <FeedView rearingByDate={rearingByDate} flocks={flocks} production={productionByDate} feedDeliveries={feedDeliveries} addFeedDelivery={addFeedDelivery} deleteFeedDelivery={deleteFeedDelivery} feedPrice={feedPrice} setFeedPrice={setFeedPrice} feedUseByMonth={feedUseByMonth} />}
      {view === "med" && <MedView medTrials={medTrials} addMedTrial={addMedTrial} deleteMedTrial={deleteMedTrial} rearingByDate={rearingByDate} production={productionByDate} medStock={medStock} medInfo={medInfo} medReceipts={medReceipts} addMedItem={addMedItem} updateMedItem={updateMedItem} addMedReceipt={addMedReceipt} medCostByMonth={medCostByMonth} />}
      {view === "cost" && <CostView expenses={expenses} addExpense={addExpense} deleteExpense={deleteExpense} production={productionByDate} medCostByMonth={medCostByMonth} feedCostByMonth={feedCostByMonth} feedPrice={feedPrice} bills={bills} />}
      {view === "tray" && <PanelTrayView trayStock={trayStock} setTrayStock={setTrayStock} bills={bills} trayRecords={trayRecords} setTrayRecords={setTrayRecords} trayEvents={trayEvents} addTrayEvent={addTrayEvent} deleteTrayEvent={deleteTrayEvent} />}
      {view === "book" && <BookingPlanView bookings={bookings} addBooking={addBooking} updateBooking={updateBooking} deleteBooking={deleteBooking} production={productionByDate} planEstimates={planEstimates} setPlanEstimate={setPlanEstimate} />}
    </div>
  );
}

/* ============================================================
   PromptPay QR — สร้าง QR จาก payload ผ่าน qrcode CDN
============================================================ */
function PromptPayQR({ id, amount }) {
  const ref = React.useRef(null);
  const [err, setErr] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const payload = promptpayPayload(id, amount);
    const draw = (QR) => {
      if (cancelled || !ref.current) return;
      QR.toCanvas(ref.current, payload, { width: 150, margin: 1, errorCorrectionLevel: "M" }, (e) => { if (e) setErr(true); });
    };
    if (window.QRCode) { draw(window.QRCode); return () => { cancelled = true; }; }
    import("https://esm.sh/qrcode@1.5.3")
      .then((mod) => { const QR = mod.default || mod; window.QRCode = QR; draw(QR); })
      .catch(() => setErr(true));
    return () => { cancelled = true; };
  }, [id, amount]);

  if (err) return <div style={S.qrError}>ไม่สามารถสร้าง QR ได้</div>;
  return <canvas ref={ref} style={S.qrCanvas} />;
}

// พิมพ์ใบเสร็จ: จับภาพ #delivery-note ด้วย html2canvas (QR/สไตล์ติดครบ) แล้วสั่งพิมพ์ผ่าน iframe ซ่อน (ไม่โดน popup block)
async function printReceiptImage(elId = "delivery-note") {
  const el = document.getElementById(elId);
  if (!el) return;
  const h2c = window.html2canvas || await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload = () => resolve(window.html2canvas);
    s.onerror = reject;
    document.body.appendChild(s);
  });
  const canvas = await h2c(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const dataUrl = canvas.toDataURL("image/png");
  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write('<html><head><title>ใบเสร็จ</title><style>@page{margin:8mm}body{margin:0}img{width:100%}</style></head><body><img src="' + dataUrl + '"></body></html>');
  doc.close();
  const img = doc.querySelector("img");
  const go = () => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {} setTimeout(() => { try { document.body.removeChild(iframe); } catch (e) {} }, 2000); };
  if (img.complete) go(); else img.onload = go;
}

/* ============================================================
   หน้าจอ: ขายไข่  (ตรงตามฟอร์มบิลจริง)
============================================================ */
function SalesView({ stock, addBill, bills, payments, trayStock, setTrayStock, trayRecords = [], trayEvents = [], drafts = [], setDrafts }) {
  const [customerId, setCustomerId] = useState(null);
  const [editingDraftId, setEditingDraftId] = useState(null);  // กำลังแก้บิลร่างใบไหนอยู่
  const [custSearch, setCustSearch] = useState("");
  const [custGroupFilter, setCustGroupFilter] = useState("all");  // ชิปกรองหมวดหมู่ลูกค้า: "all" = ทุกกลุ่ม
  const [showAddCust, setShowAddCust] = useState(false);  // เปิดฟอร์มเพิ่มลูกค้าใหม่
  const [codesMode, setCodesMode] = useState(null);       // เปิดรายการลูกค้า: null=ปิด, "select"=เลือกไปออกบิล, "edit"=เลือกไปแก้ไข
  const [editingCust, setEditingCust] = useState(null);   // ลูกค้าที่กำลังแก้ไข (null = ไม่ได้แก้)
  const [, setCustVersion] = useState(0);                 // bump เพื่อ re-render หลังแก้ข้อมูลลูกค้า (CUSTOMERS ถูก mutate)
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("เบอร์");
  const [cart, setCart] = useState({});            // { productId: {qty, price} }
  // แผงที่ลูกค้ารับคำนวณอัตโนมัติ = แผงไข่ × 1.1 ; ช่องเหล่านี้คือจำนวนที่ลูกค้าคืนในบิลนี้
  const [trayReturnBlackBig, setTrayReturnBlackBig] = useState("");      // แผงดำใหญ่ที่ลูกค้าคืน
  const [trayReturnBlackSmall, setTrayReturnBlackSmall] = useState("");  // แผงดำเล็กที่ลูกค้าคืน
  const [trayReturnOrange, setTrayReturnOrange] = useState("");          // แผงส้มที่ลูกค้าคืน (ใหญ่หมด)
  const [klaUseBlack, setKlaUseBlack] = useState(false);         // ลูกค้าขอใส่แผงดำแทนแผงส้ม (ไข่คละ)
  const [shortMode, setShortMode] = useState("charge");          // แผงที่คืนขาด: "charge"=คิดเงินมัดจำ, "carry"=ยกเป็นแผงค้างคืน
  const [discount, setDiscount] = useState("");    // ส่วนลดท้ายบิล (บาท)
  const [deliveryFee, setDeliveryFee] = useState(""); // ค่ารถขนส่ง (บาท)
  const [note, setNote] = useState("");            // หมายเหตุท้ายบิล
  const [billRef, setBillRef] = useState("");      // เลขอ้างอิง / ใบสั่งซื้อ (PO)
  const [whtPct, setWhtPct] = useState("");        // หัก ณ ที่จ่าย (%)
  const [confirmedBill, setConfirmedBill] = useState(null);
  const [savingImg, setSavingImg] = useState(false);
  const [printing, setPrinting] = useState(false);
  const printBill = async () => { setPrinting(true); try { await printReceiptImage("delivery-note"); } catch (e) { alert("พิมพ์ไม่สำเร็จ ลองใหม่ หรือใช้ 'บันทึกเป็นรูป' แล้วสั่งพิมพ์"); } finally { setPrinting(false); } };

  const customer = CUSTOMERS.find((c) => c.id === customerId);

  // ยอดค้างยกมาของลูกค้า = ผลรวม (ยอดบิล − ที่ชำระแล้ว) ของบิลเก่าที่ยังไม่ปิด
  const carryOver = useMemo(() => {
    if (!customerId) return 0;
    return bills
      .filter((b) => b.customerId === customerId)
      .reduce((s, b) => s + Math.max(0, b.total - (payments[b.no]?.paid || 0)), 0);
  }, [customerId, bills, payments]);
  // ราคาล่าสุดต่อสินค้า = จากประวัติบิลจริงของลูกค้าคนนี้ (บิลใหม่สุดชนะ) แล้วค่อย fallback ไปที่ค่า seed
  const lastPriceMap = useMemo(() => {
    const m = {};
    if (!customerId) return m;
    // bills เก็บใหม่สุดไว้ต้น array → ไล่จากท้าย (เก่าสุด) มาต้น เพื่อให้บิลใหม่กว่าเขียนทับ
    for (let k = bills.length - 1; k >= 0; k--) {
      const b = bills[k];
      if (b.customerId !== customerId) continue;
      (b.items || []).forEach((i) => {
        const pr = parseFloat(i.price) || 0;
        if (pr > 0) m[i.productId] = { price: pr, date: b.date };
      });
    }
    return m;
  }, [bills, customerId]);
  const lastPriceOf = (pid) => (customerId ? (lastPriceMap[pid] || LAST_PRICES[customerId]?.[pid] || null) : null); // { price, date } | null
  const lastPriceValue = (pid) => lastPriceOf(pid)?.price ?? null;

  const visibleProducts = PRODUCTS[activeGroup].filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (p, amount = 1) => {
    setCart((prev) => {
      const ex = prev[p.id];
      return { ...prev, [p.id]: { qty: (ex?.qty ?? 0) + amount, price: ex?.price ?? lastPriceValue(p.id) ?? "" } };
    });
  };
  const setQty = (pid, qty) => {
    if (qty <= 0) {
      setCart((prev) => { const n = { ...prev }; delete n[pid]; return n; });
      return;
    }
    setCart((prev) => ({ ...prev, [pid]: { ...prev[pid], qty } }));
  };
  const setPrice = (pid, price) => setCart((prev) => ({ ...prev, [pid]: { ...prev[pid], price } }));
  const setWeight = (pid, weight) => setCart((prev) => ({ ...prev, [pid]: { ...prev[pid], weight } }));  // นน./10แผง (กก) สำหรับไข่ตกเกรดที่ชั่งขาย

  const cartItems = Object.entries(cart).map(([pid, it]) => {
    const priceNum = parseFloat(it.price) || 0;
    return { productId: pid, product: PRODUCT_BY_ID[pid], ...it, subtotal: it.qty * priceNum };
  }).sort((a, b) => {                                           // เรียงตามเบอร์ (n0,n1,...) ไม่ใช่ลำดับที่กด
    const ia = STOCK_ORDER.indexOf(a.productId), ib = STOCK_ORDER.indexOf(b.productId);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const eggTotal = cartItems.reduce((s, i) => s + i.subtotal, 0);
  const totalPrang = cartItems.reduce((s, i) => s + i.qty, 0);
  // ยอดแผงรับ = ยอดไข่ × 1.1 (จำนวนแผงจริงที่ลูกค้ารับ)
  const trayReceivedTotal = Math.round(totalPrang * 1.1);

  // แยกแผงไข่ตามชนิดแผง: ไข่คละ → แผงส้ม (เว้นแต่ลูกค้าขอแผงดำ) ; อื่นๆ → แผงดำ
  const klaTrays = cartItems.filter((i) => i.product.group === "คละ").reduce((s, i) => s + i.qty, 0);
  const otherTrays = totalPrang - klaTrays;
  const blackEggTrays = otherTrays + (klaUseBlack ? klaTrays : 0);
  const orangeEggTrays = klaUseBlack ? 0 : klaTrays;
  // แผงที่ลูกค้ารับ = แผงไข่ × 1.1 (ไข่ทุก 10 แผง มีแผง 11 ใบ)
  const blackPanels = Math.round(blackEggTrays * 1.1);
  const orangePanels = Math.round(orangeEggTrays * 1.1);
  // แยกขนาดแผงดำอัตโนมัติจากเบอร์ไข่: เฉพาะเบอร์ 2-5 = แผงเล็ก ; ที่เหลือ (เบอร์ 0,1 + จัมโบ้ + ตกเกรด + คละ) = แผงใหญ่
  const bigBlackEggTrays = cartItems.reduce((s, i) => {
    const onBlack = i.product.group !== "คละ" || klaUseBlack;   // คละปกติอยู่แผงส้ม
    if (!onBlack) return s;
    const isBig = !SMALL_TRAY_IDS.has(i.productId);
    return s + (isBig ? i.qty : 0);
  }, 0);
  const blackBigN = Math.min(Math.round(bigBlackEggTrays * 1.1), blackPanels);
  const blackSmallN = blackPanels - blackBigN;

  // ค่ามัดจำ = (รับ − คืน) × อัตราต่อชนิดแผง ; ถ้าติดลบ = 0
  const blackReturnBig = parseInt(trayReturnBlackBig) || 0;
  const blackReturnSmall = parseInt(trayReturnBlackSmall) || 0;
  const blackReturn = blackReturnBig + blackReturnSmall;
  const orangeReturn = parseInt(trayReturnOrange) || 0;
  const blackNet = Math.max(0, blackPanels - blackReturn);
  const orangeNet = Math.max(0, orangePanels - orangeReturn);
  const trayShortQty = blackNet + orangeNet;                 // แผงที่ลูกค้าคืนขาดบิลนี้
  // ถ้าเลือก "ยกเป็นแผงค้างคืน" → ไม่คิดเงิน (มัดจำ = 0) ; ถ้า "คิดเงิน" → คิดมัดจำตามชนิดแผง
  const depositCharge = shortMode === "carry" ? 0 : blackNet * TRAY_DEPOSIT + orangeNet * TRAY_DEPOSIT_ORANGE;
  // คืนเกิน = คืนมากกว่าที่รับไปในบิลนี้ → ส่วนเกินเข้าบัญชีแผง (ลดยอดค้างคืนเดิม)
  const blackExcess = Math.max(0, blackReturn - blackPanels);
  const orangeExcess = Math.max(0, orangeReturn - orangePanels);
  const trayExcess = blackExcess + orangeExcess;
  // บัญชีแผงเดิมของลูกค้า (ยอดค้างก่อนบิลนี้) — เพื่อให้พนักงานรู้ว่าควรเก็บคืนเพิ่มเท่าไร
  const trayAccount = customerId ? trayAccountOf(customerId, bills, trayRecords, null, trayEvents) : null;

  // รายการมัดจำสำหรับใบเสร็จ — เฉพาะโหมด "คิดเงิน" ; โหมด "ยกค้างคืน" ไม่คิดเงินจึงไม่มีบรรทัดมัดจำ
  const depositLines = shortMode === "carry" ? [] : [
    ...(blackNet > 0 ? [{ label: "ค่ามัดจำแผงดำ", qty: blackNet, rate: TRAY_DEPOSIT, amount: blackNet * TRAY_DEPOSIT }] : []),
    ...(orangeNet > 0 ? [{ label: "ค่ามัดจำแผงส้ม", qty: orangeNet, rate: TRAY_DEPOSIT_ORANGE, amount: orangeNet * TRAY_DEPOSIT_ORANGE }] : []),
  ];
  const traySummary = {
    blackSent: blackPanels, blackReturned: blackReturn, blackReturnedBig: blackReturnBig, blackReturnedSmall: blackReturnSmall, blackNet,
    orangeSent: orangePanels, orangeReturned: orangeReturn, orangeNet,
    blackExcess, orangeExcess, excess: trayExcess,
    shortMode,  // "charge" = คิดเงินมัดจำ, "carry" = ยกเป็นแผงค้างคืน (ไม่คิดเงิน)
    blackBig: blackBigN, blackSmall: blackSmallN, orangeBig: orangePanels,  // ขนาดแผงที่ให้ลูกค้า (ส้ม = ใหญ่หมด)
  };

  const deliveryFeeAmt = parseFloat(deliveryFee) || 0;       // ค่ารถขนส่ง
  const discountAmt = Math.min(parseFloat(discount) || 0, eggTotal + depositCharge + deliveryFeeAmt); // ไม่ลดเกินยอด
  const billTotal = eggTotal + depositCharge + deliveryFeeAmt - discountAmt;  // ยอดบิลนี้ (บวกค่าขนส่ง หักส่วนลด)
  const total = billTotal;                                    // ยอดที่ต้องชำระสำหรับบิลนี้
  const grandTotal = billTotal + carryOver;                   // รวมยอดค้างยกมา

  // หัก ณ ที่จ่าย — ฐาน = มูลค่าไข่หลังหักส่วนลด (ไม่รวมมัดจำแผงที่คืนได้)
  const whtRate = Math.max(0, parseFloat(whtPct) || 0);
  const whtBase = Math.max(0, eggTotal - discountAmt);
  const whtAmt = Math.round(whtBase * whtRate) / 100;         // ปัดทศนิยม 2 ตำแหน่ง
  const netPay = grandTotal - whtAmt;                         // ยอดโอนสุทธิหลังหัก ณ ที่จ่าย

  const overStock = cartItems.filter((i) => i.qty > stock[i.productId]);
  const noPrice = cartItems.filter((i) => !(parseFloat(i.price) > 0));  // รายการที่ยังไม่ใส่ราคา
  const canConfirm = customer && cartItems.length > 0 && overStock.length === 0 && noPrice.length === 0;

  const confirmBill = () => {
    // สต็อกลดอัตโนมัติจากบิลที่บันทึก (bills = แหล่งข้อมูลเดียว) — ไม่ต้องหัก state แยก
    const bill = {
      no: "IVE6906-" + String(Math.floor(Math.random() * 9000) + 1000),
      book: "086",
      customer, customerId,
      // เก็บรายการแบบเบา (ไม่พ่วง object product ทั้งก้อน เผื่อใช้ในหน้าอื่น)
      items: cartItems.map((i) => ({ productId: i.productId, name: i.product.name, qty: i.qty, price: parseFloat(i.price) || 0, weight: parseFloat(i.weight) || 0, subtotal: i.subtotal })),
      eggTotal, depositCharge, depositLines, traySummary, deliveryFee: deliveryFeeAmt, discount: discountAmt, note: note.trim(), total, totalPrang,
      billRef: billRef.trim(), whtPct: whtRate, whtBase, whtAmt, netPay,
      carryOver, grandTotal,
      date: new Date().toLocaleDateString("th-TH"),
      ts: Date.now(),
    };
    setConfirmedBill(bill);
    addBill(bill);
    // ออกบิลจากบิลร่าง → ลบร่างนั้นทิ้ง
    if (editingDraftId && setDrafts) setDrafts((prev) => prev.filter((d) => d.id !== editingDraftId));
    setEditingDraftId(null);
    setCart({});
    setTrayReturnBlackBig(""); setTrayReturnBlackSmall(""); setTrayReturnOrange(""); setKlaUseBlack(false); setShortMode("charge");
    setDiscount(""); setDeliveryFee(""); setNote(""); setBillRef(""); setWhtPct("");
  };

  const newBill = () => { setConfirmedBill(null); setCustomerId(null); };

  // ---------- บิลร่าง (draft) ----------
  const resetForm = () => {
    setEditingDraftId(null);
    setCart({});
    setTrayReturnBlackBig(""); setTrayReturnBlackSmall(""); setTrayReturnOrange(""); setKlaUseBlack(false); setShortMode("charge");
    setDiscount(""); setDeliveryFee(""); setNote(""); setBillRef(""); setWhtPct("");
  };
  const saveDraft = () => {
    if (!customer || cartItems.length === 0 || !setDrafts) return;
    const id = editingDraftId || ("d" + Date.now());
    const draft = {
      id,
      date: new Date().toLocaleDateString("th-TH"),
      savedAt: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      ts: Date.now(),
      customerId, customerName: customer.name,
      cart: JSON.parse(JSON.stringify(cart)),
      trayReturnBlackBig, trayReturnBlackSmall, trayReturnOrange, klaUseBlack, shortMode,
      discount, deliveryFee, note, billRef, whtPct,
      itemCount: cartItems.length, totalPrang, total,
    };
    setDrafts((prev) => [draft, ...prev.filter((d) => d.id !== id)]);
    resetForm();
    setCustomerId(null);  // กลับไปหน้าเลือกลูกค้า จะเห็นร่างที่เพิ่งบันทึก
  };
  const loadDraft = (d) => {
    setCustomerId(d.customerId);
    setCart(d.cart || {});
    setTrayReturnBlackBig(d.trayReturnBlackBig || "");
    setTrayReturnBlackSmall(d.trayReturnBlackSmall || "");
    setTrayReturnOrange(d.trayReturnOrange || "");
    setKlaUseBlack(!!d.klaUseBlack);
    setShortMode(d.shortMode || "charge");
    setDiscount(d.discount || "");
    setDeliveryFee(d.deliveryFee || "");
    setNote(d.note || "");
    setBillRef(d.billRef || "");
    setWhtPct(d.whtPct || "");
    setEditingDraftId(d.id);
  };
  const deleteDraft = (id) => setDrafts && setDrafts((prev) => prev.filter((d) => d.id !== id));
  const draftsByDate = drafts.reduce((acc, d) => { (acc[d.date] = acc[d.date] || []).push(d); return acc; }, {});
  const draftActionBtn = { padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 };

  // โหลด html2canvas จาก CDN (ครั้งเดียว)
  const loadHtml2Canvas = () => new Promise((resolve, reject) => {
    if (window.html2canvas) return resolve(window.html2canvas);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload = () => resolve(window.html2canvas);
    s.onerror = reject;
    document.body.appendChild(s);
  });

  const saveBillImage = async () => {
    const el = document.getElementById("delivery-note");
    if (!el) return;
    setSavingImg(true);
    try {
      const h2c = await loadHtml2Canvas();
      const canvas = await h2c(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const link = document.createElement("a");
      link.download = `ใบส่งของ_${confirmedBill.customer.name}_${confirmedBill.no}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      alert("ไม่สามารถสร้างรูปได้ กรุณาลองใหม่ หรือแคปหน้าจอแทน");
    } finally {
      setSavingImg(false);
    }
  };

  // ---------- บิลที่ยืนยันแล้ว ----------
  if (confirmedBill) {
    const b = confirmedBill;
    return (
      <div style={S.stage}>
        <div style={S.billDone}>
          <div style={S.billDoneIcon}><Check size={28} /></div>
          <div style={S.billDoneTitle}>ออกบิลเรียบร้อย · ตัดสต็อกแล้ว</div>
        </div>

        {/* ===== ใบส่งสินค้า/ใบเสร็จรับเงิน (พื้นที่จับภาพ) ===== */}
        <div id="delivery-note" style={S.note}>
          <div style={S.noteTopStripe} />
          <div style={S.noteHead}>
            <div style={S.noteBrand}>
              <div style={S.noteLogo}><Egg size={26} /></div>
              <div>
                <div style={S.noteFarmName}>{COMPANY.name}</div>
                <div style={S.noteFarmSub}>{COMPANY.addr1} {COMPANY.addr2}</div>
                <div style={S.noteFarmTel}>เลขประจำตัวผู้เสียภาษี {COMPANY.taxId} ({COMPANY.branch})</div>
                <div style={S.noteFarmTel}>โทร. {COMPANY.tel}</div>
              </div>
            </div>
            <div style={S.noteMeta}>
              <div style={S.noteDocType}>(ต้นฉบับ)</div>
              <div style={S.noteTitle}>ใบส่งสินค้า / ใบเสร็จรับเงิน</div>
              <div style={S.noteMetaRow}>เลขที่ <b style={{ color: ACCENT_DK }}>{b.no}</b></div>
              <div style={S.noteMetaRow}>วันที่ <b>{b.date}</b></div>
              {b.billRef && <div style={S.noteMetaRow}>อ้างอิง <b>{b.billRef}</b></div>}
            </div>
          </div>

          <div style={S.noteCustBar}>
            <div style={{ flex: 1 }}>
              <span style={S.noteCustLabel}>นามลูกค้า</span>
              <span style={S.noteCustName}>{b.customer.name}</span>
              {b.customer.company && <div style={S.noteCustAddr}>บริษัท {b.customer.company}</div>}
              {b.customer.phone && b.customer.phone !== "-" && <div style={S.noteCustAddr}>โทร. {b.customer.phone}</div>}
              {b.customer.address && <div style={S.noteCustAddr}>{b.customer.address}</div>}
              {b.customer.taxId && <div style={S.noteCustAddr}>เลขประจำตัวผู้เสียภาษี {b.customer.taxId}</div>}
            </div>
            {b.customer.code && <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}><span style={S.noteCustLabel}>รหัสลูกค้า</span><span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{b.customer.code}</span></div>}
          </div>

          <table style={S.noteTable}>
            <thead>
              <tr>
                <th style={{ ...S.noteTh, width: 36 }}>No.</th>
                <th style={{ ...S.noteTh, textAlign: "left" }}>รหัสสินค้า / รายละเอียด</th>
                <th style={S.noteTh}>จำนวน</th>
                <th style={S.noteTh}>หน่วยละ</th>
                <th style={{ ...S.noteTh, textAlign: "right" }}>จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {b.items.map((i, idx) => (
                <tr key={i.productId} style={{ background: idx % 2 ? "#FCFAF5" : "#fff" }}>
                  <td style={S.noteTd}>{idx + 1}</td>
                  <td style={{ ...S.noteTd, textAlign: "left", fontWeight: 600 }}>{i.name.startsWith("ไข่") ? i.name : "ไข่ไก่ " + i.name}{i.weight > 0 ? ` ${fmt(i.weight)} กก` : ""}</td>
                  <td style={S.noteTd}>{fmt(i.qty)} แผง</td>
                  <td style={S.noteTd}>{fmt2(i.price)}</td>
                  <td style={{ ...S.noteTd, textAlign: "right", fontWeight: 600 }}>{fmt2(i.subtotal)}</td>
                </tr>
              ))}
              {(b.depositLines || []).map((d, di) => (
                <tr key={"dep" + di} style={{ background: (b.items.length + di) % 2 ? "#FCFAF5" : "#fff" }}>
                  <td style={S.noteTd}>{b.items.length + 1 + di}</td>
                  <td style={{ ...S.noteTd, textAlign: "left", fontWeight: 600 }}>{d.label} ({fmt(d.qty)} แผง)</td>
                  <td style={S.noteTd}>{fmt(d.qty)} แผง</td>
                  <td style={S.noteTd}>{fmt2(d.rate)}</td>
                  <td style={{ ...S.noteTd, textAlign: "right", fontWeight: 600 }}>{fmt2(d.amount)}</td>
                </tr>
              ))}
              {(b.deliveryFee || 0) > 0 && (
                <tr>
                  <td style={S.noteTd}>{b.items.length + (b.depositLines ? b.depositLines.length : 0) + 1}</td>
                  <td style={{ ...S.noteTd, textAlign: "left", fontWeight: 600 }}>ค่าขนส่ง (ค่ารถส่งไข่)</td>
                  <td style={S.noteTd}>-</td>
                  <td style={S.noteTd}>-</td>
                  <td style={{ ...S.noteTd, textAlign: "right", fontWeight: 600 }}>{fmt2(b.deliveryFee)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={S.noteSplit}>
            <div style={S.noteBahtText}>
              <span style={S.noteBahtLabel}>จำนวนเงิน (ตัวอักษร)</span>
              <span style={S.noteBahtVal}>( {bahtText(b.grandTotal ?? b.total)} )</span>
            </div>
            <div style={S.noteSummaryBox}>
              <div style={S.noteSumRow}><span>รวมเป็นเงิน</span><span>{fmt2(b.eggTotal + b.depositCharge + (b.deliveryFee || 0))}</span></div>
              <div style={S.noteSumRow}><span>หักส่วนลด</span><span>{(b.discount || 0) > 0 ? "−" : ""}{fmt2(b.discount || 0)}</span></div>
              <div style={S.noteSumRow}><span>ยอดหลังหักส่วนลด</span><span>{fmt2(b.total)}</span></div>
              {VAT_RATE > 0
                ? <div style={S.noteSumRow}><span>ภาษีมูลค่าเพิ่ม {VAT_RATE.toFixed(2)}%</span><span>{fmt2(b.total * VAT_RATE / 100)}</span></div>
                : <div style={{ ...S.noteSumRow, fontSize: 11.5, color: "#9b8e78" }}><span>ยกเว้นภาษีมูลค่าเพิ่ม (สินค้าเกษตร)</span><span>-</span></div>}
              <div style={S.noteTotalSub}><span>ยอดบิลนี้</span><span>{fmt2(b.total)}</span></div>
              {(b.carryOver || 0) > 0 && (
                <div style={{ ...S.noteSumRow, color: "#B91C1C", fontWeight: 600 }}><span>ค้างชำระบิลก่อนหน้า</span><span>{fmt2(b.carryOver)}</span></div>
              )}
              <div style={S.noteTotal}><span>{(b.carryOver || 0) > 0 ? "รวมที่ต้องชำระทั้งสิ้น" : "จำนวนเงินรวมทั้งสิ้น"}</span><span style={S.noteTotalBaht}>{fmt2(b.grandTotal ?? b.total)}</span></div>
              {(b.whtAmt || 0) > 0 && (
                <>
                  <div style={{ ...S.noteSumRow, color: "#B45309", fontWeight: 600, marginTop: 4 }}><span>หัก ณ ที่จ่าย {fmt(b.whtPct)}%</span><span>−{fmt2(b.whtAmt)}</span></div>
                  <div style={{ ...S.noteTotalSub, color: ACCENT_DK, fontWeight: 700 }}><span>ยอดโอนสุทธิ</span><span>{fmt2(b.netPay ?? (b.grandTotal ?? b.total) - b.whtAmt)}</span></div>
                </>
              )}
            </div>
          </div>

          {b.note && (
            <div style={{ margin: "12px 24px 0", padding: "8px 12px", background: "#FAF6EE", borderRadius: 10, fontSize: 12.5, color: "#6b6358" }}>
              <b style={{ color: INK }}>หมายเหตุ:</b> {b.note}
            </div>
          )}

          {b.traySummary && (b.traySummary.blackSent > 0 || b.traySummary.orangeSent > 0 || b.traySummary.blackReturned > 0 || b.traySummary.orangeReturned > 0) && (
            <div style={S.noteTrayBox}>
              <div style={S.noteTrayTitle}>🥚 สรุปแผง (มัดจำ)</div>
              <div style={S.noteTrayGrid}>
                {(b.traySummary.blackSent > 0 || b.traySummary.blackReturned > 0) && (
                  <div style={S.noteTrayCell}><div style={S.noteTrayLabel}>แผงดำ{(b.traySummary.blackSmall || 0) > 0 ? ` (ใหญ่ ${fmt(b.traySummary.blackBig)} · เล็ก ${fmt(b.traySummary.blackSmall)})` : ""}</div><div style={S.noteTrayVal}>รับ {fmt(b.traySummary.blackSent)} · คืน {fmt(b.traySummary.blackReturned)} · ถือไว้ {fmt(b.traySummary.blackNet)}</div></div>
                )}
                {(b.traySummary.orangeSent > 0 || b.traySummary.orangeReturned > 0) && (
                  <div style={S.noteTrayCell}><div style={S.noteTrayLabel}>แผงส้ม</div><div style={S.noteTrayVal}>รับ {fmt(b.traySummary.orangeSent)} · คืน {fmt(b.traySummary.orangeReturned)} · ถือไว้ {fmt(b.traySummary.orangeNet)}</div></div>
                )}
              </div>
              {(b.traySummary.excess || 0) > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#1D4ED8", fontWeight: 600 }}>↩ คืนเกิน {fmt(b.traySummary.excess)} แผง → เข้าบัญชีแผง (ลดยอดค้างคืนเดิม)</div>
              )}
              {b.traySummary.shortMode === "carry" && ((b.traySummary.blackNet || 0) + (b.traySummary.orangeNet || 0)) > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#B91C1C", fontWeight: 600 }}>→ แผงที่ถือไว้ {fmt((b.traySummary.blackNet || 0) + (b.traySummary.orangeNet || 0))} แผง ยกเป็นค้างคืน (ไม่คิดเงินมัดจำ)</div>
              )}
            </div>
          )}

          {/* ชำระเงิน — โอนบัญชีธนาคาร / สแกน QR */}
          <div style={S.qrBox}>
            <div style={S.qrLeft}>
              <div style={S.qrTitle}>สแกน QR เพื่อชำระเงิน</div>
              <div style={{ ...S.qrName, fontWeight: 700, color: INK }}>{COMPANY.bankName} · {COMPANY.bankAcctType}</div>
              <div style={S.qrId}>เลขที่บัญชี {COMPANY.bankAcctNo}</div>
              <div style={S.qrId}>ชื่อบัญชี {COMPANY.bankAcctName}</div>
              <div style={S.qrId}>วันที่ชำระ {b.date}</div>
              <div style={S.qrAmount}>{fmt2(b.netPay ?? (b.grandTotal ?? b.total))} บาท</div>
            </div>
            <PromptPayQR id={COMPANY.promptpayId} amount={b.netPay ?? (b.grandTotal ?? b.total)} />
          </div>

          <div style={S.noteSignBox}>
            <div style={S.noteSignText}>ได้รับสินค้าตามรายการข้างบนนี้ไว้ถูกต้อง และอยู่ในสภาพเรียบร้อยทุกประการ</div>
            <div style={S.noteSignRow}>
              <div style={S.noteSignCol}>
                <div style={S.noteSignLine} />
                <div style={S.noteSignLabel}>ผู้รับสินค้า</div>
              </div>
              <div style={S.noteSignCol}>
                <div style={S.noteSignLine} />
                <div style={S.noteSignLabel}>ผู้รับมอบอำนาจ</div>
                <div style={S.noteSignInName}>ในนาม {COMPANY.name}</div>
              </div>
            </div>
          </div>

          <div style={S.noteFooter}>
            <div style={S.noteThanks}>ขอบคุณที่อุดหนุนค่ะ 🐔💛</div>
            <div style={S.noteWarn}>* แผงไข่ ถ้าไม่ครบหรือสูญหาย ลูกค้ารับผิดชอบแผงละ {TRAY_DEPOSIT} บาท</div>
          </div>
          <div style={S.noteBottomStripe} />
        </div>

        <div style={S.noteActions}>
          <button style={S.printBtn} onClick={printBill} disabled={printing}>
            {printing ? "กำลังเตรียมพิมพ์..." : <><Printer size={18} /> พิมพ์ใบเสร็จ (ฝากไปกับรถ)</>}
          </button>
          <button style={S.saveImgBtn} onClick={saveBillImage}>
            {savingImg ? "กำลังสร้างรูป..." : <><ImageIcon size={18} /> บันทึกเป็นรูป (ส่งลูกค้า)</>}
          </button>
          <button style={S.ghostBtnWide} onClick={newBill}>เปิดบิลใหม่</button>
        </div>
      </div>
    );
  }

  // ---------- เลือกลูกค้า ----------
  if (!customer) {
    const q = custSearch.trim().toLowerCase();
    // ค้นหาได้ทั้งชื่อ / รหัส (KK-) / เบอร์โทร
    const matched = CUSTOMERS.filter((c) => !q ||
      c.name.toLowerCase().includes(q) ||
      (c.code || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q));
    // ตอนพิมพ์ค้นหา ให้ข้ามตัวกรองกลุ่ม (หาข้ามทุกกลุ่ม) ; ไม่พิมพ์ค่อยใช้ชิปกรอง
    const activeGroupFilter = q ? "all" : custGroupFilter;
    const groupCount = (gid) => CUSTOMERS.filter((c) => c.group === gid).length;
    const shownGroups = CUSTOMER_GROUPS.filter((g) => groupCount(g.id) > 0);
    return (
      <div style={S.stage}>
        {drafts.length > 0 && (
          <div style={{ marginBottom: 18, background: "#FFF8EE", border: "1px solid #F0DCC0", borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, color: ACCENT_DK, marginBottom: 6 }}>
              <FileText size={16} /> บิลร่างที่บันทึกไว้ ({drafts.length})
            </div>
            {Object.entries(draftsByDate).map(([date, list]) => (
              <div key={date} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 12.5, color: "#9b8e78", fontWeight: 700, margin: "8px 0 6px" }}>📅 {date}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {list.map((d) => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #efe7d8", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.customerName}</div>
                        <div style={{ fontSize: 12.5, color: "#9b8e78" }}>
                          {fmt(d.itemCount)} รายการ · {fmt(d.totalPrang)} แผง · {fmt(d.total)} บาท · บันทึก {d.savedAt} น.
                        </div>
                      </div>
                      <button style={{ ...draftActionBtn, background: ACCENT, color: "#fff", border: "none" }} onClick={() => loadDraft(d)}>ทำต่อ</button>
                      <button style={{ ...draftActionBtn, background: "#fff", color: "#B91C1C", border: "1px solid #f0c9c9" }} title="ลบร่าง" onClick={() => deleteDraft(d.id)}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={S.stageLabel}>เลือกลูกค้า</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button style={S.ghostBtn} onClick={() => setCodesMode("select")}><ClipboardCheck size={15} /> รหัสลูกค้า</button>
            <button style={S.primarySmBtn} onClick={() => setShowAddCust(true)}><Plus size={15} /> เพิ่มลูกค้าใหม่</button>
          </div>
        </div>
        <div style={S.searchBox}>
          <Search size={16} color="#9ca3af" />
          <input style={S.searchInput} placeholder="ค้นหา ชื่อ / รหัส KK / เบอร์โทร..." value={custSearch} onChange={(e) => setCustSearch(e.target.value)} />
        </div>
        {!q && (
          <div style={S.custChips}>
            <button style={{ ...S.custChip, ...(custGroupFilter === "all" ? S.custChipActive : {}) }} onClick={() => setCustGroupFilter("all")}>
              ทั้งหมด <span style={S.custChipCount}>{CUSTOMERS.length}</span>
            </button>
            {shownGroups.map((g) => (
              <button key={g.id} style={{ ...S.custChip, ...(custGroupFilter === g.id ? S.custChipActive : {}) }} onClick={() => setCustGroupFilter(g.id)}>
                {g.name.replace(/\s*\(.*?\)\s*/g, "").trim()} <span style={S.custChipCount}>{groupCount(g.id)}</span>
              </button>
            ))}
          </div>
        )}
        {CUSTOMER_GROUPS.map((g) => {
          if (activeGroupFilter !== "all" && g.id !== activeGroupFilter) return null;
          const list = matched.filter((c) => c.group === g.id);
          if (list.length === 0) return null;
          return (
            <div key={g.id} style={S.custGroupBlock}>
              <div style={S.custGroupHead}>
                <span style={S.custGroupName}>{g.name}</span>
                <span style={S.custGroupCount}>{list.length} ร้าน</span>
              </div>
              <div style={S.customerGrid}>
                {list.map((c) => (
                  <button key={c.id} style={S.customerCard} className="customerCard" onClick={() => setCustomerId(c.id)}>
                    <div style={S.custIcon}><User size={20} /></div>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div style={S.custName}>{c.name}</div>
                    </div>
                    <ChevronRight size={18} color="#9ca3af" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {matched.length === 0 && <div style={S.hint}>ไม่พบลูกค้าที่ค้นหา</div>}
        {showAddCust && (
          <NewCustomerModal
            groups={CUSTOMER_GROUPS}
            onClose={() => setShowAddCust(false)}
            onAdd={(c) => { addCustomerRecord(c); setShowAddCust(false); setCustomerId(c.id); }}
          />
        )}
        {codesMode && <CustomerCodesModal mode={codesMode} onClose={() => setCodesMode(null)} onPick={(id) => { setCodesMode(null); setCustomerId(id); }} onEdit={(c) => { setCodesMode(null); setEditingCust(c); }} />}
        {editingCust && (
          <NewCustomerModal
            groups={CUSTOMER_GROUPS}
            initial={editingCust}
            onClose={() => setEditingCust(null)}
            onAdd={(c) => { updateCustomerRecord(c.id, c); setEditingCust(null); setCustVersion((v) => v + 1); }}
          />
        )}
      </div>
    );
  }

  // ---------- หน้าออกบิล ----------
  return (
    <>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>ออกบิลขาย · <span style={{ fontSize: 30, verticalAlign: "middle", color: ACCENT_DK }}>{customer.name}</span>{editingDraftId ? " · (บิลร่าง)" : ""}</span>
        <button style={S.ghostBtn} onClick={() => { resetForm(); setCustomerId(null); }}>เปลี่ยนลูกค้า</button>
      </div>

      <div style={S.workspace}>
        {/* ซ้าย: เลือกสินค้า */}
        <div style={S.catalog}>
          <div style={S.searchBox}>
            <Search size={16} color="#9ca3af" />
            <input style={S.searchInput} placeholder="ค้นหาสินค้า..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={S.tabs}>
            {Object.keys(PRODUCTS).map((g) => (
              <button key={g} style={{ ...S.tab, ...(activeGroup === g ? S.tabActive : {}) }} onClick={() => setActiveGroup(g)}>
                {g === "คละ" ? "คละ(นน.)" : g}
              </button>
            ))}
          </div>
          <div style={S.productList}>
            {visibleProducts.map((p) => {
              const lp = lastPriceOf(p.id);
              const inCart = cart[p.id]?.qty || 0;
              const st = stock[p.id];
              return (
                <div key={p.id} style={S.productRow}>
                  <div style={{ flex: 1 }}>
                    <div style={S.prodName}>{p.name}</div>
                    <div style={S.prodMeta}>
                      <span style={{ color: st < 25 ? "#dc2626" : "#6b7280" }}>
                        <Package size={11} style={{ verticalAlign: -1 }} /> เหลือ {fmt(st)}
                      </span>
                      {lp ? (
                        <span style={S.lastPrice}>ล่าสุด {lp.date} · {fmt(lp.price)} บ.</span>
                      ) : (
                        <span style={S.noPrice}>ยังไม่เคยซื้อ</span>
                      )}
                    </div>
                  </div>
                  {inCart > 0 ? (
                    <div style={S.stepper}>
                      <button style={S.stepBtn} onClick={() => setQty(p.id, inCart - 1)}><Minus size={14} /></button>
                      <input
                        type="number"
                        style={S.qtyInput}
                        value={inCart}
                        onChange={(e) => setQty(p.id, parseInt(e.target.value) || 0)}
                        onFocus={(e) => e.target.select()}
                      />
                      <button style={S.stepBtn} onClick={() => setQty(p.id, inCart + 1)}><Plus size={14} /></button>
                    </div>
                  ) : (
                    <div style={S.addRow}>
                      <input
                        type="number"
                        style={S.addQtyInput}
                        placeholder="จำนวน"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const v = parseInt(e.target.value) || 0;
                            if (v > 0) { addToCart(p, v); e.target.value = ""; }
                          }
                        }}
                        onBlur={(e) => {
                          const v = parseInt(e.target.value) || 0;
                          if (v > 0) { addToCart(p, v); e.target.value = ""; }
                        }}
                      />
                      <button style={S.addBtn} onClick={(e) => {
                        const input = e.currentTarget.previousSibling;
                        const v = parseInt(input.value) || 1;
                        addToCart(p, v); input.value = "";
                      }}><Plus size={14} /> เพิ่ม</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ขวา: บิล */}
        <div id="cart-panel" style={S.cartPanel}>
          <div style={S.cartHead}><Receipt size={18} /><span>บิลปัจจุบัน</span></div>

          {cartItems.length === 0 ? (
            <div style={S.emptyCart}>
              <Package size={32} color="#d1d5db" />
              <div>ยังไม่มีสินค้าในบิล</div>
              <div style={S.emptyHint}>เลือกสินค้าจากด้านซ้าย</div>
            </div>
          ) : (
            <div style={S.cartList}>
              {cartItems.map((i) => {
                const over = i.qty > stock[i.productId];
                return (
                  <div key={i.productId} style={S.cartItem}>
                    <div style={S.ciTop}>
                      <span style={S.ciName}>{i.product.name}</span>
                      <button style={S.ciDel} onClick={() => setQty(i.productId, 0)}><Trash2 size={14} /></button>
                    </div>
                    <div style={S.ciControls}>
                      <div style={S.ciField}><label style={S.ciLabel}>แผง</label>
                        <input type="number" style={S.ciInput} value={i.qty} onChange={(e) => setQty(i.productId, parseInt(e.target.value) || 0)} /></div>
                      <span style={S.ciX}>×</span>
                      <div style={S.ciField}><label style={S.ciLabel}>บาท/แผง</label>
                        <input type="number" inputMode="decimal" placeholder="ใส่ราคา" style={S.ciInput} value={i.price} onChange={(e) => setPrice(i.productId, e.target.value)} /></div>
                      <div style={S.ciSubWrap}><label style={S.ciLabel}>รวม</label><div style={S.ciSub}>{fmt(i.subtotal)}</div></div>
                    </div>
                    {i.product.wt && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <label style={{ ...S.ciLabel, marginBottom: 0, whiteSpace: "nowrap" }}>นน./10แผง</label>
                        <input type="number" inputMode="decimal" placeholder="—" style={{ ...S.ciInput, width: 66, flex: "none" }} value={i.weight ?? ""} onChange={(e) => setWeight(i.productId, e.target.value)} />
                        <span style={{ fontSize: 11.5, color: "#9b8e78" }}>กก · ชั่งแล้วใส่ (ถ้าลูกค้าขอ)</span>
                      </div>
                    )}
                    {over && <div style={S.overWarn}><AlertCircle size={12} /> เกินสต็อก (เหลือ {fmt(stock[i.productId])})</div>}
                    {!(parseFloat(i.price) > 0) && <div style={S.overWarn}><AlertCircle size={12} /> ยังไม่ใส่ราคา/แผง</div>}
                  </div>
                );
              })}
            </div>
          )}

          {cartItems.length > 0 && (
            <div style={{ marginTop: 4, background: "#FBF6EC", borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700, color: INK }}>
                <span>ยอดรับไข่</span>
                <span>{fmt(totalPrang)} แผง <span style={{ color: "#9b8e78", fontWeight: 400, fontSize: 12.5 }}>({fmt(totalPrang * PER_PRADANG)} ฟอง)</span></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: "#6b6358", marginTop: 5, paddingTop: 5, borderTop: "1px dashed #ece0c8" }}>
                <span>ยอดแผงรับวันนี้ <span style={{ color: "#9b8e78", fontSize: 11 }}>(ไข่ × 1.1)</span></span>
                <span style={{ fontWeight: 700, color: INK }}>{fmt(trayReceivedTotal)} แผง</span>
              </div>
            </div>
          )}

          {/* แผงไข่ (มัดจำ) — ไข่คละ→แผงส้ม(15฿), อื่นๆ→แผงดำ(7฿) ; แผงที่ลูกค้ารับ = ไข่ ×1.1 */}
          <div style={S.trayBox}>
            <div style={S.trayBoxTitle}><RotateCcw size={13} /> แผงไข่ (มัดจำ)</div>

            {trayAccount && (trayAccount.carriedOwed > 0 || trayAccount.chargedHeld > 0 || trayAccount.credit > 0 || trayAccount.owed > 0) && (
              <div style={{ fontSize: 11.5, padding: "2px 2px 6px", marginBottom: 4, borderBottom: "1px dashed #ece0c8", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span style={{ color: "#9b8e78" }}>บัญชีแผงเดิม:</span>
                {trayAccount.carriedOwed > 0 && <span style={{ color: "#B91C1C", fontWeight: 700 }}>ค้างคืน {fmt(trayAccount.carriedOwed)} แผง</span>}
                {trayAccount.chargedHeld > 0 && <span style={{ color: "#1D4ED8", fontWeight: 700 }}>ยืมไป {fmt(trayAccount.chargedHeld)} แผง{trayAccount.depositHeld > 0 ? ` (มัดจำ ${fmt(trayAccount.depositHeld)} บ.)` : ""}</span>}
                {heldBreakdown(trayAccount) && <span style={{ color: "#6b6358" }}>{heldBreakdown(trayAccount)}</span>}
                {trayAccount.credit > 0 && <span style={{ color: "#1D4ED8", fontWeight: 700 }}>คืนเกิน {fmt(trayAccount.credit)} แผง</span>}
                {trayAccount.owed > 0 && <span style={{ color: "#B45309", fontWeight: 700 }}>ค้างทดแทน {fmt(trayAccount.owed)} แผง</span>}
              </div>
            )}

            {orangePanels > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "5px 2px" }}>
                <span>🟠 แผงส้ม <span style={{ color: "#9b8e78", fontSize: 11.5 }}>· รับ {fmt(orangePanels)} · {TRAY_DEPOSIT_ORANGE}฿</span></span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 12, color: "#9b8e78" }}>คืน</span>
                  <input type="number" inputMode="numeric" placeholder="0" value={trayReturnOrange} onChange={(e) => setTrayReturnOrange(e.target.value)} style={{ ...S.trayBoxInput, width: 60 }} />
                  <span style={{ fontSize: 12, color: "#6b6358" }}>แผง</span>
                </div>
              </div>
            )}

            {blackPanels > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "5px 2px" }}>
                <span>⚫ แผงดำ <span style={{ color: "#9b8e78", fontSize: 11.5 }}>· รับ {fmt(blackPanels)} · {TRAY_DEPOSIT}฿</span></span>
                <span style={{ fontSize: 11.5, color: "#9b8e78" }}>คืน {fmt(blackReturn)} · ถือไว้ {fmt(blackNet)}</span>
              </div>
            )}
            {blackPanels > 0 && (
              <div style={{ fontSize: 12, padding: "2px 2px 4px", color: "#6b6358" }}>↳ ให้ลูกค้า: <b style={{ color: INK }}>ใหญ่ {fmt(blackBigN)}</b> <span style={{ color: "#9b8e78" }}>(เบอร์ 0,1, ตกเกรด)</span> · <b style={{ color: INK }}>เล็ก {fmt(blackSmallN)}</b> <span style={{ color: "#9b8e78" }}>(เบอร์ 2-5)</span></div>
            )}
            {blackPanels > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "2px 2px 4px", color: "#6b6358" }}>
                <span>↳ ลูกค้าคืน</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11.5, color: "#9b8e78" }}>ใหญ่</span>
                  <input type="number" inputMode="numeric" placeholder="0" value={trayReturnBlackBig} onChange={(e) => setTrayReturnBlackBig(e.target.value)} style={{ ...S.trayBoxInput, width: 48 }} />
                  <span style={{ fontSize: 11.5, color: "#9b8e78" }}>เล็ก</span>
                  <input type="number" inputMode="numeric" placeholder="0" value={trayReturnBlackSmall} onChange={(e) => setTrayReturnBlackSmall(e.target.value)} style={{ ...S.trayBoxInput, width: 48 }} />
                  <span style={{ fontSize: 12, color: "#6b6358" }}>แผง</span>
                </div>
              </div>
            )}
            {orangePanels > 0 && (
              <div style={{ fontSize: 12, padding: "0 2px 4px", color: "#6b6358" }}>↳ แผงส้ม: <b style={{ color: INK }}>ใหญ่ {fmt(orangePanels)}</b> (ส้มมีขนาดเดียว)</div>
            )}
            {(blackReturn > 0 || orangeReturn > 0) && (
              <div style={{ fontSize: 11.5, color: "#8a7f6d", background: "#F5F1E8", borderRadius: 7, padding: "5px 9px", margin: "2px 2px 4px" }}>↩ แผงที่คืน {fmt(blackReturn + orangeReturn)} แผง จะเข้าคิว “รอคัด” อัตโนมัติเมื่อยืนยันบิล</div>
            )}

            {klaTrays > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: INK, padding: "6px 2px 2px", cursor: "pointer" }}>
                <input type="checkbox" checked={klaUseBlack} onChange={(e) => setKlaUseBlack(e.target.checked)} />
                ลูกค้าขอใส่แผงดำแทนแผงส้ม (ไข่คละ)
              </label>
            )}

            {trayShortQty > 0 && (
              <div style={{ marginTop: 6, padding: "8px 2px 2px", borderTop: "1px dashed #ece0c8" }}>
                <div style={{ fontSize: 12, color: "#6b6358", marginBottom: 6 }}>ลูกค้าคืนแผงขาด <b style={{ color: INK }}>{fmt(trayShortQty)} แผง</b> — จะ:</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setShortMode("charge")} style={{ flex: 1, padding: "7px 6px", borderRadius: 8, border: `1.5px solid ${shortMode === "charge" ? ACCENT : "#e3ddd0"}`, background: shortMode === "charge" ? "#FDF6EE" : "#fff", color: shortMode === "charge" ? ACCENT_DK : "#6b6358", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>คิดเงินมัดจำ</button>
                  <button onClick={() => setShortMode("carry")} style={{ flex: 1, padding: "7px 6px", borderRadius: 8, border: `1.5px solid ${shortMode === "carry" ? "#B91C1C" : "#e3ddd0"}`, background: shortMode === "carry" ? "#FEF2F2" : "#fff", color: shortMode === "carry" ? "#B91C1C" : "#6b6358", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>ยกเป็นแผงค้างคืน</button>
                </div>
              </div>
            )}
            {depositCharge > 0 && (
              <div style={S.depositLine}>
                มัดจำ {[blackNet > 0 ? `แผงดำ ${fmt(blackNet)}×${TRAY_DEPOSIT}` : null, orangeNet > 0 ? `แผงส้ม ${fmt(orangeNet)}×${TRAY_DEPOSIT_ORANGE}` : null].filter(Boolean).join(" + ")} = <b>{fmt(depositCharge)} บาท</b>
              </div>
            )}
            {shortMode === "carry" && trayShortQty > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#B91C1C", textAlign: "center", fontWeight: 600 }}>
                → ยกเป็นแผงค้างคืน {fmt(trayShortQty)} แผง (ไม่คิดเงิน — ลูกค้าติดหนี้แผง)
              </div>
            )}
            {trayExcess > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#1D4ED8", textAlign: "center", fontWeight: 600 }}>
                ↩ คืนเกิน {fmt(trayExcess)} แผง → เข้าบัญชีแผง (ลดยอดค้างคืนเดิม)
              </div>
            )}
          </div>

          <div style={S.cartFooter}>
            <div style={S.sumRow}><span>ค่าไข่</span><span>{fmt(eggTotal)} บาท</span></div>
            {depositCharge > 0 && <div style={S.sumRow}><span>ค่ามัดจำแผง</span><span>{fmt(depositCharge)} บาท</span></div>}

            {/* ช่องค่ารถขนส่ง */}
            <div style={S.discountRow}>
              <span style={S.discountLabel}>ค่าขนส่ง (ค่ารถส่งไข่)</span>
              <div style={S.discountInputWrap}>
                <input type="number" inputMode="decimal" style={S.discountInput} placeholder="0" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} />
                <span style={S.discountUnit}>บาท</span>
              </div>
            </div>
            {deliveryFeeAmt > 0 && <div style={S.sumRow}><span>+ ค่าขนส่ง</span><span>{fmt(deliveryFeeAmt)} บาท</span></div>}

            {/* ช่องส่วนลดท้ายบิล */}
            <div style={S.discountRow}>
              <span style={S.discountLabel}>ส่วนลดท้ายบิล</span>
              <div style={S.discountInputWrap}>
                <input type="number" style={S.discountInput} placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                <span style={S.discountUnit}>บาท</span>
              </div>
            </div>
            {discountAmt > 0 && <div style={{ ...S.sumRow, color: "#15803D" }}><span>− ส่วนลด</span><span>−{fmt(discountAmt)} บาท</span></div>}

            {/* หัก ณ ที่จ่าย (สำหรับลูกค้านิติบุคคล) */}
            <div style={S.discountRow}>
              <span style={S.discountLabel}>หัก ณ ที่จ่าย</span>
              <div style={S.discountInputWrap}>
                <input type="number" inputMode="decimal" style={{ ...S.discountInput, width: 64 }} placeholder="0" value={whtPct} onChange={(e) => setWhtPct(e.target.value)} />
                <span style={S.discountUnit}>%</span>
              </div>
            </div>
            {whtAmt > 0 && <div style={{ ...S.sumRow, color: "#B45309" }}><span>− หัก ณ ที่จ่าย ({fmt(whtRate)}%)</span><span>−{fmt(whtAmt)} บาท</span></div>}

            {/* เลขอ้างอิง / ใบสั่งซื้อ (PO) */}
            <div style={S.discountRow}>
              <span style={S.discountLabel}>เลขอ้างอิง / PO</span>
              <input type="text" style={{ ...S.discountInput, width: 130, textAlign: "left" }} placeholder="(ถ้ามี)" value={billRef} onChange={(e) => setBillRef(e.target.value)} />
            </div>

            {/* หมายเหตุท้ายบิล */}
            <div style={{ marginTop: 6 }}>
              <label style={{ ...S.discountLabel, display: "block", marginBottom: 4 }}>หมายเหตุ</label>
              <textarea style={{ width: "100%", padding: "7px 9px", border: "1px solid #e3ddd0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical", minHeight: 40, boxSizing: "border-box", outline: "none" }} placeholder="เช่น ส่งพรุ่งนี้เช้า / ฝากไว้หน้าร้าน" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div style={S.sumTotal}><span>ยอดบิลนี้</span><span style={S.sumBaht}>{fmt(total)} บาท</span></div>

            {/* ยอดค้างจากบิลก่อนหน้า */}
            {carryOver > 0 && (
              <>
                <div style={S.carryRow}><span>+ ค้างชำระบิลก่อนหน้า</span><span style={{ fontWeight: 700, color: "#B91C1C" }}>{fmt(carryOver)} บาท</span></div>
                <div style={S.grandRow}><span>รวมที่ต้องชำระทั้งสิ้น</span><span style={S.grandBaht}>{fmt(grandTotal)} บาท</span></div>
              </>
            )}

            {whtAmt > 0 && (
              <div style={S.grandRow}><span>ยอดโอนสุทธิ (หลังหัก ณ ที่จ่าย)</span><span style={S.grandBaht}>{fmt(netPay)} บาท</span></div>
            )}

            <button
              style={{ width: "100%", marginBottom: 8, padding: "11px", borderRadius: 10, border: `1.5px solid ${ACCENT}`, background: "#fff", color: ACCENT_DK, fontWeight: 700, fontSize: 14.5, cursor: cartItems.length === 0 ? "not-allowed" : "pointer", opacity: cartItems.length === 0 ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              disabled={cartItems.length === 0}
              onClick={saveDraft}
            >
              <FileText size={16} /> {editingDraftId ? "อัปเดตบิลร่าง" : "บันทึกร่างไว้ก่อน"}
            </button>
            <button style={{ ...S.confirmBtn, ...(canConfirm ? {} : S.confirmBtnDisabled) }} disabled={!canConfirm} onClick={confirmBill}>
              <Check size={18} /> ยืนยันออกบิล · ตัดสต็อก
            </button>
            {noPrice.length > 0 && <div style={S.footWarn}>⚠️ มี {fmt(noPrice.length)} รายการยังไม่ใส่ราคา/แผง — กรุณาใส่ราคาก่อนออกบิล</div>}
            {overStock.length > 0 && <div style={S.footWarn}>มีสินค้าเกินสต็อก กรุณาแก้ไขก่อน</div>}
          </div>
        </div>
      </div>
      {cartItems.length > 0 && (
        <div className="salesStickyBar" style={S.salesSticky}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
            <span style={{ fontSize: 12.5, color: "#6b6358" }}>🛒 {fmt(cartItems.length)} รายการ · {fmt(totalPrang)} แผง</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: INK }}>{fmt(grandTotal)} บาท</span>
          </div>
          {canConfirm
            ? <button style={S.stickyConfirm} onClick={confirmBill}><Check size={17} /> ยืนยันออกบิล</button>
            : <button style={S.stickyView} onClick={() => { const el = document.getElementById("cart-panel"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }}>ดูบิล / แก้ไข ▸</button>}
        </div>
      )}
    </>
  );
}

/* ============================================================
   หน้าจอ: ประวัติบิล — ค้นย้อนหลัง + ดูซ้ำ
============================================================ */
// ส่งออกบิลขายทั้งหมดเป็นไฟล์ CSV เดียว (เปิดใน Excel ได้, ภาษาไทยไม่เพี้ยนเพราะใส่ BOM) → ส่งให้แผนกบัญชีตรวจ
// ส่งออกบิลขายทั้งวันเป็นไฟล์ Excel (.xls) — จัดฟอร์มมีหัวบริษัท/วันที่/ตารางเส้นขอบ/ความกว้างช่องชัด (HTML-table เปิดใน Excel/Sheets ได้ ไม่ต้องพึ่งไลบรารี)
function exportBillsExcel(bills, payments) {
  if (!bills || !bills.length) { alert("ยังไม่มีบิลให้ส่งออก — ออกบิลในหน้าขายไข่ก่อน"); return; }
  const pm = payments || {};
  const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  const payLabel = (b) => { const p = pm[b.no]; if (p && p.paid >= b.total) return "ชำระแล้ว"; if (p && p.paid > 0) return "ชำระบางส่วน"; return "ค้างชำระ"; };
  const gv = (b) => (b.total != null ? b.total : (b.grandTotal || 0));   // ยอดบิลนี้ (ไม่รวมยอดค้างยกมา)
  const nv = (b) => (gv(b) - (b.whtAmt || 0));
  const itemText = (b) => (b.items || []).map((i) => `${i.name} ×${fmt(i.qty)}${i.weight ? " " + i.weight + "กก" : ""} @${money(i.price)}`).join("\n");
  const ordered = [...bills].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const sum = (f) => ordered.reduce((s, b) => s + (Number(f(b)) || 0), 0);
  const bdates = [...new Set(ordered.map((b) => b.date).filter(Boolean))];
  const dateLabel = bdates.length ? (bdates.length === 1 ? bdates[0] : bdates[0] + " – " + bdates[bdates.length - 1]) : new Date().toLocaleDateString("th-TH");

  // นิยามคอลัมน์ (t=หัว, w=กว้างpx, num=ตัวเลข, c=จัดชิด, hl=เน้น)
  const cols = [
    { t: "ลำดับ", w: 44, c: "center" }, { t: "วันที่", w: 80, c: "center" }, { t: "เลขที่บิล", w: 110, c: "center" },
    { t: "ลูกค้า", w: 150, c: "left" }, { t: "รหัสลูกค้า", w: 80, c: "center" }, { t: "เบอร์โทร", w: 105, c: "center" },
    { t: "รายการสินค้า", w: 260, c: "left" }, { t: "ค่าไข่", w: 90, num: true }, { t: "มัดจำแผง", w: 84, num: true },
    { t: "ค่าขนส่ง", w: 80, num: true }, { t: "ส่วนลด", w: 76, num: true }, { t: "หัก ณ ที่จ่าย", w: 96, num: true },
    { t: "ยอดบิล", w: 100, num: true, hl: true }, { t: "ยอดโอนสุทธิ", w: 100, num: true }, { t: "สถานะ", w: 92, c: "center" },
    { t: "วันที่ชำระ", w: 88, c: "center" }, { t: "วิธีชำระ", w: 86, c: "center" }, { t: "หมายเหตุ", w: 150, c: "left" },
  ];
  const NC = cols.length;
  const NF = 'mso-number-format:"\\#\\,\\#\\#0\\.00";';   // รูปแบบตัวเลข #,##0.00

  const vals = (b, i) => [
    String(i + 1), b.date || "", b.no || "", (b.customer || {}).name || "", (b.customer || {}).code || "", (b.customer || {}).phone || "",
    itemText(b), money(b.eggTotal), money(b.depositCharge), money(b.deliveryFee || 0), money(b.discount || 0), money(b.whtAmt || 0),
    money(gv(b)), money(nv(b)), payLabel(b), (pm[b.no] || {}).date || "", (pm[b.no] || {}).method || "", b.note || "",
  ];
  const dataRow = (b, i) => {
    const bg = i % 2 ? "background:#FBF7EF;" : "background:#ffffff;";
    return "<tr>" + vals(b, i).map((v, ci) => {
      const c = cols[ci];
      const align = c.num ? "right" : (c.c || "left");
      const cell = ci === 6 ? esc(v).replace(/\n/g, "<br>") : esc(v);   // คอลัมน์รายการ = หลายบรรทัด
      return `<td style="${bg}${c.num ? NF : 'mso-number-format:"\\@";'}text-align:${align};border:1px solid #E2DAC9;padding:4px 7px;font-size:11px;vertical-align:top;${c.hl ? "font-weight:bold;color:#B45309;" : ""}">${cell}</td>`;
    }).join("") + "</tr>";
  };
  const totalVals = ["รวม", "", "", "", "", "", ordered.length + " บิล",
    money(sum((b) => b.eggTotal)), money(sum((b) => b.depositCharge)), money(sum((b) => b.deliveryFee || 0)),
    money(sum((b) => b.discount || 0)), money(sum((b) => b.whtAmt || 0)), money(sum(gv)), money(sum(nv)), "", "", "", ""];
  const totalRow = "<tr>" + totalVals.map((v, ci) => {
    const c = cols[ci];
    const align = c.num ? "right" : (ci === 0 || ci === 6 ? "center" : c.c || "left");
    return `<td style="background:#F5E6CE;font-weight:bold;color:#7A4F16;text-align:${align};border:1px solid #D9B27A;padding:6px 7px;font-size:11.5px;${c.num ? NF : ""}">${esc(v)}</td>`;
  }).join("") + "</tr>";

  const gen = new Date().toLocaleString("th-TH");
  const colgroup = "<colgroup>" + cols.map((c) => `<col style="width:${c.w}px">`).join("") + "</colgroup>";
  const headRows = `
    <tr><td colspan="${NC}" style="background:#E8943A;color:#fff;font-weight:bold;font-size:17px;text-align:center;padding:9px;border:1px solid #C77C2E;">${esc(COMPANY.name)}</td></tr>
    <tr><td colspan="${NC}" style="text-align:center;font-size:11px;color:#5b5347;padding:3px;">${esc(COMPANY.addr1)} ${esc(COMPANY.addr2)} · โทร. ${esc(COMPANY.tel)} · เลขผู้เสียภาษี ${esc(COMPANY.taxId)} (${esc(COMPANY.branch)})</td></tr>
    <tr><td colspan="${NC}" style="text-align:center;font-size:15px;font-weight:bold;color:#1f2937;padding:8px 4px 3px;">สรุปบิลขายประจำวัน · ${esc(dateLabel)}</td></tr>
    <tr><td colspan="${NC}" style="text-align:center;font-size:11px;color:#6b6358;padding:2px 4px 10px;">สำหรับแผนกบัญชีตรวจสอบ · ${ordered.length} บิล · ออกรายงานเมื่อ ${esc(gen)}</td></tr>`;
  const headerCells = "<tr>" + cols.map((c) => `<td style="width:${c.w}px;background:#E8943A;color:#fff;font-weight:bold;text-align:center;border:1px solid #C77C2E;padding:6px;font-size:11.5px;vertical-align:middle;">${esc(c.t)}</td>`).join("") + "</tr>";

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">`
    + `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>บิลขาย ${esc(dateLabel)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->`
    + `<style>td{font-family:"TH Sarabun New","Noto Sans Thai",Tahoma,sans-serif;}</style></head><body>`
    + `<table border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${colgroup}${headRows}${headerCells}${ordered.map((b, i) => dataRow(b, i)).join("")}${totalRow}</table></body></html>`;

  const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "สรุปบิลขาย-" + dateLabel.replace(/[\/\s]/g, "-").replace(/–/g, "ถึง") + ".xls";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function BillHistoryView({ bills, payments }) {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statusF, setStatusF] = useState("all");   // all | paid | partial | unpaid
  const [selected, setSelected] = useState(null);

  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const isoOf = (b) => toISO(new Date(b.ts || 0));                         // วันที่ของบิล (จาก timestamp จริง)
  const statusOf = (b) => { const p = payments[b.no]; if (p && p.paid >= b.total) return "paid"; if (p && p.paid > 0) return "partial"; return "unpaid"; };
  const STCFG = { paid: { label: "ชำระแล้ว", bg: "#DCFCE7", c: "#15803D" }, partial: { label: "ชำระบางส่วน", bg: "#FEF3C7", c: "#B45309" }, unpaid: { label: "ค้างชำระ", bg: "#FEE2E2", c: "#B91C1C" } };
  const setPreset = (kind) => {
    const now = new Date(); const t = toISO(now);
    if (kind === "all") { setFrom(""); setTo(""); }
    else if (kind === "today") { setFrom(t); setTo(t); }
    else if (kind === "7d") { const d = new Date(); d.setDate(d.getDate() - 6); setFrom(toISO(d)); setTo(t); }
    else if (kind === "month") { setFrom(toISO(new Date(now.getFullYear(), now.getMonth(), 1))); setTo(t); }
  };

  const matchesBase = (b) => {
    if (q.trim() && !((b.customer?.name || "").toLowerCase().includes(q.toLowerCase()) || (b.no || "").toLowerCase().includes(q.toLowerCase()))) return false;
    const iso = isoOf(b);
    if (from && iso < from) return false;
    if (to && iso > to) return false;
    return true;
  };
  const baseFiltered = bills.filter(matchesBase);
  const statusCounts = { all: baseFiltered.length, paid: 0, partial: 0, unpaid: 0 };
  baseFiltered.forEach((b) => statusCounts[statusOf(b)]++);
  const filtered = statusF === "all" ? baseFiltered : baseFiltered.filter((b) => statusOf(b) === statusF);

  const totalSales = filtered.reduce((s, b) => s + (b.total || 0), 0);
  const outstanding = filtered.reduce((s, b) => { const p = payments[b.no]; return s + Math.max(0, (b.total || 0) - (p ? p.paid : 0)); }, 0);

  const groups = {};
  filtered.forEach((b) => { const k = b.date || isoOf(b); (groups[k] = groups[k] || []).push(b); });
  const groupKeys = Object.keys(groups).sort((a, b) => (groups[b][0].ts || 0) - (groups[a][0].ts || 0));   // ใหม่→เก่า

  const chip = (active, onClick, label, count) => (
    <button onClick={onClick} style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${active ? INK : "#e3ddd0"}`, background: active ? INK : "#fff", color: active ? "#fff" : "#6b6358", fontSize: 12.5, fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>{label}{count != null ? ` ${count}` : ""}</button>
  );
  const sumCard = { background: "#fff", border: "1px solid #ece5d6", borderRadius: 12, padding: "10px 12px", textAlign: "center" };
  const sumLbl = { fontSize: 12, color: "#8a8172", marginBottom: 3 };
  const sumVal = { fontSize: 18, fontWeight: 800 };

  if (selected) return <BillDetail bill={selected} payment={payments[selected.no]} onBack={() => setSelected(null)} />;

  return (
    <div style={S.wide}>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>ประวัติบิล · {filtered.length}/{bills.length} ใบ</span>
        {filtered.length > 0 && (
          <button onClick={() => exportBillsExcel(filtered, payments)} title="ส่งออกบิล 'ตามช่วง/ตัวกรองที่เลือก' เป็นไฟล์ Excel (หัวบริษัท/วันที่/ยอดรวม) ให้แผนกบัญชี"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", border: "none", background: INK, color: "#fff", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
            <ArrowDownToLine size={16} /> Export Excel ({filtered.length}) → บัญชี
          </button>
        )}
      </div>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "14px 0" }}>
        <div style={S.searchBox}>
          <Search size={16} color="#9ca3af" />
          <input style={S.searchInput} placeholder="ค้นหาชื่อลูกค้า หรือเลขที่บิล..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 13, color: "#6b6358", fontWeight: 600 }}>ช่วงวันที่</span>
          <ThaiDateField value={from} onChange={setFrom} style={{ width: 165, padding: "7px 10px", fontSize: 13 }} />
          <span style={{ color: "#9b8e78" }}>–</span>
          <ThaiDateField value={to} onChange={setTo} style={{ width: 165, padding: "7px 10px", fontSize: 13 }} />
          {chip(!from && !to, () => setPreset("all"), "ทั้งหมด")}
          {chip(false, () => setPreset("today"), "วันนี้")}
          {chip(false, () => setPreset("7d"), "7 วัน")}
          {chip(false, () => setPreset("month"), "เดือนนี้")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {chip(statusF === "all", () => setStatusF("all"), "ทั้งหมด", statusCounts.all)}
          {chip(statusF === "paid", () => setStatusF("paid"), "ชำระแล้ว", statusCounts.paid)}
          {chip(statusF === "partial", () => setStatusF("partial"), "ชำระบางส่วน", statusCounts.partial)}
          {chip(statusF === "unpaid", () => setStatusF("unpaid"), "ค้างชำระ", statusCounts.unpaid)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14 }}>
          <div style={sumCard}><div style={sumLbl}>จำนวนบิล</div><div style={{ ...sumVal, color: INK }}>{fmt(filtered.length)}</div></div>
          <div style={sumCard}><div style={sumLbl}>ยอดขายรวม</div><div style={{ ...sumVal, color: "#15803D" }}>{fmt(totalSales)} ฿</div></div>
          <div style={sumCard}><div style={sumLbl}>ค้างชำระ</div><div style={{ ...sumVal, color: outstanding > 0 ? "#B91C1C" : "#9b9384" }}>{fmt(outstanding)} ฿</div></div>
        </div>
        {filtered.length === 0 ? (
          <div style={S.emptyState}><FileText size={36} color="#d1d5db" /><div>{bills.length === 0 ? "ยังไม่มีบิล — ออกบิลในหน้าขายไข่ก่อน" : "ไม่พบบิลตามเงื่อนไข"}</div></div>
        ) : (
          <div style={{ marginTop: 16 }}>
            {groupKeys.map((k) => {
              const gb = groups[k]; const gtot = gb.reduce((s, b) => s + (b.total || 0), 0);
              return (
                <div key={k} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px", borderBottom: "2px solid #ece5d6", marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, color: INK, fontSize: 14 }}>📅 {k}</span>
                    <span style={{ fontSize: 12.5, color: "#6b6358" }}>{gb.length} บิล · {fmt(gtot)} ฿</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {gb.map((b) => {
                      const st = STCFG[statusOf(b)];
                      return (
                        <button key={b.no} style={S.billRow} className="customerCard" onClick={() => setSelected(b)}>
                          <div style={{ flex: 1, textAlign: "left" }}>
                            <div style={S.billRowTop}><span style={S.billRowNo}>{b.no}</span><span style={{ ...S.statusPill, background: st.bg, color: st.c }}>{st.label}</span></div>
                            <div style={S.billRowCust}>{b.customer?.name} · {b.date}</div>
                          </div>
                          <div style={{ textAlign: "right" }}><div style={S.billRowAmt}>{fmt(b.total)} บ.</div><div style={S.billRowItems}>{b.items.length} รายการ</div></div>
                          <ChevronRight size={18} color="#9ca3af" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BillDetail({ bill, payment, onBack }) {
  const b = bill;
  return (
    <div style={S.stage}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <button style={S.ghostBtn} onClick={onBack}>← กลับ</button>
        <button style={{ ...S.primarySmBtn, background: INK }} onClick={() => printReceiptImage("delivery-note")}><Printer size={15} /> พิมพ์ใบเสร็จ</button>
      </div>
      <div id="delivery-note" style={{ ...S.note, marginTop: 14 }}>
        <div style={S.noteTopStripe} />
        <div style={S.noteHead}>
          <div style={S.noteBrand}>
            <div style={S.noteLogo}><Egg size={26} /></div>
            <div>
              <div style={S.noteFarmName}>{COMPANY.name}</div>
              <div style={S.noteFarmSub}>{COMPANY.addr1} {COMPANY.addr2}</div>
              <div style={S.noteFarmTel}>โทร. {COMPANY.tel}</div>
            </div>
          </div>
          <div style={S.noteMeta}>
            <div style={S.noteDocType}>(สำเนา)</div>
            <div style={S.noteTitle}>ใบส่งสินค้า / ใบเสร็จรับเงิน</div>
            <div style={S.noteMetaRow}>เลขที่ <b style={{ color: ACCENT_DK }}>{b.no}</b></div>
            <div style={S.noteMetaRow}>วันที่ <b>{b.date}</b></div>
            {b.billRef && <div style={S.noteMetaRow}>อ้างอิง <b>{b.billRef}</b></div>}
          </div>
        </div>
        <div style={S.noteCustBar}>
          <div style={{ flex: 1 }}>
            <span style={S.noteCustLabel}>นามลูกค้า</span>
            <span style={S.noteCustName}>{b.customer.name}</span>
            {b.customer.company && <div style={S.noteCustAddr}>บริษัท {b.customer.company}</div>}
            {b.customer.phone && b.customer.phone !== "-" && <div style={S.noteCustAddr}>โทร. {b.customer.phone}</div>}
            {b.customer.address && <div style={S.noteCustAddr}>{b.customer.address}</div>}
            {b.customer.taxId && <div style={S.noteCustAddr}>เลขประจำตัวผู้เสียภาษี {b.customer.taxId}</div>}
          </div>
          {b.customer.code && <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}><span style={S.noteCustLabel}>รหัสลูกค้า</span><span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{b.customer.code}</span></div>}
        </div>
        <table style={S.noteTable}>
          <thead><tr>
            <th style={{ ...S.noteTh, width: 36 }}>No.</th>
            <th style={{ ...S.noteTh, textAlign: "left" }}>รายการ</th>
            <th style={S.noteTh}>จำนวน</th>
            <th style={S.noteTh}>หน่วยละ</th>
            <th style={{ ...S.noteTh, textAlign: "right" }}>จำนวนเงิน</th>
          </tr></thead>
          <tbody>
            {b.items.map((i, idx) => (
              <tr key={i.productId} style={{ background: idx % 2 ? "#FCFAF5" : "#fff" }}>
                <td style={S.noteTd}>{idx + 1}</td>
                <td style={{ ...S.noteTd, textAlign: "left", fontWeight: 600 }}>{i.name.startsWith("ไข่") ? i.name : "ไข่ไก่ " + i.name}{i.weight > 0 ? ` ${fmt(i.weight)} กก` : ""}</td>
                <td style={S.noteTd}>{fmt(i.qty)} แผง</td>
                <td style={S.noteTd}>{fmt2(i.price)}</td>
                <td style={{ ...S.noteTd, textAlign: "right", fontWeight: 600 }}>{fmt2(i.subtotal)}</td>
              </tr>
            ))}
            {(b.depositLines || []).map((d, di) => (
              <tr key={"dep" + di} style={{ background: (b.items.length + di) % 2 ? "#FCFAF5" : "#fff" }}>
                <td style={S.noteTd}>{b.items.length + 1 + di}</td>
                <td style={{ ...S.noteTd, textAlign: "left", fontWeight: 600 }}>{d.label} ({fmt(d.qty)} แผง)</td>
                <td style={S.noteTd}>{fmt(d.qty)} แผง</td>
                <td style={S.noteTd}>{fmt2(d.rate)}</td>
                <td style={{ ...S.noteTd, textAlign: "right", fontWeight: 600 }}>{fmt2(d.amount)}</td>
              </tr>
            ))}
            {(b.deliveryFee || 0) > 0 && (
              <tr>
                <td style={S.noteTd}>{b.items.length + (b.depositLines ? b.depositLines.length : 0) + 1}</td>
                <td style={{ ...S.noteTd, textAlign: "left", fontWeight: 600 }}>ค่าขนส่ง (ค่ารถส่งไข่)</td>
                <td style={S.noteTd}>-</td>
                <td style={S.noteTd}>-</td>
                <td style={{ ...S.noteTd, textAlign: "right", fontWeight: 600 }}>{fmt2(b.deliveryFee)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={S.noteSummary}>
          {VAT_RATE <= 0 && <div style={{ ...S.noteSumRow, justifyContent: "flex-end", fontSize: 11.5, color: "#9b8e78", padding: "0 4px 6px" }}>ยกเว้นภาษีมูลค่าเพิ่ม (สินค้าเกษตร)</div>}
          <div style={S.noteTotal}><span>จำนวนเงินรวมทั้งสิ้น</span><span style={S.noteTotalBaht}>{fmt2(b.total)}</span></div>
          {(b.whtAmt || 0) > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ ...S.noteSumRow, color: "#B45309", fontWeight: 600 }}><span>หัก ณ ที่จ่าย {fmt(b.whtPct)}%</span><span>−{fmt2(b.whtAmt)}</span></div>
              <div style={{ ...S.noteSumRow, fontWeight: 700, color: ACCENT_DK }}><span>ยอดโอนสุทธิ</span><span>{fmt2(b.total - b.whtAmt)}</span></div>
            </div>
          )}
        </div>
        <div style={{ margin: "12px 24px 0" }}>
          <div style={S.noteBahtVal}>( {bahtText(b.total)} )</div>
        </div>
        {b.note && (
          <div style={{ margin: "12px 24px 0", padding: "8px 12px", background: "#FAF6EE", borderRadius: 10, fontSize: 12.5, color: "#6b6358" }}>
            <b style={{ color: INK }}>หมายเหตุ:</b> {b.note}
          </div>
        )}
        {!(payment && payment.paid >= b.total) && (
          <div style={S.qrBox}>
            <div style={S.qrLeft}>
              <div style={S.qrTitle}>สแกน QR เพื่อชำระเงิน</div>
              <div style={{ ...S.qrName, fontWeight: 700, color: INK }}>{COMPANY.bankName} · {COMPANY.bankAcctType}</div>
              <div style={S.qrId}>เลขที่บัญชี {COMPANY.bankAcctNo}</div>
              <div style={S.qrId}>ชื่อบัญชี {COMPANY.bankAcctName}</div>
              <div style={S.qrAmount}>{fmt2(b.total - (payment?.paid || 0))} บาท</div>
            </div>
            <PromptPayQR id={COMPANY.promptpayId} amount={b.total - (payment?.paid || 0)} />
          </div>
        )}
        <div style={S.noteFooter}>
          {payment && payment.paid >= b.total
            ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ color: "#15803D", fontWeight: 700 }}>✓ ชำระแล้ว {payment.date} ({payment.method})</div>
                {payment.slip && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#6b6358" }}>
                    <span>สลิปการโอน:</span><SlipThumb src={payment.slip} size={64} />
                  </div>
                )}
              </div>
            : <div style={{ color: "#B91C1C", fontWeight: 600 }}>ยังค้างชำระ {fmt(b.total - (payment?.paid || 0))} บาท</div>}
        </div>
        <div style={S.noteBottomStripe} />
      </div>
    </div>
  );
}

/* ============================================================
   หน้าจอ: บัญชี / ลูกหนี้
============================================================ */
// เดือนของบิล (จากวันทำงาน) — ใช้กรองย้อนดูรายเดือนทุกหน้าบัญชี
const billYM = (b) => ((b.workDay || isoFromTs(b.ts || 0)) || "").slice(0, 7);
const ymTH = (ym) => ym ? toThaiDate(ym + "-01").split(" ").slice(1).join(" ") : "";
/* แถบเลือกเดือนย้อนหลัง: [ทั้งหมด] ‹ เดือน › — value = "" (ทุกเดือน) หรือ "2026-07" */
function MonthBar({ months = [], value, onChange }) {
  const idx = months.indexOf(value);
  const btn = (dis) => ({ padding: "5px 11px", border: `1px solid ${ACCENT}`, background: dis ? "#f3efe6" : "#fff", color: dis ? "#c9c0ad" : ACCENT_DK, borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: dis ? "default" : "pointer" });
  const chip = (a) => ({ padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${a ? ACCENT_DK : "#e0d7c3"}`, background: a ? ACCENT_DK : "#fff", color: a ? "#fff" : "#7a6f5c", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" });
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <button style={chip(!value)} onClick={() => onChange("")}>ทั้งหมด</button>
      <button disabled={!months.length || idx === 0} style={btn(!months.length || idx === 0)}
        onClick={() => { if (!months.length || idx === 0) return; onChange(idx === -1 ? months[months.length - 1] : months[idx - 1]); }}>‹</button>
      <span style={{ minWidth: 118, textAlign: "center", fontWeight: 800, fontSize: 13.5, color: value ? ACCENT_DK : "#9b8e78" }}>{value ? ymTH(value) : "ทุกเดือน"}</span>
      <button disabled={idx < 0 || idx >= months.length - 1} style={btn(idx < 0 || idx >= months.length - 1)}
        onClick={() => { if (idx >= 0 && idx < months.length - 1) onChange(months[idx + 1]); }}>›</button>
    </div>
  );
}

function AccountView({ bills, payments, recordPayment }) {
  const [payModal, setPayModal] = useState(null);
  const [month, setMonth] = useState("");   // "" = ทุกเดือน
  const months = useMemo(() => [...new Set((bills || []).map(billYM))].sort(), [bills]);
  const viewBills = month ? bills.filter((b) => billYM(b) === month) : bills;

  const rows = viewBills.map((b) => {
    const p = payments[b.no];
    const paid = p?.paid || 0;
    const owed = b.total - paid;
    return { bill: b, paid, owed, status: owed <= 0 ? "ชำระแล้ว" : paid > 0 ? "บางส่วน" : "ค้าง" };
  });

  const totalSales = rows.reduce((s, r) => s + r.bill.total, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const totalOwed = totalSales - totalPaid;

  // รวมยอดค้างรายลูกค้า
  const byCustomer = {};
  rows.forEach((r) => {
    if (r.owed > 0) {
      const k = r.bill.customer.name;
      byCustomer[k] = (byCustomer[k] || 0) + r.owed;
    }
  });

  return (
    <div style={S.wide}>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>บัญชี / ลูกหนี้{month ? <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT_DK }}> · {ymTH(month)}</span> : null}</span>
        <MonthBar months={months} value={month} onChange={setMonth} />
      </div>
      <div style={{ padding: "16px 0" }}>
        <div style={S.summaryGrid}>
          <SummaryCard icon={<CircleDollarSign size={18} />} label="ยอดขายรวม" value={totalSales} tone="amber" unit="บ." />
          <SummaryCard icon={<CheckCircle2 size={18} />} label="รับชำระแล้ว" value={totalPaid} tone="green" unit="บ." />
          <SummaryCard icon={<Wallet size={18} />} label="ค้างชำระรวม" value={totalOwed} tone="red" unit="บ." />
          <SummaryCard icon={<FileText size={18} />} label="จำนวนบิล" value={viewBills.length} tone="amber" unit="ใบ" />
        </div>

        {Object.keys(byCustomer).length > 0 && (
          <div style={S.accDebtorBox}>
            <div style={S.accDebtorTitle}>ยอดค้างรายลูกค้า</div>
            <div style={S.accDebtorList}>
              {Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).map(([name, amt]) => (
                <div key={name} style={S.accDebtorRow}><span>{name}</span><span style={{ fontWeight: 700, color: "#B91C1C" }}>{fmt(amt)} บ.</span></div>
              ))}
            </div>
          </div>
        )}

        <div style={S.tableScroll}>
          <table style={S.table}>
            <thead><tr>
              <th style={{ ...S.th, textAlign: "left" }}>เลขที่บิล</th>
              <th style={{ ...S.th, textAlign: "left" }}>ลูกค้า</th>
              <th style={S.th}>วันที่</th>
              <th style={S.th}>ยอดบิล</th>
              <th style={S.th}>ชำระแล้ว</th>
              <th style={S.th}>คงค้าง</th>
              <th style={S.th}>สถานะ</th>
              <th style={S.th}></th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} style={{ ...S.td, padding: 32, color: "#9b9384" }}>{month ? `ยังไม่มีบิลในเดือน${ymTH(month)}` : "ยังไม่มีบิล"}</td></tr>
              ) : rows.map((r) => {
                const stColor = r.status === "ชำระแล้ว" ? "#15803D" : r.status === "บางส่วน" ? "#B45309" : "#B91C1C";
                return (
                  <tr key={r.bill.no}>
                    <td style={{ ...S.td, textAlign: "left", fontWeight: 600 }}>{r.bill.no}</td>
                    <td style={{ ...S.td, textAlign: "left" }}>{r.bill.customer.name}</td>
                    <td style={S.td}>{r.bill.date}</td>
                    <td style={S.td}>{fmt(r.bill.total)}</td>
                    <td style={{ ...S.td, color: "#15803D" }}>{fmt(r.paid)}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: r.owed > 0 ? "#B91C1C" : "#15803D" }}>{fmt(r.owed)}</td>
                    <td style={{ ...S.td, color: stColor, fontWeight: 600 }}>{r.status}</td>
                    <td style={S.td}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        {payments[r.bill.no]?.slip && <SlipThumb src={payments[r.bill.no].slip} size={36} />}
                        {r.owed > 0 && <button style={S.payBtn} onClick={() => setPayModal(r.bill)}>รับชำระ</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {payModal && <PaymentModal bill={payModal} current={payments[payModal.no]?.paid || 0} onClose={() => setPayModal(null)} onPay={(amt, method, slip) => { recordPayment(payModal.no, amt, method, slip); setPayModal(null); }} />}
    </div>
  );
}

// รูปสลิป (thumbnail) — กดเพื่อดูรูปขยายเต็มจอ ใช้ซ้ำได้ทั้งใบเสร็จและตารางลูกหนี้
function SlipThumb({ src, size = 56, label }) {
  const [zoom, setZoom] = useState(false);
  if (!src) return null;
  return (
    <>
      <img
        src={src}
        alt={label || "สลิปการโอน"}
        title="กดเพื่อดูรูปสลิป"
        onClick={(e) => { e.stopPropagation(); setZoom(true); }}
        style={{ width: size, height: size, objectFit: "cover", borderRadius: 8, border: "1px solid #e3ddd0", cursor: "zoom-in", verticalAlign: "middle", flexShrink: 0 }}
      />
      {zoom && (
        <div
          onClick={(e) => { e.stopPropagation(); setZoom(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.82)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }}
        >
          <img src={src} alt={label || "สลิปการโอน"} style={{ maxWidth: "92vw", maxHeight: "88vh", borderRadius: 10, boxShadow: "0 10px 40px rgba(0,0,0,.5)" }} />
        </div>
      )}
    </>
  );
}

function PaymentModal({ bill, current, onClose, onPay }) {
  const owed = bill.total - current;
  const [amount, setAmount] = useState(String(owed));
  const [method, setMethod] = useState("โอน");
  const [slip, setSlip] = useState(null);      // รูปสลิป (data URL)
  const [slipName, setSlipName] = useState("");
  const [dragging, setDragging] = useState(false);  // กำลังลากรูปมาวางในโมดัล
  const amt = parseFloat(amount) || 0;
  const needSlip = method === "โอน";           // โอนเงินต้องแนบสลิปทุกครั้ง
  const valid = amt > 0 && (!needSlip || !!slip);

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("กรุณาเลือกไฟล์รูปภาพ"); return; }
    const reader = new FileReader();
    reader.onload = () => { setSlip(reader.result); setSlipName(file.name || "สลิป"); };
    reader.readAsDataURL(file);
  };
  const onPickFile = (e) => handleFile(e.target.files && e.target.files[0]);
  const onDropSlip = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files && e.dataTransfer.files[0]); };
  const onPasteSlip = (e) => {  // วางรูปจากคลิปบอร์ด (เช่น screenshot สลิป)
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.startsWith("image/")) { handleFile(items[i].getAsFile()); e.preventDefault(); break; }
    }
  };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, position: "relative" }} onClick={(e) => e.stopPropagation()} onPaste={onPasteSlip}
        onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={onDropSlip}>
        {dragging && (
          <div style={{ position: "absolute", inset: 0, zIndex: 5, borderRadius: 18, border: `2.5px dashed ${ACCENT_DK}`, background: "rgba(253,246,238,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, pointerEvents: "none" }}>
            <ImageIcon size={34} color={ACCENT_DK} />
            <div style={{ fontWeight: 800, color: ACCENT_DK, fontSize: 16 }}>วางรูปสลิปที่นี่</div>
          </div>
        )}
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>รับชำระเงิน</div><div style={S.modalSub}>{bill.no} · {bill.customer.name}</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={S.weighSummary}>
          <div style={S.wsRow}><span>ยอดบิล</span><span style={{ fontWeight: 700 }}>{fmt(bill.total)} บ.</span></div>
          {current > 0 && <div style={S.wsRow}><span>ชำระแล้ว</span><span>{fmt(current)} บ.</span></div>}
          <div style={S.wsRow}><span>คงค้าง</span><span style={{ fontWeight: 700, color: "#B91C1C" }}>{fmt(owed)} บ.</span></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={S.ciLabel}>จำนวนเงินที่รับ (บาท)</label>
          <input type="number" style={S.fullInput} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={S.ciLabel}>วิธีชำระ</label>
          <div style={{ display: "flex", gap: 8 }}>
            {["เงินสด", "โอน", "เช็ค"].map((m) => (
              <button key={m} style={{ ...S.methodBtn, ...(method === m ? S.methodBtnActive : {}) }} onClick={() => setMethod(m)}>{m}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={S.ciLabel}>
            รูปสลิปการโอน {needSlip
              ? <span style={{ color: "#B91C1C", fontWeight: 700 }}>* จำเป็น</span>
              : <span style={{ color: "#9b9384" }}>(ถ้ามี)</span>}
          </label>
          {slip ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
              <SlipThumb src={slip} size={64} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{slipName || "แนบรูปแล้ว"}</div>
                <button style={{ ...S.ghostBtn, padding: "4px 10px", marginTop: 4, fontSize: 12.5 }} onClick={() => { setSlip(null); setSlipName(""); }}>เปลี่ยน / ลบรูป</button>
              </div>
            </div>
          ) : (
            <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 6, padding: "18px 12px", border: `1.5px dashed ${needSlip ? "#E0A875" : "#dcd5c7"}`, borderRadius: 10, background: needSlip ? "#FDF6EE" : "#FAF8F2", color: "#8a8170", fontSize: 13, cursor: "pointer", textAlign: "center" }}>
              <ImageIcon size={22} color={ACCENT_DK} />
              <span>แตะเพื่อเลือก / ถ่ายรูป · ลากรูปมาวาง · วาง (Ctrl+V)</span>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={onPickFile} />
            </label>
          )}
        </div>
        <button style={{ ...S.primaryBtn, ...(valid ? {} : S.confirmBtnDisabled) }} disabled={!valid} onClick={() => onPay(amt, method, slip)}>
          บันทึกรับชำระ {fmt(amt)} บาท
        </button>
        {needSlip && !slip && (
          <div style={{ fontSize: 12.5, color: "#B91C1C", textAlign: "center", marginTop: 8 }}>
            * แนบรูปสลิปการโอนก่อน จึงจะปิดบิลได้
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   หน้าจอ: แดชบอร์ดภาพรวม
============================================================ */
function DashboardView({ bills, payments }) {
  const [month, setMonth] = useState("");   // "" = ทุกเดือน
  const months = useMemo(() => [...new Set((bills || []).map(billYM))].sort(), [bills]);
  const viewBills = month ? bills.filter((b) => billYM(b) === month) : bills;

  const totalSales = viewBills.reduce((s, b) => s + b.total, 0);
  const totalPaid = viewBills.reduce((s, b) => s + (payments[b.no]?.paid || 0), 0);
  const totalOwed = totalSales - totalPaid;
  const totalPrang = viewBills.reduce((s, b) => s + b.totalPrang, 0);

  // ยอดขายรายวัน
  const byDate = {};
  viewBills.forEach((b) => { byDate[b.date] = (byDate[b.date] || 0) + b.total; });
  const dateRows = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDay = Math.max(1, ...dateRows.map((d) => d[1]));

  // ยอดขายรายสินค้า (แผง)
  const byProduct = {};
  viewBills.forEach((b) => b.items.forEach((i) => { byProduct[i.name] = (byProduct[i.name] || 0) + i.qty; }));
  const prodRows = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxProd = Math.max(1, ...prodRows.map((p) => p[1]));

  // ลูกค้าที่ซื้อมากสุด
  const byCust = {};
  viewBills.forEach((b) => { byCust[b.customer.name] = (byCust[b.customer.name] || 0) + b.total; });
  const custRows = Object.entries(byCust).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div style={S.wide}>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>แดชบอร์ดภาพรวม{month ? <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT_DK }}> · {ymTH(month)}</span> : null}</span>
        <MonthBar months={months} value={month} onChange={setMonth} />
      </div>
      <div style={{ padding: "16px 0" }}>
        {viewBills.length === 0 ? (
          <div style={S.emptyState}>
            <LayoutDashboard size={36} color="#d1d5db" />
            <div>ยังไม่มีข้อมูล — ออกบิลในหน้าขายไข่ แล้วกลับมาดูภาพรวม</div>
          </div>
        ) : (
          <>
            <div style={S.summaryGrid}>
              <SummaryCard icon={<CircleDollarSign size={18} />} label="ยอดขายรวม" value={totalSales} tone="amber" unit="บ." />
              <SummaryCard icon={<CheckCircle2 size={18} />} label="รับชำระแล้ว" value={totalPaid} tone="green" unit="บ." />
              <SummaryCard icon={<Wallet size={18} />} label="ค้างชำระ" value={totalOwed} tone="red" unit="บ." />
              <SummaryCard icon={<Egg size={18} />} label="ขายรวม" value={totalPrang} tone="amber" unit="แผง" />
            </div>

            <div style={S.dashGrid}>
              <div style={S.dashCard}>
                <div style={S.dashCardTitle}><TrendingUp size={16} /> ยอดขายรายวัน</div>
                {dateRows.map(([date, amt]) => (
                  <div key={date} style={S.barRow}>
                    <span style={S.barLabel}>{date}</span>
                    <div style={S.barTrack}><div style={{ ...S.barFill, width: `${(amt / maxDay) * 100}%` }} /></div>
                    <span style={S.barVal}>{fmt(amt)}</span>
                  </div>
                ))}
              </div>

              <div style={S.dashCard}>
                <div style={S.dashCardTitle}><Egg size={16} /> สินค้าขายดี (แผง)</div>
                {prodRows.map(([name, qty]) => (
                  <div key={name} style={S.barRow}>
                    <span style={S.barLabel}>{name}</span>
                    <div style={S.barTrack}><div style={{ ...S.barFill, width: `${(qty / maxProd) * 100}%`, background: ACCENT }} /></div>
                    <span style={S.barVal}>{fmt(qty)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={S.dashCard}>
              <div style={S.dashCardTitle}><User size={16} /> ลูกค้ายอดซื้อสูงสุด</div>
              {custRows.map(([name, amt], idx) => (
                <div key={name} style={S.custRankRow}>
                  <span style={S.custRankNo}>{idx + 1}</span>
                  <span style={{ flex: 1 }}>{name}</span>
                  <span style={{ fontWeight: 700, color: ACCENT_DK }}>{fmt(amt)} บ.</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   หน้าจอ: คลังรายวัน
   ยกมา + รับเข้า − ขาย(รายลูกค้า) = คงเหลือ
============================================================ */
function StockView({ salesByDay = {}, productionByDate = {}, defaultDay, stockCounts = {}, closeMeta = {}, refPrices = {}, onCloseDay, onReopenDay }) {
  const dates = Object.keys(productionByDate).sort();
  const [day, setDay] = useState(defaultDay || dates[dates.length - 1] || STOCK_DAY);
  const [showClose, setShowClose] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const dIdx = dates.indexOf(day);
  const dayTH = toThaiDate(day);
  const reconciled = !!stockCounts[day];            // วันปิดยอดแล้ว (มียอดนับจริง) → คงเหลือ = นับจริง, โชว์ส่วนต่าง
  const physical = stockCounts[day];
  const salesLog = salesByDay[day] || {};           // ยอดขายของ "วันนั้น" (จากบิลจริง) — ถูกต้องต่อวันที่เลือก
  const goDay = (delta) => { const i = dIdx + delta; if (i >= 0 && i < dates.length) setDay(dates[i]); };

  // ลูกค้าที่มีการขายจริง (คอลัมน์) — เฉพาะวันปัจจุบัน (ยังไม่ปิดยอด)
  const activeCustomers = useMemo(() => {
    if (reconciled) return [];
    const ids = new Set();
    Object.values(salesLog).forEach((perCust) => Object.entries(perCust).forEach(([cid, q]) => { if (q > 0) ids.add(cid); }));
    return CUSTOMERS.filter((c) => ids.has(c.id));
  }, [salesByDay, day, reconciled]);

  const opening = openingForDay(day, productionByDate, stockCounts);    // ยกมา = คงเหลือจริงของเมื่อวาน (rolling)
  const production = useMemo(() => productionToStock(productionByDate[day] || []), [productionByDate, day]);  // รับเข้า = ผลผลิตวันนั้น (สด)
  const hasBills = Object.keys(salesLog).length > 0;   // มีบิลของวันนี้ → เชื่อยอดขายได้ จึงเทียบ "ส่วนต่าง" (ของขาด/เกิน) ได้
  const showDiff = reconciled && hasBills;             // วันปิดยอดที่ไม่มีบิล (เช่น seed 3/7) → ใช้ back-calc เดิม ไม่โชว์ส่วนต่าง (กันตัวเลขหลอน)

  const rows = STOCK_ORDER.map((pid) => {
    const op = opening[pid] || 0;
    const rec = production[pid] || 0;
    const perCust = salesLog[pid] || {};
    const recordedSold = Object.values(perCust).reduce((s, q) => s + (q || 0), 0);   // ขายจริงจากบิล
    const computedRemain = op + rec - recordedSold;                                   // คงเหลือที่ระบบคำนวณ
    let sold, remain, diff;
    if (reconciled) {
      remain = physical[pid] || 0;
      if (hasBills) { sold = recordedSold; diff = remain - computedRemain; }          // มีบิล → ส่วนต่าง = ของขาด/เกินจริง
      else { sold = op + rec - remain; diff = 0; }                                    // ไม่มีบิล → ถือว่าส่วนที่หายไปคือขาย (back-calc เดิม)
    } else { sold = recordedSold; remain = computedRemain; diff = 0; }
    return { pid, name: PRODUCT_BY_ID[pid]?.name || pid, opening: op, received: rec, total: op + rec, perCust, sold, computedRemain, remain, diff };
  });

  const totals = rows.reduce((t, r) => ({
    opening: t.opening + r.opening, received: t.received + r.received,
    total: t.total + r.total, sold: t.sold + r.sold, remain: t.remain + r.remain, diff: t.diff + r.diff,
  }), { opening: 0, received: 0, total: 0, sold: 0, remain: 0, diff: 0 });

  const hasStock = totals.total > 0;
  const meta = closeMeta[day] || null;                 // ข้อมูลผู้ปิดยอด/เวลา/หมายเหตุ ของวันนี้
  const diffColor = (d) => d < 0 ? "#dc2626" : d > 0 ? "#15803D" : "#9ca3af";
  const diffText = (d) => d === 0 ? "—" : (d > 0 ? "+" + fmt(d) : fmt(d));
  const valueOf = (pid, d) => Math.round((d || 0) * (refPrices[pid] || 0));   // มูลค่าส่วนต่าง (บาท)
  const lossBaht = rows.reduce((s, r) => s + (r.diff < 0 ? -valueOf(r.pid, r.diff) : 0), 0);  // มูลค่าของขาดรวม

  return (
    <div style={S.wide}>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>รายงานคลังไข่ประจำวัน · {dayTH}
          {reconciled ? <span style={{ fontSize: 12, fontWeight: 600, color: "#15803D" }}> · ✓ ปิดยอดแล้ว (นับจริง)</span> : <span style={{ fontSize: 12, fontWeight: 600, color: "#1D4ED8" }}> · วันปัจจุบัน</span>}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {reconciled ? (
            <>
              <button onClick={() => setShowClose(true)} style={{ padding: "7px 12px", border: `1px solid ${ACCENT}`, background: "#fff", color: ACCENT_DK, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✎ แก้ยอดนับ</button>
              <button onClick={() => exportCloseDayExcel(day, dayTH, rows, meta, refPrices)} style={{ padding: "7px 12px", border: "none", background: INK, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>⬇ Export ใบปิดยอด</button>
              <button onClick={() => { if (window.confirm("ยกเลิกการปิดยอดของวันนี้?\nคงเหลือจะกลับไปคำนวณจาก ยกมา + รับเข้า − ขาย")) onReopenDay && onReopenDay(day); }} style={{ padding: "7px 12px", border: "1px solid #FCA5A5", background: "#fff", color: "#dc2626", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>↩ ยกเลิกปิดยอด</button>
            </>
          ) : (
            <button onClick={() => setShowClose(true)} disabled={!hasStock} title={hasStock ? "" : "ยังไม่มีผลผลิต/สต็อกของวันนี้"} style={{ padding: "7px 14px", border: "none", background: hasStock ? "#15803D" : "#cbd5c9", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: hasStock ? "pointer" : "default" }}>🔒 ปิดยอดสิ้นวัน</button>
          )}
          <button onClick={() => setShowHistory(true)} title="ประวัติ/สรุปการปิดยอด" style={{ padding: "7px 12px", border: `1px solid ${ACCENT}`, background: "#fff", color: ACCENT_DK, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>📋 ประวัติ</button>
          <button onClick={() => goDay(-1)} disabled={dIdx <= 0} title="วันก่อนหน้า" style={{ padding: "6px 11px", border: `1px solid ${ACCENT}`, background: dIdx <= 0 ? "#f3efe6" : "#fff", color: dIdx <= 0 ? "#c9c0ad" : ACCENT_DK, borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: dIdx <= 0 ? "default" : "pointer" }}>‹</button>
          <ThaiDateField value={day} onChange={setDay} style={{ width: 170, padding: "7px 10px", borderColor: ACCENT, fontSize: 13.5 }} />
          <button onClick={() => goDay(1)} disabled={dIdx < 0 || dIdx >= dates.length - 1} title="วันถัดไป" style={{ padding: "6px 11px", border: `1px solid ${ACCENT}`, background: (dIdx < 0 || dIdx >= dates.length - 1) ? "#f3efe6" : "#fff", color: (dIdx < 0 || dIdx >= dates.length - 1) ? "#c9c0ad" : ACCENT_DK, borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: (dIdx < 0 || dIdx >= dates.length - 1) ? "default" : "pointer" }}>›</button>
        </div>
      </div>

      {showDiff && totals.diff !== 0 && (
        <div style={{ margin: "0 0 10px", padding: "9px 13px", borderRadius: 10, background: totals.diff < 0 ? "#FEF2F2" : "#F0FDF4", border: `1px solid ${totals.diff < 0 ? "#FECACA" : "#BBF7D0"}`, color: totals.diff < 0 ? "#B91C1C" : "#15803D", fontSize: 13, fontWeight: 600 }}>
          {totals.diff < 0
            ? <>⚠️ ปิดยอดวันนี้ <b>ขาด {fmt(-totals.diff)} แผง ≈ {fmt(lossBaht)} บาท</b> — นับจริงน้อยกว่าที่ระบบคำนวณ (ของแตก/หาย/แถม/นับพลาด)</>
            : <>ℹ️ ปิดยอดวันนี้ <b>เกิน {fmt(totals.diff)} แผง</b> — นับจริงมากกว่าที่ระบบคำนวณ</>}
        </div>
      )}
      {reconciled && meta && (meta.by || meta.note) && (
        <div style={{ margin: "0 0 10px", fontSize: 12.5, color: "#6b6358" }}>
          🔒 ปิดยอดโดย <b style={{ color: INK }}>{meta.by || "—"}</b>
          {meta.at ? <span> · {new Date(meta.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} น.</span> : null}
          {meta.note ? <span> · หมายเหตุ: {meta.note}</span> : null}
        </div>
      )}
      <div style={S.tableScroll}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, ...S.thSticky, textAlign: "left" }}>ไข่เบอร์</th>
              <th style={S.th}>ยกมา</th>
              <th style={S.th}>รับเข้า</th>
              <th style={{ ...S.th, background: "#F5EFE3" }}>รวม</th>
              {activeCustomers.map((c) => <th key={c.id} style={S.thCust}>{c.name}</th>)}
              <th style={{ ...S.th, background: "#FBEFDD" }}>ขายรวม</th>
              <th style={{ ...S.th, background: "#15803D", color: "#fff" }}>คงเหลือ<br />{reconciled ? "(นับจริง)" : "(17:00)"}</th>
              {showDiff && <th style={{ ...S.th, background: "#FDECEC" }}>ส่วนต่าง<br />(นับ−ระบบ)</th>}
              <th style={{ ...S.th, background: "#DBEAFE" }}>ประมาณการ<br />พรุ่งนี้</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pid}>
                <td style={{ ...S.td, ...S.tdSticky, fontWeight: 600, textAlign: "left" }}>{r.name}</td>
                <td style={S.td}>{fmt(r.opening)}</td>
                <td style={S.td}>{fmt(r.received)}</td>
                <td style={{ ...S.td, background: "#FAF6EE", fontWeight: 600 }}>{fmt(r.total)}</td>
                {activeCustomers.map((c) => (
                  <td key={c.id} style={{ ...S.td, color: r.perCust[c.id] ? "#1f2937" : "#d1d5db" }}>
                    {r.perCust[c.id] ? fmt(r.perCust[c.id]) : "·"}
                  </td>
                ))}
                <td style={{ ...S.td, background: "#FEF8F0", fontWeight: 600 }}>{fmt(r.sold)}</td>
                <td style={{ ...S.td, background: "#F1F8F2", fontWeight: 700, color: r.remain < 0 ? "#dc2626" : "#15803D" }}>{fmt(r.remain)}</td>
                {showDiff && <td style={{ ...S.td, background: "#FEF6F6", fontWeight: 700, color: diffColor(r.diff) }}>{diffText(r.diff)}</td>}
                <td style={{ ...S.td, background: "#EFF5FE", fontWeight: 700, color: "#1D4ED8" }}>{fmt(r.remain + r.received)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...S.td, ...S.tdSticky, ...S.tfoot, textAlign: "left" }}>รวม</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(totals.opening)}</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(totals.received)}</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(totals.total)}</td>
              {activeCustomers.map((c) => {
                const cs = rows.reduce((s, r) => s + (r.perCust[c.id] || 0), 0);
                return <td key={c.id} style={{ ...S.td, ...S.tfoot }}>{fmt(cs)}</td>;
              })}
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(totals.sold)}</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(totals.remain)}</td>
              {showDiff && <td style={{ ...S.td, ...S.tfoot, color: diffColor(totals.diff) }}>{diffText(totals.diff)}</td>}
              <td style={{ ...S.td, ...S.tfoot, color: "#1D4ED8" }}>{fmt(totals.remain + totals.received)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={S.hint}>
        {reconciled
          ? <span>วันนี้ <b>ปิดยอดแล้ว</b> — <b style={{ color: "#15803D" }}>คงเหลือ = ยอดนับจริง</b> (กลายเป็น "ยกมา" ของพรุ่งนี้อัตโนมัติ) · ขายรวม = ยอดขายจริงจากบิล · <b>ส่วนต่าง = นับจริง − (ยกมา+รับเข้า−ขาย)</b> ติดลบ = ของขาด/แตก/หาย · กด "แก้ยอดนับ" เพื่อแก้ หรือ "ยกเลิกปิดยอด" เพื่อกลับไปคำนวณ</span>
          : <span>ยกมา = คงเหลือจริงของเมื่อวาน · รับเข้า = ผลผลิตวันนี้ (อัตโนมัติ) · ขายรวม = ยอดขายจริงจากบิล · <b style={{ color: "#15803D" }}>คงเหลือ (17:00) = ยกมา + รับเข้า − ขาย</b> · เลิกงานกด <b style={{ color: "#15803D" }}>"🔒 ปิดยอดสิ้นวัน"</b> เพื่อกรอกยอดนับจริง แล้วยกไปเป็นต้นวันของพรุ่งนี้</span>}
      </div>

      {showClose && (
        <CloseDayModal
          dayTH={dayTH}
          rows={rows.filter((r) => r.total > 0)}
          initial={physical}
          initialMeta={meta}
          refPrices={refPrices}
          onClose={() => setShowClose(false)}
          onSave={(counts, m) => { onCloseDay && onCloseDay(day, counts, m); setShowClose(false); }}
        />
      )}
      {showHistory && (
        <CloseHistoryModal
          stockCounts={stockCounts} closeMeta={closeMeta} productionByDate={productionByDate}
          salesByDay={salesByDay} refPrices={refPrices}
          onClose={() => setShowHistory(false)}
          onPick={(d) => { setDay(d); setShowHistory(false); }}
        />
      )}
    </div>
  );
}

/* ============================================================
   Modal: ปิดยอดสิ้นวัน — กรอกยอดนับจริง เทียบกับที่ระบบคำนวณ
============================================================ */
function CloseDayModal({ dayTH, rows, initial, initialMeta, refPrices = {}, onClose, onSave }) {
  const [counts, setCounts] = useState(() => {
    const init = {};
    rows.forEach((r) => { const v = initial && initial[r.pid] != null ? initial[r.pid] : r.computedRemain; init[r.pid] = String(v); });
    return init;
  });
  const [reasons, setReasons] = useState(() => (initialMeta && initialMeta.reasons) ? { ...initialMeta.reasons } : {});
  const [by, setBy] = useState((initialMeta && initialMeta.by) || "");
  const [note, setNote] = useState((initialMeta && initialMeta.note) || "");
  const setC = (pid, v) => setCounts((p) => ({ ...p, [pid]: v.replace(/[^\d]/g, "") }));
  const setReason = (pid, v) => setReasons((p) => ({ ...p, [pid]: v }));
  const numOf = (pid) => parseInt(counts[pid], 10) || 0;
  const priceOf = (pid) => refPrices[pid] || 0;
  const totComputed = rows.reduce((s, r) => s + r.computedRemain, 0);
  const totCounted = rows.reduce((s, r) => s + numOf(r.pid), 0);
  const totDiff = totCounted - totComputed;
  const lossBaht = rows.reduce((s, r) => { const d = numOf(r.pid) - r.computedRemain; return s + (d < 0 ? -d * priceOf(r.pid) : 0); }, 0);
  const dColor = (d) => d < 0 ? "#dc2626" : d > 0 ? "#15803D" : "#9ca3af";
  const dText = (d) => d === 0 ? "—" : (d > 0 ? "+" + fmt(d) : fmt(d));
  const save = () => {
    const out = {}, rs = {};
    rows.forEach((r) => { out[r.pid] = numOf(r.pid); const d = numOf(r.pid) - r.computedRemain; if (d !== 0 && reasons[r.pid]) rs[r.pid] = reasons[r.pid]; });
    onSave(out, { by: by.trim(), note: note.trim(), reasons: rs, at: Date.now() });
  };
  const thSt = { padding: "6px 6px", color: "#6b6358", fontWeight: 700, position: "sticky", top: 0, background: "#fff", fontSize: 12 };
  const inSt = { padding: "7px 9px", border: "1.5px solid #E0D8C6", borderRadius: 8, fontSize: 13.5, width: "100%", boxSizing: "border-box" };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 620, width: "95%" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>🔒 ปิดยอดสิ้นวัน</div><div style={S.modalSub}>{dayTH} · กรอกยอดนับจริงตอนเลิกงาน (หน่วย: แผง)</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ maxHeight: "46vh", overflowY: "auto", margin: "4px 0 12px", border: "1px solid #F0EADD", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...thSt, textAlign: "left" }}>สินค้า</th>
                <th style={{ ...thSt, textAlign: "right" }}>ระบบ</th>
                <th style={{ ...thSt, textAlign: "center", color: "#15803D", fontWeight: 800 }}>นับจริง</th>
                <th style={{ ...thSt, textAlign: "right" }}>ส่วนต่าง</th>
                <th style={{ ...thSt, textAlign: "right" }}>มูลค่า(บ.)</th>
                <th style={{ ...thSt, textAlign: "left" }}>สาเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = numOf(r.pid) - r.computedRemain;
                const val = Math.round(d * priceOf(r.pid));
                return (
                  <tr key={r.pid} style={{ borderTop: "1px solid #F3EEE3" }}>
                    <td style={{ padding: "4px 6px", fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: "4px 6px", textAlign: "right", color: "#6b6358" }}>{fmt(r.computedRemain)}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>
                      <input inputMode="numeric" value={counts[r.pid]} onChange={(e) => setC(r.pid, e.target.value)} onFocus={(e) => e.target.select()}
                        style={{ width: 66, padding: "5px 7px", textAlign: "right", border: "1.5px solid #86C99A", borderRadius: 7, fontSize: 13.5, fontWeight: 700 }} />
                    </td>
                    <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: dColor(d) }}>{dText(d)}</td>
                    <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600, color: dColor(val) }}>{val === 0 ? "—" : fmt(val)}</td>
                    <td style={{ padding: "4px 6px" }}>
                      <select value={reasons[r.pid] || ""} onChange={(e) => setReason(r.pid, e.target.value)} disabled={d === 0}
                        style={{ padding: "5px 6px", border: "1px solid #E0D8C6", borderRadius: 7, fontSize: 12.5, background: d === 0 ? "#f6f3ec" : "#fff", color: d === 0 ? "#b8b0a0" : INK, minWidth: 90 }}>
                        <option value="">{d === 0 ? "—" : "เลือก…"}</option>
                        {DIFF_REASONS.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, padding: "9px 12px", background: "#FAF6EE", borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
          <span>รวมระบบ <b>{fmt(totComputed)}</b> · นับจริง <b>{fmt(totCounted)}</b> แผง · <span style={{ color: dColor(totDiff), fontWeight: 800 }}>ส่วนต่าง {dText(totDiff)}</span></span>
          {lossBaht > 0 && <span style={{ fontWeight: 800, color: "#B91C1C" }}>มูลค่าของขาด ≈ {fmt(Math.round(lossBaht))} บาท</span>}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 170px" }}>
            <label style={S.ciLabel}>ผู้ปิดยอด (ชื่อ)</label>
            <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="เช่น สมชาย" style={inSt} />
          </div>
          <div style={{ flex: "2 1 240px" }}>
            <label style={S.ciLabel}>หมายเหตุ</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ไข่แตกตอนขนส่ง 5 แผง" style={inSt} />
          </div>
        </div>
        <button style={{ ...S.primaryBtn }} onClick={save}>บันทึกปิดยอด · ยกไปเป็นต้นวันของพรุ่งนี้</button>
      </div>
    </div>
  );
}

/* ============================================================
   Modal: ประวัติ/สรุปการปิดยอด — ดูของขาด/เกินย้อนหลังทุกวัน
============================================================ */
function CloseHistoryModal({ stockCounts = {}, closeMeta = {}, productionByDate = {}, salesByDay = {}, refPrices = {}, onClose, onPick }) {
  const priceOf = (pid) => refPrices[pid] || 0;
  const days = Object.keys(closeMeta).sort().reverse();   // วันที่ปิดยอด (ใหม่สุดก่อน)
  const rows = days.map((d) => {
    const counts = stockCounts[d] || {};
    const opening = openingForDay(d, productionByDate, stockCounts);
    const production = productionToStock(productionByDate[d] || []);
    const salesLog = salesByDay[d] || {};
    const hasBills = Object.keys(salesLog).length > 0;
    let diffQty = 0, lossBaht = 0;
    STOCK_ORDER.forEach((pid) => {
      const computed = (opening[pid] || 0) + (production[pid] || 0) - Object.values(salesLog[pid] || {}).reduce((s, q) => s + (q || 0), 0);
      const diff = hasBills ? ((counts[pid] || 0) - computed) : 0;
      diffQty += diff;
      if (diff < 0) lossBaht += -diff * priceOf(pid);
    });
    return { date: d, meta: closeMeta[d] || {}, diffQty, lossBaht: Math.round(lossBaht), hasBills };
  });
  const totalLoss = rows.reduce((s, r) => s + r.lossBaht, 0);
  const totalDiff = rows.reduce((s, r) => s + r.diffQty, 0);
  const dColor = (d) => d < 0 ? "#dc2626" : d > 0 ? "#15803D" : "#9ca3af";
  const dText = (d) => d === 0 ? "—" : (d > 0 ? "+" + fmt(d) : fmt(d));
  const thSt = { padding: "8px 10px", color: "#6b6358", fontWeight: 700, fontSize: 12.5, textAlign: "left", borderBottom: "2px solid #EFE7D6", position: "sticky", top: 0, background: "#fff" };
  const card = { flex: "1 1 110px", padding: "10px 12px", borderRadius: 10 };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 640, width: "95%" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>📋 ประวัติการปิดยอด</div><div style={S.modalSub}>สรุปยอดขาด/เกินจากการนับจริงแต่ละวัน</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ ...card, background: "#FAF6EE" }}><div style={{ fontSize: 12, color: "#8a8170" }}>ปิดยอดแล้ว</div><div style={{ fontSize: 19, fontWeight: 800, color: INK }}>{rows.length} <span style={{ fontSize: 12, fontWeight: 600 }}>วัน</span></div></div>
          <div style={{ ...card, background: "#FEF2F2" }}><div style={{ fontSize: 12, color: "#8a8170" }}>ของขาดสะสม</div><div style={{ fontSize: 19, fontWeight: 800, color: "#B91C1C" }}>{fmt(totalLoss)} <span style={{ fontSize: 12, fontWeight: 600 }}>บาท</span></div></div>
          <div style={{ ...card, background: "#F5EFE3" }}><div style={{ fontSize: 12, color: "#8a8170" }}>ส่วนต่างสะสม</div><div style={{ fontSize: 19, fontWeight: 800, color: dColor(totalDiff) }}>{dText(totalDiff)} <span style={{ fontSize: 12, fontWeight: 600 }}>แผง</span></div></div>
        </div>
        <div style={{ maxHeight: "48vh", overflowY: "auto", border: "1px solid #F0EADD", borderRadius: 10 }}>
          {rows.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: "#9b9384", fontSize: 13.5 }}>ยังไม่มีการปิดยอด — เลิกงานกด "🔒 ปิดยอดสิ้นวัน" ในหน้าคลังรายวัน</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                <th style={thSt}>วันที่</th>
                <th style={thSt}>ผู้ปิด</th>
                <th style={{ ...thSt, textAlign: "right" }}>ส่วนต่าง</th>
                <th style={{ ...thSt, textAlign: "right" }}>มูลค่าขาด(บ.)</th>
                <th style={thSt}>หมายเหตุ</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} onClick={() => onPick && onPick(r.date)} style={{ borderTop: "1px solid #F3EEE3", cursor: "pointer" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#FBF7EF"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "7px 10px", fontWeight: 600 }}>{toThaiDate(r.date, false)}</td>
                    <td style={{ padding: "7px 10px" }}>{r.meta.by || "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: dColor(r.diffQty) }}>{r.hasBills ? dText(r.diffQty) : "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: r.lossBaht > 0 ? "#B91C1C" : "#9ca3af" }}>{r.lossBaht > 0 ? fmt(r.lossBaht) : "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#6b6358", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.meta.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#9b9384", marginTop: 10 }}>แตะแถวเพื่อไปดูรายละเอียดวันนั้นในคลังรายวัน</div>
      </div>
    </div>
  );
}

// Export "ใบปิดยอด" เป็นไฟล์ Excel (HTML .xls) — ส่งให้ผู้จัดการ/บัญชีตรวจของขาด/เกิน
function exportCloseDayExcel(day, dayTH, rows, meta, refPrices = {}) {
  const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const priceOf = (pid) => refPrices[pid] || 0;
  const reasons = (meta && meta.reasons) || {};
  const NF = 'mso-number-format:"\\#\\,\\#\\#0";';
  const data = rows.filter((r) => r.total > 0);
  const cols = [
    { t: "สินค้า", w: 150, c: "left" }, { t: "ยกมา", w: 66, num: true }, { t: "รับเข้า", w: 66, num: true },
    { t: "ขายรวม", w: 66, num: true }, { t: "ระบบคำนวณ", w: 84, num: true }, { t: "นับจริง", w: 74, num: true, hl: true },
    { t: "ส่วนต่าง", w: 74, num: true }, { t: "มูลค่า (บาท)", w: 90, num: true }, { t: "สาเหตุ", w: 110, c: "left" },
  ];
  const NC = cols.length;
  const td = (v, c, bg, extra) => `<td style="${bg || ""}${c.num ? NF : 'mso-number-format:"\\@";'}text-align:${c.num ? "right" : (c.c || "left")};border:1px solid #E2DAC9;padding:5px 8px;font-size:12px;${extra || ""}">${esc(v)}</td>`;
  const bodyRows = data.map((r, i) => {
    const val = Math.round(r.diff * priceOf(r.pid));
    const cells = [r.name, r.opening, r.received, r.sold, r.computedRemain, r.remain, (r.diff > 0 ? "+" + r.diff : r.diff), (val === 0 ? "" : val), (reasons[r.pid] || "")];
    const bg = i % 2 ? "background:#FBF7EF;" : "background:#ffffff;";
    return "<tr>" + cells.map((v, ci) => td(v, cols[ci], bg, cols[ci].hl ? "font-weight:bold;color:#15803D;" : "")).join("") + "</tr>";
  });
  const sum = (f) => data.reduce((s, r) => s + f(r), 0);
  const totLoss = Math.round(-sum((r) => r.diff < 0 ? r.diff * priceOf(r.pid) : 0));
  const totDiff = sum((r) => r.diff);
  const totVals = ["รวม", sum((r) => r.opening), sum((r) => r.received), sum((r) => r.sold), sum((r) => r.computedRemain), sum((r) => r.remain), (totDiff > 0 ? "+" + totDiff : totDiff), totLoss, ""];
  const totalRow = "<tr>" + totVals.map((v, ci) => `<td style="background:#F5E6CE;font-weight:bold;color:#7A4F16;text-align:${cols[ci].num ? "right" : "left"};border:1px solid #D9B27A;padding:6px 8px;font-size:12px;${cols[ci].num ? NF : ""}">${esc(v)}</td>`).join("") + "</tr>";
  const colgroup = "<colgroup>" + cols.map((c) => `<col style="width:${c.w}px">`).join("") + "</colgroup>";
  const headerCells = "<tr>" + cols.map((c) => `<td style="background:#15803D;color:#fff;font-weight:bold;text-align:center;border:1px solid #0f6b30;padding:6px;font-size:12px;">${esc(c.t)}</td>`).join("") + "</tr>";
  const metaLine = meta ? `ผู้ปิดยอด: ${esc(meta.by || "—")}${meta.at ? " · เวลา " + esc(new Date(meta.at).toLocaleString("th-TH")) : ""}${meta.note ? " · หมายเหตุ: " + esc(meta.note) : ""}` : "";
  const headRows = `
    <tr><td colspan="${NC}" style="background:#15803D;color:#fff;font-weight:bold;font-size:16px;text-align:center;padding:9px;border:1px solid #0f6b30;">${esc(COMPANY.name)}</td></tr>
    <tr><td colspan="${NC}" style="text-align:center;font-size:11px;color:#5b5347;padding:3px;">${esc(COMPANY.addr1)} ${esc(COMPANY.addr2)} · โทร. ${esc(COMPANY.tel)}</td></tr>
    <tr><td colspan="${NC}" style="text-align:center;font-size:15px;font-weight:bold;color:#1f2937;padding:8px 4px 2px;">ใบปิดยอดสต๊อกไข่ประจำวัน · ${esc(dayTH)}</td></tr>
    <tr><td colspan="${NC}" style="text-align:center;font-size:11px;color:#6b6358;padding:2px 4px 6px;">${metaLine}</td></tr>
    <tr><td colspan="${NC}" style="text-align:right;font-size:12px;font-weight:bold;color:#B91C1C;padding:2px 8px 8px;">มูลค่าของขาดรวม ≈ ${esc(totLoss.toLocaleString("en-US"))} บาท</td></tr>`;
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">`
    + `<style>td{font-family:"TH Sarabun New","Noto Sans Thai",Tahoma,sans-serif;}</style></head><body>`
    + `<table border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${colgroup}${headRows}${headerCells}${bodyRows.join("")}${totalRow}</table></body></html>`;
  const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ปิดยอด-" + day + ".xls";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ============================================================
   หน้าจอ: ผลผลิต/ดึงไข่รายหลัง (H.2–H.6)
============================================================ */
// ข้อมูลจริง 1/7/69 (เบอร์ 0-5 กระจายตามสัดส่วน ให้ผลรวม = "รายการไข่ดี" ในรายงาน ; ตกเกรดหน่วยแผง)
const OFF_KEYS = ["จัมโบ้", "บุบ", "ตอก", "จิ๋ว", "เปลือกขาว", "หัวทราย", "นวล", "เปื้อนมาก", "เปื้อนน้อย"];
const BER_KEYS = [0, 1, 2, 3, 4, 5];
// สีหมวดหมู่ในตารางผลผลิต: ตกเกรด(ส้ม) · ไข่ดี(เขียว) · สรุป(ฟ้า) — D = เข้มขึ้นสำหรับช่อง %
const PROD_C = { off: "#F7C57C", offD: "#FBE1C2", good: "#93E1AC", sum: "#95BAF6", sumD: "#D2E1FB" };
// ผลผลิตไข่รายหลัง — ข้อมูลจริงวันที่ 3/7/69 (ตกเกรด+ยอดไก่จากรายงานผลผลิต;
// เบอร์ 0-5 = เลขจริงจากตาราง "รายการดึงไข่ประจำวัน" 3/7/69, Σเบอร์ = รายการไข่ดีของแต่ละหลัง, รวมทั้งหมด 201,171)
const HOUSES = [
  { id: "H2", chickens: 65535, grade: { เบอร์: { 0: 1571, 1: 6809, 2: 15256, 3: 12334, 4: 3793, 5: 542 }, ตกเกรด: { จัมโบ้: 1, บุบ: 49, ตอก: 3, จิ๋ว: 2, เปลือกขาว: 1, หัวทราย: 99, นวล: 171, เปื้อนมาก: 38, เปื้อนน้อย: 136 } } },
  { id: "H3", chickens: 65408, grade: { เบอร์: { 0: 3537, 1: 9401, 2: 13498, 3: 7589, 4: 1575, 5: 167 }, ตกเกรด: { จัมโบ้: 7, บุบ: 17, ตอก: 4, จิ๋ว: 1, เปลือกขาว: 2, หัวทราย: 87, นวล: 163, เปื้อนมาก: 26, เปื้อนน้อย: 107 } } },
  { id: "H4", chickens: 67171, grade: { เบอร์: { 0: 1782, 1: 6305, 2: 13330, 3: 10924, 4: 3545, 5: 450 }, ตกเกรด: { จัมโบ้: 4, บุบ: 26, ตอก: 5, จิ๋ว: 2, เปลือกขาว: 1, หัวทราย: 135, นวล: 170, เปื้อนมาก: 19, เปื้อนน้อย: 111 } } },
  { id: "H5", chickens: 65467, grade: { เบอร์: { 0: 1586, 1: 5448, 2: 12364, 3: 11437, 4: 4077, 5: 640 }, ตกเกรด: { จัมโบ้: 3, บุบ: 17, ตอก: 4, จิ๋ว: 1, เปลือกขาว: 0, หัวทราย: 71, นวล: 98, เปื้อนมาก: 27, เปื้อนน้อย: 60 } } },
  { id: "H6", chickens: 66385, grade: { เบอร์: { 0: 2168, 1: 8825, 2: 19155, 3: 16423, 4: 5693, 5: 947 }, ตกเกรด: { จัมโบ้: 4, บุบ: 23, ตอก: 12, จิ๋ว: 5, เปลือกขาว: 3, หัวทราย: 75, นวล: 38, เปื้อนมาก: 16, เปื้อนน้อย: 52 } } },
];

// ผลผลิต 4/7/69 — ตกเกรด+ยอดไก่จากตารางจริง ; เบอร์ 0-5 = แผง(จากตาราง)×30 → ฟอง (โชว์กลับเป็นแผงตรงตาราง) ; inspect = ผลสุ่มตรวจตอกไข่ 4/7
const HOUSES_4_7 = [
  { id: "H2", date: "2026-07-04", chickens: 65482, grade: { เบอร์: { 0: 1590, 1: 6660, 2: 14700, 3: 12900, 4: 4110, 5: 630 }, ตกเกรด: { จัมโบ้: 7, บุบ: 40, ตอก: 6, จิ๋ว: 6, เปลือกขาว: 9, หัวทราย: 103, นวล: 134, เปื้อนมาก: 54, เปื้อนน้อย: 98 } }, inspect: { count: 4, result: "ตอกออกมามีไข่เปลือกนวลและไข่หัวทราย · ไข่ขาวเหลว · อาหาร JBF เฉดสีไข่ 15" } },
  { id: "H3", date: "2026-07-04", chickens: 65357, grade: { เบอร์: { 0: 3210, 1: 8520, 2: 12600, 3: 7320, 4: 1560, 5: 150 }, ตกเกรด: { จัมโบ้: 3, บุบ: 23, ตอก: 7, จิ๋ว: 0, เปลือกขาว: 0, หัวทราย: 115, นวล: 148, เปื้อนมาก: 17, เปื้อนน้อย: 97 } }, inspect: { count: 4, result: "ตอกออกมาไข่เปลือกขาว · ไข่ขาวเหลว · อาหาร JBF เฉดสีไข่ 15" } },
  { id: "H4", date: "2026-07-04", chickens: 67138, grade: { เบอร์: { 0: 1980, 1: 7530, 2: 16110, 3: 14250, 4: 4680, 5: 660 }, ตกเกรด: { จัมโบ้: 4, บุบ: 29, ตอก: 5, จิ๋ว: 1, เปลือกขาว: 0, หัวทราย: 97, นวล: 152, เปื้อนมาก: 35, เปื้อนน้อย: 84 } }, inspect: { count: 4, result: "ไข่เปลือกเข้มและไข่หัวทราย · ตอกออกมาไข่ขาวเหลว · อาหาร JBF เฉดสีไข่ 15" } },
  { id: "H5", date: "2026-07-04", chickens: 65430, grade: { เบอร์: { 0: 1680, 1: 5550, 2: 12720, 3: 12000, 4: 4260, 5: 630 }, ตกเกรด: { จัมโบ้: 3, บุบ: 12, ตอก: 5, จิ๋ว: 3, เปลือกขาว: 0, หัวทราย: 77, นวล: 110, เปื้อนมาก: 29, เปื้อนน้อย: 64 } }, inspect: { count: 4, result: "ไข่เปลือกเข้มและไข่หัวทราย · ตอกออกมาไข่ขาวเหลว · อาหาร JBF เฉดสีไข่ 15" } },
  { id: "H6", date: "2026-07-04", chickens: 66369, grade: { เบอร์: { 0: 2070, 1: 8220, 2: 18450, 3: 16410, 4: 5700, 5: 930 }, ตกเกรด: { จัมโบ้: 4, บุบ: 20, ตอก: 12, จิ๋ว: 4, เปลือกขาว: 1, หัวทราย: 107, นวล: 174, เปื้อนมาก: 43, เปื้อนน้อย: 56 } }, inspect: { count: 4, result: "ไข่เปลือกเข้มและไข่หัวทราย · ตอกออกมาไข่ขาวเหลว · อาหาร JBF เฉดสีไข่ 15" } },
];

// โรงเรือนทั้งหมดของฟาร์ม — เพิ่มหลังใหม่ที่นี่ที่เดียว ทุกหน้า (ผลผลิต/เลี้ยง/อาหาร/ยา/ต้นทุน) เห็นเอง
// H7 เริ่มเข้าไก่ 8/7/69 (ยังไม่มีผลผลิตย้อนหลัง — วันเก่าไม่โชว์ H7 ตามจริง)
const HOUSE_IDS = ["H2", "H3", "H4", "H5", "H6", "H7"];
const emptyHouseDay = (id, date) => ({ id, date, chickens: 0, grade: { เบอร์: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, ตกเกรด: { จัมโบ้: 0, บุบ: 0, ตอก: 0, จิ๋ว: 0, เปลือกขาว: 0, หัวทราย: 0, นวล: 0, เปื้อนมาก: 0, เปื้อนน้อย: 0 } } });

// ---------- สมุดวัคซีนประจำหลัง ----------
// ข้อมูลอ้างอิงที่มาของรุ่น (โชว์หัวสมุด) — H7 = ใบบันทึกวัคซีนจากฟาร์มอนุบาล (ไก่เข้าฟาร์มเรา 8/7/69)
const VACCINE_INFO = {
  H7: "รุ่นที่ 01/2569 · จากหนองบัวหลวงฟาร์ม (เอ็น ซี พี โปรดักส์) โรงเรือนที่ 2 · เริ่มเลี้ยง 21/3/69 · 50,000 ตัว · สัตวแพทย์ควบคุม น.สพ. บุญชัย โพธิปัญญาธรรม",
};
// ประวัติการทำวัคซีน H7 — คัดจากใบจริง "บันทึกการทำวัคซีนไก่เล็ก-ไก่รุ่น" (21/3/69 – 20/6/69)
const VACCINE_SEED = {
  H7: [
    { id: "VS01", date: "2026-03-21", age: "1 วัน", birds: 50000, bottles: "50", dose: "0.1 โด๊ส", doseSize: "1000 โด๊ส", name: "มาแร็กซ์", against: "มาแร็กซ์", kind: "เชื้อเป็น", method: "ฉีดใต้ผิวหนังคอ", lot: "", expiry: "", by: "ทำจากโรงฟัก", checker: "" },
    { id: "VS02", date: "2026-03-21", age: "1 วัน", birds: 50000, bottles: "10", dose: "1 โด๊ส", doseSize: "5000 โด๊ส", name: "BIOVAC ND V6/10-H120", against: "นิวคาสเซิล+หลอดลมอักเสบ", kind: "เชื้อเป็น", method: "สเปรย์", lot: "", expiry: "", by: "ทำจากโรงฟัก", checker: "" },
    { id: "VS03", date: "2026-04-03", age: "14 วัน", birds: 49950, bottles: "10", dose: "0.2 โด๊ส", doseSize: "1000 โด๊ส", name: "OLVAC เข็ม1", against: "นิวคาสเซิล", kind: "เชื้อตาย", method: "ฉีดใต้ผิวหนังคอ", lot: "511907", expiry: "09-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS04", date: "2026-04-03", age: "14 วัน", birds: 49950, bottles: "25", dose: "1 หยด", doseSize: "2000 โด๊ส", name: "Poulvac Bursa V877", against: "กัมโบโร รอบ 1", kind: "เชื้อเป็น", method: "หยอดปาก", lot: "015/25", expiry: "09-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS05", date: "2026-04-11", age: "21 วัน", birds: 49920, bottles: "25", dose: "1 หยด", doseSize: "2000 โด๊ส", name: "Poulvac Bursa V877", against: "กัมโบโร รอบ 2", kind: "เชื้อเป็น", method: "หยอดปาก", lot: "015/25", expiry: "09-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS06", date: "2026-04-11", age: "21 วัน", birds: 49920, bottles: "60", dose: "0.3 ml", doseSize: "500 โด๊ส", name: "QVAC RFH5+H9 เข็ม 1", against: "ไข้หวัดนก", kind: "เชื้อตาย", method: "ฉีดกล้ามเนื้ออกขวา", lot: "20251228", expiry: "27-12-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS07", date: "2026-04-18", age: "4 wks", birds: 49900, bottles: "50", dose: "1 โด๊ส", doseSize: "1000 โด๊ส", name: "VALOI-VAC", against: "ฝีดาษ", kind: "เชื้อเป็น", method: "แทงปีก", lot: "509919", expiry: "01-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS08", date: "2026-04-18", age: "4 wks", birds: 49900, bottles: "30", dose: "0.3 โด๊ส", doseSize: "1000 โด๊ส", name: "OLVAC เข็ม2", against: "นิวคาสเซิล", kind: "เชื้อตาย", method: "ฉีดกล้ามเนื้ออกซ้าย", lot: "511907", expiry: "09-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS09", date: "2026-04-26", age: "5 wks", birds: 49880, bottles: "50", dose: "1 โด๊ส", doseSize: "1000 โด๊ส", name: "PoulShot MG-F", against: "มัยโคพลาสม่า กัลลิเซปติคุม", kind: "เชื้อเป็น", method: "หยอดตาซ้าย", lot: "324 EMGF 04", expiry: "03-12-2026", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS10", date: "2026-04-26", age: "5 wks", birds: 49880, bottles: "100", dose: "0.5 ml", doseSize: "500 โด๊ส", name: "QVAC RFH5+H9 เข็ม2", against: "ไข้หวัดนก", kind: "เชื้อตาย", method: "ฉีดกล้ามเนื้ออกซ้าย", lot: "20251228", expiry: "27-12-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS11", date: "2026-05-03", age: "6 wks", birds: 49860, bottles: "25", dose: "1 โด๊ส", doseSize: "2000 โด๊ส", name: "Poulvac IB.QX", against: "หลอดลมอักเสบ", kind: "เชื้อเป็น", method: "หยอดตาขวา", lot: "862721", expiry: "03-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS12", date: "2026-05-03", age: "6 wks", birds: 49860, bottles: "50", dose: "0.5 ml", doseSize: "1000 โด๊ส", name: "HG-GEL-VAC 3 (coryza)", against: "หวัดหน้าบวม", kind: "เชื้อตาย", method: "ฉีดกล้ามเนื้ออกขวา", lot: "511922", expiry: "11-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS13", date: "2026-05-16", age: "8 wks", birds: 49835, bottles: "50", dose: "1 หยด", doseSize: "1000 โด๊ส", name: "LARVAC", against: "กล่องเสียงอักเสบ", kind: "เชื้อเป็น", method: "หยอดจมูก", lot: "511969", expiry: "06-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS14", date: "2026-05-18", age: "8 wks", birds: 49765, bottles: "25 ซอง", dose: "1kg/Bw20000Kg", doseSize: "340 กรัม", name: "NUTRIMEC รอบ 1", against: "กำจัดพยาธิภายในและภายนอก 5 วัน", kind: "แบบผง", method: "ละลายน้ำ", lot: "", expiry: "", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS15", date: "2026-05-31", age: "10 wks", birds: 49760, bottles: "50", dose: "0.5 cc", doseSize: "1000 โด๊ส", name: "OLVAC เข็ม3", against: "นิวคาสเซิล", kind: "เชื้อตาย", method: "ฉีดกล้ามเนื้ออกซ้าย", lot: "511958", expiry: "02-2028", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS16", date: "2026-05-31", age: "10 wks", birds: 49760, bottles: "25", dose: "1 หยด", doseSize: "2000 โด๊ส", name: "BIOVAC ND V6/10-H120", against: "นิวคาสเซิล+หลอดลมอักเสบ", kind: "เชื้อเป็น", method: "หยอดตาซ้าย", lot: "601724", expiry: "06-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS17", date: "2026-05-31", age: "10 wks", birds: 49760, bottles: "50", dose: "1 หยด", doseSize: "1000 โด๊ส", name: "AE.VAC", against: "สมองและไขสันหลังอักเสบ", kind: "เชื้อเป็น", method: "หยอดปาก", lot: "", expiry: "", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS18", date: "2026-06-20", age: "13 wks", birds: 49735, bottles: "50", dose: "0.5 cc", doseSize: "1000 โด๊ส", name: "OLVAC A+B+HG(EDS)", against: "โรคไข่ลด ไข่นิ่ม", kind: "เชื้อตาย", method: "ฉีดกล้ามเนื้ออกขวา", lot: "511908", expiry: "12-2027", by: "วีระพล", checker: "เขมชาติ" },
    { id: "VS19", date: "2026-06-20", age: "13 wks", birds: 49735, bottles: "100", dose: "0.5 ml", doseSize: "500 โด๊ส", name: "QVAC RFH5+H9 เข็ม 3", against: "ไข้หวัดนก", kind: "เชื้อตาย", method: "ฉีดกล้ามเนื้ออกซ้าย", lot: "20260113", expiry: "12-10-2028", by: "วีระพล", checker: "เขมชาติ" },
  ],
};

// คลังผลผลิตรายวัน (ย้อนดูได้) — key = วันที่ ISO ; 3/7 ใช้ HOUSES เดิม (เติม date)
const PRODUCTION_SEED = {
  "2026-07-03": HOUSES.map((h) => ({ ...h, date: "2026-07-03" })),
  "2026-07-04": HOUSES_4_7,
};
const PROD_DEFAULT_DATE = "2026-07-04";   // เปิดมาโชว์วันล่าสุด

// วันที่ไทยเสมอ (พ.ศ. + ชื่อเดือนไทย) — รับ ISO "yyyy-mm-dd" หรือ Date ; parse แบบ local กันวันเพี้ยนข้ามโซนเวลา
function toThaiDate(v, long = true) {
  if (!v) return "";
  let d;
  if (v instanceof Date) d = v;
  else if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) { const [y, m, day] = String(v).slice(0, 10).split("-").map(Number); d = new Date(y, m - 1, day); }
  else d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString("th-TH", long ? { year: "numeric", month: "long", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
}

// ช่องเลือกวันที่ที่ "แสดงเป็นไทยเสมอ" — โชว์ข้อความไทย ทับปฏิทิน native (opacity 0) ไว้ให้กดเลือก ; onChange คืนค่า ISO เหมือน input[type=date]
function ThaiDateField({ value, onChange, style, long = true, inputRef, onKeyDown }) {
  const [focused, setFocused] = useState(false);   // ช่อง input จริงซ่อนอยู่ — โชว์กรอบเมื่อโฟกัสด้วยคีย์บอร์ด (Enter-chain)
  const box = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 10px", border: "1.5px solid #e3ddd0", borderRadius: 9, background: "#fff", fontSize: 14.5, fontFamily: "inherit", color: value ? INK : "#9b9384", width: "100%", ...(style || {}), ...(focused ? { borderColor: ACCENT_DK, boxShadow: `0 0 0 2px ${ACCENT}44` } : {}) };
  return (
    <div style={{ position: "relative", width: (style && style.width) || "100%" }}>
      <div style={box}><span>{value ? toThaiDate(value, long) : "เลือกวันที่"}</span><Calendar size={15} color={ACCENT_DK} /></div>
      <input type="date" value={value || ""} lang="th" ref={inputRef} onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => { try { e.target.showPicker(); } catch (err) {} }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0, margin: 0, padding: 0 }} />
    </div>
  );
}

/* ---------- แจ้งเตือนคุณภาพผลผลิต (ตั้งเกณฑ์เองได้) ----------
   เกณฑ์ = ต่อ 1 หลัง ต่อ 1 วัน · เว้นว่าง = ปิดการเตือนตัวนั้น
   ค่าเริ่มต้น: เปื้อนน้อย > 50 แผง · นวล > 3% ของไข่รวม · ไข่ดี < 60% ของไก่ */
const ALERT_STORE_KEY = "eggAlertSettings";
const DEFAULT_ALERT_CFG = {
  off: { เปื้อนน้อย: { max: 50, pct: null }, นวล: { max: null, pct: 3 } },
  ber: {},
  goodRateMin: 60, totalRateMin: null, offPctMax: null,
};
const numOrNull = (v) => { if (v === "" || v == null) return null; const n = Number(String(v).replace(/,/g, "")); return isFinite(n) ? n : null; };
// เติมคีย์ให้ครบทุกชนิด (กันค่าเก่าที่ไม่มีคีย์) → cfg ที่ทุก off/ber มี {max,pct}
function normAlertCfg(raw) {
  const cfg = raw || {};
  const off = {}; OFF_KEYS.forEach((k) => { const o = (cfg.off || {})[k] || {}; off[k] = { max: numOrNull(o.max), pct: numOrNull(o.pct) }; });
  const ber = {}; BER_KEYS.forEach((k) => { const o = (cfg.ber || {})[k] || {}; ber[k] = { max: numOrNull(o.max), pct: numOrNull(o.pct) }; });
  return { off, ber, goodRateMin: numOrNull(cfg.goodRateMin), totalRateMin: numOrNull(cfg.totalRateMin), offPctMax: numOrNull(cfg.offPctMax) };
}
// คำนวณรายการแจ้งเตือนของ 1 หลัง ตามเกณฑ์ cfg → [{tag,label,detail}]
function computeHouseAlerts(h, cfg) {
  const out = [];
  const goodFong = Object.values(h.grade.เบอร์).reduce((s, v) => s + (v || 0), 0);
  const offPrang = Object.values(h.grade.ตกเกรด).reduce((s, v) => s + (v || 0), 0);
  const offFong = offPrang * PER_PRADANG;
  const totalFong = goodFong + offFong;
  const chickens = h.chickens || 0;
  OFF_KEYS.forEach((k) => {
    const prang = h.grade.ตกเกรด[k] || 0; const r = cfg.off[k] || {};
    if (r.max != null && prang > r.max) out.push({ tag: "off:" + k, label: k, detail: `${fmt(prang)} แผง · เกิน ${fmt(r.max)}` });
    if (r.pct != null && totalFong > 0) { const p = (prang * PER_PRADANG) / totalFong * 100; if (p > r.pct) out.push({ tag: "off:" + k, label: k, detail: `${p.toFixed(1)}% ของไข่รวม · เกิน ${r.pct}%` }); }
  });
  BER_KEYS.forEach((k) => {
    const fong = h.grade.เบอร์[k] || 0; const prang = Math.round(fong / PER_PRADANG); const r = cfg.ber[k] || {};
    if (r.max != null && prang > r.max) out.push({ tag: "ber:" + k, label: "เบอร์ " + k, detail: `${fmt(prang)} แผง · เกิน ${fmt(r.max)}` });
    if (r.pct != null && totalFong > 0) { const p = fong / totalFong * 100; if (p > r.pct) out.push({ tag: "ber:" + k, label: "เบอร์ " + k, detail: `${p.toFixed(1)}% ของไข่รวม · เกิน ${r.pct}%` }); }
  });
  if (cfg.goodRateMin != null && chickens > 0) { const rate = goodFong / chickens * 100; if (rate < cfg.goodRateMin) out.push({ tag: "rate:good", label: "ไข่ดีต่ำ", detail: `${rate.toFixed(1)}% ของไก่ · ต่ำกว่า ${cfg.goodRateMin}%` }); }
  if (cfg.totalRateMin != null && chickens > 0) { const rate = totalFong / chickens * 100; if (rate < cfg.totalRateMin) out.push({ tag: "rate:total", label: "ไข่รวมต่ำ", detail: `${rate.toFixed(1)}% ของไก่ · ต่ำกว่า ${cfg.totalRateMin}%` }); }
  if (cfg.offPctMax != null && totalFong > 0) { const p = offFong / totalFong * 100; if (p > cfg.offPctMax) out.push({ tag: "rate:offpct", label: "ตกเกรดสูง", detail: `${p.toFixed(1)}% ของไข่รวม · เกิน ${cfg.offPctMax}%` }); }
  return out;
}

// กล่องตั้งค่าเกณฑ์แจ้งเตือน — ปรับได้ทุกตัวเลข (ตกเกรดแยกชนิด · ไข่ดีแยกเบอร์ · ภาพรวม)
function AlertSettingsModal({ cfg, onSave, onClose }) {
  const s = (v) => (v == null ? "" : String(v));
  const initFrom = (c) => {
    const n = normAlertCfg(c);
    const o = {}; OFF_KEYS.forEach((k) => o[k] = { max: s(n.off[k].max), pct: s(n.off[k].pct) });
    const b = {}; BER_KEYS.forEach((k) => b[k] = { max: s(n.ber[k].max), pct: s(n.ber[k].pct) });
    return { o, b, goodRateMin: s(n.goodRateMin), totalRateMin: s(n.totalRateMin), offPctMax: s(n.offPctMax) };
  };
  const start = initFrom(cfg);
  const [off, setOff] = useState(start.o);
  const [ber, setBer] = useState(start.b);
  const [goodRateMin, setGoodRateMin] = useState(start.goodRateMin);
  const [totalRateMin, setTotalRateMin] = useState(start.totalRateMin);
  const [offPctMax, setOffPctMax] = useState(start.offPctMax);

  const inp = (val, setter, ph) => <input value={val} onChange={(e) => setter(e.target.value.replace(/[^\d.]/g, ""))} onFocus={(e) => e.target.select()} placeholder={ph || "—"} inputMode="decimal"
    style={{ width: "100%", padding: "6px 8px", border: "1.5px solid #e3ddd0", borderRadius: 8, fontSize: 13.5, fontFamily: "inherit", textAlign: "right", outline: "none" }} />;
  const sec = (bg, bd, ac) => ({ background: bg, border: `1px solid ${bd}`, borderLeft: `4px solid ${ac}`, borderRadius: 12, padding: "12px 12px 10px", marginBottom: 13 });
  const secT = (c) => ({ fontWeight: 800, color: c, fontSize: 13, marginBottom: 9 });
  const hdrRow = { display: "grid", gridTemplateColumns: "1fr 84px 84px", gap: 8, alignItems: "center", padding: "0 0 5px", fontSize: 11, color: "#9b8e78", fontWeight: 700, borderBottom: "1px dashed #e3ddd0", marginBottom: 5 };
  const gridRow = { display: "grid", gridTemplateColumns: "1fr 84px 84px", gap: 8, alignItems: "center", padding: "3px 0" };
  const sumRow = { display: "grid", gridTemplateColumns: "1fr 84px", gap: 8, alignItems: "center", padding: "4px 0" };
  const nameCell = { fontSize: 13, fontWeight: 600 };

  const save = () => {
    const outOff = {}; OFF_KEYS.forEach((k) => outOff[k] = { max: numOrNull(off[k].max), pct: numOrNull(off[k].pct) });
    const outBer = {}; BER_KEYS.forEach((k) => outBer[k] = { max: numOrNull(ber[k].max), pct: numOrNull(ber[k].pct) });
    onSave({ off: outOff, ber: outBer, goodRateMin: numOrNull(goodRateMin), totalRateMin: numOrNull(totalRateMin), offPctMax: numOrNull(offPctMax) });
    onClose();
  };
  const resetDefault = () => { const d = initFrom(DEFAULT_ALERT_CFG); setOff(d.o); setBer(d.b); setGoodRateMin(d.goodRateMin); setTotalRateMin(d.totalRateMin); setOffPctMax(d.offPctMax); };
  const clearAll = () => { const e = initFrom({}); setOff(e.o); setBer(e.b); setGoodRateMin(""); setTotalRateMin(""); setOffPctMax(""); };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>ตั้งค่าเกณฑ์แจ้งเตือนผลผลิต</div><div style={S.modalSub}>เว้นว่าง = ไม่เตือน · เกณฑ์คิดต่อ 1 หลัง ต่อวัน</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={sec("#EFF6FF", "#BFDBFE", "#2563EB")}>
          <div style={secT("#1D4ED8")}>📊 ภาพรวมทั้งหลัง</div>
          <div style={sumRow}><span style={nameCell}>ไข่ดี ต่ำกว่า <span style={{ color: "#9b8e78", fontWeight: 500 }}>(% ของไก่)</span></span>{inp(goodRateMin, setGoodRateMin, "60")}</div>
          <div style={sumRow}><span style={nameCell}>ไข่รวม ต่ำกว่า <span style={{ color: "#9b8e78", fontWeight: 500 }}>(% ของไก่)</span></span>{inp(totalRateMin, setTotalRateMin, "—")}</div>
          <div style={sumRow}><span style={nameCell}>ตกเกรดรวม เกิน <span style={{ color: "#9b8e78", fontWeight: 500 }}>(% ของไข่รวม)</span></span>{inp(offPctMax, setOffPctMax, "—")}</div>
        </div>

        <div style={sec("#FEF6EC", "#FBD9A8", "#D97706")}>
          <div style={secT("#B45309")}>🍳 ไข่ตกเกรด · แจ้งเมื่อเกิน</div>
          <div style={hdrRow}><span>ชนิด</span><span style={{ textAlign: "right" }}>สูงสุด<br />(แผง)</span><span style={{ textAlign: "right" }}>หรือ %<br />ไข่รวม</span></div>
          {OFF_KEYS.map((k) => (
            <div key={k} style={gridRow}>
              <span style={nameCell}>{k}</span>
              {inp(off[k].max, (v) => setOff((p) => ({ ...p, [k]: { ...p[k], max: v } })))}
              {inp(off[k].pct, (v) => setOff((p) => ({ ...p, [k]: { ...p[k], pct: v } })), "%")}
            </div>
          ))}
        </div>

        <div style={sec("#F1FAF3", "#BBE7C9", "#16A34A")}>
          <div style={secT("#15803D")}>🥚 ไข่ดีแยกเบอร์ · แจ้งเมื่อเกิน <span style={{ color: "#9b8e78", fontWeight: 500, fontSize: 11.5 }}>(ไม่บังคับ)</span></div>
          <div style={hdrRow}><span>เบอร์</span><span style={{ textAlign: "right" }}>สูงสุด<br />(แผง)</span><span style={{ textAlign: "right" }}>หรือ %<br />ไข่รวม</span></div>
          {BER_KEYS.map((k) => (
            <div key={k} style={gridRow}>
              <span style={nameCell}>เบอร์ {k}</span>
              {inp(ber[k].max, (v) => setBer((p) => ({ ...p, [k]: { ...p[k], max: v } })))}
              {inp(ber[k].pct, (v) => setBer((p) => ({ ...p, [k]: { ...p[k], pct: v } })), "%")}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={clearAll} style={{ ...S.ghostBtn, flexShrink: 0 }}>ล้างทั้งหมด</button>
          <button onClick={resetDefault} style={{ ...S.ghostBtn, flexShrink: 0 }}>คืนค่าเริ่มต้น</button>
          <button onClick={save} style={{ ...S.primaryBtn, flex: 1 }}>บันทึกเกณฑ์</button>
        </div>
      </div>
    </div>
  );
}

function ProductionView({ houses = [], setHouses, prodDate, setProdDate, production = {} }) {
  const [editHouse, setEditHouse] = useState(null);
  const [undoStack, setUndoStack] = useState([]);  // ประวัติค่าก่อนแก้ (undo ได้หลายชั้น)
  useEffect(() => { setUndoStack([]); }, [prodDate]);   // เปลี่ยนวัน → ล้างประวัติย้อนกลับ
  // เกณฑ์แจ้งเตือนคุณภาพ (บันทึกลง localStorage — ปรับได้ที่ปุ่ม "เกณฑ์เตือน")
  const [alertCfgRaw, setAlertCfgRaw] = useState(() => {
    try { const st = localStorage.getItem(ALERT_STORE_KEY); return st ? JSON.parse(st) : DEFAULT_ALERT_CFG; }
    catch { return DEFAULT_ALERT_CFG; }
  });
  const [showAlertCfg, setShowAlertCfg] = useState(false);
  useEffect(() => { try { localStorage.setItem(ALERT_STORE_KEY, JSON.stringify(alertCfgRaw)); } catch {} }, [alertCfgRaw]);
  const alertCfg = useMemo(() => normAlertCfg(alertCfgRaw), [alertCfgRaw]);
  const prodDateTH = toThaiDate(prodDate);
  const sortedDates = Object.keys(production).sort();   // วันที่ที่มีข้อมูล (เก่า→ใหม่)
  const curIdx = sortedDates.indexOf(prodDate);
  const goDay = (delta) => { const i = curIdx + delta; if (i >= 0 && i < sortedDates.length) setProdDate(sortedDates[i]); };
  const startNewDay = () => {   // สร้างวันใหม่จากโครงวันล่าสุด (คงจำนวนไก่+ชนิด, เคลียร์จำนวนไข่/สุ่มตรวจ)
    const latest = sortedDates.filter((d) => d < prodDate).pop() || sortedDates[sortedDates.length - 1];
    const base = production[latest] || [];
    const zero = (o) => Object.fromEntries(Object.keys(o).map((k) => [k, 0]));
    const copied = base.map((h) => ({ id: h.id, date: prodDate, chickens: h.chickens, grade: { เบอร์: zero(h.grade.เบอร์), ตกเกรด: zero(h.grade.ตกเกรด) } }));
    const extra = HOUSE_IDS.filter((id) => !copied.some((h) => h.id === id)).map((id) => emptyHouseDay(id, prodDate));   // หลังใหม่ (เช่น H7) โผล่ในวันใหม่อัตโนมัติ
    setHouses([...copied, ...extra]);
  };
  // โชว์ครบทุกหลังตาม HOUSE_IDS แม้วันนั้นยังไม่มีข้อมูล (เช่น H7 เพิ่งเข้าไก่) — แถวศูนย์ ยังไม่ถูกบันทึกจนกว่าจะกดแก้จริง
  const housesAll = useMemo(() => [...houses, ...HOUSE_IDS.filter((id) => !houses.some((h) => h.id === id)).map((id) => emptyHouseDay(id, prodDate))], [houses, prodDate]);
  const saveHouse = (id, grade, chickens, date, inspect) => {
    const cur = houses.find((h) => h.id === id);
    if (cur) setUndoStack((s) => [...s, { id, house: cur }]);   // จำค่าก่อนแก้ไว้ย้อนกลับ (house object เดิม ไม่ถูก mutate)
    if (setHouses) setHouses((prev) => prev.some((h) => h.id === id)
      ? prev.map((h) => h.id === id ? { ...h, chickens, grade, date, inspect } : h)
      : [...prev, { id, chickens, grade, date, inspect }]);   // หลังใหม่ที่ยังไม่มีในวันนั้น (H7) → บันทึกครั้งแรกค่อยเพิ่มเข้าไป
    setEditHouse(null);
  };
  const undoEdit = () => {   // ย้อนการแก้ครั้งล่าสุด → คืนค่าหลังนั้นเป็นค่าเดิม
    if (!undoStack.length) return;
    const last = undoStack[undoStack.length - 1];
    if (setHouses) setHouses((prev) => prev.map((h) => h.id === last.id ? last.house : h));
    setUndoStack((s) => s.slice(0, -1));
  };

  const calc = (h) => {
    const goodFong = Object.values(h.grade.เบอร์).reduce((s, v) => s + v, 0);
    const goodPrang = goodFong / PER_PRADANG;
    const offgrade = Object.values(h.grade.ตกเกรด).reduce((s, v) => s + v, 0); // หน่วยแผง
    const offFong = offgrade * PER_PRADANG;
    const totalFong = goodFong + offFong;
    const pctOff = totalFong ? (offFong / totalFong) * 100 : 0;
    const pctTotal = h.chickens ? (totalFong / h.chickens) * 100 : 0;
    return { goodFong, goodPrang, offgrade, offFong, totalFong, pctOff, pctTotal };
  };

  const grand = houses.reduce((t, h) => {
    const c = calc(h);
    OFF_KEYS.forEach((k) => t.off[k] = (t.off[k] || 0) + (h.grade.ตกเกรด[k] || 0));
    BER_KEYS.forEach((k) => t.ber[k] = (t.ber[k] || 0) + (h.grade.เบอร์[k] || 0));
    t.good += c.goodFong; t.offPrang += c.offgrade; t.offFong += c.offFong; t.total += c.totalFong; t.chickens += h.chickens;
    return t;
  }, { off: {}, ber: {}, good: 0, offPrang: 0, offFong: 0, total: 0, chickens: 0 });

  // แจ้งเตือน: คำนวณต่อหลัง + เก็บ tag ช่องที่เกินเกณฑ์ไว้ไฮไลต์สีแดง
  const alertMap = {}, flagSet = {};
  housesAll.forEach((h) => { const a = h.chickens > 0 ? computeHouseAlerts(h, alertCfg) : []; alertMap[h.id] = a; flagSet[h.id] = new Set(a.map((x) => x.tag)); });   // หลังที่ยังไม่มีไก่/ข้อมูล ไม่ต้องเตือน
  const totalAlerts = Object.values(alertMap).reduce((s, a) => s + a.length, 0);
  const flag = (hid, tag) => (flagSet[hid] && flagSet[hid].has(tag)) ? S.alertCell : null;

  return (
    <div style={S.wide}>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>รายงานผลผลิตไข่ · {prodDateTH}{sortedDates.length > 1 ? <span style={{ fontSize: 12.5, fontWeight: 600, color: "#9b8e78" }}> · ย้อนดูได้ {sortedDates.length} วัน</span> : null}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setShowAlertCfg(true)} title="ตั้งค่าเกณฑ์แจ้งเตือนคุณภาพผลผลิต"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: `1px solid ${totalAlerts > 0 ? "#DC2626" : ACCENT}`, background: totalAlerts > 0 ? "#FEF2F2" : "#fff", color: totalAlerts > 0 ? "#B91C1C" : ACCENT_DK, borderRadius: 8, fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
            <Bell size={14} /> เกณฑ์เตือน{totalAlerts > 0 ? ` · ${totalAlerts}` : ""}
          </button>
          {undoStack.length > 0 && (
            <button onClick={undoEdit} title="ย้อนค่าที่แก้ครั้งล่าสุดกลับคืน"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: `1px solid ${ACCENT}`, background: "#FFF7EC", color: ACCENT_DK, borderRadius: 8, fontSize: 13, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
              <RotateCcw size={14} /> ย้อนการแก้ ({undoStack.length})
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => goDay(-1)} disabled={curIdx <= 0} title="วันก่อนหน้า"
              style={{ padding: "6px 11px", border: `1px solid ${ACCENT}`, background: curIdx <= 0 ? "#f3efe6" : "#fff", color: curIdx <= 0 ? "#c9c0ad" : ACCENT_DK, borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: curIdx <= 0 ? "default" : "pointer" }}>‹</button>
            <ThaiDateField value={prodDate} onChange={setProdDate} style={{ width: 190, padding: "7px 10px", borderColor: ACCENT, fontSize: 13.5 }} />
            <button onClick={() => goDay(1)} disabled={curIdx < 0 || curIdx >= sortedDates.length - 1} title="วันถัดไป"
              style={{ padding: "6px 11px", border: `1px solid ${ACCENT}`, background: (curIdx < 0 || curIdx >= sortedDates.length - 1) ? "#f3efe6" : "#fff", color: (curIdx < 0 || curIdx >= sortedDates.length - 1) ? "#c9c0ad" : ACCENT_DK, borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: (curIdx < 0 || curIdx >= sortedDates.length - 1) ? "default" : "pointer" }}>›</button>
          </div>
        </div>
      </div>
      {houses.length > 0 && (totalAlerts > 0 ? (
        <div style={S.alertBanner}>
          <div style={S.alertBannerHead}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Bell size={17} color="#B91C1C" />
              <b style={{ color: "#991B1B", fontSize: 14.5 }}>แจ้งเตือนคุณภาพผลผลิต · {prodDateTH}</b>
              <span style={S.alertCount}>{totalAlerts} รายการ</span>
            </span>
            <button onClick={() => setShowAlertCfg(true)} style={S.alertCfgBtn}><Settings size={13} /> ปรับเกณฑ์</button>
          </div>
          <div style={S.alertList}>
            {housesAll.filter((h) => alertMap[h.id] && alertMap[h.id].length).map((h) => (
              <div key={h.id} style={S.alertRow}>
                <button onClick={() => setEditHouse(h)} style={S.alertHouseBtn} title="กรอก/แก้ไขข้อมูลหลังนี้">{h.id} <Pencil size={10} /></button>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {alertMap[h.id].map((a, i) => <span key={i} style={S.alertChip}><b>{a.label}</b> · {a.detail}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={S.alertOk}>
          <CheckCircle2 size={16} color="#15803D" /> ผลผลิตทุกหลังผ่านเกณฑ์ที่ตั้งไว้
          <button onClick={() => setShowAlertCfg(true)} style={{ ...S.alertCfgBtn, marginLeft: "auto", borderColor: "#BBF7D0", color: "#15803D" }}><Settings size={13} /> ปรับเกณฑ์</button>
        </div>
      ))}
      {houses.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#8a8172" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🗓️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginBottom: 6 }}>ยังไม่มีข้อมูลผลผลิตของ {prodDateTH}</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>เลือกวันที่มีข้อมูลจากปุ่ม ‹ › ด้านบน หรือเริ่มบันทึกวันนี้</div>
          <button onClick={startNewDay} style={{ ...S.primaryBtn, maxWidth: 340, margin: "0 auto" }}>＋ เริ่มบันทึกผลผลิตวันนี้ (คัดลอกโครงจากวันล่าสุด)</button>
        </div>
      ) : (
      <div style={S.tableScroll}>
        <table style={S.table} className="prodTable">
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...S.th, ...S.thSticky, textAlign: "left" }}>หลัง</th>
              <th rowSpan={2} style={{ ...S.th, background: PROD_C.off }}>จัมโบ้</th>
              <th rowSpan={2} style={{ ...S.th, background: PROD_C.off }}>บุบ</th>
              <th rowSpan={2} style={{ ...S.th, background: PROD_C.off }}>ตอก</th>
              <th rowSpan={2} style={{ ...S.th, background: PROD_C.off }}>จิ๋ว</th>
              <th rowSpan={2} style={{ ...S.th, background: PROD_C.off }}>ขาว</th>
              <th rowSpan={2} style={{ ...S.th, background: PROD_C.off }}>หัวทราย</th>
              <th rowSpan={2} style={{ ...S.th, background: PROD_C.off }}>นวล</th>
              <th colSpan={2} style={{ ...S.th, background: PROD_C.off }}>ไข่เปื้อน</th>
              <th rowSpan={2} style={{ ...S.th, background: PROD_C.off }}>รวม<br />(แผง)</th>
              <th rowSpan={2} style={{ ...S.th, background: "#C2410C", color: "#fff", fontSize: 13.5 }}>%ไข่<br />ตกเกรด</th>
              <th colSpan={7} style={{ ...S.th, background: PROD_C.good }}>รายการไข่ดี (แผง)</th>
              <th rowSpan={2} style={{ ...S.th, background: PROD_C.sum }}>รวมไข่ไก่<br />(ดี+ตกเกรด)</th>
              <th rowSpan={2} style={{ ...S.th, background: PROD_C.sum }}>ยอดไก่<br />คงเหลือ</th>
              <th rowSpan={2} style={{ ...S.th, background: "#15803D", color: "#fff", fontSize: 14.5, fontFamily: "'Prompt', sans-serif", letterSpacing: 0.3 }}>%ไข่<br />รวม</th>
            </tr>
            <tr>
              <th style={{ ...S.th, background: PROD_C.off }}>มาก</th>
              <th style={{ ...S.th, background: PROD_C.off }}>น้อย</th>
              {BER_KEYS.map((k) => <th key={k} style={{ ...S.th, background: "#DBF5E4", color: "#15803D" }}>เบอร์ {k}</th>)}
              <th style={{ ...S.th, background: "#4FB477", color: "#fff" }}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {housesAll.map((h, hi) => {
              const c = calc(h);
              const g = h.grade.ตกเกรด;
              const zebra = hi % 2 === 1 ? "#FAF5EA" : undefined;   // สลับสีพื้นรายหลัง
              return (
                <tr key={h.id} style={zebra ? { background: zebra } : undefined}>
                  <td style={{ ...S.td, ...S.tdSticky, fontWeight: 700, textAlign: "left", ...(zebra ? { background: zebra } : {}) }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{h.id}
                      <button onClick={() => setEditHouse(h)} title="กรอก/แก้ไขจำนวนไข่" style={{ display: "inline-flex", padding: 4, borderRadius: 6, border: "1px solid #e3ddd0", background: "#fff", color: ACCENT_DK, cursor: "pointer" }}><Pencil size={12} /></button>
                      {h.inspect && h.inspect.result ? <span title={"สุ่มตรวจ (ตอก " + (h.inspect.count || 0) + " ฟอง): " + h.inspect.result} style={{ cursor: "help", fontSize: 12 }}>🔍</span> : null}
                      {alertMap[h.id] && alertMap[h.id].length ? <span title={alertMap[h.id].map((a) => a.label + " " + a.detail).join("\n")} style={{ cursor: "help", fontSize: 12 }}>⚠️</span> : null}
                    </span>
                  </td>
                  <td style={{ ...S.td, ...flag(h.id, "off:จัมโบ้") }}>{fmt(g.จัมโบ้ || 0)}</td>
                  <td style={{ ...S.td, ...flag(h.id, "off:บุบ") }}>{fmt(g.บุบ || 0)}</td>
                  <td style={{ ...S.td, ...flag(h.id, "off:ตอก") }}>{fmt(g.ตอก || 0)}</td>
                  <td style={{ ...S.td, ...flag(h.id, "off:จิ๋ว") }}>{fmt(g.จิ๋ว || 0)}</td>
                  <td style={{ ...S.td, ...flag(h.id, "off:เปลือกขาว") }}>{fmt(g.เปลือกขาว || 0)}</td>
                  <td style={{ ...S.td, ...flag(h.id, "off:หัวทราย") }}>{fmt(g.หัวทราย || 0)}</td>
                  <td style={{ ...S.td, ...flag(h.id, "off:นวล") }}>{fmt(g.นวล || 0)}</td>
                  <td style={{ ...S.td, ...flag(h.id, "off:เปื้อนมาก") }}>{fmt(g.เปื้อนมาก || 0)}</td>
                  <td style={{ ...S.td, ...flag(h.id, "off:เปื้อนน้อย") }}>{fmt(g.เปื้อนน้อย || 0)}</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{fmt(c.offgrade)}</td>
                  <td style={{ ...S.td, background: "#FFE8D2", fontWeight: 800, color: "#9A3412", fontSize: 14, ...flag(h.id, "rate:offpct") }}>{c.pctOff.toFixed(2)}%</td>
                  {BER_KEYS.map((k) => <td key={k} style={{ ...S.td, ...flag(h.id, "ber:" + k) }}>{fmt(Math.round((h.grade.เบอร์[k] || 0) / PER_PRADANG))}</td>)}
                  <td style={{ ...S.td, fontWeight: 700, color: "#15803D", ...flag(h.id, "rate:good") }}>{fmt(Math.round(c.goodPrang))}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{fmt(c.totalFong)}</td>
                  <td style={S.td}>{fmt(h.chickens)}</td>
                  <td style={{ ...S.td, background: "#DCFCE7", fontWeight: 800, color: "#166534", fontSize: 14, ...flag(h.id, "rate:total") }}>{c.pctTotal.toFixed(2)}%</td>
                </tr>
              );
            })}
            <tr>
              <td style={{ ...S.td, ...S.tdSticky, ...S.tfoot, textAlign: "left" }}>รวม</td>
              {OFF_KEYS.map((k) => <td key={k} style={{ ...S.td, ...S.tfoot }}>{fmt(grand.off[k] || 0)}</td>)}
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(grand.offPrang)}</td>
              <td style={{ ...S.td, ...S.tfoot, background: "#FED7AA", color: "#9A3412", fontSize: 14 }}>{grand.total ? ((grand.offFong / grand.total) * 100).toFixed(2) : 0}%</td>
              {BER_KEYS.map((k) => <td key={k} style={{ ...S.td, ...S.tfoot }}>{fmt(Math.round((grand.ber[k] || 0) / PER_PRADANG))}</td>)}
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(Math.round(grand.good / PER_PRADANG))}</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(grand.total)}</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(grand.chickens)}</td>
              <td style={{ ...S.td, ...S.tfoot, background: "#BBF7D0", color: "#166534", fontSize: 14 }}>{grand.chickens ? ((grand.total / grand.chickens) * 100).toFixed(2) : 0}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      )}
      <div style={S.hint}>กด ✎ ที่ชื่อหลังเพื่อ "กรอก/แก้ไข" จำนวนไข่วันนี้ (เบอร์ 0-5 + ตกเกรด) · <b style={{ color: "#15803D" }}>ผลผลิตเข้าสต็อกคลังของวันนั้นอัตโนมัติ</b> (ไม่ต้องกดรับเข้า) · <b>แก้ผิด?</b> กด "↩ ย้อนการแก้" (มุมขวาบน) เพื่อคืนค่าเดิม · <b style={{ color: "#B91C1C" }}>ช่องแดง</b> = เกินเกณฑ์ที่ตั้งไว้ (กด <b>🔔 เกณฑ์เตือน</b> เพื่อปรับตัวเลข) · %ไข่ตกเกรด = ตกเกรด(ฟอง) ÷ ไข่รวม · %ไข่รวม = ไข่รวม ÷ ยอดไก่</div>
      {editHouse && <HouseEditModal key={editHouse.id} house={editHouse} defaultDate={prodDate} onClose={() => setEditHouse(null)} onSave={saveHouse} />}
      {showAlertCfg && <AlertSettingsModal cfg={alertCfgRaw} onSave={setAlertCfgRaw} onClose={() => setShowAlertCfg(false)} />}
    </div>
  );
}

// กรอก/แก้ไขผลผลิตรายหลัง — จำนวนไก่ + ไข่ดี(เบอร์ 0-5, ฟอง) + ตกเกรด(แผง)
// แยกสีตามหมวด (ไก่=ฟ้า · ไข่ดี=เขียว · ตกเกรด=ส้ม) + กด Enter เพื่อเด้งไปช่องถัดไป (กรอกเร็ว)
function HouseEditModal({ house, defaultDate, onClose, onSave }) {
  const [chickens, setChickens] = useState(String(house.chickens || ""));
  // ไข่ดีเบอร์: กรอก/แสดงเป็น "แผง" (ตรงกับใบงานหน้าฟาร์มและตารางรายงาน) — ภายในเก็บเป็นฟอง จึงแปลง ÷30 ตอนเปิด, ×30 ตอนบันทึก
  const [ber, setBer] = useState(() => { const o = {}; Object.keys(house.grade.เบอร์).forEach((k) => o[k] = house.grade.เบอร์[k] == null ? "" : String(Math.round((house.grade.เบอร์[k] || 0) / PER_PRADANG))); return o; });
  const [off, setOff] = useState(() => { const o = {}; Object.keys(house.grade.ตกเกรด).forEach((k) => o[k] = String(house.grade.ตกเกรด[k] ?? "")); return o; });
  const [date, setDate] = useState(house.date || defaultDate || "");
  const insp0 = house.inspect || {};
  const [inspN, setInspN] = useState(insp0.count != null ? String(insp0.count) : "4");   // สุ่มตรวจ: ตอกไข่ วันละ 4 ฟอง/หลัง (ค่าเริ่มต้น)
  const [inspResult, setInspResult] = useState(insp0.result || "");
  const berKeys = Object.keys(ber), offKeys = Object.keys(off);
  const goodPrang = Object.values(ber).reduce((s, v) => s + (parseInt(v) || 0), 0);   // แผง (ตามที่กรอก)
  const offPrang = Object.values(off).reduce((s, v) => s + (parseInt(v) || 0), 0);
  const inputsRef = React.useRef([]);   // input เรียงตามลำดับกรอก (ไก่ → เบอร์ 0-5 → ตกเกรด)
  const saveRef = React.useRef(null);
  const dateTH = toThaiDate(date);
  const withCommas = (s) => { const d = String(s ?? "").replace(/\D/g, ""); return d ? Number(d).toLocaleString("en-US") : ""; };  // แสดงเลขมีลูกน้ำ (เก็บ state เป็นเลขล้วน)
  const save = () => {
    const eB = {}; Object.keys(ber).forEach((k) => eB[k] = (parseInt(ber[k]) || 0) * PER_PRADANG);   // แผงที่กรอก → เก็บเป็นฟอง
    const eO = {}; Object.keys(off).forEach((k) => eO[k] = parseInt(off[k]) || 0);
    onSave(house.id, { เบอร์: eB, ตกเกรด: eO }, parseInt(chickens) || 0, date, { count: parseInt(inspN) || 0, result: inspResult.trim() });
  };
  // กด Enter → ไปช่องถัดไป ; ช่องสุดท้าย → โฟกัสปุ่มบันทึก (Enter ซ้ำ = บันทึก)
  const onKey = (idx) => (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = inputsRef.current[idx + 1];
    if (next) next.focus(); else if (saveRef.current) saveRef.current.focus();
  };
  const cellInput = { width: "100%", padding: "9px 10px", border: "1.5px solid #e3ddd0", borderRadius: 9, fontSize: 15, fontFamily: "inherit", textAlign: "right", outline: "none" };
  const regInput = (idx, cls, extra) => ({
    ref: (el) => { inputsRef.current[idx] = el; },
    onKeyDown: onKey(idx),
    onFocus: (e) => e.target.select(),   // โฟกัสแล้วเลือกเลขเดิมทั้งหมด → พิมพ์ทับได้เลย
    className: `prodInput ${cls}`,
    type: "text", inputMode: "numeric", placeholder: "0",
    style: { ...cellInput, ...(extra || {}) },
  });
  const stripSet = (setter) => (e) => { const v = e.target.value.replace(/\D/g, ""); setter(v); };  // เก็บเฉพาะตัวเลข (ตัดลูกน้ำ/ตัวอักษรออก)
  const fieldWrap = (key, label, node, color, labelSize) => <div key={key}><label style={{ display: "block", fontSize: labelSize || 12.5, fontWeight: 700, color: color || INK, marginBottom: 3, textAlign: "left" }}>{label}</label>{node}</div>;
  const section = (bg, border, accent) => ({ background: bg, border: `1px solid ${border}`, borderLeft: `4px solid ${accent}`, borderRadius: 12, padding: "12px 12px 8px", marginBottom: 13 });
  const berBase = 1, offBase = 1 + berKeys.length;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>กรอกข้อมูลผลผลิต · {house.id}</div><div style={S.modalSub}>ใส่ตัวเลข แล้วกด Enter เพื่อไปช่องถัดไป</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={section("#F5F3FF", "#DDD6FE", "#7C3AED")}>
          <div style={{ fontWeight: 800, color: "#6D28D9", fontSize: 13, marginBottom: 8 }}>📅 วันที่ผลผลิต {dateTH && <span style={{ fontWeight: 600, color: "#7C6FAE" }}>· {dateTH}</span>}</div>
          <ThaiDateField value={date} onChange={setDate} style={{ ...cellInput, textAlign: "left", borderColor: "#DDD6FE" }} />
        </div>

        <div style={section("#EFF5FE", "#BFDBFE", "#2563EB")}>
          <div style={{ fontWeight: 800, color: "#1D4ED8", fontSize: 13, marginBottom: 8 }}>🐔 จำนวนไก่ (ตัว)</div>
          <input {...regInput(0, "pfChick", { textAlign: "left" })} value={withCommas(chickens)} onChange={stripSet(setChickens)} autoFocus />
        </div>

        <div style={section("#F1FAF3", "#BBE7C9", "#16A34A")}>
          <div style={{ fontWeight: 800, color: "#15803D", fontSize: 13, marginBottom: 8 }}>🥚 ไข่ดี (แผง) · แยกเบอร์</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
            {berKeys.map((k, i) => fieldWrap(k, `เบอร์ ${k}`, <input {...regInput(berBase + i, "pfGood")} value={withCommas(ber[k])} onChange={stripSet((v) => setBer((p) => ({ ...p, [k]: v })))} />, "#15803D"))}
          </div>
        </div>

        <div style={section("#FEF6EC", "#FBD9A8", "#D97706")}>
          <div style={{ fontWeight: 800, color: "#B45309", fontSize: 13, marginBottom: 8 }}>🍳 ตกเกรด (แผง) · แยกชนิด</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
            {offKeys.map((k, i) => fieldWrap(k, k, <input {...regInput(offBase + i, "pfOff", { padding: "6px 8px", fontSize: 13.5 })} value={withCommas(off[k])} onChange={stripSet((v) => setOff((p) => ({ ...p, [k]: v })))} />, "#B45309", 11.5))}
          </div>
        </div>

        <div style={section("#F0FDFA", "#99F6E4", "#0D9488")}>
          <div style={{ fontWeight: 800, color: "#0F766E", fontSize: 13, marginBottom: 8 }}>🔍 สุ่มตรวจคุณภาพ (ตอกไข่) · ไม่หักสต็อก</div>
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <div style={{ width: 120, flexShrink: 0 }}>
              <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#0F766E", marginBottom: 3, textAlign: "left" }}>จำนวนตอก (ฟอง)</label>
              <input {...regInput(offBase + offKeys.length, "pfInsp")} value={withCommas(inspN)} onChange={stripSet(setInspN)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#0F766E", marginBottom: 3, textAlign: "left" }}>ผลการสุ่มตรวจ / หมายเหตุ</label>
              <textarea value={inspResult} onChange={(e) => setInspResult(e.target.value)} rows={2} placeholder="เช่น ปกติ · พบจุดเลือด 1 ฟอง · เปลือกบาง ..."
                style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #99F6E4", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
            </div>
          </div>
        </div>

        <div style={S.weighSummary}>
          <div style={S.wsRow}><span>ไข่ดีรวม</span><span style={{ color: "#15803D", fontWeight: 700 }}>{fmt(goodPrang)} แผง · {fmt(goodPrang * PER_PRADANG)} ฟอง</span></div>
          <div style={S.wsRow}><span>ตกเกรดรวม</span><span style={{ color: "#B45309", fontWeight: 700 }}>{fmt(offPrang)} แผง</span></div>
        </div>
        <button ref={saveRef} style={S.primaryBtn} onClick={save}>บันทึกข้อมูล {house.id}</button>
      </div>
    </div>
  );
}

/* ============================================================
   หน้าจอ: การเลี้ยง (รายงานการตรวจติดตามการเลี้ยงไก่ไข่ — ตามฟอร์มกระดาษ)
   บันทึกรายวันต่อโรงเรือน: แม่ไก่สูญเสีย(คัด/ตายเช้า/ตายบ่าย) · อาหารไซโล 1-2 ·
   มิเตอร์น้ำ 1-6 · ไฟ/แสง · ยา-วัคซีน · หมายเหตุ  +  ตั้งค่ารุ่นการเลี้ยงต่อโรงเรือน
============================================================ */
const nf = (v) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isNaN(n) ? 0 : n; };
const shiftDayISO = (iso, delta) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(y, m - 1, d + delta); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };
const emptyRearing = () => ({ loss: { cull: "", deadAm: "", deadPm: "", deadWt: "" }, feed: { no: "", s1open: "", s1recv: "", s1used: "", s2open: "", s2recv: "", s2used: "" }, water: { m1: "", m2: "", m3: "", m4: "", m5: "", m6: "" }, light: { hours: "", lux: "" }, meds: "", medsList: [], note: "" });   // deadWt = นน.ไก่ตายชั่งรวม (กก.) · sNopen = อาหารยกมาจากวันก่อน · medsList = ยา/สารเสริมหลายรายการ [{name,period,qty,water,time}]
// สรุปยา/สารเสริมสั้น ๆ สำหรับตาราง เช่น "Enro 13 ขวด · Calcium 2 ขวด" (ข้อมูลเก่าใช้ข้อความ meds เดิม)
const medsSummary = (r) => {
  if (r?.medsList?.length) return r.medsList.filter((m) => m.name).map((m) => `${m.name}${m.qty ? " " + m.qty + " ขวด" : ""}`).join(" · ");
  return r?.meds || "";
};
const medsDetail = (r) => {
  if (r?.medsList?.length) return r.medsList.filter((m) => m.name).map((m) => [m.period, m.name, m.qty ? m.qty + " ขวด" : "", m.water ? "ผสมน้ำ " + m.water + " ล." : "", m.time ? "เวลา " + m.time : ""].filter(Boolean).join(" ")).join("  |  ");
  return r?.meds || "";
};
// อายุไก่ (สัปดาห์) ณ วันที่ระบุ = อายุรับเข้า + สัปดาห์ที่ผ่านไปนับจากวันเริ่มเลี้ยง
function flockAgeWk(flock, dateISO) {
  if (!flock || !flock.startDate || flock.startAgeWk == null || flock.startAgeWk === "") return null;
  const ms = new Date(dateISO) - new Date(flock.startDate);
  if (isNaN(ms) || ms < 0) return null;
  return Math.floor(nf(flock.startAgeWk) + ms / (7 * 24 * 3600 * 1000));
}
// ยอดสะสมของรุ่น (นับเฉพาะวันที่ >= วันเริ่มเลี้ยง ถ้าตั้งไว้) จนถึงวันที่ระบุ
function rearingCum(rearingByDate, houseId, uptoISO, flock) {
  let cull = 0, dead = 0;
  Object.keys(rearingByDate).sort().forEach((d) => {
    if (d > uptoISO) return;
    if (flock?.startDate && d < flock.startDate) return;
    const r = rearingByDate[d]?.[houseId];
    if (!r) return;
    cull += nf(r.loss?.cull); dead += nf(r.loss?.deadAm) + nf(r.loss?.deadPm);
  });
  return { cull, dead, total: cull + dead };
}
// อาหารคงเหลือต่อไซโล (rolling: ยกมา + Σรับ − Σใช้ ภายในรุ่น) จนถึงวันที่ระบุ
// วันไหนกรอก "ยกมา" (sNopen) ไว้ = ตั้งยอดต้นวันใหม่ตามที่กรอก (ใช้วันแรก/วันเช็คสต็อกจริง) — ทับยอดทดจากระบบ
function feedRemain(rearingByDate, houseId, uptoISO, flock) {
  let s1 = 0, s2 = 0;
  Object.keys(rearingByDate).sort().forEach((d) => {
    if (d > uptoISO) return;
    if (flock?.startDate && d < flock.startDate) return;
    const f = rearingByDate[d]?.[houseId]?.feed;
    if (!f) return;
    if (f.s1open !== "" && f.s1open != null) s1 = nf(f.s1open);
    if (f.s2open !== "" && f.s2open != null) s2 = nf(f.s2open);
    s1 += nf(f.s1recv) - nf(f.s1used); s2 += nf(f.s2recv) - nf(f.s2used);
  });
  return { s1, s2 };
}
// น้ำใช้วันนี้ = ผลต่างมิเตอร์จาก "วันก่อนหน้าที่มีจดมิเตอร์" (รวม 6 ตัว; ตัวไหนไม่ครบคู่ข้าม)
function waterUsage(rearingByDate, houseId, dateISO) {
  const days = Object.keys(rearingByDate).sort().filter((d) => d < dateISO);
  let prev = null;
  for (let i = days.length - 1; i >= 0; i--) {
    const w = rearingByDate[days[i]]?.[houseId]?.water;
    if (w && Object.values(w).some((v) => String(v).trim() !== "")) { prev = w; break; }
  }
  const cur = rearingByDate[dateISO]?.[houseId]?.water;
  if (!cur || !prev) return null;
  let sum = 0, used = false;
  ["m1", "m2", "m3", "m4", "m5", "m6"].forEach((k) => {
    if (String(cur[k] ?? "").trim() === "" || String(prev[k] ?? "").trim() === "") return;
    const diff = nf(cur[k]) - nf(prev[k]);
    if (diff > 0) { sum += diff; used = true; } else if (diff === 0) { used = true; }
  });
  return used ? sum : null;
}

// ยอดไก่จากหน้าผลผลิต (วันนั้น หรือวันล่าสุดก่อนหน้า) — ใช้เป็นตัวหาร "กินเฉลี่ย/ตัว" เมื่อยังไม่ตั้งรุ่นการเลี้ยง
function prodChickens(production, houseId, dateISO) {
  const dates = Object.keys(production || {}).sort().filter((x) => x <= dateISO);
  for (let i = dates.length - 1; i >= 0; i--) {
    const h = (production[dates[i]] || []).find((x) => x.id === houseId);
    if (h && h.chickens) return h.chickens;
  }
  return null;
}

/* ตั้งค่ารุ่นการเลี้ยงของโรงเรือน: รุ่นที่/ฝูงที่/จำนวนเริ่มเลี้ยง/วันที่เริ่ม/อายุรับเข้า */
function FlockModal({ houseId, flock, suggestStart, onSave, onClose }) {
  const [gen, setGen] = useState(flock?.gen || "");
  const [flockNo, setFlockNo] = useState(flock?.flock || "");
  const [startCount, setStartCount] = useState(flock?.startCount != null ? String(flock.startCount) : (suggestStart ? String(suggestStart) : ""));
  const [startDate, setStartDate] = useState(flock?.startDate || "");
  const [startAgeWk, setStartAgeWk] = useState(flock?.startAgeWk != null ? String(flock.startAgeWk) : "");
  const inp = { width: "100%", padding: "9px 10px", border: "1.5px solid #e3ddd0", borderRadius: 9, fontSize: 15, fontFamily: "inherit", outline: "none" };
  const lbl = { display: "block", fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 3 };
  // Enter = ไปช่องถัดไป (รุ่น → ฝูง → จำนวน → วันที่เริ่ม → อายุรับเข้า → ปุ่มบันทึก) แบบเดียวกับกรอกการเลี้ยงประจำวัน
  const refs = React.useRef([]); const saveRef = React.useRef(null);
  const onKey = (i) => (e) => { if (e.key !== "Enter") return; e.preventDefault(); const n = refs.current[i + 1]; if (n) n.focus(); else if (saveRef.current) saveRef.current.focus(); };
  const chain = (i) => ({ ref: (el) => { refs.current[i] = el; }, onKeyDown: onKey(i), onFocus: (e) => { try { e.target.select(); } catch (err) {} } });
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>รุ่นการเลี้ยง · โรงเรือน {houseId}</div><div style={S.modalSub}>ใช้คำนวณ อายุ(สัปดาห์) · %ตายสะสม · ไก่คงเหลือ · กด Enter ไปช่องถัดไป</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}><label style={lbl}>รุ่นที่</label><input style={inp} {...chain(0)} autoFocus value={gen} onChange={(e) => setGen(e.target.value)} placeholder="เช่น 12" /></div>
          <div style={{ flex: 1 }}><label style={lbl}>ฝูงที่</label><input style={inp} {...chain(1)} value={flockNo} onChange={(e) => setFlockNo(e.target.value)} placeholder="เช่น 3" /></div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>จำนวนเริ่มเลี้ยง (ตัว)</label><input style={inp} {...chain(2)} inputMode="numeric" value={startCount} onChange={(e) => setStartCount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="เช่น 66000" /></div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1.4 }}><label style={lbl}>วันที่เริ่มเลี้ยง</label><ThaiDateField value={startDate} onChange={setStartDate} style={{ ...inp }} inputRef={(el) => { refs.current[3] = el; }} onKeyDown={onKey(3)} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>อายุรับเข้า (สัปดาห์)</label><input style={inp} {...chain(4)} inputMode="numeric" value={startAgeWk} onChange={(e) => setStartAgeWk(e.target.value.replace(/[^0-9]/g, ""))} placeholder="เช่น 17" /></div>
        </div>
        <button style={S.primaryBtn} ref={saveRef} onClick={() => onSave(houseId, { gen: gen.trim(), flock: flockNo.trim(), startCount: startCount ? parseInt(startCount) : null, startDate: startDate || null, startAgeWk: startAgeWk ? parseInt(startAgeWk) : null })}>บันทึกรุ่นการเลี้ยง</button>
      </div>
    </div>
  );
}

/* 💉 สมุดวัคซีนประจำหลัง — ตารางตามฟอร์มกระดาษ (บันทึกการทำวัคซีนไก่เล็ก-ไก่รุ่น) + เพิ่มรายการที่ทำต่อที่ฟาร์มเรา */
function VaccineModal({ houseId, rows = [], info, onAdd, onDelete, onClose }) {
  const empty = { date: isoFromTs(Date.now()), age: "", birds: "", name: "", against: "", kind: "เชื้อเป็น", method: "", bottles: "", dose: "", doseSize: "", lot: "", expiry: "", by: "" };
  const [f, setF] = useState(empty);
  const up = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const refs = React.useRef([]); const saveRef = React.useRef(null);
  const onKey = (i) => (e) => { if (e.key !== "Enter") return; e.preventDefault(); const n = refs.current[i + 1]; if (n) n.focus(); else if (saveRef.current) saveRef.current.focus(); };
  const chain = (i) => ({ ref: (el) => { refs.current[i] = el; }, onKeyDown: onKey(i) });
  const sorted = rows.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "") || String(a.id).localeCompare(String(b.id)));
  const inp = { width: "100%", padding: "7px 8px", border: "1.5px solid #e3ddd0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "#fff" };
  const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: "#7a6f5c", marginBottom: 2 };
  const th = { padding: "7px 8px", fontSize: 11.5, fontWeight: 800, color: "#7a6f5c", background: "#F6F1E7", borderBottom: "2px solid #e6ddca", textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "6px 8px", fontSize: 12, borderBottom: "1px solid #f3eee2", verticalAlign: "top" };
  const valid = f.date && f.name.trim();
  const submit = () => {
    if (!valid) return;
    onAdd(houseId, { ...f, name: f.name.trim(), birds: f.birds ? parseInt(f.birds) : "", checker: "" });
    setF({ ...empty, date: f.date, age: f.age, birds: f.birds, by: f.by });   // วันเดียวทำหลายตัว — คงวันที่/อายุ/จำนวน/ผู้ทำไว้
  };
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 920, maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div>
            <div style={S.modalTitle}>💉 สมุดวัคซีน · โรงเรือน {houseId}</div>
            <div style={S.modalSub}>{info || "บันทึกการทำวัคซีนของรุ่นนี้ — เพิ่มรายการที่ทำต่อที่ฟาร์มได้ด้านล่าง"}</div>
            {(() => { const src = rows.filter((r) => r.src !== "ฟาร์มเรา").length, own = rows.length - src; return (src > 0 || own > 0) ? <div style={{ fontSize: 11.5, color: "#8a8170", marginTop: 3 }}>📋 ทำที่ฟาร์มต้นทาง (NCP) {src} รายการ{own > 0 ? ` · ✅ ทำที่ฟาร์มเรา ${own} รายการ` : ""}</div> : null; })()}
          </div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        {sorted.length === 0 ? (
          <div style={{ padding: "26px 16px", textAlign: "center", color: "#9b8e78", fontWeight: 600, marginBottom: 12 }}>ยังไม่มีบันทึกวัคซีนของหลังนี้ — เพิ่มรายการแรกด้านล่าง</div>
        ) : (
          <div style={{ overflowX: "auto", marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 840 }}>
              <thead><tr>
                <th style={th}>วันที่</th><th style={th}>อายุ</th><th style={{ ...th, textAlign: "right" }}>จำนวนไก่</th><th style={th}>วัคซีน</th><th style={th}>ป้องกันโรค</th><th style={th}>ชนิด</th><th style={th}>วิธีใช้</th><th style={th}>ขวด · โด๊ส</th><th style={th}>Lot · หมดอายุ</th><th style={th}>ผู้ทำ</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {sorted.map((r, i) => {
                  const newDate = i === 0 || sorted[i - 1].date !== r.date;
                  return (
                    <tr key={r.id} style={newDate && i > 0 ? { borderTop: "2px solid #e6ddca" } : {}}>
                      <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700 }}>{newDate ? <>{toThaiDate(r.date, false)}<div style={{ marginTop: 3 }}><span style={{ fontSize: 9.5, fontWeight: 800, padding: "1px 6px", borderRadius: 9, background: r.src === "ฟาร์มเรา" ? "#DCFCE7" : "#EEF2FF", color: r.src === "ฟาร์มเรา" ? "#15803D" : "#4338CA" }}>{r.src === "ฟาร์มเรา" ? "ฟาร์มเรา" : "ต้นทาง NCP"}</span></div></> : ""}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{newDate ? (r.age || "") : ""}</td>
                      <td style={{ ...td, textAlign: "right" }}>{newDate && r.birds ? fmt(r.birds) : ""}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{r.name}</td>
                      <td style={td}>{r.against}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: r.kind === "เชื้อเป็น" ? "#15803D" : r.kind === "เชื้อตาย" ? "#B45309" : "#6b6358", fontWeight: 600 }}>{r.kind}</td>
                      <td style={td}>{r.method}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{[r.bottles, r.dose].filter(Boolean).join(" × ") || "-"}{r.doseSize ? <div style={{ color: "#9b9384", fontSize: 11 }}>{r.doseSize}</div> : null}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{r.lot || "-"}{r.expiry ? <div style={{ color: "#9b9384", fontSize: 11 }}>หมดอายุ {r.expiry}</div> : null}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{r.by}</td>
                      <td style={td}><button title="ลบรายการ (กรอกผิด)" onClick={() => { if (window.confirm(`ลบรายการวัคซีน "${r.name}" วันที่ ${toThaiDate(r.date, false)}?`)) onDelete(houseId, r.id); }}
                        style={{ border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 7, padding: "1px 7px", cursor: "pointer", fontWeight: 800, fontSize: 11 }}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ background: "#FBF8F2", border: "1px solid #efe7d8", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontWeight: 800, color: ACCENT_DK, fontSize: 13, marginBottom: 8 }}>＋ บันทึกวัคซีนใหม่ <span style={{ color: "#9b8e78", fontWeight: 600 }}>· กด Enter ไปช่องถัดไป · บันทึกแล้วคงวันที่/อายุไว้ให้ทำตัวถัดไปวันเดียวกัน</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
            <div><label style={lbl}>วันที่</label><ThaiDateField value={f.date} onChange={(v) => setF((p) => ({ ...p, date: v }))} style={{ ...inp }} long={false} inputRef={(el) => { refs.current[0] = el; }} onKeyDown={onKey(0)} /></div>
            <div><label style={lbl}>อายุไก่ (เช่น 18 wks)</label><input style={inp} {...chain(1)} value={f.age} onChange={up("age")} /></div>
            <div><label style={lbl}>จำนวนไก่ (ตัว)</label><input style={inp} {...chain(2)} inputMode="numeric" value={f.birds} onChange={(e) => setF((p) => ({ ...p, birds: e.target.value.replace(/[^0-9]/g, "") }))} /></div>
            <div><label style={lbl}>ชื่อวัคซีน / การค้า</label><input style={inp} {...chain(3)} value={f.name} onChange={up("name")} placeholder="เช่น OLVAC เข็ม4" /></div>
            <div><label style={lbl}>ป้องกันโรค</label><input style={inp} {...chain(4)} value={f.against} onChange={up("against")} /></div>
            <div><label style={lbl}>ชนิดวัคซีน</label><select style={inp} {...chain(5)} value={f.kind} onChange={up("kind")}><option>เชื้อเป็น</option><option>เชื้อตาย</option><option>แบบผง</option></select></div>
            <div><label style={lbl}>วิธีการใช้</label><input style={inp} {...chain(6)} value={f.method} onChange={up("method")} placeholder="เช่น หยอดตาซ้าย" /></div>
            <div><label style={lbl}>วัคซีนที่ใช้ (ขวด)</label><input style={inp} {...chain(7)} value={f.bottles} onChange={up("bottles")} /></div>
            <div><label style={lbl}>โด๊สที่ใช้</label><input style={inp} {...chain(8)} value={f.dose} onChange={up("dose")} placeholder="เช่น 0.5 ml" /></div>
            <div><label style={lbl}>ขนาดโด๊ส</label><input style={inp} {...chain(9)} value={f.doseSize} onChange={up("doseSize")} placeholder="เช่น 1000 โด๊ส" /></div>
            <div><label style={lbl}>Lot No.</label><input style={inp} {...chain(10)} value={f.lot} onChange={up("lot")} /></div>
            <div><label style={lbl}>วันหมดอายุ</label><input style={inp} {...chain(11)} value={f.expiry} onChange={up("expiry")} placeholder="เช่น 09-2027" /></div>
            <div><label style={lbl}>สัตวบาลผู้ทำ</label><input style={inp} {...chain(12)} value={f.by} onChange={up("by")} /></div>
          </div>
          <button ref={saveRef} disabled={!valid} onClick={submit} style={{ ...S.primaryBtn, width: "auto", padding: "9px 20px", opacity: valid ? 1 : 0.5 }}>บันทึกวัคซีน</button>
        </div>
      </div>
    </div>
  );
}

// ย่อรูป (จากกล้อง/ไฟล์) เป็น data URL ก่อนเก็บลง localStorage — ด้านยาวสุด maxDim, JPEG quality (กันสตอเรจเต็ม)
function fileToScaledDataURL(file, maxDim = 1400, quality = 0.68) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        try { resolve(c.toDataURL("image/jpeg", quality)); } catch (e) { reject(e); }
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

/* 🧪 สมุดผลตรวจแล็บประจำหลัง — เจาะเลือด (serology/titer) · เก็บซาก (ผ่าซาก necropsy) · อื่นๆ ส่งตรวจ */
const LAB_TYPES = {
  เลือด: { label: "🩸 เจาะเลือด (serology)", bg: "#FEE2E2", c: "#B91C1C" },
  ซาก: { label: "🔬 เก็บซาก (ผ่าซาก)", bg: "#F3E8FF", c: "#7C3AED" },
  อื่นๆ: { label: "🧫 อื่นๆ", bg: "#E0E7FF", c: "#4338CA" },
};
function LabTestModal({ houseId, rows = [], onAdd, onDelete, onClose }) {
  const empty = { date: isoFromTs(Date.now()), type: "เลือด", age: "", samples: "", lab: "", result: "", recommend: "", by: "", images: [] };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);         // กำลังย่อรูป
  const [zoom, setZoom] = useState(null);          // รูปที่กำลังซูมดูเต็มจอ (data URL)
  const up = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const addImages = async (fileList) => {
    const files = [...(fileList || [])].filter((x) => x.type.startsWith("image/"));
    if (!files.length) return;
    setBusy(true);
    try { const urls = await Promise.all(files.map((x) => fileToScaledDataURL(x))); setF((p) => ({ ...p, images: [...(p.images || []), ...urls] })); }
    catch (e) { alert("อ่านรูปไม่สำเร็จ ลองรูปอื่น"); }
    finally { setBusy(false); }
  };
  const rmImage = (i) => setF((p) => ({ ...p, images: (p.images || []).filter((_, j) => j !== i) }));
  const sorted = rows.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || String(b.id).localeCompare(String(a.id)));   // ใหม่→เก่า
  const inp = { width: "100%", padding: "8px 9px", border: "1.5px solid #e3ddd0", borderRadius: 8, fontSize: 13.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "#fff" };
  const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: "#7a6f5c", marginBottom: 2 };
  const valid = f.date && (f.result.trim() || (f.images || []).length);
  const submit = () => { if (!valid) return; onAdd(houseId, { ...f, result: f.result.trim(), recommend: f.recommend.trim(), lab: f.lab.trim(), by: f.by.trim(), samples: f.samples ? parseInt(f.samples) : "", images: f.images || [] }); setF({ ...empty, date: f.date, type: f.type, age: f.age, lab: f.lab, by: f.by }); };
  const nBlood = rows.filter((r) => r.type === "เลือด").length, nCarcass = rows.filter((r) => r.type === "ซาก").length;
  const thumb = { width: 62, height: 62, objectFit: "cover", borderRadius: 8, border: "1px solid #e3ddd0", cursor: "pointer", display: "block" };
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 640, maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div>
            <div style={S.modalTitle}>🧪 สมุดผลตรวจ · โรงเรือน {houseId}</div>
            <div style={S.modalSub}>ผลเจาะเลือด (serology) · ผลผ่าซาก (necropsy) · เก็บเป็นประวัติสุขภาพประจำหลัง{rows.length > 0 ? ` · 🩸 เลือด ${nBlood} · 🔬 ซาก ${nCarcass}` : ""}</div>
          </div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        {sorted.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "#9b8e78", fontWeight: 600, marginBottom: 12 }}>ยังไม่มีผลตรวจของหลังนี้ — บันทึกผลแรกด้านล่าง</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 14 }}>
            {sorted.map((r) => {
              const t = LAB_TYPES[r.type] || LAB_TYPES["อื่นๆ"];
              return (
                <div key={r.id} style={{ border: "1px solid #eee3cd", borderLeft: `4px solid ${t.c}`, borderRadius: 10, padding: "10px 12px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 9, background: t.bg, color: t.c }}>{t.label}</span>
                    <span style={{ fontWeight: 800, color: INK, fontSize: 13.5 }}>{toThaiDate(r.date, false)}</span>
                    {r.age ? <span style={{ fontSize: 12, color: "#7a6f5c" }}>· อายุ {r.age}</span> : null}
                    {r.samples ? <span style={{ fontSize: 12, color: "#7a6f5c" }}>· {fmt(r.samples)} ตัวอย่าง</span> : null}
                    {r.lab ? <span style={{ fontSize: 12, color: "#7a6f5c" }}>· {r.lab}</span> : null}
                    <button title="ลบผลตรวจนี้" onClick={() => { if (window.confirm(`ลบผลตรวจ ${toThaiDate(r.date, false)}?`)) onDelete(houseId, r.id); }}
                      style={{ marginLeft: "auto", border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 7, padding: "1px 7px", cursor: "pointer", fontWeight: 800, fontSize: 11 }}>✕</button>
                  </div>
                  {r.result ? <div style={{ fontSize: 13, color: "#3a352c", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{r.result}</div> : null}
                  {(r.images || []).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {(r.images || []).map((src, i) => <img key={i} src={src} alt={`ผลตรวจ ${i + 1}`} style={thumb} onClick={() => setZoom(src)} />)}
                    </div>
                  )}
                  {r.recommend ? <div style={{ marginTop: 6, fontSize: 12.5, color: "#7A4F16", background: "#FFF7EC", border: "1px solid #F5DEB9", borderRadius: 8, padding: "6px 9px", whiteSpace: "pre-wrap" }}>💡 คำแนะนำ/ทำต่อ: {r.recommend}</div> : null}
                  {r.by ? <div style={{ marginTop: 5, fontSize: 11.5, color: "#9b8e78" }}>ผู้บันทึก: {r.by}</div> : null}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ background: "#FBF8F2", border: "1px solid #efe7d8", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontWeight: 800, color: ACCENT_DK, fontSize: 13, marginBottom: 8 }}>＋ บันทึกผลตรวจใหม่</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div><label style={lbl}>วันที่ส่งตรวจ / รับผล</label><ThaiDateField value={f.date} onChange={(v) => setF((p) => ({ ...p, date: v }))} style={{ ...inp }} long={false} /></div>
            <div><label style={lbl}>ประเภทการตรวจ</label><select style={inp} value={f.type} onChange={up("type")}><option value="เลือด">🩸 เจาะเลือด (serology)</option><option value="ซาก">🔬 เก็บซาก (ผ่าซาก)</option><option value="อื่นๆ">🧫 อื่นๆ</option></select></div>
            <div><label style={lbl}>อายุไก่ (เช่น 18 wks)</label><input style={inp} value={f.age} onChange={up("age")} /></div>
            <div><label style={lbl}>จำนวนตัวอย่าง</label><input style={inp} inputMode="numeric" value={f.samples} onChange={(e) => setF((p) => ({ ...p, samples: e.target.value.replace(/[^0-9]/g, "") }))} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>แล็บ / หน่วยตรวจ</label><input style={inp} value={f.lab} onChange={up("lab")} placeholder="เช่น แล็บบริษัท / ปศุสัตว์จังหวัด / มหาวิทยาลัย" /></div>
          </div>
          <div style={{ marginBottom: 8 }}><label style={lbl}>ผลตรวจ <span style={{ color: "#9b8e78", fontWeight: 600 }}>(พิมพ์ผล หรือแนบรูปใบผลตรวจก็ได้)</span></label>
            <textarea style={{ ...inp, minHeight: 72, resize: "vertical", textAlign: "left" }} value={f.result} onChange={up("result")}
              placeholder={f.type === "เลือด" ? "เช่น ND HI titer เฉลี่ย 6.5 (สม่ำเสมอ) · IB titer ต่ำ · AI H5 titer 5 …" : f.type === "ซาก" ? "เช่น ผ่าซาก 3 ตัว — พบหลอดลมอักเสบเล็กน้อย · ลำไส้ปกติ · ไม่พบรอยโรค ND …" : "บันทึกผลตรวจ"} /></div>
          <div style={{ marginBottom: 8 }}>
            <label style={lbl}>📎 รูปใบผลตรวจ (ถ่ายรูป / เลือกไฟล์ได้หลายรูป)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {(f.images || []).map((src, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={src} alt={`แนบ ${i + 1}`} style={thumb} onClick={() => setZoom(src)} />
                  <button onClick={() => rmImage(i)} title="ลบรูป" style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", cursor: "pointer", fontWeight: 800, fontSize: 12, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ))}
              <label style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 62, height: 62, border: "1.5px dashed #d8cdb6", borderRadius: 8, color: "#9b8e78", cursor: busy ? "wait" : "pointer", fontSize: 11, fontWeight: 700, background: "#fff", textAlign: "center" }}>
                {busy ? "…" : <><Plus size={16} /><span style={{ fontSize: 9.5, marginTop: 2 }}>เพิ่มรูป</span></>}
                <input type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }} onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}><label style={lbl}>คำแนะนำ / สิ่งที่ต้องทำต่อ</label>
            <textarea style={{ ...inp, minHeight: 46, resize: "vertical", textAlign: "left" }} value={f.recommend} onChange={up("recommend")} placeholder="เช่น กระตุ้น ND live ละลายน้ำ · เฝ้าระวังหลอดลม" /></div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}><label style={lbl}>ผู้บันทึก / สัตวบาล</label><input style={inp} value={f.by} onChange={up("by")} /></div>
            <button disabled={!valid} onClick={submit} style={{ ...S.primaryBtn, width: "auto", padding: "9px 20px", opacity: valid ? 1 : 0.5 }}>บันทึกผลตรวจ</button>
          </div>
        </div>
      </div>
      {zoom && (
        <div onClick={() => setZoom(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
          <img src={zoom} alt="ผลตรวจ" style={{ maxWidth: "96%", maxHeight: "92%", objectFit: "contain", borderRadius: 8 }} />
          <button onClick={(e) => { e.stopPropagation(); setZoom(null); }} style={{ position: "absolute", top: 16, right: 16, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.9)", color: "#111", cursor: "pointer", fontWeight: 800, fontSize: 18 }}><X size={20} /></button>
        </div>
      )}
    </div>
  );
}

/* กรอกข้อมูลการเลี้ยงประจำวัน ต่อโรงเรือน (ครบทุกช่องตามฟอร์มกระดาษ)
   birds = ไก่คงเหลือต้นวัน (จากรุ่นการเลี้ยง หรือยอดไก่หน้าผลผลิต) — ใช้คิดกินเฉลี่ย/ตัวแบบสด */
function RearingEditModal({ houseId, dateISO, data, siloRemain, birds, feedMin = 4000, medStock = [], medInfo = {}, seqLabel = null, onSkip = null, onSave, onClose }) {
  const d0 = { ...emptyRearing(), ...(data || {}) };
  const [loss, setLoss] = useState({ ...emptyRearing().loss, ...(d0.loss || {}) });
  const [feed, setFeed] = useState({ ...emptyRearing().feed, ...(d0.feed || {}) });
  const [water, setWater] = useState({ ...emptyRearing().water, ...(d0.water || {}) });
  const [light, setLight] = useState({ ...emptyRearing().light, ...(d0.light || {}) });
  // ยา/สารเสริม หลายรายการต่อวัน — ข้อมูลเก่า (ข้อความ meds) แปลงเป็นรายการแรกให้อัตโนมัติ
  const [medsList, setMedsList] = useState(() => {
    const l = Array.isArray(d0.medsList) ? d0.medsList.map((x) => ({ period: "เช้า", ...x })) : [];
    if (!l.length && d0.meds) l.push({ name: d0.meds, period: "เช้า", qty: "", water: "", time: "" });
    return l;
  });
  const upMed = (i, k, v) => setMedsList((p) => p.map((m, j) => j === i ? { ...m, [k]: v } : m));
  const rmMed = (i) => setMedsList((p) => p.filter((_, j) => j !== i));
  const [note, setNote] = useState(d0.note || "");
  const refs = React.useRef([]); const saveRef = React.useRef(null);
  const onKey = (i) => (e) => { if (e.key !== "Enter") return; e.preventDefault(); const n = refs.current[i + 1]; if (n) n.focus(); else if (saveRef.current) saveRef.current.focus(); };
  const cell = { width: "100%", padding: "8px 9px", border: "1.5px solid #e3ddd0", borderRadius: 9, fontSize: 14.5, fontFamily: "inherit", textAlign: "right", outline: "none" };
  const numProps = (i, cls) => ({ ref: (el) => { refs.current[i] = el; }, onKeyDown: onKey(i), onFocus: (e) => e.target.select(), className: `prodInput ${cls}`, type: "text", inputMode: "decimal", placeholder: "0", style: cell });
  const dec = (v) => v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");   // ตัวเลข + จุดทศนิยม 1 จุด
  const int_ = (v) => v.replace(/[^0-9]/g, "");
  const fw = (key, label, node, color) => <div key={key}><label style={{ display: "block", fontSize: 11.5, fontWeight: 700, color, marginBottom: 3, textAlign: "left" }}>{label}</label>{node}</div>;
  const section = (bg, border, accent) => ({ background: bg, border: `1px solid ${border}`, borderLeft: `4px solid ${accent}`, borderRadius: 12, padding: "12px 12px 8px", marginBottom: 12 });
  const deadTotal = nf(loss.deadAm) + nf(loss.deadPm);
  const feedUsed = nf(feed.s1used) + nf(feed.s2used);
  // ไก่คงเหลือสด = ต้นวัน − คัด/ตายที่กำลังพิมพ์ → กินเฉลี่ย(กรัม/ตัว) = กินรวม(กก.)×1000 ÷ ไก่คงเหลือ
  const birdsLive = birds != null ? Math.max(0, birds - nf(loss.cull) - deadTotal) : null;
  const gPerBirdLive = birdsLive && feedUsed > 0 ? (feedUsed * 1000) / birdsLive : null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div>
            <div style={S.modalTitle}>การเลี้ยงประจำวัน · {houseId}{seqLabel ? <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 800, color: "#fff", background: "#16A34A", borderRadius: 999, padding: "3px 11px", verticalAlign: "middle" }}>{seqLabel}</span> : null}</div>
            <div style={S.modalSub}>{toThaiDate(dateISO)} · ใส่ตัวเลข แล้วกด Enter ไปช่องถัดไป{seqLabel ? " · บันทึกแล้วเด้งหลังถัดไปให้เอง" : ""}</div>
          </div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>

        {/* ลำดับหัวข้อ ตามฟอร์มกระดาษ: ไฟ/แสง → สูญเสีย → อาหาร → น้ำ → ยา */}
        <div style={section("#FDF4FF", "#F0C8F5", "#A21CAF")}>
          <div style={{ fontWeight: 800, color: "#86198F", fontSize: 13, marginBottom: 8 }}>💡 ไฟ / แสง</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
            {fw("lh", "ไฟ (ชั่วโมง)", <input {...numProps(0, "pfLight")} value={light.hours} onChange={(e) => setLight((p) => ({ ...p, hours: dec(e.target.value) }))} autoFocus />, "#86198F")}
            {fw("lx", "แสง (ค่า Lux)", <input {...numProps(1, "pfLight")} value={light.lux} onChange={(e) => setLight((p) => ({ ...p, lux: dec(e.target.value) }))} />, "#86198F")}
          </div>
        </div>

        <div style={section("#FEF2F2", "#FECACA", "#DC2626")}>
          <div style={{ fontWeight: 800, color: "#B91C1C", fontSize: 13, marginBottom: 8 }}>🐔 แม่ไก่สูญเสีย (ตัว)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
            {fw("cull", "ไก่คัด", <input {...numProps(2, "pfLoss")} value={loss.cull} onChange={(e) => setLoss((p) => ({ ...p, cull: int_(e.target.value) }))} />, "#B91C1C")}
            {fw("dam", "ตาย (เช้า)", <input {...numProps(3, "pfLoss")} value={loss.deadAm} onChange={(e) => setLoss((p) => ({ ...p, deadAm: int_(e.target.value) }))} />, "#B91C1C")}
            {fw("dpm", "ตาย (บ่าย)", <input {...numProps(4, "pfLoss")} value={loss.deadPm} onChange={(e) => setLoss((p) => ({ ...p, deadPm: int_(e.target.value) }))} />, "#B91C1C")}
            {fw("dwt", "นน.ไก่ตายชั่งรวม (กก.)", <input {...numProps(5, "pfLoss")} value={loss.deadWt} onChange={(e) => setLoss((p) => ({ ...p, deadWt: dec(e.target.value) }))} />, "#B91C1C")}
          </div>
          <div style={{ fontSize: 12, color: "#B91C1C", fontWeight: 700, margin: "6px 2px 4px", textAlign: "right" }}>
            ตายรวมวันนี้ {fmt(deadTotal)} ตัว{nf(loss.deadWt) > 0 && deadTotal > 0 ? ` · ชั่งรวม ${fmt2(nf(loss.deadWt))} กก. · เฉลี่ย ${fmt2(nf(loss.deadWt) / deadTotal)} กก./ตัว` : ""}
          </div>
        </div>

        <div style={section("#FEF6EC", "#FBD9A8", "#D97706")}>
          <div style={{ fontWeight: 800, color: "#B45309", fontSize: 13, marginBottom: 8 }}>🌾 อาหาร (กก.)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginBottom: 8 }}>
            {fw("fno", "เบอร์อาหาร", <input ref={(el) => { refs.current[6] = el; }} onKeyDown={onKey(6)} onFocus={(e) => e.target.select()} className="prodInput pfFeed" type="text" placeholder="เช่น 324" style={{ ...cell, textAlign: "left" }} value={feed.no} onChange={(e) => setFeed((p) => ({ ...p, no: e.target.value }))} />, "#B45309")}
            <div /><div />
            {fw("s1o", "ไซโล 1 · ยกมาจากวันก่อน", <input {...numProps(7, "pfFeed")} placeholder={fmt1(siloRemain.s1)} title="เว้นว่าง = ใช้ยอดทดต่อจากระบบ (คงเหลือเมื่อวาน) · กรอก = ตั้งยอดตามที่เช็คจริง" value={feed.s1open} onChange={(e) => setFeed((p) => ({ ...p, s1open: dec(e.target.value) }))} />, "#B45309")}
            {fw("s1r", "ไซโล 1 · รับเข้า", <input {...numProps(8, "pfFeed")} value={feed.s1recv} onChange={(e) => setFeed((p) => ({ ...p, s1recv: dec(e.target.value) }))} />, "#B45309")}
            {fw("s1u", "ไซโล 1 · ใช้ไป", <input {...numProps(9, "pfFeed")} value={feed.s1used} onChange={(e) => setFeed((p) => ({ ...p, s1used: dec(e.target.value) }))} />, "#B45309")}
            {fw("s2o", "ไซโล 2 · ยกมาจากวันก่อน", <input {...numProps(10, "pfFeed")} placeholder={fmt1(siloRemain.s2)} title="เว้นว่าง = ใช้ยอดทดต่อจากระบบ (คงเหลือเมื่อวาน) · กรอก = ตั้งยอดตามที่เช็คจริง" value={feed.s2open} onChange={(e) => setFeed((p) => ({ ...p, s2open: dec(e.target.value) }))} />, "#B45309")}
            {fw("s2r", "ไซโล 2 · รับเข้า", <input {...numProps(11, "pfFeed")} value={feed.s2recv} onChange={(e) => setFeed((p) => ({ ...p, s2recv: dec(e.target.value) }))} />, "#B45309")}
            {fw("s2u", "ไซโล 2 · ใช้ไป", <input {...numProps(12, "pfFeed")} value={feed.s2used} onChange={(e) => setFeed((p) => ({ ...p, s2used: dec(e.target.value) }))} />, "#B45309")}
          </div>
          <div style={{ fontSize: 11.5, color: "#B45309", margin: "0 2px 6px" }}>ยกมา: เว้นว่าง = ระบบทดยอดคงเหลือของเมื่อวานให้อัตโนมัติ (เลขจาง ๆ ในช่อง) · กรอกเมื่อเช็คของจริงหน้าไซโล/วันแรกที่เริ่มใช้</div>
          <div style={{ fontSize: 12, color: "#92400E", margin: "0 2px 4px", display: "flex", justifyContent: "space-between" }}>
            <span>
              {(() => { const o1 = feed.s1open !== "" ? nf(feed.s1open) : siloRemain.s1, o2 = feed.s2open !== "" ? nf(feed.s2open) : siloRemain.s2, r1 = o1 + nf(feed.s1recv) - nf(feed.s1used), r2 = o2 + nf(feed.s2recv) - nf(feed.s2used); return (<>
                คงเหลือ <span style={r1 < feedMin ? { color: "#B91C1C", fontWeight: 800 } : {}}>ไซโล1 {fmt1(r1)}{r1 < feedMin ? " ⚠️" : ""}</span> · <span style={r2 < feedMin ? { color: "#B91C1C", fontWeight: 800 } : {}}>ไซโล2 {fmt1(r2)}{r2 < feedMin ? " ⚠️" : ""}</span> กก.
              </>); })()}
            </span>
            <span style={{ fontWeight: 700 }}>กินรวมวันนี้ {fmt1(feedUsed)} กก.{gPerBirdLive != null ? ` · เฉลี่ย ${fmt1(gPerBirdLive)} กรัม/ตัว (ไก่ ${fmt(birdsLive)} ตัว)` : ""}</span>
          </div>
        </div>

        <div style={section("#EFF8FF", "#BAE0FD", "#0284C7")}>
          <div style={{ fontWeight: 800, color: "#0369A1", fontSize: 13, marginBottom: 8 }}>💧 มิเตอร์น้ำ (จดเลขมิเตอร์ 6 ตัว) · ระบบคิดผลต่างจากวันก่อนให้เอง</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
            {["m1", "m2", "m3", "m4", "m5", "m6"].map((k, i) => fw(k, `มิเตอร์ ${i + 1}`, <input {...numProps(13 + i, "pfWater")} value={water[k]} onChange={(e) => setWater((p) => ({ ...p, [k]: dec(e.target.value) }))} />, "#0369A1"))}
          </div>
        </div>

        <div style={section("#F0FDFA", "#99F6E4", "#0D9488")}>
          <div style={{ fontWeight: 800, color: "#0F766E", fontSize: 13, marginBottom: 8 }}>💊 ยา / สารเสริม / วัคซีน · บันทึกได้หลายรายการต่อวัน · เลือกจากสต๊อก = ตัดสต๊อก+คิดต้นทุนอัตโนมัติ</div>
          <datalist id="medstock-dl">{medStock.map((it) => <option key={it.id} value={it.name}>{it.desc ? `${it.desc}` : ""}</option>)}</datalist>
          {medsList.map((m, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid #99F6E4", borderRadius: 10, padding: "8px 8px 4px", marginBottom: 7 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.9fr 0.9fr auto", gap: 6, marginBottom: 6 }}>
                <div><label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#0F766E", marginBottom: 2 }}>ชื่อยา/สารเสริม (เลือกจากสต๊อก)</label>
                  <input className="prodInput pfInsp" type="text" list="medstock-dl" placeholder="พิมพ์เพื่อค้นจากสต๊อกยา…" value={m.name} onChange={(e) => upMed(i, "name", e.target.value)} style={{ ...cell, textAlign: "left", padding: "6px 8px", fontSize: 13 }} />
                  {(() => {
                    const nm = (m.name || "").trim(); if (!nm) return null;
                    const info = medInfo[nm];
                    if (!info) return <div style={{ fontSize: 10.5, color: "#B45309", marginTop: 2 }}>⚠ ไม่พบในสต๊อกยา — บันทึกได้ แต่จะไม่ตัดสต๊อก/ไม่คิดต้นทุน</div>;
                    const q = parseFloat(m.qty) || 0;
                    return <div style={{ fontSize: 10.5, color: "#0F766E", marginTop: 2 }}>✓ สต๊อกคงเหลือ {fmt1(info.remain)} {info.unit}{info.price ? ` · ${fmt(info.price)} บ./${info.unit}` : " · ไม่มีราคา"}{q > 0 && info.price ? ` · ครั้งนี้ ≈ ${fmt(Math.round(q * info.price))} บ.` : ""}</div>;
                  })()}
                </div>
                <div><label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#0F766E", marginBottom: 2 }}>ช่วง</label>
                  <select value={m.period || "เช้า"} onChange={(e) => upMed(i, "period", e.target.value)} style={{ ...cell, textAlign: "left", padding: "6px 6px", fontSize: 13 }}>
                    <option>เช้า</option><option>บ่าย</option><option>เย็น</option><option>ทั้งวัน</option>
                  </select></div>
                <button onClick={() => rmMed(i)} title="ลบรายการนี้" style={{ alignSelf: "end", border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontWeight: 800 }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 6, marginBottom: 4 }}>
                <div><label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#0F766E", marginBottom: 2 }}>จำนวน ({medInfo[(m.name || "").trim()]?.unit || "ขวด"})</label>
                  <input className="prodInput pfInsp" type="text" inputMode="decimal" placeholder="0" value={m.qty} onChange={(e) => upMed(i, "qty", e.target.value.replace(/[^0-9.]/g, ""))} style={{ ...cell, padding: "6px 8px", fontSize: 13 }} /></div>
                <div><label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#0F766E", marginBottom: 2 }}>ผสมน้ำ (ลิตร)</label>
                  <input className="prodInput pfInsp" type="text" inputMode="decimal" placeholder="0" value={m.water} onChange={(e) => upMed(i, "water", e.target.value.replace(/[^0-9.]/g, ""))} style={{ ...cell, padding: "6px 8px", fontSize: 13 }} /></div>
                <div><label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#0F766E", marginBottom: 2 }}>เวลาให้ (จาก - ถึง)</label>
                  <input className="prodInput pfInsp" type="text" placeholder="เช่น 06.00 - 10.40" value={m.time} onChange={(e) => upMed(i, "time", e.target.value)} style={{ ...cell, textAlign: "left", padding: "6px 8px", fontSize: 13 }} /></div>
              </div>
            </div>
          ))}
          <button onClick={() => setMedsList((p) => [...p, { name: "", period: "เช้า", qty: "", water: "", time: "" }])}
            style={{ border: "1.5px dashed #0D9488", background: "#fff", color: "#0F766E", borderRadius: 9, padding: "7px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", marginBottom: 8 }}>＋ เพิ่มยา/สารเสริม</button>
          {medsList.filter((m) => m.name).length > 0 && (
            <div style={{ fontSize: 12, color: "#0F766E", fontWeight: 700, marginBottom: 8 }}>💊 รวมวันนี้: {medsList.filter((m) => m.name).map((m) => `${m.name}${m.qty ? " " + m.qty + " ขวด" : ""}`).join(" · ")}</div>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="หมายเหตุอื่น ๆ"
            style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #99F6E4", borderRadius: 9, fontSize: 13.5, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {onSkip ? <button onClick={onSkip} style={{ flex: "0 0 auto", border: "1.5px solid #d8cdb6", background: "#fff", color: "#7a6f5c", borderRadius: 12, padding: "13px 16px", cursor: "pointer", fontSize: 14, fontWeight: 800, fontFamily: "inherit" }}>ข้ามหลังนี้ ▸</button> : null}
          <button ref={saveRef} style={{ ...S.primaryBtn, flex: 1 }} onClick={() => onSave(houseId, dateISO, { loss, feed, water, light, meds: "", medsList: medsList.filter((m) => (m.name || "").trim()), note: note.trim() })}>
            บันทึก {houseId}{onSkip ? " · ไปหลังถัดไป ▸" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 🧪 ติดตามผลการให้ยา/สารเสริม (trial) ----------
   trial = {id, name, houseId, startDate, endDate, note} — เทียบตัวเลขช่วง "ก่อนให้" กับ "ช่วงให้"
   จากข้อมูลผลผลิต (productionByDate) + การเลี้ยง (rearingByDate) ที่บันทึกอยู่แล้ว */
function trialStats(production, rearingByDate, houseId, a, b) {
  let days = 0, fongTotal = 0, fongGood = 0, birdDays = 0, dead = 0;
  const offT = {};   // ตกเกรดรายชนิด (แผง)
  Object.keys(production || {}).sort().forEach((d) => {
    if (d < a || d > b) return;
    const h = (production[d] || []).find((x) => x.id === houseId);
    if (!h || !h.grade) return;
    days++;
    const good = Object.values(h.grade.เบอร์ || {}).reduce((s, v) => s + (+v || 0), 0);   // ฟอง
    let off = 0;
    Object.entries(h.grade.ตกเกรด || {}).forEach(([k, v]) => { const n = +v || 0; off += n; offT[k] = (offT[k] || 0) + n; });
    fongGood += good;
    fongTotal += good + off * PER_PRADANG;
    birdDays += h.chickens || 0;
  });
  let deadDays = 0;
  Object.keys(rearingByDate || {}).forEach((d) => {
    if (d < a || d > b) return;
    const r = rearingByDate[d]?.[houseId];
    if (!r) return;
    deadDays++;
    dead += nf(r.loss?.deadAm) + nf(r.loss?.deadPm);
  });
  return {
    days, deadDays, fongTotal, fongGood, birdDays, dead, offT,
    pctTotal: birdDays ? (fongTotal / birdDays) * 100 : null,
    pctGood: birdDays ? (fongGood / birdDays) * 100 : null,
    pctOff: fongTotal ? ((fongTotal - fongGood) / fongTotal) * 100 : null,
  };
}

/* รายการทดลอง + เพิ่ม/ลบ — พร้อมตรวจจับยาจากบันทึกรายวัน (💊 medsList) ให้อัตโนมัติ */
function TrialListModal({ trials, houseIds, defaultHouse, rearingByDate = {}, onAdd, onDelete, onView, onClose }) {
  // ยาที่เจอในบันทึกรายวัน: จับกลุ่ม (หลัง, ชื่อยา) → ช่วงวันแรก-วันสุดท้ายที่ให้
  const detected = (() => {
    const m = {};
    Object.keys(rearingByDate).sort().forEach((d) => {
      Object.keys(rearingByDate[d] || {}).forEach((hid) => {
        (rearingByDate[d][hid]?.medsList || []).forEach((x) => {
          const nm = (x.name || "").trim(); if (!nm) return;
          const k = hid + "|" + nm; (m[k] = m[k] || []).push(d);
        });
      });
    });
    return Object.entries(m).map(([k, dates]) => {
      const [hid, nm] = k.split("|");
      const uniq = [...new Set(dates)].sort();
      return { hid, name: nm, from: uniq[0], to: uniq[uniq.length - 1], days: uniq.length };
    }).filter((s) => !trials.some((t) => t.houseId === s.hid && t.name === s.name));   // ซ่อนตัวที่สร้างการทดลองแล้ว
  })();
  const [name, setName] = useState("");
  const [hid, setHid] = useState(defaultHouse || houseIds[0] || "H2");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const inp = { width: "100%", padding: "9px 10px", border: "1.5px solid #e3ddd0", borderRadius: 9, fontSize: 14, fontFamily: "inherit", outline: "none" };
  const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: INK, marginBottom: 3 };
  const valid = name.trim() && from && to && to >= from;
  const dayCount = (t) => Math.round((new Date(t.endDate) - new Date(t.startDate)) / 86400000) + 1;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 520, maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>🧪 ติดตามผลยา / สารเสริม</div><div style={S.modalSub}>บันทึกการทดลอง แล้วกด "ดูผล" เพื่อเทียบตัวเลขก่อนให้-ช่วงให้</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        {detected.length > 0 && (
          <div style={{ background: "#F0FDFA", border: "1px solid #99F6E4", borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, color: "#0F766E", fontSize: 13, marginBottom: 7 }}>💊 ตรวจพบจากบันทึกยารายวัน — กดเพื่อดูผลได้ทันที ไม่ต้องกรอกซ้ำ</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {detected.map((s, i) => (
                <button key={i} onClick={() => {
                  const t = { id: "tr" + Date.now() + i, name: s.name, houseId: s.hid, startDate: s.from, endDate: s.to, note: `จากบันทึกรายวัน · ให้ ${s.days} วัน` };
                  onAdd(t); onView(t);
                }} style={{ border: "1.5px solid #0D9488", background: "#fff", color: "#0F766E", borderRadius: 999, padding: "6px 13px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  📊 {s.name} · {s.hid} · {toThaiDate(s.from, false)}{s.to !== s.from ? " – " + toThaiDate(s.to, false) : ""} ({s.days} วัน)
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ background: "#FFF7EC", border: "1px solid #F5DEB9", borderRadius: 12, padding: "12px 12px 10px", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, color: ACCENT_DK, fontSize: 13, marginBottom: 8 }}>＋ เริ่มการทดลองใหม่</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1.6 }}><label style={lbl}>ยา/สารเสริมที่ให้</label><input style={inp} placeholder="เช่น Calcium+D3" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div style={{ flex: 0.7 }}><label style={lbl}>โรงเรือน</label><select style={inp} value={hid} onChange={(e) => setHid(e.target.value)}>{houseIds.map((h) => <option key={h}>{h}</option>)}</select></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><label style={lbl}>เริ่มให้วันที่</label><ThaiDateField value={from} onChange={setFrom} style={inp} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>ให้ถึงวันที่</label><ThaiDateField value={to} onChange={setTo} style={inp} /></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={lbl}>หมายเหตุ (เช่น กิน 5 วัน สัปดาห์ที่ 1)</label><input style={inp} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button disabled={!valid} onClick={() => { onAdd({ id: "tr" + Date.now(), name: name.trim(), houseId: hid, startDate: from, endDate: to, note: note.trim() }); setName(""); setFrom(""); setTo(""); setNote(""); }}
            style={{ ...S.primaryBtn, opacity: valid ? 1 : 0.5 }}>บันทึกการทดลอง</button>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#7a6f5c", marginBottom: 6 }}>การทดลองทั้งหมด · {trials.length} รายการ</div>
        {trials.length === 0 ? <div style={{ fontSize: 12.5, color: "#9b8e78" }}>ยังไม่มีการทดลอง</div> : trials.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FDFAF3", border: "1px solid #eee3cd", borderRadius: 10, padding: "9px 11px", marginBottom: 7, fontSize: 13, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800 }}>🧪 {t.name}</span>
            <span style={{ fontWeight: 700, color: ACCENT_DK }}>{t.houseId}</span>
            <span style={{ color: "#9b8e78" }}>{toThaiDate(t.startDate, false)} – {toThaiDate(t.endDate, false)} ({dayCount(t)} วัน)</span>
            {t.note ? <span style={{ color: "#9b8e78" }}>· {t.note}</span> : null}
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button onClick={() => onView(t)} style={{ border: `1px solid ${ACCENT_DK}`, background: ACCENT_DK, color: "#fff", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontWeight: 800, fontSize: 12.5, fontFamily: "inherit" }}>📊 ดูผล / วินิจฉัย</button>
              <button onClick={() => { if (window.confirm(`ลบการทดลอง "${t.name}" ?`)) onDelete(t.id); }} style={{ border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontWeight: 800 }}>✕</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* 📊 ผลการทดลอง: เทียบก่อนให้ vs ช่วงให้ — เลือกเมตริกที่อยากเปรียบเทียบได้ */
function TrialResultModal({ trial, production, rearingByDate, onBack = null, onClose }) {
  const len = Math.max(1, Math.round((new Date(trial.endDate) - new Date(trial.startDate)) / 86400000) + 1);
  const [aFrom, setAFrom] = useState(shiftDayISO(trial.startDate, -len));
  const [aTo, setATo] = useState(shiftDayISO(trial.startDate, -1));
  const [bFrom, setBFrom] = useState(trial.startDate);
  const [bTo, setBTo] = useState(trial.endDate);
  const [unsel, setUnsel] = useState(() => new Set());   // เมตริกที่ผู้ใช้ "เอาออก" (ค่าเริ่มต้น = เทียบทุกตัว)
  const A = trialStats(production, rearingByDate, trial.houseId, aFrom, aTo);
  const B = trialStats(production, rearingByDate, trial.houseId, bFrom, bTo);
  const offKeys = [...new Set([...Object.keys(A.offT), ...Object.keys(B.offT)])];
  const pctFm = (v) => v == null ? "—" : v.toFixed(2) + "%";
  const metrics = [
    { key: "pctTotal", label: "%ผลผลิตรวม (ไข่รวม ÷ ไก่)", better: "up", get: (s) => s.pctTotal, fm: pctFm, unit: " จุด" },
    { key: "pctGood", label: "%ไข่ดี (ไข่ดี ÷ ไก่)", better: "up", get: (s) => s.pctGood, fm: pctFm, unit: " จุด" },
    { key: "pctOff", label: "%ไข่ตกเกรด", better: "down", get: (s) => s.pctOff, fm: pctFm, unit: " จุด" },
    { key: "dead", label: "ไก่ตายเฉลี่ย (ตัว/วัน)", better: "down", get: (s) => s.deadDays ? s.dead / s.deadDays : null, fm: (v) => v == null ? "—" : fmt1(v), unit: " ตัว/วัน" },
    ...offKeys.map((k) => ({ key: "off:" + k, label: `ตกเกรด · ${k} (แผง/วัน)`, better: "down", get: (s) => s.days ? (s.offT[k] || 0) / s.days : null, fm: (v) => v == null ? "—" : fmt1(v), unit: " แผง/วัน" })),
  ];
  const toggle = (k) => setUnsel((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const trend = (m) => {
    const va = m.get(A), vb = m.get(B);
    if (va == null || vb == null) return null;
    const d = vb - va;
    return { va, vb, d, flat: Math.abs(d) < 0.005, good: m.better === "up" ? d > 0 : d < 0 };
  };
  const selMetrics = metrics.filter((m) => !unsel.has(m.key));
  const improved = selMetrics.map((m) => ({ m, t: trend(m) })).filter((x) => x.t && !x.t.flat && x.t.good);
  const worsened = selMetrics.map((m) => ({ m, t: trend(m) })).filter((x) => x.t && !x.t.flat && !x.t.good);
  const dateInp = { padding: "6px 9px", border: "1.5px solid #e3ddd0", borderRadius: 8, fontSize: 12.5, fontFamily: "inherit" };
  const th2 = { padding: "7px 8px", fontSize: 11.5, fontWeight: 800, color: "#7a6f5c", background: "#F6F1E7", borderBottom: "2px solid #e6ddca", textAlign: "right", whiteSpace: "nowrap" };
  const td2 = { padding: "7px 8px", fontSize: 13, textAlign: "right", borderBottom: "1px solid #eee7d8", whiteSpace: "nowrap" };
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 640, maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div>
            <div style={S.modalTitle}>{onBack ? <button onClick={onBack} title="กลับรายการทดลอง" style={{ border: "1px solid #e0d7c3", background: "#fff", color: "#7a6f5c", borderRadius: 8, padding: "3px 10px", cursor: "pointer", fontWeight: 800, fontSize: 13, marginRight: 8, fontFamily: "inherit", verticalAlign: "middle" }}>← กลับ</button> : null}📊 ผลการให้ {trial.name} · {trial.houseId}</div>
            <div style={S.modalSub}>ให้ {toThaiDate(trial.startDate, false)} – {toThaiDate(trial.endDate, false)}{trial.note ? " · " + trial.note : ""}</div>
          </div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, fontSize: 12.5 }}>
          <div style={{ flex: 1, minWidth: 240, background: "#F6F1E7", borderRadius: 10, padding: "8px 10px" }}>
            <b>ช่วงก่อนให้:</b> <ThaiDateField value={aFrom} onChange={setAFrom} style={dateInp} long={false} /> – <ThaiDateField value={aTo} onChange={setATo} style={dateInp} long={false} />
            <div style={{ color: "#9b8e78", marginTop: 3 }}>มีข้อมูลผลผลิต {A.days} วัน · การเลี้ยง {A.deadDays} วัน</div>
          </div>
          <div style={{ flex: 1, minWidth: 240, background: "#FFEDD5", borderRadius: 10, padding: "8px 10px" }}>
            <b>ช่วงให้ยา:</b> <ThaiDateField value={bFrom} onChange={setBFrom} style={dateInp} long={false} /> – <ThaiDateField value={bTo} onChange={setBTo} style={dateInp} long={false} />
            <div style={{ color: "#9b8e78", marginTop: 3 }}>มีข้อมูลผลผลิต {B.days} วัน · การเลี้ยง {B.deadDays} วัน</div>
          </div>
        </div>
        {A.days === 0 && B.days === 0 ? (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#B91C1C", fontWeight: 700, marginBottom: 12 }}>
            ยังไม่มีข้อมูลผลผลิตของ {trial.houseId} ในช่วงวันที่เลือก — กรอกผลผลิตรายวัน (แท็บผลผลิต) ให้ครอบคลุมช่วงทดลองก่อน แล้วผลจะคำนวณให้อัตโนมัติ
          </div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
              <thead><tr>
                <th style={{ ...th2, textAlign: "left" }}>✓ เลือกตัวเลขที่เทียบ</th>
                <th style={th2}>ก่อนให้</th>
                <th style={{ ...th2, background: "#FFEDD5" }}>ช่วงให้</th>
                <th style={th2}>เปลี่ยนแปลง</th>
                <th style={th2}>ผล</th>
              </tr></thead>
              <tbody>
                {metrics.map((m) => {
                  const t = trend(m);
                  const on = !unsel.has(m.key);
                  return (
                    <tr key={m.key} style={{ opacity: on ? 1 : 0.4 }}>
                      <td style={{ ...td2, textAlign: "left" }}>
                        <label style={{ cursor: "pointer", display: "flex", gap: 7, alignItems: "center", fontWeight: 600 }}>
                          <input type="checkbox" checked={on} onChange={() => toggle(m.key)} style={{ accentColor: ACCENT_DK }} />{m.label}
                        </label>
                      </td>
                      <td style={td2}>{m.fm(m.get(A))}</td>
                      <td style={{ ...td2, background: "#FFF7EC", fontWeight: 700 }}>{m.fm(m.get(B))}</td>
                      <td style={{ ...td2, fontWeight: 700 }}>{t ? (t.flat ? "คงที่" : (t.d > 0 ? "▲ +" : "▼ ") + (m.key.startsWith("pct") ? t.d.toFixed(2) : fmt1(t.d))) : "—"}</td>
                      <td style={{ ...td2, fontWeight: 800, color: t ? (t.flat ? "#9b8e78" : t.good ? "#15803D" : "#B91C1C") : "#c9c0ad" }}>{t ? (t.flat ? "—" : t.good ? "🟢 ดีขึ้น" : "🔴 แย่ลง") : "ไม่มีข้อมูล"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "10px 13px", fontSize: 13, marginBottom: 8 }}>
              <div style={{ fontWeight: 800, color: "#15803D", marginBottom: 4 }}>🩺 สรุปวินิจฉัยเบื้องต้น (จากตัวเลขที่เลือก)</div>
              {improved.length ? <div style={{ marginBottom: 3 }}>🟢 <b>ดีขึ้น:</b> {improved.map((x) => `${x.m.label.replace(/ \(.*\)/, "")} (${x.t.d > 0 ? "+" : ""}${x.m.key.startsWith("pct") ? x.t.d.toFixed(2) : fmt1(x.t.d)}${x.m.unit})`).join(" · ")}</div> : null}
              {worsened.length ? <div style={{ marginBottom: 3 }}>🔴 <b>แย่ลง:</b> {worsened.map((x) => `${x.m.label.replace(/ \(.*\)/, "")} (${x.t.d > 0 ? "+" : ""}${x.m.key.startsWith("pct") ? x.t.d.toFixed(2) : fmt1(x.t.d)}${x.m.unit})`).join(" · ")}</div> : null}
              {!improved.length && !worsened.length ? <div>ตัวเลขโดยรวมคงที่ — ยังไม่เห็นความแตกต่างชัดเจนในช่วงที่เทียบ</div> : null}
              <div style={{ color: "#9b8e78", fontSize: 11.5, marginTop: 6 }}>⚠️ เป็นการเทียบตัวเลขล้วน ๆ — อายุไก่ อากาศ ความเครียด และปัจจัยอื่นมีผลร่วมด้วย ควรดูซ้ำหลายสัปดาห์ก่อนสรุป</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* เสมียนบันทึก "รับอาหารเข้า" (ช่องทางที่ 2) — เสมียนรับรถส่งอาหารเป็นคนแรก
   ระบบเอาตัวเลขนี้ไปรีเช็คกับ "รับเข้า" ที่สัตวบาลลงในบันทึกการเลี้ยงของวันเดียวกัน */
function FeedDeliveryModal({ houseIds, defaultDate, deliveries, onAdd, onDelete, onClose }) {
  const [date, setDate] = useState(defaultDate);
  const [hid, setHid] = useState(houseIds[0] || "H2");
  const [silo, setSilo] = useState("1");
  const [kg, setKg] = useState("");
  const [by, setBy] = useState("");
  const inp = { width: "100%", padding: "9px 10px", border: "1.5px solid #e3ddd0", borderRadius: 9, fontSize: 14.5, fontFamily: "inherit", outline: "none" };
  const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: INK, marginBottom: 3 };
  const dayList = (deliveries || []).filter((x) => x.date === date);
  const save = () => {
    if (!(parseFloat(kg) > 0)) return;
    onAdd({ id: "fd" + Date.now(), date, houseId: hid, silo, kg: parseFloat(kg), by: by.trim(), ts: Date.now() });
    setKg("");
  };
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 470, maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>🚚 รับอาหารเข้า (เสมียน)</div><div style={S.modalSub}>เสมียนกรอกตอนรับรถส่งอาหาร — ใช้รีเช็คกับบันทึกของสัตวบาลในเล้า</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1.5 }}><label style={lbl}>วันที่รับ</label><ThaiDateField value={date} onChange={setDate} style={inp} /></div>
          <div style={{ flex: 0.8 }}><label style={lbl}>โรงเรือน</label>
            <select value={hid} onChange={(e) => setHid(e.target.value)} style={inp}>{houseIds.map((h) => <option key={h}>{h}</option>)}</select></div>
          <div style={{ flex: 0.8 }}><label style={lbl}>ไซโล</label>
            <select value={silo} onChange={(e) => setSilo(e.target.value)} style={inp}><option value="1">ไซโล 1</option><option value="2">ไซโล 2</option></select></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}><label style={lbl}>น้ำหนักอาหาร (กก.)</label>
            <input style={{ ...inp, textAlign: "right", fontWeight: 700 }} inputMode="decimal" placeholder="0" autoFocus value={kg}
              onChange={(e) => setKg(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>ผู้บันทึก (เสมียน)</label>
            <input style={inp} placeholder="ชื่อผู้รับของ" value={by} onChange={(e) => setBy(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} /></div>
        </div>
        <button style={{ ...S.primaryBtn, marginBottom: 14, opacity: parseFloat(kg) > 0 ? 1 : 0.5 }} disabled={!(parseFloat(kg) > 0)} onClick={save}>＋ บันทึกรับอาหาร {hid} · ไซโล {silo}{parseFloat(kg) > 0 ? ` · ${fmt1(parseFloat(kg))} กก.` : ""}</button>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#7a6f5c", marginBottom: 6 }}>รายการรับของ {toThaiDate(date, false)} · {dayList.length} รายการ</div>
        {dayList.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#9b8e78", padding: "8px 0 2px" }}>ยังไม่มีรายการรับอาหารของวันนี้</div>
        ) : dayList.map((x) => (
          <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FDFAF3", border: "1px solid #eee3cd", borderRadius: 9, padding: "7px 10px", marginBottom: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 800 }}>{x.houseId}</span>
            <span>ไซโล {x.silo}</span>
            <span style={{ fontWeight: 800, color: "#B45309" }}>{fmt1(x.kg)} กก.</span>
            {x.by ? <span style={{ color: "#9b8e78" }}>โดย {x.by}</span> : null}
            <button onClick={() => onDelete(x.id)} title="ลบรายการ" style={{ marginLeft: "auto", border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 7, padding: "2px 8px", cursor: "pointer", fontWeight: 800 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   หน้าจอ: คลัง·ผลผลิต — ยุบ คลังรายวัน + ผลผลิต เป็นแท็บเดียว (สลับด้วยชิปย่อย)
============================================================ */
function StockProdView({ stockProps, prodProps }) {
  const [sub, setSub] = useState("stock");
  const chip = (a) => ({ padding: "8px 20px", borderRadius: 999, border: `1.5px solid ${a ? ACCENT_DK : "#e0d7c3"}`, background: a ? ACCENT_DK : "#fff", color: a ? "#fff" : "#7a6f5c", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" });
  return (
    <div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", padding: "16px 22px 0" }}>
        <button style={chip(sub === "stock")} onClick={() => setSub("stock")}>🏬 คลังรายวัน</button>
        <button style={chip(sub === "prod")} onClick={() => setSub("prod")}>🥚 ผลผลิต</button>
      </div>
      {sub === "stock" ? <StockView {...stockProps} /> : <ProductionView {...prodProps} />}
    </div>
  );
}

/* ============================================================
   หน้าจอ: อาหารไก่ — คงเหลือไซโล + เตือนใกล้หมด + รับอาหาร(เสมียน) + รีเช็ค 2 ฝั่ง
   (การกรอก "รับ/ใช้" รายวันยังอยู่ในแท็บ เก็บสถิติการเลี้ยง — หน้านี้คือมุมบริหารอาหาร)
============================================================ */
function FeedView({ rearingByDate = {}, flocks = {}, production = {}, feedDeliveries = [], addFeedDelivery, deleteFeedDelivery, feedPrice = 0, setFeedPrice, feedUseByMonth = {} }) {
  const prodDates = Object.keys(production).sort();
  const houseIds = [...new Set([...(production[prodDates[prodDates.length - 1]] || []).map((h) => h.id), ...HOUSE_IDS])];   // รวมหลังใหม่ที่ยังไม่มีผลผลิต (เช่น H7)
  const rearDates = Object.keys(rearingByDate).sort();
  const [showDelivery, setShowDelivery] = useState(false);
  // เกณฑ์เตือนอาหารใกล้หมด (กก./ไซโล) — คีย์เดียวกับที่ฟอร์มการเลี้ยงใช้เตือนในหน้ากรอก
  const [feedMin, setFeedMin] = useState(() => { const v = parseFloat(localStorage.getItem("eggFeedAlertMin")); return isNaN(v) ? 4000 : v; });
  useEffect(() => { try { localStorage.setItem("eggFeedAlertMin", String(feedMin)); } catch {} }, [feedMin]);
  // ไซโลที่ "ใช้งานจริง" (เคยบันทึกรับ/ใช้) — โชว์/เตือนเฉพาะไซโลที่ใช้งาน
  const siloAct = useMemo(() => {
    const m = {};
    houseIds.forEach((hid) => { m[hid] = { s1: false, s2: false }; });
    Object.keys(rearingByDate).forEach((d) => {
      Object.keys(rearingByDate[d] || {}).forEach((hid) => {
        const f = rearingByDate[d][hid]?.feed; if (!f || !m[hid]) return;
        if (nf(f.s1recv) || nf(f.s1used)) m[hid].s1 = true;
        if (nf(f.s2recv) || nf(f.s2used)) m[hid].s2 = true;
      });
    });
    return m;
  }, [rearingByDate, houseIds.join(",")]);
  const rows = houseIds.map((hid) => {
    const rem = feedRemain(rearingByDate, hid, "9999-12-31", flocks[hid]);
    const a = siloAct[hid] || { s1: false, s2: false };
    const low = (a.s1 && rem.s1 < feedMin) || (a.s2 && rem.s2 < feedMin);
    // กินไปวันล่าสุดที่มีบันทึกของหลังนี้
    let lastUsed = null, lastDay = null;
    for (let i = rearDates.length - 1; i >= 0; i--) {
      const f = rearingByDate[rearDates[i]]?.[hid]?.feed;
      if (f && (nf(f.s1used) || nf(f.s2used))) { lastUsed = nf(f.s1used) + nf(f.s2used); lastDay = rearDates[i]; break; }
    }
    return { hid, rem, act: a, low, lastUsed, lastDay };
  });
  const feedAlerts = rows.flatMap((r) => [
    ...(r.act.s1 && r.rem.s1 < feedMin ? [{ hid: r.hid, silo: 1, remain: r.rem.s1 }] : []),
    ...(r.act.s2 && r.rem.s2 < feedMin ? [{ hid: r.hid, silo: 2, remain: r.rem.s2 }] : []),
  ]);
  const anyAct = rows.some((r) => r.act.s1 || r.act.s2);
  // รีเช็ครับอาหาร: เสมียน (feedDeliveries) ↔ สัตวบาล (รับเข้าในบันทึกรายวัน) ต่อ วัน/หลัง/ไซโล
  const feedRecheck = useMemo(() => {
    const byKey = {};
    (feedDeliveries || []).forEach((x) => { const k = x.date + "|" + x.houseId + "|" + x.silo; byKey[k] = (byKey[k] || 0) + (parseFloat(x.kg) || 0); });
    return Object.keys(byKey).sort().reverse().map((k) => {
      const [date, hid, silo] = k.split("|");
      const f = rearingByDate[date]?.[hid]?.feed;
      const keeper = f ? nf(silo === "1" ? f.s1recv : f.s2recv) : null;
      return { date, hid, silo, clerk: byKey[k], keeper, diff: keeper == null ? null : byKey[k] - keeper };
    });
  }, [feedDeliveries, rearingByDate]);
  const recheckMismatch = feedRecheck.filter((x) => x.diff != null && Math.abs(x.diff) > 0.001);
  const recheckPending = feedRecheck.filter((x) => x.keeper == null);
  const recheckMatched = feedRecheck.filter((x) => x.diff != null && Math.abs(x.diff) <= 0.001).length;
  const recent = [...(feedDeliveries || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 10);
  const th = { padding: "9px 10px", fontSize: 12.5, fontWeight: 800, color: "#7a6f5c", background: "#F6F1E7", borderBottom: "2px solid #e6ddca", whiteSpace: "nowrap", textAlign: "right" };
  const td = { padding: "9px 10px", fontSize: 13.5, textAlign: "right", borderBottom: "1px solid #eee7d8", whiteSpace: "nowrap" };
  const remCell = (act, v) => act ? <span style={v < feedMin ? { color: "#B91C1C", fontWeight: 800 } : { fontWeight: 700 }}>{fmt1(v)}{v < feedMin ? " ⚠️" : ""}</span> : <span style={{ color: "#c9c0ad" }}>—</span>;
  return (
    <div style={{ padding: "18px 22px 40px" }}>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>อาหารไก่ 🌾{anyAct ? <span style={{ fontSize: 12.5, fontWeight: 600, color: "#9b8e78" }}> · คงเหลือทดจากบันทึกการเลี้ยง</span> : null}</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, fontWeight: 700, color: "#7a6f5c", background: "#fff", border: "1px solid #eee3cd", borderRadius: 999, padding: "6px 12px" }}>
            ราคาอาหาร
            <input inputMode="decimal" value={feedPrice || ""} placeholder="0" onChange={(e) => setFeedPrice && setFeedPrice(parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
              style={{ width: 58, padding: "3px 7px", border: `1.5px solid ${feedPrice ? "#86C99A" : "#F5A9A9"}`, borderRadius: 7, fontSize: 13, textAlign: "right", fontFamily: "inherit", fontWeight: 800, outline: "none" }} />
            บ./กก. {feedPrice ? "✓" : <span style={{ color: "#B91C1C" }}>← ตั้งเพื่อคิดค่าอาหารอัตโนมัติ</span>}
          </span>
          <button onClick={() => setShowDelivery(true)} style={{ padding: "8px 16px", borderRadius: 999, border: "1.5px solid #B45309", background: "#B45309", color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🚚 รับอาหารเข้า (เสมียน)</button>
        </div>
      </div>

      {anyAct && (feedAlerts.length > 0 ? (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, color: "#B91C1C", fontSize: 13.5 }}>🔔 อาหารใกล้หมด · {feedAlerts.length} ไซโล</span>
            <span style={{ fontSize: 12, color: "#B91C1C", marginLeft: "auto" }}>เกณฑ์เตือน ต่ำกว่า</span>
            <input type="text" inputMode="numeric" value={feedMin} onChange={(e) => setFeedMin(parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
              style={{ width: 72, padding: "3px 7px", border: "1px solid #FECACA", borderRadius: 7, fontSize: 12.5, textAlign: "right", fontFamily: "inherit", color: "#B91C1C", fontWeight: 700, outline: "none" }} />
            <span style={{ fontSize: 12, color: "#B91C1C" }}>กก./ไซโล</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {feedAlerts.map((a, i) => (
              <span key={i} style={{ border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 999, padding: "4px 12px", fontSize: 12.5, fontWeight: 700 }}>
                {a.hid} · ไซโล {a.silo} เหลือ {fmt1(a.remain)} กก. — สั่งอาหารเพิ่ม
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "8px 14px", marginBottom: 12, fontSize: 12.5, fontWeight: 700, color: "#15803D", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>🌾 อาหารทุกไซโลเหลือเกินเกณฑ์</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>เกณฑ์เตือน ต่ำกว่า</span>
          <input type="text" inputMode="numeric" value={feedMin} onChange={(e) => setFeedMin(parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
            style={{ width: 72, padding: "3px 7px", border: "1px solid #BBF7D0", borderRadius: 7, fontSize: 12.5, textAlign: "right", fontFamily: "inherit", color: "#15803D", fontWeight: 700, outline: "none" }} />
          <span style={{ fontWeight: 600 }}>กก./ไซโล</span>
        </div>
      ))}

      {/* ตารางคงเหลือต่อไซโล */}
      <div style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, overflow: "auto", marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>โรงเรือน</th>
            <th style={th}>ไซโล 1 คงเหลือ (กก.)</th>
            <th style={th}>ไซโล 2 คงเหลือ (กก.)</th>
            <th style={th}>รวม (กก.)</th>
            <th style={th}>กินไปวันล่าสุด (กก.)</th>
            <th style={{ ...th, textAlign: "center" }}>สถานะ</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hid}>
                <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{r.hid}</td>
                <td style={td}>{remCell(r.act.s1, r.rem.s1)}</td>
                <td style={td}>{remCell(r.act.s2, r.rem.s2)}</td>
                <td style={{ ...td, fontWeight: 800 }}>{(r.act.s1 || r.act.s2) ? fmt1((r.act.s1 ? r.rem.s1 : 0) + (r.act.s2 ? r.rem.s2 : 0)) : "—"}</td>
                <td style={td}>{r.lastUsed != null ? `${fmt1(r.lastUsed)} (${toThaiDate(r.lastDay, false)})` : "—"}</td>
                <td style={{ ...td, textAlign: "center", fontWeight: 800, color: !(r.act.s1 || r.act.s2) ? "#c9c0ad" : r.low ? "#B91C1C" : "#15803D" }}>{!(r.act.s1 || r.act.s2) ? "ยังไม่บันทึก" : r.low ? "⚠️ ใกล้หมด" : "✓ ปกติ"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 📅 สรุปการกินอาหาร + ค่าอาหาร รายเดือน (จากบันทึกการเลี้ยง × ราคาอาหาร) */}
      {Object.keys(feedUseByMonth).length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, overflow: "auto", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: "#7a6f5c", padding: "12px 14px 4px" }}>📅 สรุปการกินอาหารรายเดือน</div>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>เดือน</th>
              {houseIds.map((h) => <th key={h} style={th}>{h} (กก.)</th>)}
              <th style={{ ...th, background: "#F5E6CE" }}>รวม (กก.)</th>
              <th style={{ ...th, background: "#FDF0E0" }}>ค่าอาหาร (บ.)</th>
            </tr></thead>
            <tbody>
              {Object.keys(feedUseByMonth).sort().reverse().map((ym) => {
                const v = feedUseByMonth[ym];
                return (
                  <tr key={ym}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{toThaiDate(ym + "-01").split(" ").slice(1).join(" ")}</td>
                    {houseIds.map((h) => <td key={h} style={td}>{v.byHouse[h] ? fmt1(v.byHouse[h]) : <span style={{ color: "#d6cdbb" }}>·</span>}</td>)}
                    <td style={{ ...td, fontWeight: 800, background: "#FDF8EE" }}>{fmt1(v.kg)}</td>
                    <td style={{ ...td, fontWeight: 800, background: "#FEF8F0", color: feedPrice ? "#B45309" : "#c9c0ad" }}>{feedPrice ? fmt(Math.round(v.kg * feedPrice)) : "ตั้งราคาก่อน"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: "#9b8e78", padding: "6px 14px 12px" }}>ค่าอาหาร = กก.ที่ใช้ (ไซโล 1+2 จากบันทึกการเลี้ยง) × ราคาอาหาร — เข้าบัญชีต้นทุนหมวด "ค่าอาหาร" อัตโนมัติ (🌾)</div>
        </div>
      )}

      {/* รีเช็ครับอาหาร: เสมียน ↔ สัตวบาล */}
      {feedRecheck.length > 0 && (
        <div style={{ background: recheckMismatch.length ? "#FFFBEB" : "#FDFAF3", border: `1px solid ${recheckMismatch.length ? "#FDE68A" : "#eee3cd"}`, borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: recheckMismatch.length ? "#92400E" : "#7a6f5c", fontSize: 13, marginBottom: recheckMismatch.length + recheckPending.length > 0 ? 8 : 0 }}>
            🚚 รีเช็ครับอาหาร (เสมียน ↔ สัตวบาล){recheckMatched > 0 ? <span style={{ color: "#15803D", fontWeight: 700 }}> · ตรงกัน {recheckMatched} รายการ ✓</span> : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {recheckMismatch.map((x, i) => (
              <span key={"m" + i} style={{ border: "1px solid #FCD34D", background: "#fff", color: "#92400E", borderRadius: 999, padding: "4px 12px", fontSize: 12.5, fontWeight: 700 }}>
                ⚠️ {toThaiDate(x.date, false)} · {x.hid} ไซโล {x.silo} — เสมียน {fmt1(x.clerk)} ≠ สัตวบาล {fmt1(x.keeper)} (ต่าง {x.diff > 0 ? "+" : ""}{fmt1(x.diff)} กก.)
              </span>
            ))}
            {recheckPending.map((x, i) => (
              <span key={"p" + i} style={{ border: "1px dashed #d8cdb6", background: "#fff", color: "#9b8e78", borderRadius: 999, padding: "4px 12px", fontSize: 12.5, fontWeight: 700 }}>
                ⏳ {toThaiDate(x.date, false)} · {x.hid} ไซโล {x.silo} — เสมียนรับ {fmt1(x.clerk)} กก. · รอสัตวบาลลงบันทึก
              </span>
            ))}
          </div>
        </div>
      )}

      {/* รายการรับอาหารล่าสุด (เสมียน) */}
      <div style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, padding: "12px 14px" }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: "#7a6f5c", marginBottom: 8 }}>🚚 รับอาหารเข้าล่าสุด · {feedDeliveries.length} รายการ</div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#9b8e78" }}>ยังไม่มีรายการ — กด "รับอาหารเข้า (เสมียน)" ตอนรถอาหารมาส่ง</div>
        ) : recent.map((x) => (
          <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FDFAF3", border: "1px solid #eee3cd", borderRadius: 9, padding: "7px 10px", marginBottom: 6, fontSize: 13, flexWrap: "wrap" }}>
            <span style={{ color: "#9b8e78" }}>{toThaiDate(x.date, false)}</span>
            <span style={{ fontWeight: 800 }}>{x.houseId}</span>
            <span>ไซโล {x.silo}</span>
            <span style={{ fontWeight: 800, color: "#B45309" }}>{fmt1(x.kg)} กก.</span>
            {x.by ? <span style={{ color: "#9b8e78" }}>โดย {x.by}</span> : null}
            <button onClick={() => deleteFeedDelivery(x.id)} title="ลบรายการ" style={{ marginLeft: "auto", border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 7, padding: "2px 8px", cursor: "pointer", fontWeight: 800 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={S.hint}>คงเหลือ = ยกมา + Σรับ − Σใช้ จากบันทึกรายวันในแท็บ "เก็บสถิติการเลี้ยง" · เตือนเฉพาะไซโลที่เคยบันทึกใช้งาน · รับอาหารเข้า (เสมียน) ใช้รีเช็คกับตัวเลขสัตวบาล 2 ฝั่ง</div>

      {showDelivery && (
        <FeedDeliveryModal houseIds={houseIds} defaultDate={rearDates[rearDates.length - 1] || prodDates[prodDates.length - 1] || isoFromTs(Date.now())}
          deliveries={feedDeliveries} onAdd={addFeedDelivery} onDelete={deleteFeedDelivery} onClose={() => setShowDelivery(false)} />
      )}
    </div>
  );
}

/* ============================================================
   หน้าจอ: ยาและวิตามิน — ทดลองยา/สารเสริม + ตรวจจับจากบันทึกรายวัน + ประวัติการให้ยา
============================================================ */
function MedView({ medTrials = [], addMedTrial, deleteMedTrial, rearingByDate = {}, production = {}, medStock = [], medInfo = {}, medReceipts = [], addMedItem, updateMedItem, addMedReceipt, medCostByMonth = {} }) {
  const prodDates = Object.keys(production).sort();
  const houseIds = [...new Set([...(production[prodDates[prodDates.length - 1]] || []).map((h) => h.id), ...HOUSE_IDS])];   // รวมหลังใหม่ที่ยังไม่มีผลผลิต (เช่น H7)
  const [viewTrial, setViewTrial] = useState(null);
  const [receiptItem, setReceiptItem] = useState(null);   // รายการยาที่กำลังรับเข้า
  const [showAddMed, setShowAddMed] = useState(false);
  const thisYM = isoFromTs(Date.now()).slice(0, 7);
  const medCostThisMonth = medCostByMonth[thisYM]?.total || 0;
  const stockValue = medStock.reduce((s, it) => { const inf = medInfo[(it.name || "").trim()]; return s + (inf && it.price ? Math.max(0, inf.remain) * it.price : 0); }, 0);
  const editItem = (it) => {   // แก้ชื่อ/ราคา แบบเร็ว (prompt) — ชื่อเปลี่ยนแล้วบันทึกรายวันเดิมที่ใช้ชื่อเก่าจะไม่ลิงก์ จึงเตือนก่อน
    const nm = window.prompt("ชื่อยา (แก้ชื่อ = บันทึกรายวันที่ใช้ชื่อเดิมจะไม่ถูกนับ)", it.name);
    if (nm === null) return;
    const pr = window.prompt("ราคา บาท/" + (it.unit || "หน่วย") + " (เว้นว่าง = ไม่มีราคา)", it.price != null ? String(it.price) : "");
    if (pr === null) return;
    updateMedItem(it.id, { name: (nm || it.name).trim(), price: pr.trim() === "" ? null : (parseFloat(pr.replace(/,/g, "")) || null) });
  };
  // ยาที่ตรวจพบจากบันทึกรายวัน (ยังไม่ได้สร้างเป็นการทดลอง)
  const detected = useMemo(() => {
    const m = {};
    Object.keys(rearingByDate).sort().forEach((d) => {
      Object.keys(rearingByDate[d] || {}).forEach((hid) => {
        (rearingByDate[d][hid]?.medsList || []).forEach((x) => {
          const nm = (x.name || "").trim(); if (!nm) return;
          const k = hid + "|" + nm; (m[k] = m[k] || []).push(d);
        });
      });
    });
    return Object.entries(m).map(([k, dates]) => {
      const [hid, nm] = k.split("|");
      const uniq = [...new Set(dates)].sort();
      return { hid, name: nm, from: uniq[0], to: uniq[uniq.length - 1], days: uniq.length };
    }).filter((s) => !medTrials.some((t) => t.houseId === s.hid && t.name === s.name));
  }, [rearingByDate, medTrials]);
  // ประวัติการให้ยา (จากบันทึกรายวัน) — ล่าสุดก่อน
  const medLog = useMemo(() => {
    const out = [];
    Object.keys(rearingByDate).sort().reverse().forEach((d) => {
      Object.keys(rearingByDate[d] || {}).sort().forEach((hid) => {
        const r = rearingByDate[d][hid];
        const txt = medsDetail(r);
        if (txt) out.push({ date: d, hid, txt });
      });
    });
    return out.slice(0, 15);
  }, [rearingByDate]);
  // ฟอร์มเริ่มการทดลองใหม่
  const [name, setName] = useState("");
  const [hid, setHid] = useState(houseIds[0] || "H2");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const valid = name.trim() && from && to && to >= from;
  const dayCount = (t) => Math.round((new Date(t.endDate) - new Date(t.startDate)) / 86400000) + 1;
  const today = isoFromTs(Date.now());
  const activeTrials = medTrials.filter((t) => today >= t.startDate && today <= t.endDate);
  const inp = { width: "100%", padding: "9px 10px", border: "1.5px solid #e3ddd0", borderRadius: 9, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: INK, marginBottom: 3 };
  const card = (label, value, color) => (
    <div style={{ flex: 1, minWidth: 130, background: "#fff", border: "1px solid #eee3cd", borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#9b8e78" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || INK }}>{value}</div>
    </div>
  );
  return (
    <div style={{ padding: "18px 22px 40px" }}>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>ยาและวิตามิน 💊<span style={{ fontSize: 12.5, fontWeight: 600, color: "#9b8e78" }}> · สต๊อก {medStock.length} รายการ</span></span>
        <button onClick={() => setShowAddMed(true)} style={{ padding: "8px 16px", borderRadius: 999, border: "1.5px solid #0D9488", background: "#0D9488", color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>＋ เพิ่มยาใหม่เข้าสต๊อก</button>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {card("💊 ค่ายาที่ใช้จริงเดือนนี้ — ตัวนี้เข้าบัญชีต้นทุน", fmt(Math.round(medCostThisMonth)) + " บ.", medCostThisMonth ? "#B91C1C" : undefined)}
        {card("📦 มูลค่าสต๊อกในคลัง (ทรัพย์สิน — ไม่ใช่ค่าใช้จ่าย)", fmt(Math.round(stockValue)) + " บ.", "#9b8e78")}
        {card("การทดลองทั้งหมด", medTrials.length + " รายการ")}
        {card("กำลังให้อยู่วันนี้", activeTrials.length + " รายการ", activeTrials.length ? "#0F766E" : undefined)}
      </div>

      {/* 📦 ตารางสต๊อกยา — โครงตามชีตจริง: ยกมา/รับเข้า/เบิกใช้/คงเหลือ/ราคา/มูลค่า ; เบิกใช้ดึงจากบันทึกให้ยารายวันอัตโนมัติ */}
      <div style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, overflow: "auto", marginBottom: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead><tr>
            {["ลำดับ", "ชื่อยา", "ยกมา", "รับเข้า", "เบิกใช้", "คงเหลือ", "ราคา/หน่วย", "มูลค่าคงเหลือ", "บริษัท", "หมดอายุ", ""].map((h, i) => (
              <th key={i} style={{ padding: "8px 8px", fontSize: 11.5, fontWeight: 800, color: "#7a6f5c", background: "#F6F1E7", borderBottom: "2px solid #e6ddca", whiteSpace: "nowrap", textAlign: i <= 1 ? "left" : "right", position: "sticky", top: 0 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {medStock.map((it, idx) => {
              const inf = medInfo[(it.name || "").trim()] || { remain: it.opening || 0, used: 0, recv: 0 };
              const val = it.price ? Math.max(0, inf.remain) * it.price : null;
              const tdm = { padding: "7px 8px", fontSize: 13, textAlign: "right", borderBottom: "1px solid #eee7d8", whiteSpace: "nowrap" };
              return (
                <tr key={it.id} style={inf.remain <= 0 ? { background: "#FEF2F2" } : undefined}>
                  <td style={{ ...tdm, textAlign: "left", color: "#9b8e78" }}>{idx + 1}</td>
                  <td style={{ ...tdm, textAlign: "left", whiteSpace: "normal", minWidth: 190 }}>
                    <span style={{ fontWeight: 800 }}>{it.name}</span>
                    {it.desc ? <span style={{ color: "#9b8e78", fontSize: 11.5 }}> · {it.desc}</span> : null}
                  </td>
                  <td style={tdm}>{fmt1(it.opening || 0)}</td>
                  <td style={{ ...tdm, color: inf.recv ? "#15803D" : "#c9c0ad", fontWeight: inf.recv ? 700 : 400 }}>{inf.recv ? "+" + fmt1(inf.recv) : "0"}</td>
                  <td style={{ ...tdm, color: inf.used ? "#B45309" : "#c9c0ad", fontWeight: inf.used ? 700 : 400 }}>{inf.used ? fmt1(inf.used) : "0"}</td>
                  <td style={{ ...tdm, fontWeight: 800, color: inf.remain <= 0 ? "#B91C1C" : "#15803D", background: "#F1F8F2" }}>{fmt1(inf.remain)} <span style={{ fontWeight: 500, fontSize: 11, color: "#9b8e78" }}>{it.unit || ""}</span></td>
                  <td style={tdm}>{it.price ? fmt(it.price) : "—"}</td>
                  <td style={{ ...tdm, fontWeight: 700 }}>{val != null ? fmt(Math.round(val)) : "—"}</td>
                  <td style={{ ...tdm, textAlign: "left", fontSize: 11.5, color: "#7a6f5c" }}>{it.company || ""}</td>
                  <td style={{ ...tdm, fontSize: 11.5, color: "#7a6f5c" }}>{it.expiry || "—"}</td>
                  <td style={{ ...tdm }}>
                    <span style={{ display: "inline-flex", gap: 5 }}>
                      <button onClick={() => setReceiptItem(it)} title="รับยาเข้าสต๊อก" style={{ border: "1px solid #86C99A", background: "#F0FDF4", color: "#15803D", borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit" }}>＋รับ</button>
                      <button onClick={() => editItem(it)} title="แก้ชื่อ/ราคา" style={{ border: "1px solid #e0d7c3", background: "#fff", color: "#7a6f5c", borderRadius: 7, padding: "3px 8px", cursor: "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit" }}>✎</button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: "#9b8e78", margin: "-6px 2px 14px" }}>เบิกใช้ = ระบบรวมจากบันทึกให้ยารายวันของสัตวบาล (แท็บ เก็บสถิติการเลี้ยง — พิมพ์ชื่อตรงกับสต๊อก) ตั้งแต่ 7 ก.ค. 69 · คงเหลือ = ยกมา + รับเข้า − เบิกใช้ · ค่ายาเข้าบัญชีต้นทุนหมวด "ค่ายา+วัสดุสิ้นเปลือง" อัตโนมัติ</div>

      {/* 📅 สรุปค่ายารายเดือน (จากบันทึกให้ยา × ราคาสต๊อก) แยกต่อหลัง */}
      {Object.keys(medCostByMonth).length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, overflow: "auto", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: "#7a6f5c", padding: "12px 14px 4px" }}>📅 สรุปค่ายาที่ใช้จริงรายเดือน แยกต่อหลัง — ตัวเลขชุดนี้เท่านั้นที่เข้าบัญชีต้นทุน (จำนวนที่ให้จริง × ราคา)</div>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead><tr>
              <th style={{ padding: "8px 10px", fontSize: 12, fontWeight: 800, color: "#7a6f5c", background: "#F6F1E7", borderBottom: "2px solid #e6ddca", textAlign: "left" }}>เดือน</th>
              {houseIds.map((h) => <th key={h} style={{ padding: "8px 10px", fontSize: 12, fontWeight: 800, color: "#7a6f5c", background: "#F6F1E7", borderBottom: "2px solid #e6ddca", textAlign: "right" }}>{h} (บ.)</th>)}
              <th style={{ padding: "8px 10px", fontSize: 12, fontWeight: 800, color: "#7A4F16", background: "#F5E6CE", borderBottom: "2px solid #e6ddca", textAlign: "right" }}>รวม (บ.)</th>
            </tr></thead>
            <tbody>
              {Object.keys(medCostByMonth).sort().reverse().map((ym) => {
                const v = medCostByMonth[ym];
                const tdm = { padding: "8px 10px", fontSize: 13.5, textAlign: "right", borderBottom: "1px solid #eee7d8" };
                return (
                  <tr key={ym}>
                    <td style={{ ...tdm, textAlign: "left", fontWeight: 800 }}>{toThaiDate(ym + "-01").split(" ").slice(1).join(" ")}</td>
                    {houseIds.map((h) => <td key={h} style={tdm}>{v.byHouse[h] ? fmt(Math.round(v.byHouse[h])) : <span style={{ color: "#d6cdbb" }}>·</span>}</td>)}
                    <td style={{ ...tdm, fontWeight: 800, background: "#FDF8EE" }}>{fmt(Math.round(v.total))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detected.length > 0 && (
        <div style={{ background: "#F0FDFA", border: "1px solid #99F6E4", borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: "#0F766E", fontSize: 13, marginBottom: 7 }}>💊 ตรวจพบจากบันทึกยารายวัน — กดเพื่อดูผลได้ทันที ไม่ต้องกรอกซ้ำ</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {detected.map((s, i) => (
              <button key={i} onClick={() => {
                const t = { id: "tr" + Date.now() + i, name: s.name, houseId: s.hid, startDate: s.from, endDate: s.to, note: `จากบันทึกรายวัน · ให้ ${s.days} วัน` };
                addMedTrial(t); setViewTrial(t);
              }} style={{ border: "1.5px solid #0D9488", background: "#fff", color: "#0F766E", borderRadius: 999, padding: "6px 13px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                📊 {s.name} · {s.hid} · {toThaiDate(s.from, false)}{s.to !== s.from ? " – " + toThaiDate(s.to, false) : ""} ({s.days} วัน)
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* ฟอร์มเริ่มการทดลองใหม่ */}
        <div style={{ flex: "1 1 300px", background: "#FFF7EC", border: "1px solid #F5DEB9", borderRadius: 12, padding: "12px 12px 10px" }}>
          <div style={{ fontWeight: 800, color: ACCENT_DK, fontSize: 13, marginBottom: 8 }}>＋ เริ่มการทดลองใหม่</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1.6 }}><label style={lbl}>ยา/สารเสริมที่ให้</label><input style={inp} placeholder="เช่น Calcium+D3" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div style={{ flex: 0.7 }}><label style={lbl}>โรงเรือน</label><select style={inp} value={hid} onChange={(e) => setHid(e.target.value)}>{houseIds.map((h) => <option key={h}>{h}</option>)}</select></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><label style={lbl}>เริ่มให้วันที่</label><ThaiDateField value={from} onChange={setFrom} style={inp} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>ให้ถึงวันที่</label><ThaiDateField value={to} onChange={setTo} style={inp} /></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={lbl}>หมายเหตุ (เช่น กิน 5 วัน สัปดาห์ที่ 1)</label><input style={inp} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button disabled={!valid} onClick={() => { addMedTrial({ id: "tr" + Date.now(), name: name.trim(), houseId: hid, startDate: from, endDate: to, note: note.trim() }); setName(""); setFrom(""); setTo(""); setNote(""); }}
            style={{ ...S.primaryBtn, opacity: valid ? 1 : 0.5 }}>บันทึกการทดลอง</button>
        </div>
        {/* รายการทดลองทั้งหมด */}
        <div style={{ flex: "1.4 1 340px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#7a6f5c", marginBottom: 6 }}>🧪 การทดลองทั้งหมด · {medTrials.length} รายการ</div>
          {medTrials.length === 0 ? <div style={{ fontSize: 12.5, color: "#9b8e78", background: "#fff", border: "1px dashed #d8cdb6", borderRadius: 12, padding: "18px 14px", textAlign: "center" }}>ยังไม่มีการทดลอง — กรอกฟอร์มซ้าย หรือกดจากรายการ "ตรวจพบ"</div> : medTrials.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FDFAF3", border: "1px solid #eee3cd", borderRadius: 10, padding: "9px 11px", marginBottom: 7, fontSize: 13, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800 }}>🧪 {t.name}</span>
              <span style={{ fontWeight: 700, color: ACCENT_DK }}>{t.houseId}</span>
              <span style={{ color: "#9b8e78" }}>{toThaiDate(t.startDate, false)} – {toThaiDate(t.endDate, false)} ({dayCount(t)} วัน)</span>
              {t.note ? <span style={{ color: "#9b8e78" }}>· {t.note}</span> : null}
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button onClick={() => setViewTrial(t)} style={{ border: `1px solid ${ACCENT_DK}`, background: ACCENT_DK, color: "#fff", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontWeight: 800, fontSize: 12.5, fontFamily: "inherit" }}>📊 ดูผล / วินิจฉัย</button>
                <button onClick={() => { if (window.confirm(`ลบการทดลอง "${t.name}" ?`)) deleteMedTrial(t.id); }} style={{ border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontWeight: 800 }}>✕</button>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ประวัติการให้ยาจากบันทึกรายวัน */}
      <div style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, padding: "12px 14px", marginTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: "#7a6f5c", marginBottom: 8 }}>💊 บันทึกการให้ยาล่าสุด (จากแท็บ เก็บสถิติการเลี้ยง)</div>
        {medLog.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#9b8e78" }}>ยังไม่มีบันทึกยา — กรอกในหน้ากรอกรายวัน (ช่อง ยา/สารเสริม) แล้วจะโผล่ที่นี่</div>
        ) : medLog.map((x, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 2px", borderBottom: i < medLog.length - 1 ? "1px solid #f3eee1" : "none", fontSize: 13, flexWrap: "wrap" }}>
            <span style={{ color: "#9b8e78", whiteSpace: "nowrap" }}>{toThaiDate(x.date, false)}</span>
            <span style={{ fontWeight: 800, color: ACCENT_DK }}>{x.hid}</span>
            <span>{x.txt}</span>
          </div>
        ))}
      </div>

      {viewTrial && (
        <TrialResultModal trial={viewTrial} production={production} rearingByDate={rearingByDate} onClose={() => setViewTrial(null)} />
      )}
      {receiptItem && (
        <MedReceiptModal item={receiptItem} info={medInfo[(receiptItem.name || "").trim()]}
          onSave={(r) => { addMedReceipt(r); setReceiptItem(null); }} onClose={() => setReceiptItem(null)} />
      )}
      {showAddMed && (
        <AddMedModal onSave={(it) => { addMedItem(it); setShowAddMed(false); }} onClose={() => setShowAddMed(false)} />
      )}
    </div>
  );
}

/* รับยาเข้าสต๊อก — บันทึกวันที่/จำนวน/ผู้รับ ต่อยา 1 ตัว */
function MedReceiptModal({ item, info, onSave, onClose }) {
  const [date, setDate] = useState(isoFromTs(Date.now()));
  const [qty, setQty] = useState("");
  const [by, setBy] = useState("");
  const q = parseFloat(qty) || 0;
  const inp = { width: "100%", padding: "9px 10px", border: "1.5px solid #e3ddd0", borderRadius: 9, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: INK, marginBottom: 3 };
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>＋ รับยาเข้าสต๊อก</div><div style={S.modalSub}>{item.name} · คงเหลือ {fmt1(info?.remain ?? item.opening ?? 0)} {item.unit || "หน่วย"}</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>วันที่รับ</label><ThaiDateField value={date} onChange={setDate} style={inp} /></div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><label style={lbl}>จำนวน ({item.unit || "หน่วย"})</label><input style={{ ...inp, textAlign: "right", fontWeight: 700 }} inputMode="decimal" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} /></div>
          <div style={{ flex: 1.2 }}><label style={lbl}>ผู้รับ (ชื่อ)</label><input style={inp} placeholder="เช่น สมชาย" value={by} onChange={(e) => setBy(e.target.value)} /></div>
        </div>
        <button disabled={!(q > 0)} onClick={() => onSave({ id: "mr" + Date.now(), date, medId: item.id, qty: q, by: by.trim() })}
          style={{ ...S.primaryBtn, opacity: q > 0 ? 1 : 0.5 }}>บันทึกรับเข้า {q > 0 ? `${fmt1(q)} ${item.unit || "หน่วย"}` : ""}</button>
      </div>
    </div>
  );
}

/* เพิ่มยาตัวใหม่เข้าสต๊อก */
function AddMedModal({ onSave, onClose }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [unit, setUnit] = useState("ขวด");
  const [opening, setOpening] = useState("");
  const [price, setPrice] = useState("");
  const [company, setCompany] = useState("");
  const [expiry, setExpiry] = useState("");
  const valid = name.trim();
  const inp = { width: "100%", padding: "9px 10px", border: "1.5px solid #e3ddd0", borderRadius: 9, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: INK, marginBottom: 3 };
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>＋ เพิ่มยาใหม่เข้าสต๊อก</div><div style={S.modalSub}>ยอดตั้งต้นนับจากวันนี้ · สัตวบาลเลือกใช้ได้ทันทีในบันทึกรายวัน</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ marginBottom: 8 }}><label style={lbl}>ชื่อยา *</label><input style={inp} placeholder="เช่น เอ็นโรการ์ด 10% (1 ลิตร/ขวด)" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div style={{ marginBottom: 8 }}><label style={lbl}>สรรพคุณ/หมายเหตุ</label><input style={inp} placeholder="เช่น ยารักษาการติดเชื้อแทรกซ้อน" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 0.8 }}><label style={lbl}>หน่วย</label><select style={inp} value={unit} onChange={(e) => setUnit(e.target.value)}>{["ขวด", "กล่อง", "ถุง", "กก.", "ลิตร", "ซอง", "หน่วย"].map((u) => <option key={u}>{u}</option>)}</select></div>
          <div style={{ flex: 1 }}><label style={lbl}>ยอดตั้งต้น</label><input style={{ ...inp, textAlign: "right" }} inputMode="decimal" placeholder="0" value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^0-9.]/g, ""))} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>ราคา บาท/หน่วย</label><input style={{ ...inp, textAlign: "right" }} inputMode="decimal" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1.2 }}><label style={lbl}>บริษัท</label><input style={inp} value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>วันหมดอายุ</label><input style={inp} placeholder="เช่น 13/1/27" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
        </div>
        <button disabled={!valid} onClick={() => onSave({ id: "md" + Date.now(), name: name.trim(), desc: desc.trim(), unit, opening: parseFloat(opening) || 0, price: parseFloat(price) || null, company: company.trim(), mfg: "", expiry: expiry.trim(), since: isoFromTs(Date.now()) })}
          style={{ ...S.primaryBtn, opacity: valid ? 1 : 0.5 }}>เพิ่มเข้าสต๊อก</button>
      </div>
    </div>
  );
}

/* ============================================================
   หน้าจอ: บัญชีต้นทุน — ค่าใช้จ่าย 6 หมวด ระบุหลังได้ + สรุปรายเดือนต่อหมวด
============================================================ */
function CostView({ expenses = [], addExpense, deleteExpense, production = {}, medCostByMonth = {}, feedCostByMonth = {}, feedPrice = 0, bills = [] }) {
  const prodDates = Object.keys(production).sort();
  const houseIds = [...new Set([...(production[prodDates[prodDates.length - 1]] || []).map((h) => h.id), ...HOUSE_IDS])];   // รวมหลังใหม่ที่ยังไม่มีผลผลิต (เช่น H7)
  const [date, setDate] = useState(isoFromTs(Date.now()));
  const [cat, setCat] = useState(EXPENSE_CATS[0]);
  const [hid, setHid] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const amt = parseFloat(String(amount).replace(/,/g, "")) || 0;
  const valid = date && cat && amt > 0;
  const save = () => {
    if (!valid) return;
    addExpense({ id: "ex" + Date.now(), date, cat, houseId: hid, amount: amt, note: note.trim(), ts: Date.now() });
    setAmount(""); setNote("");
  };
  const monthKey = (d) => (d || "").slice(0, 7);                       // "2026-07"
  const monthTH = (mk) => { const [y, m] = mk.split("-").map(Number); return toThaiDate(`${mk}-01`).split(" ").slice(1).join(" "); };
  const thisMonth = monthKey(isoFromTs(Date.now()));
  // สรุปรายเดือน × หมวด — รวมอัตโนมัติ: ค่ายา (บันทึกให้ยา × ราคาสต๊อก) + ค่าอาหาร (กก.ที่กิน × ราคา/กก.)
  const byMonth = useMemo(() => {
    const m = {};
    const ensure = (mk) => (m[mk] = m[mk] || { total: 0, cats: {}, autoMed: 0, autoFeed: 0, autoFeedKg: 0 });
    expenses.forEach((x) => {
      const mk = monthKey(x.date); if (!mk) return;
      const b = ensure(mk);
      b.total += x.amount || 0;
      b.cats[x.cat] = (b.cats[x.cat] || 0) + (x.amount || 0);
    });
    Object.entries(medCostByMonth).forEach(([mk, v]) => {
      if (!v.total) return;
      const b = ensure(mk);
      b.total += v.total;
      b.cats["ค่ายา+วัสดุสิ้นเปลือง"] = (b.cats["ค่ายา+วัสดุสิ้นเปลือง"] || 0) + v.total;
      b.autoMed = v.total;
    });
    Object.entries(feedCostByMonth).forEach(([mk, v]) => {
      if (!v.total) return;
      const b = ensure(mk);
      b.total += v.total;
      b.cats["ค่าอาหาร"] = (b.cats["ค่าอาหาร"] || 0) + v.total;
      b.autoFeed = v.total; b.autoFeedKg = v.kg || 0;
    });
    return m;
  }, [expenses, medCostByMonth, feedCostByMonth]);

  // ---------- รายงานต้นทุนไข่รายเดือน (ตามวิธีบัญชีปัจจุบัน: ต้นทุน/ฟอง = รวมค่าใช้จ่าย ÷ ฟองรับเข้า) ----------
  // อัตราคิดต่อฟอง (แก้ได้): ค่าสายพันธุ์ 0.5 บ./ฟอง · ค่าเสื่อมโรงเรือน 0.30 บ./ฟอง — คิดจากฟองรับเข้าอัตโนมัติ
  const [rates, setRates] = useState(() => { try { return { breed: 0.5, depre: 0.3, ...JSON.parse(localStorage.getItem("eggCostRates") || "{}") }; } catch { return { breed: 0.5, depre: 0.3 }; } });
  useEffect(() => { try { localStorage.setItem("eggCostRates", JSON.stringify(rates)); } catch {} }, [rates]);
  // ฟองรับเข้าต่อเดือน = จากหน้าผลผลิต (Σ เบอร์ฟอง + ตกเกรดแผง×30) — ตรงกับ "จำนวนฟอง" ในชีต
  const eggsByMonth = useMemo(() => {
    const m = {};
    Object.entries(production).forEach(([d, houses]) => {
      const ym = monthKey(d);
      (houses || []).forEach((h) => {
        const good = Object.values(h.grade?.เบอร์ || {}).reduce((s, v) => s + (+v || 0), 0);
        const off = Object.values(h.grade?.ตกเกรด || {}).reduce((s, v) => s + (+v || 0), 0);
        m[ym] = (m[ym] || 0) + good + off * PER_PRADANG;
      });
    });
    return m;
  }, [production]);
  // รายได้ค่าไข่ต่อเดือน (จากบิลจริง — เฉพาะค่าไข่ ไม่รวมมัดจำ/ค่าส่ง) — ตรงกับ "จำนวนเงิน" ในชีต
  const revenueByMonth = useMemo(() => {
    const m = {};
    (bills || []).forEach((b) => { const ym = monthKey(b.workDay || isoFromTs(b.ts || 0)); m[ym] = (m[ym] || 0) + (b.eggTotal || 0); });
    return m;
  }, [bills]);
  // สรุปเต็มของเดือน: ค่าใช้จ่ายทุกหมวด (กรอกเอง + ยาอัตโนมัติ + อัตรา×ฟอง) → ต้นทุน/ฟอง + กำไร
  const monthReport = (ym) => {
    const eggs = eggsByMonth[ym] || 0;
    const bm = byMonth[ym] || { total: 0, cats: {}, autoMed: 0 };
    const breedAuto = eggs * (rates.breed || 0);
    const depreAuto = eggs * (rates.depre || 0);
    const lines = EXPENSE_CATS.map((c) => {
      let amt = bm.cats[c] || 0, note = "";
      if (c === "ค่าสายพันธุ์") { amt += breedAuto; note = `อัตโนมัติ ${rates.breed} บ./ฟอง × ${fmt(eggs)} ฟอง`; }
      if (c === "ค่าเสื่อมโรงเรือน") { amt += depreAuto; note = `อัตโนมัติ ${rates.depre} บ./ฟอง × ${fmt(eggs)} ฟอง`; }
      if (c === "ค่ายา+วัสดุสิ้นเปลือง" && bm.autoMed) note = `รวมค่ายาจากบันทึกรายวัน ${fmt(Math.round(bm.autoMed))} บ.`;
      if (c === "ค่าอาหาร" && bm.autoFeed) note = `รวมอัตโนมัติ ${fmt1(bm.autoFeedKg)} กก. × ${feedPrice} บ./กก. = ${fmt(Math.round(bm.autoFeed))} บ.`;
      return { cat: c, amt, note };
    });
    const total = lines.reduce((s, l) => s + l.amt, 0);
    const revenue = revenueByMonth[ym] || 0;
    return { eggs, lines, total, costPerEgg: eggs ? total / eggs : null, revenue, profit: revenue - total };
  };
  const repMonths = [...new Set([...Object.keys(eggsByMonth), ...Object.keys(byMonth), ...Object.keys(revenueByMonth)])].sort();
  const [repMonth, setRepMonth] = useState(() => monthKey(isoFromTs(Date.now())));
  const repIdx = repMonths.indexOf(repMonth);
  const rep = monthReport(repMonth);
  const months = Object.keys(byMonth).sort().reverse();
  const curM = byMonth[thisMonth] || { total: 0, cats: {} };
  const topCat = Object.entries(curM.cats).sort((a, b) => b[1] - a[1])[0];
  const recent = expenses.slice(0, 20);
  const inp = { width: "100%", padding: "9px 10px", border: "1.5px solid #e3ddd0", borderRadius: 9, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: INK, marginBottom: 3 };
  const th = { padding: "9px 10px", fontSize: 12, fontWeight: 800, color: "#7a6f5c", background: "#F6F1E7", borderBottom: "2px solid #e6ddca", whiteSpace: "nowrap", textAlign: "right" };
  const td = { padding: "9px 10px", fontSize: 13.5, textAlign: "right", borderBottom: "1px solid #eee7d8", whiteSpace: "nowrap" };
  const card = (label, value, color) => (
    <div style={{ flex: 1, minWidth: 150, background: "#fff", border: "1px solid #eee3cd", borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#9b8e78" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || INK }}>{value}</div>
    </div>
  );
  return (
    <div style={{ padding: "18px 22px 40px" }}>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>บัญชีต้นทุน 💰</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {card(`ต้นทุนเดือนนี้ (${monthTH(thisMonth)})`, fmt(Math.round(curM.total)) + " บ.", "#B91C1C")}
        {card("หมวดสูงสุดเดือนนี้", topCat ? `${topCat[0]} · ${fmt(Math.round(topCat[1]))} บ.` : "—")}
        {card("รายการทั้งหมด", fmt(expenses.length) + " รายการ")}
      </div>

      {/* 🧮 รายงานต้นทุนไข่รายเดือน — ตามแบบบัญชีที่ทำอยู่: ต้นทุน/ฟอง = รวมค่าใช้จ่าย ÷ ฟองรับเข้า */}
      <div style={{ background: "#fff", border: `2px solid ${ACCENT}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 15.5, color: INK }}>🧮 ต้นทุนไข่ไก่ · {monthTH(repMonth)}</span>
          <span style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
            <button onClick={() => { if (!repMonths.length) return; if (repIdx === -1) setRepMonth(repMonths[repMonths.length - 1]); else if (repIdx > 0) setRepMonth(repMonths[repIdx - 1]); }} disabled={!repMonths.length || repIdx === 0}
              style={{ padding: "5px 11px", border: `1px solid ${ACCENT}`, background: "#fff", color: repIdx === 0 ? "#c9c0ad" : ACCENT_DK, borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>‹</button>
            <button onClick={() => { if (repIdx >= 0 && repIdx < repMonths.length - 1) setRepMonth(repMonths[repIdx + 1]); }} disabled={repIdx < 0 || repIdx >= repMonths.length - 1}
              style={{ padding: "5px 11px", border: `1px solid ${ACCENT}`, background: "#fff", color: (repIdx < 0 || repIdx >= repMonths.length - 1) ? "#c9c0ad" : ACCENT_DK, borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>›</button>
          </span>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "stretch" }}>
          {/* ซ้าย: รายการค่าใช้จ่าย 6 หมวด (กรอกเอง + อัตโนมัติ) */}
          <div style={{ flex: "1.4 1 340px" }}>
            {rep.lines.map((l) => (
              <div key={l.cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "6px 4px", borderBottom: "1px solid #f3eee1", fontSize: 13.5 }}>
                <span style={{ fontWeight: 700 }}>{l.cat}{l.note ? <span style={{ fontWeight: 500, fontSize: 11, color: "#9b8e78" }}> · {l.note}</span> : null}</span>
                <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{l.amt ? fmt2(l.amt) : "—"}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 4px", fontSize: 14.5, fontWeight: 800, color: "#7A4F16", background: "#FDF5E6", borderRadius: 8, marginTop: 6 }}>
              <span>รวมค่าใช้จ่ายทั้งหมด</span><span>{fmt2(rep.total)} บาท</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "#7a6f5c" }}>
              <span style={{ fontWeight: 700 }}>อัตราคิดต่อฟอง:</span>
              <span>สายพันธุ์</span>
              <input inputMode="decimal" value={rates.breed} onChange={(e) => setRates((p) => ({ ...p, breed: parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0 }))}
                style={{ width: 52, padding: "3px 6px", border: "1px solid #e0d7c3", borderRadius: 6, textAlign: "right", fontSize: 12, fontFamily: "inherit", fontWeight: 700 }} />
              <span>บ./ฟอง · ค่าเสื่อมโรงเรือน</span>
              <input inputMode="decimal" value={rates.depre} onChange={(e) => setRates((p) => ({ ...p, depre: parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0 }))}
                style={{ width: 52, padding: "3px 6px", border: "1px solid #e0d7c3", borderRadius: 6, textAlign: "right", fontSize: 12, fontFamily: "inherit", fontWeight: 700 }} />
              <span>บ./ฟอง</span>
            </div>
          </div>
          {/* ขวา: ผลลัพธ์ ต้นทุน/ฟอง + กำไร */}
          <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: "#FAF6EE", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#7a6f5c" }}>ฟองรับเข้า (จากหน้าผลผลิต)</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{fmt(rep.eggs)} <span style={{ fontSize: 11.5, fontWeight: 600 }}>ฟอง</span></span>
            </div>
            <div style={{ background: "#15803D", color: "#fff", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.9 }}>ต้นทุนต่อฟอง = รวมค่าใช้จ่าย ÷ ฟองรับเข้า</div>
              <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.25 }}>{rep.costPerEgg != null ? fmt2(rep.costPerEgg) : "—"} <span style={{ fontSize: 15 }}>บาท/ฟอง</span></div>
              {rep.costPerEgg != null && <div style={{ fontSize: 11.5, opacity: 0.85 }}>({fmt2(rep.total)} ÷ {fmt(rep.eggs)})</div>}
            </div>
            <div style={{ background: "#FAF6EE", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><span style={{ color: "#7a6f5c", fontWeight: 700 }}>รายได้ค่าไข่ (จากบิลขาย)</span><span style={{ fontWeight: 700 }}>{rep.revenue ? fmt2(rep.revenue) : "—"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#7a6f5c", fontWeight: 700 }}>กำไร (รายได้ − ต้นทุน)</span>
                <span style={{ fontWeight: 800, color: rep.profit >= 0 ? "#15803D" : "#B91C1C" }}>{rep.revenue || rep.total ? (rep.profit >= 0 ? "+" : "") + fmt2(rep.profit) : "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        {/* ฟอร์มกรอกค่าใช้จ่าย */}
        <div style={{ flex: "1 1 300px", background: "#FFF7EC", border: "1px solid #F5DEB9", borderRadius: 12, padding: "12px 12px 10px" }}>
          <div style={{ fontWeight: 800, color: ACCENT_DK, fontSize: 13, marginBottom: 8 }}>＋ บันทึกค่าใช้จ่าย</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1.2 }}><label style={lbl}>วันที่</label><ThaiDateField value={date} onChange={setDate} style={inp} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>หมวด</label><select style={inp} value={cat} onChange={(e) => setCat(e.target.value)}>{EXPENSE_CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><label style={lbl}>โรงเรือน</label><select style={inp} value={hid} onChange={(e) => setHid(e.target.value)}><option value="">ทั้งฟาร์ม</option>{houseIds.map((h) => <option key={h} value={h}>{h}</option>)}</select></div>
            <div style={{ flex: 1 }}><label style={lbl}>จำนวนเงิน (บาท)</label><input style={{ ...inp, textAlign: "right", fontWeight: 700 }} inputMode="decimal" placeholder="0"
              value={amount} onChange={(e) => { const raw = e.target.value.replace(/[^0-9.]/g, ""); setAmount(raw ? Number(raw).toLocaleString("en-US", { maximumFractionDigits: 2 }) : ""); }} /></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={lbl}>หมายเหตุ (เช่น ค่าไฟเดือน มิ.ย. หลัง 2)</label><input style={inp} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button disabled={!valid} onClick={save} style={{ ...S.primaryBtn, opacity: valid ? 1 : 0.5 }}>บันทึก {cat}{amt > 0 ? ` · ${fmt(Math.round(amt))} บาท` : ""}</button>
        </div>

        {/* สรุปรายเดือน × หมวด */}
        <div style={{ flex: "2 1 420px", background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>เดือน</th>
              {EXPENSE_CATS.map((c) => <th key={c} style={th}>{c.replace("ค่า", "")}</th>)}
              <th style={{ ...th, background: "#F5E6CE" }}>รวม</th>
            </tr></thead>
            <tbody>
              {months.length === 0 ? (
                <tr><td colSpan={EXPENSE_CATS.length + 2} style={{ ...td, textAlign: "center", color: "#9b8e78", padding: 26 }}>ยังไม่มีค่าใช้จ่าย — เริ่มบันทึกจากฟอร์มซ้าย</td></tr>
              ) : months.map((mk) => (
                <tr key={mk} style={mk === thisMonth ? { background: "#FFFBF2" } : undefined}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{monthTH(mk)}{mk === thisMonth ? " ←" : ""}</td>
                  {EXPENSE_CATS.map((c) => {
                    const autoMed = c === "ค่ายา+วัสดุสิ้นเปลือง" ? (byMonth[mk].autoMed || 0) : 0;
                    const autoFeed = c === "ค่าอาหาร" ? (byMonth[mk].autoFeed || 0) : 0;
                    const tip = autoMed ? `รวมค่ายาอัตโนมัติจากบันทึกการให้ยา ${fmt(Math.round(autoMed))} บ.`
                      : autoFeed ? `รวมค่าอาหารอัตโนมัติ ${fmt1(byMonth[mk].autoFeedKg)} กก. × ${feedPrice} บ./กก. = ${fmt(Math.round(autoFeed))} บ.` : undefined;
                    return <td key={c} style={td} title={tip}>
                      {byMonth[mk].cats[c] ? <>{fmt(Math.round(byMonth[mk].cats[c]))}{autoMed ? <span style={{ fontSize: 10 }}> 💊</span> : null}{autoFeed ? <span style={{ fontSize: 10 }}> 🌾</span> : null}</> : <span style={{ color: "#d6cdbb" }}>·</span>}
                    </td>;
                  })}
                  <td style={{ ...td, fontWeight: 800, background: "#FDF8EE" }}>{fmt(Math.round(byMonth[mk].total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* รายการล่าสุด */}
      <div style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, padding: "12px 14px" }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: "#7a6f5c", marginBottom: 8 }}>รายการล่าสุด</div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#9b8e78" }}>ยังไม่มีรายการ</div>
        ) : recent.map((x) => (
          <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FDFAF3", border: "1px solid #eee3cd", borderRadius: 9, padding: "7px 10px", marginBottom: 6, fontSize: 13, flexWrap: "wrap" }}>
            <span style={{ color: "#9b8e78" }}>{toThaiDate(x.date, false)}</span>
            <span style={{ fontWeight: 800 }}>{x.cat}</span>
            <span style={{ fontWeight: 700, color: ACCENT_DK }}>{x.houseId || "ทั้งฟาร์ม"}</span>
            <span style={{ fontWeight: 800, color: "#B91C1C" }}>{fmt(Math.round(x.amount))} บ.</span>
            {x.note ? <span style={{ color: "#9b8e78" }}>· {x.note}</span> : null}
            <button onClick={() => { if (window.confirm(`ลบรายการ "${x.cat} ${fmt(Math.round(x.amount))} บ." ?`)) deleteExpense(x.id); }} title="ลบรายการ" style={{ marginLeft: "auto", border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 7, padding: "2px 8px", cursor: "pointer", fontWeight: 800 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={S.hint}>6 หมวดตามแผนต้นทุน: ค่าไฟ · ค่าแรง · ค่าอาหาร · ค่ายา+วัสดุสิ้นเปลือง · ค่าสายพันธุ์ · ค่าเสื่อมโรงเรือน — <b>อัตโนมัติ 4 หมวด:</b> 💊 ค่ายา (บันทึกให้ยา × ราคาสต๊อก) · 🌾 ค่าอาหาร (กก.ที่กินจากบันทึกการเลี้ยง × ราคาอาหาร — ตั้งราคาในแท็บ อาหารไก่{feedPrice ? ` · ตอนนี้ ${feedPrice} บ./กก.` : " · ยังไม่ตั้งราคา"}) · ค่าสายพันธุ์+ค่าเสื่อม (อัตรา × ฟองรับเข้า) — <b>กรอกเองแค่ ค่าไฟ กับ ค่าแรง เดือนละครั้ง</b></div>
    </div>
  );
}

function RearingView({ rearingByDate = {}, saveRearing, flocks = {}, saveFlock, production = {}, medTrials = [], medStock = [], medInfo = {}, vaccines = {}, addVaccine, deleteVaccine, labTests = {}, addLabTest, deleteLabTest }) {
  const prodDates = Object.keys(production).sort();
  const houseIds = [...new Set([...(production[prodDates[prodDates.length - 1]] || []).map((h) => h.id), ...HOUSE_IDS])];   // รวมหลังใหม่ที่ยังไม่มีผลผลิต (เช่น H7)
  const rearDates = Object.keys(rearingByDate).sort();
  const [mode, setMode] = useState("house");          // "house" = สมุดรายหลัง (หลังละ 1 หน้า เหมือนฟอร์มกระดาษ) | "day" = รายวันทุกหลัง
  const [selHouse, setSelHouse] = useState(houseIds[0] || "H2");
  const [day, setDay] = useState(() => rearDates[rearDates.length - 1] || prodDates[prodDates.length - 1] || isoFromTs(Date.now()));
  const [editHouse, setEditHouse] = useState(null);   // {hid, date} ที่กำลังกรอก
  const [flockHouse, setFlockHouse] = useState(null); // houseId ที่กำลังตั้งค่ารุ่น
  const [vacHouse, setVacHouse] = useState(null);     // houseId ที่กำลังเปิดสมุดวัคซีน
  const [labHouse, setLabHouse] = useState(null);     // houseId ที่กำลังเปิดสมุดผลตรวจแล็บ
  const [afterFlock, setAfterFlock] = useState(null); // วันแรกของรุ่น: เซฟหน้ารุ่นเสร็จ → เปิดหน้ากรอกรายวันต่อทันที ({hid,date})
  // เกณฑ์เตือนอาหารใกล้หมด (กก./ไซโล) — จัดการในแท็บ "อาหารไก่" ; ที่นี่ใช้ไฮไลต์ในตาราง + ส่งให้ฟอร์มกรอก
  const [feedMin] = useState(() => { const v = parseFloat(localStorage.getItem("eggFeedAlertMin")); return isNaN(v) ? 4000 : v; });
  // ไซโลที่ "ใช้งานจริง" (เคยบันทึกรับ/ใช้) — ใช้ไฮไลต์แดงเมื่อคงเหลือต่ำกว่าเกณฑ์ในตารางสมุด
  const siloAct = useMemo(() => {
    const m = {};
    houseIds.forEach((hid) => { m[hid] = { s1: false, s2: false }; });
    Object.keys(rearingByDate).forEach((d) => {
      Object.keys(rearingByDate[d] || {}).forEach((hid) => {
        const f = rearingByDate[d][hid]?.feed; if (!f || !m[hid]) return;
        if (nf(f.s1recv) || nf(f.s1used)) m[hid].s1 = true;
        if (nf(f.s2recv) || nf(f.s2used)) m[hid].s2 = true;
      });
    });
    return m;
  }, [rearingByDate, houseIds.join(",")]);
  const trialOfDay = (hid, d) => medTrials.find((t) => t.houseId === hid && d >= t.startDate && d <= t.endDate);   // 🧪 มาร์กวันในตาราง (จัดการทดลองในแท็บ ยาและวิตามิน)

  // 📝 "กรอกรอบเดียวจบ": พากรอกทีละหลังต่อเนื่อง H2→H6 อัตโนมัติ (บันทึก/ข้าม แล้วเด้งหลังถัดไปเอง)
  const [round, setRound] = useState(null);   // {date, idx}
  const roundDate = (() => {
    const last = rearDates[rearDates.length - 1];
    if (last && houseIds.some((h) => !rearingByDate[last]?.[h])) return last;   // วันล่าสุดยังกรอกไม่ครบ → ทำวันนั้นต่อ
    return last ? shiftDayISO(last, 1) : (prodDates[prodDates.length - 1] || isoFromTs(Date.now()));
  })();
  const startRound = () => { if (!houseIds.length) return; setRound({ date: roundDate, idx: 0 }); setEditHouse({ hid: houseIds[0], date: roundDate }); };
  const advanceRound = () => {
    setRound((r) => {
      if (!r) { setEditHouse(null); return null; }
      const nextIdx = r.idx + 1;
      if (nextIdx >= houseIds.length) { setEditHouse(null); return null; }   // ครบทุกหลังแล้ว
      setEditHouse({ hid: houseIds[nextIdx], date: r.date });
      return { ...r, idx: nextIdx };
    });
  };
  const dayTH = toThaiDate(day);
  const dayData = rearingByDate[day] || {};
  // แนะนำจำนวนเริ่มเลี้ยงจากยอดไก่ในหน้าผลผลิต (วันแรกสุดที่มีข้อมูลของหลังนั้น)
  const suggestStart = (hid) => { for (const d of prodDates) { const h = (production[d] || []).find((x) => x.id === hid); if (h && h.chickens) return h.chickens; } return null; };
  const th = { padding: "8px 6px", fontSize: 12, fontWeight: 800, color: "#7a6f5c", background: "#F6F1E7", borderBottom: "2px solid #e6ddca", whiteSpace: "nowrap", textAlign: "right" };
  const td = { padding: "8px 6px", fontSize: 13.5, textAlign: "right", borderBottom: "1px solid #eee7d8", whiteSpace: "nowrap" };
  const rows = houseIds.map((hid) => {
    const r = dayData[hid];
    const fl = flocks[hid];
    const cum = rearingCum(rearingByDate, hid, day, fl);
    const remainBirds = fl?.startCount ? fl.startCount - cum.total : null;
    const silo = feedRemain(rearingByDate, hid, day, fl);
    const deadToday = r ? nf(r.loss?.deadAm) + nf(r.loss?.deadPm) : 0;
    const deadWt = r ? nf(r.loss?.deadWt) : 0;   // นน.ไก่ตายชั่งรวม (กก.)
    const feedUsed = r ? nf(r.feed?.s1used) + nf(r.feed?.s2used) : 0;
    const water = waterUsage(rearingByDate, hid, day);
    return {
      hid, r, fl, cum, remainBirds, silo, deadToday, deadWt, feedUsed, water,
      ageWk: flockAgeWk(fl, day),
      pctDead: fl?.startCount ? (cum.dead / fl.startCount) * 100 : null,
      // กินเฉลี่ย (กรัม/ตัว) = กินรวมวันนี้(กก.)×1000 ÷ ไก่คงเหลือ — ยังไม่ตั้งรุ่น → ใช้ยอดไก่จากหน้าผลผลิตแทน
      gPerBird: (() => { const birds = remainBirds != null ? remainBirds : prodChickens(production, hid, day); return r && birds ? (feedUsed * 1000) / birds : null; })(),
    };
  });
  const sum = (f) => rows.reduce((s, x) => s + (f(x) || 0), 0);
  const chip = (active) => ({ padding: "6px 13px", borderRadius: 999, border: `1.5px solid ${active ? ACCENT_DK : "#e0d7c3"}`, background: active ? ACCENT_DK : "#fff", color: active ? "#fff" : "#7a6f5c", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" });

  /* ---------- โหมด "สมุดรายหลัง" (หลังละ 1 หน้า เหมือนฟอร์มกระดาษ) ---------- */
  const fl = flocks[selHouse];
  const hDays = rearDates.filter((d) => rearingByDate[d]?.[selHouse]);
  const lastRecDay = hDays[hDays.length - 1];
  const newDay = lastRecDay ? shiftDayISO(lastRecDay, 1) : (prodDates[prodDates.length - 1] || isoFromTs(Date.now()));
  const calcDay = (d) => {
    const r = rearingByDate[d]?.[selHouse];
    const cum = rearingCum(rearingByDate, selHouse, d, fl);
    const remain = fl?.startCount ? fl.startCount - cum.total : null;
    const silo = feedRemain(rearingByDate, selHouse, d, fl);
    const deadToday = nf(r?.loss?.deadAm) + nf(r?.loss?.deadPm);
    const deadWt = nf(r?.loss?.deadWt);   // นน.ไก่ตายชั่งรวม (กก.)
    const feedUsed = nf(r?.feed?.s1used) + nf(r?.feed?.s2used);
    return {
      d, r, cum, remain, silo, deadToday, deadWt, feedUsed,
      // อาหารยกมาต้นวัน ต่อไซโล = ที่กรอกไว้ (sNopen) หรือยอดทดจากวันก่อน
      feedOpen: (() => { const prev = feedRemain(rearingByDate, selHouse, shiftDayISO(d, -1), fl); return { s1: r?.feed?.s1open !== "" && r?.feed?.s1open != null ? nf(r.feed.s1open) : prev.s1, s2: r?.feed?.s2open !== "" && r?.feed?.s2open != null ? nf(r.feed.s2open) : prev.s2 }; })(),
      feedRecv: nf(r?.feed?.s1recv) + nf(r?.feed?.s2recv),
      water: waterUsage(rearingByDate, selHouse, d),
      ageWk: flockAgeWk(fl, d),
      pctDead: fl?.startCount ? (cum.dead / fl.startCount) * 100 : null,
      // กินเฉลี่ย (กรัม/ตัว) — ยังไม่ตั้งรุ่น → ใช้ยอดไก่จากหน้าผลผลิตแทน
      gPerBird: (() => { const birds = remain != null ? remain : prodChickens(production, selHouse, d); return birds ? (feedUsed * 1000) / birds : null; })(),
    };
  };
  // จัดกลุ่มเป็นสัปดาห์ (ตามอายุไก่ ถ้าตั้งรุ่นแล้ว; ไม่งั้นตามเดือนปฏิทิน) → แทรกแถว "ผลรวม" แบบฟอร์มกระดาษ
  const weekKey = (d) => { const w = flockAgeWk(fl, d); return w != null ? "สัปดาห์อายุ " + w : "เดือน " + toThaiDate(d).split(" ").slice(1).join(" "); };
  const bookRows = [];
  {
    let grp = [], key = null;
    const flush = () => { if (grp.length) bookRows.push({ type: "sum", key, items: grp }); grp = []; };
    hDays.forEach((d) => { const k = weekKey(d); if (key !== null && k !== key) flush(); key = k; const c = calcDay(d); bookRows.push({ type: "day", ...c }); grp.push(c); });
    flush();
  }
  const gsum = (items, f) => items.reduce((s, x) => s + (f(x) || 0), 0);
  const cumAll = rearingCum(rearingByDate, selHouse, "9999-12-31", fl);
  const remainNow = fl?.startCount ? fl.startCount - cumAll.total : null;
  const statCard = (label, value, color) => (
    <div style={{ flex: 1, minWidth: 130, background: "#fff", border: "1px solid #eee3cd", borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#9b8e78" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || INK }}>{value}</div>
    </div>
  );

  return (
    <div style={{ padding: "18px 22px 40px" }}>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>การเลี้ยงไก่ไข่{mode === "house" ? <span style={{ fontSize: 30, verticalAlign: "middle", color: ACCENT_DK }}> · โรงเรือน {selHouse}</span> : ` · ${dayTH}`}{rearDates.length > 0 ? <span style={{ fontSize: 12.5, fontWeight: 600, color: "#9b8e78" }}> · บันทึกแล้ว {rearDates.length} วัน</span> : null}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={startRound} title="กรอกการเลี้ยงครบทุกโรงเรือนต่อเนื่อง ไม่ต้องสลับหน้า"
            style={{ padding: "7px 15px", borderRadius: 999, border: "1.5px solid #15803D", background: "#16A34A", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            📝 กรอกทุกหลัง · {toThaiDate(roundDate, false)} ▸
          </button>
          <button style={chip(mode === "house")} onClick={() => setMode("house")}>📒 สมุดรายหลัง</button>
          <button style={chip(mode === "day")} onClick={() => setMode("day")}>ทุกหลัง · รายวัน</button>
          {mode === "day" && <>
            <button onClick={() => setDay(shiftDayISO(day, -1))} title="วันก่อนหน้า" style={{ padding: "6px 11px", border: `1px solid ${ACCENT}`, background: "#fff", color: ACCENT_DK, borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>‹</button>
            <ThaiDateField value={day} onChange={setDay} style={{ padding: "7px 11px", border: `1px solid ${ACCENT}`, borderRadius: 8, fontSize: 13.5, background: "#fff", color: INK, fontWeight: 700 }} />
            <button onClick={() => setDay(shiftDayISO(day, 1))} title="วันถัดไป" style={{ padding: "6px 11px", border: `1px solid ${ACCENT}`, background: "#fff", color: ACCENT_DK, borderRadius: 8, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>›</button>
          </>}
        </div>
      </div>

      {mode === "house" && (
        <div>
          {/* เลือกโรงเรือน — หลังละ 1 หน้า */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {houseIds.map((h) => <button key={h} style={chip(selHouse === h)} onClick={() => setSelHouse(h)}>{h}</button>)}
          </div>
          {/* หัวสมุด: ข้อมูลรุ่นการเลี้ยงของหลังนี้ */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "stretch" }}>
            {statCard("รุ่นที่ / ฝูงที่", fl?.gen ? `${fl.gen}${fl.flock ? " / " + fl.flock : ""}` : "—")}
            {statCard("จำนวนเริ่มเลี้ยง", fl?.startCount ? fmt(fl.startCount) + " ตัว" : "—")}
            {statCard("วันที่เริ่มเลี้ยง · อายุรับเข้า", fl?.startDate ? `${toThaiDate(fl.startDate, false)} · ${fl.startAgeWk ?? "—"} สป.` : "—")}
            {statCard("อายุวันนี้", (() => { const a = flockAgeWk(fl, isoFromTs(Date.now())); return a != null ? a + " สัปดาห์" : "—"; })())}
            {statCard("ตายสะสม", fmt(cumAll.dead) + (fl?.startCount ? ` (${((cumAll.dead / fl.startCount) * 100).toFixed(2)}%)` : ""), cumAll.dead > 0 ? "#B91C1C" : undefined)}
            {statCard("ไก่คงเหลือ", remainNow != null ? fmt(remainNow) + " ตัว" : "ตั้งรุ่นก่อน", "#15803D")}
            <button onClick={() => setFlockHouse(selHouse)} style={{ alignSelf: "center", border: "1px solid #d8cdb6", background: "#fff", color: "#7a6f5c", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontSize: 13, fontWeight: 800, fontFamily: "inherit" }}>✎ ตั้งค่ารุ่น</button>
            <button onClick={() => setVacHouse(selHouse)} style={{ alignSelf: "center", border: "1px solid #d8cdb6", background: "#fff", color: "#7a6f5c", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontSize: 13, fontWeight: 800, fontFamily: "inherit" }}>💉 วัคซีน{(vaccines[selHouse] || []).length > 0 ? ` · ${(vaccines[selHouse] || []).length}` : ""}</button>
            <button onClick={() => setLabHouse(selHouse)} style={{ alignSelf: "center", border: "1px solid #d8cdb6", background: "#fff", color: "#7a6f5c", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontSize: 13, fontWeight: 800, fontFamily: "inherit" }}>🧪 ผลตรวจ{(labTests[selHouse] || []).length > 0 ? ` · ${(labTests[selHouse] || []).length}` : ""}</button>
          </div>
          {/* ปุ่มกรอกวันถัดไป */}
          <div style={{ marginBottom: 12 }}>
            <button onClick={() => {
              if (!fl) { setAfterFlock({ hid: selHouse, date: newDay }); setFlockHouse(selHouse); }   // วันแรกที่เริ่มเลี้ยง → กรอกหน้ารุ่นก่อน แล้วต่อหน้ากรอกรายวัน
              else setEditHouse({ hid: selHouse, date: newDay });
            }} style={{ ...S.primaryBtn, width: "auto", padding: "10px 18px", fontSize: 14.5 }}>＋ กรอกวันถัดไป · {toThaiDate(newDay, false)}{!fl ? " (เริ่มรุ่นใหม่ — กรอกข้อมูลรุ่นก่อน)" : ""}</button>
          </div>

          {hDays.length === 0 ? (
            <div style={{ background: "#fff", border: "1px dashed #d8cdb6", borderRadius: 14, padding: "34px 20px", textAlign: "center", color: "#9b8e78", fontWeight: 600 }}>
              ยังไม่มีบันทึกการเลี้ยงของโรงเรือน {selHouse} — กด "＋ กรอกวันถัดไป" เพื่อเริ่มหน้าแรกของสมุด
            </div>
          ) : (
            <div style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1150 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>วันที่</th>
                    <th style={th}>อายุ (สป.)</th>
                    <th style={th}>ไฟ (ชม.)</th>
                    <th style={th}>แสง Lux</th>
                    <th style={th}>ไก่คัด</th>
                    <th style={th}>ตายเช้า</th>
                    <th style={th}>ตายบ่าย</th>
                    <th style={th}>ตายรวม</th>
                    <th style={th}>นน.ตาย (กก.)</th>
                    <th style={th}>กก./ตัว</th>
                    <th style={th}>สะสม</th>
                    <th style={th}>%ตายสะสม</th>
                    <th style={{ ...th, color: "#15803D" }}>คงเหลือ (ตัว)</th>
                    <th style={th}>เบอร์อาหาร</th>
                    <th style={th}>อาหารยกมา (กก.)</th>
                    <th style={th}>รับอาหาร (กก.)</th>
                    <th style={th}>ใช้ไป (กก.)</th>
                    <th style={th}>คงเหลือไซโล</th>
                    <th style={th}>กินเฉลี่ย (กรัม/ตัว)</th>
                    <th style={th}>น้ำ (ยูนิต)</th>
                    <th style={{ ...th, textAlign: "left" }}>ยา/วัคซีน · หมายเหตุ</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {bookRows.map((b, i) => b.type === "sum" ? (
                    <tr key={"s" + i} style={{ background: "#F6F1E7", fontWeight: 800 }}>
                      <td style={{ ...td, textAlign: "left", color: "#7a6f5c" }}>ผลรวม · {b.key}</td>
                      <td style={td} /><td style={td} /><td style={td} />
                      <td style={td}>{fmt(gsum(b.items, (x) => nf(x.r?.loss?.cull)))}</td>
                      <td style={td}>{fmt(gsum(b.items, (x) => nf(x.r?.loss?.deadAm)))}</td>
                      <td style={td}>{fmt(gsum(b.items, (x) => nf(x.r?.loss?.deadPm)))}</td>
                      <td style={{ ...td, color: "#B91C1C" }}>{fmt(gsum(b.items, (x) => x.deadToday))}</td>
                      <td style={td}>{fmt2(gsum(b.items, (x) => x.deadWt))}</td>
                      <td style={td}>{gsum(b.items, (x) => x.deadToday) > 0 && gsum(b.items, (x) => x.deadWt) > 0 ? fmt2(gsum(b.items, (x) => x.deadWt) / gsum(b.items, (x) => x.deadToday)) : ""}</td>
                      <td style={td} /><td style={td} />
                      <td style={{ ...td, color: "#15803D" }}>{b.items[b.items.length - 1].remain != null ? fmt(b.items[b.items.length - 1].remain) : ""}</td>
                      <td style={td} />
                      <td style={td} />
                      <td style={td}>{fmt1(gsum(b.items, (x) => x.feedRecv))}</td>
                      <td style={td}>{fmt1(gsum(b.items, (x) => x.feedUsed))}</td>
                      <td style={td} /><td style={td} />
                      <td style={td}>{fmt1(gsum(b.items, (x) => x.water))}</td>
                      <td style={td} /><td style={td} />
                    </tr>
                  ) : (
                    <tr key={b.d}>
                      {(() => { const tr = trialOfDay(selHouse, b.d); return (
                        <td style={{ ...td, textAlign: "left", fontWeight: 700, ...(tr ? { background: "#FFEDD5" } : {}) }} title={tr ? `🧪 ช่วงให้ ${tr.name}` : undefined}>{toThaiDate(b.d, false)}{tr ? " 🧪" : ""}</td>
                      ); })()}
                      <td style={td}>{b.ageWk != null ? b.ageWk : "—"}</td>
                      <td style={td}>{b.r?.light?.hours || "—"}</td>
                      <td style={td}>{b.r?.light?.lux || "—"}</td>
                      <td style={td}>{fmt(nf(b.r?.loss?.cull))}</td>
                      <td style={td}>{fmt(nf(b.r?.loss?.deadAm))}</td>
                      <td style={td}>{fmt(nf(b.r?.loss?.deadPm))}</td>
                      <td style={{ ...td, fontWeight: 700, color: b.deadToday > 0 ? "#B91C1C" : undefined }}>{fmt(b.deadToday)}</td>
                      <td style={td}>{b.deadWt > 0 ? fmt2(b.deadWt) : "—"}</td>
                      <td style={td}>{b.deadWt > 0 && b.deadToday > 0 ? fmt2(b.deadWt / b.deadToday) : "—"}</td>
                      <td style={td}>{fmt(b.cum.dead)}</td>
                      <td style={td}>{b.pctDead != null ? b.pctDead.toFixed(2) + "%" : "—"}</td>
                      <td style={{ ...td, fontWeight: 800, color: "#15803D" }}>{b.remain != null ? fmt(b.remain) : "—"}</td>
                      <td style={td}>{b.r?.feed?.no || "—"}</td>
                      <td style={td}>{fmt1(b.feedOpen.s1)} · {fmt1(b.feedOpen.s2)}</td>
                      <td style={td}>{fmt1(b.feedRecv)}</td>
                      <td style={td}>{fmt1(b.feedUsed)}</td>
                      <td style={td}>
                        <span style={siloAct[selHouse]?.s1 && b.silo.s1 < feedMin ? { color: "#B91C1C", fontWeight: 800 } : {}}>{fmt1(b.silo.s1)}</span>
                        {" · "}
                        <span style={siloAct[selHouse]?.s2 && b.silo.s2 < feedMin ? { color: "#B91C1C", fontWeight: 800 } : {}}>{fmt1(b.silo.s2)}</span>
                      </td>
                      <td style={td}>{b.gPerBird != null ? fmt1(b.gPerBird) : "—"}</td>
                      <td style={td}>{b.water != null ? fmt1(b.water) : "—"}</td>
                      <td style={{ ...td, textAlign: "left", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={medsDetail(b.r) + (b.r?.note ? " · " + b.r.note : "")}>{medsSummary(b.r) || (b.r?.note ? "📝" : "—")}</td>
                      <td style={td}><button onClick={() => setEditHouse({ hid: selHouse, date: b.d })} title="แก้ไขวันนี้" style={{ border: "1px solid #E8943A55", background: "#FFF7EC", color: ACCENT_DK, borderRadius: 7, padding: "2px 7px", cursor: "pointer" }}><Pencil size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ fontSize: 12, color: "#9b8e78", marginTop: 10, lineHeight: 1.8 }}>
            สมุดประจำโรงเรือน {selHouse} — 1 หลัง 1 หน้า เหมือนฟอร์มกระดาษ · แถว "ผลรวม" สรุปให้อัตโนมัติทุกสัปดาห์อายุไก่ · กด ✎ ท้ายแถวเพื่อแก้วันนั้น · <b>ไก่คงเหลือ = เริ่มเลี้ยง − คัดสะสม − ตายสะสม</b> และอัปเดตยอดไก่หน้าผลผลิตอัตโนมัติ
          </div>
        </div>
      )}

      {mode === "day" && (<>
      <div style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>หลัง</th>
              <th style={th}>รุ่น/ฝูง</th>
              <th style={th}>อายุ (สป.)</th>
              <th style={th}>ไฟ (ชม.)</th>
              <th style={th}>แสง Lux</th>
              <th style={th}>ไก่คัด</th>
              <th style={th}>ตายเช้า</th>
              <th style={th}>ตายบ่าย</th>
              <th style={th}>ตายรวม</th>
              <th style={th}>นน.ตาย (กก.)</th>
              <th style={th}>กก./ตัว</th>
              <th style={th}>ตายสะสม</th>
              <th style={th}>%ตายสะสม</th>
              <th style={{ ...th, color: "#15803D" }}>คงเหลือ (ตัว)</th>
              <th style={th}>เบอร์อาหาร</th>
              <th style={th}>กินรวม (กก.)</th>
              <th style={th}>กินเฉลี่ย (กรัม/ตัว)</th>
              <th style={th}>คงเหลือไซโล (กก.)</th>
              <th style={th}>น้ำ (ยูนิต)</th>
              <th style={{ ...th, textAlign: "left" }}>ยา/วัคซีน</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.hid} style={{ background: x.r ? "#fff" : "#FDFAF3" }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>
                  {x.hid}
                  <button onClick={() => setEditHouse({ hid: x.hid, date: day })} title="กรอก/แก้ไขการเลี้ยงวันนี้" style={{ marginLeft: 6, border: "1px solid #E8943A55", background: "#FFF7EC", color: ACCENT_DK, borderRadius: 7, padding: "2px 7px", cursor: "pointer" }}><Pencil size={12} /></button>
                  <button onClick={() => setFlockHouse(x.hid)} title="ตั้งค่ารุ่นการเลี้ยง" style={{ marginLeft: 4, border: "1px solid #d8cdb6", background: "#fff", color: "#7a6f5c", borderRadius: 7, padding: "2px 7px", cursor: "pointer", fontSize: 11.5, fontWeight: 700 }}>รุ่น</button>
                  <button onClick={() => setVacHouse(x.hid)} title="สมุดวัคซีนของหลังนี้" style={{ marginLeft: 3, border: "1px solid #d8cdb6", background: "#fff", color: "#7a6f5c", borderRadius: 7, padding: "2px 7px", cursor: "pointer", fontSize: 11.5, fontWeight: 700 }}>💉</button>
                  <button onClick={() => setLabHouse(x.hid)} title="สมุดผลตรวจแล็บของหลังนี้" style={{ marginLeft: 3, border: "1px solid #d8cdb6", background: "#fff", color: "#7a6f5c", borderRadius: 7, padding: "2px 7px", cursor: "pointer", fontSize: 11.5, fontWeight: 700 }}>🧪</button>
                </td>
                <td style={td}>{x.fl?.gen ? `${x.fl.gen}${x.fl.flock ? "/" + x.fl.flock : ""}` : <span style={{ color: "#c9c0ad" }}>—</span>}</td>
                <td style={td}>{x.ageWk != null ? x.ageWk : <span style={{ color: "#c9c0ad" }}>—</span>}</td>
                <td style={td}>{x.r?.light?.hours || "—"}</td>
                <td style={td}>{x.r?.light?.lux || "—"}</td>
                <td style={td}>{x.r ? fmt(nf(x.r.loss?.cull)) : "—"}</td>
                <td style={td}>{x.r ? fmt(nf(x.r.loss?.deadAm)) : "—"}</td>
                <td style={td}>{x.r ? fmt(nf(x.r.loss?.deadPm)) : "—"}</td>
                <td style={{ ...td, fontWeight: 700, color: x.deadToday > 0 ? "#B91C1C" : undefined }}>{x.r ? fmt(x.deadToday) : "—"}</td>
                <td style={td}>{x.deadWt > 0 ? fmt2(x.deadWt) : "—"}</td>
                <td style={td}>{x.deadWt > 0 && x.deadToday > 0 ? fmt2(x.deadWt / x.deadToday) : "—"}</td>
                <td style={td}>{fmt(x.cum.dead)}</td>
                <td style={td}>{x.pctDead != null ? x.pctDead.toFixed(2) + "%" : <span style={{ color: "#c9c0ad" }}>—</span>}</td>
                <td style={{ ...td, fontWeight: 800, color: "#15803D" }}>{x.remainBirds != null ? fmt(x.remainBirds) : <span style={{ color: "#c9c0ad" }}>ตั้งรุ่นก่อน</span>}</td>
                <td style={td}>{x.r?.feed?.no || "—"}</td>
                <td style={td}>{x.r ? fmt1(x.feedUsed) : "—"}</td>
                <td style={td}>{x.gPerBird != null ? fmt1(x.gPerBird) : "—"}</td>
                <td style={td}>
                  <span style={siloAct[x.hid]?.s1 && x.silo.s1 < feedMin ? { color: "#B91C1C", fontWeight: 800 } : {}}>{fmt1(x.silo.s1)}</span>
                  {" · "}
                  <span style={siloAct[x.hid]?.s2 && x.silo.s2 < feedMin ? { color: "#B91C1C", fontWeight: 800 } : {}}>{fmt1(x.silo.s2)}</span>
                </td>
                <td style={td}>{x.water != null ? fmt1(x.water) : "—"}</td>
                <td style={{ ...td, textAlign: "left", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }} title={medsDetail(x.r) + (x.r?.note ? " · " + x.r.note : "")}>{medsSummary(x.r) || (x.r?.note ? "📝" : "—")}</td>
              </tr>
            ))}
            <tr style={{ background: "#F6F1E7", fontWeight: 800 }}>
              <td style={{ ...td, textAlign: "left" }}>รวม</td>
              <td style={td} /><td style={td} /><td style={td} /><td style={td} />
              <td style={td}>{fmt(sum((x) => x.r ? nf(x.r.loss?.cull) : 0))}</td>
              <td style={td}>{fmt(sum((x) => x.r ? nf(x.r.loss?.deadAm) : 0))}</td>
              <td style={td}>{fmt(sum((x) => x.r ? nf(x.r.loss?.deadPm) : 0))}</td>
              <td style={{ ...td, color: "#B91C1C" }}>{fmt(sum((x) => x.deadToday))}</td>
              <td style={td}>{fmt2(sum((x) => x.deadWt))}</td>
              <td style={td}>{sum((x) => x.deadToday) > 0 && sum((x) => x.deadWt) > 0 ? fmt2(sum((x) => x.deadWt) / sum((x) => x.deadToday)) : ""}</td>
              <td style={td}>{fmt(sum((x) => x.cum.dead))}</td>
              <td style={td} />
              <td style={{ ...td, color: "#15803D" }}>{fmt(sum((x) => x.remainBirds))}</td>
              <td style={td} />
              <td style={td}>{fmt1(sum((x) => x.feedUsed))}</td>
              <td style={td} />
              <td style={td}>{fmt1(sum((x) => x.silo.s1 + x.silo.s2))}</td>
              <td style={td}>{fmt1(sum((x) => x.water))}</td>
              <td style={td} />
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: "#9b8e78", marginTop: 10, lineHeight: 1.8 }}>
        กด ✎ เพื่อกรอกการเลี้ยงของวันนั้น (สูญเสีย/อาหาร/มิเตอร์น้ำ/ไฟ/วัคซีน) · กด "รุ่น" เพื่อตั้งค่ารุ่นการเลี้ยง (จำนวนเริ่มเลี้ยง/วันที่เริ่ม/อายุรับเข้า)
        · <b>ไก่คงเหลือ = จำนวนเริ่มเลี้ยง − คัดสะสม − ตายสะสม</b> และจะอัปเดตยอดไก่ในหน้าผลผลิตของวันเดียวกันให้อัตโนมัติ
        · น้ำ = ผลต่างเลขมิเตอร์จากวันก่อนหน้าที่จดไว้ (รวม 6 ตัว) · คงเหลือไซโล = สะสม รับเข้า − ใช้ไป
      </div>
      </>)}

      {editHouse && (
        <RearingEditModal key={editHouse.hid + editHouse.date} houseId={editHouse.hid} dateISO={editHouse.date} data={rearingByDate[editHouse.date]?.[editHouse.hid]}
          siloRemain={feedRemain(rearingByDate, editHouse.hid, shiftDayISO(editHouse.date, -1), flocks[editHouse.hid])}
          birds={(() => { const f = flocks[editHouse.hid]; return f?.startCount ? f.startCount - rearingCum(rearingByDate, editHouse.hid, shiftDayISO(editHouse.date, -1), f).total : prodChickens(production, editHouse.hid, editHouse.date); })()}
          feedMin={feedMin} medStock={medStock} medInfo={medInfo}
          seqLabel={round ? `หลังที่ ${round.idx + 1}/${houseIds.length}` : null}
          onSkip={round ? advanceRound : null}
          onSave={(hid, dISO, d) => { saveRearing(dISO, hid, d); if (round) advanceRound(); else setEditHouse(null); }}
          onClose={() => { setRound(null); setEditHouse(null); }} />
      )}
      {flockHouse && (
        <FlockModal key={flockHouse} houseId={flockHouse} flock={flocks[flockHouse]} suggestStart={suggestStart(flockHouse)}
          onSave={(hid, f) => {
            saveFlock(hid, f); setFlockHouse(null);
            if (afterFlock && afterFlock.hid === hid) {   // มาจากปุ่ม "กรอกวันถัดไป" วันแรกของรุ่น → เปิดหน้ากรอกรายวันต่อเลย (เริ่มที่วันเริ่มเลี้ยง ถ้าตั้งไว้)
              setEditHouse({ hid, date: f.startDate || afterFlock.date });
              setAfterFlock(null);
            }
          }}
          onClose={() => { setFlockHouse(null); setAfterFlock(null); }} />
      )}
      {vacHouse && (
        <VaccineModal houseId={vacHouse} rows={vaccines[vacHouse] || []} info={VACCINE_INFO[vacHouse]}
          onAdd={addVaccine} onDelete={deleteVaccine} onClose={() => setVacHouse(null)} />
      )}
      {labHouse && (
        <LabTestModal houseId={labHouse} rows={labTests[labHouse] || []}
          onAdd={addLabTest} onDelete={deleteLabTest} onClose={() => setLabHouse(null)} />
      )}
    </div>
  );
}

/* ============================================================
   หน้าจอ: ระบบแผงดำ
============================================================ */
function PanelTrayView({ trayStock, setTrayStock, bills = [], trayRecords = [], setTrayRecords, trayEvents = [], addTrayEvent, deleteTrayEvent }) {
  const trays = trayRecords, setTrays = setTrayRecords;  // ใช้ state กลางจาก App (ยกขึ้นมาเพื่อแชร์กับหน้าออกบิล)
  const [sortModal, setSortModal] = useState(null);
  const [custAction, setCustAction] = useState(null);       // {mode: "brokenBack"} — บันทึกเหตุการณ์ระดับลูกค้า
  const [reportCust, setReportCust] = useState(null);        // row ลูกค้าที่กำลังออกใบรายงานส่ง LINE
  const [newReturn, setNewReturn] = useState(false);
  const [newReturnCust, setNewReturnCust] = useState("");   // ลูกค้าที่ preselect ตอนกด "รับแผงคืน" จากสมุด
  const [expandSig, setExpandSig] = useState(0);            // กดการ์ด "รอคัดแยก" → กางลูกค้าที่มีใบรอคัด
  const custName = (id) => CUSTOMERS.find((c) => c.id === id)?.name || "—";
  // บันทึกเหตุการณ์ระดับลูกค้า: รับแผงดีทดแทน (แผงดีเข้าฟาร์ม + ตัดค้าง) / คืนแผงชำรุดให้ลูกค้า (ตัดกองชำรุดที่ฟาร์ม)
  const applyCustAction = (mode, customerId, qty, dateISO, by) => {
    const ev = { id: "TE" + Date.now(), type: mode, customerId, date: dateISO, ใหญ่: qty.ใหญ่ || 0, เล็ก: qty.เล็ก || 0, by: (by || "").trim(), ts: Date.now() };
    addTrayEvent && addTrayEvent(ev);
    if (mode === "replace") setTrayStock((prev) => ({ ใหญ่: prev.ใหญ่ + (qty.ใหญ่ || 0), เล็ก: prev.เล็ก + (qty.เล็ก || 0) }));
    if (mode === "brokenBack") reconcileBrokenBack(customerId, [...(trayEvents || []), ev]);
    setCustAction(null);
  };
  // จัดสถานะใบให้ตรงเหตุการณ์คืนชำรุด: ไล่ FIFO ใบเก่าก่อน — ชำรุดของใบไหนถูกคืนครบ (ทั้งใหญ่และเล็ก) → สถานะ "ส่งคืนแล้ว"
  // (ติด marker brokenBackVia เพื่อให้ trayAccountOf ยังนับชำรุดใบนี้ แล้วหักด้วยยอดเหตุการณ์ — ไม่หักซ้ำ) · ลบเหตุการณ์ → สถานะถอยกลับเอง
  const reconcileBrokenBack = (customerId, allEvents) => {
    let remB = 0, remS = 0;
    (allEvents || []).forEach((e) => { if (e.customerId === customerId && e.type === "brokenBack") { remB += e.ใหญ่ || 0; remS += e.เล็ก || 0; } });
    setTrays((prev) => {
      const flip = {};
      prev.filter((t) => t.customerId === customerId && t.sorted && t.status !== "ปิดรายการ" && !(t.status === "ส่งคืนแล้ว" && !t.brokenBackVia))
        .sort((a, b) => (thShortToISO(a.date) || "").localeCompare(thShortToISO(b.date) || "") || String(a.id).localeCompare(String(b.id)))
        .forEach((t) => {
          const nb = t.sorted.broken?.ใหญ่ || 0, ns = t.sorted.broken?.เล็ก || 0;
          if ((nb > 0 || ns > 0) && remB >= nb && remS >= ns) { remB -= nb; remS -= ns; flip[t.id] = true; }
          else flip[t.id] = false;
        });
      return prev.map((t) => flip[t.id] === true ? { ...t, status: "ส่งคืนแล้ว", brokenBackVia: "event" }
        : flip[t.id] === false && t.brokenBackVia ? { ...t, status: "รอส่งคืน", brokenBackVia: undefined } : t);
    });
  };

  const summary = useMemo(() => {
    let waitingSort = 0, waitingSortBig = 0, waitingSortSmall = 0, brokenToReturn = 0, replaceOwed = 0;
    trays.forEach((t) => {
      if (t.status === "รอคัด") { waitingSort += sumTray(t.received); waitingSortBig += t.received?.ใหญ่ || 0; waitingSortSmall += t.received?.เล็ก || 0; }
      if (t.sorted && t.status === "รอส่งคืน") brokenToReturn += sumTray(t.sorted.broken);
      if (t.sorted && t.status !== "ปิดรายการ") replaceOwed += sumTray(t.sorted.broken) - sumTray(t.replacedGood);
    });
    return { waitingSort, waitingSortBig, waitingSortSmall, brokenToReturn, replaceOwed };
  }, [trays]);

  // สรุปแผงรายลูกค้า: รวมยอดรับแผงไป (จากบิลจริง) + รับคืน/คัดแยก (จาก RT)
  const byCustomer = useMemo(() => {
    const map = {};
    const ensure = (id) => {
      if (!map[id]) map[id] = { customerId: id, name: custName(id), good: 0, broken: 0, trays: [], events: [], billTrays: [] };
      return map[id];
    };
    // ลงทะเบียนลูกค้าที่มีแผงจากบิล + เก็บยอดแผงที่ฟาร์มส่งไปแต่ละบิล แยกใหญ่/เล็ก (โชว์ในไทม์ไลน์สมุด)
    (bills || []).forEach((b) => {
      const ts = b.traySummary; if (!ts) return;
      const sent = (ts.blackSent || 0) + (ts.orangeSent || 0);
      const ret = (ts.blackReturned || 0) + (ts.orangeReturned || 0);
      if (sent === 0 && ret === 0) return;
      const m = ensure(b.customerId);
      if (sent > 0) {
        const sB = (ts.blackBig || 0) + (ts.orangeBig || 0), sS = ts.blackSmall || 0;
        const okSize = sB + sS === sent;   // บิลเก่าไม่มีขนาด → นับเป็นใหญ่ทั้งบิล
        m.billTrays.push({ iso: b.workDay || isoFromTs(b.ts || 0), sent, big: okSize ? sB : sent, small: okSize ? sS : 0, no: b.no });
      }
    });
    // รายละเอียดการรับแผงคืนภายหลัง (RT) + คัดแยกดี/ชำรุด (สะสมแยกใหญ่/เล็ก)
    trays.forEach((t) => {
      const m = ensure(t.customerId);
      if (t.sorted) {
        m.good += sumTray(t.sorted.good); m.broken += sumTray(t.sorted.broken);
        m.goodBig = (m.goodBig || 0) + (t.sorted.good?.ใหญ่ || 0); m.goodSmall = (m.goodSmall || 0) + (t.sorted.good?.เล็ก || 0);
        m.brokenBig = (m.brokenBig || 0) + (t.sorted.broken?.ใหญ่ || 0); m.brokenSmall = (m.brokenSmall || 0) + (t.sorted.broken?.เล็ก || 0);
      }
      m.trays.push(t);
    });
    // เหตุการณ์ระดับลูกค้า (รับทดแทน/คืนชำรุด)
    (trayEvents || []).forEach((e) => { ensure(e.customerId).events.push(e); });
    // ตัวเลขบัญชี (ค้างคืน/ค้างทดแทน/ชำรุดรอส่งคืน) มาจาก helper กลางตัวเดียว
    return Object.values(map)
      .map((m) => { const acc = trayAccountOf(m.customerId, bills, trays, null, trayEvents); return { ...m, ...acc, returnedTotal: acc.billReturned + acc.rtReturned }; })
      .sort((a, b) => (b.owed + b.brokenPending) - (a.owed + a.brokenPending) || b.balance - a.balance);
  }, [trays, bills, trayEvents]);
  const totalOwedBack = byCustomer.reduce((s, r) => s + r.owedBack, 0);
  const totalBrokenPending = byCustomer.reduce((s, r) => s + (r.brokenPending || 0), 0);   // ชำรุดที่ฟาร์มรอส่งคืนลูกค้า
  // ค้างคืนรวมตามสูตร user (ส่ง − คัดดี) — รายลูกค้าติดลบ (คืนเกิน) ไม่เอาไปหักลูกค้าอื่น
  const totalOweSPD = byCustomer.reduce((s, r) => s + Math.max(0, ((r.sentBig || 0) - (r.goodBig || 0)) + ((r.sentSmall || 0) - (r.goodSmall || 0))), 0);
  const cumRecvSorted = trays.reduce((s, t) => s + (t.sorted ? sumTray(t.received) : 0), 0);   // ยอดคัดสะสม (จากแถบรายงานคัดแผงเดิม)
  const cumGoodSorted = trays.reduce((s, t) => s + (t.sorted ? sumTray(t.sorted.good) : 0), 0);
  const totalDepositHeld = byCustomer.reduce((s, r) => s + (r.depositHeld || 0), 0);  // มัดจำที่ลูกค้าจ่ายแล้ว (รอจ่ายคืน) รวม
  const totalOrangeHeld = byCustomer.reduce((s, r) => s + (r.heldOrange || 0), 0);    // แผงส้มที่ลูกค้ายืมไป (สำคัญสุด — มีแค่ฟาร์มเรา)
  const totalBlackHeld = byCustomer.reduce((s, r) => s + (r.heldBlack || 0), 0);
  const totalCarriedOwed = byCustomer.reduce((s, r) => s + (r.carriedOwed || 0), 0);  // ค้างคืน (ยกยอด ไม่คิดเงิน = หนี้แผงจริง) รวม

  const applySort = (trayId, good, broken, sorter, sortedDate) => {
    // ไม่มีชำรุดเลย = จบใบทันที (ไม่มีอะไรรอส่งคืนลูกค้า)
    setTrays((prev) => prev.map((t) => t.id === trayId ? { ...t, status: sumTray(broken) > 0 ? "รอส่งคืน" : "ปิดรายการ", sorted: { good, broken }, sorter, sortedDate: sortedDate || new Date().toLocaleDateString("th-TH") } : t));
    setTrayStock((prev) => ({ ใหญ่: prev.ใหญ่ + (good.ใหญ่ || 0), เล็ก: prev.เล็ก + (good.เล็ก || 0) }));
    setSortModal(null);
  };
  const markReturned = (id) => setTrays((p) => p.map((t) => t.id === id ? { ...t, status: "ส่งคืนแล้ว" } : t));
  // รับแผงดีทดแทน (บางส่วนได้ — หลายรอบ): บันทึกรอบละ {ใหญ่/เล็ก + วันที่}, สะสมยอด, ครบแล้วปิดเอง ; แผงดีทดแทนเข้าฟาร์ม
  const addReplacement = (trayId, rep, dateTH) => {
    setTrays((prev) => prev.map((t) => {
      if (t.id !== trayId) return t;
      const replacements = [...(t.replacements || []), { ใหญ่: rep.ใหญ่ || 0, เล็ก: rep.เล็ก || 0, date: dateTH }];
      const replacedGood = { ใหญ่: (t.replacedGood?.ใหญ่ || 0) + (rep.ใหญ่ || 0), เล็ก: (t.replacedGood?.เล็ก || 0) + (rep.เล็ก || 0) };
      const done = sumTray(replacedGood) >= sumTray(t.sorted.broken);
      return { ...t, replacements, replacedGood, replacedDate: dateTH, status: done ? "ปิดรายการ" : t.status };
    }));
    setTrayStock((prev) => ({ ใหญ่: prev.ใหญ่ + (rep.ใหญ่ || 0), เล็ก: prev.เล็ก + (rep.เล็ก || 0) }));  // แผงดีทดแทนเข้าสต็อกฟาร์ม
    setReplaceModal(null);
  };
  // รับแผงคืน (ขั้นที่ 1): บันทึกแผงที่ลูกค้าคืนมา (แยกใหญ่/เล็ก) เข้าคิว "รอคัด" — ยังไม่คัด ยังไม่เข้าสต็อก
  // เลขใบ = เลขสูงสุดที่เคยมี +1 (ไม่ใช่นับจำนวน — กันเลขซ้ำหลังลบใบ)
  const addReceive = (customerId, received, receivedDate) => {
    const maxNo = trays.reduce((m, t) => Math.max(m, parseInt(String(t.id).replace(/\D/g, "")) || 0), 0);
    const no = "RT-" + String(maxNo + 1).padStart(4, "0");
    const today = new Date().toLocaleDateString("th-TH");
    setTrays((p) => [{ id: no, customerId, date: receivedDate || today, received, status: "รอคัด", sorted: null, sorter: "", sortedDate: "", replacedGood: { ใหญ่: 0, เล็ก: 0 }, replacements: [] }, ...p]);
    setNewReturn(false);
  };
  // ลบใบรับคืน (กรอกผิด/บันทึกซ้ำ) — ถ้าใบนั้นคัดแล้ว ถอนแผงดี (และแผงทดแทน legacy) ที่เคยเข้าคลังออกด้วย ให้คลังแผงตรง
  const deleteTray = (id) => {
    const t = trays.find((x) => x.id === id); if (!t) return;
    const undoBig = (t.sorted?.good?.ใหญ่ || 0) + (t.replacedGood?.ใหญ่ || 0);
    const undoSmall = (t.sorted?.good?.เล็ก || 0) + (t.replacedGood?.เล็ก || 0);
    if (undoBig > 0 || undoSmall > 0) setTrayStock((prev) => ({ ใหญ่: Math.max(0, prev.ใหญ่ - undoBig), เล็ก: Math.max(0, prev.เล็ก - undoSmall) }));
    setTrays((p) => p.filter((x) => x.id !== id));
  };

  return (
    <>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>แผงไข่ · สมุดแผงลูกค้า (รับคืน / คัดแยก / คืนชำรุด)</span>
        <button style={{ ...S.ghostBtn, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 13px", fontSize: 12.5, fontWeight: 700 }}
          onClick={() => { setNewReturnCust(""); setNewReturn(true); }}><Plus size={14} /> รับแผงคืน</button>
      </div>
      <div style={S.trayWrap}>
        <div style={S.summaryGrid}>
          <SummaryCard icon={<RotateCcw size={18} />} label="แผงลูกค้าถืออยู่" value={totalOwedBack} tone={totalCarriedOwed > 0 ? "red" : "blue"} sub={`${totalCarriedOwed > 0 ? `ค้างคืน ${fmt(totalCarriedOwed)} · ` : ""}จ่ายมัดจำ ${fmt(totalDepositHeld)} บ. · 🟠 ${fmt(totalOrangeHeld)}`} />
          <SummaryCard icon={<Clock size={18} />} label="รอคัดแยก" value={summary.waitingSort} tone="amber"
            sub={`ใหญ่ ${fmt(summary.waitingSortBig)} · เล็ก ${fmt(summary.waitingSortSmall)} — ${summary.waitingSort > 0 ? "กดดูใบที่รอ" : "กดเพื่อรับแผงคืน"}`}
            onClick={() => { if (summary.waitingSort > 0) setExpandSig((s) => s + 1); else { setNewReturnCust(""); setNewReturn(true); } }} />
          <SummaryCard icon={<AlertCircle size={18} />} label="ค้างคืนรวม (ส่ง − คัดดี)" value={totalOweSPD} tone="red" sub={`ชำรุดรอคืนลูกค้า ${fmt(totalBrokenPending)} · คัดแล้วสะสม ${fmt(cumRecvSorted)}`} />
          <SummaryCard icon={<Package size={18} />} label="แผงดีในฟาร์ม" value={sumTray(trayStock)} tone="green" sub={`ใหญ่ ${fmt(trayStock.ใหญ่)} · เล็ก ${fmt(trayStock.เล็ก)} · คัดดีสะสม +${fmt(cumGoodSorted)}`} />
        </div>

        {/* ยุบ 3 แถบเหลือสมุดเดียว (2026-07-08): รอคัด/คัดแยก/รายงาน อยู่ในตารางต่อลูกค้าครบแล้ว */}
        <TrayByCustomer rows={byCustomer}
          expandWaitingSignal={expandSig}
          onReceive={(cid) => { setNewReturnCust(cid); setNewReturn(true); }}
          onSort={(t) => setSortModal(t)}
          onBrokenBack={(cid) => setCustAction({ mode: "brokenBack", customerId: cid })}
          onReport={(row) => setReportCust(row)}
          onDeleteEvent={(id) => {
            const e = (trayEvents || []).find((x) => x.id === id);
            deleteTrayEvent && deleteTrayEvent(id);
            if (e && e.type === "brokenBack") reconcileBrokenBack(e.customerId, (trayEvents || []).filter((x) => x.id !== id));   // ลบเหตุการณ์คืนชำรุด → สถานะใบถอยกลับ
          }}
          onDeleteTray={deleteTray} />
      </div>
      {sortModal && <SortModal tray={sortModal} custName={custName(sortModal.customerId)} onClose={() => setSortModal(null)} onApply={applySort} />}
      {custAction && <TrayCustActionModal mode={custAction.mode} custName={custName(custAction.customerId)}
        acc={trayAccountOf(custAction.customerId, bills, trays, null, trayEvents)}
        onClose={() => setCustAction(null)}
        onApply={(qty, dateISO, by) => applyCustAction(custAction.mode, custAction.customerId, qty, dateISO, by)} />}
      {reportCust && <TrayCustReportModal row={reportCust} bills={bills} onClose={() => setReportCust(null)} />}
      {newReturn && <NewReturnModal initialCustomerId={newReturnCust} onClose={() => { setNewReturn(false); setNewReturnCust(""); }} onAdd={addReceive} bills={bills} trays={trays} trayEvents={trayEvents} />}
    </>
  );
}

// วันที่ไทยสั้น "6/7/2569" → ISO เพื่อเรียงไทม์ไลน์ (ถ้าเป็น ISO อยู่แล้วคืนเดิม)
function thShortToISO(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return "";
  return `${parseInt(m[3]) - 543}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
}

/* สมุดแผงต่อลูกค้า — กติกาหน้างานจริง: แผงทุกใบที่ลูกค้าคืน (รวมแผงทดแทน) ต้องผ่านการคัดก่อน
   แผงดีที่คัดได้หักค้างทดแทนเก่าอัตโนมัติ · คืนแผงชำรุดให้ลูกค้า = อีกจังหวะแยกต่างหาก */
function TrayByCustomer({ rows, onReceive, onSort, onBrokenBack, onReport, onDeleteEvent, onDeleteTray, expandWaitingSignal = 0 }) {
  const [expanded, setExpanded] = useState(() => new Set());
  // กดการ์ด "รอคัดแยก" ด้านบน → กางทุกลูกค้าที่มีใบรอคัด
  useEffect(() => {
    if (expandWaitingSignal > 0) setExpanded(new Set(rows.filter((r) => r.trays.some((t) => t.status === "รอคัด")).map((r) => r.customerId)));
  }, [expandWaitingSignal]);
  if (rows.length === 0) return <div style={S.emptyState}><RotateCcw size={36} color="#d1d5db" /><div>ยังไม่มีข้อมูลแผง — ออกบิลที่มีแผง หรือกด “รับแผงคืน”</div></div>;
  const actBtn = (color, bg) => ({ border: `1.5px solid ${color}`, background: bg, color, borderRadius: 9, padding: "7px 13px", cursor: "pointer", fontWeight: 800, fontSize: 12.5, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => {
        const open = expanded.has(r.customerId) || rows.length === 1;
        const waitingN = r.trays.filter((t) => t.status === "รอคัด").length;
        // ไทม์ไลน์: ใบรับคืน (RT) + เหตุการณ์ เรียงวันใหม่→เก่า · ใบวันเดียวกันเรียงเลขใบ (RT-0001 ก่อน = บิลเกิดก่อน)
        const timeline = [
          ...r.trays.map((t) => ({ kind: "rt", iso: thShortToISO(t.date), t })),
          ...(r.events || []).map((e) => ({ kind: e.type, iso: e.date || "", e })),
        ].sort((a, b) => (b.iso || "").localeCompare(a.iso || "") || (b.e?.ts || 0) - (a.e?.ts || 0) || String(a.t?.id || "").localeCompare(String(b.t?.id || "")));
        // "ส่ง X" หน้าคำว่า คืน — โชว์ทุกใบ:
        //   ใบคืนที่ผูกบิล (คืนตอนออกบิล) = แผงส่งของบิลใบนั้นตรง ๆ
        //   ใบคืนลอย (รับคืนภายหลัง) = Σ แผงส่งจากบิลที่ไม่ถูกผูกกับใบไหน ในรอบ (หลังใบคืนก่อนหน้า → วันใบคืนนี้)
        const billSentByNo = {}; (r.billTrays || []).forEach((bl) => { const m = billSentByNo[bl.no] || (billSentByNo[bl.no] = { b: 0, s: 0 }); m.b += bl.big || 0; m.s += bl.small || 0; });
        const linkedNos = new Set(r.trays.map((t) => t.fromBill).filter(Boolean));
        const rtAsc = r.trays.map((t) => ({ id: t.id, iso: thShortToISO(t.date) || "", fromBill: t.fromBill })).sort((a, b) => a.iso.localeCompare(b.iso) || String(a.id).localeCompare(String(b.id)));
        const sentOfRT = {};
        let prevIso = "";
        rtAsc.forEach((t) => {
          if (t.fromBill) sentOfRT[t.id] = billSentByNo[t.fromBill] || { b: 0, s: 0 };
          else sentOfRT[t.id] = (r.billTrays || []).filter((bl) => !linkedNos.has(bl.no) && (bl.iso || "") > prevIso && (bl.iso || "") <= t.iso).reduce((m, bl) => ({ b: m.b + (bl.big || 0), s: m.s + (bl.small || 0) }), { b: 0, s: 0 });
          prevIso = t.iso || prevIso;
        });
        return (
          <div key={r.customerId} style={S.byCustCard}>
            <button style={S.byCustHead} onClick={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(r.customerId)) n.delete(r.customerId); else n.add(r.customerId); return n; })}>
              <div style={S.byCustIcon}><User size={18} /></div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={S.byCustName}>{r.name}
                  {waitingN > 0 && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 800, background: "#FEF3C7", color: "#B45309", padding: "2px 9px", borderRadius: 11 }}>⏳ รอคัด {waitingN} ใบ</span>}
                </div>
                <div style={S.byCustMeta}>รับไป {trayQty(r.sentBig, r.sentSmall)} · คืนแล้ว {trayQty(r.retBig, r.retSmall)} · คัดดี {trayQty(r.goodBig, r.goodSmall)} / ชำรุดสะสม {trayQty(r.brokenBig, r.brokenSmall)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {(() => {
                  // กติกา user 2026-07-07: ค้างคืน = ส่ง − คัดดี (ชำรุด/รอคัด ไม่นับว่าคืนแล้ว) · แยกขนาด
                  const owBig = (r.sentBig || 0) - (r.goodBig || 0);
                  const owSmall = (r.sentSmall || 0) - (r.goodSmall || 0);
                  const owTotal = owBig + owSmall;
                  const owTxt = (v) => v < 0 ? `เกิน ${fmt(-v)}` : fmt(v);
                  return (
                    <>
                      {owTotal > 0
                        ? <div style={{ fontWeight: 800, color: "#B91C1C", fontSize: 15 }}>ค้างคืน {fmt(owTotal)} แผง</div>
                        : owTotal < 0
                          ? <div style={{ fontWeight: 800, color: "#1D4ED8", fontSize: 15 }}>คืนเกิน {fmt(-owTotal)} แผง</div>
                          : <div style={{ fontWeight: 800, color: "#15803D" }}>คืนครบ ✓</div>}
                      {(owSmall !== 0 || (owBig !== 0 && owBig !== owTotal)) && <div style={{ fontSize: 11.5, fontWeight: 700, color: "#8a8170" }}>ใหญ่ {owTxt(owBig)} · เล็ก {owTxt(owSmall)}</div>}
                    </>
                  );
                })()}
                {r.brokenPending > 0 && <div style={{ fontSize: 12.5, fontWeight: 700, color: "#B45309" }}>ชำรุดรอคืนลูกค้า {trayQty(r.brokenPendingBig, r.brokenPendingSmall)}</div>}
                {r.chargedHeld > 0 && <div style={{ fontSize: 12, color: "#1D4ED8" }}>ยืมไป {fmt(r.chargedHeld)}{r.depositHeld > 0 ? ` · มัดจำ ${fmt(r.depositHeld)}฿` : ""}</div>}
              </div>
              <ChevronRight size={18} color="#9ca3af" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
            </button>
            {open && (
              <div style={S.byCustDetail}>
                {/* ปุ่มบันทึก 2 จังหวะของหน้างานจริง — แผงทดแทนก็เข้าทาง "รับแผงคืน" (ต้องคัดก่อนทุกใบ) */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "6px 2px 10px", borderBottom: "1px solid #f3f0e9", marginBottom: 8 }}>
                  <button style={actBtn("#B45309", "#FFF7EC")} onClick={(ev) => { ev.stopPropagation(); onReceive && onReceive(r.customerId); }}>📥 รับแผงคืน / แผงทดแทน (เข้าคิวคัด){r.owed > 0 ? ` · ค้าง ${fmt(r.owed)}` : ""}</button>
                  <button style={actBtn("#B91C1C", "#FEF2F2")} onClick={(ev) => { ev.stopPropagation(); onBrokenBack && onBrokenBack(r.customerId); }}>↩ คืนแผงชำรุดให้ลูกค้า{r.brokenPending > 0 ? ` (มี ${fmt(r.brokenPending)})` : ""}</button>
                  <button style={{ ...actBtn("#1D4ED8", "#EFF6FF"), marginLeft: "auto" }} onClick={(ev) => { ev.stopPropagation(); onReport && onReport(r); }}>📤 รายงานส่งลูกค้า (LINE)</button>
                </div>
                <div style={{ fontSize: 11.5, color: "#9b8e78", margin: "-4px 2px 8px" }}>แผงทุกใบที่ลูกค้าคืนต้องคัดก่อน (รวมแผงทดแทน) — แผงดีที่คัดได้จะหักยอดค้างทดแทนให้อัตโนมัติ</div>
                {timeline.length === 0 && <div style={{ fontSize: 12.5, color: "#9b9384", padding: "2px 2px 4px" }}>ยังไม่มีรายการ — กด "รับแผงคืน" เมื่อลูกค้าเอาแผงมาคืน</div>}
                {timeline.length > 0 && (() => {
                  // ตารางรายการ: คอลัมน์แยกใหญ่/เล็กทุกยอด + แถวรวม
                  const num = (v, color) => <td style={{ ...S.td, color: (v || 0) > 0 ? (color || INK) : "#d5cdbd", fontWeight: (v || 0) > 0 ? 700 : 400 }}>{(v || 0) > 0 ? fmt(v) : "-"}</td>;
                  const subTh = { ...S.th, fontSize: 10.5, padding: "3px 8px", color: "#9b9384" };
                  const tot = timeline.reduce((a, x) => {
                    if (x.kind !== "rt") return a;
                    const so = sentOfRT[x.t.id] || { b: 0, s: 0 };
                    a.sb += so.b; a.ss += so.s;
                    a.rb += x.t.received?.ใหญ่ || 0; a.rs += x.t.received?.เล็ก || 0;
                    if (x.t.sorted) { a.gb += x.t.sorted.good?.ใหญ่ || 0; a.gs += x.t.sorted.good?.เล็ก || 0; a.bb += x.t.sorted.broken?.ใหญ่ || 0; a.bs += x.t.sorted.broken?.เล็ก || 0; }
                    return a;
                  }, { sb: 0, ss: 0, rb: 0, rs: 0, gb: 0, gs: 0, bb: 0, bs: 0 });
                  return (<>
                    <div style={S.tableScroll}>
                      <table style={{ ...S.table, fontSize: 12.5 }}>
                        <thead>
                          <tr>
                            <th style={{ ...S.th, textAlign: "left" }} rowSpan={2}>ใบรับคืน</th>
                            <th style={S.th} rowSpan={2}>วันรับคืน</th>
                            <th style={{ ...S.th, color: "#1D4ED8" }} colSpan={2}>📤 ส่ง</th>
                            <th style={S.th} colSpan={2}>📥 คืน</th>
                            <th style={{ ...S.th, color: "#15803D" }} colSpan={2}>✅ คัดดี</th>
                            <th style={{ ...S.th, color: "#B91C1C" }} colSpan={2}>ชำรุด</th>
                            <th style={S.th} rowSpan={2}>คัดเมื่อ · ผู้คัด</th>
                            <th style={S.th} rowSpan={2}></th>
                          </tr>
                          <tr>{["ใหญ่", "เล็ก", "ใหญ่", "เล็ก", "ใหญ่", "เล็ก", "ใหญ่", "เล็ก"].map((k, i) => <th key={i} style={subTh}>{k}</th>)}</tr>
                        </thead>
                        <tbody>
                          {timeline.map((x, i) => {
                            if (x.kind !== "rt") return (
                              <tr key={"ev" + x.e.id} style={{ background: x.kind === "replace" ? "#F0FDF4" : "#FEF7F2" }}>
                                <td style={{ ...S.td, textAlign: "left", fontWeight: 700, color: x.kind === "replace" ? "#15803D" : "#B45309" }} colSpan={10}>
                                  {x.kind === "replace" ? "🔁 รับแผงดีทดแทน" : "↩ คืนแผงชำรุดให้ลูกค้า"} · {toThaiDate(x.e.date, false)} · {trayQty(x.e.ใหญ่, x.e.เล็ก)}{x.e.by ? ` · โดย ${x.e.by}` : ""}
                                </td>
                                <td style={S.td} colSpan={2}>
                                  <button title="ลบรายการนี้ (กรอกผิด)" onClick={() => { if (window.confirm("ลบรายการนี้? (ยอดจะคำนวณใหม่)")) onDeleteEvent && onDeleteEvent(x.e.id); }}
                                    style={{ border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 7, padding: "1px 7px", cursor: "pointer", fontWeight: 800, fontSize: 11 }}>✕</button>
                                </td>
                              </tr>
                            );
                            const so = sentOfRT[x.t.id] || { b: 0, s: 0 };
                            const missing = x.t.sorted ? sumTray(x.t.received) - sumTray(x.t.sorted.good) - sumTray(x.t.sorted.broken) : 0;
                            return (
                              <tr key={x.t.id}>
                                <td style={{ ...S.td, textAlign: "left", whiteSpace: "nowrap" }}>
                                  <span style={{ fontWeight: 700 }}>{x.t.id}</span>
                                  <span style={{ ...S.statusPill, background: (STATUS_STYLE[x.t.status] || {}).bg, color: (STATUS_STYLE[x.t.status] || {}).c, marginLeft: 6 }}>{x.t.status}</span>
                                </td>
                                <td style={{ ...S.td, whiteSpace: "nowrap" }}>{toThaiDate(thShortToISO(x.t.date), false) || x.t.date}</td>
                                {num(so.b, "#1D4ED8")}{num(so.s, "#1D4ED8")}
                                {num(x.t.received?.ใหญ่)}{num(x.t.received?.เล็ก)}
                                {x.t.sorted ? (
                                  <>
                                    {num(x.t.sorted.good?.ใหญ่, "#15803D")}{num(x.t.sorted.good?.เล็ก, "#15803D")}
                                    {num(x.t.sorted.broken?.ใหญ่, "#B91C1C")}{num(x.t.sorted.broken?.เล็ก, "#B91C1C")}
                                  </>
                                ) : (
                                  <td style={S.td} colSpan={4}>
                                    <button style={{ ...actBtn("#B45309", "#FFF7EC"), padding: "3px 10px", fontSize: 12 }} onClick={() => onSort && onSort(x.t)}>✂️ คัดแยกใบนี้</button>
                                  </td>
                                )}
                                <td style={{ ...S.td, fontSize: 11.5, color: "#9b8e78", whiteSpace: "nowrap" }}>
                                  {x.t.sorted ? <>{toThaiDate(thShortToISO(x.t.sortedDate), false) || x.t.sortedDate || "-"}{x.t.sorter ? <div>โดย {x.t.sorter}</div> : null}</> : "-"}
                                  {missing > 0 ? <div style={{ color: "#B45309", fontWeight: 700 }}>หาย {fmt(missing)} ⚠️</div> : null}
                                </td>
                                <td style={S.td}>
                                  <button title="ลบใบนี้ (กรอกผิด/บันทึกซ้ำ)" onClick={(ev) => {
                                    ev.stopPropagation();
                                    const extra = x.t.sorted ? `\nใบนี้คัดแล้ว — แผงดี ${fmt(sumTray(x.t.sorted.good))} แผงจะถูกถอนออกจากคลังแผงฟาร์มด้วย` : "";
                                    if (window.confirm(`ลบใบรับคืน ${x.t.id} (${fmt(sumTray(x.t.received))} แผง)?${extra}\nยอดทุกหน้าจะคำนวณใหม่`)) onDeleteTray && onDeleteTray(x.t.id);
                                  }} style={{ border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 7, padding: "1px 7px", cursor: "pointer", fontWeight: 800, fontSize: 11 }}>✕</button>
                                </td>
                              </tr>
                            );
                          })}
                          <tr>
                            <td style={{ ...S.td, ...S.tfoot, textAlign: "left" }} colSpan={2}>รวม</td>
                            <td style={{ ...S.td, ...S.tfoot, color: "#1D4ED8" }}>{fmt(tot.sb)}</td><td style={{ ...S.td, ...S.tfoot, color: "#1D4ED8" }}>{fmt(tot.ss)}</td>
                            <td style={{ ...S.td, ...S.tfoot }}>{fmt(tot.rb)}</td><td style={{ ...S.td, ...S.tfoot }}>{fmt(tot.rs)}</td>
                            <td style={{ ...S.td, ...S.tfoot, color: "#15803D" }}>{fmt(tot.gb)}</td><td style={{ ...S.td, ...S.tfoot, color: "#15803D" }}>{fmt(tot.gs)}</td>
                            <td style={{ ...S.td, ...S.tfoot, color: "#B91C1C" }}>{fmt(tot.bb)}</td><td style={{ ...S.td, ...S.tfoot, color: "#B91C1C" }}>{fmt(tot.bs)}</td>
                            <td style={{ ...S.td, ...S.tfoot }} colSpan={2}>—</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {(() => {
                      // สรุปตามสูตร user: ค้างคืน = ส่ง − คัดดี (บวกชำรุดอยู่ในตัว เพราะชำรุดไม่นับว่าคืน) · ชำรุด = แผงรอคืนลูกค้า
                      const owBig = (r.sentBig || 0) - (r.goodBig || 0);
                      const owSmall = (r.sentSmall || 0) - (r.goodSmall || 0);
                      const owTotal = owBig + owSmall;
                      const owTxt = (v) => v < 0 ? `เกิน ${fmt(-v)}` : fmt(v);
                      const waiting = r.trays.reduce((s, t) => s + (t.status === "รอคัด" ? sumTray(t.received) : 0), 0);
                      return (
                        <div style={{ marginTop: 8, background: "#FBF8F2", border: "1px solid #efe7d8", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, color: "#5b5347", display: "flex", flexDirection: "column", gap: 3 }}>
                          <div>🧮 แผงค้างคืน = ส่ง {fmt((r.sentBig || 0) + (r.sentSmall || 0))} − คัดดี {fmt((r.goodBig || 0) + (r.goodSmall || 0))} = <b style={{ color: owTotal > 0 ? "#B91C1C" : owTotal < 0 ? "#1D4ED8" : "#15803D" }}>{owTotal < 0 ? `คืนเกิน ${fmt(-owTotal)}` : fmt(owTotal)} แผง</b>
                            <span style={{ color: "#8a8170" }}> (ใหญ่ {owTxt(owBig)} · เล็ก {owTxt(owSmall)})</span>
                            {waiting > 0 && <span style={{ color: "#B45309", fontWeight: 700 }}> · ⏳ รอคัดอีก {fmt(waiting)} แผง (ยังไม่หักจนกว่าจะคัดเสร็จ)</span>}
                          </div>
                          <div>↩ แผงชำรุดรอคืนลูกค้า <b style={{ color: "#B45309" }}>{trayQty(r.brokenPendingBig, r.brokenPendingSmall)}</b> <span style={{ color: "#8a8170" }}>— ลูกค้านำแผงดีมาแลกคืนในรอบรับไข่</span></div>
                        </div>
                      );
                    })()}
                  </>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* โมดัลบันทึกเหตุการณ์ระดับลูกค้า: รับแผงดีทดแทน / คืนแผงชำรุดให้ลูกค้า */
function TrayCustActionModal({ mode, custName, acc, onClose, onApply }) {
  const isReplace = mode === "replace";
  const [big, setBig] = useState("");
  const [small, setSmall] = useState("");
  const [date, setDate] = useState(isoFromTs(Date.now()));
  const [by, setBy] = useState("");
  const total = (parseInt(big) || 0) + (parseInt(small) || 0);
  const refMax = isReplace ? acc?.owed : acc?.brokenPending;
  const over = refMax != null && total > refMax;
  const inp = { width: "100%", padding: "9px 10px", border: "1.5px solid #e3ddd0", borderRadius: 9, fontSize: 15, fontFamily: "inherit", outline: "none", textAlign: "right", boxSizing: "border-box" };
  const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: INK, marginBottom: 3 };
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div>
            <div style={S.modalTitle}>{isReplace ? "🔁 รับแผงดีทดแทน" : "↩ คืนแผงชำรุดให้ลูกค้า"}</div>
            <div style={S.modalSub}>{custName} · {isReplace ? `ค้างทดแทน ${trayQty(acc?.owedBig, acc?.owedSmall)}` : `ชำรุดรอส่งคืน ${trayQty(acc?.brokenPendingBig, acc?.brokenPendingSmall)}`}</div>
          </div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>วันที่</label><ThaiDateField value={date} onChange={setDate} style={{ ...inp, textAlign: "left" }} /></div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}><label style={lbl}>แผงใหญ่</label><input style={inp} inputMode="numeric" placeholder="0" value={big} onChange={(e) => setBig(e.target.value.replace(/\D/g, ""))} autoFocus /></div>
          <div style={{ flex: 1 }}><label style={lbl}>แผงเล็ก</label><input style={inp} inputMode="numeric" placeholder="0" value={small} onChange={(e) => setSmall(e.target.value.replace(/\D/g, ""))} /></div>
        </div>
        {isReplace && <div style={{ marginBottom: 10 }}><label style={lbl}>ผู้รับ (ชื่อ)</label><input style={{ ...inp, textAlign: "left" }} placeholder="เช่น อร" value={by} onChange={(e) => setBy(e.target.value)} /></div>}
        {over && <div style={{ fontSize: 12.5, color: "#B45309", fontWeight: 700, marginBottom: 8 }}>⚠ เกินยอด{isReplace ? "ค้างทดแทน" : "ชำรุดที่รอส่งคืน"} ({fmt(refMax)} แผง) — บันทึกได้ ถ้าตัวเลขหน้างานเป็นแบบนี้จริง</div>}
        <div style={{ fontSize: 12, color: "#9b8e78", marginBottom: 12 }}>{isReplace ? "แผงดีทดแทนจะเข้าคลังแผงฟาร์ม และตัดยอดค้างทดแทนของลูกค้า" : "ตัดยอดกองแผงชำรุดที่ฟาร์มถือรอส่งคืน — ไม่กระทบยอดค้างทดแทน"}</div>
        <button disabled={total <= 0} onClick={() => onApply({ ใหญ่: parseInt(big) || 0, เล็ก: parseInt(small) || 0 }, date, by)}
          style={{ ...S.primaryBtn, opacity: total > 0 ? 1 : 0.5 }}>{isReplace ? "บันทึกรับทดแทน" : "บันทึกคืนชำรุด"} {total > 0 ? `· ${fmt(total)} แผง` : ""}</button>
      </div>
    </div>
  );
}

/* 📤 ใบรายงานแผงต่อลูกค้า — เซฟเป็นรูปส่ง LINE หรือคัดลอกข้อความ */
function TrayCustReportModal({ row, bills = [], onClose }) {
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const todayTH = toThaiDate(isoFromTs(Date.now()));
  // กติกา user 2026-07-07: ค้างคืน = ส่ง − คัดดี (ชำรุด/รอคัด ไม่นับว่าคืน) · แยกขนาด
  const owBig = (row.sentBig || 0) - (row.goodBig || 0);
  const owSmall = (row.sentSmall || 0) - (row.goodSmall || 0);
  const owTotal = owBig + owSmall;
  const owTxt = (v) => v < 0 ? `เกิน ${fmt(-v)}` : fmt(v);
  const owStr = owBig >= 0 && owSmall >= 0
    ? trayQty(owBig, owSmall)
    : `${owTotal < 0 ? "คืนเกิน " + fmt(-owTotal) : fmt(owTotal)} แผง (ใหญ่ ${owTxt(owBig)} · เล็ก ${owTxt(owSmall)})`;
  const askQty = owBig >= 0 && owSmall >= 0 ? trayQty(owBig, owSmall) : `${fmt(Math.max(0, owTotal))} แผง`;
  // ไทม์ไลน์แบบสมุดบัญชี เรียงเก่า→ใหม่: ฟาร์มส่งแผงพร้อมไข่ (จากบิล) · ลูกค้าคืน/คัด · แลก/คืนชำรุด
  // ต่อท้าย 2 ยอดสะสม: ถือแผง (บวกส่ง ลบคืน → เห็นเกิน/ขาด/พอดี) + ค้างทดแทน
  const timeline = (() => {
    const items = [
      ...(bills || []).filter((b) => b.customerId === row.customerId && b.traySummary && ((b.traySummary.blackSent || 0) + (b.traySummary.orangeSent || 0)) > 0)
        .map((b) => {
          const ts2 = b.traySummary, sent = (ts2.blackSent || 0) + (ts2.orangeSent || 0);
          const sB = (ts2.blackBig || 0) + (ts2.orangeBig || 0), sS = ts2.blackSmall || 0;
          const ok = sB + sS === sent;   // บิลเก่าไม่มีขนาด → ใหญ่ทั้งบิล
          return { iso: (b.workDay || isoFromTs(b.ts || 0)), ts: -1, kind: "bill", sent, big: ok ? sB : sent, small: ok ? sS : 0 };
        }),
      ...row.trays.map((t) => ({ iso: thShortToISO(t.date), ts: 0, kind: "rt", t })),
      ...(row.events || []).map((e) => ({ iso: e.date || "", ts: e.ts || 1, kind: e.type, e })),
    ].sort((a, b) => (a.iso || "").localeCompare(b.iso || "") || a.ts - b.ts || String(a.t?.id || "").localeCompare(String(b.t?.id || "")));   // ใบวันเดียวกัน → เลขใบน้อยก่อน (บิลเกิดก่อน)
    // ค้างคืนสะสมตามกติกา 2026-07-07: +ส่ง −คัดดี (แผงชำรุด/รอคัด ไม่นับว่าคืน) — เลขท้ายบรรทัดสุดท้าย = ยอดหัวใบ
    let hold = 0;
    const holdTxt = () => hold > 0 ? `ค้างคืน ${fmt(hold)}` : hold < 0 ? `คืนเกิน ${fmt(-hold)}` : "คืนครบ";
    const out = items.map((x) => {
      const d = toThaiDate(x.iso, false) || "";
      if (x.kind === "bill") {
        hold += x.sent;
        return { text: `${d} · 📤 ฟาร์มส่งแผงพร้อมไข่ ${trayQty(x.big, x.small)}`, tail: holdTxt(), blue: true };
      }
      if (x.kind === "rt") {
        if (!x.t.sorted) return { text: `${d} · 📥 ลูกค้าคืน ${trayQtyO(x.t.received)} (ใบ ${x.t.id} · รอคัดแยก — ยังไม่หัก)`, tail: holdTxt() };
        hold -= sumTray(x.t.sorted.good);
        return { text: `${d} · 📥 คืน ${trayQtyO(x.t.received)} (ใบ ${x.t.id}) → คัดดี ${trayQtyO(x.t.sorted.good)} · ชำรุด ${trayQtyO(x.t.sorted.broken)}`, tail: holdTxt(), red: sumTray(x.t.sorted.broken) > 0 };
      }
      if (x.kind === "replace") { hold -= (x.e.ใหญ่ || 0) + (x.e.เล็ก || 0); return { text: `${d} · ลูกค้านำแผงดีมาแลก ${trayQty(x.e.ใหญ่, x.e.เล็ก)}`, tail: holdTxt(), green: true }; }
      return { text: `${d} · ฟาร์มส่งแผงชำรุดคืนให้ลูกค้า ${trayQty(x.e.ใหญ่, x.e.เล็ก)}` };
    });
    return out.slice(-7);   // 7 รายการล่าสุด (ยอดสะสมคิดจากทั้งหมด)
  })();

  const lineText = [
    `📋 สรุปบัญชีแผงไข่ · ${COMPANY.name}`,
    `ลูกค้า: ${row.name}`, `ณ วันที่ ${todayTH}`, ``,
    `🔴 แผงค้างคืน (ส่ง − คัดดี) ${owStr}`,
    ...(row.brokenPending > 0 ? [`📦 แผงชำรุดที่ฟาร์มเก็บไว้รอคืนลูกค้า ${trayQty(row.brokenPendingBig, row.brokenPendingSmall)}`] : []),
    ...(row.chargedHeld > 0 ? [`🔵 แผงที่ยืมไป (จ่ายมัดจำแล้ว) ${fmt(row.chargedHeld)} แผง`] : []), ``,
    owTotal > 0 ? `🔄 รบกวนนำแผงดี ${askQty} มาแลกคืนแผงชำรุดในรอบรับไข่ถัดไปค่ะ 🙏` : `✅ ไม่มีแผงค้างคืน ขอบคุณค่ะ 🙏`,
  ].join("\n");
  const copy = () => { if (navigator.clipboard) navigator.clipboard.writeText(lineText); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const saveImage = async () => {
    const el = document.getElementById("tray-cust-report");
    if (!el) return;
    setSaving(true);
    try {
      const h2c = window.html2canvas || await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload = () => resolve(window.html2canvas); s.onerror = reject;
        document.body.appendChild(s);
      });
      const canvas = await h2c(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const link = document.createElement("a");
      link.download = `รายงานแผง_${row.name}_${isoFromTs(Date.now())}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) { alert("สร้างรูปไม่สำเร็จ — ใช้ปุ่มคัดลอกข้อความแทนได้"); }
    finally { setSaving(false); }
  };
  const sizeSub = (b, s) => (b || 0) > 0 && (s || 0) > 0 ? `ใหญ่ ${fmt(b)} · เล็ก ${fmt(s)}` : (s || 0) > 0 ? "เล็กทั้งหมด" : (b || 0) > 0 ? "ใหญ่ทั้งหมด" : null;
  const bigRow = (label, value, color, sub) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 2px", borderBottom: "1px dashed #eee3cd" }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: "#5b5347" }}>{label}</span>
      <span style={{ textAlign: "right" }}>
        <span style={{ fontSize: 18, fontWeight: 800, color }}>{value} <span style={{ fontSize: 12, fontWeight: 600 }}>แผง</span></span>
        {sub ? <div style={{ fontSize: 11, color: "#8a8170", fontWeight: 700 }}>{sub}</div> : null}
      </span>
    </div>
  );
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 560, maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>📤 รายงานส่งลูกค้า</div><div style={S.modalSub}>เซฟเป็นรูปแล้วส่งใน LINE หรือคัดลอกข้อความ</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        {/* ใบรายงาน (ส่วนที่ถูกจับเป็นรูป) */}
        <div id="tray-cust-report" style={{ background: "#fff", border: "1.5px solid #E8D9BC", borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
          <div style={{ textAlign: "center", borderBottom: "2px solid #E8943A", paddingBottom: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#2B2620" }}>🥚 {COMPANY.name}</div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#C9742A", marginTop: 3 }}>สรุปบัญชีแผงไข่</div>
            <div style={{ fontSize: 12, color: "#8a8170", marginTop: 2 }}>ลูกค้า <b style={{ color: "#2B2620" }}>{row.name}</b> · ณ วันที่ {todayTH}</div>
          </div>
          {bigRow("🔴 แผงค้างคืน (ส่ง − คัดดี)", owTotal < 0 ? `เกิน ${fmt(-owTotal)}` : fmt(owTotal), owTotal > 0 ? "#B91C1C" : owTotal < 0 ? "#1D4ED8" : "#15803D",
            (owBig !== 0 && owSmall !== 0) || owBig < 0 || owSmall < 0 ? `ใหญ่ ${owTxt(owBig)} · เล็ก ${owTxt(owSmall)}` : sizeSub(Math.max(0, owBig), Math.max(0, owSmall)))}
          {row.brokenPending > 0 && bigRow("📦 แผงชำรุดที่ฟาร์มเก็บไว้รอคืนลูกค้า", fmt(row.brokenPending), "#B45309", sizeSub(row.brokenPendingBig, row.brokenPendingSmall))}
          {row.chargedHeld > 0 && bigRow("🔵 แผงที่ยืมไป (จ่ายมัดจำแล้ว)", fmt(row.chargedHeld), "#1D4ED8")}
          {timeline.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#8a8170", marginBottom: 5 }}>รายการล่าสุด</div>
              {timeline.map((x, i) => (
                <div key={i} style={{ fontSize: 12, color: x.blue ? "#1D4ED8" : x.green ? "#15803D" : x.red ? "#7a4f16" : "#5b5347", padding: "2px 0" }}>
                  • {x.text}{x.tail ? <b style={{ color: "#2B2620" }}> → {x.tail}</b> : null}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12, background: "#FFF7EC", border: "1px solid #F5DEB9", borderRadius: 9, padding: "8px 11px", fontSize: 12, color: "#7A4F16", fontWeight: 700, whiteSpace: "nowrap", textAlign: "center", overflow: "hidden" }}>
            {owTotal > 0 ? <>🔄 รบกวนนำแผงดี {askQty} มาแลกคืนแผงชำรุดในรอบรับไข่ถัดไปค่ะ 🙏</> : <>✅ ไม่มีแผงค้างคืน ขอบคุณค่ะ 🙏</>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...S.primaryBtn, flex: 1.3 }} onClick={saveImage} disabled={saving}>{saving ? "กำลังสร้างรูป…" : "💾 บันทึกเป็นรูป (ส่ง LINE)"}</button>
          <button style={{ ...S.primaryBtn, flex: 1, background: "#fff", color: ACCENT_DK, border: `1.5px solid ${ACCENT_DK}` }} onClick={copy}>{copied ? "✓ คัดลอกแล้ว" : "📋 คัดลอกข้อความ"}</button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone, sub, unit = "แผง", onClick }) {
  const c = { amber: "#B45309", red: "#B91C1C", green: "#15803D", blue: "#1D4ED8" }[tone] || "#2B2620";
  const bg = { amber: "#FEF3C7", red: "#FEE2E2", green: "#DCFCE7", blue: "#DBEAFE" }[tone] || "#f3f0e9";
  return (
    <div style={{ ...S.sumCard, ...(onClick ? { cursor: "pointer" } : {}) }} className={onClick ? "sumCardClickable" : undefined} onClick={onClick} role={onClick ? "button" : undefined}>
      <div style={{ ...S.sumIcon, background: bg, color: c }}>{icon}</div>
      <div style={S.sumValue}>{fmt(value)} <span style={S.sumUnit}>{unit}</span></div>
      <div style={S.sumLabel}>{label}</div>
      {sub && <div style={S.sumSub}>{sub}</div>}
    </div>
  );
}

const STATUS_STYLE = {
  รอคัด: { bg: "#FEF3C7", c: "#B45309" }, รอส่งคืน: { bg: "#FEE2E2", c: "#B91C1C" },
  ส่งคืนแล้ว: { bg: "#DBEAFE", c: "#1D4ED8" }, ปิดรายการ: { bg: "#DCFCE7", c: "#15803D" },
};

/* รายงานคัดแผง — สรุปผลการคัดแผงที่ลูกค้าคืนมา: แผงดี(เข้าฟาร์ม) vs แผงชำรุด(รอส่งคืน/รอแลก) */
function TraySortReport({ trays, custName, waitingSort = 0 }) {
  const sorted = trays.filter((t) => t.sorted);  // เฉพาะใบที่คัดแล้ว
  const recv = (t) => sumTray(t.received), good = (t) => sumTray(t.sorted.good), broken = (t) => sumTray(t.sorted.broken), exch = (t) => sumTray(t.replacedGood);
  const totRecv = sorted.reduce((s, t) => s + recv(t), 0);
  const totGood = sorted.reduce((s, t) => s + good(t), 0);
  const totBroken = sorted.reduce((s, t) => s + broken(t), 0);
  const totExch = sorted.reduce((s, t) => s + exch(t), 0);
  const brokenOpen = Math.max(0, totBroken - totExch);  // ชำรุดที่ลูกค้ายังไม่เอาแผงดีมาแลก

  if (sorted.length === 0) return (
    <div style={S.emptyState}>
      <ClipboardCheck size={36} color="#d1d5db" />
      <div>ยังไม่มีการคัดแผง</div>
      <div style={{ fontSize: 12.5, color: "#9b9384" }}>{waitingSort > 0 ? `มีแผงรอคัด ${fmt(waitingSort)} แผง — ไปที่ "รายการแผงรอคัด" แล้วกด "คัดแยกแผง"` : 'รับแผงคืนก่อน แล้วกด "คัดแยกแผง"'}</div>
    </div>
  );

  return (
    <div>
      <div style={S.summaryGrid}>
        <SummaryCard icon={<RotateCcw size={18} />} label="รับคืนมาคัด" value={totRecv} tone="amber" sub={waitingSort > 0 ? `+ รอคัดอีก ${fmt(waitingSort)} แผง` : undefined} />
        <SummaryCard icon={<CheckCircle2 size={18} />} label="แผงดี → เข้าฟาร์ม" value={totGood} tone="green" />
        <SummaryCard icon={<AlertCircle size={18} />} label="ชำรุด รอลูกค้าเอาแผงดีมาแลก" value={brokenOpen} tone="red" />
        <SummaryCard icon={<RotateCcw size={18} />} label="แลกคืนแล้ว" value={totExch} tone="blue" />
      </div>
      <div style={S.tableScroll}>
        <table style={S.table}>
          <thead><tr>
            <th style={{ ...S.th, textAlign: "left" }}>ใบรับคืน</th>
            <th style={{ ...S.th, textAlign: "left" }}>ลูกค้า</th>
            <th style={S.th}>รับคืน</th>
            <th style={S.th}>คัดดี</th>
            <th style={S.th}>ชำรุด</th>
            <th style={S.th}>แลกแล้ว</th>
            <th style={S.th}>สถานะ</th>
            <th style={S.th}>คัดเมื่อ / ผู้คัด</th>
          </tr></thead>
          <tbody>
            {sorted.map((t) => {
              const st = STATUS_STYLE[t.status];
              const sizeCell = (o) => (o?.เล็ก || 0) > 0 ? <div style={{ fontSize: 10.5, color: "#9b9384", fontWeight: 400 }}>ใหญ่ {fmt(o.ใหญ่ || 0)} · เล็ก {fmt(o.เล็ก)}</div> : null;
              return (
                <tr key={t.id}>
                  <td style={{ ...S.td, textAlign: "left", fontWeight: 600 }}>{t.id}<div style={{ fontSize: 11, color: "#9b9384", fontWeight: 400 }}>รับ {t.date}</div></td>
                  <td style={{ ...S.td, textAlign: "left" }}>{custName(t.customerId)}</td>
                  <td style={S.td}>{fmt(recv(t))}{sizeCell(t.received)}</td>
                  <td style={{ ...S.td, color: "#15803D", fontWeight: 700 }}>{fmt(good(t))}{sizeCell(t.sorted.good)}</td>
                  <td style={{ ...S.td, color: "#B91C1C", fontWeight: 700 }}>{fmt(broken(t))}{sizeCell(t.sorted.broken)}</td>
                  <td style={{ ...S.td, color: exch(t) > 0 ? "#1D4ED8" : "#c9bfad" }}>{exch(t) > 0 ? fmt(exch(t)) : "-"}</td>
                  <td style={S.td}><span style={{ ...S.statusPill, background: st.bg, color: st.c }}>{t.status}</span></td>
                  <td style={{ ...S.td, fontSize: 12 }}>{t.sortedDate || "-"}{t.sorter ? ` · ${t.sorter}` : ""}</td>
                </tr>
              );
            })}
            <tr>
              <td style={{ ...S.td, ...S.tfoot, textAlign: "left" }} colSpan={2}>รวม ({fmt(sorted.length)} ใบ)</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(totRecv)}</td>
              <td style={{ ...S.td, ...S.tfoot, color: "#15803D" }}>{fmt(totGood)}</td>
              <td style={{ ...S.td, ...S.tfoot, color: "#B91C1C" }}>{fmt(totBroken)}</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(totExch)}</td>
              <td style={{ ...S.td, ...S.tfoot }} colSpan={2}>—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={S.hint}>แผงดี = รับกลับเข้าฟาร์ม · แผงชำรุด = ส่งคืนให้ลูกค้าเอาแผงดีมาแลก (ค้างทดแทน) · "แลกแล้ว" = ลูกค้าเอาแผงดีมาแลกครบแล้ว (ปิดรายการ)</div>
    </div>
  );
}

function TrayCard({ tray, custName, onSort, onReturned, onAnnounce, onReplace }) {
  const st = STATUS_STYLE[tray.status];
  const owed = tray.sorted ? sumTray(tray.sorted.broken) - sumTray(tray.replacedGood) : 0;
  const reps = tray.replacements || [];
  const repTotal = sumTray(tray.replacedGood || { ใหญ่: 0, เล็ก: 0 });
  const recvTotal = sumTray(tray.received);
  const goodTotal = tray.sorted ? sumTray(tray.sorted.good) : 0;
  const brokenTotal = tray.sorted ? sumTray(tray.sorted.broken) : 0;
  const missing = tray.sorted ? recvTotal - goodTotal - brokenTotal : 0;  // >0 = หาย (คัดได้น้อยกว่าที่คืน), <0 = คัดเกิน
  return (
    <div style={S.trayCard}>
      <div style={S.trayHead}>
        <div><span style={S.trayNo}>{tray.id}</span><span style={{ ...S.statusPill, background: st.bg, color: st.c }}>{tray.status}</span></div>
        <span style={S.trayDate}>{tray.date}</span>
      </div>
      <div style={S.trayCust}><User size={14} /> {custName}</div>
      <div style={S.trayStats}>
        <div><div style={S.tsLabel}>รับคืน</div><div style={S.tsVal}>{fmt(sumTray(tray.received))} แผง</div><div style={S.tsSub}>ใหญ่ {tray.received.ใหญ่} · เล็ก {tray.received.เล็ก}</div></div>
        {tray.sorted && <>
          <div><div style={S.tsLabel}>แผงดี</div><div style={{ ...S.tsVal, color: "#15803D" }}>{fmt(sumTray(tray.sorted.good))}</div><div style={S.tsSub}>เข้าสต็อกแล้ว</div></div>
          <div><div style={S.tsLabel}>ชำรุด</div><div style={{ ...S.tsVal, color: "#B91C1C" }}>{fmt(sumTray(tray.sorted.broken))}</div><div style={S.tsSub}>{tray.sorter ? "คัดโดย " + tray.sorter : ""}</div></div>
          {tray.status !== "ปิดรายการ"
            ? <div><div style={S.tsLabel}>ค้างทดแทน</div><div style={{ ...S.tsVal, color: owed > 0 ? "#B91C1C" : "#15803D" }}>{fmt(owed)}</div>{repTotal > 0 && <div style={S.tsSub}>ทดแทนแล้ว {fmt(repTotal)}</div>}</div>
            : <div><div style={S.tsLabel}>ทดแทนแล้ว</div><div style={{ ...S.tsVal, color: "#15803D" }}>{fmt(repTotal)}</div><div style={S.tsSub}>{reps.length} รอบ · ครบ</div></div>}
        </>}
      </div>
      {tray.sorted && (
        <div style={{ fontSize: 12.5, margin: "0 2px 8px", padding: "7px 11px", background: "#FBF8F2", borderRadius: 8, color: "#6b6358", border: missing > 0 ? "1px solid #f3d9a6" : "1px solid #efe7d8" }}>
          คืน <b style={{ color: INK }}>{fmt(recvTotal)}</b> → คัดดี <b style={{ color: "#15803D" }}>{fmt(goodTotal)}</b> · ชำรุด <b style={{ color: "#B91C1C" }}>{fmt(brokenTotal)}</b>
          {missing > 0 && <b style={{ color: "#B45309" }}> · หาย {fmt(missing)} ⚠️</b>}
          {missing < 0 && <b style={{ color: "#1D4ED8" }}> · คัดเกิน {fmt(-missing)}</b>}
          {missing === 0 && <span style={{ color: "#15803D" }}> · คัดครบ ✓</span>}
        </div>
      )}
      {(tray.sortedDate || reps.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "#6b6358", margin: "0 2px 8px" }}>
          {tray.sortedDate && <span><ClipboardCheck size={11} style={{ verticalAlign: -1 }} /> คัดแยกเสร็จ {tray.sortedDate}</span>}
          {reps.map((r, i) => (
            <span key={i} style={{ color: "#15803D" }}><RotateCcw size={11} style={{ verticalAlign: -1 }} /> รับแผงดีทดแทน รอบ {i + 1}: {fmt(sumTray(r))} แผง (ใหญ่ {r.ใหญ่ || 0} · เล็ก {r.เล็ก || 0}) · {r.date}</span>
          ))}
        </div>
      )}
      <div style={S.trayActions}>
        {tray.status === "รอคัด" ? (
          <button style={S.trayBtnPrimary} onClick={onSort}><ClipboardCheck size={15} /> คัดแยกแผง</button>
        ) : tray.status === "ปิดรายการ" ? (
          <span style={S.trayClosed}><Check size={14} /> ปิดรายการแล้ว{tray.replacedDate ? ` · ทดแทนครบ ${tray.replacedDate}` : ""}</span>
        ) : (
          <>
            <button style={S.trayBtnGhost} onClick={onAnnounce}><Send size={14} /> แจ้งลูกค้า (LINE)</button>
            <span style={{ fontSize: 11.5, color: "#9b8e78", alignSelf: "center" }}>แผงทดแทน → กด "รับคืนอีก" เข้าคิวคัด · คืนชำรุดให้ลูกค้า → แท็บ "สรุปแยกลูกค้า"</span>
          </>
        )}
      </div>
    </div>
  );
}

function SortModal({ tray, custName, onClose, onApply }) {
  // ตั้งค่าเริ่มจากยอดที่ลูกค้าคืนมา (assume ดีทั้งหมดก่อน) — แล้วผู้ใช้กรอกแผงดี/ชำรุดเองได้ทั้งคู่
  const [good, setGood] = useState({ ใหญ่: tray.received.ใหญ่, เล็ก: tray.received.เล็ก });
  const [broken, setBroken] = useState({ ใหญ่: 0, เล็ก: 0 });
  const [sorter, setSorter] = useState("");
  const [sortDate, setSortDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });  // วันที่คัดเสร็จ (ISO) ตั้งต้น = วันนี้
  const sortDateTH = sortDate ? new Date(sortDate).toLocaleDateString("th-TH") : new Date().toLocaleDateString("th-TH");
  // ใส่ช่องใดช่องหนึ่ง อีกช่องหักให้อัตโนมัติ (ดี + ชำรุด = รับคืน)
  const onGood = (k, raw) => {
    const g = Math.max(0, parseInt(raw) || 0);
    setGood((p) => ({ ...p, [k]: g }));
    setBroken((p) => ({ ...p, [k]: Math.max(0, tray.received[k] - g) }));
  };
  const onBroken = (k, raw) => {
    const b = Math.max(0, parseInt(raw) || 0);
    setBroken((p) => ({ ...p, [k]: b }));
    setGood((p) => ({ ...p, [k]: Math.max(0, tray.received[k] - b) }));
  };
  const totalRecv = sumTray(tray.received);
  const totalSorted = sumTray(good) + sumTray(broken);
  const diff = totalRecv - totalSorted;   // >0 = ขาดหาย (คัดไม่ครบ), <0 = คัดเกิน
  const valid = sorter.trim() && totalSorted > 0;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>คัดแยกแผงดำ</div><div style={S.modalSub}>{tray.id} · {custName} · ลูกค้าคืนมา {fmt(totalRecv)} แผง</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={S.sortTable}>
          <div style={S.sortHeadRow}><span></span><span>รับคืน</span><span style={{ color: "#15803D" }}>แผงดี</span><span style={{ color: "#B91C1C" }}>ชำรุด</span></div>
          {TRAY_KINDS.map((k) => (
            <div key={k} style={S.sortRow}>
              <span style={S.sortKind}>แผง{k}</span>
              <span style={S.sortRecv}>{tray.received[k]}</span>
              <input type="number" style={{ ...S.sortInput, borderColor: "#bfe3c8" }} value={good[k] || ""} placeholder="0" onChange={(e) => onGood(k, e.target.value)} />
              <input type="number" style={{ ...S.sortInput, borderColor: "#f0c9c9" }} value={broken[k] || ""} placeholder="0" onChange={(e) => onBroken(k, e.target.value)} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: "#9b8e78", margin: "-4px 2px 12px" }}>💡 ใส่ช่องใดช่องหนึ่ง อีกช่องจะหักให้อัตโนมัติ (ดี + ชำรุด = รับคืน)</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={S.ciLabel}>ผู้คัด</label>
            <input style={S.fullInput} placeholder="ชื่อเจ้าหน้าที่ที่คัด" value={sorter} onChange={(e) => setSorter(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.ciLabel}>วันที่คัดเสร็จ</label>
            <ThaiDateField value={sortDate} onChange={setSortDate} style={S.fullInput} />
          </div>
        </div>
        <div style={S.weighSummary}>
          <div style={S.wsRow}><span>ลูกค้าคืนมา</span><span style={{ fontWeight: 700, color: INK }}>{fmt(totalRecv)} แผง</span></div>
          <div style={S.wsRow}><span>แผงดี (เข้าสต็อกฟาร์ม)</span><span style={{ color: "#15803D", fontWeight: 700 }}>{fmt(sumTray(good))} แผง</span></div>
          <div style={S.wsRow}><span>แผงชำรุด (รอส่งคืน + ค้างทดแทน)</span><span style={{ color: "#B91C1C", fontWeight: 700 }}>{fmt(sumTray(broken))} แผง</span></div>
          <div style={{ ...S.wsRow, borderTop: "1px dashed #e3ddd0", paddingTop: 6, marginTop: 2 }}>
            <span>{diff > 0 ? "ขาดหาย (คัดไม่ครบ)" : diff < 0 ? "คัดเกินที่คืนมา" : "คัดครบพอดี"}</span>
            <span style={{ fontWeight: 700, color: diff > 0 ? "#B45309" : diff < 0 ? "#1D4ED8" : "#15803D" }}>{diff === 0 ? "0 แผง ✓" : `${fmt(Math.abs(diff))} แผง ${diff > 0 ? "⚠️" : ""}`}</span>
          </div>
        </div>
        {diff > 0 && <div style={{ fontSize: 12, color: "#B45309", marginBottom: 10, textAlign: "center" }}>คัดได้ (ดี+ชำรุด {fmt(totalSorted)}) น้อยกว่าที่คืนมา ({fmt(totalRecv)}) — หาย {fmt(diff)} แผง ตรวจอีกครั้ง (บันทึกต่อได้)</div>}
        <button style={{ ...S.primaryBtn, ...(valid ? {} : S.confirmBtnDisabled) }} disabled={!valid} onClick={() => onApply(tray.id, good, broken, sorter.trim(), sortDateTH)}>บันทึกการคัดแยก</button>
      </div>
    </div>
  );
}

// รับแผงดีทดแทน (ทีละรอบ พร้อมวันที่) — คืนได้บางส่วน หลายรอบ จนครบ แล้วปิดรายการเอง
function ReplaceModal({ tray, custName, onClose, onApply }) {
  const owed = { ใหญ่: Math.max(0, (tray.sorted.broken.ใหญ่ || 0) - (tray.replacedGood?.ใหญ่ || 0)), เล็ก: Math.max(0, (tray.sorted.broken.เล็ก || 0) - (tray.replacedGood?.เล็ก || 0)) };
  const [rep, setRep] = useState({ ใหญ่: "", เล็ก: "" });
  const [date, setDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const rN = { ใหญ่: parseInt(rep.ใหญ่) || 0, เล็ก: parseInt(rep.เล็ก) || 0 };
  const dateTH = date ? new Date(date).toLocaleDateString("th-TH") : new Date().toLocaleDateString("th-TH");
  const total = sumTray(rN), owedTotal = sumTray(owed);
  const reps = tray.replacements || [];
  const valid = total > 0 && date;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>รับแผงดีทดแทน</div><div style={S.modalSub}>{tray.id} · {custName}</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "9px 12px", marginBottom: 12, fontSize: 12.5, color: "#B91C1C" }}>
          ค้างทดแทน <b>{fmt(owedTotal)} แผง</b> · ใหญ่ {owed.ใหญ่} · เล็ก {owed.เล็ก}
        </div>
        {reps.length > 0 && (
          <div style={{ marginBottom: 12, fontSize: 12.5, color: "#6b6358" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>ทดแทนไปแล้ว {reps.length} รอบ:</div>
            {reps.map((r, i) => <div key={i} style={{ color: "#15803D" }}>• รอบ {i + 1}: {fmt(sumTray(r))} แผง (ใหญ่ {r.ใหญ่ || 0} · เล็ก {r.เล็ก || 0}) — {r.date}</div>)}
          </div>
        )}
        <div style={S.sortTable}>
          <div style={{ ...S.sortHeadRow, gridTemplateColumns: "1fr 1fr" }}><span></span><span style={{ color: "#15803D" }}>รับทดแทนรอบนี้</span></div>
          {TRAY_KINDS.map((k) => (
            <div key={k} style={{ ...S.sortRow, gridTemplateColumns: "1fr 1fr" }}>
              <span style={S.sortKind}>แผง{k}</span>
              <input type="number" style={{ ...S.sortInput, borderColor: "#bfe3c8" }} value={rep[k]} placeholder="0" onChange={(e) => setRep((p) => ({ ...p, [k]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={S.ciLabel}>วันที่รับแผงดีคืน</label>
          <ThaiDateField value={date} onChange={setDate} style={S.fullInput} />
        </div>
        <div style={S.weighSummary}>
          <div style={S.wsRow}><span>รับทดแทนรอบนี้</span><span style={{ color: "#15803D", fontWeight: 700 }}>{fmt(total)} แผง</span></div>
          <div style={{ ...S.wsRow, borderTop: "1px dashed #e3ddd0", paddingTop: 6, marginTop: 2 }}><span>คงเหลือค้างทดแทน</span><span style={{ fontWeight: 700, color: owedTotal - total <= 0 ? "#15803D" : "#B45309" }}>{fmt(Math.max(0, owedTotal - total))} แผง{owedTotal - total <= 0 ? " · ครบ → ปิดรายการ ✓" : ""}</span></div>
        </div>
        <button style={{ ...S.primaryBtn, ...(valid ? {} : S.confirmBtnDisabled) }} disabled={!valid} onClick={() => onApply(tray.id, rN, dateTH)}>บันทึกรับแผงดีทดแทน</button>
      </div>
    </div>
  );
}

function LineModal({ tray, custName, onClose }) {
  const [copied, setCopied] = useState(false);
  const b = tray.sorted.broken, g = tray.sorted.good;
  const text = [
    `📋 แจ้งผลคัดแผงดำ ${tray.id}`,
    `ลูกค้า: ${custName}`, `วันที่รับคืน ${tray.date}`,
    ...(tray.sortedDate ? [`วันที่คัดแยกเสร็จ ${tray.sortedDate}`] : []), ``,
    `รับแผงคืน ${fmt(sumTray(tray.received))} แผง (ใหญ่ ${tray.received.ใหญ่} · เล็ก ${tray.received.เล็ก})`,
    `คัดเป็นแผงดี ${fmt(sumTray(g))} แผง`,
    `ชำรุด ${fmt(sumTray(b))} แผง (ใหญ่ ${b.ใหญ่} · เล็ก ${b.เล็ก})`, ``,
    `🔄 กรุณานำแผงดีมาคืนทดแทนแผงชำรุด ${fmt(sumTray(b))} แผง`,
    `แผงชำรุดทางฟาร์มเก็บไว้ส่งคืนพร้อมเที่ยวส่งไข่ครั้งถัดไป`,
  ].join("\n");
  const copy = () => { if (navigator.clipboard) navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>ข้อความแจ้งลูกค้า</div><div style={S.modalSub}>คัดลอกไปวางในกลุ่ม LINE</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={S.linePreview}>{text}</div>
        <button style={S.primaryBtn} onClick={copy}>{copied ? <><Check size={16} /> คัดลอกแล้ว</> : <><Copy size={16} /> คัดลอกข้อความ</>}</button>
      </div>
    </div>
  );
}

// รับแผงคืน (ขั้นที่ 1) — บันทึกแผงที่ลูกค้าคืน แยกใหญ่/เล็ก → เข้าคิว "รอคัด" (คัดดี/ชำรุดในขั้นถัดไป)
function NewReturnModal({ onClose, onAdd, bills = [], trays = [], trayEvents = [], initialCustomerId = "" }) {
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [received, setReceived] = useState({ ใหญ่: "", เล็ก: "" });
  const [recvDate, setRecvDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const rN = { ใหญ่: parseInt(received.ใหญ่) || 0, เล็ก: parseInt(received.เล็ก) || 0 };
  const totalRecv = sumTray(rN);
  const recvDateTH = recvDate ? new Date(recvDate).toLocaleDateString("th-TH") : new Date().toLocaleDateString("th-TH");
  const valid = customerId && totalRecv > 0;
  const acc = customerId ? trayAccountOf(customerId, bills, trays, null, trayEvents) : null;  // อ้างอิง: ลูกค้ายืมแผงไปเท่าไร (จากบิล)
  const heldRef = acc ? acc.heldCount + acc.carriedOwed : 0;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>รับแผงคืน</div><div style={S.modalSub}>บันทึกแผงที่ลูกค้าคืน (ใหญ่/เล็ก) → เข้าคิวรอคัด · แผงทดแทนก็บันทึกที่นี่ (คัดแล้วระบบหักค้างทดแทนให้เอง)</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={S.ciLabel}>ลูกค้า</label>
          <select style={S.fullInput} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— เลือกลูกค้า —</option>
            {CUSTOMERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {acc && heldRef > 0 && (
          <div style={{ background: "#F5F1E8", borderRadius: 10, padding: "9px 12px", marginBottom: 12, fontSize: 12.5, color: "#6b6358" }}>
            ลูกค้ายืมแผงไป <b style={{ color: INK }}>{fmt(heldRef)} แผง</b>
            {(acc.heldOrange > 0 || acc.heldBlack > 0) && <span> · {heldBreakdown(acc)}</span>}
            <div style={{ color: "#9b8e78", marginTop: 2 }}>อ้างอิงจากบิล — กรอกจำนวนจริงที่ลูกค้าคืนด้านล่าง</div>
          </div>
        )}
        <div style={S.sortTable}>
          <div style={{ ...S.sortHeadRow, gridTemplateColumns: "1fr 1fr" }}><span></span><span>จำนวนที่คืน</span></div>
          {TRAY_KINDS.map((k) => (
            <div key={k} style={{ ...S.sortRow, gridTemplateColumns: "1fr 1fr" }}>
              <span style={S.sortKind}>แผง{k}</span>
              <input type="number" style={S.sortInput} value={received[k]} placeholder="0" onChange={(e) => setReceived((p) => ({ ...p, [k]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={S.ciLabel}>วันที่รับคืน</label>
          <ThaiDateField value={recvDate} onChange={setRecvDate} style={S.fullInput} />
        </div>
        <div style={S.weighSummary}>
          <div style={{ ...S.wsRow, fontWeight: 700 }}><span>รวมรับคืน</span><span style={{ color: INK }}>{fmt(totalRecv)} แผง</span></div>
          <div style={{ fontSize: 12, color: "#9b8e78", marginTop: 3 }}>คัดดี/ชำรุดในขั้นถัดไป — กด “คัดแยกแผง” ที่รายการแผงรอคัด</div>
        </div>
        <button style={{ ...S.primaryBtn, marginTop: 4, ...(valid ? {} : S.confirmBtnDisabled) }} disabled={!valid}
          onClick={() => onAdd(customerId, rN, recvDateTH)}>บันทึกรับคืน → รอคัด</button>
      </div>
    </div>
  );
}

/* ============================================================
   จอง·วางแผน — ลูกค้าจองไข่ล่วงหน้า + วางแผนขายเทียบไข่ที่คาดว่าจะได้พรุ่งนี้
============================================================ */
// ชนิดไข่ที่ให้จอง (เบอร์ + ตกเกรด + พิเศษ ; ข้ามคละที่คิดตามน้ำหนัก)
const BOOKING_GROUPS = [
  { group: "เบอร์", items: PRODUCTS["เบอร์"] || [] },
  { group: "ตกเกรด", items: PRODUCTS["ตกเกรด"] || [] },
  { group: "พิเศษ", items: PRODUCTS["พิเศษ"] || [] },
];
const BOOKING_IDS = BOOKING_GROUPS.flatMap((g) => g.items.map((p) => p.id));
// ประมาณการไข่ (แผง) ต่อชนิด สำหรับวันที่ระบุ = ใช้ "วันผลิตล่าสุด (≤ วันนั้น)" เป็นตัวตั้ง
// เบอร์เก็บเป็นฟอง → ÷30 เป็นแผง ; ตกเกรดเก็บเป็นแผงอยู่แล้ว
function autoEstimate(production, dateISO) {
  const dates = Object.keys(production || {}).sort();
  if (!dates.length) return { base: null, est: {} };
  const base = dates.filter((d) => d <= dateISO).pop() || dates[dates.length - 1];
  const est = {};
  (production[base] || []).forEach((h) => {
    BER_KEYS.forEach((k) => { est["n" + k] = (est["n" + k] || 0) + Math.round((h.grade?.เบอร์?.[k] || 0) / PER_PRADANG); });
    OFF_KEYS.forEach((k) => { const pid = OFF_TO_PID[k]; if (pid) est[pid] = (est[pid] || 0) + (h.grade?.ตกเกรด?.[k] || 0); });
  });
  return { base, est };
}
const bookingTotal = (items) => Object.values(items || {}).reduce((s, v) => s + (parseInt(v) || 0), 0);

function BookingPlanView({ bookings = [], addBooking, updateBooking, deleteBooking, production = {}, planEstimates = {}, setPlanEstimate }) {
  const [mode, setMode] = useState("plan");   // plan | book
  const chip = (on) => ({ border: `1.5px solid ${on ? ACCENT_DK : "#e3ddd0"}`, background: on ? ACCENT_DK : "#fff", color: on ? "#fff" : "#7a6f5c", borderRadius: 999, padding: "7px 15px", cursor: "pointer", fontWeight: 800, fontSize: 13, fontFamily: "inherit" });
  return (
    <div style={S.wide}>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>จองไข่ล่วงหน้า · วางแผนการขาย</span>
        <div style={{ display: "flex", gap: 7 }}>
          <button style={chip(mode === "book")} onClick={() => setMode("book")}>🛒 รับจอง (ลูกค้า)</button>
          <button style={chip(mode === "plan")} onClick={() => setMode("plan")}>📊 วางแผนพรุ่งนี้</button>
        </div>
      </div>
      {mode === "book"
        ? <BookingEntry bookings={bookings} addBooking={addBooking} updateBooking={updateBooking} deleteBooking={deleteBooking} />
        : <PlanBoard bookings={bookings} production={production} planEstimates={planEstimates} setPlanEstimate={setPlanEstimate} />}
    </div>
  );
}

/* 🛒 หน้ารับจอง — ลูกค้า (หรือเรา) เลือกลูกค้า + วันส่ง แล้วใส่จำนวนไข่แต่ละชนิด */
function BookingEntry({ bookings, addBooking, updateBooking, deleteBooking }) {
  const tmr = shiftDayISO(isoFromTs(Date.now()), 1);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(tmr);
  const [items, setItems] = useState({});
  const [note, setNote] = useState("");
  const [editId, setEditId] = useState(null);
  const custName = (id) => CUSTOMERS.find((c) => c.id === id)?.name || "—";
  const setQty = (pid, v) => setItems((p) => { const n = { ...p }; const q = v.replace(/[^0-9]/g, ""); if (q) n[pid] = q; else delete n[pid]; return n; });
  const total = bookingTotal(items);
  const reset = () => { setCustomerId(""); setItems({}); setNote(""); setEditId(null); };
  const save = () => {
    if (!customerId || total <= 0) return;
    const clean = {}; Object.entries(items).forEach(([k, v]) => { if (parseInt(v) > 0) clean[k] = parseInt(v); });
    if (editId) updateBooking(editId, { customerId, date, items: clean, note: note.trim() });
    else addBooking({ customerId, date, items: clean, note: note.trim() });
    reset();
  };
  const edit = (b) => { setEditId(b.id); setCustomerId(b.customerId); setDate(b.date); setItems(Object.fromEntries(Object.entries(b.items || {}).map(([k, v]) => [k, String(v)]))); setNote(b.note || ""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const dayBookings = bookings.filter((b) => b.date === date).sort((a, b) => custName(a.customerId).localeCompare(custName(b.customerId), "th"));
  const inp = { width: "100%", padding: "8px 9px", border: "1.5px solid #e3ddd0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", textAlign: "right", background: "#fff" };
  const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, color: "#7a6f5c", marginBottom: 3 };
  return (
    <div style={S.trayWrap}>
      <div style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, color: ACCENT_DK, marginBottom: 10 }}>{editId ? "✎ แก้ไขใบจอง" : "＋ รับจองไข่ใหม่"}</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ flex: "1 1 200px" }}><label style={lbl}>ลูกค้า</label>
            <select style={{ ...inp, textAlign: "left" }} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— เลือกลูกค้า —</option>
              {CUSTOMERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 170px" }}><label style={lbl}>วันที่ส่ง / รับไข่</label><ThaiDateField value={date} onChange={setDate} style={{ ...inp, textAlign: "left" }} /></div>
        </div>
        {BOOKING_GROUPS.map((g) => (
          <div key={g.group} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#9b8e78", marginBottom: 5 }}>{g.group}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
              {g.items.map((p) => (
                <div key={p.id}><label style={lbl}>{p.name}</label>
                  <input style={{ ...inp, ...(items[p.id] ? { borderColor: ACCENT, background: "#FFFBF3" } : {}) }} inputMode="numeric" placeholder="0" value={items[p.id] || ""} onChange={(e) => setQty(p.id, e.target.value)} /></div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ marginBottom: 12 }}><label style={lbl}>หมายเหตุ</label><input style={{ ...inp, textAlign: "left" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น รับ 09.00 · ส่งสาขา" /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>รวมจอง <span style={{ color: ACCENT_DK, fontSize: 20 }}>{fmt(total)}</span> แผง</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {editId && <button onClick={reset} style={{ ...S.ghostBtn, padding: "9px 16px" }}>ยกเลิกแก้ไข</button>}
            <button disabled={!customerId || total <= 0} onClick={save} style={{ ...S.primaryBtn, width: "auto", padding: "9px 22px", opacity: (customerId && total > 0) ? 1 : 0.5 }}>{editId ? "บันทึกการแก้ไข" : "บันทึกใบจอง"}</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span style={{ fontWeight: 800, color: INK, fontSize: 15 }}>ใบจองวันที่ {toThaiDate(date, false)}</span>
        <span style={{ fontSize: 13, color: "#9b8e78" }}>{dayBookings.length} ราย · รวม {fmt(dayBookings.reduce((s, b) => s + bookingTotal(b.items), 0))} แผง</span>
      </div>
      {dayBookings.length === 0 ? (
        <div style={S.emptyState}><Calendar size={34} color="#d1d5db" /><div>ยังไม่มีใบจองของวันนี้ — กรอกด้านบนแล้วบันทึก</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dayBookings.map((b) => (
            <div key={b.id} style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 12, padding: "11px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <User size={15} color={ACCENT_DK} /><span style={{ fontWeight: 800, color: INK }}>{custName(b.customerId)}</span>
                <span style={{ fontWeight: 800, color: ACCENT_DK }}>· {fmt(bookingTotal(b.items))} แผง</span>
                {b.note ? <span style={{ fontSize: 12, color: "#9b8e78" }}>· {b.note}</span> : null}
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={() => edit(b)} style={{ border: "1px solid #d8cdb6", background: "#fff", color: "#7a6f5c", borderRadius: 7, padding: "2px 9px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>✎ แก้</button>
                  <button onClick={() => { if (window.confirm(`ลบใบจองของ ${custName(b.customerId)}?`)) deleteBooking(b.id); }} style={{ border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 7, padding: "2px 8px", cursor: "pointer", fontWeight: 800, fontSize: 12 }}>✕</button>
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(b.items || {}).map(([pid, q]) => (
                  <span key={pid} style={{ fontSize: 12.5, background: "#F6F1E7", borderRadius: 8, padding: "3px 9px", color: "#5b5347", fontWeight: 600 }}>{PRODUCT_BY_ID[pid]?.name || pid} <b style={{ color: INK }}>{fmt(q)}</b></span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* 📊 กระดานวางแผน — ประมาณการไข่พรุ่งนี้ (แก้ได้) vs ยอดจองรวม → เหลือขายได้อีกเท่าไร ต่อชนิด */
function PlanBoard({ bookings, production, planEstimates, setPlanEstimate }) {
  const tmr = shiftDayISO(isoFromTs(Date.now()), 1);
  const [date, setDate] = useState(tmr);
  const custName = (id) => CUSTOMERS.find((c) => c.id === id)?.name || "—";
  const { base, est: auto } = useMemo(() => autoEstimate(production, date), [production, date]);
  const override = planEstimates[date] || {};
  const estOf = (pid) => { const o = override[pid]; return o != null && o !== "" ? (parseInt(o) || 0) : (auto[pid] || 0); };
  const dayBookings = bookings.filter((b) => b.date === date);
  const demandOf = (pid) => dayBookings.reduce((s, b) => s + (parseInt(b.items?.[pid]) || 0), 0);
  // เฉพาะชนิดที่มี ประมาณการ หรือ ยอดจอง (ไม่โชว์แถวว่างเปล่า)
  const shownIds = BOOKING_IDS.filter((pid) => estOf(pid) > 0 || demandOf(pid) > 0);
  const totEst = shownIds.reduce((s, pid) => s + estOf(pid), 0);
  const totDemand = shownIds.reduce((s, pid) => s + demandOf(pid), 0);
  const totLeft = totEst - totDemand;
  const th = { padding: "9px 10px", fontSize: 12.5, fontWeight: 800, color: "#7a6f5c", background: "#F6F1E7", borderBottom: "2px solid #e6ddca", textAlign: "right", whiteSpace: "nowrap" };
  const td = { padding: "7px 10px", fontSize: 13.5, borderBottom: "1px solid #f3eee2", textAlign: "right" };
  const estInp = { width: 78, padding: "5px 7px", border: "1.5px solid #e3ddd0", borderRadius: 7, fontSize: 13.5, fontFamily: "inherit", textAlign: "right", outline: "none", background: "#fff" };
  return (
    <div style={S.trayWrap}>
      <div style={S.subBar}>
        <span style={{ fontSize: 13, color: "#7a6f5c", fontWeight: 700 }}>วางแผนขายวันที่</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setDate(shiftDayISO(date, -1))} style={S.ghostBtn}><ChevronLeft size={16} /></button>
          <ThaiDateField value={date} onChange={setDate} style={{ minWidth: 180 }} />
          <button onClick={() => setDate(shiftDayISO(date, 1))} style={S.ghostBtn}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: "#9b8e78", margin: "2px 2px 12px" }}>
        {base ? <>ประมาณการไข่จากผลผลิตวันล่าสุด <b>{toThaiDate(base, false)}</b> (แก้ตัวเลขได้ตามที่คาด) · เทียบกับยอดจองของวันที่วางแผน</> : "ยังไม่มีข้อมูลผลผลิตให้ประมาณการ — ใส่ตัวเลขคาดการณ์เองได้"}
      </div>
      <div style={S.summaryGrid}>
        <SummaryCard icon={<Egg size={18} />} label="ประมาณการไข่รวม" value={totEst} tone="green" sub="แผงที่คาดว่าจะได้" />
        <SummaryCard icon={<ClipboardCheck size={18} />} label="จองแล้วรวม" value={totDemand} tone="amber" sub={`${dayBookings.length} ใบจอง`} />
        <SummaryCard icon={<Package size={18} />} label={totLeft >= 0 ? "เหลือขายได้อีก" : "จองเกินของที่มี"} value={Math.abs(totLeft)} tone={totLeft >= 0 ? "blue" : "red"} sub={totLeft >= 0 ? "แผง" : "แผง — ต้องเพิ่มไข่/ลดจอง"} />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 420px", background: "#fff", border: "1px solid #eee3cd", borderRadius: 14, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>ชนิดไข่</th>
              <th style={{ ...th, color: "#15803D" }}>ประมาณการ</th>
              <th style={{ ...th, color: "#B45309" }}>จองแล้ว</th>
              <th style={th}>เหลือขายได้</th>
            </tr></thead>
            <tbody>
              {shownIds.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: "center", color: "#9b8e78", padding: "22px" }}>ยังไม่มีประมาณการหรือยอดจองของวันนี้</td></tr>}
              {shownIds.map((pid) => {
                const e = estOf(pid), d = demandOf(pid), left = e - d;
                return (
                  <tr key={pid}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{PRODUCT_BY_ID[pid]?.name || pid}</td>
                    <td style={td}><input style={estInp} inputMode="numeric" value={override[pid] != null && override[pid] !== "" ? override[pid] : (auto[pid] || 0)} onChange={(ev) => setPlanEstimate(date, pid, ev.target.value.replace(/[^0-9]/g, ""))} /></td>
                    <td style={{ ...td, color: d > 0 ? "#B45309" : "#c9bfad", fontWeight: 700 }}>{d > 0 ? fmt(d) : "-"}</td>
                    <td style={{ ...td, fontWeight: 800, color: left < 0 ? "#B91C1C" : left === 0 ? "#15803D" : "#1D4ED8" }}>{left < 0 ? `ขาด ${fmt(-left)}` : fmt(left)}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ ...td, ...S.tfoot, textAlign: "left" }}>รวม</td>
                <td style={{ ...td, ...S.tfoot, color: "#15803D" }}>{fmt(totEst)}</td>
                <td style={{ ...td, ...S.tfoot, color: "#B45309" }}>{fmt(totDemand)}</td>
                <td style={{ ...td, ...S.tfoot, color: totLeft < 0 ? "#B91C1C" : "#1D4ED8" }}>{totLeft < 0 ? `ขาด ${fmt(-totLeft)}` : fmt(totLeft)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ flex: "1 1 300px" }}>
          <div style={{ fontWeight: 800, color: INK, marginBottom: 8 }}>ลูกค้าที่จองไว้ ({dayBookings.length})</div>
          {dayBookings.length === 0 ? (
            <div style={{ fontSize: 13, color: "#9b8e78", background: "#fff", border: "1px dashed #d8cdb6", borderRadius: 12, padding: "18px", textAlign: "center" }}>ยังไม่มีใครจองวันนี้ — ไปที่ “🛒 รับจอง” เพื่อเพิ่ม</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {dayBookings.slice().sort((a, b) => bookingTotal(b.items) - bookingTotal(a.items)).map((b) => (
                <div key={b.id} style={{ background: "#fff", border: "1px solid #eee3cd", borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <User size={14} color={ACCENT_DK} /><span style={{ fontWeight: 700, color: INK }}>{custName(b.customerId)}</span>
                  {b.note ? <span style={{ fontSize: 11.5, color: "#9b8e78" }}>· {b.note}</span> : null}
                  <span style={{ marginLeft: "auto", fontWeight: 800, color: ACCENT_DK }}>{fmt(bookingTotal(b.items))} แผง</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Styles
============================================================ */
const ACCENT = "#E8943A", ACCENT_DK = "#C9742A", INK = "#2B2620", PAPER = "#FBF8F2";

const S = {
  app: { fontFamily: "'Noto Sans Thai', system-ui, sans-serif", background: PAPER, minHeight: "100vh", color: INK, paddingBottom: 32 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "#fff", borderBottom: "1px solid #ece6da", position: "sticky", top: 0, zIndex: 20, flexWrap: "wrap", gap: 12 },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  brandMark: { width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DK})`, color: "#fff", display: "grid", placeItems: "center" },
  brandName: { fontWeight: 700, fontSize: 16 },
  brandSub: { fontSize: 11.5, color: "#9b9384" },
  nav: { display: "flex", gap: 6, flexWrap: "wrap" },
  navBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", border: "1px solid #ece6da", background: "#fff", borderRadius: 10, fontSize: 13.5, fontWeight: 600, color: "#6b6358", cursor: "pointer", fontFamily: "inherit" },
  navBtnActive: { background: INK, color: "#fff", borderColor: INK },

  subBar: { display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1180, margin: "0 auto", padding: "16px 20px 0", flexWrap: "wrap", gap: 10 },
  subBarTitle: { fontSize: 15, fontWeight: 700 },
  ghostBtn: { background: "transparent", border: "1px solid #ddd5c7", borderRadius: 9, padding: "8px 14px", fontSize: 13, color: "#6b6358", cursor: "pointer", fontFamily: "inherit" },
  primarySmBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DK})`, color: "#fff", border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },

  stage: { maxWidth: 720, margin: "0 auto", padding: "24px 20px" },
  wide: { maxWidth: 1180, margin: "0 auto", padding: "0 20px" },
  stageLabel: { fontSize: 13, fontWeight: 700, color: "#9b9384", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 },
  customerGrid: { display: "flex", flexDirection: "column", gap: 10 },
  custChips: { display: "flex", gap: 9, marginBottom: 18, flexWrap: "wrap" },
  custChip: { padding: "11px 20px", border: "1px solid #ece6da", background: "#fff", borderRadius: 24, fontSize: 15, fontWeight: 600, color: "#6b6358", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8 },
  custChipActive: { background: INK, color: "#fff", borderColor: INK },
  custChipCount: { fontSize: 13, fontWeight: 700, opacity: 0.65 },
  custGroupBlock: { marginBottom: 22 },
  custGroupHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingBottom: 6, borderBottom: "2px solid #f0ece2" },
  custGroupName: { fontSize: 14, fontWeight: 700, color: ACCENT_DK },
  custGroupCount: { fontSize: 12, color: "#9b9384", background: "#f3f0e9", padding: "2px 10px", borderRadius: 12 },
  customerCard: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "#fff", border: "1px solid #ece6da", borderRadius: 14, cursor: "pointer", fontFamily: "inherit" },
  custIcon: { width: 38, height: 38, borderRadius: 10, background: "#FBEFDD", color: ACCENT_DK, display: "grid", placeItems: "center" },
  custName: { fontWeight: 600, fontSize: 15 },
  custPhone: { fontSize: 12.5, color: "#9b9384" },

  workspace: { display: "grid", gridTemplateColumns: "1fr 390px", gap: 16, maxWidth: 1180, margin: "0 auto", padding: "16px 20px", alignItems: "start" },
  catalog: { background: "#fff", border: "1px solid #ece6da", borderRadius: 16, padding: 16 },
  searchBox: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#f7f4ed", borderRadius: 10, marginBottom: 12 },
  searchInput: { border: "none", background: "transparent", outline: "none", fontSize: 14, flex: 1, fontFamily: "inherit", color: INK },
  tabs: { display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" },
  tab: { flex: 1, padding: "9px 6px", border: "1px solid #ece6da", background: "#fff", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "#6b6358", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  tabActive: { background: INK, color: "#fff", borderColor: INK },
  productList: { display: "flex", flexDirection: "column", gap: 2, maxHeight: 520, overflowY: "auto" },
  productRow: { display: "flex", alignItems: "center", gap: 10, padding: "11px 8px", borderBottom: "1px solid #f3f0e9" },
  prodName: { fontWeight: 600, fontSize: 14.5 },
  prodMeta: { display: "flex", gap: 12, fontSize: 12, marginTop: 3, flexWrap: "wrap" },
  lastPrice: { color: ACCENT_DK, fontWeight: 600 },
  noPrice: { color: "#b5ad9e", fontStyle: "italic" },
  addBtn: { display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 12px", background: INK, color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  stepper: { display: "flex", alignItems: "center", gap: 8, background: "#f7f4ed", borderRadius: 9, padding: 3 },
  stepBtn: { width: 30, height: 30, borderRadius: 7, border: "none", background: "#fff", color: INK, display: "grid", placeItems: "center", cursor: "pointer" },
  stepQty: { minWidth: 24, textAlign: "center", fontWeight: 700, fontSize: 14 },
  qtyInput: { width: 64, padding: "6px 4px", border: "1px solid #e3ddd0", borderRadius: 7, fontSize: 15, fontWeight: 700, fontFamily: "inherit", textAlign: "center", outline: "none", background: "#fff" },
  addRow: { display: "flex", alignItems: "center", gap: 6 },
  addQtyInput: { width: 72, padding: "8px", border: `1px solid ${ACCENT}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", textAlign: "center", outline: "none", background: "#fff" },

  cartPanel: { background: "#fff", border: "1px solid #ece6da", borderRadius: 16, position: "sticky", top: 84, maxHeight: "calc(100vh - 100px)", overflowY: "auto", display: "flex", flexDirection: "column" },
  salesSticky: { position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, background: "#fff", borderTop: "1px solid #ece6da", boxShadow: "0 -4px 18px rgba(0,0,0,.10)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stickyConfirm: { display: "inline-flex", alignItems: "center", gap: 7, padding: "12px 20px", border: "none", background: "#15803D", color: "#fff", borderRadius: 11, fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", flexShrink: 0 },
  stickyView: { display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 18px", border: `1.5px solid ${ACCENT}`, background: "#fff", color: ACCENT_DK, borderRadius: 11, fontSize: 14.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", flexShrink: 0 },
  cartHead: { display: "flex", alignItems: "center", gap: 8, padding: "16px 16px 12px", fontWeight: 700, fontSize: 15, borderBottom: "1px solid #f3f0e9" },
  emptyCart: { padding: "40px 24px", textAlign: "center", color: "#9b9384", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontSize: 14 },
  emptyHint: { fontSize: 12.5, color: "#b5ad9e" },
  cartList: { padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 7, minHeight: 50 },
  cartItem: { background: "#fbf9f4", border: "1px solid #f0ece2", borderRadius: 10, padding: "6px 10px" },
  ciTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  ciName: { fontWeight: 600, fontSize: 13 },
  ciDel: { background: "transparent", border: "none", color: "#c4998a", cursor: "pointer", padding: 2 },
  ciControls: { display: "flex", alignItems: "flex-end", gap: 6 },
  ciField: { flex: 1 },
  ciLabel: { fontSize: 10.5, color: "#9b9384", display: "block", marginBottom: 3 },
  ciInput: { width: "100%", padding: "4px 6px", border: "1px solid #e3ddd0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", textAlign: "center", outline: "none", boxSizing: "border-box" },
  ciX: { color: "#bbb", paddingBottom: 5 },
  ciSubWrap: { textAlign: "right", minWidth: 52 },
  ciSub: { fontWeight: 700, fontSize: 14, paddingTop: 2 },
  overWarn: { marginTop: 8, display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#dc2626", fontWeight: 600 },

  trayBox: { margin: "0 12px 12px", padding: 12, background: "#FAF6EE", border: "1px solid #f0ece2", borderRadius: 12 },
  trayBoxTitle: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: ACCENT_DK, marginBottom: 8 },
  trayBoxGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, alignItems: "center" },
  trayBoxHd: { fontSize: 11, color: "#9b9384", textAlign: "center", fontWeight: 600 },
  trayBoxKind: { fontSize: 13, fontWeight: 600 },
  trayBoxInput: { padding: "6px", border: "1px solid #e3ddd0", borderRadius: 7, fontSize: 13, fontFamily: "inherit", textAlign: "center", outline: "none", width: "100%", boxSizing: "border-box" },
  depositLine: { marginTop: 8, fontSize: 12, color: ACCENT_DK, textAlign: "center" },

  cartFooter: { borderTop: "1px solid #f3f0e9", padding: 16 },
  sumRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b6358", marginBottom: 6 },
  sumTotal: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, fontWeight: 700, marginTop: 4 },
  sumBaht: { fontSize: 22, color: ACCENT_DK },
  discountRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", marginTop: 2 },
  discountLabel: { fontSize: 13, color: "#6b6358", fontWeight: 600 },
  discountInputWrap: { display: "flex", alignItems: "center", gap: 6 },
  discountInput: { width: 80, padding: "6px 8px", border: `1px solid ${ACCENT}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", textAlign: "right", outline: "none" },
  discountUnit: { fontSize: 12.5, color: "#9b9384" },
  carryRow: { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderTop: "1px dashed #e3ddd0" },
  grandRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, marginTop: 6, fontWeight: 700, padding: "10px 12px", background: "#FEF2F2", borderRadius: 10 },
  grandBaht: { fontSize: 22, color: "#B91C1C", fontWeight: 800 },
  noteTotalSub: { display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700, padding: "8px 0", borderTop: "1px solid #e3ddd0", marginTop: 4 },
  confirmBtn: { width: "100%", padding: "13px", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DK})`, color: "#fff", border: "none", borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  confirmBtnDisabled: { background: "#d6d0c4", cursor: "not-allowed" },
  footWarn: { marginTop: 8, fontSize: 12, color: "#dc2626", textAlign: "center" },

  billDone: { textAlign: "center", padding: "16px 0 24px" },
  billDoneIcon: { width: 56, height: 56, borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "grid", placeItems: "center", margin: "0 auto 12px" },
  billDoneTitle: { fontWeight: 700, fontSize: 17 },
  billNo: { color: "#9b9384", fontSize: 13.5, marginTop: 4 },
  receipt: { background: "#fff", border: "1px solid #ece6da", borderRadius: 16, padding: 20, marginBottom: 16 },
  receiptHead: { display: "flex", justifyContent: "space-between", paddingBottom: 14, borderBottom: "1px dashed #e3ddd0", marginBottom: 12 },
  rcLabel: { fontSize: 11, color: "#9b9384" },
  rcVal: { fontWeight: 600, fontSize: 15 },
  rcValSm: { fontSize: 13 },
  rcRow: { display: "flex", alignItems: "center", gap: 10, padding: "7px 0" },
  rcItemName: { fontWeight: 600, fontSize: 14 },
  rcQty: { fontSize: 13, color: "#6b6358" },
  rcSub: { fontWeight: 700, minWidth: 64, textAlign: "right" },
  rcSubtotalRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b6358", padding: "5px 0", borderTop: "1px dashed #e3ddd0", marginTop: 6 },
  rcTotal: { display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid #e3ddd0", marginTop: 8, paddingTop: 14, fontWeight: 700 },
  rcTotalBaht: { fontSize: 22, color: ACCENT_DK },
  trayFooter: { marginTop: 14, paddingTop: 12, borderTop: "1px dashed #e3ddd0", fontSize: 12.5, color: "#6b6358", display: "flex", flexDirection: "column", gap: 3 },
  trayNote: { fontSize: 11.5, color: "#b5ad9e", marginTop: 4, fontStyle: "italic" },

  // ===== ใบส่งของน่ารัก =====
  note: { background: "#fff", borderRadius: 18, overflow: "hidden", marginBottom: 16, boxShadow: "0 6px 24px rgba(201,116,42,0.10)", border: "1px solid #f0e6d6" },
  noteTopStripe: { height: 8, background: `linear-gradient(90deg, ${ACCENT}, #F2B765, ${ACCENT_DK})` },
  noteBottomStripe: { height: 8, background: `linear-gradient(90deg, ${ACCENT_DK}, #F2B765, ${ACCENT})` },
  noteHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 24px 16px", gap: 12 },
  noteBrand: { display: "flex", gap: 12, alignItems: "center" },
  noteLogo: { width: 50, height: 50, borderRadius: 14, background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DK})`, color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 },
  noteFarmName: { fontWeight: 800, fontSize: 19, color: INK },
  noteFarmSub: { fontSize: 12, color: "#8a8275", marginTop: 1 },
  noteFarmTel: { fontSize: 11, color: "#a89f8f", marginTop: 2 },
  noteMeta: { textAlign: "right", flexShrink: 0 },
  noteDocType: { fontSize: 11, color: "#9b8e78", fontWeight: 700, marginBottom: 4 },
  noteTitle: { display: "inline-block", background: "#FBEFDD", color: ACCENT_DK, fontWeight: 700, fontSize: 14, padding: "4px 14px", borderRadius: 20, marginBottom: 6 },
  noteMetaRow: { fontSize: 12.5, color: "#6b6358", marginTop: 2 },
  noteCustBar: { display: "flex", justifyContent: "space-between", margin: "0 24px", padding: "12px 16px", background: "#FAF6EE", borderRadius: 12 },
  noteCustLabel: { fontSize: 11, color: "#9b9384", display: "block", marginBottom: 2 },
  noteCustName: { fontSize: 15, fontWeight: 700, color: INK },
  noteCustAddr: { fontSize: 12, color: "#8a8275", marginTop: 2 },
  noteTable: { width: "calc(100% - 48px)", margin: "16px 24px 0", borderCollapse: "collapse" },
  noteTh: { padding: "9px 10px", background: INK, color: "#fff", fontSize: 12, fontWeight: 600, textAlign: "center" },
  noteTd: { padding: "9px 10px", fontSize: 13.5, textAlign: "center", borderBottom: "1px solid #f3efe7", color: INK },
  noteSplit: { display: "flex", gap: 14, margin: "16px 24px 0", alignItems: "stretch", flexWrap: "wrap" },
  noteBahtText: { flex: "1 1 200px", display: "flex", flexDirection: "column", justifyContent: "center", padding: "12px 16px", background: "#FAF6EE", borderRadius: 12 },
  noteBahtLabel: { fontSize: 11, color: "#9b9384", marginBottom: 4 },
  noteBahtVal: { fontSize: 14, fontWeight: 700, color: ACCENT_DK, lineHeight: 1.5 },
  noteSummaryBox: { flex: "1 1 240px", minWidth: 240 },
  noteSummary: { margin: "0 24px", padding: "12px 4px 0" },
  noteSumRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b6358", padding: "4px 0" },
  noteTotal: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, padding: "12px 16px", background: `linear-gradient(135deg, #FBEFDD, #FCF6EA)`, borderRadius: 12, fontWeight: 700, fontSize: 15 },
  noteTotalBaht: { fontSize: 24, color: ACCENT_DK, fontWeight: 800 },
  noteSignBox: { margin: "18px 24px 0", padding: "16px 20px 22px", border: "1px solid #f0e6d6", borderRadius: 12, background: "#FEFCF7" },
  qrBox: { margin: "16px 24px 0", padding: "16px", border: "1.5px solid #E6C99A", borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  qrLeft: { flex: "1 1 160px" },
  qrTitle: { fontSize: 14, fontWeight: 700, color: INK, marginBottom: 4 },
  qrPpLogo: { fontSize: 10.5, fontWeight: 700, color: "#1A4F8B", letterSpacing: 0.5, marginBottom: 10 },
  qrName: { fontSize: 12.5, color: "#6b6358" },
  qrAmount: { fontSize: 22, fontWeight: 800, color: ACCENT_DK, margin: "4px 0" },
  qrId: { fontSize: 11.5, color: "#9b9384" },
  qrCanvas: { width: 150, height: 150, flexShrink: 0 },
  qrError: { width: 150, height: 150, display: "grid", placeItems: "center", fontSize: 12, color: "#b5ad9e", border: "1px dashed #d6d0c4", borderRadius: 8, flexShrink: 0, textAlign: "center", padding: 8 },
  noteSignText: { fontSize: 12, color: "#8a8275", textAlign: "center", marginBottom: 8 },
  noteSignRow: { display: "flex", gap: 32, justifyContent: "space-between" },
  noteSignCol: { flex: 1, textAlign: "center" },
  noteSignLine: { borderBottom: "1px dotted #b5ad9e", height: 1, marginTop: 56, marginBottom: 6 },
  noteSignLabel: { fontSize: 12, color: "#6b6358" },
  noteSignInName: { fontSize: 11, color: "#a89f8f", marginTop: 3 },
  noteTrayBox: { margin: "16px 24px 0", padding: "12px 16px", border: "1.5px dashed #E6C99A", borderRadius: 12, background: "#FEFCF7" },
  noteTrayTitle: { fontSize: 12.5, fontWeight: 700, color: ACCENT_DK, marginBottom: 8 },
  noteTrayGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  noteTrayCell: {},
  noteTrayLabel: { fontSize: 11, color: "#9b9384" },
  noteTrayVal: { fontSize: 13.5, fontWeight: 600, color: INK, marginTop: 1 },
  noteFooter: { textAlign: "center", padding: "18px 24px 20px" },
  noteThanks: { fontSize: 15, fontWeight: 700, color: ACCENT_DK },
  noteWarn: { fontSize: 11, color: "#b5ad9e", marginTop: 6, fontStyle: "italic" },
  noteActions: { display: "flex", flexDirection: "column", gap: 10 },
  saveImgBtn: { width: "100%", padding: "14px", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DK})`, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  printBtn: { width: "100%", padding: "14px", background: INK, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  ghostBtnWide: { width: "100%", padding: "12px", background: "#fff", color: "#6b6358", border: "1px solid #ddd5c7", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  primaryBtn: { width: "100%", padding: "13px", background: INK, color: "#fff", border: "none", borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },

  // ตาราง (คลัง/ผลผลิต)
  tableScroll: { overflowX: "auto", margin: "16px 0 8px", border: "1px solid #ece6da", borderRadius: 14, background: "#fff" },
  table: { borderCollapse: "collapse", width: "100%", fontSize: 13, minWidth: 700 },
  th: { padding: "10px 12px", background: "#F7F2E8", borderBottom: "2px solid #e3ddd0", fontWeight: 700, fontSize: 12.5, textAlign: "center", whiteSpace: "nowrap" },
  thSticky: { position: "sticky", left: 0, zIndex: 2, background: "#F7F2E8" },
  thCust: { padding: "10px 10px", background: "#fff", borderBottom: "2px solid #e3ddd0", fontWeight: 600, fontSize: 12, textAlign: "center", whiteSpace: "nowrap", color: "#6b6358" },
  td: { padding: "9px 12px", borderBottom: "1px solid #f3f0e9", textAlign: "center", whiteSpace: "nowrap" },
  tdSticky: { position: "sticky", left: 0, zIndex: 1, background: "#fff" },
  tfoot: { background: "#F7F2E8", fontWeight: 700, borderTop: "2px solid #e3ddd0" },
  hint: { fontSize: 12, color: "#9b9384", padding: "4px 4px 16px" },

  // ===== แจ้งเตือนคุณภาพผลผลิต =====
  alertBanner: { maxWidth: 1180, margin: "12px auto 0", padding: "12px 14px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 12 },
  alertBannerHead: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 9 },
  alertCount: { fontSize: 12, fontWeight: 800, color: "#fff", background: "#DC2626", borderRadius: 999, padding: "2px 10px" },
  alertCfgBtn: { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  alertList: { display: "flex", flexDirection: "column", gap: 7 },
  alertRow: { display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" },
  alertHouseBtn: { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", border: "1px solid #DC2626", background: "#fff", color: "#B91C1C", borderRadius: 7, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 },
  alertChip: { fontSize: 12, color: "#7F1D1D", background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 7, padding: "3px 9px", fontWeight: 500 },
  alertOk: { maxWidth: 1180, margin: "12px auto 0", padding: "10px 14px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#15803D", fontWeight: 600 },
  alertCell: { background: "#FEE2E2", boxShadow: "inset 0 0 0 2px #DC2626", color: "#991B1B", fontWeight: 800 },
  importBtn: { display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", background: INK, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  importedTag: { display: "inline-flex", alignItems: "center", gap: 4, color: "#15803D", fontWeight: 600, fontSize: 12.5 },

  // แผงดำ
  trayWrap: { maxWidth: 1180, margin: "0 auto", padding: "16px 20px" },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 },
  sumCard: { background: "#fff", border: "1px solid #ece6da", borderRadius: 14, padding: 16 },
  sumIcon: { width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", marginBottom: 10 },
  sumValue: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
  sumUnit: { fontSize: 13, fontWeight: 500, color: "#9b9384" },
  sumLabel: { fontSize: 13, color: "#6b6358", marginTop: 4 },
  sumSub: { fontSize: 11.5, color: "#9b9384", marginTop: 2 },
  trayList: { display: "flex", flexDirection: "column", gap: 12 },
  trayTabs: { display: "flex", gap: 8, marginBottom: 16 },
  trayTab: { padding: "9px 18px", border: "1px solid #ece6da", background: "#fff", borderRadius: 10, fontSize: 13.5, fontWeight: 600, color: "#6b6358", cursor: "pointer", fontFamily: "inherit" },
  trayTabActive: { background: INK, color: "#fff", borderColor: INK },
  byCustCard: { background: "#fff", border: "1px solid #ece6da", borderRadius: 14, overflow: "hidden" },
  byCustHead: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", width: "100%" },
  byCustIcon: { width: 36, height: 36, borderRadius: 10, background: "#FBEFDD", color: ACCENT_DK, display: "grid", placeItems: "center", flexShrink: 0 },
  byCustName: { fontWeight: 700, fontSize: 15 },
  byCustMeta: { fontSize: 12.5, color: "#9b9384", marginTop: 1 },
  byCustOwed: { fontSize: 14, fontWeight: 700, color: "#B91C1C" },
  byCustClear: { fontSize: 13.5, fontWeight: 600, color: "#15803D" },
  byCustGood: { fontSize: 11.5, color: "#9b9384", marginTop: 2 },
  byCustDetail: { borderTop: "1px solid #f3f0e9", padding: "8px 16px 12px", background: "#FCFAF5" },
  byCustTrayRow: { padding: "10px 0", borderBottom: "1px solid #f3f0e9" },
  byCustTrayNo: { fontWeight: 700, fontSize: 13.5 },
  byCustTrayInfo: { fontSize: 12.5, color: "#6b6358", marginTop: 4 },
  trayCard: { background: "#fff", border: "1px solid #ece6da", borderRadius: 14, padding: 16 },
  trayHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  trayNo: { fontWeight: 700, fontSize: 15, marginRight: 10 },
  statusPill: { fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 16 },
  trayDate: { fontSize: 12.5, color: "#9b9384" },
  trayCust: { display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#6b6358", marginBottom: 12 },
  trayStats: { display: "flex", gap: 24, flexWrap: "wrap", padding: "12px 0", borderTop: "1px solid #f3f0e9", borderBottom: "1px solid #f3f0e9", marginBottom: 12 },
  tsLabel: { fontSize: 11.5, color: "#9b9384" },
  tsVal: { fontSize: 18, fontWeight: 700, marginTop: 2 },
  tsSub: { fontSize: 11, color: "#b5ad9e", marginTop: 1 },
  trayActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  trayBtnPrimary: { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", background: INK, color: "#fff", border: "none", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  trayBtnGhost: { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#fff", color: ACCENT_DK, border: `1px solid ${ACCENT}`, borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  trayClosed: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, color: "#15803D", fontWeight: 600 },

  modalOverlay: { position: "fixed", inset: 0, background: "rgba(43,38,32,.45)", display: "grid", placeItems: "center", padding: 20, zIndex: 50 },
  modal: { background: "#fff", borderRadius: 18, padding: 20, width: "100%", maxWidth: 400, maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  modalTitle: { fontWeight: 700, fontSize: 17 },
  modalSub: { fontSize: 12.5, color: "#9b9384", marginTop: 2 },
  modalClose: { background: "#f3f0e9", border: "none", borderRadius: 8, width: 32, height: 32, display: "grid", placeItems: "center", cursor: "pointer", color: "#6b6358" },
  sortTable: { marginBottom: 16 },
  sortHeadRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", fontSize: 12, color: "#9b9384", fontWeight: 600, padding: "0 0 8px", textAlign: "center" },
  sortRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", alignItems: "center", gap: 6, padding: "6px 0", textAlign: "center" },
  sortKind: { fontWeight: 600, fontSize: 14, textAlign: "left" },
  sortRecv: { fontSize: 15, fontWeight: 600 },
  sortInput: { padding: "8px", border: "1px solid #e3ddd0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", textAlign: "center", outline: "none", width: "100%", boxSizing: "border-box" },
  sortGood: { fontSize: 15, fontWeight: 700, color: "#15803D" },
  fullInput: { width: "100%", padding: "10px 12px", border: "1px solid #e3ddd0", borderRadius: 9, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "#fff" },
  recvGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  linePreview: { background: "#fbf9f4", border: "1px solid #f0ece2", borderRadius: 12, padding: 16, fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: 16, fontFamily: "inherit", color: INK },
  weighSummary: { background: "#fbf9f4", borderRadius: 12, padding: 14, marginBottom: 16 },
  wsRow: { display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "3px 0" },

  // ===== ประวัติบิล =====
  emptyState: { padding: "48px 24px", textAlign: "center", color: "#9b9384", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, fontSize: 14 },
  billRow: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "#fff", border: "1px solid #ece6da", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", width: "100%" },
  billRowTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 3 },
  billRowNo: { fontWeight: 700, fontSize: 14.5 },
  billRowCust: { fontSize: 13, color: "#6b6358" },
  billRowAmt: { fontWeight: 700, fontSize: 16, color: ACCENT_DK },
  billRowItems: { fontSize: 11.5, color: "#9b9384" },

  // ===== บัญชี =====
  accDebtorBox: { background: "#fff", border: "1px solid #ece6da", borderRadius: 14, padding: 16, marginBottom: 16 },
  accDebtorTitle: { fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#B91C1C" },
  accDebtorList: { display: "flex", flexDirection: "column", gap: 8 },
  accDebtorRow: { display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "6px 0", borderBottom: "1px solid #f3f0e9" },
  payBtn: { padding: "6px 14px", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DK})`, color: "#fff", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  methodBtn: { flex: 1, padding: "10px", border: "1px solid #e3ddd0", background: "#fff", borderRadius: 9, fontSize: 13.5, fontWeight: 600, color: "#6b6358", cursor: "pointer", fontFamily: "inherit" },
  methodBtnActive: { background: INK, color: "#fff", borderColor: INK },

  // ===== แดชบอร์ด =====
  dashGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  dashCard: { background: "#fff", border: "1px solid #ece6da", borderRadius: 16, padding: 18, marginBottom: 16 },
  dashCardTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700, marginBottom: 14, color: INK },
  barRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 9 },
  barLabel: { fontSize: 12.5, color: "#6b6358", width: 96, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  barTrack: { flex: 1, height: 18, background: "#f3f0e9", borderRadius: 6, overflow: "hidden" },
  barFill: { height: "100%", background: INK, borderRadius: 6, minWidth: 2, transition: "width .3s" },
  barVal: { fontSize: 12.5, fontWeight: 600, width: 56, textAlign: "right", flexShrink: 0 },
  custRankRow: { display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid #f3f0e9", fontSize: 14 },
  custRankNo: { width: 24, height: 24, borderRadius: "50%", background: "#FBEFDD", color: ACCENT_DK, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800&family=Prompt:wght@600;700&display=swap');
  * { box-sizing: border-box; }
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
  .customerCard:hover { border-color: ${ACCENT} !important; }
  .sumCardClickable:hover { border-color: ${ACCENT} !important; box-shadow: 0 2px 10px rgba(232,148,58,.18); }
  .prodTable th, .prodTable td { padding-left: 5px !important; padding-right: 5px !important; border-right: 1px solid #e6ddca; }
  .prodTable td { border-bottom: 1px solid #e6ddca !important; }
  .prodTable tbody td:nth-child(n+2):nth-child(-n+11) { background: #FDEFD8; }
  .prodTable tbody td:nth-child(n+13):nth-child(-n+18) { background: #E7F7EC; }
  .prodTable tbody td:nth-child(19) { background: #BEEBCC; }
  .prodTable tbody td:nth-child(n+20):nth-child(-n+21) { background: #E7F0FE; }
  .prodInput { transition: border-color .12s, box-shadow .12s; }
  .pfChick { border-color: #BFDBFE !important; background: #fff; }
  .pfChick:focus { border-color: #2563EB !important; box-shadow: 0 0 0 3px rgba(37,99,235,.18); }
  .pfGood { border-color: #BBE7C9 !important; background: #fff; }
  .pfGood:focus { border-color: #16A34A !important; box-shadow: 0 0 0 3px rgba(22,163,74,.20); }
  .pfOff { border-color: #FBD9A8 !important; background: #fff; }
  .pfOff:focus { border-color: #D97706 !important; box-shadow: 0 0 0 3px rgba(217,119,6,.20); }
  .pfInsp { border-color: #99F6E4 !important; background: #fff; }
  .pfInsp:focus { border-color: #0D9488 !important; box-shadow: 0 0 0 3px rgba(13,148,136,.20); }
  .pfLoss { border-color: #FECACA !important; background: #fff; }
  .pfLoss:focus { border-color: #DC2626 !important; box-shadow: 0 0 0 3px rgba(220,38,38,.16); }
  .pfFeed { border-color: #FBD9A8 !important; background: #fff; }
  .pfFeed:focus { border-color: #D97706 !important; box-shadow: 0 0 0 3px rgba(217,119,6,.20); }
  .pfWater { border-color: #BAE0FD !important; background: #fff; }
  .pfWater:focus { border-color: #0284C7 !important; box-shadow: 0 0 0 3px rgba(2,132,199,.18); }
  .pfLight { border-color: #F0C8F5 !important; background: #fff; }
  .pfLight:focus { border-color: #A21CAF !important; box-shadow: 0 0 0 3px rgba(162,28,175,.16); }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #e3ddd0; border-radius: 4px; }
  /* บิลปัจจุบัน: panel เป็น flex + maxHeight — ห้าม flexbox บีบความสูงลูก ไม่งั้นกล่องยอดรับไข่วาดทับช่องราคา (ให้ panel เลื่อนแทน) */
  #cart-panel > * { flex-shrink: 0; }
  @media (max-width: 900px) {
    [style*="grid-template-columns: 1fr 390px"] { grid-template-columns: 1fr !important; padding-bottom: 92px !important; }
    [style*="repeat(4, 1fr)"] { grid-template-columns: 1fr 1fr !important; }
    #cart-panel { position: static !important; max-height: none !important; overflow: visible !important; }
    .mainNav { flex-wrap: nowrap !important; overflow-x: auto; padding-bottom: 3px; scrollbar-width: none; }
    .mainNav::-webkit-scrollbar { display: none; }
    .mainNav button { flex: 0 0 auto; padding: 8px 11px !important; }
  }
  @media (min-width: 901px) { .salesStickyBar { display: none !important; } }
`;


/* ============================================================
   จุดเริ่มทำงาน (mount) — แสดงแอปลงบนหน้าเว็บ
   ส่วนนี้เพิ่มต่อท้ายคอมโพเนนต์ ไม่ต้องแก้ปกติ
   ============================================================ */
import { createRoot } from "react-dom/client";
const __boot = document.getElementById("boot");
if (__boot) __boot.remove();
createRoot(document.getElementById("root")).render(React.createElement(App));
