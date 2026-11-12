import uuid

from pydantic import BaseModel, Field, field_validator


class ShopifyOAuthStartRequest(BaseModel):
    shop_domain: str = Field(..., min_length=1, max_length=253)


class ShopifyOAuthStartResponse(BaseModel):
    authorization_url: str


class IntegrationSyncResponse(BaseModel):
    integration_id: uuid.UUID
    status: str


class DemoOAuthStartResponse(BaseModel):
    authorization_url: str


class DemoOAuthCompleteRequest(BaseModel):
    state: str = Field(..., min_length=20, max_length=2048)
    approved: bool


class DemoOAuthCompleteResponse(BaseModel):
    status: str
    integration_id: uuid.UUID | None = None


class MockDriveItemResponse(BaseModel):
    id: str
    name: str
    type: str
    parent_id: str | None
    modified_at: str | None
    mime_type: str


class MockDriveItemsResponse(BaseModel):
    parent_id: str | None
    items: list[MockDriveItemResponse]


class MockDriveSyncRequest(BaseModel):
    file_ids: list[str] = Field(..., min_length=0, max_length=50)

    @field_validator("file_ids")
    @classmethod
    def validate_file_ids(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value) or any(
            not file_id.startswith("demo-drive-file-") or len(file_id) > 100 for file_id in value
        ):
            raise ValueError("Select valid, unique files from the demo Drive.")
        return value
