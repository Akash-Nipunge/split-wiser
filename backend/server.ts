import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { connectToDatabase } from "./db.js";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // Connect to MongoDB
  let db: any;
  try {
    db = await connectToDatabase();
    console.log("Database connected and ready");
  } catch (error) {
    console.error("Database connection failed. API routes will not work correctly.");
  }

  // API Routes
  app.get("/api/users", async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not connected" });
    try {
      const users = await db.collection("users").find({}).toArray();
      // Don't send passwords to frontend
      const usersWithoutPasswords = users.map(({ password, ...user }: any) => user);
      res.json(usersWithoutPasswords);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/login", async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not connected" });
    const { username, password } = req.body;
    try {
      const user = await db.collection("users").findOne({ name: { $regex: new RegExp(`^${username}$`, "i") } });
      if (user && user.password === password) {
        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      } else {
        res.status(401).json({ error: "Invalid username or password" });
      }
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/expenses", async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not connected" });
    try {
      const expenses = await db.collection("expenses").find({}).toArray();
      res.json(expenses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not connected" });
    try {
      const newExpense = req.body;
      await db.collection("expenses").insertOne(newExpense);
      res.status(201).json(newExpense);
    } catch (error) {
      res.status(500).json({ error: "Failed to save expense" });
    }
  });

  // Vite middleware for development
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
