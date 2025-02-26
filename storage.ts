import { IStorage } from "./types";
import { users, posts, messages, communities, notifications } from "@shared/schema";
import type { InsertUser, InsertPost, InsertMessage, InsertCommunity, Post, Message, Community, User, InsertNotification, Notification } from "@shared/schema";
import { db } from "./db";
import { eq, like, desc, or, ne, and, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async clearUsers(): Promise<void> {
    await db.delete(users);
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.verificationToken, token));
    return user;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.resetPasswordToken, token));
    return user;
  }

  async createUser(user: InsertUser & { verificationToken: string | null }): Promise<User> {
    const [newUser] = await db.insert(users).values({
      ...user,
      verified: true,
      verificationToken: null,
      resetPasswordToken: null,
      bio: null,
      avatar: null,
    }).returning();
    return newUser;
  }

  async verifyUser(id: number): Promise<void> {
    await db.update(users)
      .set({ verified: true, verificationToken: null })
      .where(eq(users.id, id));
  }

  async setResetToken(id: number, token: string): Promise<void> {
    await db.update(users)
      .set({ resetPasswordToken: token })
      .where(eq(users.id, id));
  }

  async updatePassword(id: number, newPassword: string): Promise<void> {
    await db.update(users)
      .set({ password: newPassword, resetPasswordToken: null })
      .where(eq(users.id, id));
  }

  // Post operations
  async createPost(post: InsertPost & { userId: number }): Promise<Post> {
    const [newPost] = await db.insert(posts).values({
      ...post,
      createdAt: new Date(),
      archived: false,
      imageUrl: post.imageUrl || null,
    }).returning();
    return newPost;
  }

  async getPosts(): Promise<(Post & { user: User })[]> {
    const results = await db
      .select({
        post: posts,
        user: users,
      })
      .from(posts)
      .where(eq(posts.archived, false))
      .leftJoin(users, eq(posts.userId, users.id))
      .orderBy(desc(posts.createdAt));

    return results.map(({ post, user }) => ({
      ...post,
      user,
    }));
  }

  async archivePost(id: number): Promise<Post> {
    const [post] = await db
      .update(posts)
      .set({ archived: true })
      .where(eq(posts.id, id))
      .returning();
    return post;
  }

  // Message operations
  async getUniqueMessageUsers(userId: number, query?: string): Promise<User[]> {
    const uniqueUserIds = await db
      .select({ userId: sql`DISTINCT CASE 
        WHEN sender_id = ${userId} THEN receiver_id 
        WHEN receiver_id = ${userId} THEN sender_id 
      END` })
      .from(messages)
      .where(
        or(
          eq(messages.senderId, userId),
          eq(messages.receiverId, userId)
        )
      );

    const userConditions = [
      ne(users.id, userId),
      ...uniqueUserIds.map(({userId}) => eq(users.id, userId))
    ];

    if (query) {
      userConditions.push(like(users.username, `%${query}%`));
    }

    return await db
      .select()
      .from(users)
      .where(and(...userConditions))
      .limit(10);
  }

  async createMessage(message: InsertMessage & { senderId: number }): Promise<Message> {
    const [newMessage] = await db.insert(messages).values({
      ...message,
      createdAt: new Date(),
    }).returning();
    return newMessage;
  }

  async getMessagesByUser(userId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(
        eq(messages.senderId, userId) || eq(messages.receiverId, userId)
      )
      .orderBy(messages.createdAt);
  }

  // Community operations
  async createCommunity(community: InsertCommunity & { createdBy: number }): Promise<Community> {
    const [newCommunity] = await db.insert(communities).values({
      ...community,
      description: community.description || null,
    }).returning();
    return newCommunity;
  }

  async getCommunities(): Promise<Community[]> {
    return await db.select().from(communities);
  }

  // Search operations
  async searchUsers(query: string): Promise<User[]> {
    // Return all users if query is empty
    const baseQuery = db.select().from(users);

    if (!query) {
      return await baseQuery;
    }

    return await baseQuery.where(
      or(
        like(users.username, `%${query}%`),
        like(users.email, `%${query}%`),
        like(users.bio || '', `%${query}%`)
      )
    );
  }

  // Notification operations
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(notifications)
      .values({
        ...notification,
        read: false,
        createdAt: new Date(),
      })
      .returning();
    return newNotification;
  }

  async getNotifications(userId: number): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async markNotificationAsRead(id: number): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id));
  }
}

export const storage = new DatabaseStorage();