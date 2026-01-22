const nodemailer = require('nodemailer');
const pug = require('pug');
const path = require('path');
const htmlToText = require('html-to-text');

/**
 * Email service for sending transactional emails
 */
class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
      connectionTimeout: 5000, // 5 seconds
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });
  }

  /**
   * Send email
   */
  async send({ to, subject, template, data }) {
    try {
      // Render HTML from template
      const templatePath = path.join(__dirname, '../templates/emails', `${template}.pug`);
      const html = pug.renderFile(templatePath, {
        ...data,
        appName: process.env.APP_NAME || 'DocArchive',
        appUrl: process.env.FRONTEND_URL,
        supportEmail: process.env.SUPPORT_EMAIL,
      });

      // Convert to plain text
      const text = htmlToText.convert(html);

      // Send email
      const mailOptions = {
        from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        html,
        text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`Email sent: ${info.messageId}`);

      return info;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(user, verificationUrl) {
    return this.send({
      to: user.email,
      subject: 'Verify Your Email - DocArchive',
      template: 'verifyEmail',
      data: {
        name: user.firstName,
        verificationUrl,
      },
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetUrl) {
    return this.send({
      to: user.email,
      subject: 'Password Reset Request - DocArchive',
      template: 'resetPassword',
      data: {
        name: user.firstName,
        resetUrl,
      },
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(user) {
    return this.send({
      to: user.email,
      subject: 'Welcome to DocArchive!',
      template: 'welcome',
      data: {
        name: user.firstName,
      },
    });
  }

  /**
   * Send document shared notification
   */
  async sendDocumentSharedEmail(user, document, sharedBy) {
    return this.send({
      to: user.email,
      subject: 'A Document Has Been Shared With You',
      template: 'documentShared',
      data: {
        name: user.firstName,
        documentName: document.name,
        sharedBy: `${sharedBy.firstName} ${sharedBy.lastName}`,
        documentUrl: `${process.env.FRONTEND_URL}/documents/${document._id}`,
      },
    });
  }

  /**
   * Send comment notification
   */
  async sendCommentNotificationEmail(user, document, comment, commenter) {
    return this.send({
      to: user.email,
      subject: 'New Comment on Your Document',
      template: 'commentNotification',
      data: {
        name: user.firstName,
        documentName: document.name,
        commenter: `${commenter.firstName} ${commenter.lastName}`,
        comment: comment.content,
        documentUrl: `${process.env.FRONTEND_URL}/documents/${document._id}`,
      },
    });
  }
}

// Export singleton instance
const emailService = new EmailService();

module.exports = {
  sendEmail: emailService.send.bind(emailService),
  sendVerificationEmail: emailService.sendVerificationEmail.bind(emailService),
  sendPasswordResetEmail: emailService.sendPasswordResetEmail.bind(emailService),
  sendWelcomeEmail: emailService.sendWelcomeEmail.bind(emailService),
  sendDocumentSharedEmail: emailService.sendDocumentSharedEmail.bind(emailService),
  sendCommentNotificationEmail: emailService.sendCommentNotificationEmail.bind(emailService),
};
