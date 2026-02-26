// مسار الملف: netlify/functions/withdraw_token.js

const StellarSdk = require("stellar-sdk");

const HORIZON = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

exports.handler = async (event) => {
  // التأكد من أن الطلب من نوع POST
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  
  try {
    // استلام عنوان محفظة المستخدم والكمية المراد سحبها من الفرونت إند
    const { destinationWallet, amount } = JSON.parse(event.body || "{}");
    
    if (!destinationWallet || !amount) {
      return { statusCode: 400, body: JSON.stringify({ error: "يجب إرسال عنوان المحفظة والكمية." }) };
    }

    // جلب المفاتيح من إعدادات Netlify
    const DISTRIBUTOR_SECRET = process.env.DISTRIBUTOR_SECRET; // المفتاح السري للموزع (الذي يمتلك العملات)
    const ISSUER_PUBLIC = process.env.ISSUER_PUBLIC;       // المفتاح العام للمُصدر (G...)
    const ASSET_CODE = "DONATE";                           // رمز العملة بالضبط كما هو مسجل
    
    if (!DISTRIBUTOR_SECRET || !ISSUER_PUBLIC) {
      return { statusCode: 500, body: JSON.stringify({ error: "المفاتيح غير متوفرة في إعدادات البيئة (Env Vars)." }) };
    }
    
    const server = new StellarSdk.Horizon.Server(HORIZON);
    
    // استخراج بيانات حساب الموزع (المرسل)
    const distKP = StellarSdk.Keypair.fromSecret(DISTRIBUTOR_SECRET);
    
    // تعريف العملة المراد إرسالها
    const token = new StellarSdk.Asset(ASSET_CODE, ISSUER_PUBLIC);
    
    // جلب بيانات حساب الموزع من البلوكتشين لمعرفة رقم العملية (Sequence)
    const distAccount = await server.loadAccount(distKP.publicKey());
    
    // بناء المعاملة (إرسال Payment من الموزع إلى المستخدم)
    const tx = new StellarSdk.TransactionBuilder(distAccount, {
        fee: await server.fetchBaseFee(),
        networkPassphrase: NETWORK_PASSPHRASE,
      })
      .addOperation(StellarSdk.Operation.payment({
        destination: destinationWallet, // محفظة المستخدم المستلم
        asset: token,                   // عملة DONATE
        amount: String(amount),         // الكمية (يجب أن تكون نصية String)
      }))
      .setTimeout(180) // إيقاف المحاولة بعد 3 دقائق لتفادي التعليق
      .build();
    
    // توقيع المعاملة بالمفتاح السري للموزع
    tx.sign(distKP);
    
    // إرسال المعاملة إلى شبكة Pi
    const res = await server.submitTransaction(tx);
    
    // إرجاع رد ناجح للواجهة لتأكيد عملية السحب
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        hash: res.hash,
        message: "تم إرسال العملات بنجاح للمستخدم."
      })
    };
  } catch (e) {
    console.error("Withdraw Error:", e);
    
    let errorMessage = e.message || String(e);
    
    // التقاط خطأ "عدم وجود خط ثقة" وتوضيحه للمستخدم
    if (e.response && e.response.data && e.response.data.extras) {
        const resultCodes = e.response.data.extras.result_codes;
        if (resultCodes && resultCodes.operations && resultCodes.operations.includes("op_no_trust")) {
            errorMessage = "op_no_trust"; // تم تحديد هذه الكلمة لتلتقطها الواجهة (الفرونت إند)
        } else {
            errorMessage = JSON.stringify(e.response.data.extras.result_codes);
        }
    }

    return { statusCode: 500, body: JSON.stringify({ error: errorMessage }) };
  }
};
