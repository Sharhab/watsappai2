// index.js
import dotenv from "dotenv";
dotenv.config();
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
import { encodeForWhatsApp } from "./utils/encodeMedia.js";
import { GoogleAuth } from "google-auth-library";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const port = process.env.PORT || 3000;
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
//const { loadGoogleCredentials } = require('./loadGoogleCredentials')

// ✅ Enable CORS so React frontend (5173) can call backend (3000)
app.use(cors({
  origin: "http://localhost:5173", // allow only React app
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
// ✅ Serve uploaded audio files
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".mp4")) {
      res.setHeader("Content-Type", "video/mp4");
    }
    if (filePath.endsWith(".mp3") || filePath.endsWith(".ogg")) {
      res.setHeader("Content-Type", "audio/mpeg");
    }
  }
}));
const qasstorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');

  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
app.use((req, res, next)=> {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});
const uploadQas = multer({storage: qasstorage})
  const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // make sure uploads/ exists
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage }).any();
// 🔹 helper to safely convert audio
// async function convertAudioIfNeeded(filePath) {
//   return new Promise((resolve, reject) => {
//     if (!filePath) return resolve(null);

//     const ext = path.extname(filePath).toLowerCase();
//     const dir = path.dirname(filePath);
//     const base = path.basename(filePath, ext);

//     // Only convert if not already mp3
//     if (ext === ".mp3") {
//       return resolve(filePath);
//     }

//     const outputPath = path.join(dir, `${base}-converted.mp3`);
//     const cmd = `ffmpeg -i "${filePath}" -vn -ar 44100 -ac 2 -b:a 192k "${outputPath}" -y`;

//     exec(cmd, (error) => {
//       if (error) {
//         console.error("❌ ffmpeg conversion failed:", error.message);
//         return resolve(filePath); // fallback to original
//       }
//       resolve(outputPath);
//     });
//   });
// }

