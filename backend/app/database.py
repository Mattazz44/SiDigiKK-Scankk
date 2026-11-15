from collections.abc import Generator
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
TEMP_OCR_DIR = STORAGE_DIR / "temp_ocr"
UPLOADS_DIR = STORAGE_DIR / "uploads"

load_dotenv(BASE_DIR / ".env")


def _resolve_database_url() -> str:
    raw_url = os.getenv("DATABASE_URL", "").strip()
    if not raw_url:
        db_path = (STORAGE_DIR / "sidigikk.db").resolve()
        return f"sqlite:///{db_path.as_posix()}"

    # Resolve relative SQLite paths against backend/ so launches from any cwd share one DB file.
    if raw_url.startswith("sqlite:///./"):
        rel_path = raw_url.removeprefix("sqlite:///./")
        db_path = (BASE_DIR / rel_path).resolve()
        return f"sqlite:///{db_path.as_posix()}"

    return raw_url


DATABASE_URL = _resolve_database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

connect_args = {"check_same_thread": False} if IS_SQLITE else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=not IS_SQLITE,
)


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
    # SQLite disables ON DELETE CASCADE unless PRAGMA foreign_keys is enabled per connection.
    if IS_SQLITE:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def ensure_storage_dirs() -> None:
    TEMP_OCR_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def init_db() -> None:
    """Create storage directories and initialize all ORM tables."""
    ensure_storage_dirs()
    from app import models  # noqa: F401 - register ORM models before metadata creation

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Yield a request-scoped SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
