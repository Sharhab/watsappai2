import express from "express";
import { withTenant } from "../middleware/withTenant.js";

const router = express.Router();

/**
 * ⭐ ADDED: In-memory states
 * (Fast + works instantly — can move to DB later)
 */
const typingState = new Map();      // phone → { typing: bool }
const onlineState = new Map();      // phone → timestamp
const unreadCount = new Map();      // phone → number


// ------------------------------------------------------
// ⭐ Helper: Mark someone online
// ------------------------------------------------------
function markOnline(phone) {
  onlineState.set(phone, Date.now());
}

// ------------------------------------------------------
// ⭐ A user is online if last activity < 30 seconds
// ------------------------------------------------------
function isOnline(phone) {
  const ts = onlineState.get(phone);
  if (!ts) return false;
  return Date.now() - ts < 30_000;
}

// ------------------------------------------------------
// ⭐ Helper to generate preview text
// ------------------------------------------------------
function previewText(msg) {
  if (!msg) return "[No messages]";

  let c = Array.isArray(msg.content) ? msg.content[0] : msg.content;

  if (!c) {
    if (msg.type === "audio") return "🎤 Voice Message";
    if (msg.type === "video") return "🎞 Video";
    if (msg.type === "image") return "🖼 Image";
    return "[empty]";
  }

  return c.length > 40 ? c.slice(0, 40) + "…" : c;
}



// ======================================================
//  ✅ GET ALL CONVERSATIONS (Sidebar)
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

        // ⭐ Use memory unread state
        unread: unreadCount.get(phone) || 0,

        // ⭐ Real-time online status
        online: isOnline(phone),
      };
    });

    res.json({ conversations });

  } catch (err) {
    console.error("❌ Error fetching conversations:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



// ======================================================
//  ✅ GET SINGLE CONVERSATION
//  ⭐ Marks chat as READ instantly
// ======================================================
router.get("/:phone", withTenant, async (req, res) => {
  try {
    const { CustomerSession } = req.models;

    const phone = req.params.phone.replace("whatsapp:", "");
    const dbPhone = `whatsapp:${phone}`;

    // ⭐ Mark online
    markOnline(phone);

    const session = await CustomerSession.findOne({ phoneNumber: dbPhone });

    if (!session) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // ⭐ Reset unread count in memory
    unreadCount.set(phone, 0);

    // ⭐ Reset unread count in DB
    session.unreadCount = 0;
    await session.save();

    // ⭐ Push event to frontend
    pushEvent("unread_update", {
      phone,
      unread: 0
    });

    const conversationHistory = (session.conversationHistory || []).map((msg) => ({
      sender: msg.sender,
      type: msg.type || "text",
      content: Array.isArray(msg.content) ? msg.content[0] : msg.content || "",
      timestamp: msg.timestamp || session.updatedAt,
    }));

    res.json({
      phone,
      conversationHistory,
      online: isOnline(phone),
    });

  } catch (err) {
    console.error("❌ Error fetching conversation:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



// ======================================================
//  ✅ TYPING — GET
// ======================================================
router.get("/:phone/typing", (req, res) => {
  const phone = req.params.phone.replace("whatsapp:", "");
  const state = typingState.get(phone) || { typing: false };
  res.json(state);
});


// ======================================================
//  ✅ TYPING — SET
// ======================================================
router.post("/:phone/typing", (req, res) => {
  const phone = req.params.phone.replace("whatsapp:", "");
  const { typing } = req.body;
  typingState.set(phone, { typing: !!typing });

  res.json({ success: true, typing: !!typing });
});



// ======================================================
//  ✅ REAL-TIME STATUS (ONLINE/OFFLINE)
// ======================================================
router.get("/:phone/status", (req, res) => {
  const phone = req.params.phone.replace("whatsapp:", "");
  res.json({ online: isOnline(phone) });
});



// ======================================================
//  ⭐ Mark message as UNREAD (Used by webhook)
// ======================================================
router.post("/:phone/mark-read", (req, res) => {
  const phone = req.params.phone.replace("whatsapp:", "");
  unreadCount.set(phone, 0);

  pushEvent("unread_update", { phone, unread: 0 });

  res.json({ success: true });
});




export default router;
