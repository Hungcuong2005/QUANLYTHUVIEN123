import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { sendVerificationCode } from "../utils/sendVerificationCode.js";
import { sendToken } from "../utils/sendToken.js";
import { generateForgotPasswordEmailTemplate } from "../utils/emailTemplates.js";
import { sendEmail } from "../utils/sendEmail.js";
import { validatePassword } from "./validatePassword.js";

/**
 * =====================================
 * 📌 ĐĂNG KÝ TÀI KHOẢN (REGISTER)
 * =====================================
 * 1. Validate đầu vào (tên, email, pass).
 * 2. Kiểm tra email đã tồn tại và đã xác thực chưa.
 * 3. Validate độ mạnh mật khẩu.
 * 4. Hash mật khẩu.
 * 5. Tạo User mới trong DB (trạng thái chưa xác thực).
 * 6. Gửi mã OTP xác thực qua email (sendVerificationCode).
 */
export const register = catchAsyncErrors(async (req, res, next) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return next(new ErrorHandler("Please enter all fields.", 400));
    }

    // Kiểm tra nếu user đã tồn tại và đã xác thực -> Báo lỗi
    const isRegistered = await User.findOne({ email, accountVerified: true });
    if (isRegistered) {
        return next(new ErrorHandler("User already exists", 400));
    }

    // Kiểm tra độ mạnh mật khẩu (độ dài, ký tự đặc biệt...)
    const isPasswordValidate = validatePassword(password);
    if (isPasswordValidate) {
        return next(new ErrorHandler(isPasswordValidate, 400));
    }

    // Mã hóa mật khẩu trước khi lưu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tạo user mới (chưa verify)
    const user = await User.create({
        name,
        email,
        password: hashedPassword,
    });

    // Sinh mã Verification Code và lưu vào User
    const verificationCode = await user.generateVerificationCode();
    await user.save();

    // Gửi code qua email (Hàm này tự handle response)
    // ❗ KHÔNG try/catch để bắt lỗi sendVerificationCode vì đã có middleware xử lý
    return sendVerificationCode(verificationCode, email, res);
});

/**
 * =====================================
 * 📌 XÁC THỰC OTP (VERIFY OTP)
 * =====================================
 * 1. Tìm user theo email (trạng thái chưa xác thực).
 * 2. Nếu có nhiều duplicate user (do spam đăng ký), xóa bớt giữ lại cái mới nhất.
 * 3. Kiểm tra OTP có khớp và còn hạn không.
 * 4. Nếu khớp -> Set accountVerified = true.
 * 5. Gửi Token đăng nhập (Cookie) về cho client.
 */
export const verifyOTP = catchAsyncErrors(async (req, res, next) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        return next(new ErrorHandler("Email or otp is missing.", 400));
    }
    try {
        // Tìm các bản ghi user chưa xác thực khớp email
        const userAllEntries = await User.find({
            email,
            accountVerified: false,
        }).sort({ createdAt: -1 });

        if (!userAllEntries) {
            return next(new ErrorHandler("User not found.", 404));
        }

        let user;

        // Cơ chế dọn dẹp: Nếu có nhiều bản ghi rác cùng email, chỉ giữ cái mới nhất
        if (userAllEntries.length > 1) {
            user = userAllEntries[0];
            await User.deleteMany({
                _id: { $ne: user._id },
                email,
                accountVerified: false,
            });
        } else {
            user = userAllEntries[0];
        }

        // Validate OTP
        if (user.verificationCode !== Number(otp)) {
            return next(new ErrorHandler("Invalid OTP.", 400));
        }

        const currentTime = Date.now();
        const verificationCodeExpire = new Date(
            user.verficationCodeExpire
        ).getTime();

        if (currentTime > verificationCodeExpire) {
            return next(new ErrorHandler("OTP expired.", 400));
        }

        // Xác thực thành công -> Cập nhật trạng thái
        user.accountVerified = true;
        user.verificationCode = null;
        user.verficationCodeExpire = null;
        await user.save({ validateModifiedOnly: true }); // Chỉ validate trường thay đổi

        // Gửi token đăng nhập luôn để user đỡ phải login lại
        sendToken(user, 200, "Account Verified.", res);

    } catch (error) {
        return next(new ErrorHandler("Internal server error.", 500));
    }
});

/**
 * =====================================
 * 📌 ĐĂNG NHẬP (LOGIN)
 * =====================================
 * 1. Tìm user theo email (đã xác thực, chưa bị xóa).
 * 2. Kiểm tra mật khẩu (so sánh hash).
 * 3. Kiểm tra user có bị khóa (lock) không.
 * 4. Gửi Token (Cookie) nếu thành công.
 */
export const login = catchAsyncErrors(async (req, res, next) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return next(new ErrorHandler("Please enter all fields.", 400));
    }

    // Tìm user và lấy cả field password (vì mặc định select: false)
    const user = await User.findOne({
        email,
        accountVerified: true,
        isDeleted: false,
    }).select("+password");

    if (!user) {
        return next(new ErrorHandler("Invalid email or password.", 400));
    }

    // Kiểm tra trạng thái khóa tài khoản
    if (user.isLocked) {
        return next(new ErrorHandler(user.lockReason || "Tài khoản đã bị khóa.", 403));
    }

    // So sánh mật khẩu
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (!isPasswordMatched) {
        return next(new ErrorHandler("Invalid email or password.", 400));
    }

    // Gửi token
    sendToken(user, 200, "User login successfully.", res);
});

