const mongoose = require('mongoose');
require("dotenv").config();
const Question  = require('./models/QA'); // Make sure your schema supports 'type' and 'sequence'

const introMessage = {
  question: "__intro_trigger__",
  type: "intro",
  sequence: [
    { type: "video", content: "https://yourcdn.com/intro_1.mp4" },
    { type: "video", content: "https://yourcdn.com/intro_2.mp4" },
    { type: "audio", content: "https://yourcdn.com/intro_1.mp3" },
    { type: "audio", content: "https://yourcdn.com/intro_2.mp3" },
    { type: "text", content: "Ga cikakken bayani: Za ka biya ₦14,500 zuwa lambar asusun da ke ƙasa..." },
    { type: "audio", content: "https://yourcdn.com/closing_message.mp3" }
  ]
};

const qaData = [
  introMessage,
    {
    question: "Zan so  rage farashi dan Allah.",
    answerText: "Mun fahimci bukatar rangwame, amma muna da tsayayyen farashi saboda ingancin maganin. Amma muna bayar da shawara bisa matsayinka.",
    answerAudio: "discount_reply_1.mp3"
  },
  {
    question: "Wannan magani yana aiki kuwa?",
    answerText: "Eh, muna da shaidu daga kwastomomi da yawa da suka samu sauki bayan amfani da maganinmu.",
    answerAudio: "trust_reply_1.mp3"
  }, 
  {
    question: "Na gwada wasu magunguna ba su yi aiki ba.",
    answerText: "Abin takaici. Amma wannan magani an tsara shi bisa bincike da gwaji, kuma muna da tabbacin ingancinsa.",
    answerAudio: "trust_reply_2.mp3"
  },
  {
    question: "Zan aika receipt bayan na biya.",
    answerText: "To shikenan, da zarar ka aika receipt din, za mu tabbatar da biyan sannan a tura maka maganin.",
    answerAudio: "payment_reply_1.mp3"
  },
  {
    question: "Zan fi so na zo ofis dinku.",
    answerText: "Zaka iya zuwa ofishinmu idan ka fi son hakan. Da fatan za ka tuntuɓi lambar da ke kasa don jin lokaci da wuri.",
    answerAudio: "office_visit_1.mp3"
  },
  {
    question: "Ina da matsalar mazakuta, tana raguwa.",
    answerText: "Maganinmu na taimakawa wajen dawo da ƙarfin gaba da kuma haɓaka lafiyar jima'i gaba ɗaya.",
    answerAudio: "sexual_health_1.mp3"
  },
  {
    question: "Zan turo da voice domin ku fahimta sosai.",
    answerText: "To shikenan, muna jiran saƙonka a voice domin mu fahimce ka sosai.",
    answerAudio: "unclear_reply_1.mp3"
  }
  // ... other questions
];

async function insertData() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
  
    });

    await Question.deleteMany();
    await Question.insertMany(qaData);

    console.log("+ Questions & Intro message inserted.");
  } catch (err) {
    console.error("Error inserting data:", err);
  } finally {
    await mongoose.disconnect();
  }
}

console.log("Starting seeder...");
insertData().then(() => console.log("Seeder finished."));
