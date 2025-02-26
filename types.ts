import { InsertUser, InsertPost, InsertMessage, InsertCommunity, User, Post, Message, Community } from "@shared/schema";
import { Store } from "express-session";

export interface IStorage {
  sessionStore: Store;

  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser & { verificationToken: string }): Promise<User>;
  verifyUser(id: number): Promise<void>;
  setResetToken(id: number, token: string): Promise<void>;
  updatePassword(id: number, newPassword: string): Promise<void>;
  clearUsers(): Promise<void>;  // New method to clear all users

  // Post operations
  createPost(post: InsertPost & { userId: number }): Promise<Post>;
  getPosts(): Promise<(Post & { user: User })[]>;
  archivePost(id: number): Promise<Post>;

  // Message operations
  createMessage(message: InsertMessage & { senderId: number }): Promise<Message>;
  getMessagesByUser(userId: number): Promise<Message[]>;

  // Community operations
  createCommunity(community: InsertCommunity & { createdBy: number }): Promise<Community>;
  getCommunities(): Promise<Community[]>;

  // Search operations
  searchUsers(query: string): Promise<User[]>;

  // Notification operations
  createNotification(notification: any): Promise<any>; // Assuming 'InsertNotification' and 'Notification' types are defined elsewhere.
  getNotifications(userId: number): Promise<any[]>;    // Assuming 'Notification' type is defined elsewhere.
  markNotificationAsRead(id: number): Promise<void>;
}