// ---------------------- Intro API ----------------------
app.use("/uploads", express.static("uploads"));
// Save or update int//ro
app.post("/api/intro", upload, async (req, res) => {
  try {
    const rawSeq = JSON.parse(req.body.sequence); // comes from frontend
    const sequence = rawSeq.map((step, i) => {
      const file = req.files.find((f) => f.fieldname === `step${i}_file`);

      return {
        type: step.type,
        content: step.type === "text" ? req.body[`step${i}_content`] || step.content : null,
        // ✅ Fixed: now returns full URL, not relative path
       fileUrl: file ? `/uploads/${file.filename}` : null,
      };
    });

    const intro = new Intro({ sequence });
    await intro.save();

    res.json(intro);
  } catch (err) {
    console.error("❌ Error saving intro:", err);
    res.status(400).json({ error: err.message });
  }
});
// Get intro
app.get("/api/intro", async (req, res) => {
  try {
    const intro = await Intro.findOne();
    res.json(intro);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
//// app.post("/api/intro", upload, async (req, res) =>// {
//   try// {
    // const rawSeq = JSON.parse(req.body.sequence); // comes from fronte//nd
    // const sequence = rawSeq.map((step, i) =>// {
      // const file = req.files.find((f) => f.fieldname === `step${i}_file`//);
  //  const baseUrl = `${req.protocol}://${req.get("host")}//`;
      // return// {
        // type: step.typ//e,
        // content: step.type === "text" ? req.body[`step${i}_content`] || step.content : nul//l,
        // fileUrl: file ? `/uploads/${file.filename}` : nul//l,
      // };
//    // });
//// 
    // const intro = new Intro({ sequence });
//    // await intro.save();
//// 
    // res.json(intro//);
  // } catch (err)// {
    // console.error("❌ Error saving intro:", err//);
    // res.status(400).json({ error: err.message });
//  //// }
// });
//Get int//ro
// app.get('/api/intro', async (req, res) =>// {
  // try// {
    // const intro = await Intro.findOne(//);
    // res.json(intro//);
  // } catch (error)// {
    // res.status(500).json({ error: error.message });
//  // }
// });

// Delete intro sequence + uploaded files

// Update intro (replace any of the files/text)

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
app.post('/api/qas', uploadQas.single('answerAudio'), async (req, res) => {
  try {
    const newQA = new QA({
      question: req.body.question,
      answerText: req.body.answerText,
      answerAudio: req.file ? `/uploads/${req.file.filename}` : null,
    });
    await newQA.save();
    res.json(newQA);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});
// Update QA
app.put('/api/qas/:id', uploadQas.single('answerAudio'), async (req, res) => {

  try {
    const update = {
      question: req.body.question,
      answerText: req.body.answerText,
    };
    if (req.file) {
      update.answerAudio = `/uploads/${req.file.filename}`;

    }



    const qa = await QA.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!qa) return res.status(404).json({ error: 'QA not found' });

    res.json(qa);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
////-------webhook--------------
////app.post('/webhook', async (req, res) => {
// //  // const from = req.body?.From;//  // const numMedia = Number.parseInt(req.body?.NumMedia || '0', 10) || 0;//  // let incomingMsg = req.body?.Body || '';
  /// const adHeadline = req.body?.ReferralHeadline || null;
// //  // console.log('------------------------------------------------------------');//  // console.log('📩 Incoming from:', from);
  /// console.log('📦 NumMedia:', numMedia, 'Body:', incomingMsg);
// 
  //f voice note
// //  // if (numMedia > 0 && (req.body?.MediaContentType0 || '').includes('audio')) {//    // const mediaUrl = req.body.MediaUrl0;//    // const transcript = await transcribeAudio(mediaUrl);//    // if (transcript) {//      // incomingMsg = transcript;//    // } else {//      // console.warn('⚠️ Transcription returned null/empty; keeping text Body if any.');//    // }
  /// }
// //  Load / create session//  // let session = await CustomerSession.findOne({ phoneNumber: from });
  /// if (!session) {
// //    // session = new CustomerSession({//      // phoneNumber: from,//      // adSource: { headline: adHeadline },//      // hasReceivedWelcome: false,//      // conversationHistory: [],//      // currentSteps: [],//      // messageHistory: [],//      // lastInteractedAt: new Date(),//    // });//    // console.log('🆕 New session created for', from);//  // }
  /// if (!Array.isArray(session.conversationHistory)) session.conversationHistory = [];
// //  // session.conversationHistory.push({//    // sender: 'user',//    // messageType: numMedia > 0 ? 'audio' : 'text',//    // content: incomingMsg,//    // timestamp: new Date(),
  /// });
// //  // session.lastInteractedAt = new Date();//  // await session.save();//  Match QA
  /// const matchedQA = incomingMsg ? await findBestMatch(incomingMsg) : null;
// 
  /// console.log('🎯 Matched QA:', matchedQA ? matchedQA.question : '❌ none');
// //  // try {//    First-time: send intro sequence once
//st-time: send intro sequence once//// if (!session.hasReceivedWelcome) {
  /// console.log('👋 Sending intro sequence...');
// 
  //etch from DB
// //  // const introDoc = await Intro.findOne();
  /// const introSequence = introDoc?.sequence || [];
// //  // for (const step of introSequence) {
  // // if (!step) continue;
// //    // if (step.type === 'text'  && step.content) {//      // await client.messages.create({//        // from: 'whatsapp:+14155238886',//        // to: from,//        // body: step.content 
  //   // });
// //    // } else if ((step.type === 'video' || step.type === 'audio')  && step.fileUrl){//      // if (!step.content) continue;//      // await client.messages.create({//        // from: 'whatsapp:+14155238886',//        // to: from,//        //  mediaUrl: [step.fileUrl],//      // });//    // }
  /// }
// //  // session.hasReceivedWelcome = true;
  /// await session.save();
// 
  /// console.log('✅ Intro sequence sent from DB and session updated.');
// //    // } else if (matchedQA) {//      ✅ Always answer, but for now we only send TEXT//      // if (matchedQA.answerText) {//        // console.log('💬 Sending text answer:', matchedQA.answerText);//        // await client.messages.create({//          // from: 'whatsapp:+14155238886',//          // to: from,//          // body: matchedQA.answerText,//        // });//      // } else {//        // console.log('⚠️ Matched QA has no text answer. Sending fallback.');//        // await client.messages.create({//          // from: 'whatsapp:+14155238886',//          // to: from,//          // body: 'Mun gano tambayar ka, amma ba mu da amsa a rubuce yanzu.',//        // });
  //   // }
// 
  //   ⏸️ Commented out audio/video answers (to be re-enabled later when URLs are real)
// //      // if (matchedQA.answerAudio) {//        // console.log('📤 Sending audio answer:', matchedQA.answerAudio);//        // await client.messages.create({//          // from: 'whatsapp:+14155238886',//          // to: from,//          // mediaUrl: [matchedQA.answerAudio],
  //     // });
// //      // } else if (matchedQA.answerVideo) {//        // console.log('📤 Sending video answer:', matchedQA.answerVideo);//        // await client.messages.create({//          // from: 'whatsapp:+14155238886',//          // to: from,//          // mediaUrl: [matchedQA.answerVideo],//        // });
  //   // }
    // //    // } else {//      // console.log('🛟 No match; sending fallback.');//      // await client.messages.create({//        // from: 'whatsapp:+14155238886',//        // to: from,//        // body://          // 'Ba mu gane tambayarka ba sosai. Idan kana so, aiko da sautin murya ko ka sake rubutu da cikakken bayani.',//      // });
    // }

    

  //} catch (error) {
    //console.error('❌ Twilio send error:', error?.message || error);
  //}

  //res.status(200).end();
//});

app.post('/webhook', async (req, res) => {
  const from = req.body?.From;
  const numMedia = Number.parseInt(req.body?.NumMedia || '0', 10) || 0;
  let incomingMsg = req.body?.Body || '';
  const adHeadline = req.body?.ReferralHeadline || null;

  console.log('------------------------------------------------------------');
  console.log('📩 Incoming from:', from);
  console.log('📦 NumMedia:', numMedia, 'Body:', incomingMsg);

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
      adSource: { headline: adHeadline },
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
// First-time: send intro sequence once
if (!session.hasReceivedWelcome) {
  console.log('👋 Sending intro sequence...');

  // Fetch from DB
  const introDoc = await Intro.findOne();
  const introSequence = introDoc?.sequence || [];
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;

for (const step of introSequence) {
  if (!step) continue;

  if (step.type === "text" && step.content) {
    console.log("➡️ Sending TEXT:", step.content);
    await client.messages.create({
      from: "whatsapp:+14155238886",
      to: from,
      body: step.content,
    });
} else if ((step.type === "video" || step.type === "audio") && step.fileUrl) {
  let safeUrl;

  if (step.fileUrl.startsWith("http")) {
    // Already an external URL, just use it
    safeUrl = step.fileUrl;
  } else {
    // Local file, re-encode before sending
    const localPath = path.join(__dirname, step.fileUrl.replace(/^\//, ""));
    const safePath = await encodeForWhatsApp(localPath, step.type);

    // Serve via your public base URL
    safeUrl = `${baseUrl}/uploads/${path.basename(safePath)}`;
  }

  console.log(`➡️ Sending ${step.type.toUpperCase()}: ${safeUrl}`);
  await client.messages.create({
    from: "whatsapp:+14155238886",
    to: from,
    mediaUrl: [safeUrl], // ✅ now WhatsApp-safe
  });
}
}
  session.hasReceivedWelcome = true;
  await session.save();
  console.log('✅ Intro sequence sent from DB and session updated.');

    } else if (matchedQA) {
      // ✅ Always answer, but for now we only send TEXT
      if (matchedQA.answerText) {
        console.log('💬 Sending text answer:', matchedQA.answerText);
        await client.messages.create({
          from: 'whatsapp:+14155238886',
          to: from,
          body: matchedQA.answerText,
        });
      } else {
        console.log('⚠️ Matched QA has no text answer. Sending fallback.');
        await client.messages.create({
          from: 'whatsapp:+14155238886',
          to: from,
          body: 'Mun gano tambayar ka, amma ba mu da amsa a rubuce yanzu.',
        });
      }

      if (matchedQA.answerAudio) {
        console.log('📤 Sending audio answer:', matchedQA.answerAudio);
        await client.messages.create({
          from: 'whatsapp:+14155238886',
          to: from,
          mediaUrl: [matchedQA.answerAudio],
        });
      } else if (matchedQA.answerVideo) {
        console.log('📤 Sending video answer:', matchedQA.answerVideo);
        await client.messages.create({
          from: 'whatsapp:+14155238886',
          to: from,
          mediaUrl: [matchedQA.answerVideo],
        });
      }

    } else {
      console.log('🛟 No match; sending fallback.');
      await client.messages.create({
        from: 'whatsapp:+14155238886',
        to: from,
        body:
          'Ba mu gane tambayarka ba sosai. Idan kana so, aiko da sautin murya ko ka sake rubutu da cikakken bayani.',
      });
    }
  } catch (error) {
    console.error('❌ Twilio send error:', error?.message || error);
  }

  res.status(200).end();
});

app.listen(port, () => {
  console.log(`✅ Herbal AI agent running on http://localhost:${port}`);
});
