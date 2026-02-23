import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
dotenv.config();
import { connectDB } from "./db.js";
import path from "path";
import { fileURLToPath } from 'url';
import {
  seedSuperAdmin,
  googleLogin,
  authenticateToken,
  requireSuperAdmin,
  addModerator,
  removeModerator,
  getModerators,
  devLogin,
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
    const skip = (page - 1) * limit;

    const matchStage: any = { feedback: { $exists: true } };

    if (filter === 'thumbsUp') {
      matchStage["feedback.rating"] = "thumbsUp";
    } else if (filter === 'thumbsDown') {
      matchStage["feedback.rating"] = "thumbsDown";
    } else if (filter === 'unanswered') {
      matchStage["feedback.tag"] = "not_matched";
    }

    const pipeline = [
      // 1. Match messages with feedback and filter if necessary
      {
        $match: matchStage
      },

      // 2. Group by conversationId to get unique conversations
      {
        $group: {
          _id: "$conversationId",
          latestFeedbackDate: { $max: "$updatedAt" }
        }
      },

      // 3. Lookup the conversation details
      {
        $lookup: {
          from: "conversations",
          localField: "_id",
          foreignField: "conversationId",
          as: "conversation"
        }
      },
      { $unwind: "$conversation" },

      // 4. Lookup all messages for this conversation
      {
        $lookup: {
          from: "messages",
          let: { messageIds: "$conversation.messages" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", "$$messageIds"]
                }
              }
            },
            { $sort: { createdAt: 1 } } // Sort messages chronologically
          ],
          as: "messagesData"
        }
      },

      // 5. Lookup user data for User messages
      {
        $lookup: {
          from: "users",
          let: {
            userIds: {
              $map: {
                input: {
                  $filter: {
                    input: "$messagesData",
                    as: "msg",
                    cond: { $eq: ["$$msg.sender", "User"] }
                  }
                },
                as: "msg",
                in: "$$msg.user"
              }
            }
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: [
                    { $toString: "$_id" },
                    "$$userIds"
                  ]
                }
              }
            }
          ],
          as: "usersData"
        }
      },

      // 6. Project the final structure
      {
        $project: {
          _id: "$conversation._id",
          conversationId: "$conversation.conversationId",
          title: "$conversation.title",
          createdAt: "$conversation.createdAt",
          updatedAt: "$conversation.updatedAt",
          latestFeedbackDate: 1,
          resolved: "$conversation.resolved",

          messages: {
            $map: {
              input: "$messagesData",
              as: "msg",
              in: {
                messageId: "$$msg._id",
                sender: "$$msg.sender",
                createdAt: "$$msg.createdAt",
                updatedAt: "$$msg.updatedAt",
                model: "$$msg.model",
                feedback: "$$msg.feedback",

                // Body/content based on sender
                text: {
                  $cond: [
                    { $eq: ["$$msg.sender", "User"] },
                    "$$msg.text",
                    null
                  ]
                },

                content: {
                  $cond: [
                    { $ne: ["$$msg.sender", "User"] },
                    "$$msg.content",
                    null
                  ]
                },

                // User details (only for User messages)
                user: {
                  $cond: [
                    { $eq: ["$$msg.sender", "User"] },
                    {
                      $let: {
                        vars: {
                          matchedUser: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$usersData",
                                  as: "u",
                                  cond: {
                                    $eq: [
                                      { $toString: "$$u._id" },
                                      "$$msg.user"
                                    ]
                                  }
                                }
                              },
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
                    },
                    null
                  ]
                }
              }
            }
          }
        }
      },

      // 7. Sort by latest feedback date
      { $sort: { latestFeedbackDate: -1 } },

      // 8. Pagination
      { $skip: skip },
      { $limit: limit }
    ];

    const result = await db
      .collection("messages")
      .aggregate(pipeline)
      .toArray();

    // Get total count for pagination
    const countPipeline = [
      { $match: matchStage },
      { $group: { _id: "$conversationId" } },
      { $count: "total" }
    ];

    const countResult = await db
      .collection("messages")
      .aggregate(countPipeline)
      .toArray();

    const totalCount = countResult.length > 0 ? countResult[0]!.total : 0;

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
    const error = err as Error;
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

