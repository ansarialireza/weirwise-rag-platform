"""Unit and integration tests for Authentication and Identity flows."""

import uuid

from backend.app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_auth_registration_and_login_flow():
    email = f"owner_{uuid.uuid4().hex[:8]}@example.com"
    password = "SuperSecurePassword123!"
    full_name = "Jane Doe"

    # 1. Register User
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    assert reg_resp.status_code == 201, reg_resp.text
    user_data = reg_resp.json()
    assert user_data["email"] == email
    assert user_data["full_name"] == full_name
    assert "id" in user_data

    # Duplicate registration check
    dup_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    assert dup_resp.status_code == 409

    # 2. Login User
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

    # 3. Access current user profile (/me)
    me_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email

    # 4. Token Refresh
    ref_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert ref_resp.status_code == 200
    new_tokens = ref_resp.json()
    assert "access_token" in new_tokens
    assert new_tokens["access_token"] != access_token

    # 5. Old refresh token should be revoked (one-time rotation)
    old_ref_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert old_ref_resp.status_code == 401

    # 6. Logout
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

    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "Reset User"},
    )

    # Request Reset
    req_resp = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": email},
    )
    assert req_resp.status_code == 200
    reset_token = req_resp.json().get("reset_token")
    assert reset_token is not None

    # Confirm Reset
    conf_resp = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": reset_token, "new_password": new_password},
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
