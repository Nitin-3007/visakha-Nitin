import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
dotenv.config();
import { connectDB } from "./db.js";
import path from "path";
import { startAlertingService } from './alerts.js';
import { fileURLToPath } from 'url';
import {
  seedSuperAdmin,
  googleLogin,
  authenticateToken,
  requireSuperAdmin,
  requireModeratorOrAdmin,
  requireTeamAccess,
  addModerator,
  removeModerator,
  revokeAccess,
  getModerators,
  devLogin,
  verifyLoginLink,
  checkVerificationStatus,
  type AuthRequest
} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { ObjectId } from "mongodb";

const app: express.Application = express();
app.use(express.json());
import cors from 'cors';
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));


app.get("/feedback-conversations", async (req: Request, res: Response) => {
  try {
    const db = await connectDB();

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const filter = req.query.filter as string || 'all';
    const searchQuery = req.query.q as string || '';
    const skip = (page - 1) * limit;

    const pipeline: any[] = [];

    // 1. Initial Match for Search (if provided)
    if (searchQuery) {
      pipeline.push({
        $lookup: {
          from: "messages",
          localField: "conversationId",
          foreignField: "conversationId",
          as: "allMessages"
        }
      });

      pipeline.push({
        $match: {
          $or: [
            { title: { $regex: searchQuery, $options: 'i' } },
            { "allMessages.text": { $regex: searchQuery, $options: 'i' } }
          ]
        }
      });
    }

    // 2. Filter by feedback type if requested
    if (filter !== 'all') {
      let messageMatch: any = {};
      if (filter === 'thumbsUp') {
        messageMatch = { feedback: { $exists: true }, "feedback.rating": "thumbsUp" };
      } else if (filter === 'thumbsDown') {
        messageMatch = { feedback: { $exists: true }, "feedback.rating": "thumbsDown" };
      } else if (filter === 'autoAnswered') {
        messageMatch["sender"] = { $ne: "User" };
        messageMatch["feedback.tag"] = { $ne: "not_matched" };
      }

      // If we haven't looked up messages yet (no search query), do it now
      if (!searchQuery) {
        pipeline.push({
          $lookup: {
            from: "messages",
            localField: "conversationId",
            foreignField: "conversationId",
            as: "allMessages"
          }
        });
      }

      pipeline.push({
        $match: {
          allMessages: { $elemMatch: messageMatch }
        }
      });
    }

    // 3. Sort and Paginate
    pipeline.push({ $sort: { updatedAt: -1 } });

    // Copy pipeline for count before skipping/limiting
    const countPipeline = [...pipeline, { $count: "total" }];

    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // 4. Final Lookup for detailed message data (if not already present or needs specific structure)
    // Actually, we already have allMessages from the steps above if search or filter was used.
    // Let's ensure consistency by creating 'messagesData' from it.
    if (searchQuery || filter !== 'all') {
      pipeline.push({
        $addFields: { messagesData: "$allMessages" }
      });
    } else {
      pipeline.push({
        $lookup: {
          from: "messages",
          localField: "conversationId",
          foreignField: "conversationId",
          as: "messagesData"
        }
      });
    }

    // 5. Lookup user data
    pipeline.push({
      $lookup: {
        from: "users",
        let: {
          userIds: {
            $map: {
              input: { $filter: { input: "$messagesData", as: "m", cond: { $eq: ["$$m.sender", "User"] } } },
              as: "m",
              in: "$$m.user"
            }
          }
        },
        pipeline: [
          { $match: { $expr: { $in: [{ $toString: "$_id" }, "$$userIds"] } } }
        ],
        as: "usersData"
      }
    });

    // 6. Project final structure
    pipeline.push({
      $project: {
        conversationId: 1,
        title: 1,
        createdAt: 1,
        updatedAt: 1,
        resolved: 1,
        messages: {
          $map: {
            input: { $sortArray: { input: "$messagesData", sortBy: { createdAt: 1 } } },
            as: "msg",
            in: {
              messageId: "$$msg._id",
              sender: "$$msg.sender",
              createdAt: "$$msg.createdAt",
              updatedAt: "$$msg.updatedAt",
              model: "$$msg.model",
              feedback: "$$msg.feedback",
              text: { $cond: [{ $eq: ["$$msg.sender", "User"] }, "$$msg.text", null] },
              content: { $cond: [{ $ne: ["$$msg.sender", "User"] }, "$$msg.content", null] },
              user: {
                $let: {
                  vars: {
                    matchedUser: {
                      $arrayElemAt: [
                        { $filter: { input: "$usersData", as: "u", cond: { $eq: [{ $toString: "$$u._id" }, "$$msg.user"] } } },
                        0
                      ]
                    }
                  },
                  in: {
                    _id: "$$matchedUser._id",
                    name: "$$matchedUser.name",
                    username: "$$matchedUser.username",
                    email: "$$matchedUser.email"
                  }
                }
              }
            }
          }
        }
      }
    });

    const result = await db.collection("conversations").aggregate(pipeline).toArray();
    const countResult = await db.collection("conversations").aggregate(countPipeline).toArray();
    const totalCount = countResult[0]?.total || 0;

    res.json({
      page,
      limit,
      count: result.length,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      data: result
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/feedback-conversations/:conversationId", async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const { conversationId } = req.params;

    const pipeline = [
      { $match: { conversationId } },
      {
        $lookup: {
          from: "messages",
          localField: "messages",
          foreignField: "_id",
          as: "messagesData"
        }
      },
      {
        $lookup: {
          from: "users",
          let: {
            userIds: {
              $map: {
                input: { $filter: { input: "$messagesData", as: "m", cond: { $eq: ["$$m.sender", "User"] } } },
                as: "m",
                in: "$$m.user"
              }
            }
          },
          pipeline: [
            { $match: { $expr: { $in: [{ $toString: "$_id" }, "$$userIds"] } } }
          ],
          as: "usersData"
        }
      },
      {
        $project: {
          conversationId: 1,
          title: 1,
          createdAt: 1,
          updatedAt: 1,
          resolved: 1,
          messages: {
            $map: {
              input: { $sortArray: { input: "$messagesData", sortBy: { createdAt: 1 } } },
              as: "msg",
              in: {
                messageId: "$$msg._id",
                sender: "$$msg.sender",
                createdAt: "$$msg.createdAt",
                model: "$$msg.model",
                feedback: "$$msg.feedback",
                text: { $cond: [{ $eq: ["$$msg.sender", "User"] }, "$$msg.text", null] },
                content: { $cond: [{ $ne: ["$$msg.sender", "User"] }, "$$msg.content", null] },
                user: {
                  $let: {
                    vars: {
                      matchedUser: {
                        $arrayElemAt: [
                          { $filter: { input: "$usersData", as: "u", cond: { $eq: [{ $toString: "$$u._id" }, "$$msg.user"] } } },
                          0
                        ]
                      }
                    },
                    in: {
                      _id: "$$matchedUser._id",
                      name: "$$matchedUser.name",
                      username: "$$matchedUser.username",
                      email: "$$matchedUser.email"
                    }
                  }
                }
              }
            }
          }
        }
      }
    ];

    const result = await db.collection("conversations").aggregate(pipeline).toArray();

    if (result.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// New endpoint to toggle resolved status
app.patch("/feedback-conversations/:conversationId/resolved", async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const { conversationId } = req.params;
    const { resolved } = req.body;

    if (typeof resolved !== 'boolean') {
      return res.status(400).json({ error: "Invalid request", message: "resolved must be a boolean" });
    }

    const result = await db
      .collection("conversations")
      .updateOne(
        { conversationId: conversationId },
        { $set: { resolved: resolved } }
      );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({
      success: true,
      conversationId,
      resolved
    });
  } catch (err) {
    console.error(err);
    const error = err as Error;
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});




// Endpoint to export all conversations as Markdown
app.get("/conversations/export", authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();

    const conversations = await db.collection("conversations").aggregate([
      {
        $lookup: {
          from: "messages",
          localField: "messages",
          foreignField: "_id",
          as: "messagesData"
        }
      },
      {
        $match: {
          "messagesData.feedback": { $exists: true }
        }
      },
      {
        $project: {
          conversationId: 1,
          title: 1,
          createdAt: 1,
          updatedAt: 1,
          resolved: 1,
          messages: {
            $sortArray: { input: "$messagesData", sortBy: { createdAt: 1 } }
          }
        }
      },
      { $sort: { createdAt: -1 } }
    ]).toArray();


    const formatConversation = (conv: any) => {
      let md = `## ${conv.title || 'Untitled Conversation'}\n\n`;
      md += `**ID:** ${conv.conversationId}\n`;
      md += `**Date:** ${new Date(conv.createdAt).toLocaleString()}\n`;
      md += `**Status:** ${conv.resolved ? 'Resolved' : 'Open'}\n`;
      md += `\n---\n\n`;

      if (conv.messages && conv.messages.length > 0) {
        conv.messages.forEach((msg: any) => {
          const sender = msg.sender === 'User' ? '👤 **User**' : '🤖 **Model**';
          const timestamp = new Date(msg.createdAt).toLocaleTimeString();

          md += `${sender} (${timestamp})\n\n`;

          if (msg.text) {
            md += `${msg.text}\n\n`;
          }

          if (msg.content) {
            if (typeof msg.content === 'string') {
              md += `${msg.content}\n\n`;
            } else if (Array.isArray(msg.content)) {
              msg.content.forEach((block: any) => {
                if (block.type === 'text') md += `${block.text}\n`;
                if (block.type === 'think') md += `> *Thinking:*\n> ${block.think}\n`;
              });
              md += `\n`;
            }
          }

          if (msg.feedback) {
            md += `> **Feedback:** ${msg.feedback.rating} ${msg.feedback.text ? '- ' + msg.feedback.text : ''}\n\n`;
          }
        });
      } else {
        md += `*No messages in this conversation.*\n\n`;
      }

      md += `\n---\n\n`;
      return md;
    };

    let markdownContent = `# All Conversations Export\n\n`;
    markdownContent += `Generated on: ${new Date().toLocaleString()}\n`;
    markdownContent += `Total Conversations: ${conversations.length}\n\n`;
    markdownContent += `---\n\n`;

    conversations.forEach(conv => {
      markdownContent += formatConversation(conv);
    });

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', 'attachment; filename="conversations.md"');
    res.send(markdownContent);

  } catch (err) {
    console.error(err);
    const error = err as Error;
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

// Endpoint to serve the HTML viewer with data loaded


const PORT = Number(process.env.PORT) || 3000;

// Auth Routes
app.post("/auth/google", googleLogin);
app.post("/auth/dev-login", devLogin);
app.post("/auth/verify-link", verifyLoginLink);
app.get("/auth/check-verification", checkVerificationStatus);

// Admin Routes (Protected)
app.post("/admin/moderators", authenticateToken, requireSuperAdmin, addModerator);
app.delete("/admin/moderators", authenticateToken, requireSuperAdmin, removeModerator);
app.patch("/admin/moderators/revoke", authenticateToken, requireSuperAdmin, revokeAccess);
app.get("/admin/moderators", authenticateToken, requireTeamAccess, getModerators);

// Knowledge Curation Routes

// Knowledge Curation Routes
// 1. Get Negative Feedback (The "Raw Data Dump" Source)
app.get("/admin/feedback/negative", authenticateToken, requireModeratorOrAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const pipeline = [
      // Match messages with negative feedback
      {
        $match: {
          "feedback.rating": "thumbsDown"
        }
      },
      // Lookup conversation to get context
      {
        $lookup: {
          from: "conversations",
          localField: "conversationId",
          foreignField: "conversationId",
          as: "conversation"
        }
      },
      { $unwind: "$conversation" },
      // Sort by latest
      { $sort: { createdAt: -1 } },
      // Pagination
      { $skip: skip },
      { $limit: limit }
    ];

    const messages = await db.collection("messages").aggregate(pipeline).toArray();
    console.log(`[DEBUG] Negative feedback results: ${messages.length}`);
    const total = await db.collection("messages").countDocuments({ "feedback.rating": "thumbsDown" });

    res.json({
      data: messages,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error("Error fetching negative feedback:", error);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

// 2. Golden Knowledge CRUD (The "Golden DB")
// Create/Promote to Golden DB
app.post("/admin/knowledge", authenticateToken, requireModeratorOrAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const { question, answer, tags, sourceMessageId } = req.body;
    const authReq = req as AuthRequest;

    if (!question || !answer) {
      return res.status(400).json({ error: "Question and Answer are required" });
    }

    const entry = {
      question,
      answer,
      tags: tags || [],
      sourceMessageId: sourceMessageId && typeof sourceMessageId === 'string' ? new ObjectId(sourceMessageId) : null,
      createdBy: authReq.user?.email,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection("golden_knowledge").insertOne(entry);
    res.json({ success: true, id: result.insertedId, ...entry });
  } catch (error) {
    console.error("Error creating knowledge:", error);
    res.status(500).json({ error: "Failed to create knowledge entry" });
  }
});

// List Golden Knowledge
app.get("/admin/knowledge", authenticateToken, requireModeratorOrAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    // Basic search if query param exists
    const query: any = {};
    if (req.query.q && typeof req.query.q === 'string') {
      query.$text = { $search: req.query.q as string };
    }

    const items = await db.collection("golden_knowledge")
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100) // Safety limit
      .toArray();

    res.json(items);
  } catch (error) {
    console.error("Error fetching knowledge:", error);
    res.status(500).json({ error: "Failed to fetch knowledge" });
  }
});

// Update Golden Knowledge
app.put("/admin/knowledge/:id", authenticateToken, requireModeratorOrAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const { id } = req.params;
    const { question, answer, tags } = req.body;

    if (!id || typeof id !== 'string') return res.status(400).json({ error: "Invalid ID" });

    const result = await db.collection("golden_knowledge").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          question,
          answer,
          tags,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: "Entry not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update knowledge" });
  }
});

// Delete Golden Knowledge
app.delete("/admin/knowledge/:id", authenticateToken, requireModeratorOrAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const { id } = req.params;

    if (!id || typeof id !== 'string') return res.status(400).json({ error: "Invalid ID" });

    await db.collection("golden_knowledge").deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete knowledge" });
  }
});

