// مسار الملف: netlify/functions/bot_trade.js

const StellarSdk = require("stellar-sdk");

const HORIZON = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };
  
  try {
    const { assetCode, action, amount, adminToken } = JSON.parse(event.body || "{}");
    
    // 1. التحقق من الحماية
    if (adminToken !== process.env.ADMIN_TOKEN) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "باسورد الأدمن خاطئ." }) };
    }

    const DISTRIBUTOR_SECRET = process.env.DISTRIBUTOR_SECRET; 
    const ISSUER_SECRET = process.env.ISSUER_SECRET;
    
    if (!DISTRIBUTOR_SECRET || !ISSUER_SECRET) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "مفاتيح المحافظ غير متوفرة." }) };
    }
    
    const server = new StellarSdk.Horizon.Server(HORIZON);
    const distKP = StellarSdk.Keypair.fromSecret(DISTRIBUTOR_SECRET);
    const issuerKP = StellarSdk.Keypair.fromSecret(ISSUER_SECRET);
    
    const token = new StellarSdk.Asset(assetCode, issuerKP.publicKey());
    const pi = StellarSdk.Asset.native(); 

    // 2. 🧠 الذكاء التحليلي: جلب دفتر الطلبات (Orderbook) من السوق الحقيقي
    const book = await server.orderbook(token, pi).call();
    
    // تحديد أفضل الأسعار الحالية (لو السوق فاضي، بنحط أسعار افتراضية)
    const highestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0.05; // أعلى سعر في السوق عايز يشتري
    const lowestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 0.06;  // أقل سعر في السوق بيعرض للبيع

    let selling, buying, sellAmount, sellPrice, targetPrice;

    // 3. تحديد السعر التنافسي تلقائياً
    if (action === "buy_token") {
        // البوت يريد الشراء: يزايد على أعلى مشتري بـ 0.0001 ليتصدر القائمة
        targetPrice = highestBid + 0.0001;
        // حماية: لا تشتري بسعر أعلى من أو يساوي أقل بائع
        if (targetPrice >= lowestAsk) targetPrice = lowestAsk - 0.0001;
        
        selling = pi;
        buying = token;
        sellAmount = String((parseFloat(amount) * targetPrice).toFixed(7));
        sellPrice = String((1 / targetPrice).toFixed(7)); // مقلوب السعر لشبكة Stellar
        
    } else {
        // البوت يريد البيع: يقلل عن أقل بائع بـ 0.0001 ليتصدر القائمة ويبيع أولاً
        targetPrice = lowestAsk - 0.0001;
        // حماية: لا تبيع بخسارة (يجب أن يكون أعلى من أعلى مشتري)
        if (targetPrice <= highestBid) targetPrice = highestBid + 0.0001;

        selling = token;
        buying = pi;
        sellAmount = String(amount);
        sellPrice = String(targetPrice.toFixed(7));
    }
    
    console.log(`🤖 تحليل السوق -> أعلى شراء: ${highestBid} | أقل بيع: ${lowestAsk}`);
    console.log(`✅ قرار البوت -> تنفيذ ${action} بسعر: ${targetPrice.toFixed(5)}`);
    
    // 4. بناء وإرسال المعاملة للسوق
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
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true, 
        hash: res.hash, 
        action: action, 
        executedPrice: targetPrice.toFixed(5) 
      })
    };
  } catch (e) {
    console.error("❌ Bot Error:", e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "فشل تنفيذ العملية في السوق." }) };
  }
};
