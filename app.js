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
import expressFileupload from "express-fileupload";
import { notifyUsers } from "./services/notifyUsers.js";
import { removeUnverifiedAccounts } from "./services/removeUnverifiedAccounts.js";
import { v2 as cloudinary } from "cloudinary";

export const app = express();

// ✅ Load env trước
config({ path: "./config/config.env" });

// ✅ Config cloudinary sau khi đã có process.env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ FIX CORS
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

// 🔥 CRITICAL FIX: Chỉ parse JSON/urlencoded cho NON-MULTIPART requests
// Multer sẽ tự xử lý multipart/form-data
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  
  // Nếu KHÔNG phải multipart/form-data thì mới parse
  if (!contentType.includes('multipart/form-data')) {
    express.json()(req, res, () => {
      express.urlencoded({ extended: true })(req, res, next);
    });
  } else {
    // Nếu là multipart thì skip, để multer xử lý
    console.log("🔥 [APP] Detected multipart/form-data - skipping body parsers");
    next();
  }
});

// ⚠️ XÓA hoặc COMMENT 2 dòng này nếu không dùng expressFileupload
// Vì nó CONFLICT với multer-storage-cloudinary
// app.use(
//   expressFileupload({
//     useTempFiles: true,
//     tempFileDir: "/tmp/",
//   })
// );

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/book", bookRouter);
app.use("/api/v1/borrow", borrowRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/category", categoryRouter);


notifyUsers();
removeUnverifiedAccounts();
connectDB();

app.use(errorMiddleware);