// 3. RAG Synchronization (The "RAG DB")
app.post("/admin/knowledge/sync", authenticateToken, requireModeratorOrAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();

    // Get all golden knowledge entries
    const goldenItems = await db.collection("golden_knowledge").find({}).toArray();

    // Prepare for RAG (For now, we just copy to rag_knowledge collection)
    const ragItems = goldenItems.map(item => ({
      ...item,
      syncedAt: new Date(),
      // We add a 'searchText' field that combines question, answer, and tags for better indexing
      searchText: `${item.question} ${item.answer} ${item.tags ? item.tags.join(' ') : ''}`.toLowerCase()
    }));

    if (ragItems.length === 0) {
      return res.json({ success: true, count: 0, message: "No items to sync" });
    }

    // Clear existing rag_knowledge and insert new ones
    await db.collection("rag_knowledge").deleteMany({});
    const result = await db.collection("rag_knowledge").insertMany(ragItems);

    // Ensure text index exists after sync
    await db.collection("rag_knowledge").createIndex({ searchText: "text" });

    res.json({
      success: true,
      count: result.insertedCount,
      message: "Golden knowledge successfully synced and indexed to RAG DB"
    });
  } catch (error) {
    console.error("Error syncing to RAG:", error);
    res.status(500).json({ error: "Failed to sync to RAG DB" });
  }
});

