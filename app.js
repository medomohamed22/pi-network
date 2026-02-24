
/* Donate Way Dashboard */

const $ = (id) => document.getElementById(id);

const state = {
  auth: null,
};

function log(...args) {
  const line = args.map(a => typeof a === "string" ? a : JSON.stringify(a, null, 2)).join(" ");
  const el = $("log");
  if (el) {
    el.textContent = `${new Date().toLocaleTimeString()}  ${line}\n` + el.textContent;
  }
}

function setStatus() {
  const Pi = window.Pi;
  if ($("sdkConnected")) $("sdkConnected").textContent = Pi ? "Loaded" : "Not loaded";
  if ($("sdkUser")) $("sdkUser").textContent = state.auth?.user?.username || "—";
  if ($("sdkUid")) $("sdkUid").textContent = state.auth?.user?.uid || "—";
  if ($("sdkToken")) $("sdkToken").textContent = state.auth?.accessToken ? state.auth.accessToken.slice(0, 24) + "..." : "—";
}

function normalizeAssetCode(code) {
  return (code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

async function apiPost(path, body, adminToken) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { "X-Admin-Token": adminToken } : {}),
      ...(state.auth?.accessToken ? { "Authorization": `Bearer ${state.auth.accessToken}` } : {}),
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

/** Pi SDK init */
$("btnInit").addEventListener("click", () => {
  const Pi = window.Pi;
  if (!Pi) return log("❌ Pi SDK مش محمّل.");
  
  Pi.init({ version: "2.0", sandbox: false });
  log("✅ Pi.init done (version 2.0, sandbox=false)");
  setStatus();
});

/** Authenticate */
$("btnAuth").addEventListener("click", async () => {
  const Pi = window.Pi;
  if (!Pi) return log("❌ Pi SDK مش محمّل.");
  
  const scopes = ["username", "payments"];
  
  function onIncompletePaymentFound(payment) {
    log("⚠️ Incomplete payment found:", payment);
    // تقدر هنا تستدعي سيرفر وتكمل/تلغي حسب منطقك
  }
  
  try {
    const auth = await Pi.authenticate(scopes, onIncompletePaymentFound);
    state.auth = auth;
    log("✅ Auth success:", { user: auth.user });
    setStatus();
  } catch (e) {
    log("❌ Auth error:", e.message || e);
  }
});

/** Bootstrap Token: trustline + issue initial supply */
$("btnBootstrap").addEventListener("click", async () => {
  const displayName = $("displayName").value.trim() || "Donate Way";
  const assetCode = normalizeAssetCode($("assetCode").value);
  $("assetCode").value = assetCode;
  
  const initialSupply = $("initialSupply").value.trim();
  const adminToken = $("adminToken").value.trim();
  
  if (!assetCode) return log("❌ Asset Code فاضي.");
  if (!/^\d+(\.\d+)?$/.test(initialSupply)) return log("❌ Initial supply لازم رقم.");
  
  try {
    log("⏳ Bootstrapping token...", { displayName, assetCode, initialSupply });
    const data = await apiPost("/.netlify/functions/token_bootstrap", {
      displayName,
      assetCode,
      initialSupply,
    }, adminToken);
    
    log("✅ Bootstrap done:", data);
  } catch (e) {
    log("❌ Bootstrap error:", e.message || e);
  }
});

/** Create Sell Offer on DEX (Token -> Pi) */
$("btnSellOffer").addEventListener("click", async () => {
  const assetCode = normalizeAssetCode($("assetCode").value);
  $("assetCode").value = assetCode;
  
  // تم تعديل الـ IDs هنا عشان تطابق الـ HTML
  const amount = $("dexAmount").value.trim();
  const price = $("dexPrice").value.trim();
  const adminToken = $("adminToken").value.trim();
  
  if (!assetCode) return log("❌ Asset Code فاضي.");
  if (!/^\d+(\.\d+)?$/.test(amount)) return log("❌ Amount لازم رقم.");
  if (!/^\d+(\.\d+)?$/.test(price)) return log("❌ Price لازم رقم.");
  
  try {
    log("⏳ Creating DEX sell offer...", { assetCode, amount, price });
    const data = await apiPost("/.netlify/functions/dex_sell_offer", {
      assetCode,
      amount,
      price,
    }, adminToken);
    
    log("✅ Sell offer created:", data);
  } catch (e) {
    log("❌ Sell offer error:", e.message || e);
  }
});

/** Pi Payment: Donation */
$("btnDonate").addEventListener("click", async () => {
  const Pi = window.Pi;
  if (!Pi) return log("❌ Pi SDK مش محمّل.");
  if (!state.auth) return log("❌ اعمل تسجيل دخول الأول.");
  
  const amount = Number($("donAmount").value || 0);
  const memo = $("donMemo").value.trim() || "Donate Way — Donation";
  
  try {
    log("⏳ Creating payment...", { amount, memo });
    
    Pi.createPayment({
      amount,
      memo,
      metadata: { kind: "donation", app: "DonateWay" }
    }, {
      // تم إضافة try...catch لتفادي وقوف الكود لو الباك إند رجع error
      onReadyForServerApproval: async (paymentId) => {
        try {
          log("➡️ onReadyForServerApproval:", paymentId);
          await apiPost("/.netlify/functions/pi_approve", { paymentId });
          log("✅ Approved:", paymentId);
        } catch (err) {
          log("❌ Server Approval Error:", err.message || err);
        }
      },
      onReadyForServerCompletion: async (paymentId, txid) => {
        try {
          log("➡️ onReadyForServerCompletion:", { paymentId, txid });
          await apiPost("/.netlify/functions/pi_complete", { paymentId, txid });
          log("✅ Completed:", { paymentId, txid });
        } catch (err) {
          log("❌ Server Completion Error:", err.message || err);
        }
      },
      onCancel: (paymentId) => log("⚠️ Payment cancelled:", paymentId),
      onError: (err, payment) => log("❌ Payment error:", err?.message || err, payment || "")
    });
    
  } catch (e) {
    log("❌ createPayment error:", e.message || e);
  }
});

setStatus();
