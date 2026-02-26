// مسار الملف: netlify/functions/bot_trade.js

const StellarSdk = require("stellar-sdk");

const HORIZON = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  
  try {
    const { assetCode, action, amount, price, adminToken } = JSON.parse(event.body || "{}");
    
    // التحقق من باسورد الأدمن لحماية البوت
    if (adminToken !== process.env.ADMIN_TOKEN) {
      return { statusCode: 401, body: JSON.stringify({ error: "غير مصرح لك (باسورد خاطئ)." }) };
    }

    const DISTRIBUTOR_SECRET = process.env.DISTRIBUTOR_SECRET; 
    const ISSUER_PUBLIC = process.env.ISSUER_PUBLIC;
    
    if (!DISTRIBUTOR_SECRET || !ISSUER_PUBLIC) {
      return { statusCode: 500, body: JSON.stringify({ error: "المفاتيح غير متوفرة في السيرفر." }) };
    }
    
    const server = new StellarSdk.Horizon.Server(HORIZON);
    const distKP = StellarSdk.Keypair.fromSecret(DISTRIBUTOR_SECRET);
    
    const token = new StellarSdk.Asset(assetCode, ISSUER_PUBLIC);
    const pi = StellarSdk.Asset.native(); 

    let selling, buying, sellAmount, sellPrice;

    // منطق البوت: تحديد ماذا نبيع وماذا نشتري
    if (action === "buy_token") {
        // إذا كان البوت يريد "شراء التوكين"، فهو في الحقيقة "يبيع Pi"
        selling = pi;
        buying = token;
        // كمية الـ Pi التي سندفعها = كمية التوكين المطلوبة × السعر
        sellAmount = String((parseFloat(amount) * parseFloat(price)).toFixed(7));
        // سعر الـ Pi مقابل التوكين (مقلوب السعر)
        sellPrice = String((1 / parseFloat(price)).toFixed(7));
    } else {
        // إذا كان البوت يريد "بيع التوكين"، فهو "يبيع التوكين للحصول على Pi"
        selling = token;
        buying = pi;
        sellAmount = String(amount);
        sellPrice = String(price);
    }
    
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
        offerId: "0", // 0 تعني إنشاء عرض جديد دائماً
      }))
      .setTimeout(180)
      .build();
    
    tx.sign(distKP);
    const res = await server.submitTransaction(tx);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, hash: res.hash, action: action })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "حدث خطأ في الشبكة" }) };
  }
};