// 4. RAG Search Test Endpoint
app.get("/admin/knowledge/search", authenticateToken, requireModeratorOrAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: "Search query 'q' is required" });
    }

    const items = await db.collection("rag_knowledge")
      .find({
        $text: { $search: q }
      })
      .sort({ score: { $meta: "textScore" } })
      .limit(10)
      .toArray();

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "Failed to search RAG DB" });
  }
});


// Helper to format date keys for timeline consistent with MongoDB $dateToString
const formatTimelineKey = (date: Date, rangeType: string, tz: string) => {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false
    });
    const parts = dtf.formatToParts(date);
    const p: any = {};
    parts.forEach(part => { p[part.type] = part.value; });

    const Y = p.year;
    const M = p.month;
    const D = p.day;
    const H = p.hour === '24' ? '00' : p.hour; // Handle 24h wrap if any

    if (rangeType === '24h') return `${Y}-${M}-${D}T${H}:00:00`;
    if (rangeType === 'month') return `${Y}-${M}-01`;
    return `${Y}-${M}-${D}`;
  } catch (e) {
    console.error(`Error formatting timeline key for tz ${tz}:`, e);
    // Fallback to UTC ISO if tz fails
    return date.toISOString().split('.')[0];
  }
};

// Helper to pad missing dates/hours
const padTimeline = (data: any[], start: Date, end: Date, rangeType: string, tz: string) => {
  const result = [];
  const current = new Date(start);

  // Align start date to the bucket
  if (rangeType === '24h') current.setMinutes(0, 0, 0);
  else if (rangeType === 'month') {
    current.setDate(1);
    current.setHours(0, 0, 0, 0);
  }
  else current.setHours(0, 0, 0, 0);

  const dataMap = new Map(data.map(item => [item._id, item]));

  let iterations = 0;
  const MAX_ITERATIONS = 500;

  console.log(`[DEBUG] padTimeline: start=${start.toISOString()}, end=${end.toISOString()}, range=${rangeType}, current_aligned=${current.toISOString()}`);

  while (current <= end && iterations < MAX_ITERATIONS) {
    iterations++;
    const key = formatTimelineKey(current, rangeType, tz);
    const itemData = dataMap.get(key) || { count: 0, thumbsUp: 0, thumbsDown: 0 };
    result.push({
      _id: key,
      count: itemData.count || 0,
      thumbsUp: itemData.thumbsUp || 0,
      thumbsDown: itemData.thumbsDown || 0
    });

    if (rangeType === '24h') current.setHours(current.getHours() + 1);
    else if (rangeType === 'month') current.setMonth(current.getMonth() + 1);
    else current.setDate(current.getDate() + 1);
  }
  console.log(`[DEBUG] padTimeline generated ${result.length} rows`);
  return result;
};

