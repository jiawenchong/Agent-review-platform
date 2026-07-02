"""CLI script to create or reset an admin user in the governance database.

Usage (run from the backend/ directory):
    python scripts/create_admin.py --empno A123456 --name "王小明" --password "my_password"

Options:
    --empno      Employee number used for login (required)
    --name       Display name shown in the sidebar (required)
    --password   Initial login password; stored as bcrypt hash (required)
    --role       Role to assign: admin | manager | member  (default: admin)
    --reset      If the empno already exists, overwrite name/role/password_hash

The script writes to governance.db in the backend/ folder (same DB the server uses).
Run it once to bootstrap the first admin, then log in normally through the web UI.
"""
import argparse
import sys
from pathlib import Path

# Allow imports from backend/app without installing the package.
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv

load_dotenv(BACKEND_DIR / "credentials.env")

from app.database import Base, SessionLocal, engine
from app.models import User
from app.services.auth_service import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or reset an admin user")
    parser.add_argument("--empno", required=True, help="Employee number (login username)")
    parser.add_argument("--name", required=True, help="Display name")
    parser.add_argument("--password", required=True, help="Login password")
    parser.add_argument("--role", default="admin", choices=["admin", "manager", "member"])
    parser.add_argument("--reset", action="store_true", help="Overwrite if empno already exists")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing: User | None = db.query(User).filter_by(empno=args.empno).first()

        if existing:
            if not args.reset:
                print(f"ERROR: User with empno '{args.empno}' already exists.")
                print("Use --reset to overwrite the existing account.")
                sys.exit(1)
            existing.name = args.name
            existing.role = args.role
            existing.is_manager = args.role in ("admin", "manager")
            existing.password_hash = hash_password(args.password)
            db.commit()
            print(f"Updated: {existing.name} ({args.empno})  role={args.role}")
        else:
            user = User(
                user_id=args.empno,
                name=args.name,
                is_manager=args.role in ("admin", "manager"),
                project_ids=[],
                empno=args.empno,
                role=args.role,
                password_hash=hash_password(args.password),
            )
            db.add(user)
            db.commit()
            print(f"Created: {user.name} ({args.empno})  role={args.role}")

        print("Done. You can now log in with this empno and password.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
