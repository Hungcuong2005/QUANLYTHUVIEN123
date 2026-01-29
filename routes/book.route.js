import express from "express";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";

import {
  addBookAndCopies,
  deleteBook,
  getAllBooks,
  getBookByIsbn,
  getAvailableCopies,
  softDeleteBook,
  restoreBook,
  updateBookCover,
} from "../controllers/bookController.js";

import { uploadBookImage } from "../middlewares/uploadBookImage.js";

const router = express.Router();

router.get("/isbn/:isbn", isAuthenticated, isAuthorized("Admin"), getBookByIsbn);
router.post("/admin/add", isAuthenticated, isAuthorized("Admin"), addBookAndCopies);
router.get("/:id/available-copies", isAuthenticated, isAuthorized("Admin"), getAvailableCopies);
router.get("/all", isAuthenticated, getAllBooks);
router.patch("/:id/soft-delete", isAuthenticated, isAuthorized("Admin"), softDeleteBook);
router.patch("/:id/restore", isAuthenticated, isAuthorized("Admin"), restoreBook);

// ✅ Upload ảnh bìa sách
router.put(
  "/admin/:id/cover",
  isAuthenticated,
  isAuthorized("Admin"),
  uploadBookImage.single("coverImage"),
  updateBookCover
);

router.delete("/delete/:id", isAuthenticated, isAuthorized("Admin"), deleteBook);

export default router;