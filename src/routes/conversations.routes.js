import express from "express";
import { withTenant } from "../middleware/withTenant.js";

const router = express.Router();

/**
 * ✅ Normalize preview text for sidebar
 */
function previewText(msg) {
  if (!msg) return "[no messages]";

  // If content is stored as array → take first element
  let c = Array.isArray(msg.content) ? msg.content[0] : msg.content;

  // If empty or missing → show type icon
  if (!c || c === "") {
    if (msg.type === "audio") return "🎤 Voice Message";
    if (msg.type === "video") return "🎞 Video";
    if (msg.type === "image") return "🖼 Image";
    return "[empty]";
  }

  // Text content preview
  return c.length > 35 ? c.slice(0, 35) + "…" : c;
}


// ✅ GET all conversations (sidebar previews)
router.get("/", withTenant, async (req, res) => {
  try {
    const { CustomerSession } = req.models;

    const sessions = await CustomerSession.find({})
      .sort({ updatedAt: -1 })
      .lean();

    const conversations = sessions.map((s) => {
      const last = s.conversationHistory?.[s.conversationHistory.length - 1];

      return {
        phone: s.phoneNumber.replace("whatsapp:", ""),
        lastMessage: previewText(last),
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


// ✅ GET full conversation by phone — return clean structure for frontend
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

    const conversationHistory = (session.conversationHistory || []).map((msg) => {
      return {
        sender: msg.sender,                // "ai" or "customer"
        type: msg.type || "text",          // "text", "audio", "video", "image"
        content: Array.isArray(msg.content)
          ? msg.content[0]                // fix stored array URLs
          : msg.content || "",
        timestamp: msg.timestamp || session.updatedAt,
      };
    });

    res.json({
      phone: session.phoneNumber.replace("whatsapp:", ""),
      conversationHistory,
    });

  } catch (error) {
    console.error("❌ Error fetching conversation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
