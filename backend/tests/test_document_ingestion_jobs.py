import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from backend.app.db.session import async_session_factory
from backend.app.models.auth import User
from backend.app.models.project import Document, KnowledgeSource, KnowledgeSourceType, ProcessingJob
from sqlalchemy import select


async def _seed_job(status: str, attempts: int, updated_at: datetime, created_at: datetime | None = None):
    async with async_session_factory() as db:
        user = User(
            email=f"ingestion-job-{uuid.uuid4().hex}@example.com",
            hashed_password="not-a-real-password-hash",
            is_verified=True,
        )
        db.add(user)
        await db.flush()

        source = KnowledgeSource(user_id=user.id, name="Ingestion job test source", status="processing")
        db.add(source)
        await db.flush()

        document = Document(
            user_id=user.id,
            knowledge_source_id=source.id,
            filename="job-test.txt",
            mime_type="text/plain",
            file_size_bytes=1,
            content_hash=uuid.uuid4().hex,
            storage_path="/tmp/ingestion-job-test.txt",
            status="processing" if status == "processing" else "pending",
        )
        db.add(document)
        await db.flush()

        job = ProcessingJob(
            document_id=document.id,
            status=status,
            attempts=attempts,
            max_attempts=3,
            updated_at=updated_at,
        )
        if created_at is not None:
            job.created_at = created_at
        db.add(job)
        await db.commit()
        return job.id, document.id, user.id


def test_worker_claims_pending_job_atomically_and_increments_attempts():
    from backend.app.tasks.ingestion import _claim_next_ingestion_job

    job_id, document_id, user_id = asyncio.run(
        _seed_job(
            status="pending",
            attempts=0,
            updated_at=datetime.now(UTC),
            created_at=datetime(2000, 1, 1, tzinfo=UTC),
        )
    )

    claimed = asyncio.run(_claim_next_ingestion_job())
    assert claimed == (job_id, document_id, user_id)

    async def read_job():
        async with async_session_factory() as db:
            return await db.get(ProcessingJob, job_id)

    job = asyncio.run(read_job())
    assert job is not None
    assert job.status == "processing"
    assert job.attempts == 1


def test_stale_worker_claim_is_requeued_until_attempt_limit():
    from backend.app.tasks.ingestion import _recover_stale_ingestion_jobs

    job_id, document_id, _ = asyncio.run(
        _seed_job(
            status="processing",
            attempts=1,
            updated_at=datetime.now(UTC) - timedelta(minutes=10),
        )
    )

    asyncio.run(_recover_stale_ingestion_jobs())

    async def read_state():
        async with async_session_factory() as db:
            return await db.get(ProcessingJob, job_id), await db.get(Document, document_id)

    job, document = asyncio.run(read_state())
    assert job is not None
    assert document is not None
    assert job.status == "pending"
    assert job.attempts == 1
    assert document.status == "pending"


def test_stale_worker_claim_fails_document_after_attempt_limit():
    from backend.app.tasks.ingestion import _recover_stale_ingestion_jobs

    job_id, document_id, _ = asyncio.run(
        _seed_job(
            status="processing",
            attempts=3,
            updated_at=datetime.now(UTC) - timedelta(minutes=10),
        )
    )

    asyncio.run(_recover_stale_ingestion_jobs())

    async def read_state():
        async with async_session_factory() as db:
            return await db.get(ProcessingJob, job_id), await db.get(Document, document_id)

    job, document = asyncio.run(read_state())
    assert job is not None
    assert document is not None
    assert job.status == "failed"
    assert "maximum number" in job.error_message
    assert document.status == "failed"
    assert document.error_message == job.error_message


def test_worker_adopts_old_pending_documents_without_jobs():
    from backend.app.tasks.ingestion import _enqueue_orphaned_ingestion_jobs

    async def seed_orphan():
        async with async_session_factory() as db:
            user = User(
                email=f"orphaned-ingestion-{uuid.uuid4().hex}@example.com",
                hashed_password="not-a-real-password-hash",
                is_verified=True,
            )
            db.add(user)
            await db.flush()
            source = KnowledgeSource(
                user_id=user.id,
                name="Orphaned ingestion test source",
                source_type=KnowledgeSourceType.FILE_UPLOAD.value,
            )
            db.add(source)
            await db.flush()
            document = Document(
                user_id=user.id,
                knowledge_source_id=source.id,
                filename="orphaned.txt",
                mime_type="text/plain",
                file_size_bytes=1,
                content_hash=uuid.uuid4().hex,
                storage_path="/tmp/orphaned-ingestion-test.txt",
                status="pending",
                updated_at=datetime.now(UTC) - timedelta(minutes=10),
            )
            db.add(document)
            await db.commit()
            return document.id

    document_id = asyncio.run(seed_orphan())
    asyncio.run(_enqueue_orphaned_ingestion_jobs())

    async def read_jobs():
        async with async_session_factory() as db:
            result = await db.execute(select(ProcessingJob).where(ProcessingJob.document_id == document_id))
            return result.scalars().all()

    jobs = asyncio.run(read_jobs())
    assert len(jobs) == 1
    assert jobs[0].status == "pending"
