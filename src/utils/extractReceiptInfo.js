// utils/extractReceiptInfo.js
export default function extractReceiptInfo(text) {
  const result = {
    paidAmount: null,
    payerAccount: null,
    referenceNumber: null,
    transactionDate: null,
  };

  // Find amount (₦14500 or NGN 14500)
  const amountMatch = text.match(/₦?\s?([0-9,]+)/i);
  if (amountMatch) {
    result.paidAmount = parseInt(amountMatch[1].replace(/,/g, ""), 10);
  }

  // Find account number (10+ digits)
  const accountMatch = text.match(/\b\d{10,}\b/);
  if (accountMatch) {
    result.payerAccount = accountMatch[0];
  }

  // Find reference number (Ref:12345 or Reference 12345)
  const refMatch = text.match(/(?:Ref|Reference)\s*[:\-]?\s*(\w+)/i);
  if (refMatch) {
    result.referenceNumber = refMatch[1];
  }

  // Find date (01/02/2025 or 2025-02-01)
  const dateMatch = text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
  if (dateMatch) {
    result.transactionDate = new Date(dateMatch[0]);
  }

  return result;
}
