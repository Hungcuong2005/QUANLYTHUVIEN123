import express from "express";
import { config } from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { connectDB } from "./database/database.js";
import { errorMiddleware } from "./middlewares/errorMiddlewares.js";
import authRouter from "./routes/auth.route.js";
import bookRouter from "./routes/book.route.js";
import borrowRouter from "./routes/borrow.route.js";
import userRouter from "./routes/user.route.js";
import categoryRouter from "./routes/category.route.js";
import { notifyUsers } from "./services/notifyUsers.js";
import { removeUnverifiedAccounts } from "./services/removeUnverifiedAccounts.js";
import { v2 as cloudinary } from "cloudinary";

export const app = express();

config({ path: "./config/config.env" });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").trim();

const corsOptions = {
  origin: FRONTEND_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(cookieParser());

// 🔥 CRITICAL: Conditional body parsing với logging
app.use((req, res, next) => {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  
  console.log(`\n🌐 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log(`   Content-Type: ${contentType || 'NOT SET'}`);
  
  if (contentType.startsWith('multipart/form-data')) {
    console.log(`   🔥 MULTIPART DETECTED - Skipping body parsers`);
    console.log(`   ✅ Multer will handle this request\n`);
    return next();
  }
  
  console.log(`   📦 Parsing as JSON/urlencoded\n`);
  express.json({ limit: '50mb' })(req, res, (err) => {
    if (err) {
      console.error(`   ❌ JSON parsing error:`, err.message);
      return next(err);
    }
    express.urlencoded({ extended: true, limit: '50mb' })(req, res, (err2) => {
      if (err2) {
        console.error(`   ❌ URLencoded parsing error:`, err2.message);
        return next(err2);
      }
      next();
    });
  });
});

// Routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/book", bookRouter);
app.use("/api/v1/borrow", borrowRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/category", categoryRouter);

notifyUsers();
removeUnverifiedAccounts();
connectDB();

app.use(errorMiddleware);

console.log("\n✅ Server setup complete!");
console.log("📋 Configured routes:");
console.log("   - /api/v1/auth");
console.log("   - /api/v1/book");
console.log("   - /api/v1/borrow");
console.log("   - /api/v1/user");
console.log("   - /api/v1/category");
console.log("\n");