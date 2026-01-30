import multer from "multer";

const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

export const uploadBookImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    console.log("🔍 [uploadBookImage] fileFilter called:", {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
    
    if (!allowed.includes(file.mimetype)) {
      console.error("❌ [uploadBookImage] Invalid file type:", file.mimetype);
      return cb(new Error("Chỉ chấp nhận ảnh JPG/PNG/WEBP."), false);
    }
    
    console.log("✅ [uploadBookImage] File accepted");
    cb(null, true);
  },
});

// Log khi middleware được import
console.log("✅ uploadBookImage middleware loaded");