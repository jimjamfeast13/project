import sgMail from '@sendgrid/mail';

// Initialize SendGrid only when needed
let initialized = false;

function initializeSendGrid() {
  if (initialized) return;

  const apiKey = (process.env.SENDGRID_API_KEY || "").trim();
  if (!apiKey || !apiKey.startsWith("SG.")) {
    throw new Error("SENDGRID_API_KEY environment variable must be set and start with 'SG.'");
  }

  sgMail.setApiKey(apiKey);
  initialized = true;
}

export async function sendVerificationEmail(email: string, token: string) {
  if (!process.env.APP_URL) {
    throw new Error("APP_URL environment variable must be set");
  }

  const verificationUrl = `${process.env.APP_URL}/verify?token=${token}`;

  try {
    initializeSendGrid();
    await sgMail.send({
      to: email,
      from: 'noreply@innovate.app',  // Replace with your verified sender
      subject: 'Verify your Innovate account',
      html: `
        <h1>Welcome to Innovate!</h1>
        <p>Please click the link below to verify your account:</p>
        <a href="${verificationUrl}">Verify Account</a>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      `,
    });
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, token: string) {
  if (!process.env.APP_URL) {
    throw new Error("APP_URL environment variable must be set");
  }

  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;

  try {
    initializeSendGrid();
    await sgMail.send({
      to: email,
      from: 'noreply@innovate.app',  // Replace with your verified sender
      subject: 'Reset your Innovate password',
      html: `
        <h1>Password Reset Request</h1>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
}