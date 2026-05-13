import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '.env') });

async function exportRecentQueries() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not defined in the .env file.');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db('test'); // Or use process.env.DB_NAME if preferred
    
    // Calculate date for 10 days ago
    const dateFilter = new Date();
    dateFilter.setDate(dateFilter.getDate() - 10);
    
    console.log(`Fetching queries from ${dateFilter.toISOString()} to now...`);

    const recentQueries = await db.collection('messages').find({
      isCreatedByUser: true,
      createdAt: { $gte: dateFilter }
    }).sort({ createdAt: -1 }).toArray();
    
    const csvLines = [
      '"Date","Query","User ID","Conversation ID"'
    ];
    
    for (const q of recentQueries) {
      const dateStr = q.createdAt ? new Date(q.createdAt).toISOString() : '';
      const text = q.text ? q.text.replace(/"/g, '""') : '';
      const userId = q.user ? q.user.toString() : '';
      const convId = q.conversationId ? q.conversationId.toString() : '';
      
      csvLines.push(`"${dateStr}","${text}","${userId}","${convId}"`);
    }
    
    const outputPath = path.join(__dirname, '..', 'vibe_queries_export.csv');
    fs.writeFileSync(outputPath, csvLines.join('\n'));
    console.log(`Successfully exported ${recentQueries.length} queries to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error exporting queries:', error);
  } finally {
    await client.close();
  }
}

exportRecentQueries();
