// /src/routes/conversations.routes.js
import express from "express";
import { withTenant } from "../middleware/withTenant.js";

const router = express.Router();

// ✅ GET all conversations (list preview)
router.get("/", withTenant, async (req, res) => {
  try {
    const { CustomerSession } = req.models;

    const sessions = await CustomerSession.find({})
      .sort({ updatedAt: -1 }) // latest first
      .lean();

    const conversations = sessions.map((s) => {
      const last = s.conversationHistory?.[s.conversationHistory.length - 1];

      return {
        phone: s.phoneNumber.replace("whatsapp:", ""),
        lastMessage: last?.content || "",
        lastType: last?.type || "text",
        lastTimestamp: last?.timestamp || s.updatedAt,
      };
    });

    res.json({ conversations });

  } catch (error) {
    console.error("❌ Error fetching conversations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET full conversation by phone
router.get("/:phone", withTenant, async (req, res) => {
  try {
    const { CustomerSession } = req.models;
    const phone = req.params.phone.startsWith("whatsapp:")
      ? req.params.phone
      : `whatsapp:${req.params.phone}`;

    const session = await CustomerSession.findOne({ phoneNumber: phone }).lean();

    if (!session) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({
      phone: session.phoneNumber.replace("whatsapp:", ""),
      conversationHistory: session.conversationHistory || [],
    });

  } catch (error) {
    console.error("❌ Error fetching conversation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
