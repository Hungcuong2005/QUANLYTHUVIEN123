import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import { Book } from "../models/book.model.js";
import BookCopy from "../models/bookCopy.model.js";

// ✅ NEW: Category để validate & populate
import { Category } from "../models/category.model.js";

const MAX_CATEGORIES = 3;

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

const getBookCopyCounts = async (bookId) => {
  const [total, available] = await Promise.all([
    BookCopy.countDocuments({ bookId }),
    BookCopy.countDocuments({ bookId, status: "available" }),
  ]);
  return { total, available };
};

// ✅ Sinh copyCode theo format: <ISBN_NORMALIZED>-<0001> (mở rộng, tránh trùng)
// - Nếu có ISBN: dùng FULL ISBN đã normalize (không cắt 6 ký tự cuối)
// - Nếu không có ISBN: fallback theo _id (đuôi 12 ký tự)
const buildCopyCode = (book, copyNumber) => {
  const isbnNorm = String(book.isbn || "")
    .trim()
    .replace(/[-\s]/g, "")
    .toUpperCase();

  if (isbnNorm) {
    return `${isbnNorm}-${String(copyNumber).padStart(4, "0")}`;
  }

  const idTail = String(book._id)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-12)
    .toUpperCase();

  return `${idTail}-${String(copyNumber).padStart(4, "0")}`;
};

// ✅ NEW: normalize categories from body (max 3) + validate exist
const normalizeAndValidateCategoryIds = async (categories, next) => {
  let arr = Array.isArray(categories) ? categories : [];
  arr = arr
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  // unique + max 3
  arr = Array.from(new Set(arr)).slice(0, MAX_CATEGORIES);

  if (arr.length === 0) return [];

  // validate tồn tại
  const found = await Category.find({ _id: { $in: arr } }).select("_id");
  if (found.length !== arr.length) {
    return next(new ErrorHandler("Có thể loại không tồn tại.", 400));
  }

  return arr;
};

// ✅ GET /api/v1/book/isbn/:isbn
export const getBookByIsbn = catchAsyncErrors(async (req, res, next) => {
  const isbn = normalizeIsbn(req.params.isbn);
  if (!isbn) return next(new ErrorHandler("Thiếu ISBN.", 400));

  // ✅ populate để frontend nhận categories: [{_id,name}]
  const book = await Book.findOne({ isbn }).populate("categories", "name");

  res.status(200).json({
    success: true,
    exists: !!book,
    book: book || null,
  });
});

// ✅ GET /api/v1/book/:id/available-copies - LẤY DANH SÁCH BOOKCOPY CÓ SẴN
export const getAvailableCopies = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const book = await Book.findById(id);
  if (!book) {
    return next(new ErrorHandler("Không tìm thấy sách.", 404));
  }

  const copies = await BookCopy.find({
    bookId: id,
    status: "available",
  })
    .sort({ copyNumber: 1 })
    .select("_id copyCode copyNumber status notes price");

  res.status(200).json({
    success: true,
    copies,
    total: copies.length,
    bookTitle: book.title,
  });
});

