"""Unit and integration tests for Authentication and Identity flows."""

import uuid

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_auth_registration_and_login_flow():
    email = f"owner_{uuid.uuid4().hex[:8]}@example.com"
    password = "SuperSecurePassword123!"
    full_name = "Jane Doe"

    # 1. Register User (Receives 201 Created and OTP)
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    assert reg_resp.status_code == 201, reg_resp.text
    reg_data = reg_resp.json()
    assert "verification_otp" in reg_data
    otp = reg_data["verification_otp"]
    assert len(otp) == 6

    # 2. Login before verification must fail with 403 Forbidden
    pre_login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert pre_login_resp.status_code == 403

    # 3. Invalid OTP verification must fail with 400 Bad Request
    bad_verify_resp = client.post(
        "/api/v1/auth/verify-email",
        json={"email": email, "otp": "000000"},
    )
    assert bad_verify_resp.status_code == 400

    # 4. Correct OTP verification
    verify_resp = client.post(
        "/api/v1/auth/verify-email",
        json={"email": email, "otp": otp},
    )
    assert verify_resp.status_code == 200

    # 5. Duplicate registration check for verified user
    dup_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    assert dup_resp.status_code == 409

    # 6. Login User after verification
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200, login_resp.text
    tokens = login_resp.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # Verify 30-day persistent cookies in response
    if hasattr(login_resp.headers, "get_list"):
        set_cookie_headers = login_resp.headers.get_list("set-cookie")
    else:
        set_cookie_headers = [login_resp.headers.get("set-cookie", "")]
    combined_cookies = " ".join(set_cookie_headers)
    assert "access_token=" in combined_cookies
    assert "refresh_token=" in combined_cookies
    assert "max-age=2592000" in combined_cookies.lower() or "Max-Age=2592000" in combined_cookies

    # 7. Access current user profile (/me)
    me_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email
    assert me_resp.json()["is_verified"] is True

    # 8. Token Refresh
    ref_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert ref_resp.status_code == 200
    new_tokens = ref_resp.json()
    assert "access_token" in new_tokens
    assert new_tokens["access_token"] != access_token

    # 9. Old refresh token should be revoked (one-time rotation)
    old_ref_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert old_ref_resp.status_code == 401

    # 10. Logout
    logout_resp = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {new_tokens['access_token']}"},
        json={"refresh_token": new_tokens["refresh_token"]},
    )
    assert logout_resp.status_code == 200


def test_password_reset_flow():
    email = f"reset_{uuid.uuid4().hex[:8]}@example.com"
    password = "InitialPassword123!"
    new_password = "UpdatedPassword456!"

    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "Reset User"},
    )
    assert reg_resp.status_code == 201

    # Request Reset via /forgot-password or /password-reset/request
    req_resp = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": email},
    )
    assert req_resp.status_code == 200
    reset_token = req_resp.json().get("reset_token")
    assert reset_token is not None

    # Confirm Reset via /reset-password
    conf_resp = client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "token": reset_token, "new_password": new_password},
    )
    assert conf_resp.status_code == 200

    # Verify old password fails
    fail_login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert fail_login.status_code == 401

    # Verify new password succeeds
    succ_login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": new_password},
    )
    assert succ_login.status_code == 200


def test_auth_validation_edge_cases():
    # 1. Invalid email format
    r_bad_email = client.post(
        "/api/v1/auth/register",
        json={"email": "not-an-email", "password": "Password123!", "full_name": "Test Name"},
    )
    assert r_bad_email.status_code == 422

    # 2. Short password (< 8 chars)
    r_short_pass = client.post(
        "/api/v1/auth/register",
        json={"email": "shortpass@example.com", "password": "short", "full_name": "Test Name"},
    )
    assert r_short_pass.status_code == 422

    # 3. Missing full_name
    r_missing_name = client.post(
        "/api/v1/auth/register",
        json={"email": "missingname@example.com", "password": "Password123!"},
    )
    assert r_missing_name.status_code == 422

    # 4. Invalid login credentials
    r_bad_login = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "WrongPassword123!"},
    )
    assert r_bad_login.status_code == 401
