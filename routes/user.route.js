import express from "express";
import {
  getAllUsers,
  registerNewAdmin,
  setUserLock,
  softDeleteUser,
  restoreUser,
} from "../controllers/userController.js";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/all", isAuthenticated, isAuthorized("Admin"), getAllUsers);

router.post(
  "/add/new-admin",
  isAuthenticated,
  isAuthorized("Admin"),
  registerNewAdmin
);

// ✅ Khóa / mở khóa
router.patch("/:id/lock", isAuthenticated, isAuthorized("Admin"), setUserLock);

// ✅ Xóa (chỉ set isDeleted=true)
router.patch(
  "/:id/soft-delete",
  isAuthenticated,
  isAuthorized("Admin"),
  softDeleteUser
);

// ✅ Khôi phục (set isDeleted=false)
router.patch("/:id/restore", isAuthenticated, isAuthorized("Admin"), restoreUser);

export default router;
