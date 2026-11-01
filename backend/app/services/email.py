"""Email delivery service integrating the official Resend API SDK with robust error handling and dev fallback."""

import asyncio
import logging
from typing import Any

import resend
from resend.exceptions import ResendError
from backend.app.core.config import settings

logger = logging.getLogger("weirwise.email")


class EmailService:
    def __init__(self) -> None:
        if settings.RESEND_API_KEY:
            resend.api_key = settings.RESEND_API_KEY

    def _send_sync_resend(self, params: dict[str, Any]) -> dict[str, Any]:
        """Execute synchronous Resend SDK email dispatch."""
        if not resend.api_key:
            resend.api_key = settings.RESEND_API_KEY
        return resend.Emails.send(params)

    async def send_email(
        self,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str | None = None,
    ) -> dict[str, Any] | None:
        """Send transactional email via Resend API (or console fallback in dev)."""
        # Always output email details to console in development / debug mode
        if settings.DEBUG or settings.ENVIRONMENT in ("development", "dev", "test"):
            print("\n" + "=" * 70)
            print(f"📧 [DEV EMAIL SERVICE] TO: {to_email}")
            print(f"📧 [DEV EMAIL SERVICE] SUBJECT: {subject}")
            print("-" * 70)
            print(text_content.strip())
            print("=" * 70 + "\n", flush=True)

        # Dispatch via Resend API
        if settings.RESEND_API_KEY:
            params: dict[str, Any] = {
                # Resend Sandbox Requirement: Sender must strictly be onboarding@resend.dev until domain is verified
                "from": "onboarding@resend.dev",
                "to": to_email,
                "subject": subject,
                "text": text_content,
            }
            if html_content:
                params["html"] = html_content

            try:
                loop = asyncio.get_running_loop()
                response = await loop.run_in_executor(None, self._send_sync_resend, params)
                email_id = response.get("id") if isinstance(response, dict) else getattr(response, "id", None)
                logger.info(
                    "Resend API email dispatched successfully: to=%s, subject=%s, id=%s",
                    to_email,
                    subject,
                    email_id,
                )
                print(f"✅ [RESEND API SUCCESS] Dispatched to {to_email} | Email ID: {email_id}", flush=True)
                return response
            except ResendError as resend_err:
                logger.error(
                    "Resend API error occurred: to=%s, code=%s, error=%s",
                    to_email,
                    getattr(resend_err, "code", "UNKNOWN"),
                    resend_err,
                )
                print(f"⚠️ [RESEND API ERROR] ResendError for {to_email}: {resend_err}", flush=True)
                # In sandbox mode, non-whitelisted recipients trigger ResendError (e.g. 403 Forbidden).
                # In dev environment, log warning and allow flow to proceed without crashing FastAPI.
                if settings.ENVIRONMENT not in ("development", "dev", "test"):
                    raise
                return None
            except TimeoutError as timeout_err:
                logger.error("Resend API network timeout sending to %s: %s", to_email, timeout_err)
                print(f"⚠️ [RESEND TIMEOUT ERROR] Network timeout for {to_email}: {timeout_err}", flush=True)
                if settings.ENVIRONMENT not in ("development", "dev", "test"):
                    raise
                return None
            except Exception as exc:
                logger.error("Unexpected error during Resend email dispatch to %s: %s", to_email, exc)
                print(f"⚠️ [RESEND UNEXPECTED ERROR] Failed dispatch to {to_email}: {exc}", flush=True)
                if settings.ENVIRONMENT not in ("development", "dev", "test"):
                    raise
                return None

        return None

    async def send_verification_otp(self, to_email: str, otp_code: str) -> dict[str, Any] | None:
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
        return await self.send_email(to_email, subject, text, html)

    async def send_password_reset_email(self, to_email: str, reset_token: str) -> dict[str, Any] | None:
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
        return await self.send_email(to_email, subject, text, html)


email_service = EmailService()
