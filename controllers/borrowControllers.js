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

/**
 * ===============================
 * 📌 GHI NHẬN VIỆC MƯỢN SÁCH
 * ===============================
 * - Kiểm tra sách tồn tại
 * - Kiểm tra người dùng hợp lệ
 * - Kiểm tra sách còn số lượng
 * - Không cho mượn trùng
 * - Cập nhật số lượng sách
 * - Lưu thông tin mượn sách
 */
export const recordBorrowedBook = catchAsyncErrors(async (req, res, next) => {
    const { id } = req.params;      // ID sách
    const { email } = req.body;     // Email người dùng

    // Tìm sách theo ID
    const book = await Book.findById(id);
    if (!book) {
        return next(new ErrorHandler("Không tìm thấy sách.", 404));
    }

    // Tìm người dùng đã xác thực tài khoản
    const user = await User.findOne({ email, accountVerified: true });
    if (!user) {
        return next(new ErrorHandler("Không tìm thấy người dùng.", 404));
    }

    // Kiểm tra số lượng sách còn không
    if (book.quantity === 0) {
        return next(new ErrorHandler("Sách đã hết.", 400));
    }

    // Kiểm tra người dùng đã mượn sách này chưa (chưa trả)
    const isAlreadyBorrowed = user.borrowedBooks.find(
        (b) => b.bookId.toString() === id && b.returned === false
    );
    if (isAlreadyBorrowed) {
        return next(new ErrorHandler("Bạn đã mượn sách này rồi.", 400));
    }

    // Giảm số lượng sách đi 1
    book.quantity -= 1;
    book.availability = book.quantity > 0;
    await book.save();

    // Thêm thông tin sách vào danh sách mượn của user
    user.borrowedBooks.push({
        bookId: book._id,
        bookTitle: book.title,
        borrowedDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // hạn trả: 7 ngày
    });
    await user.save();

    // Tạo bản ghi mượn sách
    await Borrow.create({
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
        },
        book: book._id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        price: book.price,
    });

    res.status(200).json({
        success: true,
        message: "Ghi nhận mượn sách thành công.",
    });
});

/**
 * ===============================
 * 📌 TRẢ SÁCH
 * ===============================
 * - Kiểm tra sách & người dùng
 * - Kiểm tra người dùng có mượn sách không
 * - Cập nhật trạng thái trả
 * - Tăng lại số lượng sách
 * - Tính tiền phạt nếu trả trễ
 */
export const returnBorrowBook = catchAsyncErrors(async (req, res, next) => {
    const { bookId } = req.params;  // ID sách
    const { email } = req.body;     // Email người dùng

    // Tìm sách
    const book = await Book.findById(bookId);
    if (!book) {
        return next(new ErrorHandler("Không tìm thấy sách.", 404));
    }

    // Tìm người dùng
    const user = await User.findOne({ email, accountVerified: true });
    if (!user) {
        return next(new ErrorHandler("Không tìm thấy người dùng.", 404));
    }

    // Tìm sách chưa trả trong danh sách mượn
    const borrowedBook = user.borrowedBooks.find(
        (b) => b.bookId.toString() === bookId && b.returned === false
    );
    if (!borrowedBook) {
        return next(new ErrorHandler("Bạn chưa mượn sách này.", 400));
    }

    // Đánh dấu đã trả
    borrowedBook.returned = true;
    await user.save();

    // Tăng số lượng sách lên lại
    book.quantity += 1;
    book.availability = book.quantity > 0;
    await book.save();

    // Tìm bản ghi mượn trong bảng Borrow
    const borrow = await Borrow.findOne({
        book: bookId,
        "user.email": email,
        returnDate: null,
    });
    if (!borrow) {
        return next(new ErrorHandler("Không tìm thấy thông tin mượn sách.", 400));
    }

    // Cập nhật ngày trả
    borrow.returnDate = new Date();

    // Tính tiền phạt
    const fine = calculateFine(borrow.dueDate);
    borrow.fine = fine;
    await borrow.save();

    res.status(200).json({
        success: true,
        message:
            fine !== 0
                ? `Trả sách thành công. Tổng tiền (bao gồm phạt) là $${fine + book.price}`
                : `Trả sách thành công. Tổng tiền là $${book.price}`,
    });
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