// Additional endpoint to get a single feedback conversation by ID
app.get("/feedback-conversations/:conversationId", async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const { conversationId } = req.params;

    const pipeline = [
      {
        $match: {
          conversationId: conversationId,
          feedback: { $exists: true }
        }
      },
      {
        $lookup: {
          from: "conversations",
          localField: "conversationId",
          foreignField: "conversationId",
          as: "conversation"
        }
      },
      { $unwind: "$conversation" },
      {
        $lookup: {
          from: "messages",
          let: { messageIds: "$conversation.messages" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$_id", "$$messageIds"] }
              }
            },
            { $sort: { createdAt: 1 } }
          ],
          as: "messagesData"
        }
      },
      {
        $lookup: {
          from: "users",
          let: {
            userIds: {
              $map: {
                input: {
                  $filter: {
                    input: "$messagesData",
                    as: "msg",
                    cond: { $eq: ["$$msg.sender", "User"] }
                  }
                },
                as: "msg",
                in: "$$msg.user"
              }
            }
          },
          pipeline: [
            {
              $match: {
                $expr: { $in: [{ $toString: "$_id" }, "$$userIds"] }
              }
            }
          ],
          as: "usersData"
        }
      },
      {
        $project: {
          _id: "$conversation._id",
          conversationId: "$conversation.conversationId",
          title: "$conversation.title",
          createdAt: "$conversation.createdAt",
          updatedAt: "$conversation.updatedAt",
          resolved: "$conversation.resolved",

          messages: {
            $map: {
              input: "$messagesData",
              as: "msg",
              in: {
                messageId: "$$msg._id",
                sender: "$$msg.sender",
                createdAt: "$$msg.createdAt",
                model: "$$msg.model",
                feedback: "$$msg.feedback",
                text: {
                  $cond: [
                    { $eq: ["$$msg.sender", "User"] },
                    "$$msg.text",
                    null
                  ]
                },
                content: {
                  $cond: [
                    { $ne: ["$$msg.sender", "User"] },
                    "$$msg.content",
                    null
                  ]
                },
                user: {
                  $cond: [
                    { $eq: ["$$msg.sender", "User"] },
                    {
                      $let: {
                        vars: {
                          matchedUser: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$usersData",
                                  as: "u",
                                  cond: {
                                    $eq: [
                                      { $toString: "$$u._id" },
                                      "$$msg.user"
                                    ]
                                  }
                                }
                              },
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
                    },
                    null
                  ]
                }
              }
            }
          }
        }
      },
      { $limit: 1 }
    ];

    const result = await db
      .collection("messages")
      .aggregate(pipeline)
      .toArray();

    if (result.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json(result[0]);
  } catch (err) {
    console.error(err);
    const error = err as Error;
    res.status(500).json({ error: "Internal Server Error", message: error.message });
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
app.get("/conversations/export", async (req: Request, res: Response) => {
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


import fs from 'fs';

const staticPath = path.join(__dirname, "../../web/dist");
console.log("Static files path:", staticPath);
console.log("index.html exists:", fs.existsSync(path.join(staticPath, "index.html")));

// Serve static files from the React app
app.use(express.static(staticPath));

// Explicit route for root
app.get("/", (req: Request, res: Response) => {
  console.log("Root route hit");
  console.log("Request URL:", req.url);
  const indexPath = path.join(staticPath, "index.html");
  console.log("Attempting to serve:", indexPath);

  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
        res.status(500).send("Error sending index.html");
      } else {
        console.log("Sent index.html successfully");
      }
    });
  } else {
    console.error("index.html not found during request");
    res.status(404).send("index.html not found at " + indexPath);
  }
});

// Handle client-side routing, return all requests to React app



const PORT = Number(process.env.PORT) || 3000;

// Auth Routes
app.post("/auth/google", googleLogin);
app.post("/auth/dev-login", devLogin);

// Admin Routes (Protected)
// Admin Routes (Protected)
app.use("/admin", (req, res, next) => {
  console.log(`[API] Admin route hit: ${req.method} ${req.path}`);
  next();
});

app.post("/admin/moderators", (req, res, next) => {
  console.log("[API] POST /admin/moderators hit");
  next();
}, authenticateToken, requireSuperAdmin, addModerator);

app.delete("/admin/moderators", (req, res, next) => {
  console.log("[API] DELETE /admin/moderators hit");
  next();
}, authenticateToken, requireSuperAdmin, removeModerator);

