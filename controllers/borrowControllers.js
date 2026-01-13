// Middleware bắt lỗi async để không cần try/catch thủ công
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";

// Middleware xử lý lỗi tùy chỉnh
import ErrorHandler from "../middlewares/errorMiddlewares.js";

// Model mượn sách
import { Borrow } from "../models/borrow.model.js";

// Model sách
import { Book } from "../models/book.model.js";

// Model người dùng
import { User } from "../models/user.model.js";

// Hàm tính tiền phạt trả sách trễ
import { calculateFine } from "../utils/fineCalculator.js";

// ✅ thêm
import crypto from "crypto";

/**
 * ===============================
 * ✅ VNPAY HELPERS
 * ===============================
 * ENV cần có:
 * VNP_TMN_CODE=xxxx
 * VNP_HASH_SECRET=xxxx
 * VNP_URL=https://pay.vnpay.vn/vpcpay.html (prod) hoặc sandbox url
 * VNP_RETURN_URL=http://localhost:xxxx/api/payment/vnpay/return
 * APP_BASE_URL=http://localhost:5173 (frontend để redirect sau khi thanh toán)
 */
const sortObject = (obj) => {
  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) sorted[k] = obj[k];
  return sorted;
};

const createVnpayUrl = ({ amountVnd, txnRef, orderInfo, ipAddr }) => {
  const tmnCode = process.env.VNP_TMN_CODE;
  const secretKey = process.env.VNP_HASH_SECRET;
  const vnpUrl = process.env.VNP_URL;
  const returnUrl = process.env.VNP_RETURN_URL;

  if (!tmnCode || !secretKey || !vnpUrl || !returnUrl) {
    throw new Error("Thiếu ENV cấu hình VNPAY (VNP_TMN_CODE/VNP_HASH_SECRET/VNP_URL/VNP_RETURN_URL).");
  }

  const date = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const vnp_CreateDate =
    date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());

  // VNPAY dùng đơn vị: *100 (VNĐ -> “xu” theo quy ước VNPAY)
  const vnp_Amount = Math.round(amountVnd) * 100;

  let vnp_Params = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: tmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Amount,
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || "127.0.0.1",
    vnp_CreateDate,
  };

  vnp_Params = sortObject(vnp_Params);

  // tạo chuỗi ký
  const signData = new URLSearchParams(vnp_Params).toString();
  const hmac = crypto.createHmac("sha512", secretKey);
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
  vnp_Params.vnp_SecureHash = signed;

  const paymentUrl = `${vnpUrl}?${new URLSearchParams(vnp_Params).toString()}`;
  return paymentUrl;
};

/**
 * ===============================
 * ✅ HOÀN TẤT TRẢ SÁCH SAU KHI ĐÃ THANH TOÁN
 * ===============================
 */
const finalizeReturnAfterPaid = async ({ bookId, email }) => {
  const book = await Book.findById(bookId);
  if (!book) throw new ErrorHandler("Không tìm thấy sách.", 404);

  const user = await User.findOne({ email, accountVerified: true });
  if (!user) throw new ErrorHandler("Không tìm thấy người dùng.", 404);

  // tìm sách đang mượn (chưa trả)
  const borrowedBook = user.borrowedBooks.find(
    (b) => b.bookId.toString() === bookId && b.returned === false
  );
  if (!borrowedBook) throw new ErrorHandler("Bạn chưa mượn sách này.", 400);

  // đánh dấu đã trả
  borrowedBook.returned = true;
  await user.save();

  // tăng số lượng sách lên lại
  book.quantity += 1;
  book.availability = book.quantity > 0;
  await book.save();

  // update Borrow record
  const borrow = await Borrow.findOne({
    book: bookId,
    "user.email": email,
    returnDate: null,
  });

  if (!borrow) throw new ErrorHandler("Không tìm thấy thông tin mượn sách.", 400);

  borrow.returnDate = new Date();
  await borrow.save();

  return borrow;
};

/**
 * ===============================
 * 📌 GHI NHẬN VIỆC MƯỢN SÁCH (giữ nguyên)
 * ===============================
 */
