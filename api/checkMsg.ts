import { connectDB } from './src/db.js';
import * as fs from 'fs';
connectDB().then(async (db)=>{
  const msg = await db.collection('messages').findOne({'feedback.tag': { $ne: 'not_matched' }, sender: { $ne: 'User' }});
  fs.writeFileSync('msg.json', JSON.stringify(msg, null, 2));
  process.exit(0);
}).catch(console.error);
