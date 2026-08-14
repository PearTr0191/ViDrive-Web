"""ViDrive Web API server entry point.

Run with:  python server.py
Or:        uvicorn server:app --reload --port 8000
"""
import uvicorn

from src.api import app

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
