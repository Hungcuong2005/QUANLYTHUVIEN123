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
import expressFileupload from "express-fileupload";
import { notifyUsers } from "./services/notifyUsers.js";
import { removeUnverifiedAccounts } from "./services/removeUnverifiedAccounts.js";

export const app = express();

config({ path: "./config/config.env" });

// ✅ FIX CORS: fallback chắc chắn về vite localhost:5173 + cho phép PATCH
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").trim();

const corsOptions = {
  origin: FRONTEND_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// ✅ FIX lỗi path-to-regexp: không dùng "*"
app.options(/.*/, cors(corsOptions));



app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  expressFileupload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/book", bookRouter);
app.use("/api/v1/borrow", borrowRouter);
app.use("/api/v1/user", userRouter);

notifyUsers();
removeUnverifiedAccounts();
connectDB();

app.use(errorMiddleware);
