/* Donate Way Admin Dashboard */

const $ = (id) => document.getElementById(id);

// نظام التابات (Tabs Navigation)
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    tab.classList.add('active');
    const pageId = 'page-' + tab.getAttribute('data-page');
    const page = $(pageId);
    if (page) page.classList.add('active');
  });
});

function log(...args) {
  const line = args.map(a => typeof a === "string" ? a : JSON.stringify(a, null, 2)).join(" ");
  const el = $("log");
  if (el) {
    el.textContent = `${new Date().toLocaleTimeString()}  ${line}\n` + el.textContent;
  }
}

function normalizeAssetCode(code) {
  return (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

// دالة الاتصال بالباك إند اللي بتبعت الباسورد (Admin Token) في الـ Headers
async function apiPost(path, body, adminToken) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { "X-Admin-Token": adminToken } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${res.status}: ${text}`);
  }
  return data;
}

/** Bootstrap Token: إنشاء العملة وإرسالها للموزع */
const btnBootstrap = $("btnBootstrap");
if (btnBootstrap) {
  btnBootstrap.addEventListener("click", async () => {
    const displayName = $("displayName").value.trim() || "Donate Way";
    const assetCode = normalizeAssetCode($("assetCode").value);
    $("assetCode").value = assetCode;
    
    const initialSupply = $("initialSupply").value.trim();
    const adminToken = $("adminToken").value.trim();
    
    if (!adminToken) return log("❌ لازم تكتب Admin Password في شاشة Dashboard الأول.");
    if (!assetCode) return log("❌ Asset Code فاضي.");
    if (!/^\d+(\.\d+)?$/.test(initialSupply)) return log("❌ Initial supply لازم رقم.");
    
    try {
      log("⏳ جاري إنشاء العملة (Bootstrap)...", { displayName, assetCode, initialSupply });
      $("bootOut").textContent = "Loading...";
      
      const data = await apiPost("/.netlify/functions/token_bootstrap", {
        displayName,
        assetCode,
        initialSupply,
      }, adminToken);
      
      log("✅ تمت عملية إنشاء العملة بنجاح:", data);
      $("bootOut").textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      log("❌ فشل إنشاء العملة:", e.message || e);
      $("bootOut").textContent = "Error: " + (e.message || e);
    }
  });
}

/** Create Sell Offer on DEX (عرض بيع) */
const btnSellOffer = $("btnSellOffer");
if (btnSellOffer) {
  btnSellOffer.addEventListener("click", async () => {
    const assetCode = normalizeAssetCode($("assetCode").value);
    const amount = $("dexAmount").value.trim();
    const price = $("dexPrice").value.trim();
    const adminToken = $("adminToken").value.trim();
    
    if (!adminToken) return log("❌ لازم تكتب Admin Password في شاشة Dashboard الأول.");
    if (!assetCode) return log("❌ Asset Code فاضي.");
    if (!amount || !price) return log("❌ الكمية والسعر مطلوبين.");
    
    try {
      log("⏳ جاري إنشاء عرض البيع...", { assetCode, amount, price });
      $("dexOut").textContent = "Loading...";
      
      const data = await apiPost("/.netlify/functions/dex_sell_offer", {
        assetCode,
        amount,
        price,
      }, adminToken);
      
      log("✅ تم إنشاء العرض بنجاح:", data);
      $("dexOut").textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      log("❌ فشل إنشاء العرض:", e.message || e);
      $("dexOut").textContent = "Error: " + (e.message || e);
    }
  });
}

/** AMM Add Liquidity (إضافة سيولة) */
const btnAddAmm = $("btnAddAmm");
if (btnAddAmm) {
  btnAddAmm.addEventListener("click", async () => {
    const assetCode = normalizeAssetCode($("assetCode").value);
    const tokenAmount = $("ammTokenAmount").value.trim();
    const piAmount = $("ammPiAmount").value.trim();
    const minPrice = $("ammMinPrice").value.trim();
    const maxPrice = $("ammMaxPrice").value.trim();
    const adminToken = $("adminToken").value.trim();

    if (!adminToken) return log("❌ لازم تكتب Admin Password في شاشة Dashboard الأول.");
    if (!tokenAmount || !piAmount) return log("❌ كمية العملة وكمية الـ Pi مطلوبين.");

    try {
      log("⏳ جاري إضافة السيولة للمجمع (AMM)...");
      $("ammOut").textContent = "Loading...";

      const data = await apiPost("/.netlify/functions/amm_add_liquidity", {
        assetCode,
        tokenAmount,
        piAmount,
        minPrice,
        maxPrice
      }, adminToken);

      log("✅ تمت إضافة السيولة بنجاح:", data);
      $("ammOut").textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      log("❌ فشل إضافة السيولة:", e.message || e);
      $("ammOut").textContent = "Error: " + (e.message || e);
    }
  });
}

log("✅ Dashboard Initialized. Admin Mode Active.");
