import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from backend.app.core.database import SessionLocal
from backend.app.models.user import User
from backend.app.core.security import get_password_hash

def seed_users():
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            admin_user = User(
                username="admin",
                email="admin@example.com",
                password_hash=get_password_hash("adminpassword"),
                role="ADMIN"
            )
            db.add(admin_user)
            print("Created admin user")

        analyst_user = db.query(User).filter(User.username == "analyst").first()
        if not analyst_user:
            analyst_user = User(
                username="analyst",
                email="analyst@example.com",
                password_hash=get_password_hash("analystpassword"),
                role="ANALYST"
            )
            db.add(analyst_user)
            print("Created analyst user")

        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    seed_users()