app.get("/admin/stats", authenticateToken, requireTeamAccess, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();

    // Total Counts
    const totalUsers = await db.collection("users").countDocuments();
    const totalConversations = await db.collection("conversations").countDocuments();
    const totalMessages = await db.collection("messages").countDocuments();

    // Feedback Stats
    const thumbsUp = await db.collection("messages").countDocuments({ "feedback.rating": "thumbsUp" });
    const thumbsDown = await db.collection("messages").countDocuments({ "feedback.rating": "thumbsDown" });

    // Questions Timeline
    const range = req.query.range as string || '30d';
    const timezone = req.query.tz as string || 'UTC';

    let matchStage: any = { sender: "User" };
    let format = "%Y-%m-%d";
    let dateLimit = new Date();
    let now = new Date();

    if (range === '24h') {
      dateLimit.setHours(dateLimit.getHours() - 24);
      format = "%Y-%m-%dT%H:00:00";
    } else if (range === 'month') {
      dateLimit.setFullYear(dateLimit.getFullYear() - 1);
      format = "%Y-%m-01";
    } else {
      // Default 30d
      dateLimit.setDate(dateLimit.getDate() - 30);
      format = "%Y-%m-%d";
    }
    matchStage.createdAt = { $gte: dateLimit };

    const questionsByDate = await db.collection("messages").aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: format, date: "$createdAt", timezone: timezone } },
          count: { $sum: 1 },
          thumbsUp: {
            $sum: { $cond: [{ $eq: ["$feedback.rating", "thumbsUp"] }, 1, 0] }
          },
          thumbsDown: {
            $sum: { $cond: [{ $eq: ["$feedback.rating", "thumbsDown"] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    const paddedTimeline = padTimeline(questionsByDate, dateLimit, now, range, timezone);

    res.json({
      totals: {
        users: totalUsers,
        conversations: totalConversations,
        messages: totalMessages,
        thumbsUp,
        thumbsDown
      },
      questionsTimeline: paddedTimeline
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// Export Stats to CSV
app.get("/admin/stats/export", authenticateToken, requireModeratorOrAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const range = req.query.range as string || '30d';
    const timezone = req.query.tz as string || 'UTC';

    let matchStage: any = { sender: "User" };
    let format = "%Y-%m-%d";
    let dateLimit = new Date();
    let now = new Date();

    if (range === '24h') {
      dateLimit.setHours(dateLimit.getHours() - 24);
      format = "%Y-%m-%dT%H:00:00";
    } else if (range === 'month') {
      dateLimit.setFullYear(dateLimit.getFullYear() - 1);
      format = "%Y-%m-01";
    } else {
      dateLimit.setDate(dateLimit.getDate() - 30);
      format = "%Y-%m-%d";
    }
    matchStage.createdAt = { $gte: dateLimit };

    const questionsByDate = await db.collection("messages").aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: format, date: "$createdAt", timezone: timezone } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    const timeline = padTimeline(questionsByDate, dateLimit, now, range, timezone);
    console.log(`[DEBUG] Export stats: range=${range}, timeline_len=${timeline.length}, data_points=${questionsByDate.length}`);

    // Convert to CSV with BOM for Excel compatibility
    let csv = "\uFEFFDate,Question Count\n";
    timeline.forEach(row => {
      // Special formatting for CSV to be more human readable but still parseable
      let displayDate = row._id || '';
      if (row._id) {
        try {
          const d = new Date(row._id.includes('T') ? row._id : row._id + 'T00:00:00');
          if (range === '24h') displayDate = d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });
          else if (range === 'month') displayDate = d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: timezone });
          else displayDate = d.toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: timezone });

          // Escape commas if any (shouldn't be in these formats but good practice)
          if (displayDate.includes(',')) displayDate = `"${displayDate}"`;
        } catch (e) { }
      }

      csv += `${displayDate},${row.count}\n`;
    });

    console.log(`[DEBUG] CSV generated, length: ${csv.length}`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="stats_${range}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("Error exporting stats:", error);
    res.status(500).json({ error: "Failed to export statistics" });
  }
});