export const recordBorrowedBook = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { email } = req.body;

  const book = await Book.findById(id);
  if (!book) return next(new ErrorHandler("Không tìm thấy sách.", 404));

  const user = await User.findOne({ email, accountVerified: true });
  if (!user) return next(new ErrorHandler("Không tìm thấy người dùng.", 404));

  if (book.quantity === 0) return next(new ErrorHandler("Sách đã hết.", 400));

  const isAlreadyBorrowed = user.borrowedBooks.find(
    (b) => b.bookId.toString() === id && b.returned === false
  );
  if (isAlreadyBorrowed) return next(new ErrorHandler("Bạn đã mượn sách này rồi.", 400));

  book.quantity -= 1;
  book.availability = book.quantity > 0;
  await book.save();

  user.borrowedBooks.push({
    bookId: book._id,
    bookTitle: book.title,
    borrowedDate: new Date(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  await user.save();

  await Borrow.create({
    user: { id: user._id, name: user.name, email: user.email },
    book: book._id,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    price: book.price,

    // ✅ default
    payment: {
      method: "cash",
      status: "unpaid",
      amount: 0,
    },
  });

  res.status(200).json({
    success: true,
    message: "Ghi nhận mượn sách thành công.",
  });
});

/**
 * ===============================
 * ✅ PREPARE RETURN PAYMENT (THANH TOÁN THẬT)
 * ===============================
 * POST /api/borrow/return/prepare/:bookId
 * body: { email, method: "cash" | "vnpay" | "zalopay" }
 *
 * - Tính fine tại thời điểm thanh toán
 * - Lưu payment pending
 * - Nếu vnpay: trả về paymentUrl để redirect sang VNPAY
 */
export const prepareReturnPayment = catchAsyncErrors(async (req, res, next) => {
  const { bookId } = req.params;
  const { email, method } = req.body;

  if (!email) return next(new ErrorHandler("Thiếu email.", 400));
  if (!method) return next(new ErrorHandler("Thiếu phương thức thanh toán.", 400));

  const book = await Book.findById(bookId);
  if (!book) return next(new ErrorHandler("Không tìm thấy sách.", 404));

  const borrow = await Borrow.findOne({
    book: bookId,
    "user.email": email,
    returnDate: null,
  });

  if (!borrow) return next(new ErrorHandler("Không tìm thấy thông tin mượn sách.", 400));

  // tính fine tại thời điểm “chuẩn bị thanh toán”
  const fine = calculateFine(borrow.dueDate);
  const total = (borrow.price || book.price || 0) + (fine || 0);

  borrow.fine = fine;
  borrow.payment = {
    ...borrow.payment,
    method,
    amount: total,
    status: method === "cash" ? "pending" : "pending",
  };

  await borrow.save();

  // CASH: không có cổng thanh toán, trả về total để hiển thị
  if (method === "cash") {
    return res.status(200).json({
      success: true,
      method,
      amount: total,
      message: "Đã tạo yêu cầu thanh toán tiền mặt. Vui lòng thu tiền và xác nhận.",
    });
  }

  // VNPAY: tạo link thanh toán thật
  if (method === "vnpay") {
    const txnRef = `BORROW_${borrow._id.toString()}_${Date.now()}`; // mã giao dịch của bạn
    const ipAddr =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "127.0.0.1";

    // lưu tạm transactionId (để đối chiếu)
    borrow.payment.transactionId = txnRef;
    await borrow.save();

    let paymentUrl;
    try {
      paymentUrl = createVnpayUrl({
        amountVnd: total,
        txnRef,
        orderInfo: `Thanh toan tra sach - Borrow ${borrow._id}`,
        ipAddr,
      });
    } catch (e) {
      return next(new ErrorHandler(e.message || "Không tạo được link VNPAY.", 500));
    }

    return res.status(200).json({
      success: true,
      method,
      amount: total,
      paymentUrl,
    });
  }

  // ZaloPay: bạn có thể tích hợp sau, hiện báo chưa hỗ trợ
  return next(new ErrorHandler("ZaloPay chưa được tích hợp trong bản sửa nhanh này.", 400));
});

/**
 * ===============================
 * ✅ VNPAY RETURN CALLBACK
 * ===============================
 * GET /api/payment/vnpay/return?vnp_...&vnp_SecureHash=...
 *
 * - VNPAY redirect về endpoint này
 * - Backend verify chữ ký
 * - Nếu thành công: set payment.paid + finalizeReturn
 * - Redirect về frontend (APP_BASE_URL)
 */
export const vnpayReturn = catchAsyncErrors(async (req, res, next) => {
  const vnp_Params = { ...req.query };
  const secureHash = vnp_Params.vnp_SecureHash;
  delete vnp_Params.vnp_SecureHash;
  delete vnp_Params.vnp_SecureHashType;

  const secretKey = process.env.VNP_HASH_SECRET;
  if (!secretKey) return next(new ErrorHandler("Thiếu ENV VNP_HASH_SECRET.", 500));

  const sorted = sortObject(vnp_Params);
  const signData = new URLSearchParams(sorted).toString();

  const hmac = crypto.createHmac("sha512", secretKey);
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:5173";

  // sai chữ ký
  if (signed !== secureHash) {
    return res.redirect(`${appBaseUrl}/payment-result?status=failed&reason=invalid_signature`);
  }

  const responseCode = vnp_Params.vnp_ResponseCode; // "00" là thành công
  const txnRef = vnp_Params.vnp_TxnRef;

  // tìm Borrow theo transactionId đã lưu lúc tạo payment
  const borrow = await Borrow.findOne({ "payment.transactionId": txnRef });
  if (!borrow) {
    return res.redirect(`${appBaseUrl}/payment-result?status=failed&reason=borrow_not_found`);
  }

  if (responseCode !== "00") {
    borrow.payment.status = "failed";
    await borrow.save();
    return res.redirect(`${appBaseUrl}/payment-result?status=failed&reason=vnpay_${responseCode}`);
  }

  // ✅ thanh toán thành công
  borrow.payment.status = "paid";
  borrow.payment.paidAt = new Date();
  await borrow.save();

  // ✅ hoàn tất trả sách (set returnDate + update user + book)
  try {
    await finalizeReturnAfterPaid({
      bookId: borrow.book.toString(),
      email: borrow.user.email,
    });
  } catch (e) {
    // đã paid nhưng finalize lỗi -> vẫn redirect báo lỗi để bạn xử lý
    return res.redirect(`${appBaseUrl}/payment-result?status=paid_but_finalize_failed`);
  }

  return res.redirect(`${appBaseUrl}/payment-result?status=success`);
});

/**
 * ===============================
 * ✅ CASH CONFIRM (thu tiền mặt xong mới “trả sách”)
 * ===============================
 * POST /api/borrow/return/cash/confirm/:bookId
 * body: { email }
 */
export const confirmCashPaymentAndReturn = catchAsyncErrors(async (req, res, next) => {
  const { bookId } = req.params;
  const { email } = req.body;

  const borrow = await Borrow.findOne({
    book: bookId,
    "user.email": email,
    returnDate: null,
  });
  if (!borrow) return next(new ErrorHandler("Không tìm thấy thông tin mượn sách.", 400));

  // chỉ confirm nếu đang pending cash
  if (borrow.payment?.method !== "cash") {
    return next(new ErrorHandler("Đơn này không phải thanh toán tiền mặt.", 400));
  }

  borrow.payment.status = "paid";
  borrow.payment.paidAt = new Date();
  await borrow.save();

  await finalizeReturnAfterPaid({ bookId, email });

  res.status(200).json({
    success: true,
    message: "Đã xác nhận thanh toán tiền mặt và hoàn tất trả sách.",
  });
});

/**
 * ===============================
 * ❗️TRẢ SÁCH (HÀM CŨ) - ĐỔI HÀNH VI
 * ===============================
 * Bạn KHÔNG nên gọi trực tiếp hàm này để trả sách nữa.
 * Thay vào đó dùng:
 * - prepareReturnPayment (tạo thanh toán)
 * - vnpayReturn (callback)
 * - confirmCashPaymentAndReturn (cash)
 *
 * => Mình giữ hàm cũ để không vỡ code cũ, nhưng giờ sẽ chặn.
 */
export const returnBorrowBook = catchAsyncErrors(async (req, res, next) => {
  return next(
    new ErrorHandler(
      "Luồng trả sách đã đổi: hãy gọi API /borrow/return/prepare/:bookId để thanh toán trước.",
      400
    )
  );
});

/**
 * ===============================
 * 📌 LẤY DANH SÁCH SÁCH ĐANG MƯỢN (USER)
 * ===============================
 */
export const borrowedBooks = catchAsyncErrors(async (req, res, next) => {
  const { borrowedBooks } = req.user;

  res.status(200).json({
    success: true,
    borrowedBooks,
  });
});

/**
 * ===============================
 * 📌 LẤY TOÀN BỘ DANH SÁCH MƯỢN (ADMIN)
 * ===============================
 */
export const getBorrowedBooksForAdmin = catchAsyncErrors(async (req, res, next) => {
  const borrowedBooks = await Borrow.find();

  res.status(200).json({
    success: true,
    borrowedBooks,
  });
});
