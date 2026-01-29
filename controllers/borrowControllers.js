import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import { Borrow } from "../models/borrow.model.js";
import { Book } from "../models/book.model.js";
import BookCopy from "../models/bookCopy.model.js";
import { User } from "../models/user.model.js";
import { calculateFine } from "../utils/fineCalculator.js";
import crypto from "crypto";

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
    throw new Error(
      "Thiếu ENV cấu hình VNPAY (VNP_TMN_CODE/VNP_HASH_SECRET/VNP_URL/VNP_RETURN_URL)."
    );
  }

  const date = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const vnp_CreateDate =
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds());

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

  const signData = new URLSearchParams(vnp_Params).toString();
  const hmac = crypto.createHmac("sha512", secretKey);
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
  vnp_Params.vnp_SecureHash = signed;

  const paymentUrl = `${vnpUrl}?${new URLSearchParams(vnp_Params).toString()}`;
  return paymentUrl;
};

const BORROW_DAYS = 7;
const RENEW_DAYS = 7;
const MAX_RENEWALS = 2;

const finalizeReturnAfterPaid = async ({ borrowId }) => {
  const borrow = await Borrow.findById(borrowId);
  if (!borrow) throw new ErrorHandler("Không tìm thấy thông tin mượn sách.", 404);

  if (borrow.returnDate) return borrow;

  const user = await User.findById(borrow.user.id);
  if (!user) throw new ErrorHandler("Không tìm thấy người dùng.", 404);

  if (!borrow.book) {
    const bc = await BookCopy.findById(borrow.bookCopy);
    if (!bc) throw new ErrorHandler("Không tìm thấy BookCopy.", 404);
    borrow.book = bc.bookId;
    await borrow.save();
  }

  const book = await Book.findById(borrow.book);
  if (!book) throw new ErrorHandler("Không tìm thấy sách.", 404);

  const bookCopy = await BookCopy.findById(borrow.bookCopy);
  if (!bookCopy) throw new ErrorHandler("Không tìm thấy BookCopy.", 404);

  borrow.returnDate = new Date();
  await borrow.save();

  const item = user.borrowedBooks?.find(
    (b) => b.borrowId && b.borrowId.toString() === borrow._id.toString()
  );
  if (item) item.returned = true;
  await user.save();

  const updated = await BookCopy.findOneAndUpdate(
    { _id: bookCopy._id, currentBorrowId: borrow._id },
    { $set: { status: "available", currentBorrowId: null } },
    { new: true }
  );
  if (!updated) {
    throw new ErrorHandler("Trạng thái BookCopy không hợp lệ để trả.", 400);
  }

  book.quantity = (book.quantity || 0) + 1;
  book.availability = book.quantity > 0;
  await book.save();

  return borrow;
};

/**
 * ===============================
 * 📌 GHI NHẬN VIỆC MƯỢN SÁCH - CẬP NHẬT ĐỂ NHẬN copyId
 * ===============================
 */
