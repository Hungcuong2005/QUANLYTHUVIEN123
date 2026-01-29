import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      throw new Error("INVALID_IMAGE_TYPE");
    }

    return {
      folder: "LIBRARY_USERS",
      resource_type: "image",
    };
  },
});

export const uploadAvatar = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Chỉ chấp nhận ảnh JPG/PNG/WEBP."), false);
    }

    cb(null, true);
  },
});