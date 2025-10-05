// src/utils/monnifyClient.js
import axios from "axios";
import { sha512 } from "js-sha512"; // ✅ only one import needed

const MONNIFY_BASE = process.env.MONNIFY_BASE_URL || "https://sandbox.monnify.com/api/v1";

/**
 * 🔐 Authenticate and get Monnify Bearer Token
 */
async function getAuthToken() {
  const apiKey = process.env.MONNIFY_API_KEY;
  const secretKey = process.env.MONNIFY_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error("Missing MONNIFY_API_KEY or MONNIFY_SECRET_KEY in environment");
  }

  const auth = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

  const { data } = await axios.post(`${MONNIFY_BASE}/auth/login`, {}, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!data?.responseBody?.accessToken) {
    throw new Error("Failed to obtain Monnify access token");
  }

  return data.responseBody.accessToken;
}

/**
 * 🏦 Create Reserved Bank Account (for transfers)
 */
export async function createReservedAccount(user, plan) {
  const token = await getAuthToken();

  const body = {
    accountReference: `${user.email}-${Date.now()}`,
    accountName: user.username || user.email,
    currencyCode: "NGN",
    contractCode: process.env.MONNIFY_CONTRACT_CODE,
    customerEmail: user.email,
    customerName: user.username || user.email,
    getAllAvailableBanks: false,
    preferredBanks: ["035", "232", "058"], // Wema, Sterling, GTBank
  };

  const { data } = await axios.post(
    `${MONNIFY_BASE}/bank-transfer/reserved-accounts`,
    body,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!data?.responseBody) {
    throw new Error("Failed to create Monnify reserved account");
  }

  return data.responseBody;
}

/**
 * 💳 Initialize Card Payment (for online card payment)
 */
export async function initializeCardPayment(user, plan) {
  const token = await getAuthToken();

  const body = {
    amount: plan.price,
    customerName: user.username || user.email,
    customerEmail: user.email,
    paymentReference: `${plan.id}-${Date.now()}`,
    paymentDescription: `${plan.name} Subscription`,
    currencyCode: "NGN",
    contractCode: process.env.MONNIFY_CONTRACT_CODE,
    redirectUrl: `${process.env.FRONTEND_URL}/business-setup`,
  };

  const { data } = await axios.post(
    `${MONNIFY_BASE}/merchant/transactions/init-transaction`,
    body,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!data?.responseBody) {
    throw new Error("Failed to initialize Monnify transaction");
  }

  return data.responseBody;
}

/**
 * 🧮 Generate Monnify HMAC SHA512 hash (for webhook validation)
 */
export function generateMonnifyHash(requestBody) {
  const secret = process.env.MONNIFY_SECRET_KEY;
  if (!secret) throw new Error("Missing MONNIFY_SECRET_KEY in environment");

  const hash = sha512.hmac(secret, JSON.stringify(requestBody));
  return hash;
}
