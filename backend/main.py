from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
import datetime
import os

from config import settings
from database import init_db, get_db, ActivityLog, Position, Delegation
from agents import (
    WalletAnalysisAgent,
    ResearchAgent,
    MonitoringAgent,
    TOKEN_ADDRESSES,
    TOKEN_DECIMALS,
    get_token_price,
    get_w3
)

# Initialize database
init_db()

app = FastAPI(title="Jinni Autonomous Wallet Agent API")

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Models
class WalletAnalysisRequest(BaseModel):
    user_address: str

class UpdateDelegationRequest(BaseModel):
    user_address: str
    max_spend_trade: float
    max_spend_week: float
    duration_days: int

class ScoreTokenRequest(BaseModel):
    symbol: str

class RecordTradeRequest(BaseModel):
    user_address: str
    token_in_symbol: str
    token_out_symbol: str
    amount_in_usd: float
    tx_hash: str
    take_profit_pct: float = 10.0
    stop_loss_pct: float = 5.0

class RecordExitRequest(BaseModel):
    position_id: int
    exit_price: float
    tx_hash: str

class RevokePermissionRequest(BaseModel):
    user_address: str

class LogActionRequest(BaseModel):
    agent: str
    action: str
    details: str
    tx_hash: str = ""


@app.get("/api/status")
def get_status():
    w3 = get_w3()
    connected = w3.is_connected()
    return {
        "status": "online",
        "sepolia_connected": connected,
        "delegator_contract": settings.DELEGATOR_CONTRACT_ADDRESS,
        "supported_tokens": list(TOKEN_ADDRESSES.keys()),
        "token_addresses": TOKEN_ADDRESSES,
        "token_decimals": TOKEN_DECIMALS
    }


@app.post("/api/update-delegation")
def update_delegation(req: UpdateDelegationRequest, db: Session = Depends(get_db)):
    try:
        delegation = db.query(Delegation).filter(Delegation.user_address == req.user_address).first()
        if not delegation:
            delegation = Delegation(
                user_address=req.user_address,
                max_spend_trade=req.max_spend_trade,
                max_spend_week=req.max_spend_week,
                expiry=int((datetime.datetime.utcnow() + datetime.timedelta(days=req.duration_days)).timestamp()),
                active=True
            )
            db.add(delegation)
        else:
            delegation.max_spend_trade = req.max_spend_trade
            delegation.max_spend_week = req.max_spend_week
            delegation.expiry = int((datetime.datetime.utcnow() + datetime.timedelta(days=req.duration_days)).timestamp())
            delegation.active = True
        db.commit()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze-wallet")
def analyze_wallet(req: WalletAnalysisRequest, db: Session = Depends(get_db)):
    try:
        policy = WalletAnalysisAgent.analyze(req.user_address, db)

        # Save or update delegation settings in database
        delegation = db.query(Delegation).filter(Delegation.user_address == req.user_address).first()
        if not delegation:
            delegation = Delegation(
                user_address=req.user_address,
                max_spend_trade=policy.get("max_spend_trade", 5.0),
                max_spend_week=policy.get("max_spend_week", 20.0),
                expiry=int((datetime.datetime.utcnow() + datetime.timedelta(days=policy.get("duration_days", 7))).timestamp()),
                active=True
            )
            db.add(delegation)
        else:
            delegation.max_spend_trade = policy.get("max_spend_trade", 5.0)
            delegation.max_spend_week = policy.get("max_spend_week", 20.0)
            delegation.expiry = int((datetime.datetime.utcnow() + datetime.timedelta(days=policy.get("duration_days", 7))).timestamp())
            delegation.active = True
        db.commit()

        return policy
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/score-token")
def score_token(req: ScoreTokenRequest, db: Session = Depends(get_db)):
    try:
        if req.symbol.upper() not in TOKEN_ADDRESSES:
            raise HTTPException(status_code=400, detail=f"Token {req.symbol} is not supported.")
        result = ResearchAgent.score_token(req.symbol, db)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/record-trade")
def record_trade(req: RecordTradeRequest, db: Session = Depends(get_db)):
    """Records a trade that was executed on-chain by the frontend via MetaMask.
    The backend just tracks the position in the database for monitoring."""
    try:
        # Check active delegation first
        delegation = db.query(Delegation).filter(
            Delegation.user_address == req.user_address,
            Delegation.active == True
        ).first()

        if not delegation:
            raise HTTPException(status_code=400, detail="No active delegation found. Please grant permissions first.")

        if req.amount_in_usd > delegation.max_spend_trade:
            raise HTTPException(status_code=400, detail=f"Amount exceeds maximum allowed trade size of ${delegation.max_spend_trade}")

        # Calculate pricing levels for positions
        buy_price = get_token_price(req.token_out_symbol)
        take_profit_price = buy_price * (1 + req.take_profit_pct / 100.0)
        stop_loss_price = buy_price * (1 - req.stop_loss_pct / 100.0)

        # Estimate bought amount
        actual_bought = req.amount_in_usd / buy_price if buy_price > 0 else 0

        # Save active position
        new_position = Position(
            user_address=req.user_address,
            token_symbol=req.token_out_symbol.upper(),
            token_address=TOKEN_ADDRESSES.get(req.token_out_symbol.upper(), ""),
            amount=actual_bought,
            buy_price=buy_price,
            take_profit=take_profit_price,
            stop_loss=stop_loss_price,
            status="ACTIVE"
        )
        db.add(new_position)

        # Log activity
        log = ActivityLog(
            agent="Execution",
            action="Trade Recorded",
            details=f"Swapped ${req.amount_in_usd} of {req.token_in_symbol} → {req.token_out_symbol} via user wallet on Sepolia.",
            tx_hash=req.tx_hash
        )
        db.add(log)
        db.commit()

        return {
            "status": "success",
            "tx_hash": req.tx_hash,
            "bought_amount": actual_bought,
            "buy_price": buy_price,
            "take_profit": take_profit_price,
            "stop_loss": stop_loss_price
        }
    except HTTPException:
        raise
    except Exception as e:
        db.add(ActivityLog(agent="Execution", action="Trade Record Failed", details=str(e)))
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/monitor-positions")
def monitor_positions(db: Session = Depends(get_db)):
    """Returns exit signals for active positions. Frontend executes exits via MetaMask."""
    try:
        results = MonitoringAgent.monitor_positions(db)
        return {"status": "success", "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/record-exit")
