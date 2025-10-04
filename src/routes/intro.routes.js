import { Router } from "express";
import multer from "multer";
import uploadToCloudinary from "../utils/cloudinaryUpload.js";
import { authRequired } from "../middleware/auth.js";
import { withTenant } from "../middleware/withTenant.js";

const r = Router();
const introUpload = multer({ storage: multer.memoryStorage(),
                            limits: { fileSize: 15 * 1024 * 1024 }, }).any();
     
r.get("/", authRequired, withTenant, async (req, res) => {
  const intro = await req.models.Intro.findOne();
  res.json(intro || { sequence: [] }); 
});

r.post("/", authRequired, withTenant, introUpload, async (req, res) => {
  if (!req.body.sequence) return res.status(400).json({ error: "Missing sequence field" });

  let rawSeq;
  try { rawSeq = JSON.parse(req.body.sequence); }
  catch { return res.status(400).json({ error: "Invalid sequence JSON" }); }

  const sequence = await Promise.all(rawSeq.map(async (step, i) => {
    const file = (req.files || []).find(f => f.fieldname === `step${i}_file`);
    let fileUrl = null;
    if (file) fileUrl = await uploadToCloudinary(file.buffer, step.type, "intro_steps");
    return {
      type: step.type,
      content: step.type === "text" ? (req.body[`step${i}_content`] || step.content) : null,
      fileUrl
    };
  }));

  let intro = await req.models.Intro.findOne();
  if (!intro) intro = await req.models.Intro.create({ sequence });
  else { intro.sequence = sequence; await intro.save(); }
  res.json({ success: true, intro });
});

r.delete("/:index", authRequired, withTenant, async (req, res) => {
  const intro = await req.models.Intro.findOne();
  if (!intro) return res.status(404).json({ error: "No intro" });
  const idx = Number(req.params.index);
  intro.sequence.splice(idx, 1);
  await intro.save();
  res.json({ success: true, intro });
});

export default r;
