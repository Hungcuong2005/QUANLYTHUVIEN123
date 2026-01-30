import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import { Book } from "../models/book.model.js";
import BookCopy from "../models/bookCopy.model.js";
import { Category } from "../models/category.model.js";
import { uploadBufferToCloudinary } from "../utils/cloudinaryUpload.js";

// Giới hạn tối đa số thể loại cho 1 cuốn sách
const MAX_CATEGORIES = 3;

// ==========================================
// HÀM CÔNG CỤ (HELPER FUNCTIONS)
// ==========================================

/**
 * Chuẩn hóa ISBN: Xóa dấu gạch ngang, khoảng trắng, chuyển về chữ hoa.
 */
const normalizeIsbn = (isbn) =>
  String(isbn || "")
    .trim()
    .replace(/[-\s]/g, "")
    .toUpperCase();

/**
 * Tính toán lại số lượng sách (Quantity, TotalCopies, Availability)
 * Dựa trên số liệu thực tế từ bảng BookCopy.
 */
const recomputeBookCounts = async (bookId) => {
  const [total, available] = await Promise.all([
    BookCopy.countDocuments({ bookId }), // Tổng số bản sao
    BookCopy.countDocuments({ bookId, status: "available" }), // Số bản sao có sẵn
  ]);

  const quantity = available;
  // totalCopies = total; // Biến này có thể dùng để lưu tổng số bản nhập về
  const totalCopies = total;
  const availability = quantity > 0;

  // Cập nhật vào Book chính
  await Book.findByIdAndUpdate(bookId, { quantity, totalCopies, availability });
};

/**
 * Lấy số lượng bản sao hiện tại (Tổng và Available)
 */
const getBookCopyCounts = async (bookId) => {
  const [total, available] = await Promise.all([
    BookCopy.countDocuments({ bookId }),
    BookCopy.countDocuments({ bookId, status: "available" }),
  ]);
  return { total, available };
};

/**
 * Tạo mã copyCode (Mã cá biệt cho từng cuốn sách)
 * Format: <ISBN> - <Số thứ tự 4 chữ số>
 * Ví dụ: 9781234567890-0001
 * Nếu không có ISBN -> Dùng 12 ký tự cuối của Book ID.
 */
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

/**
 * Chuẩn hóa và Validate danh sách thể loại (Category IDs)
 * - Tối đa 3 thể loại
 * - Loại bỏ trùng lặp
 * - Kiểm tra xem ID có tồn tại trong DB không
 */
const normalizeAndValidateCategoryIds = async (categories, next) => {
  let arr = Array.isArray(categories) ? categories : [];
  arr = arr
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  // Loại bỏ trùng và cắt lấy tối đa MAX_CATEGORIES
  arr = Array.from(new Set(arr)).slice(0, MAX_CATEGORIES);

  if (arr.length === 0) return [];

  // Kiểm tra tồn tại trong DB
  const found = await Category.find({ _id: { $in: arr } }).select("_id");
  if (found.length !== arr.length) {
    return next(new ErrorHandler("Có thể loại không tồn tại.", 400));
  }

  return arr;
};

// ==========================================
// CONTROLLER HANDLERS
// ==========================================

/**
 * GET /api/v1/book/isbn/:isbn
 * Kiểm tra sách có tồn tại không qua ISBN
 */
export const getBookByIsbn = catchAsyncErrors(async (req, res, next) => {
  const isbn = normalizeIsbn(req.params.isbn);
  if (!isbn) return next(new ErrorHandler("Thiếu ISBN.", 400));

  const book = await Book.findOne({ isbn }).populate("categories", "name");

  res.status(200).json({
    success: true,
    exists: !!book,
    book: book || null,
  });
});

/**
 * GET /api/v1/book/:id/available-copies
 * Lấy danh sách các bản sao có sẵn (Status = "available")
 */
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

