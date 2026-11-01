"""Email delivery service with SMTP client and development console mocking."""

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from backend.app.core.config import settings

logger = logging.getLogger("weirwise.email")


class EmailService:
    @staticmethod
    def _send_sync_smtp(msg: EmailMessage) -> None:
        if not settings.SMTP_HOST:
            logger.warning("SMTP_HOST not configured. Email message skipped.")
            return

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)

    async def send_email(self, to_email: str, subject: str, text_content: str, html_content: str | None = None) -> None:
        # Crucial Dev Mock: In development or test environments, or when SMTP_HOST is not configured,
        # print the email / OTP / reset link prominently to console.
        if settings.DEBUG or not settings.SMTP_HOST or settings.ENVIRONMENT in ("development", "dev", "test"):
            print("\n" + "=" * 70)
            print(f"📧 [DEV EMAIL SERVICE] TO: {to_email}")
            print(f"📧 [DEV EMAIL SERVICE] SUBJECT: {subject}")
            print("-" * 70)
            print(text_content.strip())
            print("=" * 70 + "\n", flush=True)

        if settings.SMTP_HOST:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            msg["To"] = to_email
            msg.set_content(text_content)
            if html_content:
                msg.add_alternative(html_content, subtype="html")

            # Run blocking SMTP IO in thread pool
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self._send_sync_smtp, msg)

    async def send_verification_otp(self, to_email: str, otp_code: str) -> None:
        subject = "Verify your Weirwise Platform account"
        text = (
            f"Welcome to Weirwise Platform!\n\n"
            f"Your 6-digit email verification code is: {otp_code}\n\n"
            f"This code will expire in {settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES} minutes.\n"
            f"If you did not request this account, you can safely ignore this email.\n"
        )
        html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #090A0C; margin-bottom: 16px;">Verify your Weirwise account</h2>
            <p style="color: #4b5563; font-size: 14px; line-height: 20px;">Use the verification code below to complete your registration and activate your personal workspace:</p>
            <div style="margin: 24px 0; padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #090A0C; font-family: monospace;">{otp_code}</span>
            </div>
            <p style="color: #6b7280; font-size: 12px;">This code expires in {settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES} minutes. If you did not sign up for Weirwise, please disregard this message.</p>
        </div>
        """
        await self.send_email(to_email, subject, text, html)

    async def send_password_reset_email(self, to_email: str, reset_token: str) -> None:
        subject = "Reset your Weirwise Platform password"
        text = (
            f"You requested a password reset for your Weirwise Platform account.\n\n"
            f"Your password reset token / code is: {reset_token}\n\n"
            f"This token will expire in {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes.\n"
            f"If you did not request a password reset, please ignore this email or contact support.\n"
        )
        html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #090A0C; margin-bottom: 16px;">Password Reset Request</h2>
            <p style="color: #4b5563; font-size: 14px; line-height: 20px;">You recently requested to reset your password. Use the token or code below to set your new password:</p>
            <div style="margin: 24px 0; padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #090A0C; font-family: monospace;">{reset_token}</span>
            </div>
            <p style="color: #6b7280; font-size: 12px;">This reset code expires in {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes. If you did not make this request, your account is secure and you may ignore this email.</p>
        </div>
        """
        await self.send_email(to_email, subject, text, html)


email_service = EmailService()
