import express from "express";
const r = express.Router();

r.post("/twilio-status", express.urlencoded({ extended: false }), (req, res) => {
  try {
    const { MessageSid, MessageStatus, To, From, ErrorCode, ErrorMessage } = req.body;
    console.log("📡 Twilio Status:", { MessageSid, MessageStatus, To, From, ErrorCode, ErrorMessage });
    res.sendStatus(200);
  } catch (e) {
    console.error("Status callback error:", e);
    res.sendStatus(500);
  }
});

export default r;
