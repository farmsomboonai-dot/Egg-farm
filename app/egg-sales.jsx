import React, { useState, useMemo, useEffect } from "react";
import {
  Search, Plus, Minus, Trash2, Check, X, Receipt, Package, User, ChevronRight, ChevronLeft,
  AlertCircle, ShoppingCart, RotateCcw, Copy, ClipboardCheck, Send, Truck, Clock,
  Warehouse, Egg, ArrowDownToLine, Image as ImageIcon,
  FileText, Wallet, LayoutDashboard, TrendingUp, Calendar, CheckCircle2, CircleDollarSign, QrCode, Pencil, Printer,
  Bell, Settings,
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
}
// แก้ไขข้อมูลลูกค้า (id เดิม) + บันทึกถาวร — ลูกค้าที่เพิ่มเองอัปเดตใน eggCustomers, ลูกค้า seed เก็บลง eggCustomerEdits
function updateCustomerRecord(id, patch) {
  const c = CUSTOMERS.find((x) => x.id === id);
  if (c) Object.assign(c, patch);
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

// บัญชีแผงต่อลูกค้า: รวมยอดจากบิล (รับไป/คืนตอนซื้อ) + RT (คืนภายหลัง/คัดชำรุด)
// กติกาคืนเกิน: ถ้าคืนมากกว่าที่ถืออยู่ (surplus) จะเอาไปหักยอด "ค้างทดแทน" (แผงชำรุด) ก่อน เหลือเท่าไรจึงเป็น "คืนเกิน" จริง
// excludeBillNo: ใช้ตอนออกบิล เพื่อไม่นับบิลที่กำลังทำอยู่ (ยังไม่บันทึก)
function trayAccountOf(customerId, bills, trayRecords, excludeBillNo) {
  let billSent = 0, billReturned = 0, rtReturned = 0, brokenOwed = 0;
  let blackSent = 0, blackReturned = 0, orangeSent = 0, orangeReturned = 0;  // แยกชนิด เพื่อคิดมูลค่ามัดจำ
  let chargedShort = 0, carriedShort = 0, chargedDeposit = 0;                // คืนขาด: คิดเงิน vs ยกค้างคืน
  (bills || []).forEach((b) => {
    if (b.customerId !== customerId || (excludeBillNo && b.no === excludeBillNo)) return;
    const ts = b.traySummary; if (!ts) return;
    billSent += (ts.blackSent || 0) + (ts.orangeSent || 0);
    billReturned += (ts.blackReturned || 0) + (ts.orangeReturned || 0);
    blackSent += ts.blackSent || 0; blackReturned += ts.blackReturned || 0;
    orangeSent += ts.orangeSent || 0; orangeReturned += ts.orangeReturned || 0;
    const bn = ts.blackNet || 0, on = ts.orangeNet || 0;               // แผงที่คืนขาดบิลนี้
    if (ts.shortMode === "carry") carriedShort += bn + on;             // ยกเป็นค้างคืน (ไม่คิดเงิน)
    else { chargedShort += bn + on; chargedDeposit += bn * TRAY_DEPOSIT + on * TRAY_DEPOSIT_ORANGE; }  // คิดเงิน (default)
  });
  (trayRecords || []).forEach((t) => {
    if (t.customerId !== customerId) return;
    if (!t.fromBill) rtReturned += sumTray(t.received);   // ใบจากบิลนับยอดคืนใน billReturned แล้ว → ไม่นับซ้ำ
    if (t.sorted && t.status !== "ปิดรายการ") brokenOwed += sumTray(t.sorted.broken) - sumTray(t.replacedGood);
  });
  const balance = billSent - billReturned - rtReturned; // >0 = ยืมไป/ถืออยู่, <0 = คืนเกินกว่าที่ถือ
  const surplus = Math.max(0, -balance);                // แผงที่คืนเกินกว่าที่ถืออยู่
  const rawOwed = Math.max(0, brokenOwed);              // ค้างทดแทน (ก่อนหักคืนเกิน)
  const owed = Math.max(0, rawOwed - surplus);          // ค้างทดแทน หลังหักคืนเกิน (item B)
  const credit = Math.max(0, surplus - rawOwed);        // คืนเกินจริง (หลังชดเชยแผงชำรุดแล้ว)
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
  return { billSent, billReturned, rtReturned, balance, surplus, rawOwed, owed, credit, owedBack, heldBlack, heldOrange, heldCount, carriedOwed, chargedHeld, depositHeld };
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
  const [trayStock, setTrayStock] = useState({ ใหญ่: 1240, เล็ก: 860 });
  // รายการรับแผงคืนภายหลัง (RT) — ยกขึ้นมาไว้ส่วนกลาง เพื่อให้หน้าออกบิลเห็นยอดค้างแผงของลูกค้าด้วย
  const [trayRecords, setTrayRecords] = useState(TRAY_SEED);

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
            { id: "account", icon: <Wallet size={16} />, label: "บัญชี/ลูกหนี้" },
            { id: "dash", icon: <LayoutDashboard size={16} />, label: "แดชบอร์ด" },
            { id: "stock", icon: <Warehouse size={16} />, label: "คลังรายวัน" },
            { id: "prod", icon: <Egg size={16} />, label: "ผลผลิต" },
            { id: "tray", icon: <RotateCcw size={16} />, label: "แผงไข่" },
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

      {view === "sales" && <SalesView stock={stock} addBill={addBill} bills={bills} payments={payments} trayStock={trayStock} setTrayStock={setTrayStock} trayRecords={trayRecords} drafts={drafts} setDrafts={setDrafts} />}
      {view === "bills" && <BillHistoryView bills={bills} payments={payments} />}
      {view === "account" && <AccountView bills={bills} payments={payments} recordPayment={recordPayment} />}
      {view === "dash" && <DashboardView bills={bills} payments={payments} />}
      {view === "stock" && <StockView salesByDay={salesByDay} productionByDate={productionByDate} defaultDay={stockDay} stockCounts={stockCounts} closeMeta={closeMeta} refPrices={refPrices} onCloseDay={closeDay} onReopenDay={reopenDay} />}
      {view === "prod" && <ProductionView houses={houses} setHouses={setHouses} prodDate={prodDate} setProdDate={setProdDate} production={productionByDate} />}
      {view === "tray" && <PanelTrayView trayStock={trayStock} setTrayStock={setTrayStock} bills={bills} trayRecords={trayRecords} setTrayRecords={setTrayRecords} />}
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
function SalesView({ stock, addBill, bills, payments, trayStock, setTrayStock, trayRecords = [], drafts = [], setDrafts }) {
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
  const trayAccount = customerId ? trayAccountOf(customerId, bills, trayRecords) : null;

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
function AccountView({ bills, payments, recordPayment }) {
  const [payModal, setPayModal] = useState(null);

  const rows = bills.map((b) => {
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
      <div style={S.subBar}><span style={S.subBarTitle}>บัญชี / ลูกหนี้</span></div>
      <div style={{ padding: "16px 0" }}>
        <div style={S.summaryGrid}>
          <SummaryCard icon={<CircleDollarSign size={18} />} label="ยอดขายรวม" value={totalSales} tone="amber" unit="บ." />
          <SummaryCard icon={<CheckCircle2 size={18} />} label="รับชำระแล้ว" value={totalPaid} tone="green" unit="บ." />
          <SummaryCard icon={<Wallet size={18} />} label="ค้างชำระรวม" value={totalOwed} tone="red" unit="บ." />
          <SummaryCard icon={<FileText size={18} />} label="จำนวนบิล" value={bills.length} tone="amber" unit="ใบ" />
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
                <tr><td colSpan={8} style={{ ...S.td, padding: 32, color: "#9b9384" }}>ยังไม่มีบิล</td></tr>
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
  const totalSales = bills.reduce((s, b) => s + b.total, 0);
  const totalPaid = Object.values(payments).reduce((s, p) => s + (p.paid || 0), 0);
  const totalOwed = totalSales - totalPaid;
  const totalPrang = bills.reduce((s, b) => s + b.totalPrang, 0);

  // ยอดขายรายวัน
  const byDate = {};
  bills.forEach((b) => { byDate[b.date] = (byDate[b.date] || 0) + b.total; });
  const dateRows = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDay = Math.max(1, ...dateRows.map((d) => d[1]));

  // ยอดขายรายสินค้า (แผง)
  const byProduct = {};
  bills.forEach((b) => b.items.forEach((i) => { byProduct[i.name] = (byProduct[i.name] || 0) + i.qty; }));
  const prodRows = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxProd = Math.max(1, ...prodRows.map((p) => p[1]));

  // ลูกค้าที่ซื้อมากสุด
  const byCust = {};
  bills.forEach((b) => { byCust[b.customer.name] = (byCust[b.customer.name] || 0) + b.total; });
  const custRows = Object.entries(byCust).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div style={S.wide}>
      <div style={S.subBar}><span style={S.subBarTitle}>แดชบอร์ดภาพรวม</span></div>
      <div style={{ padding: "16px 0" }}>
        {bills.length === 0 ? (
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
function ThaiDateField({ value, onChange, style, long = true }) {
  const box = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 10px", border: "1.5px solid #e3ddd0", borderRadius: 9, background: "#fff", fontSize: 14.5, fontFamily: "inherit", color: value ? INK : "#9b9384", width: "100%", ...(style || {}) };
  return (
    <div style={{ position: "relative", width: (style && style.width) || "100%" }}>
      <div style={box}><span>{value ? toThaiDate(value, long) : "เลือกวันที่"}</span><Calendar size={15} color={ACCENT_DK} /></div>
      <input type="date" value={value || ""} lang="th"
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
    setHouses(base.map((h) => ({ id: h.id, date: prodDate, chickens: h.chickens, grade: { เบอร์: zero(h.grade.เบอร์), ตกเกรด: zero(h.grade.ตกเกรด) } })));
  };
  const saveHouse = (id, grade, chickens, date, inspect) => {
    const cur = houses.find((h) => h.id === id);
    if (cur) setUndoStack((s) => [...s, { id, house: cur }]);   // จำค่าก่อนแก้ไว้ย้อนกลับ (house object เดิม ไม่ถูก mutate)
    if (setHouses) setHouses((prev) => prev.map((h) => h.id === id ? { ...h, chickens, grade, date, inspect } : h));
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
  houses.forEach((h) => { const a = computeHouseAlerts(h, alertCfg); alertMap[h.id] = a; flagSet[h.id] = new Set(a.map((x) => x.tag)); });
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
            {houses.filter((h) => alertMap[h.id] && alertMap[h.id].length).map((h) => (
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
            {houses.map((h, hi) => {
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
  const [ber, setBer] = useState(() => { const o = {}; Object.keys(house.grade.เบอร์).forEach((k) => o[k] = String(house.grade.เบอร์[k] ?? "")); return o; });
  const [off, setOff] = useState(() => { const o = {}; Object.keys(house.grade.ตกเกรด).forEach((k) => o[k] = String(house.grade.ตกเกรด[k] ?? "")); return o; });
  const [date, setDate] = useState(house.date || defaultDate || "");
  const insp0 = house.inspect || {};
  const [inspN, setInspN] = useState(insp0.count != null ? String(insp0.count) : "4");   // สุ่มตรวจ: ตอกไข่ วันละ 4 ฟอง/หลัง (ค่าเริ่มต้น)
  const [inspResult, setInspResult] = useState(insp0.result || "");
  const berKeys = Object.keys(ber), offKeys = Object.keys(off);
  const goodFong = Object.values(ber).reduce((s, v) => s + (parseInt(v) || 0), 0);
  const offPrang = Object.values(off).reduce((s, v) => s + (parseInt(v) || 0), 0);
  const inputsRef = React.useRef([]);   // input เรียงตามลำดับกรอก (ไก่ → เบอร์ 0-5 → ตกเกรด)
  const saveRef = React.useRef(null);
  const dateTH = toThaiDate(date);
  const withCommas = (s) => { const d = String(s ?? "").replace(/\D/g, ""); return d ? Number(d).toLocaleString("en-US") : ""; };  // แสดงเลขมีลูกน้ำ (เก็บ state เป็นเลขล้วน)
  const save = () => {
    const eB = {}; Object.keys(ber).forEach((k) => eB[k] = parseInt(ber[k]) || 0);
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
          <div style={{ fontWeight: 800, color: "#15803D", fontSize: 13, marginBottom: 8 }}>🥚 ไข่ดี (ฟอง) · แยกเบอร์</div>
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
          <div style={S.wsRow}><span>ไข่ดีรวม</span><span style={{ color: "#15803D", fontWeight: 700 }}>{fmt(goodFong)} ฟอง · {fmt(Math.round(goodFong / PER_PRADANG))} แผง</span></div>
          <div style={S.wsRow}><span>ตกเกรดรวม</span><span style={{ color: "#B45309", fontWeight: 700 }}>{fmt(offPrang)} แผง</span></div>
        </div>
        <button ref={saveRef} style={S.primaryBtn} onClick={save}>บันทึกข้อมูล {house.id}</button>
      </div>
    </div>
  );
}

/* ============================================================
   หน้าจอ: ระบบแผงดำ
============================================================ */
function PanelTrayView({ trayStock, setTrayStock, bills = [], trayRecords = [], setTrayRecords }) {
  const trays = trayRecords, setTrays = setTrayRecords;  // ใช้ state กลางจาก App (ยกขึ้นมาเพื่อแชร์กับหน้าออกบิล)
  const [sortModal, setSortModal] = useState(null);
  const [lineModal, setLineModal] = useState(null);
  const [replaceModal, setReplaceModal] = useState(null);
  const [newReturn, setNewReturn] = useState(false);
  const [newReturnCust, setNewReturnCust] = useState("");   // ลูกค้าที่ preselect ตอนกด "รับคืนอีก" (ต่อกลุ่ม)
  const [tab, setTab] = useState("byCustomer"); // byCustomer | list
  const custName = (id) => CUSTOMERS.find((c) => c.id === id)?.name || "—";

  const summary = useMemo(() => {
    let waitingSort = 0, brokenToReturn = 0, replaceOwed = 0;
    trays.forEach((t) => {
      if (t.status === "รอคัด") waitingSort += sumTray(t.received);
      if (t.sorted && t.status === "รอส่งคืน") brokenToReturn += sumTray(t.sorted.broken);
      if (t.sorted && t.status !== "ปิดรายการ") replaceOwed += sumTray(t.sorted.broken) - sumTray(t.replacedGood);
    });
    return { waitingSort, brokenToReturn, replaceOwed };
  }, [trays]);

  // สรุปแผงรายลูกค้า: รวมยอดรับแผงไป (จากบิลจริง) + รับคืน/คัดแยก (จาก RT)
  const byCustomer = useMemo(() => {
    const map = {};
    const ensure = (id) => {
      if (!map[id]) map[id] = { customerId: id, name: custName(id), good: 0, broken: 0, trays: [] };
      return map[id];
    };
    // ลงทะเบียนลูกค้าที่มีแผงจากบิล
    (bills || []).forEach((b) => {
      const ts = b.traySummary; if (!ts) return;
      const sent = (ts.blackSent || 0) + (ts.orangeSent || 0);
      const ret = (ts.blackReturned || 0) + (ts.orangeReturned || 0);
      if (sent === 0 && ret === 0) return;
      ensure(b.customerId);
    });
    // รายละเอียดการรับแผงคืนภายหลัง (RT) + คัดแยกดี/ชำรุด
    trays.forEach((t) => {
      const m = ensure(t.customerId);
      if (t.sorted) { m.good += sumTray(t.sorted.good); m.broken += sumTray(t.sorted.broken); }
      m.trays.push(t);
    });
    // ตัวเลขบัญชี (ค้างคืน/ค้างทดแทน/คืนเกิน) มาจาก helper กลางตัวเดียว
    return Object.values(map)
      .map((m) => { const acc = trayAccountOf(m.customerId, bills, trays); return { ...m, ...acc, returnedTotal: acc.billReturned + acc.rtReturned }; })
      .sort((a, b) => b.balance - a.balance);
  }, [trays, bills]);
  const totalOwedBack = byCustomer.reduce((s, r) => s + r.owedBack, 0);
  const totalReplaceOwed = byCustomer.reduce((s, r) => s + r.owed, 0);
  const totalDepositHeld = byCustomer.reduce((s, r) => s + (r.depositHeld || 0), 0);  // มัดจำที่ลูกค้าจ่ายแล้ว (รอจ่ายคืน) รวม
  const totalOrangeHeld = byCustomer.reduce((s, r) => s + (r.heldOrange || 0), 0);    // แผงส้มที่ลูกค้ายืมไป (สำคัญสุด — มีแค่ฟาร์มเรา)
  const totalBlackHeld = byCustomer.reduce((s, r) => s + (r.heldBlack || 0), 0);
  const totalCarriedOwed = byCustomer.reduce((s, r) => s + (r.carriedOwed || 0), 0);  // ค้างคืน (ยกยอด ไม่คิดเงิน = หนี้แผงจริง) รวม

  const applySort = (trayId, good, broken, sorter, sortedDate) => {
    setTrays((prev) => prev.map((t) => t.id === trayId ? { ...t, status: "รอส่งคืน", sorted: { good, broken }, sorter, sortedDate: sortedDate || new Date().toLocaleDateString("th-TH") } : t));
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
  const addReceive = (customerId, received, receivedDate) => {
    const no = "RT-" + String(trays.length + 1).padStart(4, "0");
    const today = new Date().toLocaleDateString("th-TH");
    setTrays((p) => [{ id: no, customerId, date: receivedDate || today, received, status: "รอคัด", sorted: null, sorter: "", sortedDate: "", replacedGood: { ใหญ่: 0, เล็ก: 0 }, replacements: [] }, ...p]);
    setNewReturn(false);
  };

  return (
    <>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>แผงไข่ · แผงลูกค้ายืม / รับคืน / คัดแยก</span>
        <span style={{ fontSize: 12.5, color: "#9b8e78" }}>กดการ์ด “รอคัดแยก” เพื่อรับแผงคืน</span>
      </div>
      <div style={S.trayWrap}>
        <div style={S.summaryGrid}>
          <SummaryCard icon={<RotateCcw size={18} />} label="แผงลูกค้าถืออยู่" value={totalOwedBack} tone={totalCarriedOwed > 0 ? "red" : "blue"} sub={`${totalCarriedOwed > 0 ? `ค้างคืน ${fmt(totalCarriedOwed)} · ` : ""}จ่ายมัดจำ ${fmt(totalDepositHeld)} บ. · 🟠 ${fmt(totalOrangeHeld)}`} />
          <SummaryCard icon={<Clock size={18} />} label="รอคัดแยก" value={summary.waitingSort} tone="amber" sub="＋ กดเพื่อรับแผงคืน" onClick={() => { setNewReturnCust(""); setNewReturn(true); }} />
          <SummaryCard icon={<AlertCircle size={18} />} label="ค้างทดแทน" value={totalReplaceOwed} tone="red" />
          <SummaryCard icon={<Package size={18} />} label="แผงดีในฟาร์ม" value={sumTray(trayStock)} tone="green" sub={`ใหญ่ ${fmt(trayStock.ใหญ่)} · เล็ก ${fmt(trayStock.เล็ก)}`} />
        </div>

        <div style={S.trayTabs}>
          <button style={{ ...S.trayTab, ...(tab === "list" ? S.trayTabActive : {}) }} onClick={() => setTab("list")}>รายการแผงรอคัด</button>
          <button style={{ ...S.trayTab, ...(tab === "byCustomer" ? S.trayTabActive : {}) }} onClick={() => setTab("byCustomer")}>สรุปแยกลูกค้า</button>
          <button style={{ ...S.trayTab, ...(tab === "report" ? S.trayTabActive : {}) }} onClick={() => setTab("report")}>รายงานคัดแผง</button>
        </div>

        {tab === "list" ? (
          trays.length === 0 ? (
            <div style={S.emptyState}><RotateCcw size={36} color="#d1d5db" /><div>ยังไม่มีใบรับคืน — กดการ์ด “รอคัดแยก” เพื่อรับแผงคืน</div></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {(() => {
                const groups = new Map();
                trays.forEach((t) => { if (!groups.has(t.customerId)) groups.set(t.customerId, []); groups.get(t.customerId).push(t); });
                return [...groups.entries()].map(([cid, list]) => (
                  <div key={cid}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingBottom: 6, borderBottom: "2px solid #f0ece2" }}>
                      <span style={{ fontWeight: 700, color: ACCENT_DK, display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <User size={16} /> {custName(cid)}
                        <span style={{ fontSize: 12, color: "#9b9384", background: "#f3f0e9", padding: "2px 10px", borderRadius: 12, fontWeight: 600 }}>{list.length} ใบ</span>
                      </span>
                      <button style={{ ...S.ghostBtn, display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", fontSize: 12.5 }} onClick={() => { setNewReturnCust(cid); setNewReturn(true); }}><Plus size={14} /> รับคืนอีก</button>
                    </div>
                    <div style={S.trayList}>
                      {list.map((t) => (
                        <TrayCard key={t.id} tray={t} custName={custName(t.customerId)}
                          onSort={() => setSortModal(t)} onReturned={() => markReturned(t.id)}
                          onAnnounce={() => setLineModal(t)} onReplace={() => setReplaceModal(t)} />
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )
        ) : tab === "report" ? (
          <TraySortReport trays={trays} custName={custName} waitingSort={summary.waitingSort} />
        ) : (
          <TrayByCustomer rows={byCustomer} />
        )}
      </div>
      {sortModal && <SortModal tray={sortModal} custName={custName(sortModal.customerId)} onClose={() => setSortModal(null)} onApply={applySort} />}
      {replaceModal && <ReplaceModal tray={replaceModal} custName={custName(replaceModal.customerId)} onClose={() => setReplaceModal(null)} onApply={addReplacement} />}
      {lineModal && <LineModal tray={lineModal} custName={custName(lineModal.customerId)} onClose={() => setLineModal(null)} />}
      {newReturn && <NewReturnModal initialCustomerId={newReturnCust} onClose={() => { setNewReturn(false); setNewReturnCust(""); }} onAdd={addReceive} bills={bills} trays={trays} />}
    </>
  );
}

function TrayByCustomer({ rows }) {
  const [expanded, setExpanded] = useState(null);
  if (rows.length === 0) return <div style={S.emptyState}><RotateCcw size={36} color="#d1d5db" /><div>ยังไม่มีข้อมูลแผง — ออกบิลที่มีแผง หรือกด “รับแผงคืน”</div></div>;

  // ป้ายสถานะหลัก: ค้างคืน (ยกยอด หนี้จริง) > ยืมไป (จ่ายมัดจำแล้ว) > คืนเกิน > คืนครบ
  const statusOf = (r) =>
    r.carriedOwed > 0 ? { label: `ค้างคืน ${fmt(r.carriedOwed)} แผง`, c: "#B91C1C" }
    : r.chargedHeld > 0 ? { label: `ยืมไป ${fmt(r.chargedHeld)} แผง`, c: "#1D4ED8" }
    : r.credit > 0 ? { label: `คืนเกิน ${fmt(r.credit)} แผง`, c: "#1D4ED8" }
    : { label: "คืนครบ", c: "#15803D" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => {
        const open = expanded === r.customerId;
        const bt = statusOf(r);
        return (
          <div key={r.customerId} style={S.byCustCard}>
            <button style={S.byCustHead} onClick={() => setExpanded(open ? null : r.customerId)}>
              <div style={S.byCustIcon}><User size={18} /></div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={S.byCustName}>{r.name}</div>
                <div style={S.byCustMeta}>รับไป {fmt(r.billSent)} · คืนแล้ว {fmt(r.returnedTotal)} · คัดดี {fmt(r.good)} แผง</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {r.carriedOwed > 0 && <div style={{ fontWeight: 800, color: "#B91C1C" }}>ค้างคืน {fmt(r.carriedOwed)} แผง</div>}
                {r.chargedHeld > 0 && <div style={{ fontWeight: 800, color: "#1D4ED8" }}>ยืมไป {fmt(r.chargedHeld)} แผง{r.depositHeld > 0 ? <span style={{ fontSize: 11.5, fontWeight: 600, color: "#6b6358" }}> · มัดจำ {fmt(r.depositHeld)}฿</span> : ""}</div>}
                {r.carriedOwed === 0 && r.chargedHeld === 0 && <div style={{ fontWeight: 800, color: r.credit > 0 ? "#1D4ED8" : "#15803D" }}>{r.credit > 0 ? `คืนเกิน ${fmt(r.credit)} แผง` : "คืนครบ"}</div>}
                {(r.heldOrange > 0 || r.heldBlack > 0) && (
                  <div style={{ fontSize: 12 }}>
                    {r.heldOrange > 0 && <b style={{ color: "#C2410C" }}>🟠 ส้ม {fmt(r.heldOrange)}</b>}
                    {r.heldOrange > 0 && r.heldBlack > 0 && <span style={{ color: "#9b8e78" }}> · </span>}
                    {r.heldBlack > 0 && <span style={{ color: "#6b6358" }}>⚫ ดำ {fmt(r.heldBlack)}</span>}
                  </div>
                )}
                {r.owed > 0 && <div style={S.byCustOwed}>ค้างทดแทน {fmt(r.owed)}</div>}
              </div>
              <ChevronRight size={18} color="#9ca3af" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
            </button>
            {open && (
              <div style={S.byCustDetail}>
                <div style={{ fontSize: 12.5, color: "#6b6358", padding: "4px 2px 8px", borderBottom: "1px solid #f3f0e9", marginBottom: 6 }}>
                  รับไปจากบิล {fmt(r.billSent)} · คืนตอนซื้อ {fmt(r.billReturned)} · คืนภายหลัง {fmt(r.rtReturned)}
                  {(r.heldOrange > 0 || r.heldBlack > 0) && <span style={{ color: "#6b6358" }}> · ถืออยู่ {heldBreakdown(r)}</span>}
                  {r.carriedOwed > 0 && <span style={{ color: "#B91C1C", fontWeight: 700 }}> · ค้างคืน {fmt(r.carriedOwed)} แผง (ยกยอด ไม่คิดเงิน = หนี้แผง)</span>}
                  {r.chargedHeld > 0 && r.depositHeld > 0 && <span style={{ color: "#1D4ED8" }}> · จ่ายค่าแผง(มัดจำ)มาแล้ว {fmt(r.depositHeld)} บ. — รอจ่ายคืนถ้าเอาแผงมาคืน</span>}
                  {r.rawOwed > r.owed && <span style={{ color: "#1D4ED8" }}> · คืนเกินไปหักค้างทดแทน {fmt(r.rawOwed - r.owed)} แผง</span>}
                  {r.owed > 0 && <span style={{ color: "#B91C1C" }}> · ค้างทดแทน {fmt(r.owed)} แผง</span>}
                </div>
                {r.trays.length === 0 && <div style={{ fontSize: 12.5, color: "#9b9384", padding: "2px 2px 4px" }}>ยังไม่มีรายการรับแผงคืนภายหลัง</div>}
                {r.trays.map((t) => {
                  const st = STATUS_STYLE[t.status];
                  return (
                    <div key={t.id} style={S.byCustTrayRow}>
                      <div style={{ flex: 1 }}>
                        <span style={S.byCustTrayNo}>{t.id}</span>
                        <span style={{ ...S.statusPill, background: st.bg, color: st.c, marginLeft: 8 }}>{t.status}</span>
                      </div>
                      <div style={S.byCustTrayInfo}>
                        <span>รับคืน {t.date}: {fmt(sumTray(t.received))} แผง</span>
                        {t.sorted && <span> · ดี {fmt(sumTray(t.sorted.good))} / ชำรุด {fmt(sumTray(t.sorted.broken))}</span>}
                        {t.sorted && (sumTray(t.received) - sumTray(t.sorted.good) - sumTray(t.sorted.broken)) > 0 && <span style={{ color: "#B45309" }}> · หาย {fmt(sumTray(t.received) - sumTray(t.sorted.good) - sumTray(t.sorted.broken))}</span>}
                        {t.sortedDate && <span> · คัดแยก {t.sortedDate}</span>}
                        {(t.replacements || []).map((r, i) => <span key={i} style={{ color: "#15803D" }}> · แลกแผงดี {fmt(sumTray(r))} ({r.date})</span>)}
                        {t.sorted && t.status !== "ปิดรายการ" && (sumTray(t.sorted.broken) - sumTray(t.replacedGood)) > 0 && <span style={{ color: "#B91C1C" }}> · ค้างทดแทน {fmt(sumTray(t.sorted.broken) - sumTray(t.replacedGood))}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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
              return (
                <tr key={t.id}>
                  <td style={{ ...S.td, textAlign: "left", fontWeight: 600 }}>{t.id}<div style={{ fontSize: 11, color: "#9b9384", fontWeight: 400 }}>รับ {t.date}</div></td>
                  <td style={{ ...S.td, textAlign: "left" }}>{custName(t.customerId)}</td>
                  <td style={S.td}>{fmt(recv(t))}</td>
                  <td style={{ ...S.td, color: "#15803D", fontWeight: 700 }}>{fmt(good(t))}</td>
                  <td style={{ ...S.td, color: "#B91C1C", fontWeight: 700 }}>{fmt(broken(t))}</td>
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
        {tray.status === "รอคัด" && <button style={S.trayBtnPrimary} onClick={onSort}><ClipboardCheck size={15} /> คัดแยกแผง</button>}
        {tray.status === "รอส่งคืน" && <>
          <button style={S.trayBtnGhost} onClick={onAnnounce}><Send size={14} /> แจ้งลูกค้า (LINE)</button>
          <button style={S.trayBtnPrimary} onClick={onReturned}><Truck size={15} /> ส่งแผงชำรุดคืนแล้ว</button></>}
        {tray.status === "ส่งคืนแล้ว" && <>
          <button style={S.trayBtnGhost} onClick={onAnnounce}><Copy size={14} /> ข้อความแจ้ง</button>
          <button style={S.trayBtnPrimary} onClick={onReplace}><RotateCcw size={15} /> รับแผงดีทดแทน{owed > 0 ? ` (ค้าง ${fmt(owed)})` : ""}</button></>}
        {tray.status === "ปิดรายการ" && (
          <span style={S.trayClosed}>
            <Check size={14} /> ปิดรายการแล้ว{tray.replacedDate ? ` · ทดแทนครบ ${tray.replacedDate}` : ""}
          </span>
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
function NewReturnModal({ onClose, onAdd, bills = [], trays = [], initialCustomerId = "" }) {
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [received, setReceived] = useState({ ใหญ่: "", เล็ก: "" });
  const [recvDate, setRecvDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const rN = { ใหญ่: parseInt(received.ใหญ่) || 0, เล็ก: parseInt(received.เล็ก) || 0 };
  const totalRecv = sumTray(rN);
  const recvDateTH = recvDate ? new Date(recvDate).toLocaleDateString("th-TH") : new Date().toLocaleDateString("th-TH");
  const valid = customerId && totalRecv > 0;
  const acc = customerId ? trayAccountOf(customerId, bills, trays) : null;  // อ้างอิง: ลูกค้ายืมแผงไปเท่าไร (จากบิล)
  const heldRef = acc ? acc.heldCount + acc.carriedOwed : 0;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.modal, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>รับแผงคืน</div><div style={S.modalSub}>บันทึกแผงที่ลูกค้าคืน (ใหญ่/เล็ก) → เข้าคิวรอคัด</div></div>
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
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #e3ddd0; border-radius: 4px; }
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
