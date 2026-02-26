// مسار الملف: netlify/functions/bot_trade.js

const StellarSdk = require("stellar-sdk");

const HORIZON = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

// إعدادات الـ CORS عشان المتصفح مايرفضش الطلبات
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

exports.handler = async (event) => {
  // 1. السماح لطلبات المتصفح الاستكشافية (OPTIONS) بالمرور
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // التأكد من أن الطلب الفعلي هو POST
  if (event.httpMethod !== "POST") {
    console.log("❌ تم رفض الطلب: ليس POST");
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }
  
  try {
    const { assetCode, action, amount, price, adminToken } = JSON.parse(event.body || "{}");
    
    // 2. التحقق من باسورد الأدمن (تأكد إنك ضفت ADMIN_TOKEN في Netlify)
    if (adminToken !== process.env.ADMIN_TOKEN) {
      console.log("❌ تم رفض الطلب: باسورد الأدمن غير متطابق أو غير موجود في Netlify.");
      return { statusCode: 401, headers, body: JSON.stringify({ error: "غير مصرح لك (باسورد خاطئ)." }) };
    }

    // 3. جلب المفاتيح اللي موجودة عندك في الصورة
    const DISTRIBUTOR_SECRET = process.env.DISTRIBUTOR_SECRET; 
    const ISSUER_SECRET = process.env.ISSUER_SECRET;
    
    if (!DISTRIBUTOR_SECRET || !ISSUER_SECRET) {
      console.log("❌ تم رفض الطلب: المفاتيح غير متوفرة في السيرفر.");
      return { statusCode: 500, headers, body: JSON.stringify({ error: "المفاتيح غير متوفرة في السيرفر." }) };
    }
    
    const server = new StellarSdk.Horizon.Server(HORIZON);
    const distKP = StellarSdk.Keypair.fromSecret(DISTRIBUTOR_SECRET);
    
    // 💡 استنتاج المفتاح العام للمُصدر تلقائياً من المفتاح السري اللي عندك
    const issuerKP = StellarSdk.Keypair.fromSecret(ISSUER_SECRET);
    const issuerPublicKey = issuerKP.publicKey();

    // تعريف العملة
    const token = new StellarSdk.Asset(assetCode, issuerPublicKey);
    const pi = StellarSdk.Asset.native(); 

    let selling, buying, sellAmount, sellPrice;

    if (action === "buy_token") {
        selling = pi;
        buying = token;
        sellAmount = String((parseFloat(amount) * parseFloat(price)).toFixed(7));
        sellPrice = String((1 / parseFloat(price)).toFixed(7));
    } else {
        selling = token;
        buying = pi;
        sellAmount = String(amount);
        sellPrice = String(price);
    }
    
    console.log(`⏳ جاري تنفيذ أمر: ${action} | الكمية: ${sellAmount} | السعر: ${sellPrice}`);
    
    const distAccount = await server.loadAccount(distKP.publicKey());
    
    const tx = new StellarSdk.TransactionBuilder(distAccount, {
        fee: await server.fetchBaseFee(),
        networkPassphrase: NETWORK_PASSPHRASE,
      })
      .addOperation(StellarSdk.Operation.manageSellOffer({
        selling: selling,
        buying: buying,
        amount: sellAmount,
        price: sellPrice,
        offerId: "0", 
      }))
      .setTimeout(180)
      .build();
    
    tx.sign(distKP);
    const res = await server.submitTransaction(tx);
    
    console.log(`✅ تمت العملية بنجاح! Hash: ${res.hash}`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, hash: res.hash, action: action })
    };
  } catch (e) {
    console.error("❌ حدث خطأ أثناء تنفيذ الصفقة:", e.response?.data?.extras?.result_codes || e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || "حدث خطأ في الشبكة" }) };
  }
};
