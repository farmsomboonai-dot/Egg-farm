import React, { useState, useMemo } from "react";
import {
  Search, Plus, Minus, Trash2, Check, X, Receipt, Package, User, ChevronRight,
  AlertCircle, ShoppingCart, RotateCcw, Copy, ClipboardCheck, Send, Truck, Clock,
  Warehouse, Egg, ArrowDownToLine, Image as ImageIcon,
  FileText, Wallet, LayoutDashboard, TrendingUp, Calendar, CheckCircle2, CircleDollarSign, QrCode,
} from "lucide-react";

/* =================================================================
   ฟาร์มไข่สมบูรณ์ · บริษัท เอสเจเอฟ ฟาร์ม จำกัด
   ต้นแบบระบบ: ขาย → คลังรายวัน → ผลผลิตรายหลัง
   ข้อมูลทั้งหมดเป็นข้อมูลสมมติ · 1 แผง = 30 ฟอง
================================================================= */

const PER_PRADANG = 30;          // ฟองต่อแผง
const TRAY_DEPOSIT = 7;          // ค่ามัดจำแผงดำ บาท/แผง
const VAT_RATE = 0;              // ภาษีมูลค่าเพิ่ม % (ฟาร์มไข่สดยกเว้น VAT = 0)
const fmt = (n) => (n ?? 0).toLocaleString("th-TH");
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
  promptpayId: "0645459929", // เบอร์พร้อมเพย์ของฟาร์ม (แก้ไขได้ในหน้าตั้งค่า)
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
const CUSTOMER_GROUPS = [
  { id: "retail", name: "ร้านขายปลีก (ฉันจะกินไข่สดทุกวัน)" },
  { id: "branch", name: "ร้านสาขาฟาร์มสมบูรณ์" },
  { id: "route_mk", name: "สายส่งรถฟาร์ม · แม่กลอง" },
  { id: "route_npt", name: "สายส่งรถฟาร์ม · นครปฐม" },
  { id: "route_bkk", name: "สายส่งรถฟาร์ม · กทม/นนทบุรี" },
  { id: "wholesale", name: "ขายส่ง รับเองหน้าฟาร์ม" },
  { id: "frontretail", name: "ขายปลีก หน้าฟาร์ม" },
];

// ---------- ลูกค้า ----------
const CUSTOMERS = [
  // กลุ่ม 1: ร้านขายปลีก "ฉันจะกินไข่สดทุกวัน"
  { id: "r1", group: "retail", name: "ดรุณา", phone: "081-xxx-1001" },
  { id: "r2", group: "retail", name: "เดอะเบสท์โฮม", phone: "081-xxx-1002" },
  { id: "r3", group: "retail", name: "ปตท", phone: "081-xxx-1003" },
  { id: "r4", group: "retail", name: "ออมสิน", phone: "081-xxx-1004" },
  { id: "r5", group: "retail", name: "เขาวัง", phone: "081-xxx-1005" },
  { id: "r6", group: "retail", name: "แม่กลอง", phone: "081-xxx-1006" },
  { id: "r7", group: "retail", name: "นครปฐม", phone: "081-xxx-1007" },
  { id: "r8", group: "retail", name: "นนทบุรี 1", phone: "081-xxx-1008" },
  { id: "r9", group: "retail", name: "นนทบุรี 2", phone: "081-xxx-1009" },
  // กลุ่ม 2: ร้านสาขาฟาร์มสมบูรณ์
  { id: "b1", group: "branch", name: "โรงงานจอมบึง", phone: "082-xxx-2001" },
  { id: "b2", group: "branch", name: "สาขา 33", phone: "082-xxx-2002" },
  { id: "b3", group: "branch", name: "สาขา 36", phone: "082-xxx-2003" },
  { id: "b4", group: "branch", name: "สาขา 38", phone: "082-xxx-2004" },
  { id: "b5", group: "branch", name: "สาขา 31", phone: "082-xxx-2005" },
  // กลุ่ม 3: สายส่งแม่กลอง
  { id: "mk1", group: "route_mk", name: "พ่อพี่เวย์", phone: "083-xxx-3001" },
  { id: "mk3", group: "route_mk", name: "คุณติ๊ก", phone: "083-xxx-3003" },
  { id: "mk4", group: "route_mk", name: "คุณกาญ", phone: "083-xxx-3004" },
  { id: "mk5", group: "route_mk", name: "คุณยุทธ (แม่กลอง)", phone: "083-xxx-3005" },
  { id: "mk6", group: "route_mk", name: "ร้านริมเขื่อน", phone: "083-xxx-3006" },
  { id: "mk7", group: "route_mk", name: "บ. สยาม โกอินเตอร์ ฟูดส์", phone: "083-xxx-3007" },
  // กลุ่ม 4: สายส่งนครปฐม
  { id: "npt1", group: "route_npt", name: "พี่เล็ก นครปฐม", phone: "084-xxx-4001" },
  // กลุ่ม 5: สายส่ง กทม/นนทบุรี
  { id: "bkk1", group: "route_bkk", name: "คุณนัท กทม.", phone: "085-xxx-5001" },
  { id: "bkk2", group: "route_bkk", name: "นนทบุรี (สายส่ง)", phone: "085-xxx-5002" },
  // กลุ่ม 6: ขายส่ง รับเองหน้าฟาร์ม
  { id: "w1", group: "wholesale", name: "ร้านสารพัดไข่พู่", phone: "086-xxx-6001" },
  { id: "w2", group: "wholesale", name: "คุณยุทธ", phone: "086-xxx-6002" },
  // กลุ่ม 7: ขายปลีก หน้าฟาร์ม
  { id: "f1", group: "frontretail", name: "ลูกค้าปลีกหน้าฟาร์ม", phone: "-" },
];

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
    { id: "w18", name: "ไข่คละ 18+", stock: 0 },
    { id: "w19", name: "ไข่คละ 19+", stock: 140 },
    { id: "w20", name: "ไข่คละ 20+", stock: 330 },
    { id: "w21", name: "ไข่คละ 21+", stock: 80 },
    { id: "w22", name: "ไข่คละ 22+", stock: 0 },
    { id: "w23", name: "ไข่คละ 23+", stock: 0 },
  ],
  ตกเกรด: [
    { id: "s_white", name: "ไข่เปลือกขาว", stock: 950 },
    { id: "g_bub", name: "ไข่บุบ", stock: 62 },
    { id: "g_tok", name: "ไข่ตอก (แก้ว)", stock: 0 },
    { id: "g_rao", name: "ไข่ร้าว", stock: 50 },
    { id: "g_jiw", name: "ไข่จิ๋ว", stock: 16 },
    { id: "g_sand", name: "หัวทราย", stock: 45 },
    { id: "g_nuan", name: "นวล", stock: 33 },
    { id: "g_pueanmak", name: "เปื้อนมาก", stock: 275 },
    { id: "g_pueannoi", name: "เปื้อนน้อย", stock: 480 },
  ],
  พิเศษ: [
    { id: "s_jumbo", name: "จัมโบ้ + แฝด", stock: 23 },
  ],
};

const ALL_PRODUCTS = Object.entries(PRODUCTS).flatMap(([group, list]) =>
  list.map((p) => ({ ...p, group }))
);
const PRODUCT_BY_ID = Object.fromEntries(ALL_PRODUCTS.map((p) => [p.id, p]));

