import { connectDB } from './src/db.js';
import * as fs from 'fs';
connectDB().then(async (db)=>{
  const msg = await db.collection('messages').findOne({'feedback.tag': 'not_matched'});
  fs.writeFileSync('unanswered.json', JSON.stringify(msg, null, 2));
  process.exit(0);
}).catch(console.error);