export const recordBorrowedBook = catchAsyncErrors(async (req, res, next) => {
  console.log("\n=== 📋 recordBorrowedBook START ===");
  console.log("📋 req.params:", req.params);
  console.log("📋 req.body:", req.body);
  
  const { id: bookId } = req.params;
  const { email, copyId } = req.body; // ✅ NHẬN copyId TỪ FRONTEND

  console.log("📗 Step 1: Finding book with ID:", bookId);
  const book = await Book.findById(bookId);
  console.log("📗 Book found:", book ? `YES - ${book.title}` : "NO");
  
  if (!book) {
    console.log("❌ Book not found!");
    return next(new ErrorHandler("Không tìm thấy sách.", 404));
  }

  console.log("👤 Step 2: Finding user with email:", email);
  const user = await User.findOne({ email, accountVerified: true });
  console.log("👤 User found:", user ? `YES - ${user.name}` : "NO");
  
  if (!user) {
    console.log("❌ User not found!");
    return next(new ErrorHandler("Không tìm thấy người dùng.", 404));
  }

  console.log("📖 Step 3: Checking if user already borrowed this book");
  const isAlreadyBorrowedSameTitle = user.borrowedBooks?.some(
    (b) => b.bookTitle === book.title && b.returned === false
  );
  console.log("📖 Already borrowed:", isAlreadyBorrowedSameTitle);
  
  if (isAlreadyBorrowedSameTitle) {
    console.log("❌ User already borrowed this book!");
    return next(new ErrorHandler("Bạn đã mượn sách này rồi.", 400));
  }

  // ✅ STEP 4: KIỂM TRA VÀ KHÓA BOOKCOPY CỤ THỂ
  console.log("📚 Step 4: Locking specific BookCopy with copyId:", copyId);
  
  let lockedCopy;
  
  if (copyId) {
    // ✅ Nếu có copyId từ frontend → khóa cuốn cụ thể
    lockedCopy = await BookCopy.findOneAndUpdate(
      { _id: copyId, bookId: book._id, status: "available" },
      { $set: { status: "borrowed" } },
      { new: true }
    );
    
    if (!lockedCopy) {
      console.log("❌ Specific copy not available or not found!");
      return next(new ErrorHandler("Cuốn sách này không còn khả dụng.", 400));
    }
  } else {
    // ✅ Nếu không có copyId → tìm cuốn available bất kỳ (logic cũ)
    lockedCopy = await BookCopy.findOneAndUpdate(
      { bookId: book._id, status: "available" },
      { $set: { status: "borrowed" } },
      { new: true }
    );
    
    if (!lockedCopy) {
      console.log("❌ No available copy!");
      return next(new ErrorHandler("Sách đã hết (không còn cuốn available).", 400));
    }
  }

  console.log("📚 Locked copy:", lockedCopy ? `YES - ${lockedCopy.copyCode}` : "NO");

  const dueDate = new Date(Date.now() + BORROW_DAYS * 24 * 60 * 60 * 1000);
  console.log("📅 Due date:", dueDate);

  console.log("💾 Step 5: Creating Borrow record");
  const borrow = await Borrow.create({
    user: { id: user._id, name: user.name, email: user.email },
    book: book._id,
    bookCopy: lockedCopy._id,
    dueDate,
    price: book.price,
    renewCount: 0,
    lastRenewedAt: null,
    payment: {
      method: "cash",
      status: "unpaid",
      amount: 0,
    },
  });
  console.log("💾 Borrow created:", borrow._id);

  console.log("🔗 Step 6: Updating BookCopy with currentBorrowId");
  await BookCopy.findByIdAndUpdate(
    lockedCopy._id,
    { $set: { currentBorrowId: borrow._id } },
    { new: true, runValidators: false }
  );
  console.log("✅ BookCopy updated successfully");

  console.log("📖 Step 7: Updating Book quantity");
  book.quantity = Math.max((book.quantity || 0) - 1, 0);
  book.availability = book.quantity > 0;
  await book.save();
  console.log("📖 Book quantity updated to:", book.quantity);

  console.log("👤 Step 8: Updating User borrowedBooks");
  user.borrowedBooks.push({
    borrowId: borrow._id,
    returned: false,
    bookTitle: book.title,
    borrowedDate: new Date(),
    dueDate,
    renewCount: 0,
    lastRenewedAt: null,
  });
  await user.save();
  console.log("👤 User borrowedBooks updated");

  console.log("✅ recordBorrowedBook SUCCESS\n");
  
  return res.status(200).json({
    success: true,
    message: "Ghi nhận mượn sách thành công (theo BookCopy).",
    borrow,
    bookCopyCode: lockedCopy.copyCode,
  });
});

export const renewBorrowedBook = catchAsyncErrors(async (req, res, next) => {
  const { borrowId } = req.params;
  const user = req.user;

  const borrow = await Borrow.findOne({
    _id: borrowId,
    "user.id": user._id,
    returnDate: null,
  });

  if (!borrow) return next(new ErrorHandler("Không tìm thấy lượt mượn.", 404));

  const dueDate = borrow.dueDate ? new Date(borrow.dueDate) : null;
  if (dueDate && dueDate <= new Date()) {
    return next(new ErrorHandler("Sách đã quá hạn, không thể gia hạn.", 400));
  }

  const renewCount = borrow.renewCount || 0;
  if (renewCount >= MAX_RENEWALS) {
    return next(
      new ErrorHandler(
        `Bạn đã gia hạn ${renewCount} lần. Không được gia hạn thêm.`,
        400
      )
    );
  }

  const newDueDate = dueDate
    ? new Date(dueDate.getTime() + RENEW_DAYS * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + RENEW_DAYS * 24 * 60 * 60 * 1000);

  borrow.dueDate = newDueDate;
  borrow.renewCount = renewCount + 1;
  borrow.lastRenewedAt = new Date();
  await borrow.save();

  const item = user.borrowedBooks?.find(
    (b) => b.borrowId && b.borrowId.toString() === borrow._id.toString()
  );
  if (item) {
    item.dueDate = newDueDate;
    item.renewCount = borrow.renewCount;
    item.lastRenewedAt = borrow.lastRenewedAt;
    await user.save();
  }

  res.status(200).json({
    success: true,
    message: "Gia hạn mượn sách thành công.",
    dueDate: newDueDate,
    renewCount: borrow.renewCount,
    maxRenewals: MAX_RENEWALS,
  });
});

