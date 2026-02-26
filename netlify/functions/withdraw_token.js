// مسار الملف: netlify/functions/withdraw_token.js

const StellarSdk = require("stellar-sdk");

const HORIZON = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  
  try {
    const { destinationWallet, amount } = JSON.parse(event.body || "{}");
    
    if (!destinationWallet || !amount) {
      return { statusCode: 400, body: JSON.stringify({ error: "يجب إرسال عنوان المحفظة والكمية." }) };
    }

    // نحتاج المفتاح السري لمحفظة الموزع (التي تمتلك العملات)
    const DISTRIBUTOR_SECRET = process.env.DISTRIBUTOR_SECRET;
    const ISSUER_PUBLIC = process.env.ISSUER_PUBLIC; // المفتاح العام للمُصدر
    const ASSET_CODE = "DONATE"; // اسم عملتك
    
    if (!DISTRIBUTOR_SECRET || !ISSUER_PUBLIC) {
      return { statusCode: 500, body: JSON.stringify({ error: "بيانات المحافظ غير موجودة في متغيرات البيئة (Env Vars)." }) };
    }
    
    const server = new StellarSdk.Horizon.Server(HORIZON);
    
    // استخراج حساب الموزع (المرسل)
    const distKP = StellarSdk.Keypair.fromSecret(DISTRIBUTOR_SECRET);
    
    // تحديد العملة المراد إرسالها
    const token = new StellarSdk.Asset(ASSET_CODE, ISSUER_PUBLIC);
    
    // جلب بيانات حساب الموزع من الشبكة
    const distAccount = await server.loadAccount(distKP.publicKey());
    
    // بناء المعاملة (إرسال Payment من Distributor إلى المستخدم)
    const tx = new StellarSdk.TransactionBuilder(distAccount, {
        fee: await server.fetchBaseFee(),
        networkPassphrase: NETWORK_PASSPHRASE,
      })
      .addOperation(StellarSdk.Operation.payment({
        destination: destinationWallet, // محفظة المستخدم
        asset: token,                   // عملة DONATE
        amount: String(amount),         // الكمية كـ String
      }))
      .setTimeout(180)
      .build();
    
    // توقيع المعاملة
    tx.sign(distKP);
    
    // إرسال المعاملة
    const res = await server.submitTransaction(tx);
    
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
    
    // التقاط خطأ الـ Trustline وتوضيحه للمستخدم
    if (e.response && e.response.data && e.response.data.extras) {
        const resultCodes = e.response.data.extras.result_codes;
        if (resultCodes && resultCodes.operations && resultCodes.operations.includes("op_no_trust")) {
            errorMessage = "op_no_trust: المحفظة المستلمة لا تثق بهذه العملة بعد. يجب إضافة خط ثقة (Trustline).";
        } else {
            errorMessage = JSON.stringify(e.response.data.extras.result_codes);
        }
    }

    return { statusCode: 500, body: JSON.stringify({ error: errorMessage }) };
  }
};