// ✅ POST /api/v1/book/admin/add
export const addBookAndCopies = catchAsyncErrors(async (req, res, next) => {
  const startedAt = Date.now();
  const reqId =
    (req.headers["x-request-id"] || "").toString() ||
    `addBook-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const log = (...args) => console.log(`[${reqId}]`, ...args);
  const logErr = (...args) => console.error(`[${reqId}]`, ...args);

  // ✅ log input (đừng log token/pass)
  log("➡️ HIT addBookAndCopies");
  log("req.body =", {
    isbn: req.body?.isbn,
    title: req.body?.title,
    author: req.body?.author,
    price: req.body?.price,
    quantity: req.body?.quantity,
    categories: req.body?.categories,
  });

  try {
    const {
      isbn,
      title,
      author,
      description = "",
      price = 0,
      quantity = 1,
      categories,
    } = req.body;

    const normalizedIsbn = normalizeIsbn(isbn);
    const finalIsbn = normalizedIsbn ? normalizedIsbn : undefined;

    log("normalizedIsbn =", normalizedIsbn, "finalIsbn =", finalIsbn);

    log("🔎 normalizeAndValidateCategoryIds start", categories);
    const categoryIds = await normalizeAndValidateCategoryIds(categories, next);
    log("✅ categoryIds =", categoryIds);

    if (categoryIds && categoryIds.length > MAX_CATEGORIES) {
      log("❌ too many categories", categoryIds.length);
      return next(
        new ErrorHandler(`Mỗi sách tối đa ${MAX_CATEGORIES} thể loại.`, 400)
      );
    }

    let book = null;
    if (finalIsbn) {
      log("🔎 find book by isbn", finalIsbn);
      book = await Book.findOne({ isbn: finalIsbn });
    }
    const existedBefore = !!book;
    log("book existedBefore =", existedBefore, "bookId =", book?._id);

    if (!book) {
      if (!title || !author) {
        log("❌ missing title/author when isbn not found");
        return next(
          new ErrorHandler(
            "ISBN chưa có trong DB nên cần nhập tối thiểu: title + author.",
            400
          )
        );
      }

      log("🆕 creating new Book...");
      book = await Book.create({
        title: String(title).trim(),
        author: String(author).trim(),
        description: String(description || "").trim(),
        isbn: finalIsbn,
        price: Number(price) || 0,
        categories: categoryIds,
        quantity: 0,
        totalCopies: 0,
        availability: false,
        holdCount: 0,
        isDeleted: false,
        deletedAt: null,
      });
      log("✅ Book created", book._id);
    } else {
      log("✏️ updating existing Book", book._id);

      if (title && String(title).trim()) book.title = String(title).trim();
      if (author && String(author).trim()) book.author = String(author).trim();

      if (typeof price !== "undefined") book.price = Number(price) || book.price;
      if (typeof description !== "undefined")
        book.description = String(description || "").trim();

      if (Array.isArray(categories)) book.categories = categoryIds;

      if (book.isDeleted) {
        book.isDeleted = false;
        book.deletedAt = null;
      }

      await book.save();
      log("✅ Book saved", book._id);
    }

    const count = Math.max(parseInt(quantity, 10) || 1, 1);
    log("count copies to create =", count);

    log("🔎 find last BookCopy copyNumber...");
    const last = await BookCopy.findOne({ bookId: book._id })
      .sort({ copyNumber: -1 })
      .select("copyNumber");
    let startNumber = (last?.copyNumber || 0) + 1;
    log("startNumber =", startNumber);

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

    log("📦 insertMany BookCopy docs.length =", docs.length);
    let inserted = [];
    try {
      inserted = await BookCopy.insertMany(docs, { ordered: true });
      log("✅ insertMany success inserted =", inserted.length);
    } catch (err) {
      logErr("❌ insertMany error:", {
        code: err?.code,
        name: err?.name,
        message: err?.message,
        keyPattern: err?.keyPattern,
        keyValue: err?.keyValue,
      });

      if (err?.code === 11000) {
        log("🔄 duplicate key -> retry with new startNumber");
        const lastAgain = await BookCopy.findOne({ bookId: book._id })
          .sort({ copyNumber: -1 })
          .select("copyNumber");
        startNumber = (lastAgain?.copyNumber || 0) + 1;
        log("startNumber retry =", startNumber);

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
        log("✅ retry insertMany success inserted =", inserted.length);
      } else {
        return next(
          new ErrorHandler(err?.message || "Tạo BookCopy thất bại.", 500)
        );
      }
    }

    log("🔄 recomputeBookCounts start bookId =", book._id);
    await recomputeBookCounts(book._id);
    log("✅ recomputeBookCounts done");

    const latestBook = await Book.findById(book._id).populate(
      "categories",
      "name"
    );
    log("✅ latestBook fetched categories populated");

    log("🎉 DONE in", `${Date.now() - startedAt}ms`);
    return res.status(201).json({
      success: true,
      message: existedBefore
        ? "ISBN đã tồn tại → đã thêm bản sao (BookCopy) và cập nhật số lượng."
        : "ISBN chưa có → đã tạo đầu sách và thêm bản sao (BookCopy).",
      book: latestBook,
      createdCopiesCount: inserted.length,
      reqId, // ✅ để FE gửi mình reqId nếu cần debug
    });
  } catch (e) {
    logErr("🔥 UNCAUGHT ERROR:", {
      message: e?.message,
      name: e?.name,
      stack: e?.stack,
    });
    return next(new ErrorHandler(e?.message || "Lỗi server.", 500));
  }
});


// ✅ GET /api/v1/book/all
// ✅ NEW: query.deleted = "active" | "deleted" | "all"  (default: active)
export const getAllBooks = catchAsyncErrors(async (req, res, next) => {
  const {
    search,
    availability,
    minPrice,
    maxPrice,
    sort = "newest",
    page = 1,
    limit,
    categoryId,

    // ✅ NEW
    deleted = "active",
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
    if (minPrice !== undefined && minPrice !== "")
      filters.price.$gte = Number(minPrice);
    if (maxPrice !== undefined && maxPrice !== "")
      filters.price.$lte = Number(maxPrice);
  }

  if (categoryId) {
    filters.categories = categoryId;
  }

  // ✅ NEW: lọc theo soft delete
  if (deleted === "active") filters.isDeleted = false;
  if (deleted === "deleted") filters.isDeleted = true;
  // deleted === "all" -> không set filters.isDeleted

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
  const totalPages = limitNumber
    ? Math.max(Math.ceil(totalBooks / limitNumber), 1)
    : 1;
  const currentPage = limitNumber ? Math.min(pageNumber, totalPages) : 1;

  let query = Book.find(filters).sort(sortBy);

  if (limitNumber) {
    const skip = (currentPage - 1) * limitNumber;
    query = query.skip(skip).limit(limitNumber);
  }

  const books = await query.populate("categories", "name");

  res.status(200).json({
    success: true,
    books,
    totalBooks,
    page: currentPage,
    limit: limitNumber || totalBooks,
    totalPages,
  });
});

// ✅ PATCH /api/v1/book/:id/soft-delete
export const softDeleteBook = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const book = await Book.findById(id);
  if (!book) return next(new ErrorHandler("Book not found.", 404));

  if (book.isDeleted) {
    return res.status(200).json({
      success: true,
      message: "Sách đã ở trạng thái 'đã xóa' từ trước.",
      book,
    });
  }

  // ✅ CHECK: quantity (available) phải == totalCopies
  const { total, available } = await getBookCopyCounts(id);

  if (available !== total) {
    return next(
      new ErrorHandler(
        "Không thể xóa: Số lượng còn lại phải bằng tổng bản sao (tất cả bản sao phải ở trạng thái available).",
        400
      )
    );
  }

  // cập nhật lại số đếm cho chắc
  await recomputeBookCounts(id);

  book.isDeleted = true;
  book.deletedAt = new Date();
  await book.save();

  res.status(200).json({
    success: true,
    message: "Đã xóa (soft delete) sách thành công.",
    book,
  });
});

// ✅ PATCH /api/v1/book/:id/restore
export const restoreBook = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const book = await Book.findById(id);
  if (!book) return next(new ErrorHandler("Book not found.", 404));

  if (!book.isDeleted) {
    return res.status(200).json({
      success: true,
      message: "Sách đang hoạt động (chưa bị xóa).",
      book,
    });
  }

  book.isDeleted = false;
  book.deletedAt = null;
  await book.save();

  // cập nhật số đếm
  await recomputeBookCounts(id);

  res.status(200).json({
    success: true,
    message: "Khôi phục sách thành công.",
    book,
  });
});

// 🔥 PUT /api/v1/book/admin/:id/cover - ĐÃ THÊM LOG CHI TIẾT
// Multer + Cloudinary middleware: uploadBookImage.single("coverImage")
// -> req.file.path là URL Cloudinary
// ✅ PUT /api/v1/book/admin/:id/cover
// Multer + Cloudinary middleware: uploadBookImage.single("coverImage")
// -> req.file.path là URL Cloudinary
export const updateBookCover = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const book = await Book.findById(id);
  if (!book) {
    return next(new ErrorHandler("Không tìm thấy sách.", 404));
  }

  const url = req.file?.path;
  if (!url) {
    return next(new ErrorHandler("Vui lòng chọn ảnh bìa (coverImage).", 400));
  }

  book.coverImage = url;
  await book.save();

  return res.status(200).json({
    success: true,
    message: "Cập nhật ảnh bìa thành công.",
    book,
  });
});

// ✅ GIỮ ROUTE CŨ /delete/:id nhưng đổi thành soft delete để không vỡ FE cũ
export const deleteBook = softDeleteBook;