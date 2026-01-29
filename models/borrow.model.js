import mongoose from "mongoose";

const borrowSchema = new mongoose.Schema(
  {
    user: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: true,
      },
    },

    // Giá mượn sách (hoặc giá sách bạn đang dùng)
    price: {
      type: Number,
      required: true,
    },

    // ✅ MƯỢN THEO CUỐN SÁCH VẬT LÝ (BookCopy)
    bookCopy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookCopy",
      required: true,
      index: true,
    },

    // ✅ Giữ tham chiếu về đầu sách để query nhanh (thống kê/UI)
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },

    borrowDate: {
      type: Date,
      default: Date.now,
    },

    dueDate: {
      type: Date,
      required: true,
    },

    // CHỈ set returnDate khi thanh toán thành công (paid)
    returnDate: {
      type: Date,
      default: null,
    },

    renewCount: {
      type: Number,
      default: 0,
    },

    lastRenewedAt: {
      type: Date,
      default: null,
    },

    // tiền phạt (backend sẽ cập nhật lúc “prepare payment”)
    fine: {
      type: Number,
      default: 0,
    },

    notified: {
      type: Boolean,
      default: false,
    },

    // ✅ THÔNG TIN THANH TOÁN
    payment: {
      method: {
        type: String,
        enum: ["cash", "vnpay", "zalopay"],
        default: "cash",
      },
      status: {
        type: String,
        enum: ["unpaid", "pending", "paid", "failed"],
        default: "unpaid",
      },
      amount: {
        // tổng tiền cần thanh toán = price + fine
        type: Number,
        default: 0,
      },
      transactionId: {
        type: String,
        default: null,
      },
      paidAt: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true }
);

// ✅ Index phổ biến để lọc nhanh
borrowSchema.index({ "user.id": 1, returnDate: 1, createdAt: -1 });
borrowSchema.index({ book: 1, createdAt: -1 });
borrowSchema.index({ bookCopy: 1, createdAt: -1 });

export const Borrow = mongoose.model("Borrow", borrowSchema);
