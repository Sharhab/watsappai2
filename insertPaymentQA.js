// insertPaymentQA.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import QA from "./models/QA.js"; // adjust path if needed

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/herbaldb";

async function run() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const paymentQA = {
    question: "ta yaya zan biya kuma mine za a dan rage man?",
    answerText: `Za ka iya biya zuwa asusun: First Bank, A/C: 31050108950, A/C name: Sharhar Habilu Muktar Sidi.
Ga masu neman sauki, zamu rage maka ₦5,000 idan kayi oda yanzu; idan ka ji dadin maganin, yi mana talla.
Bayan biyan kudi a tura TAKARDAR SHAIDA/receipt da sunan garin da za a kawo maka (don mu tabbatar da oda), ko kuma ka kira mu a 07065602624 don tabbatarwa da shirya tura kayan.`
  };

  const existing = await QA.findOne({ question: paymentQA.question });
  if (existing) {
    console.log("Payment QA already exists. Updating it.");
    existing.answerText = paymentQA.answerText;
    await existing.save();
    console.log("Updated.");
  } else {
    await QA.create(paymentQA);
    console.log("Inserted new payment QA.");
  }

  mongoose.connection.close();
}

run().catch(err => {
  console.error(err);
  mongoose.connection.close();
});
