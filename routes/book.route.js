import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import express from "express";
import {
  addBookAndCopies,
  deleteBook,
  getAllBooks,
  getBookByIsbn,
  getAvailableCopies,

  // ✅ NEW
  softDeleteBook,
  restoreBook,
} from "../controllers/bookController.js";

const router = express.Router();

router.get("/isbn/:isbn", isAuthenticated, isAuthorized("Admin"), getBookByIsbn);
router.post("/admin/add", isAuthenticated, isAuthorized("Admin"), addBookAndCopies);

// ✅ Lấy danh sách BookCopy available theo bookId
router.get(
  "/:id/available-copies",
  isAuthenticated,
  isAuthorized("Admin"),
  getAvailableCopies
);

router.get("/all", isAuthenticated, getAllBooks);

// ✅ NEW: soft delete + restore
router.patch(
  "/:id/soft-delete",
  isAuthenticated,
  isAuthorized("Admin"),
  softDeleteBook
);

router.patch(
  "/:id/restore",
  isAuthenticated,
  isAuthorized("Admin"),
  restoreBook
);

// ✅ Route cũ vẫn giữ để không vỡ code cũ (đã đổi sang soft delete)
router.delete("/delete/:id", isAuthenticated, isAuthorized("Admin"), deleteBook);

export default router;
