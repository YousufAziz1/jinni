import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    VENICE_API_KEY: str = os.getenv("VENICE_API_KEY", "")
    SEPOLIA_RPC_URL: str = os.getenv("SEPOLIA_RPC_URL", "https://rpc.ankr.com/eth_sepolia/3dd47c69a2032becad5e2671e24b165b34c58d25829db2bd514d86a8f6967d6e")

    # Deployed JinniDelegator contract address on Sepolia
    DELEGATOR_CONTRACT_ADDRESS: str = os.getenv("DELEGATOR_CONTRACT_ADDRESS", "0x5462D420CEf200c8704Db6b48BE9Db3A000A231C")

    # Mock token addresses (written dynamically by /api/update-tokens)
    USDC_ADDRESS: str = os.getenv("USDC_ADDRESS", "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238")
    LINK_ADDRESS: str = os.getenv("LINK_ADDRESS", "0x779877A7B0D9E8603169DdbD7836e478b4624789")
    UNI_ADDRESS:  str = os.getenv("UNI_ADDRESS",  "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984")

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./jinni.db")
    PORT: int = int(os.getenv("PORT", "8000"))

    class Config:
        env_file = ".env"
        extra = "ignore"   # allow extra env vars without crashing

settings = Settings()
