from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime
from config import settings

engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    agent = Column(String)  # Wallet, Research, Execution, Monitoring
    action = Column(String)
    details = Column(String)
    tx_hash = Column(String, nullable=True)

class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    user_address = Column(String, index=True)
    token_symbol = Column(String)
    token_address = Column(String)
    amount = Column(Float)
    buy_price = Column(Float)
    take_profit = Column(Float)
    stop_loss = Column(Float)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String)  # ACTIVE, CLOSED
    exit_price = Column(Float, nullable=True)
    exit_tx_hash = Column(String, nullable=True)

class Delegation(Base):
    __tablename__ = "delegations"

    id = Column(Integer, primary_key=True, index=True)
    user_address = Column(String, unique=True, index=True)
    max_spend_trade = Column(Float)
    max_spend_week = Column(Float)
    expiry = Column(Integer)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
