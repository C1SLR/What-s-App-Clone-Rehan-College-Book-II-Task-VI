import mongoose from "mongoose";
import fs from "fs/promises";
import path from "path";

// Types
export interface DatabaseUser {
  id: string;
  username: string;
  passwordHash: string;
  avatar?: string;
  lastSeen: Date;
  isBot?: boolean;
  botBio?: string;
}

export interface DatabaseMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read';
  isEdited?: boolean;
  isDeleted?: boolean;
  replyToId?: string;
  reactions?: { userId: string; username: string; emoji: string }[];
}

const JSON_DB_PATH = process.env.VERCEL === "1"
  ? "/tmp/database.json"
  : path.join(process.cwd(), "node_modules", "database.json");

// Local File Database State
class JSONDatabase {
  users: DatabaseUser[] = [];
  messages: DatabaseMessage[] = [];

  async load() {
    try {
      const oldPath = path.join(process.cwd(), "database.json");
      let data = "";
      try {
        data = await fs.readFile(JSON_DB_PATH, "utf-8");
      } catch (e: any) {
        if (e.code === 'ENOENT') {
          try {
            data = await fs.readFile(oldPath, "utf-8");
            console.log("[JSON DB] Migrating database from root to node_modules/database.json...");
            await fs.writeFile(JSON_DB_PATH, data, "utf-8");
            await fs.unlink(oldPath).catch(() => {});
          } catch (oldErr) {
            throw e; // rethrow outer ENOENT if old path also does not exist
          }
        } else {
          throw e;
        }
      }
      const parsed = JSON.parse(data);
      this.users = parsed.users || [];
      this.messages = parsed.messages || [];
      console.log(`[JSON DB] Loaded ${this.users.length} users and ${this.messages.length} messages from node_modules/database.json`);
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        console.error("[JSON DB] Error loading database file, initializing empty:", e);
      } else {
        console.log("[JSON DB] database.json not found in node_modules. Initializing empty database.");
      }
      await this.save();
    }
  }

  async save() {
    try {
      await fs.writeFile(JSON_DB_PATH, JSON.stringify({
        users: this.users,
        messages: this.messages
      }, null, 2), "utf-8");
    } catch (e) {
      console.error("[JSON DB] Error writing database.json:", e);
    }
  }
}

// MongoDB Mongoose Schemas & Models
const MongoUserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  avatar: String,
  lastSeen: { type: Date, default: Date.now },
  isBot: { type: Boolean, default: false },
  botBio: String
});

const MongoMessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  senderId: { type: String, required: true },
  receiverId: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
  isEdited: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  replyToId: String,
  reactions: [{
    userId: String,
    username: String,
    emoji: String
  }]
});

let MongoUser: mongoose.Model<any>;
let MongoMessage: mongoose.Model<any>;

try {
  MongoUser = mongoose.model("User", MongoUserSchema);
  MongoMessage = mongoose.model("Message", MongoMessageSchema);
} catch (e) {
  MongoUser = mongoose.models.User;
  MongoMessage = mongoose.models.Message;
}

// Database Service Manager
export class DatabaseService {
  private isMongo = false;
  private localDB = new JSONDatabase();

  async init(mongoUri?: string) {
    if (mongoUri) {
      try {
        console.log("[DB] Attempting MongoDB connection...");
        mongoose.set("strictQuery", false);
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
        this.isMongo = true;
        console.log("[DB] Connected successfully to MongoDB!");
      } catch (e) {
        console.warn("[DB] Failed to connect to MongoDB, falling back to local JSON database. Error:", e instanceof Error ? e.message : e);
        this.isMongo = false;
      }
    } else {
      console.log("[DB] No MONGODB_URI provided. Using local JSON database fallback.");
      this.isMongo = false;
    }

    if (!this.isMongo) {
      await this.localDB.load();
    }
  }

  // User Operations
  async findUserByUsername(username: string): Promise<DatabaseUser | null> {
    if (this.isMongo) {
      const doc = await MongoUser.findOne({ username });
      return doc ? doc.toObject() : null;
    } else {
      const user = this.localDB.users.find(u => u.username.toLowerCase() === username.toLowerCase());
      return user || null;
    }
  }

  async findUserById(id: string): Promise<DatabaseUser | null> {
    if (this.isMongo) {
      const doc = await MongoUser.findOne({ id });
      return doc ? doc.toObject() : null;
    } else {
      const user = this.localDB.users.find(u => u.id === id);
      return user || null;
    }
  }

  async createUser(username: string, passwordHash: string, avatar?: string, isBot = false, botBio?: string): Promise<DatabaseUser> {
    const user: DatabaseUser = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      passwordHash,
      avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      lastSeen: new Date(),
      isBot,
      botBio
    };

