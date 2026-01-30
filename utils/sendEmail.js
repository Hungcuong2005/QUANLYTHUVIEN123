import nodemailer from "nodemailer";

export const sendEmail = async ({ email, subject, message }) => {
  const port = Number(process.env.SMTP_PORT || 587);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 -> true, 587 -> false
    auth: {
      user: process.env.SMTP_MAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"Library App" <${process.env.SMTP_MAIL}>`,
    to: email,
    subject,
    html: message,
  };

  await transporter.sendMail(mailOptions);
};
