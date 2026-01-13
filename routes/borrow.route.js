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

router.post(
  "/record-borrow-book/:id",
  isAuthenticated,
  isAuthorized("Admin"),
  recordBorrowedBook
);

router.get(
  "/borrowed-books-by-users",
  isAuthenticated,
  isAuthorized("Admin"),
  getBorrowedBooksForAdmin
);

router.get("/my-borrowed-books", isAuthenticated, borrowedBooks);

router.post("/renew/:bookId", isAuthenticated, renewBorrowedBook);

/**
 * ✅ FLOW TRẢ SÁCH + THANH TOÁN
 * Vì app.js mount: app.use("/api/v1/borrow", borrowRouter)
 * nên URL thực tế sẽ là:
 * POST /api/v1/borrow/return/prepare/:bookId
 */
router.post(
  "/return/prepare/:bookId",
  isAuthenticated,
  isAuthorized("Admin"),
  prepareReturnPayment
);

router.post(
  "/return/cash/confirm/:bookId",
  isAuthenticated,
  isAuthorized("Admin"),
  confirmCashPaymentAndReturn
);

// VNPAY callback (không cần auth)
router.get("/payment/vnpay/return", vnpayReturn);

export default router;