    if (this.isMongo) {
      const doc = new MongoUser(user);
      await doc.save();
      return doc.toObject();
    } else {
      this.localDB.users.push(user);
      await this.localDB.save();
      return user;
    }
  }

  async getAllUsers(): Promise<DatabaseUser[]> {
    if (this.isMongo) {
      const docs = await MongoUser.find({});
      return docs.map(d => d.toObject());
    } else {
      return this.localDB.users;
    }
  }

  async updateLastSeen(userId: string): Promise<void> {
    const now = new Date();
    if (this.isMongo) {
      await MongoUser.updateOne({ id: userId }, { lastSeen: now });
    } else {
      const user = this.localDB.users.find(u => u.id === userId);
      if (user) {
        user.lastSeen = now;
        await this.localDB.save();
      }
    }
  }

  // Message Operations
  async saveMessage(data: {
    senderId: string;
    receiverId: string;
    content: string;
    replyToId?: string;
  }): Promise<DatabaseMessage> {
    const message: DatabaseMessage = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: data.senderId,
      receiverId: data.receiverId,
      content: data.content,
      timestamp: new Date(),
      status: 'sent',
      isEdited: false,
      isDeleted: false,
      replyToId: data.replyToId,
      reactions: []
    };

    if (this.isMongo) {
      const doc = new MongoMessage(message);
      await doc.save();
      return doc.toObject();
    } else {
      this.localDB.messages.push(message);
      await this.localDB.save();
      return message;
    }
  }

  async getMessages(userId1: string, userId2: string): Promise<DatabaseMessage[]> {
    if (this.isMongo) {
      const docs = await MongoMessage.find({
        $or: [
          { senderId: userId1, receiverId: userId2 },
          { senderId: userId2, receiverId: userId1 }
        ]
      }).sort({ timestamp: 1 });
      return docs.map(d => d.toObject());
    } else {
      return this.localDB.messages
        .filter(m =>
          (m.senderId === userId1 && m.receiverId === userId2) ||
          (m.senderId === userId2 && m.receiverId === userId1)
        )
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
  }

  async editMessage(messageId: string, newContent: string): Promise<DatabaseMessage | null> {
    if (this.isMongo) {
      const doc = await MongoMessage.findOneAndUpdate(
        { id: messageId },
        { content: newContent, isEdited: true },
        { new: true }
      );
      return doc ? doc.toObject() : null;
    } else {
      const message = this.localDB.messages.find(m => m.id === messageId);
      if (message && !message.isDeleted) {
        message.content = newContent;
        message.isEdited = true;
        await this.localDB.save();
        return message;
      }
      return null;
    }
  }

  async deleteMessage(messageId: string): Promise<DatabaseMessage | null> {
    if (this.isMongo) {
      const doc = await MongoMessage.findOneAndUpdate(
        { id: messageId },
        { content: "🚫 This message was deleted", isDeleted: true },
        { new: true }
      );
      return doc ? doc.toObject() : null;
    } else {
      const message = this.localDB.messages.find(m => m.id === messageId);
      if (message) {
        message.content = "🚫 This message was deleted";
        message.isDeleted = true;
        await this.localDB.save();
        return message;
      }
      return null;
    }
  }

  async addOrRemoveReaction(messageId: string, userId: string, username: string, emoji: string): Promise<DatabaseMessage | null> {
    if (this.isMongo) {
      const msg = await MongoMessage.findOne({ id: messageId });
      if (!msg) return null;

      const existingReactionIndex = msg.reactions.findIndex((r: any) => r.userId === userId);
      if (existingReactionIndex > -1) {
        if (msg.reactions[existingReactionIndex].emoji === emoji) {
          // Remove if click same emoji
          msg.reactions.splice(existingReactionIndex, 1);
        } else {
          // Update if click different emoji
          msg.reactions[existingReactionIndex].emoji = emoji;
        }
      } else {
        // Add new reaction
        msg.reactions.push({ userId, username, emoji });
      }

      await msg.save();
      return msg.toObject();
    } else {
      const message = this.localDB.messages.find(m => m.id === messageId);
      if (message) {
        if (!message.reactions) message.reactions = [];
        const existingReactionIndex = message.reactions.findIndex(r => r.userId === userId);
        if (existingReactionIndex > -1) {
          if (message.reactions[existingReactionIndex].emoji === emoji) {
            message.reactions.splice(existingReactionIndex, 1);
          } else {
            message.reactions[existingReactionIndex].emoji = emoji;
          }
        } else {
          message.reactions.push({ userId, username, emoji });
        }
        await this.localDB.save();
        return message;
      }
      return null;
    }
  }
}
