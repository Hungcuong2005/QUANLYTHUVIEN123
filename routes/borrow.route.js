import express from "express";
import {
  borrowedBooks,
  getBorrowedBooksForAdmin,
  recordBorrowedBook,
  prepareReturnPayment,
  confirmCashPaymentAndReturn,
  vnpayReturn,
  renewBorrowedBook,
} from "../controllers/borrowControllers.js";

import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";

const router = express.Router();

/**
 * =========================================
 * 📌 ADMIN – GHI NHẬN MƯỢN SÁCH
 * =========================================
 * :id = bookId (chỉ dùng khi MƯỢN để tìm BookCopy available)
 */
router.post(
  "/record-borrow-book/:id",
  isAuthenticated,
  isAuthorized("Admin"),
  recordBorrowedBook
);

/**
 * =========================================
 * 👑 ADMIN – XEM TOÀN BỘ LƯỢT MƯỢN
 * =========================================
 */
router.get(
  "/borrowed-books-by-users",
  isAuthenticated,
  isAuthorized("Admin"),
  getBorrowedBooksForAdmin
);

/**
 * =========================================
 * 🙋 USER – XEM SÁCH ĐANG MƯỢN
 * =========================================
 */
router.get("/my-borrowed-books", isAuthenticated, borrowedBooks);

/**
 * =========================================
 * 🔁 USER – GIA HẠN SÁCH
 * =========================================
 * ❗️CHUẨN: gia hạn theo borrowId (KHÔNG phải bookId)
 */
router.post(
  "/renew/:borrowId",
  isAuthenticated,
  renewBorrowedBook
);

/**
 * =========================================
 * 💳 TRẢ SÁCH + THANH TOÁN
 * =========================================
 * ❗️CHUẨN: tất cả dùng borrowId
 *
 * app.js mount:
 * app.use("/api/v1/borrow", borrowRouter)
 *
 * => URL thực tế:
 * POST /api/v1/borrow/return/prepare/:borrowId
 * POST /api/v1/borrow/return/cash/confirm/:borrowId
 */

// tạo yêu cầu thanh toán (cash / vnpay)
router.post(
  "/return/prepare/:borrowId",
  isAuthenticated,
  isAuthorized("Admin"),
  prepareReturnPayment
);

// xác nhận thanh toán tiền mặt
router.post(
  "/return/cash/confirm/:borrowId",
  isAuthenticated,
  isAuthorized("Admin"),
  confirmCashPaymentAndReturn
);

/**
 * =========================================
 * 🌐 VNPAY CALLBACK
 * =========================================
 * ❗️VNPAY redirect về đây → KHÔNG cần auth
 */
router.get("/payment/vnpay/return", vnpayReturn);

export default router;
