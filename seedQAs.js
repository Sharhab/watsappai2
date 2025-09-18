// seedQAs.js (ESM)
import mongoose from "mongoose";
import dotenv from "dotenv";
import QA from "./models/QA.js"; // make sure schema uses `export default`

dotenv.config();

// =======================
// Nigeria States
// =======================
const nigeriaStates = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT Abuja","Gombe",
  "Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos",
  "Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers",
  "Sokoto","Taraba","Yobe","Zamfara"
];

const nigeriaQAs = nigeriaStates.map(state => ({
  question: `Ni daga ${state} nake, za ku kawo min magani?`,
  answerText: `Eh, muna kai magani ${state}. Muna da motocinmu daga Kaduna da ke zuwa ${state}, kuma za mu baka lambar direbanmu bayan ka tabbatar da biyan kuɗi.`,
}));

// =======================
// Niger Regions
// =======================
const nigerRegions = [
  "Agadez","Diffa","Dosso","Maradi","Tahoua","Tillabéri","Zinder","Niamey"
];

const nigerQAs = nigerRegions.map(region => ({
  question: `Ni daga ${region} nake a Nijar, za ku kawo min magani?`,
  answerText: `Eh, muna kai magani ${region}. Muna da hanyoyi daga Najeriya zuwa ${region}, kuma za mu baka lambar direbanmu bayan ka tabbatar da biyan kuɗi.`,
}));

// =======================
// Cameroon Regions & Cities
// =======================
const cameroonRegions = [
  "Adamawa","Centre","East","Far North","Littoral",
  "North","Northwest","South","Southwest","West"
];

const cameroonCities = [
  "Yaoundé","Douala","Garoua","Ngaoundéré","Maroua",
  "Bafoussam","Bamenda","Kumba","Buea","Ebolowa"
];

const cameroonRegionQAs = cameroonRegions.map(region => ({
  question: `Ni daga yankin ${region} na Kamaru nake, za ku kawo min magani?`,
  answerText: `Eh, muna kai magani ${region}. Motoci daga Najeriya suna zuwa ${region}, kuma za mu baka lambar direbanmu bayan ka tabbatar da biyan kuɗi.`,
}));

const cameroonCityQAs = cameroonCities.map(city => ({
  question: `Ni daga ${city} nake, za ku kawo min magani?`,
  answerText: `Eh, muna kai magani ${city}. Muna da hanyoyi daga Najeriya zuwa ${city}, kuma za mu turo maka lambar direbanmu bayan ka tabbatar da biyan kuɗi.`,
}));

// =======================
// Combine All
// =======================
const qaData = [
  ...nigeriaQAs,
  ...nigerQAs,
  ...cameroonRegionQAs,
  ...cameroonCityQAs,
];

// =======================
// Seeder
// =======================
async function seedQAs() {
  try {
    console.log("📡 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);

    console.log(`📥 Inserting ${qaData.length} QAs...`);
    await QA.insertMany(qaData);

    console.log("✅ QAs inserted successfully.");
  } catch (err) {
    console.error("❌ Error inserting QAs:", err);
  } finally {
    await mongoose.disconnect();
  }
}

console.log("🚀 Starting QA seeder...");
seedQAs().then(() => console.log("🏁 Seeder finished."));
