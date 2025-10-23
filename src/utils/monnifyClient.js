// src/utils/monnifyClient.js
import axios from "axios";
import crypto from "crypto";

// ✅ Paystack (Titan) base URL
const PAYSTACK_BASE = process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";

/**
 * 🔐 Authenticate (Paystack uses static secret key instead of token endpoint)
 */
export async function getAuthToken() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error("Missing PAYSTACK_SECRET_KEY in environment");

  // For compatibility, we return the same structure Monnify used to return
  return secretKey; // acts as Bearer token
}

/**
 * 🏦 Create Reserved Bank Account (Titan Virtual Account)
 * This replaces Monnify’s reserved account endpoint.
 */
export async function createReservedAccount(user, plan) {
  const token = await getAuthToken();

  const body = {
    customer: {
      email: user.email,
      first_name: user.username || user.email.split("@")[0],
      last_name: "Customer",
    },
    preferred_bank: "titan-paystack", // 👈 Paystack Titan account
    country: "NG",
  };

  const { data } = await axios.post(
    `${PAYSTACK_BASE}/dedicated_account/assign`,
    body,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!data?.data) throw new Error("Failed to create Paystack reserved account");

  // Return in Monnify-compatible structure
  return {
    accounts: [
      {
        bankName: data.data.bank.name,
        accountNumber: data.data.account_number,
        accountName: data.data.account_name,
      },
    ],
  };
}

/**
 * 💳 Initialize Card Payment (Paystack Checkout)
 * Equivalent of Monnify “init-transaction”
 */
export async function initializeCardPayment(user, plan) {
  const token = await getAuthToken();

  const payload = {
    email: user.email,
    amount: Math.round(plan.price * 100), // Paystack expects amount in kobo
    currency: "NGN",
    reference: `${plan.id}-${Date.now()}`,
    callback_url: `${process.env.FRONTEND_URL}/business-setup`,
    metadata: {
      planId: plan.id,
      planName: plan.name,
      userEmail: user.email,
    },
  };

  const { data } = await axios.post(
    `${PAYSTACK_BASE}/transaction/initialize`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!data?.data?.authorization_url)
    throw new Error("Failed to initialize Paystack transaction");

  // Keep same shape as Monnify response
  return {
    checkoutUrl: data.data.authorization_url,
    paymentReference: data.data.reference,
  };
}

/**
 * 🧮 Generate HMAC SHA512 hash (for webhook verification)
 * Paystack uses SHA512 signature with `x-paystack-signature` header.
 */
export function generateMonnifyHash(requestBody) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("Missing PAYSTACK_SECRET_KEY in environment");

  const hash = crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(requestBody))
    .digest("hex");

  return hash;
}
