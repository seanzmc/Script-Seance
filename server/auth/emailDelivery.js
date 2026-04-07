import nodemailer from 'nodemailer';

export const createEmailSender = (config) => {
  if (config.emailTransport === 'console') {
    return {
      async sendLoginCode({ email, code }) {
        console.info('[auth/email-code]', { email, code });
      }
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.password
    }
  });

  return {
    async sendLoginCode({ email, code, expiresInMinutes }) {
      await transporter.sendMail({
        from: config.emailFrom,
        to: email,
        subject: 'Your Script Seance sign-in code',
        text: `Your Script Seance sign-in code is ${code}. It expires in ${expiresInMinutes} minutes.`,
        html: `<p>Your Script Seance sign-in code is <strong>${code}</strong>.</p><p>It expires in ${expiresInMinutes} minutes.</p>`
      });
    }
  };
};
