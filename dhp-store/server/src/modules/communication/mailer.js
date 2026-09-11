/**
 * Shared Nodemailer transporter for the communication module.
 *
 * Uses Gmail SMTP credentials from environment variables:
 *   - EMAIL_USER: Gmail address
 *   - EMAIL_PASS: Gmail app password
 */

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export default transporter;
