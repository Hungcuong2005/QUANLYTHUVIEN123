import nodemailer from "nodemailer";

export const sendEmail = async ({ email, subject, message }) => {
  const port = Number(process.env.SMTP_PORT || 465);

  const transporter = nodemailer.createTransport({
    service: "gmail", // hoặc process.env.SMTP_SERVICE
    auth: {
      user: process.env.SMTP_MAIL,
      pass: process.env.SMTP_PASSWORD?.replace(/\s+/g, ""), // loại bỏ khoảng trắng
    },
    secure: port === 465,
    port,
  });

  const mailOptions = {
    from: process.env.SMTP_MAIL,
    to: email,
    subject,
    html: message,
  };

  await transporter.sendMail(mailOptions);
};