// Generic Database CRUD Routes (Protected: Super Admin Only)
const ALLOWED_COLLECTIONS = ['users', 'conversations', 'messages', 'faqs'];

const validateCollection = (req: Request, res: Response, next: express.NextFunction) => {
  const collection = req.params.collection as string;
  if (!ALLOWED_COLLECTIONS.includes(collection)) {
    res.status(400).json({ error: "Invalid collection" });
    return; // Ensure function returns to verify no value is returned
  }
  next();
};

// Bulk Replace FAQs from Markdown
app.post("/admin/db/faqs/bulk-replace", authenticateToken, requireModeratorOrAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const { markdown } = req.body;

    if (!markdown || typeof markdown !== 'string') {
      return res.status(400).json({ error: "Markdown content is required" });
    }

    // Simple parser for FAQ Markdown
    // Matches headers (## or ###) as questions and the following text as answer
    const blocks = markdown.split(/^(?:#{1,6})\s+/m).filter(b => b.trim());
    const faqs = blocks.map(block => {
      const lines = block.split('\n');
      const question = (lines[0] || '').trim();
      
      let answerLines: string[] = [];
      let keys: string[] = [];

      // Extract Keys/Tags and construct Answer
      for (let i = 1; i < lines.length; i++) {
        const currentLine = lines[i];
        if (currentLine === undefined) continue;
        const line = currentLine.trim();
        const lowerLine = line.toLowerCase();
        
        if (lowerLine.startsWith('keys:') || lowerLine.startsWith('tags:')) {
           // Parse comma-separated keys
           const keysString = line.substring(line.indexOf(':') + 1);
           keys = keysString.split(',').map(k => k.trim()).filter(k => k.length > 0);
        } else {
           answerLines.push(currentLine); // Keep original formatting
        }
      }

      const answer = answerLines.join('\n').trim();
      return { question, answer, keys };
    }).filter(f => f.question && f.answer);

    if (faqs.length === 0) {
      return res.status(400).json({ error: "No valid FAQ pairs found in Markdown. Use headers (#, ##, ###) for questions." });
    }

    const now = new Date();
    const docs = faqs.map(f => ({
      ...f,
      source: "Bulk Import",
      createdAt: now,
      updatedAt: now
    }));

    // Clear existing and insert new
    await db.collection("questions").deleteMany({});
    const result = await db.collection("questions").insertMany(docs);
    res.json({ success: true, count: result?.insertedCount || 0 });
  } catch (error: any) {
    console.error("Bulk Replace Error:", error);
    res.status(500).json({ error: "Failed to perform bulk replace", details: error.message });
  }
});

