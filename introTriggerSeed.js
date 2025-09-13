// // introTriggerSeed.js
// // Seed script for intro response in MongoDB

// const mongoose = require('mongoose');
// const Question = require('./models'); // Assuming you have a Question model defined


// mongoose.connect(process.env.MONGO_URI, {

// });

// const introSequence = [
//   {
//     question: '__intro_trigger__', // internal trigger keyword for first-time users
//     type: 'intro',
//     sequence: [
//       {
//         type: 'video',
//         url: 'https://yourserver.com/intro/video1.mp4',
//         order: 1,
//       },
//       {
//         type: 'video',
//         url: 'https://yourserver.com/intro/video2.mp4',
//         order: 2,
//       },
//       {
//         type: 'audio',
//         url: 'https://yourserver.com/intro/audio1.mp3',
//         order: 3,
//       },
//       {
//         type: 'audio',
//         url: 'https://yourserver.com/intro/audio2.mp3',
//         order: 4,
//       },
//       {
//         type: 'text',
//         text: `🧾 Farashin maganin shine ₦8,000.\n✅ Ana tura kudi ta hanyar banki ko POS.\n📦 Ana turo magani duk inda kake a Najeriya.\n🕐 Lokacin isowa: 1-3 kwanaki.`,
//         order: 5,
//       },
//       {
//         type: 'audio',
//         url: 'https://yourserver.com/intro/audio3.mp3',
//         order: 6,
//       },
//     ],
//   },
// ];

// async function seedIntro() {
//   try {
//     await Question.deleteMany({ question: '__intro_trigger__' });
//     await Question.insertMany(introSequence);
//     console.log('✅ Intro sequence seeded successfully');
//     process.exit();
//   } catch (error) {
//     console.error('❌ Seeding intro failed:', error);
//     process.exit(1);
//   }
// }

// seedIntro();
