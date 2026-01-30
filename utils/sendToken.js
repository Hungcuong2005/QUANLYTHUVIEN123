export const sendToken = (user, statusCode, message, res) => {
  const token = user.generateToken();

  const isProd = process.env.NODE_ENV === "production";

  res
    .status(statusCode)
    .cookie("token", token, {
      expires: new Date(
        Date.now() + Number(process.env.COOKIE_EXPIRE || 7) * 24 * 60 * 60 * 1000
      ),
      httpOnly: true,

      // ✅ FIX 401 khi deploy (Render/HTTPS + frontend khác domain backend)
      secure: isProd,                 // production => true (HTTPS)
      sameSite: isProd ? "none" : "lax", // cross-site cookie cần "none"
    })
    .json({
      success: true,
      user,
      message,
      // token, // (khuyến nghị bỏ khỏi response nếu bạn dùng cookie)
    });
};