app.get("/admin/moderators", (req, res, next) => {
  console.log("[API] GET /admin/moderators hit");
  next();
}, authenticateToken, requireSuperAdmin, getModerators);

// Knowledge Curation Routes
// 1. Get Negative Feedback (The "Raw Data Dump" Source)
app.get("/admin/feedback/negative", authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const pipeline = [
      // Match messages with negative feedback
      {
        $match: {
          "feedback.rating": 0
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
    const total = await db.collection("messages").countDocuments({ "feedback.rating": 0 });

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
app.post("/admin/knowledge", authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
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
app.get("/admin/knowledge", authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
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
app.put("/admin/knowledge/:id", authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
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
app.delete("/admin/knowledge/:id", authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
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
app.post("/admin/knowledge/sync", authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();

    // Get all golden knowledge entries
    const goldenItems = await db.collection("golden_knowledge").find({}).toArray();

    // Prepare for RAG (For now, we just copy to rag_knowledge collection)
    const ragItems = goldenItems.map(item => ({
      ...item,
      syncedAt: new Date(),
      // We can add a 'search_text' field that combines question and answer for better indexing
      searchText: `${item.question} ${item.answer} ${item.tags ? item.tags.join(' ') : ''}`
    }));

    if (ragItems.length === 0) {
      return res.json({ success: true, count: 0, message: "No items to sync" });
    }

    // Clear existing rag_knowledge and insert new ones
    await db.collection("rag_knowledge").deleteMany({});
    const result = await db.collection("rag_knowledge").insertMany(ragItems);

    res.json({
      success: true,
      count: result.insertedCount,
      message: "Golden knowledge successfully synced to RAG DB"
    });
  } catch (error) {
    console.error("Error syncing to RAG:", error);
    res.status(500).json({ error: "Failed to sync to RAG DB" });
  }
});

// 4. RAG Search Test Endpoint
app.get("/admin/knowledge/search", authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: "Search query 'q' is required" });
    }

    const items = await db.collection("rag_knowledge")
      .find({
        $or: [
          { question: new RegExp(q, 'i') },
          { answer: new RegExp(q, 'i') },
          { tags: new RegExp(q, 'i') }
        ]
      })
      .limit(10)
      .toArray();

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "Failed to search RAG DB" });
  }
});

// 5. Statistics API
app.get("/admin/stats", authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await connectDB();

    // Total Counts
    const totalUsers = await db.collection("users").countDocuments();
    const totalConversations = await db.collection("conversations").countDocuments();
    const totalMessages = await db.collection("messages").countDocuments();

    // Feedback Stats
    const thumbsUp = await db.collection("messages").countDocuments({ "feedback.rating": "thumbsUp" });
    const thumbsDown = await db.collection("messages").countDocuments({ "feedback.rating": "thumbsDown" });

    // Questions by Date (Last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const questionsByDate = await db.collection("messages").aggregate([
      {
        $match: {
          sender: "User",
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    res.json({
      totals: {
        users: totalUsers,
        conversations: totalConversations,
        messages: totalMessages,
        thumbsUp,
        thumbsDown
      },
      questionsTimeline: questionsByDate
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
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

// List documents
app.get("/admin/db/:collection", authenticateToken, requireSuperAdmin, validateCollection, async (req: Request, res: Response) => {
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
app.post("/admin/db/:collection", authenticateToken, requireSuperAdmin, validateCollection, async (req: Request, res: Response) => {
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
app.put("/admin/db/:collection/:id", authenticateToken, requireSuperAdmin, validateCollection, async (req: Request, res: Response) => {
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
app.delete("/admin/db/:collection/:id", authenticateToken, requireSuperAdmin, validateCollection, async (req: Request, res: Response) => {
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

// Handle client-side routing, return all requests to React app
// This must be the LAST route to ensure API routes are not shadowed



// Handle client-side routing, return all requests to React app
// This must be the LAST route to ensure API routes are not shadowed
app.get(/.*/, (req: Request, res: Response) => {
  console.log("Catch-all route hit for:", req.url);
  res.sendFile(path.join(staticPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Server running on 0.0.0.0:${PORT}`);
  try {
    await connectDB();
    await seedSuperAdmin();
    console.log("✅ Database connection established at startup");
  } catch (err) {
    console.error("❌ Failed to connect to database at startup:", err);
  }
});


