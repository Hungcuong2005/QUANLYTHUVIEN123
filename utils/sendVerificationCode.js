import { generateVerificationOtpEmailTemplate } from "./emailTemplates.js";
import { sendEmail } from "./sendEmail.js";

export async function sendVerificationCode(verificationCode, email, res) {
  try {
    const message = generateVerificationOtpEmailTemplate(verificationCode);

    await sendEmail({
      email,
      subject: "Verification Code (Bookworm Library Management System)",
      message,
    });

    return res.status(200).json({
      success: true,
      message: "Verification code sent successfully.",
    });
  } catch (error) {
    console.error("SEND OTP EMAIL ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Verification code failed to send.",
    });
  }
}
