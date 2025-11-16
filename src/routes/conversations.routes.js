import express from "express";
import { withTenant } from "../middleware/withTenant.js";

const router = express.Router();

/**
 * ⭐ ADDED: in-memory typing + status tracking
 * (You can move to DB later, but this works instantly)
 */
const typingState = new Map();      // phone → { typing: true/false }
const onlineState = new Map();      // phone → timestamp last active
const unreadCount = new Map();      // phone → unread number


/** 
 * ⭐ Small helper: mark user online whenever conversation is fetched
 */
function markOnline(phone) {
  onlineState.set(phone, Date.now());
}

/**
 * ⭐ Detect offline after 30 seconds of inactivity
 */
function isOnline(phone) {
  const ts = onlineState.get(phone);
  if (!ts) return false;
  return Date.now() - ts < 30_000;
}

/**
 * Normalize preview for sidebar
 */
function previewText(msg) {
  if (!msg) return "[no messages]";

  let c = Array.isArray(msg.content) ? msg.content[0] : msg.content;

  if (!c || c === "") {
    if (msg.type === "audio") return "🎤 Voice Message";
    if (msg.type === "video") return "🎞 Video";
    if (msg.type === "image") return "🖼 Image";
    return "[empty]";
  }

  return c.length > 35 ? c.slice(0, 35) + "…" : c;
}


// ======================================================
//  ✅ GET all conversations (sidebar)  + unread + status
// ======================================================
router.get("/", withTenant, async (req, res) => {
  try {
    const { CustomerSession } = req.models;

    const sessions = await CustomerSession.find({})
      .sort({ updatedAt: -1 })
      .lean();

    const conversations = sessions.map((s) => {
      const phone = s.phoneNumber.replace("whatsapp:", "");
      const last = s.conversationHistory?.[s.conversationHistory.length - 1];

      return {
        phone,
        lastMessage: previewText(last),
        lastType: last?.type || "text",
        lastTimestamp: last?.timestamp || s.updatedAt,

        // ⭐ ADDED: unread count
        unread: unreadCount.get(phone) || 0,

        // ⭐ ADDED: online/offline
        online: isOnline(phone),
      };
    });

    res.json({ conversations });

  } catch (error) {
    console.error("❌ Error fetching conversations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



// ======================================================
//  ✅ GET conversation by phone  + mark read + online
// ======================================================
router.get("/:phone", withTenant, async (req, res) => {
  try {
    const { CustomerSession } = req.models;

    const phone = req.params.phone.startsWith("whatsapp:")
      ? req.params.phone.replace("whatsapp:", "")
      : req.params.phone;

    // ⭐ Mark this chat as online
    markOnline(phone);

    const dbPhone = `whatsapp:${phone}`;
    const session = await CustomerSession.findOne({ phoneNumber: dbPhone }).lean();

    if (!session) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const conversationHistory = (session.conversationHistory || []).map((msg) => ({
      sender: msg.sender,
      type: msg.type || "text",
      content: Array.isArray(msg.content) ? msg.content[0] : msg.content || "",
      timestamp: msg.timestamp || session.updatedAt,
    }));

    // ⭐ Mark unread messages as read
    unreadCount.set(phone, 0);

    res.json({
      phone,
      conversationHistory,

      // ⭐ Return online/offline status
      online: isOnline(phone),
    });

  } catch (error) {
    console.error("❌ Error fetching conversation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



// ======================================================
//  ⭐ NEW ENDPOINT: Get typing status
// ======================================================
router.get("/:phone/typing", (req, res) => {
  const phone = req.params.phone.replace("whatsapp:", "");
  const state = typingState.get(phone) || { typing: false };
  res.json(state);
});


// ======================================================
//  ⭐ NEW ENDPOINT: Set typing status
//  Call this when customer or AI is typing
// ======================================================
router.post("/:phone/typing", (req, res) => {
  const phone = req.params.phone.replace("whatsapp:", "");
  const { typing } = req.body;

  typingState.set(phone, { typing: !!typing });

  res.json({ success: true, typing: !!typing });
});


// ======================================================
//  ⭐ NEW ENDPOINT: Get online/offline status
// ======================================================
router.get("/:phone/status", (req, res) => {
  const phone = req.params.phone.replace("whatsapp:", "");
  res.json({ online: isOnline(phone) });
});


// ======================================================
//  ⭐ OPTIONAL: Mark message as unread (called by webhook)
// ======================================================
router.post("/:phone/unread", (req, res) => {
  const phone = req.params.phone.replace("whatsapp:", "");
  unreadCount.set(phone, (unreadCount.get(phone) || 0) + 1);
  res.json({ success: true });
});


export default router;
