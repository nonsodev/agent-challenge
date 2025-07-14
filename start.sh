#!/bin/bash

# Exit on any error
set -e

# Function to cleanup on exit
cleanup() {
    echo "Shutting down services..."
    kill $(jobs -p) 2>/dev/null || true
    wait
}

# Set trap for cleanup
trap cleanup EXIT INT TERM

# Start Ollama in the background
echo "Starting Ollama server..."
/usr/bin/ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready with timeout
echo "Waiting for Ollama to start..."
timeout=60
counter=0
until curl -s http://0.0.0.0:11434/api/tags > /dev/null; do
    if [ $counter -ge $timeout ]; then
        echo "Timeout waiting for Ollama to start"
        exit 1
    fi
    sleep 1
    counter=$((counter + 1))
done
echo "Ollama started successfully."

# Pull the specified model
echo "Pulling model: ${MODEL_NAME_AT_ENDPOINT:-qwen2.5:1.5b}"
/usr/bin/ollama pull "${MODEL_NAME_AT_ENDPOINT:-qwen2.5:1.5b}"

# Wait for the model to be ready for chat completions
echo "Waiting for model to be ready for chat completions..."
counter=0
until curl -s -X POST http://0.0.0.0:11434/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${MODEL_NAME_AT_ENDPOINT:-qwen2.5:1.5b}\",\"messages\":[{\"role\":\"user\",\"content\":\"test\"}],\"stream\":false}" \
  > /dev/null 2>&1; do
    if [ $counter -ge $timeout ]; then
        echo "Timeout waiting for model to be ready"
        exit 1
    fi
    echo "Model not ready yet, waiting..."
    sleep 2
    counter=$((counter + 2))
done
echo "Model is ready for chat completions."

# Set environment variables for the application
export API_BASE_URL=http://0.0.0.0:11434/api
export MODEL_NAME_AT_ENDPOINT=${MODEL_NAME_AT_ENDPOINT:-qwen2.5:1.5b}

# Kill any existing process on port 8080
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
sleep 2

# Start the Node.js application
echo "Starting Node.js application in dev mode..."
exec pnpm run dev