import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true, // chống trùng tên
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

// ❌ BỎ categorySchema.index({ name: 1 }); vì unique:true đã tự tạo index → tránh warning trùng index

export const Category = mongoose.model("Category", categorySchema);
