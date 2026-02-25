import { MongoClient, Db } from "mongodb";
import dotenv from "dotenv";
dotenv.config();


const uri = process.env.MONGO_URI || "mongodb://localhost:27017/visakha";
const client = new MongoClient(uri);

let db: Db;

export async function connectDB() {
  if (!db) {
    console.log("🔌 Connecting to MongoDB...");
    await client.connect();
    db = client.db(process.env.DB_NAME || "test");
    console.log("✅ MongoDB connected");
  }
  return db;
}
