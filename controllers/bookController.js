import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import { Book } from "../models/book.model.js";
import BookCopy from "../models/bookCopy.model.js";

const normalizeIsbn = (isbn) =>
  String(isbn || "")
    .trim()
    .replace(/[-\s]/g, "")
    .toUpperCase();

const recomputeBookCounts = async (bookId) => {
  const [total, available] = await Promise.all([
    BookCopy.countDocuments({ bookId }),
    BookCopy.countDocuments({ bookId, status: "available" }),
  ]);

  const quantity = available;
  const totalCopies = total;
  const availability = quantity > 0;

  await Book.findByIdAndUpdate(bookId, { quantity, totalCopies, availability });
};

// ✅ Sinh copyCode theo format: <TAIL>-<0001>
// (TAIL = 6 ký tự cuối ISBN hoặc _id)
const buildCopyCode = (book, copyNumber) => {
  const tail = String(book.isbn || book._id).replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `${tail}-${String(copyNumber).padStart(4, "0")}`; // 0001, 0002...
};

// ✅ GET /api/v1/book/isbn/:isbn
export const getBookByIsbn = catchAsyncErrors(async (req, res, next) => {
  const isbn = normalizeIsbn(req.params.isbn);
  if (!isbn) return next(new ErrorHandler("Thiếu ISBN.", 400));

  const book = await Book.findOne({ isbn });
  res.status(200).json({
    success: true,
    exists: !!book,
    book: book || null,
  });
});

// ✅ POST /api/v1/book/admin/add
// body JSON: { isbn, title, author, description, price, quantity, shelfLocation }
export const addBookAndCopies = catchAsyncErrors(async (req, res, next) => {
  const {
    isbn,
    title,
    author,
    description = "",
    price = 0,
    quantity = 1,
  } = req.body;

  const normalizedIsbn = isbn ? normalizeIsbn(isbn) : "";

  // 1) ISBN có -> tìm Book
  let book = null;
  if (normalizedIsbn) {
    book = await Book.findOne({ isbn: normalizedIsbn });
  }
  const existedBefore = !!book;

  // 2) ISBN chưa có -> tạo Book mới
  if (!book) {
    if (!title || !author) {
      return next(
        new ErrorHandler(
          "ISBN chưa có trong DB nên cần nhập tối thiểu: title + author.",
          400
        )
      );
    }

    book = await Book.create({
      title: String(title).trim(),
      author: String(author).trim(),
      description: String(description || "").trim(),
      isbn: normalizedIsbn || undefined,
      price: Number(price) || 0,

      quantity: 0,
      totalCopies: 0,
      availability: false,
      holdCount: 0,
    });
  } else {
    // ✅ Nếu ISBN đã có, cho phép cập nhật price/description nếu bạn muốn
    // (bạn có thể bỏ phần này nếu không muốn overwrite)
    if (typeof price !== "undefined") book.price = Number(price) || book.price;
    if (typeof description !== "undefined") book.description = String(description || "").trim();
    await book.save();
  }

  // 3) Tạo N BookCopy với copyNumber tăng dần theo bookId
  const count = Math.max(parseInt(quantity, 10) || 1, 1);

  const last = await BookCopy.findOne({ bookId: book._id })
    .sort({ copyNumber: -1 })
    .select("copyNumber");

  let startNumber = (last?.copyNumber || 0) + 1;

  // Tạo mảng docs để insertMany (nhanh + ít lỗi “nửa chừng”)
  const docs = [];
  for (let i = 0; i < count; i++) {
    const copyNumber = startNumber + i;
    docs.push({
      bookId: book._id,
      copyNumber,
      copyCode: buildCopyCode(book, copyNumber),
      status: "available",
      acquiredAt: new Date(),
      price: Number(book.price) || 0,
      notes: "",
      currentBorrowId: null,
    });
  }

  let inserted = [];
  try {
    inserted = await BookCopy.insertMany(docs, { ordered: true });
  } catch (err) {
    // Nếu trùng key (hiếm, do concurrency), thử “nhảy số” và tạo lại 1 lần
    if (err?.code === 11000) {
      const lastAgain = await BookCopy.findOne({ bookId: book._id })
        .sort({ copyNumber: -1 })
        .select("copyNumber");

      startNumber = (lastAgain?.copyNumber || 0) + 1;

      const docs2 = [];
      for (let i = 0; i < count; i++) {
        const copyNumber = startNumber + i;
        docs2.push({
          bookId: book._id,
          copyNumber,
          copyCode: buildCopyCode(book, copyNumber),
          status: "available",
          acquiredAt: new Date(),
          price: Number(book.price) || 0,
          notes: "",
          currentBorrowId: null,
        });
      }

      inserted = await BookCopy.insertMany(docs2, { ordered: true });
    } else {
      // ❌ Lỗi khác: báo rõ để không bị “book tạo nhưng copy không có”
      return next(new ErrorHandler(err?.message || "Tạo BookCopy thất bại.", 500));
    }
  }

  // 4) cập nhật counts => Book.quantity sẽ đúng theo available copies
  await recomputeBookCounts(book._id);

  const latestBook = await Book.findById(book._id);

  res.status(201).json({
    success: true,
    message: existedBefore
      ? "ISBN đã tồn tại → đã thêm bản sao (BookCopy) và cập nhật số lượng."
      : "ISBN chưa có → đã tạo đầu sách và thêm bản sao (BookCopy).",
    book: latestBook,
    createdCopiesCount: inserted.length,
  });
});

// ===== GIỮ API LIST/DELETE CHO UI =====
export const getAllBooks = catchAsyncErrors(async (req, res, next) => {
  const {
    search,
    availability,
    minPrice,
    maxPrice,
    sort = "newest",
    page = 1,
    limit,
  } = req.query;

  const filters = {};

  if (search) {
    const keyword = String(search).trim();
    if (keyword) {
      const regex = new RegExp(keyword, "i");
      filters.$or = [{ title: regex }, { author: regex }, { isbn: regex }];
    }
  }

  if (availability === "true" || availability === "false") {
    filters.availability = availability === "true";
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    filters.price = {};
    if (minPrice !== undefined && minPrice !== "") filters.price.$gte = Number(minPrice);
    if (maxPrice !== undefined && maxPrice !== "") filters.price.$lte = Number(maxPrice);
  }

  const sortOptions = {
    newest: { createdAt: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    quantity_asc: { quantity: 1 },
    quantity_desc: { quantity: -1 },
  };
  const sortBy = sortOptions[sort] || sortOptions.newest;

  const totalBooks = await Book.countDocuments(filters);
  const pageNumber = Math.max(Number(page) || 1, 1);
  const limitNumber = limit ? Math.max(Number(limit), 1) : 0;
  const totalPages = limitNumber ? Math.max(Math.ceil(totalBooks / limitNumber), 1) : 1;
  const currentPage = limitNumber ? Math.min(pageNumber, totalPages) : 1;

  let query = Book.find(filters).sort(sortBy);
  if (limitNumber) {
    const skip = (currentPage - 1) * limitNumber;
    query = query.skip(skip).limit(limitNumber);
  }

  const books = await query;

  res.status(200).json({
    success: true,
    books,
    totalBooks,
    page: currentPage,
    limit: limitNumber || totalBooks,
    totalPages,
  });
});

export const deleteBook = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const book = await Book.findById(id);
  if (!book) return next(new ErrorHandler("Book not found.", 404));

  await BookCopy.deleteMany({ bookId: id });
  await book.deleteOne();

  res.status(200).json({ success: true, message: "Book deleted successfully." });
});
