import mongoose from "mongoose";

const BookCopySchema = new mongoose.Schema(
  {
    // ✅ Liên kết về "đầu sách"
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },

    // ✅ Số thứ tự cuốn theo từng bookId (1,2,3,...) => AUTO INCREMENT PER BOOK
    copyNumber: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },

    // ✅ Mã cuốn / barcode (DUY NHẤT)
    copyCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },

    // ✅ Trạng thái cuốn sách vật lý
    status: {
      type: String,
      enum: ["available", "borrowed", "reserved", "lost", "damaged", "maintenance"],
      default: "available",
      index: true,
    },

    acquiredAt: { type: Date, default: Date.now },
    price: { type: Number, default: 0 },
    notes: { type: String, default: "", trim: true },

    // ✅ Borrow hiện tại của cuốn này (nếu đang mượn)
    currentBorrowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Borrow",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// ✅ Index hữu ích: tìm nhanh theo bookId + status
BookCopySchema.index({ bookId: 1, status: 1 });

// ✅ Chặn trùng copyNumber trong cùng 1 đầu sách
BookCopySchema.index({ bookId: 1, copyNumber: 1 }, { unique: true });

// ✅ Clean copyCode
BookCopySchema.pre("save", function (next) {
  if (this.copyCode) this.copyCode = this.copyCode.trim().toUpperCase();
  next();
});

export default mongoose.model("BookCopy", BookCopySchema);
