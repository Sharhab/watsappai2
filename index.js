// index.js
import dotenv from "dotenv";
dotenv.config();
//import cloudinary from './configs/cloudinary.js'
import Tesseract from "tesseract.js";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import multer from "multer";
import express from "express";
import twilio from "twilio";
import stringSimilarity from "string-similarity";
import fs from "fs";
import axios from "axios";
import { exec } from "child_process";
import path from "path";
import mongoose from "mongoose";
import cors from "cors";
import Intro from "./models/Intro.js";
import speech from "@google-cloud/speech"; // Google Speech SDK
import QA from "./models/QA.js";
import CustomerSession from "./models/CustomerSession.js";
import uploadToCloudinary from "./utils/uploadToCloudinary.js";
import extractReceiptInfo from "./utils/extractReceiptInfo.js";
import Order from "./models/Order.js";
import Conversation from "./models/Conversation.js";

//import { encodeForWhatsApp } from "./utils/encodeMedia.js";
import { GoogleAuth } from "google-auth-library";
const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const qasStorage = multer.memoryStorage(); // keep in memory, no disk
const reCieptstorage = multer.memoryStorage(); // keep in memory, no disk
const uploadQas = multer({ storage: qasStorage });

const app = express();
const port = process.env.PORT || 3000;
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//const { loadGoogleCredentials } = require('./loadGoogleCredentials')

// ✅ Enable CORS so React frontend (5173) can call backend (3000)
const allowedOrigins = [
  "http://localhost:5173",          // local dev
  "https://watsappai.onrender.com"  // deployed frontend
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS: " + origin));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// ✅ Serve uploaded audio files
const introUpload = multer({ storage: multer.memoryStorage() }).any();
const upload = multer({ storage:  reCieptstorage});


app.get("/api/orders", async (req, res) => {

  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }
    // Find orders for that phone
    const orders = await Order.find({ phone }).sort({ createdAt: -1 });

    res.json({ orders });
  } catch (err) {
    console.error("❌ Error fetching orders:", err);
    res.status(500).json({ error: "Server error" });
  }

});

// ---------------------- Intro API ----------------------
// Save or update int//ro

// app.post("/api/intro", upload, async (req, res) => {
//   try {
//     const rawSeq = JSON.parse(req.body.sequence); // comes from frontend
//     const sequence = rawSeq.map((step, i) => {
//       const file = req.files.find((f) => f.fieldname === `step${i}_file`);
// 
//       return {
//         type: step.type,
//         content: step.type === "text" ? req.body[`step${i}_content`] || step.content : null,
//         // ✅ Fixed: now returns full URL, not relative path
//        fileUrl: file ? `/uploads/${file.filename}` : null,
//       };
//     });
// 
//     const intro = new Intro({ sequence });
//     await intro.save();
// 
//     res.json(intro);
//   } catch (err) {
//     console.error("❌ Error saving intro:", err);
//     res.status(400).json({ error: err.message });
//   }
// });
// Get intro

