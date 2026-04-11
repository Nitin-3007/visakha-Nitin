import { connectDB } from './src/db.js';
connectDB().then(async (db)=>{
  const tags = await db.collection('messages').distinct('feedback.tag');
  console.log('distinct tags:', tags);
  process.exit(0);
}).catch(console.error);
