// src/routes/conversations.routes.js
import express from "express";
const router = express.Router();

// Example mock data (replace with your database model later)
let mockConversations = [
  {
    phone: "+2347065602624",
    lastMessage: "Welcome to Globstand Herbal AI!",
    conversationHistory: [
      {
        from: "user",
        type: "text",
        text: "Hello, I need help with herbal products",
        timestamp: new Date(),
      },
      {
        from: "ai",
        type: "text",
        text: "Welcome! Please tell me what condition you want to treat.",
        timestamp: new Date(),
      },
    ],
  },
];

// ✅ GET all conversations
router.get("/", async (req, res) => {
  try {
    res.json({ conversations: mockConversations });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET conversation by phone
router.get("/:phone", async (req, res) => {
  const { phone } = req.params;
  const conversation = mockConversations.find((c) => c.phone === phone);
  if (!conversation)
    return res.status(404).json({ error: "Conversation not found" });
  res.json({ conversationHistory: conversation.conversationHistory });
});

export default router;