export const prepareReturnPayment = catchAsyncErrors(async (req, res, next) => {
  const anyId = req.params.borrowId || req.params.bookId;
  const { email, method } = req.body;

  if (!email) return next(new ErrorHandler("Thiếu email.", 400));
  if (!method) return next(new ErrorHandler("Thiếu phương thức thanh toán.", 400));

  let borrow = await Borrow.findOne({
    _id: anyId,
    "user.email": email,
    returnDate: null,
  });

  if (!borrow) {
    borrow = await Borrow.findOne({
      book: anyId,
      "user.email": email,
      returnDate: null,
    });
  }

  if (!borrow) return next(new ErrorHandler("Không tìm thấy thông tin mượn sách.", 400));

  if (!borrow.book) {
    const bc = await BookCopy.findById(borrow.bookCopy);
    if (!bc) return next(new ErrorHandler("Không tìm thấy BookCopy.", 404));
    borrow.book = bc.bookId;
    await borrow.save();
  }

  const book = await Book.findById(borrow.book);
  if (!book) return next(new ErrorHandler("Không tìm thấy sách.", 404));

  const fine = calculateFine(borrow.dueDate);
  const total = (borrow.price || book.price || 0) + (fine || 0);

  borrow.fine = fine;
  borrow.payment = {
    ...borrow.payment,
    method,
    amount: total,
    status: "pending",
  };
  await borrow.save();

  if (method === "cash") {
    return res.status(200).json({
      success: true,
      method,
      amount: total,
      message: "Đã tạo yêu cầu thanh toán tiền mặt. Vui lòng thu tiền và xác nhận.",
      borrowId: borrow._id,
    });
  }

  if (method === "vnpay") {
    const txnRef = `BORROW_${borrow._id.toString()}_${Date.now()}`;
    const ipAddr =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "127.0.0.1";

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
      borrowId: borrow._id,
    });
  }

  return next(new ErrorHandler("ZaloPay chưa được tích hợp trong bản sửa này.", 400));
});

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

  if (signed !== secureHash) {
    return res.redirect(`${appBaseUrl}/payment-result?status=failed&reason=invalid_signature`);
  }

  const responseCode = vnp_Params.vnp_ResponseCode;
  const txnRef = vnp_Params.vnp_TxnRef;

  const borrow = await Borrow.findOne({ "payment.transactionId": txnRef });
  if (!borrow) {
    return res.redirect(`${appBaseUrl}/payment-result?status=failed&reason=borrow_not_found`);
  }

  if (responseCode !== "00") {
    borrow.payment.status = "failed";
    await borrow.save();
    return res.redirect(`${appBaseUrl}/payment-result?status=failed&reason=vnpay_${responseCode}`);
  }

  borrow.payment.status = "paid";
  borrow.payment.paidAt = new Date();
  await borrow.save();

  try {
    await finalizeReturnAfterPaid({ borrowId: borrow._id.toString() });
  } catch (e) {
    return res.redirect(`${appBaseUrl}/payment-result?status=paid_but_finalize_failed`);
  }

  return res.redirect(`${appBaseUrl}/payment-result?status=success`);
});

export const confirmCashPaymentAndReturn = catchAsyncErrors(async (req, res, next) => {
  const anyId = req.params.borrowId || req.params.bookId;
  const { email } = req.body;

  let borrow = await Borrow.findOne({
    _id: anyId,
    "user.email": email,
    returnDate: null,
  });

  if (!borrow) {
    borrow = await Borrow.findOne({
      book: anyId,
      "user.email": email,
      returnDate: null,
    });
  }

  if (!borrow) return next(new ErrorHandler("Không tìm thấy thông tin mượn sách.", 400));

  if (borrow.payment?.method !== "cash") {
    return next(new ErrorHandler("Đơn này không phải thanh toán tiền mặt.", 400));
  }

  borrow.payment.status = "paid";
  borrow.payment.paidAt = new Date();
  await borrow.save();

  await finalizeReturnAfterPaid({ borrowId: borrow._id.toString() });

  res.status(200).json({
    success: true,
    message: "Đã xác nhận thanh toán tiền mặt và hoàn tất trả sách.",
  });
});

export const returnBorrowBook = catchAsyncErrors(async (req, res, next) => {
  return next(
    new ErrorHandler(
      "Luồng trả sách đã đổi: hãy gọi API /borrow/return/prepare/:bookId để thanh toán trước.",
      400
    )
  );
});

export const borrowedBooks = catchAsyncErrors(async (req, res, next) => {
  const { borrowedBooks } = req.user;

  res.status(200).json({
    success: true,
    borrowedBooks,
  });
});

export const getBorrowedBooksForAdmin = catchAsyncErrors(async (req, res, next) => {
  const borrowedBooks = await Borrow.find()
    .populate("book", "title author")
    .populate("bookCopy", "copyCode status");

  res.status(200).json({
    success: true,
    borrowedBooks,
  });
});