def record_exit(req: RecordExitRequest, db: Session = Depends(get_db)):
    """Records a position exit that was executed by the frontend via MetaMask."""
    try:
        position = db.query(Position).filter(Position.id == req.position_id).first()
        if not position:
            raise HTTPException(status_code=404, detail="Position not found")

        position.status = "CLOSED"
        position.exit_price = req.exit_price
        position.exit_tx_hash = req.tx_hash

        log = ActivityLog(
            agent="Monitoring",
            action="Position Closed",
            details=f"Closed {position.token_symbol} position #{position.id}. Exit price: ${req.exit_price:.2f}",
            tx_hash=req.tx_hash
        )
        db.add(log)
        db.commit()

        return {"status": "success", "message": f"Position #{req.position_id} closed."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/log-action")
def log_action(req: LogActionRequest, db: Session = Depends(get_db)):
    """Generic endpoint for frontend to push audit log entries."""
    try:
        log = ActivityLog(
            agent=req.agent,
            action=req.action,
            details=req.details,
            tx_hash=req.tx_hash if req.tx_hash else None
        )
        db.add(log)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/revoke-permission")
def revoke_permission(req: RevokePermissionRequest, db: Session = Depends(get_db)):
    try:
        delegation = db.query(Delegation).filter(Delegation.user_address == req.user_address).first()
        if delegation:
            delegation.active = False
            db.commit()

        db.add(ActivityLog(
            agent="Wallet",
            action="Revoke Delegation",
            details=f"Delegation permission revoked for user {req.user_address}"
        ))
        db.commit()

        return {"status": "success", "message": "Delegation deactivated in backend database."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/activity-logs")
def get_logs(db: Session = Depends(get_db)):
    logs = db.query(ActivityLog).order_by(ActivityLog.timestamp.desc()).limit(50).all()
    return logs


@app.get("/api/positions")
def get_positions(user_address: str, db: Session = Depends(get_db)):
    positions = db.query(Position).filter(Position.user_address == user_address).order_by(Position.timestamp.desc()).all()
    return positions


@app.get("/api/delegation")
def get_delegation(user_address: str, db: Session = Depends(get_db)):
    delegation = db.query(Delegation).filter(Delegation.user_address == user_address).first()
    return delegation


class UpdateTokensRequest(BaseModel):
    usdc_address: str
    link_address: str
    uni_address: str

@app.post("/api/update-tokens")
def update_tokens(req: UpdateTokensRequest, db: Session = Depends(get_db)):
    try:
        from web3 import Web3
        import agents as agents_module

        # Normalize to checksummed addresses to avoid case/format bugs
        usdc = Web3.to_checksum_address(req.usdc_address)
        link = Web3.to_checksum_address(req.link_address)
        uni  = Web3.to_checksum_address(req.uni_address)

        # Update in-memory dictionaries (both main.py and agents.py)
        TOKEN_ADDRESSES["USDC"] = usdc
        TOKEN_ADDRESSES["LINK"] = link
        TOKEN_ADDRESSES["UNI"]  = uni
        agents_module.TOKEN_ADDRESSES["USDC"] = usdc
        agents_module.TOKEN_ADDRESSES["LINK"] = link
        agents_module.TOKEN_ADDRESSES["UNI"]  = uni

        # Write to .env file
        env_path = ".env"
        lines = []
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                lines = f.readlines()

        # Filter out existing token entries
        keys_to_remove = ["USDC_ADDRESS=", "LINK_ADDRESS=", "UNI_ADDRESS="]
        lines = [l for l in lines if not any(l.startswith(k) for k in keys_to_remove)]

        # Append new checksummed values
        lines.append(f"\nUSDC_ADDRESS={usdc}\n")
        lines.append(f"LINK_ADDRESS={link}\n")
        lines.append(f"UNI_ADDRESS={uni}\n")

        with open(env_path, "w") as f:
            f.writelines(lines)

        # Log action
        db.add(ActivityLog(
            agent="Wallet",
            action="Mocks Deployed",
            details=f"Custom Mock tokens registered: USDC={usdc[:10]}... LINK={link[:10]}... UNI={uni[:10]}..."
        ))
        db.commit()

        return {"status": "success", "message": "Tokens updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
