import express from "express";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import {
  addCategory,
  getAllCategories,
  deleteCategory,
  updateCategory,
} from "../controllers/categoryController.js";

const router = express.Router();

/**
 * =========================================
 * 👑 ADMIN – THÊM THỂ LOẠI
 * =========================================
 * POST /api/v1/category/admin/add
 */
router.post(
  "/admin/add",
  isAuthenticated,
  isAuthorized("Admin"),
  addCategory
);

/**
 * =========================================
 * 📚 ALL – LẤY DANH SÁCH THỂ LOẠI
 * =========================================
 * GET /api/v1/category/all
 */
router.get("/all", isAuthenticated, getAllCategories);

/**
 * =========================================
 * 👑 ADMIN – UPDATE THỂ LOẠI
 * =========================================
 * PATCH /api/v1/category/update/:id
 */
router.patch(
  "/update/:id",
  isAuthenticated,
  isAuthorized("Admin"),
  updateCategory
);

/**
 * =========================================
 * 👑 ADMIN – XÓA THỂ LOẠI
 * =========================================
 * DELETE /api/v1/category/delete/:id
 */
router.delete(
  "/delete/:id",
  isAuthenticated,
  isAuthorized("Admin"),
  deleteCategory
);

export default router;