// ลำดับสำหรับแสดงในรายงานคลัง (ตามรูปจริง)
const STOCK_ORDER = [
  "n0", "n1", "n2", "n3", "n4", "n5",
  "w18", "w19", "w20", "w21", "w22", "w23",
  "s_white", "g_jiw", "g_pueanmak", "g_pueannoi", "g_bub", "g_tok", "g_rao", "g_sand", "g_nuan",
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

// ---------- คลังรายวัน: ยอดยกมา + รับเข้า (สมมติ ตามรูป 22/6/69) ----------
const STOCK_OPENING = {
  n0: 205, n1: 627, n2: 1549, n3: 1278, n4: 637, n5: 120,
  w18: 0, w19: 0, w20: 0, w21: 0, w22: 0, w23: 0,
  s_white: 1118, s_jumbo: 0,
  g_jiw: 21, g_pueanmak: 170, g_pueannoi: 556, g_bub: 376, g_tok: 60, g_rao: 94, g_sand: 0, g_nuan: 0,
};
const STOCK_RECEIVED = {
  n0: 434, n1: 1417, n2: 2502, n3: 2304, n4: 680, n5: 97,
  w18: 0, w19: 0, w20: 0, w21: 0, w22: 0, w23: 0,
  s_white: 982, s_jumbo: 23,
  g_jiw: 15, g_pueanmak: 155, g_pueannoi: 324, g_bub: 157, g_tok: 60, g_rao: 9, g_sand: 0, g_nuan: 0,
};

// ---------- แผงดำ (mock) ----------
const TRAY_SEED = [
  { id: "RT-0001", customerId: "bkk1", date: "26/6/69", received: { ใหญ่: 500, เล็ก: 0 }, status: "รอคัด", sorted: null, sorter: null, replacedGood: { ใหญ่: 0, เล็ก: 0 } },
  { id: "RT-0002", customerId: "b3", date: "27/6/69", received: { ใหญ่: 300, เล็ก: 200 }, status: "รอส่งคืน", sorted: { good: { ใหญ่: 285, เล็ก: 190 }, broken: { ใหญ่: 15, เล็ก: 10 } }, sorter: "สมหญิง", replacedGood: { ใหญ่: 0, เล็ก: 0 } },
  { id: "RT-0003", customerId: "npt1", date: "27/6/69", received: { ใหญ่: 120, เล็ก: 0 }, status: "ปิดรายการ", sorted: { good: { ใหญ่: 118, เล็ก: 0 }, broken: { ใหญ่: 2, เล็ก: 0 } }, sorter: "สมชาย", replacedGood: { ใหญ่: 2, เล็ก: 0 }, replacedDate: "28/6/69" },
];
const TRAY_KINDS = ["ใหญ่", "เล็ก"];
const sumTray = (o) => (o ? (o.ใหญ่ || 0) + (o.เล็ก || 0) : 0);

/* ============================================================
   App หลัก — state กลาง: stock, salesLog, trayStock
============================================================ */
export default function App() {
  const [view, setView] = useState("sales");

  // สต็อกคงเหลือปัจจุบัน (เริ่ม = ยกมา + รับเข้า)
  const [stock, setStock] = useState(() => {
    const s = {};
    ALL_PRODUCTS.forEach((p) => {
      s[p.id] = (STOCK_OPENING[p.id] || 0) + (STOCK_RECEIVED[p.id] || 0);
    });
    return s;
  });

  // บันทึกการขายรายลูกค้า ต่อสินค้า → ใช้สร้างรายงานคลัง
  // โครงสร้าง: salesByProduct[productId][customerId] = แผง
  const [salesLog, setSalesLog] = useState({});

  const [trayStock, setTrayStock] = useState({ ใหญ่: 1240, เล็ก: 860 });

  // ประวัติบิลทั้งหมด (ใช้ในประวัติบิล / บัญชี / แดชบอร์ด)
  const [bills, setBills] = useState([]);
  // การรับชำระเงิน: { billNo: { paid: บาท, date, method } }
  const [payments, setPayments] = useState({});

  const addBill = (bill) => setBills((prev) => [bill, ...prev]);
  const recordPayment = (billNo, amount, method) =>
    setPayments((prev) => ({ ...prev, [billNo]: { paid: amount, date: new Date().toLocaleDateString("th-TH"), method } }));

  // เพิ่มยอดขายเข้า log (ตอนยืนยันบิล)
  const recordSale = (items, customerId) => {
    setSalesLog((prev) => {
      const next = { ...prev };
      items.forEach((it) => {
        if (!it.productId) return; // ข้ามรายการมัดจำ
        next[it.productId] = { ...(next[it.productId] || {}) };
        next[it.productId][customerId] = (next[it.productId][customerId] || 0) + it.qty;
      });
      return next;
    });
  };

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
        <nav style={S.nav}>
          {[
            { id: "sales", icon: <ShoppingCart size={16} />, label: "ขายไข่" },
            { id: "bills", icon: <FileText size={16} />, label: "ประวัติบิล" },
            { id: "account", icon: <Wallet size={16} />, label: "บัญชี/ลูกหนี้" },
            { id: "dash", icon: <LayoutDashboard size={16} />, label: "แดชบอร์ด" },
            { id: "stock", icon: <Warehouse size={16} />, label: "คลังรายวัน" },
            { id: "prod", icon: <Egg size={16} />, label: "ผลผลิต" },
            { id: "tray", icon: <RotateCcw size={16} />, label: "แผงดำ" },
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

      {view === "sales" && <SalesView stock={stock} setStock={setStock} recordSale={recordSale} addBill={addBill} bills={bills} payments={payments} trayStock={trayStock} setTrayStock={setTrayStock} />}
      {view === "bills" && <BillHistoryView bills={bills} payments={payments} />}
      {view === "account" && <AccountView bills={bills} payments={payments} recordPayment={recordPayment} />}
      {view === "dash" && <DashboardView bills={bills} payments={payments} />}
      {view === "stock" && <StockView stock={stock} salesLog={salesLog} />}
      {view === "prod" && <ProductionView setStock={setStock} />}
      {view === "tray" && <PanelTrayView trayStock={trayStock} setTrayStock={setTrayStock} />}
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
    if (window.QRCode) { draw(window.QRCode); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js";
    s.onload = () => draw(window.QRCode);
    s.onerror = () => setErr(true);
    document.body.appendChild(s);
    return () => { cancelled = true; };
  }, [id, amount]);

  if (err) return <div style={S.qrError}>ไม่สามารถสร้าง QR ได้</div>;
  return <canvas ref={ref} style={S.qrCanvas} />;
}

/* ============================================================
   หน้าจอ: ขายไข่  (ตรงตามฟอร์มบิลจริง)
============================================================ */
function SalesView({ stock, setStock, recordSale, addBill, bills, payments, trayStock, setTrayStock }) {
  const [customerId, setCustomerId] = useState(null);
  const [custSearch, setCustSearch] = useState("");
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("เบอร์");
  const [cart, setCart] = useState({});            // { productId: {qty, price} }
  const [trayOut, setTrayOut] = useState({ ใหญ่: "", เล็ก: "" });       // แผงดำส่งออกไปกับบิล
  const [trayReturn, setTrayReturn] = useState({ ใหญ่: "", เล็ก: "" }); // แผงดำรับคืนในบิลนี้
  const [discount, setDiscount] = useState("");    // ส่วนลดท้ายบิล (บาท)
  const [confirmedBill, setConfirmedBill] = useState(null);
  const [savingImg, setSavingImg] = useState(false);

  const customer = CUSTOMERS.find((c) => c.id === customerId);

  // ยอดค้างยกมาของลูกค้า = ผลรวม (ยอดบิล − ที่ชำระแล้ว) ของบิลเก่าที่ยังไม่ปิด
  const carryOver = useMemo(() => {
    if (!customerId) return 0;
    return bills
      .filter((b) => b.customerId === customerId)
      .reduce((s, b) => s + Math.max(0, b.total - (payments[b.no]?.paid || 0)), 0);
  }, [customerId, bills, payments]);
  const lastPriceOf = (pid) => (customer && LAST_PRICES[customerId]?.[pid]) || null; // { price, date } | null
  const lastPriceValue = (pid) => lastPriceOf(pid)?.price ?? null;

  const visibleProducts = PRODUCTS[activeGroup].filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (p, amount = 1) => {
    setCart((prev) => {
      const ex = prev[p.id];
      return { ...prev, [p.id]: { qty: (ex?.qty ?? 0) + amount, price: ex?.price ?? lastPriceValue(p.id) ?? 0 } };
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

  const cartItems = Object.entries(cart).map(([pid, it]) => ({
    productId: pid, product: PRODUCT_BY_ID[pid], ...it, subtotal: it.qty * it.price,
  }));

  // ค่ามัดจำแผงดำ = (ส่งออก − รับคืน) × 7 ; ถ้าติดลบ = 0 (ลูกค้าคืนมากกว่าส่ง)
  const trayOutTotal = (parseInt(trayOut.ใหญ่) || 0) + (parseInt(trayOut.เล็ก) || 0);
  const trayReturnTotal = (parseInt(trayReturn.ใหญ่) || 0) + (parseInt(trayReturn.เล็ก) || 0);
  const trayNet = Math.max(0, trayOutTotal - trayReturnTotal);
  const depositCharge = trayNet * TRAY_DEPOSIT;

  const eggTotal = cartItems.reduce((s, i) => s + i.subtotal, 0);
  const discountAmt = Math.min(parseFloat(discount) || 0, eggTotal + depositCharge); // ไม่ลดเกินยอด
  const billTotal = eggTotal + depositCharge - discountAmt;  // ยอดบิลนี้ (หลังหักส่วนลด)
  const total = billTotal;                                    // ยอดที่ต้องชำระสำหรับบิลนี้
  const grandTotal = billTotal + carryOver;                   // รวมยอดค้างยกมา
  const totalPrang = cartItems.reduce((s, i) => s + i.qty, 0);

  const overStock = cartItems.filter((i) => i.qty > stock[i.productId]);
  const canConfirm = customer && cartItems.length > 0 && overStock.length === 0;

  const confirmBill = () => {
    setStock((prev) => {
      const n = { ...prev };
      cartItems.forEach((i) => (n[i.productId] -= i.qty));
      return n;
    });
    recordSale(cartItems, customerId);
    const bill = {
      no: "IVE6906-" + String(Math.floor(Math.random() * 9000) + 1000),
      book: "086",
      customer, customerId,
      // เก็บรายการแบบเบา (ไม่พ่วง object product ทั้งก้อน เผื่อใช้ในหน้าอื่น)
      items: cartItems.map((i) => ({ productId: i.productId, name: i.product.name, qty: i.qty, price: i.price, subtotal: i.subtotal })),
      eggTotal, depositCharge, discount: discountAmt, total, totalPrang,
      carryOver, grandTotal,
      trayOut: { ...trayOut }, trayReturn: { ...trayReturn }, trayNet,
      date: new Date().toLocaleDateString("th-TH"),
      ts: Date.now(),
    };
    setConfirmedBill(bill);
    addBill(bill);
    setCart({});
    setTrayOut({ ใหญ่: "", เล็ก: "" });
    setTrayReturn({ ใหญ่: "", เล็ก: "" });
    setDiscount("");
  };

  const newBill = () => { setConfirmedBill(null); setCustomerId(null); };

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
              <div style={S.noteTitle}>ใบส่งสินค้า / ใบเสร็จรับเงิน</div>
              <div style={S.noteMetaRow}>เลขที่ <b style={{ color: ACCENT_DK }}>{b.no}</b></div>
              <div style={S.noteMetaRow}>วันที่ <b>{b.date}</b></div>
            </div>
          </div>

          <div style={S.noteCustBar}>
            <div style={{ flex: 1 }}>
              <span style={S.noteCustLabel}>นามลูกค้า</span>
              <span style={S.noteCustName}>{b.customer.name}</span>
              {b.customer.phone && b.customer.phone !== "-" && <div style={S.noteCustAddr}>โทร. {b.customer.phone}</div>}
            </div>
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
                  <td style={{ ...S.noteTd, textAlign: "left", fontWeight: 600 }}>ไข่ไก่ {i.name}</td>
                  <td style={S.noteTd}>{fmt(i.qty)} แผง</td>
                  <td style={S.noteTd}>{fmt2(i.price)}</td>
                  <td style={{ ...S.noteTd, textAlign: "right", fontWeight: 600 }}>{fmt2(i.subtotal)}</td>
                </tr>
              ))}
              {b.depositCharge > 0 && (
                <tr style={{ background: b.items.length % 2 ? "#FCFAF5" : "#fff" }}>
                  <td style={S.noteTd}>{b.items.length + 1}</td>
                  <td style={{ ...S.noteTd, textAlign: "left", fontWeight: 600 }}>ค่ามัดจำแผงดำ ({fmt(b.trayNet)} แผง)</td>
                  <td style={S.noteTd}>{fmt(b.trayNet)} แผง</td>
                  <td style={S.noteTd}>{fmt2(TRAY_DEPOSIT)}</td>
                  <td style={{ ...S.noteTd, textAlign: "right", fontWeight: 600 }}>{fmt2(b.depositCharge)}</td>
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
              <div style={S.noteSumRow}><span>รวมเป็นเงิน</span><span>{fmt2(b.eggTotal + b.depositCharge)}</span></div>
              <div style={S.noteSumRow}><span>หักส่วนลด</span><span>{(b.discount || 0) > 0 ? "−" : ""}{fmt2(b.discount || 0)}</span></div>
              <div style={S.noteSumRow}><span>ยอดหลังหักส่วนลด</span><span>{fmt2(b.total)}</span></div>
              <div style={S.noteSumRow}><span>ภาษีมูลค่าเพิ่ม {VAT_RATE.toFixed(2)}%</span><span>{fmt2(0)}</span></div>
              <div style={S.noteTotalSub}><span>ยอดบิลนี้</span><span>{fmt2(b.total)}</span></div>
              {(b.carryOver || 0) > 0 && (
                <div style={{ ...S.noteSumRow, color: "#B91C1C", fontWeight: 600 }}><span>ค้างชำระบิลก่อนหน้า</span><span>{fmt2(b.carryOver)}</span></div>
              )}
              <div style={S.noteTotal}><span>{(b.carryOver || 0) > 0 ? "รวมที่ต้องชำระทั้งสิ้น" : "จำนวนเงินรวมทั้งสิ้น"}</span><span style={S.noteTotalBaht}>{fmt2(b.grandTotal ?? b.total)}</span></div>
            </div>
          </div>

          {(["ใหญ่", "เล็ก"].some((k) => (parseInt(b.trayOut[k]) || 0) > 0 || (parseInt(b.trayReturn[k]) || 0) > 0)) && (
            <div style={S.noteTrayBox}>
              <div style={S.noteTrayTitle}>🥚 สรุปแผงดำ</div>
              <div style={S.noteTrayGrid}>
                <div style={S.noteTrayCell}><div style={S.noteTrayLabel}>แผงดำใหญ่</div><div style={S.noteTrayVal}>ส่ง {b.trayOut.ใหญ่ || 0} · คืน {b.trayReturn.ใหญ่ || 0}</div></div>
                <div style={S.noteTrayCell}><div style={S.noteTrayLabel}>แผงดำเล็ก</div><div style={S.noteTrayVal}>ส่ง {b.trayOut.เล็ก || 0} · คืน {b.trayReturn.เล็ก || 0}</div></div>
              </div>
            </div>
          )}

          {/* QR พร้อมเพย์ — สแกนจ่ายตามยอดรวม */}
          <div style={S.qrBox}>
            <div style={S.qrLeft}>
              <div style={S.qrTitle}>สแกนเพื่อชำระเงิน</div>
              <div style={S.qrPpLogo}>THAI QR PAYMENT · พร้อมเพย์</div>
              <div style={S.qrName}>{COMPANY.name}</div>
              <div style={S.qrAmount}>{fmt2(b.grandTotal ?? b.total)} บาท</div>
              <div style={S.qrId}>พร้อมเพย์ {COMPANY.promptpayId}</div>
            </div>
            <PromptPayQR id={COMPANY.promptpayId} amount={b.grandTotal ?? b.total} />
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
    const matched = CUSTOMERS.filter((c) => !q || c.name.toLowerCase().includes(q));
    return (
      <div style={S.stage}>
        <div style={S.stageLabel}>เลือกลูกค้า</div>
        <div style={S.searchBox}>
          <Search size={16} color="#9ca3af" />
          <input style={S.searchInput} placeholder="ค้นหาชื่อลูกค้า..." value={custSearch} onChange={(e) => setCustSearch(e.target.value)} />
        </div>
        {CUSTOMER_GROUPS.map((g) => {
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
                      <div style={S.custPhone}>{c.phone}</div>
                    </div>
                    <ChevronRight size={18} color="#9ca3af" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {matched.length === 0 && <div style={S.hint}>ไม่พบลูกค้าที่ค้นหา</div>}
      </div>
    );
  }

  // ---------- หน้าออกบิล ----------
  return (
    <>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>ออกบิลขาย · {customer.name}</span>
        <button style={S.ghostBtn} onClick={() => setCustomerId(null)}>เปลี่ยนลูกค้า</button>
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
        <div style={S.cartPanel}>
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
                        <input type="number" style={S.ciInput} value={i.price} onChange={(e) => setPrice(i.productId, parseFloat(e.target.value) || 0)} /></div>
                      <div style={S.ciSubWrap}><label style={S.ciLabel}>รวม</label><div style={S.ciSub}>{fmt(i.subtotal)}</div></div>
                    </div>
                    {over && <div style={S.overWarn}><AlertCircle size={12} /> เกินสต็อก (เหลือ {fmt(stock[i.productId])})</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* แผงดำในบิล */}
          <div style={S.trayBox}>
            <div style={S.trayBoxTitle}><RotateCcw size={13} /> แผงดำ (ส่ง / รับคืน)</div>
            <div style={S.trayBoxGrid}>
              <span></span><span style={S.trayBoxHd}>ส่งออก</span><span style={S.trayBoxHd}>รับคืน</span>
              {TRAY_KINDS.map((k) => (
                <React.Fragment key={k}>
                  <span style={S.trayBoxKind}>แผง{k}</span>
                  <input type="number" style={S.trayBoxInput} placeholder="0" value={trayOut[k]} onChange={(e) => setTrayOut((p) => ({ ...p, [k]: e.target.value }))} />
                  <input type="number" style={S.trayBoxInput} placeholder="0" value={trayReturn[k]} onChange={(e) => setTrayReturn((p) => ({ ...p, [k]: e.target.value }))} />
                </React.Fragment>
              ))}
            </div>
            {depositCharge > 0 && (
              <div style={S.depositLine}>คิดมัดจำสุทธิ {fmt(trayNet)} แผง × {TRAY_DEPOSIT} = <b>{fmt(depositCharge)} บาท</b></div>
            )}
          </div>

          <div style={S.cartFooter}>
            <div style={S.sumRow}><span>ค่าไข่</span><span>{fmt(eggTotal)} บาท</span></div>
            {depositCharge > 0 && <div style={S.sumRow}><span>ค่ามัดจำแผง</span><span>{fmt(depositCharge)} บาท</span></div>}

            {/* ช่องส่วนลดท้ายบิล */}
            <div style={S.discountRow}>
              <span style={S.discountLabel}>ส่วนลดท้ายบิล</span>
              <div style={S.discountInputWrap}>
                <input type="number" style={S.discountInput} placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                <span style={S.discountUnit}>บาท</span>
              </div>
            </div>
            {discountAmt > 0 && <div style={{ ...S.sumRow, color: "#15803D" }}><span>− ส่วนลด</span><span>−{fmt(discountAmt)} บาท</span></div>}

            <div style={S.sumTotal}><span>ยอดบิลนี้</span><span style={S.sumBaht}>{fmt(total)} บาท</span></div>

            {/* ยอดค้างจากบิลก่อนหน้า */}
            {carryOver > 0 && (
              <>
                <div style={S.carryRow}><span>+ ค้างชำระบิลก่อนหน้า</span><span style={{ fontWeight: 700, color: "#B91C1C" }}>{fmt(carryOver)} บาท</span></div>
                <div style={S.grandRow}><span>รวมที่ต้องชำระทั้งสิ้น</span><span style={S.grandBaht}>{fmt(grandTotal)} บาท</span></div>
              </>
            )}

            <button style={{ ...S.confirmBtn, ...(canConfirm ? {} : S.confirmBtnDisabled) }} disabled={!canConfirm} onClick={confirmBill}>
              <Check size={18} /> ยืนยันออกบิล · ตัดสต็อก
            </button>
            {overStock.length > 0 && <div style={S.footWarn}>มีสินค้าเกินสต็อก กรุณาแก้ไขก่อน</div>}
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   หน้าจอ: ประวัติบิล — ค้นย้อนหลัง + ดูซ้ำ
============================================================ */
function BillHistoryView({ bills, payments }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);

  const filtered = bills.filter((b) =>
    !q.trim() || b.customer.name.toLowerCase().includes(q.toLowerCase()) || b.no.toLowerCase().includes(q.toLowerCase())
  );

  const payStatus = (b) => {
    const p = payments[b.no];
    if (p && p.paid >= b.total) return { label: "ชำระแล้ว", bg: "#DCFCE7", c: "#15803D" };
    if (p && p.paid > 0) return { label: "ชำระบางส่วน", bg: "#FEF3C7", c: "#B45309" };
    return { label: "ค้างชำระ", bg: "#FEE2E2", c: "#B91C1C" };
  };

  if (selected) {
    return <BillDetail bill={selected} payment={payments[selected.no]} onBack={() => setSelected(null)} />;
  }

  return (
    <div style={S.wide}>
      <div style={S.subBar}><span style={S.subBarTitle}>ประวัติบิล ({bills.length} ใบ)</span></div>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 0" }}>
        <div style={S.searchBox}>
          <Search size={16} color="#9ca3af" />
          <input style={S.searchInput} placeholder="ค้นหาชื่อลูกค้า หรือเลขที่บิล..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <div style={S.emptyState}>
            <FileText size={36} color="#d1d5db" />
            <div>{bills.length === 0 ? "ยังไม่มีบิล — ออกบิลในหน้าขายไข่ก่อน" : "ไม่พบบิลที่ค้นหา"}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((b) => {
              const st = payStatus(b);
              return (
                <button key={b.no} style={S.billRow} className="customerCard" onClick={() => setSelected(b)}>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={S.billRowTop}>
                      <span style={S.billRowNo}>{b.no}</span>
                      <span style={{ ...S.statusPill, background: st.bg, color: st.c }}>{st.label}</span>
                    </div>
                    <div style={S.billRowCust}>{b.customer.name} · {b.date}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={S.billRowAmt}>{fmt(b.total)} บ.</div>
                    <div style={S.billRowItems}>{b.items.length} รายการ</div>
                  </div>
                  <ChevronRight size={18} color="#9ca3af" />
                </button>
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
      <button style={S.ghostBtn} onClick={onBack}>← กลับ</button>
      <div style={{ ...S.note, marginTop: 14 }}>
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
            <div style={S.noteTitle}>ใบส่งสินค้า / ใบเสร็จรับเงิน</div>
            <div style={S.noteMetaRow}>เลขที่ <b style={{ color: ACCENT_DK }}>{b.no}</b></div>
            <div style={S.noteMetaRow}>วันที่ <b>{b.date}</b></div>
          </div>
        </div>
        <div style={S.noteCustBar}>
          <div style={{ flex: 1 }}><span style={S.noteCustLabel}>นามลูกค้า</span><span style={S.noteCustName}>{b.customer.name}</span></div>
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
                <td style={{ ...S.noteTd, textAlign: "left", fontWeight: 600 }}>ไข่ไก่ {i.name}</td>
                <td style={S.noteTd}>{fmt(i.qty)} แผง</td>
                <td style={S.noteTd}>{fmt2(i.price)}</td>
                <td style={{ ...S.noteTd, textAlign: "right", fontWeight: 600 }}>{fmt2(i.subtotal)}</td>
              </tr>
            ))}
            {b.depositCharge > 0 && (
              <tr style={{ background: b.items.length % 2 ? "#FCFAF5" : "#fff" }}>
                <td style={S.noteTd}>{b.items.length + 1}</td>
                <td style={{ ...S.noteTd, textAlign: "left", fontWeight: 600 }}>ค่ามัดจำแผงดำ ({fmt(b.trayNet)} แผง)</td>
                <td style={S.noteTd}>{fmt(b.trayNet)} แผง</td>
                <td style={S.noteTd}>{fmt2(TRAY_DEPOSIT)}</td>
                <td style={{ ...S.noteTd, textAlign: "right", fontWeight: 600 }}>{fmt2(b.depositCharge)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={S.noteSummary}>
          <div style={S.noteTotal}><span>จำนวนเงินรวมทั้งสิ้น</span><span style={S.noteTotalBaht}>{fmt2(b.total)}</span></div>
        </div>
        <div style={{ margin: "12px 24px 0" }}>
          <div style={S.noteBahtVal}>( {bahtText(b.total)} )</div>
        </div>
        {!(payment && payment.paid >= b.total) && (
          <div style={S.qrBox}>
            <div style={S.qrLeft}>
              <div style={S.qrTitle}>สแกนเพื่อชำระเงิน</div>
              <div style={S.qrPpLogo}>THAI QR PAYMENT · พร้อมเพย์</div>
              <div style={S.qrName}>{COMPANY.name}</div>
              <div style={S.qrAmount}>{fmt2(b.total - (payment?.paid || 0))} บาท</div>
              <div style={S.qrId}>พร้อมเพย์ {COMPANY.promptpayId}</div>
            </div>
            <PromptPayQR id={COMPANY.promptpayId} amount={b.total - (payment?.paid || 0)} />
          </div>
        )}
        <div style={S.noteFooter}>
          {payment && payment.paid >= b.total
            ? <div style={{ color: "#15803D", fontWeight: 700 }}>✓ ชำระแล้ว {payment.date} ({payment.method})</div>
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
                      {r.owed > 0 && <button style={S.payBtn} onClick={() => setPayModal(r.bill)}>รับชำระ</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {payModal && <PaymentModal bill={payModal} current={payments[payModal.no]?.paid || 0} onClose={() => setPayModal(null)} onPay={(amt, method) => { recordPayment(payModal.no, amt, method); setPayModal(null); }} />}
    </div>
  );
}

function PaymentModal({ bill, current, onClose, onPay }) {
  const owed = bill.total - current;
  const [amount, setAmount] = useState(String(owed));
  const [method, setMethod] = useState("เงินสด");
  const amt = parseFloat(amount) || 0;
  const valid = amt > 0;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
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
        <button style={{ ...S.primaryBtn, ...(valid ? {} : S.confirmBtnDisabled) }} disabled={!valid} onClick={() => onPay(amt, method)}>
          บันทึกรับชำระ {fmt(amt)} บาท
        </button>
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
function StockView({ stock, salesLog }) {
  // ลูกค้าที่มีการขายจริงในวันนี้ (มีคอลัมน์)
  const activeCustomers = useMemo(() => {
    const ids = new Set();
    Object.values(salesLog).forEach((perCust) =>
      Object.entries(perCust).forEach(([cid, q]) => { if (q > 0) ids.add(cid); })
    );
    return CUSTOMERS.filter((c) => ids.has(c.id));
  }, [salesLog]);

  const rows = STOCK_ORDER.map((pid) => {
    const opening = STOCK_OPENING[pid] || 0;
    const received = STOCK_RECEIVED[pid] || 0;
    const perCust = salesLog[pid] || {};
    const sold = Object.values(perCust).reduce((s, q) => s + q, 0);
    const remain = opening + received - sold;
    return { pid, name: PRODUCT_BY_ID[pid]?.name || pid, opening, received, total: opening + received, perCust, sold, remain };
  });

  const totals = rows.reduce((t, r) => ({
    opening: t.opening + r.opening, received: t.received + r.received,
    total: t.total + r.total, sold: t.sold + r.sold, remain: t.remain + r.remain,
  }), { opening: 0, received: 0, total: 0, sold: 0, remain: 0 });

  return (
    <div style={S.wide}>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>รายงานคลังไข่ประจำวัน · {new Date().toLocaleDateString("th-TH")}</span>
      </div>
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
              <th style={{ ...S.th, background: "#E7F2E9" }}>คงเหลือ</th>
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
            </tr>
          </tbody>
        </table>
      </div>
      <div style={S.hint}>
        คอลัมน์ลูกค้าจะปรากฏอัตโนมัติเมื่อมีการออกบิลขายในหน้า "ขายไข่" · สูตร: ยกมา + รับเข้า − ขาย = คงเหลือ
      </div>
    </div>
  );
}

/* ============================================================
   หน้าจอ: ผลผลิต/ดึงไข่รายหลัง (H.2–H.6)
============================================================ */
const HOUSES = [
  { id: "H2", chickens: 65947, grade: { เบอร์: { 0: 1575, 1: 6823, 2: 15489, 3: 13709, 4: 4775, 5: 812 }, ตกเกรด: { จัมโบ้: 2, บุบ: 53, ตอก: 4, จิ๋ว: 3, หัวทราย: 121, นวล: 154, เปื้อนมาก: 35, เปื้อนน้อย: 140 } } },
  { id: "H3", chickens: 65417, grade: { เบอร์: { 0: 4030, 1: 10618, 2: 15711, 3: 8869, 4: 1985, 5: 270 }, ตกเกรด: { จัมโบ้: 7, บุบ: 20, ตอก: 2, จิ๋ว: 1, หัวทราย: 99, นวล: 141, เปื้อนมาก: 21, เปื้อนน้อย: 96 } } },
  { id: "H4", chickens: 67341, grade: { เบอร์: { 0: 1702, 1: 6706, 2: 14392, 3: 12606, 4: 4480, 5: 753 }, ตกเกรด: { จัมโบ้: 2, บุบ: 24, ตอก: 5, จิ๋ว: 3, หัวทราย: 100, นวล: 154, เปื้อนมาก: 15, เปื้อนน้อย: 73 } } },
  { id: "H5", chickens: 66478, grade: { เบอร์: { 0: 1464, 1: 5393, 2: 12930, 3: 13396, 4: 4979, 5: 909 }, ตกเกรด: { จัมโบ้: 2, บุบ: 14, ตอก: 2, จิ๋ว: 3, หัวทราย: 66, นวล: 65, เปื้อนมาก: 12, เปื้อนน้อย: 50 } } },
  { id: "H6", chickens: 66471, grade: { เบอร์: { 0: 1965, 1: 9321, 2: 17974, 3: 18502, 4: 5468, 5: 923 }, ตกเกรด: { จัมโบ้: 4, บุบ: 34, ตอก: 10, จิ๋ว: 4, หัวทราย: 53, นวล: 44, เปื้อนมาก: 15, เปื้อนน้อย: 0 } } },
];

function ProductionView({ setStock }) {
  const [imported, setImported] = useState({});

  const calc = (h) => {
    const goodFong = Object.values(h.grade.เบอร์).reduce((s, v) => s + v, 0);
    const goodPrang = goodFong / PER_PRADANG;
    const offgrade = Object.values(h.grade.ตกเกรด).reduce((s, v) => s + v, 0); // หน่วยแผง
    const offFong = offgrade * PER_PRADANG;
    const totalFong = goodFong + offFong;
    const pctOff = totalFong ? (offFong / totalFong) * 100 : 0;
    const pctTotal = h.chickens ? (totalFong / h.chickens) * 100 : 0;
    return { goodFong, goodPrang, offgrade, totalFong, pctOff, pctTotal };
  };

  const importHouse = (h) => {
    setStock((prev) => {
      const n = { ...prev };
      const map = { 0: "n0", 1: "n1", 2: "n2", 3: "n3", 4: "n4", 5: "n5" };
      Object.entries(h.grade.เบอร์).forEach(([num, fong]) => {
        const pid = map[num]; if (pid) n[pid] = (n[pid] || 0) + Math.round(fong / PER_PRADANG);
      });
      return n;
    });
    setImported((p) => ({ ...p, [h.id]: true }));
  };

  const grand = HOUSES.reduce((t, h) => {
    const c = calc(h);
    return { good: t.good + c.goodFong, off: t.off + c.offgrade, total: t.total + c.totalFong };
  }, { good: 0, off: 0, total: 0 });

  return (
    <div style={S.wide}>
      <div style={S.subBar}><span style={S.subBarTitle}>รายงานผลผลิตไข่ประจำวัน · รายหลัง</span></div>
      <div style={S.tableScroll}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, ...S.thSticky, textAlign: "left" }}>หลัง</th>
              <th style={S.th}>จำนวนไก่</th>
              <th style={S.th}>ไข่ดี (ฟอง)</th>
              <th style={S.th}>ไข่ดี (แผง)</th>
              <th style={S.th}>ตกเกรด (แผง)</th>
              <th style={{ ...S.th, background: "#FBEFDD" }}>%ตกเกรด</th>
              <th style={{ ...S.th, background: "#E7F2E9" }}>%ไข่รวม</th>
              <th style={S.th}>รับเข้าคลัง</th>
            </tr>
          </thead>
          <tbody>
            {HOUSES.map((h) => {
              const c = calc(h);
              return (
                <tr key={h.id}>
                  <td style={{ ...S.td, ...S.tdSticky, fontWeight: 700, textAlign: "left" }}>{h.id}</td>
                  <td style={S.td}>{fmt(h.chickens)}</td>
                  <td style={S.td}>{fmt(c.goodFong)}</td>
                  <td style={S.td}>{fmt1(c.goodPrang)}</td>
                  <td style={S.td}>{fmt(c.offgrade)}</td>
                  <td style={{ ...S.td, background: "#FEF8F0", fontWeight: 600 }}>{c.pctOff.toFixed(2)}%</td>
                  <td style={{ ...S.td, background: "#F1F8F2", fontWeight: 700, color: "#15803D" }}>{c.pctTotal.toFixed(2)}%</td>
                  <td style={S.td}>
                    {imported[h.id]
                      ? <span style={S.importedTag}><Check size={13} /> เข้าแล้ว</span>
                      : <button style={S.importBtn} onClick={() => importHouse(h)}><ArrowDownToLine size={13} /> รับเข้า</button>}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td style={{ ...S.td, ...S.tdSticky, ...S.tfoot, textAlign: "left" }}>รวม</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(HOUSES.reduce((s, h) => s + h.chickens, 0))}</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(grand.good)}</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt1(grand.good / PER_PRADANG)}</td>
              <td style={{ ...S.td, ...S.tfoot }}>{fmt(grand.off)}</td>
              <td style={{ ...S.td, ...S.tfoot }}>{grand.total ? ((grand.off * PER_PRADANG / grand.total) * 100).toFixed(2) : 0}%</td>
              <td style={{ ...S.td, ...S.tfoot }}>—</td>
              <td style={{ ...S.td, ...S.tfoot }}>—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={S.hint}>กด "รับเข้า" เพื่อโอนยอดไข่ดีของแต่ละหลังเข้าสต็อกคลัง · %ไข่รวม = ไข่รวม ÷ จำนวนไก่</div>
    </div>
  );
}

/* ============================================================
   หน้าจอ: ระบบแผงดำ
============================================================ */
function PanelTrayView({ trayStock, setTrayStock }) {
  const [trays, setTrays] = useState(TRAY_SEED);
  const [sortModal, setSortModal] = useState(null);
  const [lineModal, setLineModal] = useState(null);
  const [newReturn, setNewReturn] = useState(false);
  const [tab, setTab] = useState("list"); // list | byCustomer
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

  // สรุปแผงดำรายลูกค้า
  const byCustomer = useMemo(() => {
    const map = {};
    trays.forEach((t) => {
      const key = t.customerId;
      if (!map[key]) map[key] = { customerId: key, name: custName(key), received: 0, good: 0, broken: 0, owed: 0, trays: [] };
      const m = map[key];
      m.received += sumTray(t.received);
      if (t.sorted) {
        m.good += sumTray(t.sorted.good);
        m.broken += sumTray(t.sorted.broken);
        if (t.status !== "ปิดรายการ") m.owed += sumTray(t.sorted.broken) - sumTray(t.replacedGood);
      }
      m.trays.push(t);
    });
    return Object.values(map).sort((a, b) => b.owed - a.owed);
  }, [trays]);

  const applySort = (trayId, good, broken, sorter) => {
    setTrays((prev) => prev.map((t) => t.id === trayId ? { ...t, status: "รอส่งคืน", sorted: { good, broken }, sorter } : t));
    setTrayStock((prev) => ({ ใหญ่: prev.ใหญ่ + (good.ใหญ่ || 0), เล็ก: prev.เล็ก + (good.เล็ก || 0) }));
    setSortModal(null);
  };
  const markReturned = (id) => setTrays((p) => p.map((t) => t.id === id ? { ...t, status: "ส่งคืนแล้ว" } : t));
  const closeTray = (id) => setTrays((p) => p.map((t) => t.id === id ? { ...t, status: "ปิดรายการ", replacedGood: { ...t.sorted.broken }, replacedDate: new Date().toLocaleDateString("th-TH") } : t));
  const addReturn = (customerId, received) => {
    const no = "RT-" + String(trays.length + 1).padStart(4, "0");
    setTrays((p) => [{ id: no, customerId, date: new Date().toLocaleDateString("th-TH"), received, status: "รอคัด", sorted: null, sorter: null, replacedGood: { ใหญ่: 0, เล็ก: 0 } }, ...p]);
    setNewReturn(false);
  };

  return (
    <>
      <div style={S.subBar}>
        <span style={S.subBarTitle}>แผงดำหมุนเวียน</span>
        <button style={S.primarySmBtn} onClick={() => setNewReturn(true)}><Plus size={15} /> รับแผงคืน</button>
      </div>
      <div style={S.trayWrap}>
        <div style={S.summaryGrid}>
          <SummaryCard icon={<Clock size={18} />} label="รอคัดแยก" value={summary.waitingSort} tone="amber" />
          <SummaryCard icon={<Truck size={18} />} label="ชำรุดรอส่งคืน" value={summary.brokenToReturn} tone="red" />
          <SummaryCard icon={<RotateCcw size={18} />} label="ค้างทดแทน" value={summary.replaceOwed} tone="red" />
          <SummaryCard icon={<Package size={18} />} label="แผงดีในฟาร์ม" value={sumTray(trayStock)} tone="green" sub={`ใหญ่ ${fmt(trayStock.ใหญ่)} · เล็ก ${fmt(trayStock.เล็ก)}`} />
        </div>

        <div style={S.trayTabs}>
          <button style={{ ...S.trayTab, ...(tab === "list" ? S.trayTabActive : {}) }} onClick={() => setTab("list")}>รายการใบรับคืน</button>
          <button style={{ ...S.trayTab, ...(tab === "byCustomer" ? S.trayTabActive : {}) }} onClick={() => setTab("byCustomer")}>สรุปรายลูกค้า</button>
        </div>

        {tab === "list" ? (
          <div style={S.trayList}>
            {trays.map((t) => (
              <TrayCard key={t.id} tray={t} custName={custName(t.customerId)}
                onSort={() => setSortModal(t)} onReturned={() => markReturned(t.id)}
                onAnnounce={() => setLineModal(t)} onClose={() => closeTray(t.id)} />
            ))}
          </div>
        ) : (
          <TrayByCustomer rows={byCustomer} />
        )}
      </div>
      {sortModal && <SortModal tray={sortModal} custName={custName(sortModal.customerId)} onClose={() => setSortModal(null)} onApply={applySort} />}
      {lineModal && <LineModal tray={lineModal} custName={custName(lineModal.customerId)} onClose={() => setLineModal(null)} />}
      {newReturn && <NewReturnModal onClose={() => setNewReturn(false)} onAdd={addReturn} />}
    </>
  );
}

function TrayByCustomer({ rows }) {
  const [expanded, setExpanded] = useState(null);
  if (rows.length === 0) return <div style={S.emptyState}><RotateCcw size={36} color="#d1d5db" /><div>ยังไม่มีข้อมูลแผงคืน</div></div>;

  const statusText = (t) => {
    if (t.status === "ปิดรายการ") return `ทดแทนครบ ${t.replacedDate || ""}`;
    if (t.status === "รอคัด") return "รอคัดแยก";
    if (t.status === "รอส่งคืน") return "ชำรุดรอส่งคืน";
    if (t.status === "ส่งคืนแล้ว") return "รอลูกค้าทดแทน";
    return t.status;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => {
        const open = expanded === r.customerId;
        return (
          <div key={r.customerId} style={S.byCustCard}>
            <button style={S.byCustHead} onClick={() => setExpanded(open ? null : r.customerId)}>
              <div style={S.byCustIcon}><User size={18} /></div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={S.byCustName}>{r.name}</div>
                <div style={S.byCustMeta}>{r.trays.length} รายการ · รับคืนรวม {fmt(r.received)} แผง</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {r.owed > 0
                  ? <div style={S.byCustOwed}>ค้างทดแทน {fmt(r.owed)}</div>
                  : <div style={S.byCustClear}>✓ ไม่ค้าง</div>}
                <div style={S.byCustGood}>แผงดีเข้าสต็อก {fmt(r.good)}</div>
              </div>
              <ChevronRight size={18} color="#9ca3af" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
            </button>
            {open && (
              <div style={S.byCustDetail}>
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
                        {t.replacedDate && <span style={{ color: "#15803D" }}> · ทดแทน {t.replacedDate}</span>}
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

function SummaryCard({ icon, label, value, tone, sub, unit = "แผง" }) {
  const c = { amber: "#B45309", red: "#B91C1C", green: "#15803D" }[tone] || "#2B2620";
  const bg = { amber: "#FEF3C7", red: "#FEE2E2", green: "#DCFCE7" }[tone] || "#f3f0e9";
  return (
    <div style={S.sumCard}>
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

function TrayCard({ tray, custName, onSort, onReturned, onAnnounce, onClose }) {
  const st = STATUS_STYLE[tray.status];
  const owed = tray.sorted ? sumTray(tray.sorted.broken) - sumTray(tray.replacedGood) : 0;
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
          {tray.status !== "ปิดรายการ" && <div><div style={S.tsLabel}>ค้างทดแทน</div><div style={{ ...S.tsVal, color: owed > 0 ? "#B91C1C" : "#15803D" }}>{fmt(owed)}</div></div>}
        </>}
      </div>
      <div style={S.trayActions}>
        {tray.status === "รอคัด" && <button style={S.trayBtnPrimary} onClick={onSort}><ClipboardCheck size={15} /> คัดแยกแผง</button>}
        {tray.status === "รอส่งคืน" && <>
          <button style={S.trayBtnGhost} onClick={onAnnounce}><Send size={14} /> แจ้งลูกค้า (LINE)</button>
          <button style={S.trayBtnPrimary} onClick={onReturned}><Truck size={15} /> ส่งแผงชำรุดคืนแล้ว</button></>}
        {tray.status === "ส่งคืนแล้ว" && <>
          <button style={S.trayBtnGhost} onClick={onAnnounce}><Copy size={14} /> ข้อความแจ้ง</button>
          <button style={S.trayBtnPrimary} onClick={onClose}><Check size={15} /> รับแผงดีทดแทนครบ · ปิด</button></>}
        {tray.status === "ปิดรายการ" && (
          <span style={S.trayClosed}>
            <Check size={14} /> ปิดรายการแล้ว{tray.replacedDate ? ` · ลูกค้านำแผงดีมาทดแทน ${tray.replacedDate}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function SortModal({ tray, custName, onClose, onApply }) {
  const [good, setGood] = useState({ ใหญ่: tray.received.ใหญ่, เล็ก: tray.received.เล็ก });
  const [broken, setBroken] = useState({ ใหญ่: 0, เล็ก: 0 });
  const [sorter, setSorter] = useState("");
  const onBroken = (k, raw) => {
    const v = Math.min(parseInt(raw) || 0, tray.received[k]);
    setBroken((p) => ({ ...p, [k]: v }));
    setGood((p) => ({ ...p, [k]: tray.received[k] - v }));
  };
  const valid = sorter.trim() && (sumTray(good) + sumTray(broken)) > 0;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>คัดแยกแผงดำ</div><div style={S.modalSub}>{tray.id} · {custName}</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={S.sortTable}>
          <div style={S.sortHeadRow}><span></span><span>รับคืน</span><span style={{ color: "#B91C1C" }}>ชำรุด</span><span style={{ color: "#15803D" }}>แผงดี</span></div>
          {TRAY_KINDS.map((k) => (
            <div key={k} style={S.sortRow}>
              <span style={S.sortKind}>แผง{k}</span>
              <span style={S.sortRecv}>{tray.received[k]}</span>
              <input type="number" style={S.sortInput} value={broken[k] || ""} placeholder="0" onChange={(e) => onBroken(k, e.target.value)} />
              <span style={S.sortGood}>{good[k]}</span>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={S.ciLabel}>ผู้คัด</label>
          <input style={S.fullInput} placeholder="ชื่อเจ้าหน้าที่ที่คัด" value={sorter} onChange={(e) => setSorter(e.target.value)} />
        </div>
        <div style={S.weighSummary}>
          <div style={S.wsRow}><span>แผงดี (เข้าสต็อกฟาร์ม)</span><span style={{ color: "#15803D", fontWeight: 700 }}>{fmt(sumTray(good))} แผง</span></div>
          <div style={S.wsRow}><span>แผงชำรุด (รอส่งคืน + ค้างทดแทน)</span><span style={{ color: "#B91C1C", fontWeight: 700 }}>{fmt(sumTray(broken))} แผง</span></div>
        </div>
        <button style={{ ...S.primaryBtn, ...(valid ? {} : S.confirmBtnDisabled) }} disabled={!valid} onClick={() => onApply(tray.id, good, broken, sorter.trim())}>บันทึกการคัดแยก</button>
      </div>
    </div>
  );
}

function LineModal({ tray, custName, onClose }) {
  const [copied, setCopied] = useState(false);
  const b = tray.sorted.broken, g = tray.sorted.good;
  const text = [
    `📋 แจ้งผลคัดแผงดำ ${tray.id}`,
    `ลูกค้า: ${custName}`, `วันที่รับคืน ${tray.date}`, ``,
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

function NewReturnModal({ onClose, onAdd }) {
  const [customerId, setCustomerId] = useState("");
  const [recv, setRecv] = useState({ ใหญ่: "", เล็ก: "" });
  const valid = customerId && (parseInt(recv.ใหญ่) || 0) + (parseInt(recv.เล็ก) || 0) > 0;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div><div style={S.modalTitle}>รับแผงดำคืน</div><div style={S.modalSub}>ระบุจำนวนที่รับจริง · เริ่มที่ "รอคัด"</div></div>
          <button style={S.modalClose} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={S.ciLabel}>ลูกค้า</label>
          <select style={S.fullInput} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— เลือกลูกค้า —</option>
            {CUSTOMERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={S.recvGrid}>
          {TRAY_KINDS.map((k) => (
            <div key={k}><label style={S.ciLabel}>แผง{k} (แผง)</label>
              <input type="number" style={S.fullInput} placeholder="0" value={recv[k]} onChange={(e) => setRecv((p) => ({ ...p, [k]: e.target.value }))} /></div>
          ))}
        </div>
        <button style={{ ...S.primaryBtn, marginTop: 16, ...(valid ? {} : S.confirmBtnDisabled) }} disabled={!valid}
          onClick={() => onAdd(customerId, { ใหญ่: parseInt(recv.ใหญ่) || 0, เล็ก: parseInt(recv.เล็ก) || 0 })}>บันทึกรับคืน</button>
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

  cartPanel: { background: "#fff", border: "1px solid #ece6da", borderRadius: 16, position: "sticky", top: 84, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 110px)" },
  cartHead: { display: "flex", alignItems: "center", gap: 8, padding: "16px 16px 12px", fontWeight: 700, fontSize: 15, borderBottom: "1px solid #f3f0e9" },
  emptyCart: { padding: "40px 24px", textAlign: "center", color: "#9b9384", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontSize: 14 },
  emptyHint: { fontSize: 12.5, color: "#b5ad9e" },
  cartList: { flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10, minHeight: 60 },
  cartItem: { background: "#fbf9f4", border: "1px solid #f0ece2", borderRadius: 12, padding: 12 },
  ciTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  ciName: { fontWeight: 600, fontSize: 14 },
  ciDel: { background: "transparent", border: "none", color: "#c4998a", cursor: "pointer", padding: 2 },
  ciControls: { display: "flex", alignItems: "flex-end", gap: 8 },
  ciField: { flex: 1 },
  ciLabel: { fontSize: 10.5, color: "#9b9384", display: "block", marginBottom: 3 },
  ciInput: { width: "100%", padding: "7px 8px", border: "1px solid #e3ddd0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", textAlign: "center", outline: "none", boxSizing: "border-box" },
  ciX: { color: "#bbb", paddingBottom: 8 },
  ciSubWrap: { textAlign: "right", minWidth: 56 },
  ciSub: { fontWeight: 700, fontSize: 15, paddingTop: 4 },
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
  noteSignBox: { margin: "18px 24px 0", padding: "14px 16px", border: "1px solid #f0e6d6", borderRadius: 12, background: "#FEFCF7" },
  qrBox: { margin: "16px 24px 0", padding: "16px", border: "1.5px solid #E6C99A", borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  qrLeft: { flex: "1 1 160px" },
  qrTitle: { fontSize: 14, fontWeight: 700, color: INK, marginBottom: 4 },
  qrPpLogo: { fontSize: 10.5, fontWeight: 700, color: "#1A4F8B", letterSpacing: 0.5, marginBottom: 10 },
  qrName: { fontSize: 12.5, color: "#6b6358" },
  qrAmount: { fontSize: 22, fontWeight: 800, color: ACCENT_DK, margin: "4px 0" },
  qrId: { fontSize: 11.5, color: "#9b9384" },
  qrCanvas: { width: 150, height: 150, flexShrink: 0 },
  qrError: { width: 150, height: 150, display: "grid", placeItems: "center", fontSize: 12, color: "#b5ad9e", border: "1px dashed #d6d0c4", borderRadius: 8, flexShrink: 0, textAlign: "center", padding: 8 },
  noteSignText: { fontSize: 12, color: "#8a8275", textAlign: "center", marginBottom: 18 },
  noteSignRow: { display: "flex", gap: 24, justifyContent: "space-between" },
  noteSignCol: { flex: 1, textAlign: "center" },
  noteSignLine: { borderBottom: "1px dotted #b5ad9e", height: 1, marginBottom: 6 },
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
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; }
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
  .customerCard:hover { border-color: ${ACCENT} !important; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #e3ddd0; border-radius: 4px; }
  @media (max-width: 900px) {
    [style*="grid-template-columns: 1fr 390px"] { grid-template-columns: 1fr !important; }
    [style*="repeat(4, 1fr)"] { grid-template-columns: 1fr 1fr !important; }
  }
`;
