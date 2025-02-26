import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendVerificationEmail, sendPasswordResetEmail } from "./email";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

function generateToken() {
  return randomBytes(32).toString("hex");
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'default-secret-key',
    resave: true,
    saveUninitialized: true,
    store: storage.sessionStore,
    cookie: {
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username: string, password: string, done: any) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }

        if (!(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Invalid username or password" });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user: Express.User, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).send("Email already registered");
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
        verified: true,
        verificationToken: null,
      });

      req.login(user, (err) => {
        if (err) {
          console.error("Login error after registration:", err);
          return res.status(500).send("Registration succeeded but login failed");
        }
        res.status(201).json({ user });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).send("Registration failed");
    }
  });

  app.get("/api/verify", async (req, res) => {
    try {
      const { token } = req.query;
      if (!token) {
        return res.status(400).send("Invalid verification token");
      }

      const user = await storage.getUserByVerificationToken(token as string);
      if (!user) {
        return res.status(400).send("Invalid verification token");
      }

      await storage.verifyUser(user.id);
      res.json({ message: "Email verified successfully. You can now log in." });
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).send("Verification failed");
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    try {
      const { email } = req.body;
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(400).send("Email not found");
      }

      const resetToken = generateToken();
      await storage.setResetToken(user.id, resetToken);

      const emailSent = await sendPasswordResetEmail(email, resetToken);
      if (!emailSent) {
        return res.status(500).send("Failed to send password reset email");
      }

      res.json({ message: "Password reset instructions sent to your email" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).send("Failed to send reset password email");
    }
  });

  app.post("/api/reset-password/confirm", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).send("Invalid request");
      }

      const user = await storage.getUserByResetToken(token);
      if (!user) {
        return res.status(400).send("Invalid or expired reset token");
      }

      await storage.updatePassword(user.id, await hashPassword(newPassword));
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Password update error:", error);
      res.status(500).send("Failed to update password");
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: { message: string }) => {
      if (err) return next(err);
      if (!user) return res.status(401).send(info.message);

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });

  app.post("/api/users/clear", async (req, res) => {
    try {
      await storage.clearUsers();
      res.json({ message: "All users have been deleted successfully" });
    } catch (error) {
      console.error("Error clearing users:", error);
      res.status(500).send("Failed to clear users");
    }
  });
}