export function generateVerificationOtpEmailTemplate(otpCode) {
  return `
    <div style="
      font-family: 'Roboto', Arial, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 24px;
      border-radius: 10px;
      background-color: #8B0000;
      color: #ffffff;
      border: 1px solid #b22222;
    ">
      <h2 style="color: #FFDADA; text-align: center; letter-spacing: 0.5px;">
        XÁC THỰC ĐỊA CHỈ EMAIL
      </h2>

      <p style="font-size: 16px; color: #FFECEC;">
        Xin chào,
      </p>

      <p style="font-size: 16px; color: #FFECEC;">
        Để hoàn tất quá trình đăng ký hoặc đăng nhập, vui lòng sử dụng mã xác thực bên dưới:
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <span style="
          display: inline-block;
          font-size: 26px;
          font-weight: bold;
          color: #8B0000;
          padding: 12px 28px;
          border-radius: 6px;
          background-color: #ffffff;
          letter-spacing: 4px;
        ">
          ${otpCode}
        </span>
      </div>

      <p style="font-size: 15px; color: #FFDADA;">
        Mã xác thực có hiệu lực trong vòng <b>15 phút</b>. Vui lòng không chia sẻ mã này với bất kỳ ai.
      </p>

      <p style="font-size: 15px; color: #FFDADA;">
        Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.
      </p>

      <footer style="margin-top: 24px; text-align: center; font-size: 14px; color: #FFCACA;">
        <p>
          Trân trọng,<br />
          <b>Đại học Bách Khoa</b>
        </p>
        <p style="font-size: 12px; color: #FFBABA;">
          Đây là email tự động, vui lòng không trả lời.
        </p>
      </footer>
    </div>
  `;
}

export function generateForgotPasswordEmailTemplate(resetPasswordUrl) {
  return `
    <div style="
      font-family: 'Roboto', Arial, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 24px;
      border-radius: 10px;
      background-color: #8B0000;
      color: #ffffff;
      border: 1px solid #b22222;
    ">
      <h2 style="color: #FFDADA; text-align: center; letter-spacing: 0.5px;">
        ĐẶT LẠI MẬT KHẨU
      </h2>

      <p style="font-size: 16px; color: #FFECEC;">
        Xin chào,
      </p>

      <p style="font-size: 16px; color: #FFECEC;">
        Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản của mình. Nhấn nút bên dưới để tiếp tục:
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a
          href="${resetPasswordUrl}"
          style="
            display: inline-block;
            font-size: 16px;
            font-weight: bold;
            color: #8B0000;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 6px;
            background-color: #ffffff;
          "
        >
          ĐẶT LẠI MẬT KHẨU
        </a>
      </div>

      <p style="font-size: 15px; color: #FFDADA;">
        Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.
        Liên kết sẽ hết hạn sau <b>10 phút</b>.
      </p>

      <p style="font-size: 15px; color: #FFDADA;">
        Nếu nút trên không hoạt động, hãy sao chép và dán đường dẫn sau vào trình duyệt:
      </p>

      <p style="font-size: 14px; color: #ffffff; word-wrap: break-word;">
        ${resetPasswordUrl}
      </p>

      <footer style="margin-top: 24px; text-align: center; font-size: 14px; color: #FFCACA;">
        <p>
          Trân trọng,<br />
          <b>Đại học Bách Khoa</b>
        </p>
        <p style="font-size: 12px; color: #FFBABA;">
          Đây là email tự động, vui lòng không trả lời.
        </p>
      </footer>
    </div>
  `;
}
