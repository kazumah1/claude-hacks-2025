#!/bin/bash
# Stop script for the FastAPI backend server

PORT=${1:-8000}

if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "Stopping server on port $PORT..."
    lsof -ti:$PORT | xargs kill -9 2>/dev/null
    echo "Server stopped."
else
    echo "No server running on port $PORT"
fi

