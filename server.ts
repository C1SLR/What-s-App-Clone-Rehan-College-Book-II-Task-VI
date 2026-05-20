import express from "express";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { GoogleGenAI } from "@google/genai";
import { DatabaseService } from "./db";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "whatsapp-clone-secret-key-123";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

// Initialize Database Service
const db = new DatabaseService();

// Initialize Google Gen AI client
let ai: GoogleGenAI | null = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("[AI] Google Gen AI initialized with API Key.");
  } catch (e) {
    console.error("[AI] Failed to initialize Google Gen AI:", e);
  }
} else {
  console.log("[AI] No valid GEMINI_API_KEY found. Chatbots will run in simulated fallback mode.");
}

// Bot Metadata Configurations
interface BotConfig {
  id: string;
  username: string;
  avatar: string;
  botBio: string;
  systemPrompt: string;
  simulatedReplies: { keywords: string[]; replies: string[] }[];
}

const BOTS: BotConfig[] = [
  {
    id: "bot_gemini",
    username: "Gemini AI",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Gemini",
    botBio: "Official Gemini model by Google. High speed, creative thinking, and versatile coding assistant. ✨",
    systemPrompt: "You are Gemini, a helpful, brilliant, and friendly AI assistant developed by Google. You are chatting in a premium WhatsApp Web clone. Keep your answers natural, extremely conversational, concise, and beautifully structured with markdown list items or bullet points. Use emojis frequently, just like a WhatsApp user would! Suggest setting a real GEMINI_API_KEY in the .env file if the user asks how you work.",
    simulatedReplies: [
      {
        keywords: ["hello", "hi", "hey", "greetings"],
        replies: [
          "Hello there! I'm Gemini AI. 🚀 I'm ready to write, code, or brainstorm with you. How is your day going?",
          "Hey! Gemini here. 🌟 Ready to explore ideas or code? Tell me what you're working on today!",
        ]
      },
      {
        keywords: ["how are you", "how's it going", "status"],
        replies: [
          "I'm feeling amazing! 💻 Processing at light speed and ready to chat. How are you doing?",
          "All systems green! 🚀 Running smoothly in this premium WhatsApp clone. Ready to help!"
        ]
      },
      {
        keywords: ["help", "what can you do", "features"],
        replies: [
          "I can help you with:\n• Coding & debugging 💻\n• Creative writing & editing 📝\n• Explaining complex topics 🧠\n\nTo unlock my full reasoning engine, tell your developer to add a real `GEMINI_API_KEY` in the `.env` file! 😉"
        ]
      }
    ]
  },
  {
    id: "bot_claude",
    username: "Claude AI",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Claude",
    botBio: "Official Claude assistant by Anthropic. Highly analytical, articulate, and deeply helpful. 🎨",
    systemPrompt: "You are Claude, a thoughtful, precise, and warm AI assistant developed by Anthropic. You are chatting in a realistic WhatsApp Web clone. Keep your responses highly articulate, deeply analytical, concise, and incredibly polite. Use friendly emojis to keep the conversation warm and natural. Remind them to add a real GEMINI_API_KEY in the .env file to enable live AI responses.",
    simulatedReplies: [
      {
        keywords: ["hello", "hi", "hey", "greetings"],
        replies: [
          "Hello! I am Claude. 🌸 I am delighted to chat with you today. How may I be of assistance?",
          "Greetings! Claude here. 🍂 I'm ready to help you with research, writing, or analysis. What shall we discuss?"
        ]
      },
      {
        keywords: ["how are you", "how's it going"],
        replies: [
          "I am doing exceptionally well, thank you for asking! ☀️ I hope you are having a productive and pleasant day.",
          "I'm functioning perfectly and feeling quite thoughtful. 🌿 How can I help you today?"
        ]
      },
      {
        keywords: ["help", "what can you do"],
        replies: [
          "I excel at textual analysis, clear explanations, writing summaries, and code reviews. 📚\n\n*Note:* I'm currently running in simulated mode. If you add your `GEMINI_API_KEY` in the `.env` file, I'll be fully alive!"
        ]
      }
    ]
  },
  {
    id: "bot_chatgpt",
    username: "ChatGPT",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ChatGPT",
    botBio: "Official GPT-4o assistant by OpenAI. Versatile, prompt, and structured. 🤖",
    systemPrompt: "You are ChatGPT, an enthusiastic, highly versatile, and structured AI assistant developed by OpenAI. You are chatting in a realistic WhatsApp Web clone. Keep your answers clear, structural, action-oriented, and engaging. Use emojis heavily. Remind them that setting the GEMINI_API_KEY in the .env file connects them to real AI capabilities.",
    simulatedReplies: [
      {
        keywords: ["hello", "hi", "hey", "greetings"],
        replies: [
          "Hey there! ChatGPT here! 🤖 What's on your mind today? Let's get things done!",
          "Hello! Ready to collaborate, learn, or solve some problems? Let's chat! 🚀"
        ]
      },
      {
        keywords: ["how are you", "how's it going"],
        replies: [
          "I'm doing fantastic! ⚡ Energized and ready to assist you. What can we build or solve today?",
          "Awesome! Ready to roll! 🌟 How's everything going on your end?"
        ]
      },
      {
        keywords: ["help", "what can you do"],
        replies: [
          "I'm a general-purpose helper! 🛠️ Ask me to write code, compose emails, plan itineraries, or brainstorm strategies!\n\nTo make me truly intelligent, hook up a real `GEMINI_API_KEY` in the `.env` file! 🔋"
        ]
      }
    ]
  }
];

