import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import express from "express";
import {
  addBookAndCopies,
  deleteBook,
  getAllBooks,
  getBookByIsbn,
} from "../controllers/bookController.js";

const router = express.Router();

router.get("/isbn/:isbn", isAuthenticated, isAuthorized("Admin"), getBookByIsbn);
router.post("/admin/add", isAuthenticated, isAuthorized("Admin"), addBookAndCopies);

router.get("/all", isAuthenticated, getAllBooks);
router.delete("/delete/:id", isAuthenticated, isAuthorized("Admin"), deleteBook);

export default router;
