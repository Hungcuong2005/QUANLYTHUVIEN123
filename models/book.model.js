import mongoose from "mongoose";

const bookSchema = new mongoose.Schema(
  {
    // ===== Thông tin đầu sách =====
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    // ISBN (khuyến nghị)
    isbn: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },

    publisher: { type: String, default: "", trim: true },
    publishYear: { type: Number, min: 0, default: null },

    // ✅ Thể loại (1 thể loại chính - giữ lại để không vỡ UI/API cũ)
    category: { type: String, default: "", trim: true, index: true },

    

    coverImage: { type: String, default: "" },

    // phí mượn / giá sách
    price: { type: Number, default: 0, min: 0 },

    // ===== ĐỂ UI HIỂN THỊ "SỐ LƯỢNG CÒN LẠI" =====
    // quantity = số BookCopy status=available
    quantity: { type: Number, default: 0, min: 0, index: true },
    // tổng số bản sao
    totalCopies: { type: Number, default: 0, min: 0 },
    // còn sách hay không
    availability: { type: Boolean, default: false, index: true },

    // dùng cho logic gia hạn của bạn
    holdCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

bookSchema.index({ title: 1, author: 1 });
// ✅ Tìm theo nhiều tag thể loại nhanh hơn


export const Book = mongoose.model("Book", bookSchema);
