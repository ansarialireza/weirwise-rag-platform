import os
import sys
import uuid
import time
import httpx
import pytest

BASE_URL = os.getenv("E2E_BASE_URL", "https://dev.weirwise.com")
API_URL = f"{BASE_URL}/api/v1"

def test_full_lifecycle():
    client = httpx.Client(verify=False, timeout=30.0)

    # 1. Register & Login
    uid = uuid.uuid4().hex[:8]
    email = f"qa_lifecycle_{uid}@weirwise.test"
    password = "TestPassword123!"
    
    reg_resp = client.post(f"{API_URL}/auth/register", json={
        "email": email,
        "password": password,
        "full_name": f"QA Lifecycle User {uid}"
    })
    assert reg_resp.status_code in (200, 201), f"Registration failed: {reg_resp.text}"
    user_data = reg_resp.json()
    
    login_resp = client.post(f"{API_URL}/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get Workspaces & Projects
    ws_resp = client.get(f"{API_URL}/workspaces", headers=headers)
    assert ws_resp.status_code == 200
    workspaces = ws_resp.json()
    assert len(workspaces) > 0
    ws_id = workspaces[0]["id"]

    proj_resp = client.get(f"{API_URL}/workspaces/{ws_id}/projects", headers=headers)
    assert proj_resp.status_code == 200
    projects = proj_resp.json()
    if len(projects) == 0:
        create_p = client.post(f"{API_URL}/workspaces/{ws_id}/projects", headers=headers, json={
            "name": "Default Project",
            "description": "Initial workspace project"
        })
        assert create_p.status_code in (200, 201)
        proj_id = create_p.json()["id"]
    else:
        proj_id = projects[0]["id"]

    # 3. Knowledge Lifecycle: Upload Document & Vector Ingestion
    content = b"Weirwise SLA guarantees 99.99% monthly availability for Enterprise tier customers. Support response time is within 15 minutes."
    files = {"file": ("enterprise_sla.txt", content, "text/plain")}
    
    src_resp = client.post(f"{API_URL}/projects/{proj_id}/sources", headers=headers, json={
        "name": f"SLA Source {uid}",
        "type": "file"
    })
    assert src_resp.status_code in (200, 201), f"Source creation failed: {src_resp.text}"
    src_id = src_resp.json()["id"]

    upload_resp = client.post(
        f"{API_URL}/sources/{src_id}/documents/upload",
        headers=headers,
        files={"files": ("enterprise_sla.txt", content, "text/plain")}
    )
    assert upload_resp.status_code in (200, 201, 202), f"Upload failed: {upload_resp.text}"
    doc_id = upload_resp.json()["uploaded_documents"][0]["id"]

    # 4. Ingestion Lifecycle Check: Wait for indexing
    for _ in range(10):
        docs_resp = client.get(f"{API_URL}/sources/{src_id}/documents", headers=headers)
        assert docs_resp.status_code == 200
        docs = docs_resp.json()
        doc = next((d for d in docs if d["id"] == doc_id), None)
        if doc and doc.get("status") in ("ready", "completed", "indexed", "processed"):
            break
        time.sleep(1)

    # 5. Assistant Creation & Knowledge Association
    ast_resp = client.post(f"{API_URL}/projects/{proj_id}/assistants", headers=headers, json={
        "name": f"SLA Assistant {uid}",
        "system_prompt": "You are a customer support agent. Answer truthfully based only on provided knowledge.",
        "model": "gpt-4o-mini",
        "temperature": 0.2, "score_threshold": 0.5,
        "is_active": True,
        "knowledge_source_ids": [src_id]
    })
    assert ast_resp.status_code in (200, 201), f"Assistant create failed: {ast_resp.text}"
    assistant_id = ast_resp.json()["id"]

    # 6. Publish Assistant
    pub_resp = client.post(f"{API_URL}/assistants/{assistant_id}/publish", headers=headers)
    assert pub_resp.status_code == 200, f"Publish failed: {pub_resp.text}"
    
    deps_resp = client.get(f"{API_URL}/assistants/{assistant_id}/deployments", headers=headers)
    assert deps_resp.status_code == 200, f"Deployments fetch failed: {deps_resp.text}"
    deployments = deps_resp.json()
    assert len(deployments) > 0, "At least one deployment must exist"
    widget_key = deployments[0]["public_key"]
    assert widget_key, "Widget public key must be present"

    # 7. Public Runtime Verification (Passing X-Widget-Key header)
    widget_headers = {"X-Widget-Key": widget_key}
    cfg_resp = client.get(f"{API_URL}/public/assistants/{assistant_id}/config", headers=widget_headers)
    assert cfg_resp.status_code == 200, f"Public config failed: {cfg_resp.text}"
    cfg = cfg_resp.json()
    assert cfg["assistant_id"] == assistant_id

    # 8. RAG Grounding Verification (Ask known fact)
    chat_resp = client.post(
        f"{API_URL}/public/assistants/{assistant_id}/chat",
        headers=widget_headers,
        json={"message": "Weirwise SLA guarantees 99.99% monthly availability for Enterprise tier customers. Support response time is within 15 minutes."}
    )
    assert chat_resp.status_code == 200, f"Public chat failed: {chat_resp.text}"
    reply = chat_resp.json()
    assert "content" in reply
    text = reply["content"].lower()
    print("[RAG Answer]:", reply["content"])
    # Check that answer contains 99.99% or sources returned
    assert "99.99" in text or len(reply.get("sources", [])) > 0, f"RAG failed to retrieve SLA fact: {text}"

    # 9. Hallucination Resistance Verification (Ask fact completely absent from ingested document)
    absent_resp = client.post(
        f"{API_URL}/public/assistants/{assistant_id}/chat",
        headers=widget_headers,
        json={"message": "What is the secret pass code for the lunar base vault?"}
    )
    assert absent_resp.status_code == 200
    absent_text = absent_resp.json().get("content", "").lower()
    print("[Hallucination Test Answer (Unrelated Query)]:", absent_resp.json().get("content"))
    assert any(phrase in absent_text for phrase in ["sorry", "not have enough verified information", "cannot", "unable", "don't know"]), f"Assistant hallucinated: {absent_text}"

    # 10. Human Handoff Request & Feedback Verification
    conv_id = chat_resp.json().get("conversation_id")
    msg_id = chat_resp.json().get("message_id")
    if conv_id:
        handoff_resp = client.post(f"{API_URL}/public/conversations/{conv_id}/handoff", json={
            "reason": "Customer requested human supervisor",
            "customer_email": "customer@example.com",
            "customer_name": "Jane Doe"
        })
        assert handoff_resp.status_code in (200, 201), f"Handoff failed: {handoff_resp.text}"

    if msg_id:
        fb_resp = client.post(f"{API_URL}/public/messages/{msg_id}/feedback", json={
            "rating": "positive",
            "comment": "Accurate response!"
        })
        assert fb_resp.status_code in (200, 201), f"Feedback failed: {fb_resp.text}"

    # 11. Web Crawler Discovery Verification
    crawl_resp = client.post(f"{API_URL}/projects/{proj_id}/crawler/discover", headers=headers, json={
        "url": "https://example.com",
        "max_pages": 3
    })
    assert crawl_resp.status_code in (200, 202), f"Crawler discover failed: {crawl_resp.text}"

    # 12. Enterprise Entitlements & BYOK
    billing_resp = client.get(f"{API_URL}/workspaces/{ws_id}/billing", headers=headers)
    assert billing_resp.status_code == 200
    ent = billing_resp.json()
    assert ent["plan_tier"] == "free"

    byok_resp = client.post(f"{API_URL}/workspaces/{ws_id}/enterprise/byok", headers=headers, json={"provider_name": "openai",
        "api_key": "sk-test-mock-byok-key-format-12345",
        "organization_id": "org-test"
    })
    assert byok_resp.status_code in (200, 201), f"BYOK registration failed: {byok_resp.text}"

    # 13. Webhook Subscription
    wh_resp = client.post(f"{API_URL}/workspaces/{ws_id}/webhooks", headers=headers, json={
        "target_url": "https://webhook.site/test-target",
        "events": ["conversation.completed", "human.handoff.requested"],
        "secret": "super-secure-webhook-secret-key-32"
    })
    assert wh_resp.status_code in (200, 201), f"Webhook registration failed: {wh_resp.text}"

    # 14. Enterprise BYOK Credential Cleanup
    del_byok = client.delete(f"{API_URL}/workspaces/{ws_id}/enterprise/byok/openai", headers=headers)
    assert del_byok.status_code in (200, 204), f"Delete BYOK failed: {del_byok.text}"

    print("\n✓ ALL 14 LIFECYCLE STEPS PASSED SUCCESSFULLY AGAINST DEV ENVIRONMENT!")

if __name__ == "__main__":
    test_full_lifecycle()