/**
 * POST /api/v1/book/admin/add
 * Thêm sách mới HOẶC Thêm bản sao cho sách cũ (nếu trùng ISBN)
 * Logic phức tạp:
 * 1. Chuẩn hóa ISBN, Categories.
 * 2. Tìm xem sách đã có chưa (theo ISBN).
 *    - Chưa có: Tạo Book mới.
 *    - Đã có: Cập nhật thông tin Book cũ (nếu có thay đổi) và dùng ID đó.
 * 3. Tạo các bản sao (BookCopy) theo số lượng yêu cầu (quantity).
 *    - Sinh mã copyCode tự động.
 *    - Xử lý trùng lặp (nếu insertMany bị lỗi duplicate key).
 * 4. Gọi hàm tính toán lại số lượng (recomputeBookCounts).
 */
export const addBookAndCopies = catchAsyncErrors(async (req, res, next) => {
  const startedAt = Date.now();
  // Tạo Request ID để log (phục vụ debug)
  const reqId =
    (req.headers["x-request-id"] || "").toString() ||
    `addBook-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const log = (...args) => console.log(`[${reqId}]`, ...args);
  const logErr = (...args) => console.error(`[${reqId}]`, ...args);

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

    // --- BƯỚC 1: Xử lý và Validate Categories ---
    log("🔎 normalizeAndValidateCategoryIds start", categories);
    const categoryIds = await normalizeAndValidateCategoryIds(categories, next);
    log("✅ categoryIds =", categoryIds);

    if (categoryIds && categoryIds.length > MAX_CATEGORIES) {
      return next(
        new ErrorHandler(`Mỗi sách tối đa ${MAX_CATEGORIES} thể loại.`, 400)
      );
    }

    // --- BƯỚC 2: Tìm hoặc Tạo Book ---
    let book = null;
    if (finalIsbn) {
      log("🔎 find book by isbn", finalIsbn);
      book = await Book.findOne({ isbn: finalIsbn });
    }
    const existedBefore = !!book;
    log("book existedBefore =", existedBefore, "bookId =", book?._id);

    if (!book) {
      // Nếu chưa có sách -> Bắt buộc phải có title và author
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
        availability: false, // Sẽ update sau khi thêm BookCopy
        holdCount: 0,
        isDeleted: false,
        deletedAt: null,
      });
      log("✅ Book created", book._id);
    } else {
      // Nếu đã có sách -> Update thông tin mới nhất
      log("✏️ updating existing Book", book._id);

      if (title && String(title).trim()) book.title = String(title).trim();
      if (author && String(author).trim()) book.author = String(author).trim();

      if (typeof price !== "undefined") book.price = Number(price) || book.price;
      if (typeof description !== "undefined")
        book.description = String(description || "").trim();

      if (Array.isArray(categories)) book.categories = categoryIds;

      // Nếu sách đang bị đánh dấu xóa mêm -> Khôi phục lại
      if (book.isDeleted) {
        book.isDeleted = false;
        book.deletedAt = null;
      }

      await book.save();
      log("✅ Book saved", book._id);
    }

    // --- BƯỚC 3: Tạo các bản sao (BookCopy) ---
    const count = Math.max(parseInt(quantity, 10) || 1, 1);
    log("count copies to create =", count);

    // Tìm số thứ tự copyNumber cuối cùng để đánh số tiếp
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
        copyCode: buildCopyCode(book, copyNumber), // Sinh mã code
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
      logErr("❌ insertMany error:", err);

      // Nếu lỗi trùng mã (duplicate key code 11000) -> Thử lại bằng cách tăng số thứ tự lên
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

    // --- BƯỚC 4: Tính toán lại số lượng tồn kho ---
    log("🔄 recomputeBookCounts start bookId =", book._id);
    await recomputeBookCounts(book._id);
    log("✅ recomputeBookCounts done");

    const latestBook = await Book.findById(book._id).populate(
      "categories",
      "name"
    );

    log("🎉 DONE in", `${Date.now() - startedAt}ms`);
    return res.status(201).json({
      success: true,
      message: existedBefore
        ? "ISBN đã tồn tại → đã thêm bản sao (BookCopy) và cập nhật số lượng."
        : "ISBN chưa có → đã tạo đầu sách và thêm bản sao (BookCopy).",
      book: latestBook,
      createdCopiesCount: inserted.length,
      reqId,
    });
  } catch (e) {
    logErr("🔥 UNCAUGHT ERROR:", e);
    return next(new ErrorHandler(e?.message || "Lỗi server.", 500));
  }
});

/**
 * GET /api/v1/book/all
 * Lấy danh sách sách có phân trang và lọc
 * Hỗ trợ lọc theo: Search, Availability, Price, Category, Deleted status
 */
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
    deleted = "active", // active: chỉ lấy sách chưa xóa, deleted: đã xóa, all: tất cả
  } = req.query;

  const filters = {};

  // Lọc theo từ khóa (Regex)
  if (search) {
    const keyword = String(search).trim();
    if (keyword) {
      const regex = new RegExp(keyword, "i");
      filters.$or = [{ title: regex }, { author: regex }, { isbn: regex }];
    }
  }

  // Lọc theo tình trạng còn sách
  if (availability === "true" || availability === "false") {
    filters.availability = availability === "true";
  }

  // Lọc theo khoảng giá
  if (minPrice !== undefined || maxPrice !== undefined) {
    filters.price = {};
    if (minPrice !== undefined && minPrice !== "")
      filters.price.$gte = Number(minPrice);
    if (maxPrice !== undefined && maxPrice !== "")
      filters.price.$lte = Number(maxPrice);
  }

  // Lọc theo danh mục
  if (categoryId) {
    filters.categories = categoryId;
  }

  // Lọc theo trạng thái xóa mềm
  if (deleted === "active") filters.isDeleted = false;
  if (deleted === "deleted") filters.isDeleted = true;

  // Sorting
  // ✅ Tie-breaker rule: nếu nhiều sách trùng tiêu chí lọc/sort (giá, số lượng, ngày tạo...),
  // thì sắp xếp tiếp theo ISBN tăng dần để phân trang luôn ổn định.
  // (Thêm _id để đảm bảo ổn định tuyệt đối khi ISBN cũng trùng.)
  const sortOptions = {
    newest: { createdAt: -1, isbn: 1, _id: 1 },
    price_asc: { price: 1, isbn: 1, _id: 1 },
    price_desc: { price: -1, isbn: 1, _id: 1 },
    quantity_asc: { quantity: 1, isbn: 1, _id: 1 },
    quantity_desc: { quantity: -1, isbn: 1, _id: 1 },
  };
  const sortBy = sortOptions[sort] || sortOptions.newest;

  // Pagination
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

/**
 * PATCH /api/v1/book/:id/soft-delete
 * Xóa mềm một cuốn sách (Chỉ đánh dấu là đã xóa)
 * Điều kiện: Tất cả các bản sao phải đang ở trạng thái Available (không ai đang mượn).
 */
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

  // Kiểm tra điều kiện: quantity (số bản có sẵn) == totalCopies (tổng số bản)
  // Tức là không có bản nào đang được mượn.
  const { total, available } = await getBookCopyCounts(id);

  if (available !== total) {
    return next(
      new ErrorHandler(
        "Không thể xóa: Số lượng còn lại phải bằng tổng bản sao (tất cả bản sao phải ở trạng thái available).",
        400
      )
    );
  }

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

/**
 * PATCH /api/v1/book/:id/restore
 * Khôi phục sách đã xóa mềm
 */
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

  await recomputeBookCounts(id);

  res.status(200).json({
    success: true,
    message: "Khôi phục sách thành công.",
    book,
  });
});

/**
 * PUT /api/v1/book/admin/:id/cover
 * Cập nhật ảnh bìa sách
 */
/**
 * PUT /api/v1/book/admin/:id/cover
 * Cập nhật ảnh bìa sách
 */
export const updateBookCover = catchAsyncErrors(async (req, res, next) => {
  console.log("\n");
  console.log("========================================");
  console.log("🔍 [updateBookCover] START");
  console.log("========================================");
  
  const { id } = req.params;
  
  // 1. Log request headers
  console.log("📋 Request Headers:", {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    'origin': req.headers['origin'],
  });
  
  // 2. Log params
  console.log("📋 Request Params:", {
    bookId: id,
  });
  
  // 3. Log body (nếu có)
  console.log("📋 Request Body:", {
    bodyKeys: req.body ? Object.keys(req.body) : 'null',
    bodyContent: req.body,
  });
  
  // 4. Log file (QUAN TRỌNG)
  console.log("📋 Request File:", {
    hasFile: !!req.file,
    file: req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      size: req.file.size,
      hasBuffer: !!req.file.buffer,
      bufferLength: req.file.buffer?.length || 0,
    } : null,
  });

  // 5. Kiểm tra book tồn tại
  console.log("🔍 Finding book with ID:", id);
  const book = await Book.findById(id);
  
  if (!book) {
    console.error("❌ Book not found!");
    console.log("========================================\n");
    return next(new ErrorHandler("Không tìm thấy sách.", 404));
  }
  
  console.log("✅ Book found:", {
    title: book.title,
    author: book.author,
    currentCoverImage: book.coverImage,
  });

  // 6. Validate file
  if (!req.file) {
    console.error("❌ No file in request!");
    console.error("💡 Possible reasons:");
    console.error("   - Multer middleware không chạy");
    console.error("   - Body parser đã consume request body");
    console.error("   - Field name không đúng (phải là 'coverImage')");
    console.log("========================================\n");
    return next(new ErrorHandler("Vui lòng chọn ảnh bìa (coverImage).", 400));
  }

  if (!req.file.buffer) {
    console.error("❌ No buffer in file!");
    console.error("💡 Multer storage phải là memoryStorage()");
    console.log("========================================\n");
    return next(new ErrorHandler("File buffer không tồn tại.", 400));
  }

  // 7. Upload to Cloudinary
  console.log("📤 Uploading to Cloudinary...");
  console.log("   - Folder: LIBRARY_BOOKS");
  console.log("   - Buffer size:", req.file.buffer.length, "bytes");
  
  try {
    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      "LIBRARY_BOOKS"
    );

    console.log("✅ Cloudinary upload SUCCESS:", {
      public_id: result.public_id,
      url: result.secure_url,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
    });

    // 8. Update book
    console.log("💾 Updating book...");
    
    const oldCoverImage = book.coverImage;
    
    book.coverImage = {
      public_id: result.public_id,
      url: result.secure_url,
    };

    await book.save();

    console.log("✅ Book updated successfully!");
    console.log("   Old coverImage:", oldCoverImage);
    console.log("   New coverImage:", book.coverImage);

    console.log("========================================");
    console.log("🎉 [updateBookCover] SUCCESS");
    console.log("========================================\n");

    res.status(200).json({
      success: true,
      message: "Cập nhật ảnh bìa thành công.",
      book,
    });
    
  } catch (uploadError) {
    console.error("========================================");
    console.error("❌ Cloudinary upload FAILED!");
    console.error("========================================");
    console.error("Error details:", {
      message: uploadError.message,
      stack: uploadError.stack,
      name: uploadError.name,
    });
    console.log("========================================\n");
    
    return next(
      new ErrorHandler(
        "Upload ảnh lên Cloudinary thất bại: " + uploadError.message,
        500
      )
    );
  }
});


// Giữ route delete cũ nhưng trỏ vào softDelete để an toàn
export const deleteBook = softDeleteBook;