// List documents
app.get("/admin/db/:collection", authenticateToken, requireModeratorOrAdmin, validateCollection, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    let collection = req.params.collection as string;
    if (collection === 'faqs') collection = 'questions';

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const items = await db.collection(collection).find({}).skip(skip).limit(limit).toArray();
    const total = await db.collection(collection).countDocuments();

    res.json({
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data", details: (error as Error).message });
  }
});

// Create document
app.post("/admin/db/:collection", authenticateToken, requireModeratorOrAdmin, validateCollection, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    let collection = req.params.collection as string;
    if (collection === 'faqs') collection = 'questions';
    const data = req.body;

    if (data._id) delete data._id; // Let MongoDB generate ID or handle specifically if needed

    const result = await db.collection(collection).insertOne({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to create document", details: (error as Error).message });
  }
});

// Update document
app.put("/admin/db/:collection/:id", authenticateToken, requireModeratorOrAdmin, validateCollection, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    let collection = req.params.collection as string;
    if (collection === 'faqs') collection = 'questions';
    const id = req.params.id as string;
    const data = req.body;

    if (data._id) delete data._id; // Don't update _id

    let query = {};
    try {
      query = { _id: new ObjectId(id) };
    } catch {
      // Fallback for non-ObjectId IDs if any (though typically standard mongo uses ObjectId)
      // Some collections might use string IDs? Conversations use string conversationId but _id is generic.
      // Let's assume _id check first. If fails, maybe it's not found. 
      // Ideally we should handle string _id if existing.
      // For now, assume ObjectId for _id.
      query = { _id: id };
    }

    const result = await db.collection(collection).updateOne(
      query,
      {
        $set: { ...data, updatedAt: new Date() }
      }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to update document", details: (error as Error).message });
  }
});

