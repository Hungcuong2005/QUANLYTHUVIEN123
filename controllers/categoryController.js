import { Category } from "../models/category.model.js"; // đúng path model của bạn

// ✅ POST /api/v1/category/admin/add
export const addCategory = async (req, res) => {
  try {
    const { name, description = "" } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Tên thể loại là bắt buộc.",
      });
    }

    const existed = await Category.findOne({ name: name.trim() });
    if (existed) {
      return res.status(400).json({
        success: false,
        message: "Thể loại đã tồn tại.",
      });
    }

    const category = await Category.create({
      name: name.trim(),
      description,
    });

    return res.status(201).json({
      success: true,
      message: "Thêm thể loại thành công!",
      category,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Lỗi server.",
    });
  }
};

// ✅ GET /api/v1/category/all
export const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({})
      .sort({ createdAt: -1 })
      .select("-__v");

    return res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Lỗi server.",
    });
  }
};

// ✅ PATCH /api/v1/category/update/:id
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thể loại.",
      });
    }

    // Nếu đổi tên thì check trùng
    if (name && name.trim() && name.trim() !== category.name) {
      const existed = await Category.findOne({ name: name.trim() });
      if (existed) {
        return res.status(400).json({
          success: false,
          message: "Tên thể loại đã tồn tại.",
        });
      }
      category.name = name.trim();
    }

    if (typeof description === "string") category.description = description;

    await category.save();

    return res.status(200).json({
      success: true,
      message: "Cập nhật thể loại thành công!",
      category,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Lỗi server.",
    });
  }
};

// ✅ DELETE /api/v1/category/delete/:id
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findByIdAndDelete(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thể loại.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Xóa thể loại thành công!",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Lỗi server.",
    });
  }
};