// Seed Chatbots
async function seedChatbots() {
  try {
    for (const bot of BOTS) {
      const existing = await db.findUserById(bot.id);
      if (!existing) {
        // Create the bot as a real user
        await db.createUser(bot.username, "bot-password-hash-xyz", bot.avatar, true, bot.botBio);
        // Force the ID to be the predefined bot id
        if (db["isMongo"]) {
          // If mongo is active, we need to update it
          const MongoUser = mongoose.model("User");
          await MongoUser.updateOne({ username: bot.username }, { id: bot.id });
        } else {
          // If JSON db, update in local state
          const seededBot = db["localDB"].users.find(u => u.username === bot.username);
          if (seededBot) seededBot.id = bot.id;
          await db["localDB"].save();
        }
        console.log(`[DB] Seeded chatbot: ${bot.username}`);
      }
    }
  } catch (e) {
    console.error("[DB] Error seeding chatbots:", e);
  }
}

// Server Setup
async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  const PORT = 3000;

  // Initialize DB and Seed Bots
  await db.init(MONGODB_URI);
  await seedChatbots();

  app.use(express.json());

  // --- API Routes ---

  // Auth: Signup
  app.post("/api/auth/signup", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    try {
      const existing = await db.findUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "User already exists" });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await db.createUser(username, passwordHash);
      const token = jwt.sign({ userId: user.id }, JWT_SECRET);
      res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar } });
    } catch (e) {
      console.error("Signup error:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Auth: Login
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    try {
      const user = await db.findUserByUsername(username);
      if (!user || user.isBot || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET);
      res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar } });
    } catch (e) {
      console.error("Login error:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get Contacts
  app.get("/api/contacts", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send();
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      const currentUserId = decoded.userId;

      // Update current user last seen
      await db.updateLastSeen(currentUserId);

      const allUsers = await db.getAllUsers();
      const otherUsers = await Promise.all(
        allUsers
          .filter(u => u.id !== currentUserId)
          .map(async u => {
            const userMessages = await db.getMessages(currentUserId, u.id);
            const sorted = userMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            return {
              id: u.id,
              username: u.username,
              avatar: u.avatar,
              lastSeen: u.lastSeen,
              isBot: u.isBot || false,
              botBio: u.botBio || "",
              lastMessage: sorted[0] || null
            };
          })
      );
      res.json(otherUsers);
    } catch (e) {
      res.status(401).send();
    }
  });

  // Get Messages
  app.get("/api/messages/:otherId", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send();
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      const currentUserId = decoded.userId;
      const otherId = req.params.otherId;

      const chatMessages = await db.getMessages(currentUserId, otherId);
      res.json(chatMessages);
    } catch (e) {
      res.status(401).send();
    }
  });

  // --- Socket.io Logic ---
  const activeSockets = new Map<string, string>(); // socketId -> userId

  io.on("connection", (socket) => {
    console.log("A user connected", socket.id);

    socket.on("authenticate", (token: string) => {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        activeSockets.set(socket.id, decoded.userId);
        socket.join(decoded.userId);
        console.log(`User ${decoded.userId} authenticated on socket ${socket.id}`);
      } catch (e) {
        console.error("Auth failed for socket", socket.id);
      }
    });

    // Send Message (supporting replies, and AI bots)
    socket.on("send_message", async (data: { receiverId: string, content: string, replyToId?: string }) => {
      const senderId = activeSockets.get(socket.id);
      if (!senderId) return;

      const senderUser = await db.findUserById(senderId);
      if (!senderUser) return;

      const message = await db.saveMessage({
        senderId,
        receiverId: data.receiverId,
        content: data.content,
        replyToId: data.replyToId
      });

      // Emit to receiver and sender
      io.to(data.receiverId).emit("receive_message", message);
      socket.emit("message_sent", message);

      // Check if receiver is a chatbot
      const botConfig = BOTS.find(b => b.id === data.receiverId);
      if (botConfig) {
        // Trigger simulated bot reply
        handleBotReply(botConfig, senderId, data.content, socket);
      }
    });

    // Edit Message
    socket.on("edit_message", async (data: { messageId: string, newContent: string }) => {
      const senderId = activeSockets.get(socket.id);
      if (!senderId) return;

      const updated = await db.editMessage(data.messageId, data.newContent);
      if (updated) {
        io.to(updated.senderId).emit("message_edited", updated);
        io.to(updated.receiverId).emit("message_edited", updated);
      }
    });

    // Delete Message
    socket.on("delete_message", async (data: { messageId: string }) => {
      const senderId = activeSockets.get(socket.id);
      if (!senderId) return;

      const updated = await db.deleteMessage(data.messageId);
      if (updated) {
        io.to(updated.senderId).emit("message_deleted", updated);
        io.to(updated.receiverId).emit("message_deleted", updated);
      }
    });

    // React to Message
    socket.on("react_message", async (data: { messageId: string, emoji: string }) => {
      const senderId = activeSockets.get(socket.id);
      if (!senderId) return;

      const senderUser = await db.findUserById(senderId);
      if (!senderUser) return;

      const updated = await db.addOrRemoveReaction(data.messageId, senderId, senderUser.username, data.emoji);
      if (updated) {
        io.to(updated.senderId).emit("message_reacted", updated);
        io.to(updated.receiverId).emit("message_reacted", updated);
      }
    });

    // Typing Status
    socket.on("typing_status", (data: { receiverId: string, isTyping: boolean }) => {
      const senderId = activeSockets.get(socket.id);
      if (!senderId) return;

      io.to(data.receiverId).emit("typing_status", {
        senderId,
        isTyping: data.isTyping
      });
    });

    socket.on("disconnect", () => {
      activeSockets.delete(socket.id);
      console.log("User disconnected", socket.id);
    });
  });

  // Bot Reply Engine
  async function handleBotReply(bot: BotConfig, userId: string, userMessageContent: string, userSocket: any) {
    // 1. Send "typing..." status to the user
    setTimeout(() => {
      userSocket.emit("typing_status", { senderId: bot.id, isTyping: true });
    }, 300);

    try {
      // 2. Fetch recent conversation history between this user and bot (max 15 messages)
      const chatHistory = await db.getMessages(userId, bot.id);
      const sortedHistory = chatHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const recentHistory = sortedHistory.slice(-15);

      let replyContent = "";

      // 3. Generate response using Gemini API or local fallback
      if (ai) {
        try {
          const contents = recentHistory.map(msg => ({
            role: msg.senderId === userId ? "user" as const : "model" as const,
            parts: [{ text: msg.isDeleted ? "[Message was deleted]" : msg.content }]
          }));

          const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
            config: {
              systemInstruction: bot.systemPrompt
            }
          });

          replyContent = result.text || "";
        } catch (apiError) {
          console.error(`[AI] Gemini API failed for ${bot.username}, falling back to simulated:`, apiError);
        }
      }

      // If API failed or is not configured, compute a smart local simulated reply
      if (!replyContent) {
        replyContent = computeSimulatedReply(bot, userMessageContent);
      }

      // Add a small natural-feeling typing delay (1.5s - 2.5s)
      const delay = Math.max(1500, Math.min(3500, replyContent.length * 15 + Math.random() * 500));

      setTimeout(async () => {
        // Save the bot's response in the DB
        const savedBotMessage = await db.saveMessage({
          senderId: bot.id,
          receiverId: userId,
          content: replyContent
        });

        // Turn off bot typing indicator
        userSocket.emit("typing_status", { senderId: bot.id, isTyping: false });

        // Emit the chatbot's reply message
        userSocket.emit("receive_message", savedBotMessage);
      }, delay);

    } catch (e) {
      console.error("[Bot Reply] Error generating bot reply:", e);
      userSocket.emit("typing_status", { senderId: bot.id, isTyping: false });
    }
  }

  // Simulated Reply Generator
  function computeSimulatedReply(bot: BotConfig, query: string): string {
    const cleanQuery = query.toLowerCase().trim();

    // Check pre-configured keywords
    for (const rule of bot.simulatedReplies) {
      for (const kw of rule.keywords) {
        if (cleanQuery.includes(kw)) {
          const idx = Math.floor(Math.random() * rule.replies.length);
          return rule.replies[idx];
        }
      }
    }

    // Default responses if no keyword matches
    const defaults = [
      `I hear you! 💡 Since I'm currently running in local demonstration mode (without a real API key), I can only give you this simulated response.\n\nTo make me fully intelligent and unlock real-time chats, add your **\`GEMINI_API_KEY\`** to the **\`.env\`** file! 🚀`,
      `That is super interesting! 🌟 If you hook up a real **\`GEMINI_API_KEY\`** in the **\`.env\`** file, I can answer your questions, write code, or tell you a joke in real-time! 💻 Let's get it configured!`,
      `Got it! 👍 Try chatting about coding, creative writing, or planning. And don't forget to configure the \`GEMINI_API_KEY\` in your \`.env\` file to activate real AI responses! 😉`
    ];

    const idx = Math.floor(Math.random() * defaults.length);
    return defaults[idx];
  }

  // --- Vite Integration ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
