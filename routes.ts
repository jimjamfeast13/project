import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // WebSocket handling
  const wsClients = new Map();
  
  wss.on('connection', (ws, req) => {
    const userId = req.headers['x-user-id'];
    if (userId) {
      wsClients.set(parseInt(userId), ws);
    }

    ws.on('message', async (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'chat') {
        const savedMessage = await storage.createMessage({
          senderId: message.senderId,
          receiverId: message.receiverId,
          content: message.content
        });

        // Send to specific recipient
        const recipientWs = wsClients.get(message.receiverId);
        if (recipientWs?.readyState === WebSocket.OPEN) {
          recipientWs.send(JSON.stringify({
            type: 'chat',
            message: savedMessage
          }));
        }
      }
    });

    ws.on('close', () => {
      if (userId) {
        wsClients.delete(parseInt(userId));
      }
    });
  });

  // Posts
  app.post("/api/posts", async (req, res) => {
    const post = await storage.createPost({
      userId: req.user!.id,
      ...req.body
    });
    res.json(post);
  });

  app.get("/api/posts", async (req, res) => {
    const posts = await storage.getPosts();
    res.json(posts);
  });

  app.patch("/api/posts/:id/archive", async (req, res) => {

  app.post("/api/communities/:id/join", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const community = await storage.joinCommunity(parseInt(req.params.id), req.user.id);
    res.json(community);
  });

    const post = await storage.archivePost(parseInt(req.params.id));
    res.json(post);
  });

  // Messages
  app.get("/api/messages/users", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const query = req.query.q as string;
    const uniqueUsers = await storage.getUniqueMessageUsers(req.user.id, query);
    res.json(uniqueUsers);
  });

  app.get("/api/messages/:userId", async (req, res) => {
    const messages = await storage.getMessagesByUser(parseInt(req.params.userId));
    res.json(messages);
  });

  // Communities
  app.post("/api/communities", async (req, res) => {
    const community = await storage.createCommunity({
      createdBy: req.user!.id,
      ...req.body
    });
    res.json(community);
  });

  app.get("/api/communities", async (req, res) => {
    const communities = await storage.getCommunities();
    res.json(communities);
  });

  // Search
  app.get("/api/search/users", async (req, res) => {
    const users = await storage.searchUsers(req.query.q as string);
    res.json(users);
  });

  // Notifications
  app.get("/api/notifications", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const notifications = await storage.getNotifications(req.user.id);
    
    // Fetch post details for each notification
    const notificationsWithDetails = await Promise.all(
      notifications.map(async (notification) => {
        if (notification.type === 'interested') {
          const [interestedUser] = await db
            .select()
            .from(users)
            .where(eq(users.id, notification.data.userId));
          return {
            ...notification,
            data: {
              ...notification.data,
              username: interestedUser?.username
            }
          };
        }
        return notification;
      })
    );
    
    res.json(notificationsWithDetails);
  });

  app.post("/api/notifications", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const notification = await storage.createNotification({
      ...req.body,
      data: req.body.data || {}  // Ensure data is never null
    });
    res.json(notification);
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    await storage.markNotificationAsRead(parseInt(req.params.id));
    res.sendStatus(200);
  });

  return httpServer;
}