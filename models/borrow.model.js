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

    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
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

    // tiền phạt (backend sẽ cập nhật lúc “prepare payment”)
    fine: {
      type: Number,
      default: 0,
    },

    notified: {
      type: Boolean,
      default: false,
    },

    // ✅ THÊM THÔNG TIN THANH TOÁN THẬT
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

export const Borrow = mongoose.model("Borrow", borrowSchema);
