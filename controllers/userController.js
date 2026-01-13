import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";

// GET /api/v1/user/all?status=active|deleted
// ✅ CHỈ LẤY user đã verify
export const getAllUsers = catchAsyncErrors(async (req, res, next) => {
  const status = String(req.query.status || "active"); // active | deleted

  const filter = { accountVerified: true };

  if (status === "deleted") {
    filter.isDeleted = true;
  } else {
    filter.isDeleted = false; // mặc định active
  }

  const users = await User.find(filter).select("+email");
  res.status(200).json({ success: true, users });
});

// POST /api/v1/user/add/new-admin
export const registerNewAdmin = catchAsyncErrors(async (req, res, next) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return next(new ErrorHandler("Vui lòng tải lên ảnh đại diện (avatar).", 400));
  }

  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return next(new ErrorHandler("Vui lòng nhập đầy đủ: tên, email, mật khẩu.", 400));
  }

  const existed = await User.findOne({ email: email.toLowerCase() });
  if (existed) return next(new ErrorHandler("Email đã tồn tại.", 400));

  const avatarFile = req.files.avatar;
  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!avatarFile || !allowed.includes(avatarFile.mimetype)) {
    return next(new ErrorHandler("Ảnh không hợp lệ. Chỉ chấp nhận PNG/JPG/WEBP.", 400));
  }

  const cloudinaryResponse = await cloudinary.uploader.upload(avatarFile.tempFilePath, {
    folder: "LIBRARY_USERS",
  });

  if (!cloudinaryResponse || cloudinaryResponse.error) {
    return next(new ErrorHandler("Upload avatar thất bại.", 500));
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await User.create({
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    role: "Admin",
    accountVerified: true,
    isLocked: false,
    lockedAt: null,
    lockReason: "",
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    avatar: {
      public_id: cloudinaryResponse.public_id,
      url: cloudinaryResponse.secure_url,
    },
  });

  res.status(201).json({
    success: true,
    message: "Đăng ký Admin thành công.",
    admin,
  });
});

// PATCH /api/v1/user/:id/lock
export const setUserLock = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { locked, reason = "" } = req.body;

  if (typeof locked !== "boolean") {
    return next(new ErrorHandler("Trường 'locked' phải là boolean.", 400));
  }

  const user = await User.findById(id);
  if (!user) return next(new ErrorHandler("Không tìm thấy người dùng.", 404));

  if (user.isDeleted) {
    return next(new ErrorHandler("Tài khoản đã bị xóa. Không thể khóa/mở khóa.", 400));
  }

  user.isLocked = locked;
  user.lockedAt = locked ? new Date() : null;
  user.lockReason = locked ? String(reason || "") : "";
  await user.save();

  res.status(200).json({
    success: true,
    message: locked ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản.",
    user,
  });
});

// PATCH /api/v1/user/:id/soft-delete
export const softDeleteUser = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) return next(new ErrorHandler("Không tìm thấy người dùng.", 404));

  if (user.isDeleted) {
    return res.status(200).json({ success: true, message: "Người dùng đã bị xóa.", user });
  }

  user.isDeleted = true;
  user.deletedAt = new Date();
  user.deletedBy = req.user?._id || null;

  user.isLocked = true;
  user.lockedAt = new Date();
  user.lockReason = user.lockReason || "Tài khoản đã bị xóa.";

  await user.save();

  res.status(200).json({
    success: true,
    message: "Đã xóa người dùng.",
    user,
  });
});

// PATCH /api/v1/user/:id/restore
export const restoreUser = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) return next(new ErrorHandler("Không tìm thấy người dùng.", 404));

  user.isDeleted = false;
  user.deletedAt = null;
  user.deletedBy = null;

  user.isLocked = false;
  user.lockedAt = null;
  user.lockReason = "";

  await user.save();

  res.status(200).json({
    success: true,
    message: "Đã khôi phục người dùng.",
    user,
  });
});
