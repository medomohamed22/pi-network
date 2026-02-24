const StellarSdk = require("stellar-sdk");

const HORIZON = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

function requireAdmin(event) {
  const need = process.env.ADMIN_TOKEN;
  if (!need) return;
  const got = event.headers["x-admin-token"] || event.headers["X-Admin-Token"];
  if (got !== need) throw new Error("Unauthorized (bad admin token)");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  
  try {
    requireAdmin(event);
    
    const { assetCode, tokenAmount, piAmount, minPrice, maxPrice } = JSON.parse(event.body || "{}");
    if (!assetCode || !tokenAmount || !piAmount) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing assetCode/tokenAmount/piAmount" }) };
    }
    
    const ISSUER_SECRET = process.env.ISSUER_SECRET;
    const DISTRIBUTOR_SECRET = process.env.DISTRIBUTOR_SECRET;
    if (!ISSUER_SECRET || !DISTRIBUTOR_SECRET) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing ISSUER_SECRET/DISTRIBUTOR_SECRET env" }) };
    }
    
    const server = new StellarSdk.Horizon.Server(HORIZON);
    
    const issuerKP = StellarSdk.Keypair.fromSecret(ISSUER_SECRET);
    const distKP = StellarSdk.Keypair.fromSecret(DISTRIBUTOR_SECRET);
    
    const token = new StellarSdk.Asset(assetCode, issuerKP.publicKey());
    const pi = StellarSdk.Asset.native();
    
    if (!StellarSdk.LiquidityPoolAsset || !StellarSdk.Operation.liquidityPoolDeposit) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "AMM not supported by stellar-sdk version on this build",
          hint: "Try updating stellar-sdk to a version that supports LiquidityPoolAsset + liquidityPoolDeposit"
        })
      };
    }
    
    const fee = StellarSdk.LiquidityPoolFeeV18 || 30;
    
    // الحل الأكيد: عملة Pi دايماً هي Asset A لأن نوعها Native
    const assetA = pi;
    const assetB = token;
    
    // بالتالي الكميات لازم تترتب بناءً على العملات
    const maxAmountA = String(piAmount);
    const maxAmountB = String(tokenAmount);

    const poolAsset = new StellarSdk.LiquidityPoolAsset(assetA, assetB, fee);
    const poolId = poolAsset.getLiquidityPoolId();
    const poolShare = new StellarSdk.LiquidityPoolShareAsset(poolId);
    
    const account = await server.loadAccount(distKP.publicKey());
    const baseFee = await server.fetchBaseFee();
    
    const hasPoolShare = account.balances?.some(b => b.asset_type === "liquidity_pool_shares" && b.liquidity_pool_id === poolId);
    
    const txb = new StellarSdk.TransactionBuilder(account, {
      fee: baseFee,
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    
    if (!hasPoolShare) {
      txb.addOperation(StellarSdk.Operation.changeTrust({ asset: poolShare }));
    }
    
    // ضبط حماية الأسعار الافتراضية بنطاق واسع لتجنب رفض المعاملة
    const minP = (minPrice && String(minPrice)) || "0.0000001";
    const maxP = (maxPrice && String(maxPrice)) || "10000000";
    
    txb.addOperation(StellarSdk.Operation.liquidityPoolDeposit({
      liquidityPoolId: poolId,
      maxAmountA: maxAmountA,
      maxAmountB: maxAmountB,
      minPrice: minP,
      maxPrice: maxP,
    }));
    
    const tx = txb.setTimeout(180).build();
    tx.sign(distKP);
    
    const res = await server.submitTransaction(tx);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        poolId,
        hash: res.hash
      })
    };
  } catch (e) {
    console.error("AMM Deposit Error:", e);
    // جلب التفاصيل من السيرفر لو موجودة عشان تساعد في فهم أي مشكلة تانية
    const errorDetails = e.response && e.response.data ? e.response.data : e.message || String(e);
    return { statusCode: 500, body: JSON.stringify({ error: errorDetails }) };
  }
};
