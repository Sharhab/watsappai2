import { Router } from "express";
import multer from "multer";
import { withTenant } from "../middleware/withTenant.js";
import { authRequired } from "../middleware/auth.js";
import uploadToCloudinary from "../utils/cloudinaryUpload.js"; // ⚡️ for audio

const r = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ➕ Create QA
r.post("/", authRequired,  withTenant, upload.single("answerAudio"), async (req, res) => {
  try {
    const { QA } = req.models;
    const { question, answerText } = req.body;

    let audioUrl = null;
    if (req.file) {
      audioUrl = await uploadToCloudinary(req.file.buffer, "audio", "qa_answers");
    }

    const qa = await QA.create({
      question,
      answerText,
      answerAudio: audioUrl,
    });

    res.json({ success: true, qa });
  } catch (err) {
    console.error("❌ QA create failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// 📖 Get all QAs (tenant scoped)
r.get("/", authRequired, withTenant, async (req, res) => {
  try {
    const { QA } = req.models || {};
    if (!QA) {
      console.error("❌ No QA model bound for tenant:", req.headers["x-tenant-id"]);
      return res.status(500).json({ error: "Tenant model not found" });
    }
    const qas = await QA.find().lean();
    res.json({ qas });
  } catch (err) {
    console.error("❌ QA GET failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✏️ Update QA
r.put("/:id", withTenant, authRequired, upload.single("answerAudio"), async (req, res) => {
  try {
    const { QA } = req.models;
    const qa = await QA.findById(req.params.id);
    if (!qa) return res.status(404).json({ error: "QA not found" });

    if (req.body.question) qa.question = req.body.question;
    if (req.body.answerText) qa.answerText = req.body.answerText;

    if (req.file) {
      qa.answerAudio = await uploadToCloudinary(req.file.buffer, "audio", "qa_answers");
    }

    await qa.save();
    res.json({ success: true, qa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🗑 Delete QA
r.delete("/:id", withTenant, authRequired, async (req, res) => {
  try {
    const { QA } = req.models;
    const qa = await QA.findByIdAndDelete(req.params.id);
    if (!qa) return res.status(404).json({ error: "QA not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default r;
