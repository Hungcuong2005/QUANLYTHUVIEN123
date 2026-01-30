import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt";
import { uploadBufferToCloudinary } from "../utils/cloudinaryUpload.js";
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

// POST /api/v1/user/add/new-admin
export const registerNewAdmin = catchAsyncErrors(async (req, res, next) => {
  console.log("\n");
  console.log("========================================");
  console.log("🔍 [registerNewAdmin] START");
  console.log("========================================");
  
  // 1. Log request headers
  console.log("📋 Request Headers:", {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
  });
  
  // 2. Log body
  const { name, email, password } = req.body;
  console.log("📋 Request Body:", {
    name: name || 'MISSING',
    email: email || 'MISSING',
    password: password ? '***' : 'MISSING',
    bodyKeys: Object.keys(req.body),
  });
  
  // 3. Log file (QUAN TRỌNG)
  console.log("📋 Request File (avatar):", {
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

  // 4. Validate input
  if (!name || !email || !password) {
    console.error("❌ Missing required fields!");
    console.log("========================================\n");
    return next(
      new ErrorHandler("Vui lòng nhập đầy đủ: tên, email, mật khẩu.", 400)
    );
  }

  // 5. Check email exists
  console.log("🔍 Checking if email exists:", email);
  const existed = await User.findOne({ email: email.toLowerCase() });
  
  if (existed) {
    console.error("❌ Email already exists!");
    console.log("========================================\n");
    return next(new ErrorHandler("Email đã tồn tại.", 400));
  }
  
  console.log("✅ Email available");

  // 6. Validate avatar file
  if (!req.file) {
    console.error("❌ No avatar file in request!");
    console.error("💡 Possible reasons:");
    console.error("   - Multer middleware không chạy");
    console.error("   - Body parser đã consume request body");
    console.error("   - Field name không đúng (phải là 'avatar')");
    console.log("========================================\n");
    return next(
      new ErrorHandler("Vui lòng tải lên ảnh đại diện (avatar).", 400)
    );
  }

  if (!req.file.buffer) {
    console.error("❌ No buffer in avatar file!");
    console.error("💡 Multer storage phải là memoryStorage()");
    console.log("========================================\n");
    return next(new ErrorHandler("File buffer không tồn tại.", 400));
  }

  // 7. Upload avatar to Cloudinary
  console.log("📤 Uploading avatar to Cloudinary...");
  console.log("   - Folder: LIBRARY_USERS");
  console.log("   - Buffer size:", req.file.buffer.length, "bytes");
  
  try {
    const result = await uploadBufferToCloudinary(req.file.buffer, "LIBRARY_USERS");

    console.log("✅ Cloudinary upload SUCCESS:", {
      public_id: result.public_id,
      url: result.secure_url,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
    });

    // 8. Hash password
    console.log("🔐 Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("✅ Password hashed");

    // 9. Create admin
    console.log("💾 Creating admin user...");
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
        public_id: result.public_id,
        url: result.secure_url,
      },
    });

    console.log("✅ Admin created successfully:", {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    });

    console.log("========================================");
    console.log("🎉 [registerNewAdmin] SUCCESS");
    console.log("========================================\n");

    res.status(201).json({
      success: true,
      message: "Đăng ký Admin thành công.",
      admin,
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