// Delete document
app.delete("/admin/db/:collection/:id", authenticateToken, requireModeratorOrAdmin, validateCollection, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    let collection = req.params.collection as string;
    if (collection === 'faqs') collection = 'questions';
    const id = req.params.id as string;

    let query = {};
    try {
      query = { _id: new ObjectId(id) };
    } catch {
      query = { _id: id };
    }

    const result = await db.collection(collection).deleteOne(query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete document", details: (error as Error).message });
  }
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.send("OK");
});

// --- Static and Catch-all Routes (MUST BE LAST) ---
import fs from 'fs';
const staticPath = path.join(__dirname, "../../web/dist");

// Serve static files from the React app
app.use(express.static(staticPath));

// Handle client-side routing, return all requests to React app
app.get(/.*/, (req: Request, res: Response) => {
  const filePath = path.join(staticPath, req.path);

  // If it's a specific file request that wasn't caught by express.static, 
  // or if it's a route request, check if the file exists or send index.html
  if (req.path !== '/' && fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    return res.sendFile(filePath);
  }

  // Default to index.html for SPA routing
  const indexPath = path.join(staticPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("index.html not found. Please build the frontend.");
  }
});

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Server running on 0.0.0.0:${PORT}`);
  try {
    await connectDB();
    await seedSuperAdmin();
    startAlertingService();
    console.log("✅ Database connection established at startup");
  } catch (err) {
    console.error("❌ Failed to connect to database at startup:", err);
  }
});