/**
 * =====================================
 * 📌 ĐĂNG XUẤT (LOGOUT)
 * =====================================
 * Xóa cookie chứa token bằng cách set expire date về quá khứ.
 */
export const logout = catchAsyncErrors(async (req, res, next) => {
  const isProd = process.env.NODE_ENV === "production";

  res
    .status(200)
    .cookie("token", "", {
      expires: new Date(Date.now()),
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
    })
    .json({
      success: true,
      message: "Logged out successfully.",
    });
});


/**
 * =====================================
 * 📌 LẤY THÔNG TIN USER HIỆN TẠI (ME)
 * =====================================
 * User đã được lấy ra từ middleware `isAuthenticated` và gán vào req.user
 */
export const getUser = catchAsyncErrors(async (req, res, next) => {
    const user = req.user;
    res.status(200).json({
        success: true,
        user,
    });
});

/**
 * =====================================
 * 📌 QUÊN MẬT KHẨU (FORGOT PASSWORD)
 * =====================================
 * 1. Tìm user theo email.
 * 2. Sinh token reset password (random string).
 * 3. Gửi link reset chứa token qua email cho user.
 */
export const forgotPassword = catchAsyncErrors(async (req, res, next) => {
    if (!req.body.email) {
        return next(new ErrorHandler("Email is required."))
    }
    const user = await User.findOne({
        email: req.body.email,
        accountVerified: true,
    });
    if (!user) {
        return next(new ErrorHandler("Invalid email.", 400));
    }

    // Sinh token reset (lưu hash vào DB, trả về token gốc)
    const resetToken = user.getResetPasswordToken();

    await user.save({ validateBeforeSave: false });

    // Link frontend để user click vào
    const resetPasswordUrl = `${process.env.FRONTEND_URL}/password/reset/${resetToken}`;

    const message = generateForgotPasswordEmailTemplate(resetPasswordUrl);

    try {
        await sendEmail({
            email: user.email,
            subject: "Bookworm Library Management System Password Recovery",
            message,
        });
        res.status(200).json({
            success: true,
            message: `Email sent to ${user.email} successfully.`,
        });
    } catch (error) {
        // Rollback nếu gửi mail lỗi
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save({ validateBeforeSave: false });
        return next(new ErrorHandler(error.message || "Cannot send email.", 500));
    }
});

/**
 * =====================================
 * 📌 ĐẶT LẠI MẬT KHẨU (RESET PASSWORD)
 * =====================================
 * 1. Nhận token từ URL.
 * 2. Validate token (hash và so sánh với DB).
 * 3. Kiểm tra hạn sử dụng của token.
 * 4. Đặt mật khẩu mới (hash mới).
 */
export const resetPassword = catchAsyncErrors(async (req, res, next) => {
    const { token } = req.params;

    // Hash token nhận được để so sánh với cái lưu trong DB
    const resetPasswordToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    // Tìm user có token khớp và token chưa hết hạn ($gt: Date.now())
    const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() },
    });
    if (!user) {
        return next(
            new ErrorHandler(
                "Reset password token is invalid or has been expired.",
                400
            )
        );
    }

    // Validate mật khẩu mới
    const isPasswordValidate = validatePassword(req.body.password, req.body.confirmNewPassword);

    if (isPasswordValidate) {
        return next(new ErrorHandler(isPasswordValidate, 400));
    }

    // Cập nhật mật khẩu mới và xóa token reset
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    // Auto login sau khi reset thành công
    sendToken(user, 200, "Password reset successfully.", res);
});

/**
 * =====================================
 * 📌 ĐỔI MẬT KHẨU (UPDATE PASSWORD)
 * =====================================
 * Dành cho user đang đăng nhập muốn đổi pass.
 * 1. Kiểm tra mật khẩu cũ có đúng không.
 * 2. Validate và hash mật khẩu mới.
 * 3. Lưu vào DB.
 */
export const updatePassword = catchAsyncErrors(async (req, res, next) => {
    const user = await User.findById(req.user._id).select("+password");
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmNewPassword) {
        return next(new ErrorHandler("Please enter all fields.", 400));
    }

    // Kiểm tra mật khẩu hiện tại
    const isPasswordMatched = await bcrypt.compare(
        currentPassword,
        user.password
    );
    if (!isPasswordMatched) {
        return next(new ErrorHandler("Current password is incorrect.", 400));
    }

    // Validate mật khẩu mới
    const isPasswordValidate = validatePassword(newPassword, confirmNewPassword);
    if (isPasswordValidate) {
        return next(new ErrorHandler(isPasswordValidate, 400));
    }

    // Lưu mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    res.status(200).json({
        success: true,
        message: "Password updated.",
    });
});