app.post("/api/intro", introUpload, async (req, res) => {
  try {
    console.log("📝 Incoming /api/intro request");
    console.log("📦 req.body:", req.body);
    console.log("📂 req.files:", req.files);

    if (!req.body.sequence) {
      return res.status(400).json({ success: false, error: "Missing sequence field" });
    }

    let rawSeq;
    try {
      rawSeq = JSON.parse(req.body.sequence);
    } catch (err) {
      console.error("❌ Invalid sequence JSON:", req.body.sequence);
      return res.status(400).json({ success: false, error: "Invalid sequence JSON" });
    }

    if (!Array.isArray(rawSeq)) {
      return res.status(400).json({ success: false, error: "Sequence must be an array" });
    }

    // Validate each step
    for (let i = 0; i < rawSeq.length; i++) {
      const step = rawSeq[i];
      if (!["text", "audio", "video"].includes(step.type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid step type at index ${i}: ${step.type}`,
        });
      }
      if (step.type === "text" && !step.content) {
        return res.status(400).json({
          success: false,
          error: `Text step at index ${i} must include content`,
        });
      }
    }

    console.log("✅ Sequence validated:", rawSeq);

    // Upload files to Cloudinary
    const sequence = await Promise.all(
      rawSeq.map(async (step, i) => {
        const file = req.files.find((f) => f.fieldname === `step${i}_file`);

        let fileUrl = null;
        if (file) {
          // Decide resource_type based on step.type
          let resourceType = "auto";
          if (step.type === "video") resourceType = "video";
          if (step.type === "audio") resourceType = "video"; // ✅ audio uploads use video type

          console.log(
            `📤 Uploading step${i}_file -> ${file.originalname} (type=${step.type}, resource_type=${resourceType})`
          );

          fileUrl = await uploadToCloudinary(file.buffer || file.path, step.type);
          console.log(`✅ Cloudinary URL for step${i}:`, fileUrl);
        }

        return {
          type: step.type,
          content: step.type === "text" ? req.body[`step${i}_content`] || step.content : null,
          fileUrl,
        };
      })
    );

    const intro = new Intro({ sequence });
    await intro.save();

    res.json({ success: true, intro });
  } catch (err) {
    console.error("❌ Intro upload failed:", err);
    res
      .status(500)
      .json({ success: false, error: err.message, stack: err.stack });
  }
});

app.get("/api/intro", async (req, res) => {
  try {
    const intro = await Intro.findOne();
    res.json(intro);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/qas",  uploadQas.single("answerAudio"), async (req, res) => {
  try {
    let audioUrl = null;

    if (req.file) {
      console.log("📤 Uploading QA audio:", req.file.originalname);
      audioUrl = await uploadToCloudinary(req.file.buffer, "audio");
      console.log("✅ QA audio Cloudinary URL:", audioUrl);
    }

    const newQA = new QA({
      question: req.body.question,
      answerText: req.body.answerText,
      answerAudio: audioUrl,
    });

    await newQA.save();
    res.json(newQA);
  } catch (err) {
    console.error("❌ QA creation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET all QAs
app.get("/api/qas", async (req, res) => {
  try {
    const qas = await QA.find();
    res.json(qas); // ✅ returns JSON
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch QAs" });
  }
});
// Get single QA
app.get('/api/qas/:id', async (req, res) => {

  try {
    const qa = await QA.findById(req.params.id);
    if (!qa) return res.status(404).json({ error: 'QA not found' });
    res.json(qa);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Create QA
// Update QA

app.put("/api/qas/:id", uploadQas.single("answerAudio"), async (req, res) => {
  try {
    const { question, answerText } = req.body;

    const qa = await QA.findById(req.params.id);
    if (!qa) return res.status(404).json({ error: "QA not found" });

    if (question) qa.question = question;
    if (answerText !== undefined) qa.answerText = answerText;

    // if a new audio file is uploaded → replace URL
    if (req.file) {
      console.log(`📤 Re-uploading QA audio -> ${req.file.originalname}`);
      const audioUrl = await uploadToCloudinary(req.file.buffer, "auto");
      qa.answerAudio = audioUrl;
    }

    await qa.save();
    res.json(qa);
  } catch (err) {
    console.error("❌ QA update failed:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Delete QA
app.delete('/api/qas/:id', async (req, res) => {
  try {
    const qa = await QA.findByIdAndDelete(req.params.id);
    if (!qa) return res.status(404).json({ error: 'QA not found' });
    res.json({ message: 'QA deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

// ✅ Get all conversations (summary list)
app.get("/api/conversations", async (req, res) => {
  try {
    const conversations = await Conversation.find()
      .sort({ updatedAt: -1 })
      .select("phone lastMessage updatedAt"); // keep lightweight for list

    res.json(conversations);
  } catch (err) {
    console.error("❌ Error fetching conversations:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get single conversation with full history
app.get("/api/conversations/:phone", async (req, res) => {
  try {
    const { phone } = req.params;

    const conversation = await Conversation.findOne({ phone });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Send full details, including chat history
    res.json(conversation);
  } catch (err) {
    console.error("❌ Error fetching conversation:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get unmatched questions
app.get("/api/failed-matches", async (req, res) => {
  const failed = await Conversation.aggregate([
    { $unwind: "$messages" },
    { $match: { "messages.sender": "customer", "messages.matchedQA": { $exists: false } } },
    { $group: { _id: "$messages.content", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  res.json({ failed });
});


//---orders ------------

app.post("/api/orders/:id/receipt", upload.single("receipt"), async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Upload file to Cloudinary
    const url = await uploadToCloudinary(req.file.buffer, "image");

    // Extract info from receipt
    const ocrData = await extractReceiptInfo(url);

    // Save to DB
    order.receiptUrl = url;
    order.receiptExtract = ocrData;
    order.paymentStatus = "paid"; // mark paid once receipt validated
    await order.save();

    res.json({ success: true, order });
  } catch (err) {
    console.error("Receipt upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Env checks ------------------------------------------------------------
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
if (!accountSid || !authToken) {
  console.error('❌ Twilio credentials missing! Check .env TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN');
  process.exit(1);
}
const client = twilio(accountSid, authToken);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
// ---- MongoDB connection ----------------------------------------------------
mongoose
  .connect(process.env.MONGO_URI, {})
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  });
// Prefer GOOGLE_APPLICATION_CREDENTIALS env; fallback to explicit key file if you kept one.


export function loadGoogleCredentials() {
  return {
    type: process.env["gcp-type"],
    project_id: process.env["gcp-project_id"],
    private_key_id: process.env["gcp-private_key_id"],
    private_key: process.env["gcp-private_key"]?.replace(/\\n/g, '\n'),
    client_email: process.env["gcp-client_email"],
    client_id: process.env["gcp-client_id"],
    auth_uri: process.env["gcp-auth_uri"],
    token_uri: process.env["gcp-token_uri"],
    auth_provider_x509_cert_url: process.env["gcp-auth_provider_x509_cert_url"],
    client_x509_cert_url: process.env["gcp-client_x509_cert_url"],
    universe_domain: process.env["gcp-universe_domain"],
  };
}

//---validattion for url ------
function safeRead(filePath) {
  try {
    console.log("🔎 Attempting to read:", filePath);
    if (!fs.existsSync(filePath)) {
      console.error("❌ File does not exist:", filePath);
      return null;
    }
    return fs.readFileSync(filePath);
  } catch (err) {
    console.error("❌ File read failed:", filePath);
    console.error(err.stack); // full trace
    throw err;
  }
}

// Accept only proper media extensions Twilio supports
const ALLOWED_EXT = new Set([".mp3", ".mp4", ".wav", ".ogg", ".amr"]);

function toAbsoluteUrl(fileUrl) {
  if (!fileUrl) return "";
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  return `${PUBLIC_BASE_URL}/${fileUrl.replace(/^\//, "")}`;
}

function hasValidExt(url) {
  const m = url.toLowerCase().match(/\.(mp3|mp4|wav|ogg|amr)(\?.*)?$/);
  return !!m && ALLOWED_EXT.has(`.${m[1]}`);
}

async function isReachable(url) {
  try {
    const r = await axios.head(url, { timeout: 5000, maxRedirects: 3 });
    return r.status >= 200 && r.status < 400;
  } catch (e) {
    console.warn("⚠️ Media HEAD failed:", url, e.response?.status || e.message);
    return false;
  }
}


//--cloudinary------

//--google auth=====

const googleAuth = new GoogleAuth({
  credentials: loadGoogleCredentials(),
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const googleClient = new speech.SpeechClient({ auth: googleAuth });


/** Normalize Hausa-ish text (very light touch): lowercase + collapse spaces. */
function normalizeText(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
/** Token-overlap score (0..1) for fallback matching. */
function tokenOverlapScore(a, b) {
  const A = new Set(normalizeText(a).split(' ').filter(Boolean));
  const B = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / Math.min(A.size, B.size);
}
/** Find best match with fuzzy + token overlap, with extensive logs. */
async function findBestMatch(userMsg) {
  const input = normalizeText(userMsg || '');
  console.log('🔎 Matching: input =', input);

  // Pull QA items (exclude type 'intro' if present)
  const questions = await QA.find({ $or: [{ type: { $exists: false } }, { type: { $ne: 'intro' } }] }).lean();
  console.log('📚 Loaded QA count:', questions.length);

  if (!questions.length) {
    console.warn('⚠️ No QA entries in DB.');
    return null;
  }

  // Build candidate list (strings only)
  const questionTexts = questions
    .map((q) => (q && typeof q.question === 'string' ? q.question : ''))
    .filter(Boolean);

  if (!questionTexts.length) {
    console.warn('⚠️ No valid question texts in QA documents.');
    return null;
  }

  // Fuzzy matching (string-similarity) on normalized text
  const normalizedQuestions = questionTexts.map((q) => normalizeText(q));
  const { ratings } = stringSimilarity.findBestMatch(input, normalizedQuestions);

  // Sort top 3 for debugging
  const scored = ratings
    .map((r, idx) => ({
      idx,
      question: questions[idx]?.question,
      score: r.rating,
    }))
    .sort((a, b) => b.score - a.score);

  const top3 = scored.slice(0, 3);
  console.log('🏁 Fuzzy top-3:');
  top3.forEach((t, i) => console.log(`   ${i + 1}. (${t.score.toFixed(3)}) ${t.question}`));

  // Choose best by fuzzy threshold first
  const FUZZY_THRESHOLD = 0.5; // adjust if needed
  const bestFuzzy = scored[0];
  if (bestFuzzy && bestFuzzy.score >= FUZZY_THRESHOLD) {
    const match = questions[bestFuzzy.idx];
    console.log('✅ Fuzzy accepted:', match?.question, 'score=', bestFuzzy.score.toFixed(3));
    return match || null;
  }

  // Fallback: token overlap
  let bestOverlap = { idx: -1, score: 0 };
  normalizedQuestions.forEach((qnorm, idx) => {
    const s = tokenOverlapScore(input, qnorm);
    if (s > bestOverlap.score) bestOverlap = { idx, score: s };
  });

  const TOKEN_THRESHOLD = 0.5;
  if (bestOverlap.idx >= 0 && bestOverlap.score >= TOKEN_THRESHOLD) {
    const match = questions[bestOverlap.idx];
    console.log('✅ Token-overlap accepted:', match?.question, 'score=', bestOverlap.score.toFixed(3));
    return match || null;
  }

  console.log('❌ No acceptable match (fuzzy or token).');
  return null;
}
// /** Google STT transcription from WhatsApp media URL (OGG -> WAV 16k mono). */

async function transcribeAudio(mediaUrl) {
  const oggPath = path.resolve('./voice.ogg');
  const wavPath = path.resolve('./voice.wav');

  try {
    if (!mediaUrl) {
      console.warn('⚠️ No mediaUrl provided to transcribeAudio.');
      return null;
    }

    console.log('⬇️  Downloading audio from Twilio CDN...');
    const writer = fs.createWriteStream(oggPath);
    const response = await axios({
      url: mediaUrl,
      method: 'GET',
      responseType: 'stream',
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN,
      },
    });

    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    console.log('✅ Audio downloaded ->', oggPath);

    console.log('🎛  Converting to WAV (16k mono)...');
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -i "${oggPath}" -ar 16000 -ac 1 -f wav "${wavPath}"`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    console.log('✅ Converted ->', wavPath);

    const audioBytes = fs.readFileSync(wavPath).toString('base64');

    const request = {
      audio: { content: audioBytes },
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'ha-NG', // Hausa (Nigeria)
        alternativeLanguageCodes: ['en-US'], // fallback
        model: 'default',
        enableAutomaticPunctuation: true,
      },
    };

    console.log('🗣  Calling Google STT...');
    const [responseSTT] = await googleClient.recognize(request);

    const transcription = (responseSTT.results || [])
      .map((r) => (r.alternatives && r.alternatives[0] ? r.alternatives[0].transcript : ''))
      .join(' ')
      .trim();

    console.log('🎤 Raw Google Transcription:', transcription || '(empty)');
    return transcription || null;
  } catch (err) {
    console.error('❌ Google STT failed:', err?.message || err);
    return null;
  } finally {
    try {
      if (fs.existsSync(oggPath)) fs.unlinkSync(oggPath);
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    } catch (cleanupErr) {
      console.warn('⚠️ Cleanup failed:', cleanupErr.message);
    }
  }
}

app.post('/webhook', async (req, res) => {
  const numMedia = Number.parseInt(req.body?.NumMedia || '0', 10) || 0;
  let incomingMsg = req.body?.Body || '';

  // 🔎 Capture referral metadata from ads
  const from = req.body?.From;
  const adHeadline = req.body?.ReferralHeadline || null;
  const adSource = req.body?.ReferralSource || null;
  const adType = req.body?.ReferralType || null;

  console.log('📩 Incoming from:', from);
  console.log('📣 Referral Info:', { adHeadline, adSource, adType });

    try {
    const { From, NumMedia, MediaUrl0 } = req.body;

    if (NumMedia && MediaUrl0) {
      console.log("📥 New receipt uploaded:", MediaUrl0);

      // 1. Download media from Twilio
      const response = await fetch(MediaUrl0);
      const buffer = await response.arrayBuffer();

      // 2. Run OCR with Tesseract.js
      const { data: { text } } = await Tesseract.recognize(Buffer.from(buffer), "eng");
      console.log("🔎 OCR result:", text);

      // 3. Extract structured info
      const receiptExtract = extractReceiptInfo(text);

      // 4. Save order
      await Order.create({
        phone: From.replace("whatsapp:", ""), // e.g. "2347065602624"
        receiptUrl: MediaUrl0,
        receiptExtract,
      });

      console.log("✅ Order stored for", From);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.sendStatus(500);
  }

  // 🚫 Ignore if no ad referral (organic message)
  if (!adHeadline && !adSource && !adType) {
    console.log('⚠️ Ignoring organic conversation (not from ad)');
    return res.sendStatus(200); // Exit early, don’t reply
  }
  const ctwaClid = req.body?.ReferralCtwaClid || null; // Meta click ID

  console.log('------------------------------------------------------------');
  console.log('📩 Incoming from:', from);
  console.log('📦 NumMedia:', numMedia, 'Body:', incomingMsg);
  console.log('📣 Referral ->', {
    headline: adHeadline,
    source: adSource,
    type: adType,
    ctwa_clid: ctwaClid,
  });

  // If voice note
  if (numMedia > 0 && (req.body?.MediaContentType0 || '').includes('audio')) {
    const mediaUrl = req.body.MediaUrl0;
    const transcript = await transcribeAudio(mediaUrl);
    if (transcript) {
      incomingMsg = transcript;
    } else {
      console.warn('⚠️ Transcription returned null/empty; keeping text Body if any.');
    }
  }

  // Load / create session
  let session = await CustomerSession.findOne({ phoneNumber: from });
  if (!session) {
    session = new CustomerSession({
      phoneNumber: from,
      adSource: {
        headline: adHeadline,
        source: adSource,
        type: adType,
        ctwa_clid: ctwaClid,
      },
      hasReceivedWelcome: false,
      conversationHistory: [],
      currentSteps: [],
      messageHistory: [],
      lastInteractedAt: new Date(),
    });
    console.log('🆕 New session created for', from);
  }

  if (!Array.isArray(session.conversationHistory)) session.conversationHistory = [];

  session.conversationHistory.push({
    sender: 'user',
    messageType: numMedia > 0 ? 'audio' : 'text',
    content: incomingMsg,
    timestamp: new Date(),
  });

  session.lastInteractedAt = new Date();
  await session.save();

  // Match QA
  const matchedQA = incomingMsg ? await findBestMatch(incomingMsg) : null;
  console.log('🎯 Matched QA:', matchedQA ? matchedQA.question : '❌ none');

  try {
    // First-time: send intro sequence once
    if (!session.hasReceivedWelcome) {
      console.log('👋 Sending intro sequence...');

      const introDoc = await Intro.findOne();
      const introSequence = introDoc?.sequence || [];

      for (const step of introSequence) {
        if (!step) continue;

        if (step.type === 'text') {
          console.log(`➡️ Sending TEXT: ${step.content}`);
          await client.messages.create({
            from: 'whatsapp:+15558784207',
            to: from,
            body: step.content || '',
          });
        } else if (step.type === 'video' || step.type === 'audio') {
          if (!step.fileUrl) {
            console.warn(`⚠️ Missing fileUrl for step type=${step.type}`);
            continue;
          }

          let safeUrl = toAbsoluteUrl(step.fileUrl);

          console.log(`➡️ ${step.type.toUpperCase()} URL (raw): ${step.fileUrl}`);
          console.log(`➡️ ${step.type.toUpperCase()} URL (final): ${safeUrl}`);

          if (!hasValidExt(safeUrl)) {
            console.warn(`⚠️ Skipping media with bad extension: ${safeUrl}`);
            continue;
          }

          if (!(await isReachable(safeUrl))) {
            console.warn(`⚠️ Skipping unreachable media URL: ${safeUrl}`);
            continue;
          }

          await client.messages.create({
            from: 'whatsapp:+15558784207',
            to: from,
            mediaUrl: [safeUrl],
          });
        }

        // 🕑 Add slight delay so WhatsApp preserves order
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      session.hasReceivedWelcome = true;
      await session.save();
      console.log('✅ Intro sequence sent from DB and session updated.');
    } else if (matchedQA) {
      // ✅ Answer matched QA
      if (matchedQA.answerText) {
        console.log('💬 Sending text answer:', matchedQA.answerText);
        await client.messages.create({
          from: 'whatsapp:+15558784207',
          to: from,
          body: matchedQA.answerText,
        });
      } else {
        console.log('⚠️ Matched QA has no text answer. Sending fallback.');
        await client.messages.create({
          from: 'whatsapp:+15558784207',
          to: from,
          body: 'Mun gano tambayar ka, amma ba mu da amsa a rubuce yanzu.',
        });
      }

      if (matchedQA.answerAudio) {
        let safeUrl = matchedQA.answerAudio;
        if (!safeUrl.startsWith('http')) {
          const base = process.env.PUBLIC_BASE_URL || '';
          safeUrl = `${base.replace(/\/$/, '')}/${safeUrl.replace(/^\//, '')}`;
        }
        console.log('📤 Audio answer (final URL):', safeUrl);

        if (/\.(mp3|wav|ogg|amr)(\?.*)?$/i.test(safeUrl)) {
          try {
            await client.messages.create({
              from: 'whatsapp:+15558784207',
              to: from,
              mediaUrl: [safeUrl],
            });
          } catch (err) {
            console.warn('⚠️ Failed to send audio answer:', err.message);
          }
        } else {
          console.warn('⚠️ Skipping audio answer, invalid extension:', safeUrl);
        }
      } else if (matchedQA.answerVideo) {
        let safeUrl = matchedQA.answerVideo;
        if (!safeUrl.startsWith('http')) {
          const base = process.env.PUBLIC_BASE_URL || '';
          safeUrl = `${base.replace(/\/$/, '')}/${safeUrl.replace(/^\//, '')}`;
        }
        console.log('📤 Video answer (final URL):', safeUrl);

        if (/\.(mp4)(\?.*)?$/i.test(safeUrl)) {
          try {
            await client.messages.create({
              from: 'whatsapp:+15558784207',
              to: from,
              mediaUrl: [safeUrl],
            });
          } catch (err) {
            console.warn('⚠️ Failed to send video answer:', err.message);
          }
        } else {
          console.warn('⚠️ Skipping video answer, invalid extension:', safeUrl);
        }
      }
    } else {
      console.log('🛟 No match; sending fallback.');
      await client.messages.create({
        from: 'whatsapp:+15558784207',
        to: from,
        body: 'Ba mu gane tambayarka ba sosai. Idan kana so, aiko da sautin murya ko ka sake rubutu da cikakken bayani.',
      });
    }
  } catch (err) {
    console.error('❌ Webhook failed:', err);
  }

  res.sendStatus(200);
});

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection:", reason);
});


app.listen(port, () => {
  console.log(`✅ Herbal AI agent running on http://localhost:${port}`);
});
