/**
 * Email worker — processes email jobs from the 'email' queue.
 *
 * Supports templates:
 *   - 'order-confirmation': Sends order confirmation with orderId, customerName, total
 *   - 'password-reset': Sends password reset link
 *
 * Uses the shared Nodemailer transporter from utils/mailer.js.
 * Errors are reported to Sentry and automatically retried by BullMQ.
 */

import { Worker } from 'bullmq';
import * as Sentry from '@sentry/node';
import { connection } from '../queues/connection.js';
import transporter from '../utils/mailer.js';

/**
 * Build the email HTML body based on the template type.
 */
function buildEmailContent(template, data) {
  switch (template) {
    case 'order-confirmation':
      return {
        subject: `Order Confirmed — #${data.orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #333;">Order Confirmation</h2>
            <p>Hi ${data.customerName || 'Customer'},</p>
            <p>Your order <strong>#${data.orderId}</strong> has been placed successfully!</p>
            <p><strong>Total:</strong> $${Number(data.total).toFixed(2)}</p>
            <p>We'll notify you when your order ships.</p>
            <hr style="border: none; border-top: 1px solid #eee;" />
            <p style="color: #999; font-size: 12px;">DHP Streetwear Store</p>
          </div>
        `,
      };

    case 'password-reset':
      return {
        subject: 'Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Password Reset</h2>
            <p>Click below to reset:</p>
            <a href="${data.resetLink}">Reset Password</a>
          </div>
        `,
      };

    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

const emailWorker = new Worker(
  'email',
  async (job) => {
    const { to, template, data } = job.data;

    console.log(`📧 Processing email job ${job.id}: ${template} → ${to}`);

    const { subject, html } = buildEmailContent(template, data);

    const info = await transporter.sendMail({
      from: `"Streetwear Support" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log(`📧 Email sent to ${to} (ID: ${info.messageId})`);
  },
  {
    connection,
    concurrency: 3,
  }
);

emailWorker.on('failed', (job, err) => {
  console.error(`Email job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  Sentry.captureException(err, { tags: { queue: 'email', template: job?.data?.template } });
});

emailWorker.on('error', (err) => {
  console.error('Email worker error:', err.message);
});

export default emailWorker;
