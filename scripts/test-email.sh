#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Starting email functionality tests..."

# Check if the development server is running
if ! nc -z localhost 3000; then
  echo -e "${GREEN}Starting development server...${NC}"
  npm run dev &
  SERVER_PID=$!
  
  # Wait for the server to start
  echo "Waiting for server to start..."
  while ! nc -z localhost 3000; do
    sleep 1
  done
fi

# Open browser for authentication
echo -e "\n${GREEN}Opening browser for authentication...${NC}"
echo "Please sign in with your Google account when the browser opens."
open http://localhost:3000

# Wait for user to authenticate
read -p "Press Enter after you have signed in..."

# Test basic email
echo -e "\n${GREEN}Testing basic email functionality...${NC}"
curl -X POST http://localhost:3000/api/test-email \
  -H "Content-Type: application/json" \
  -H "Cookie: $(curl -s -I http://localhost:3000 | grep -i set-cookie)"

# Wait a bit between requests
sleep 2

# Test invitation email
echo -e "\n\n${GREEN}Testing invitation email functionality...${NC}"
curl -X POST http://localhost:3000/api/test-invitation \
  -H "Content-Type: application/json" \
  -H "Cookie: $(curl -s -I http://localhost:3000 | grep -i set-cookie)"

echo -e "\n\n${GREEN}Tests completed. Please check your email for:${NC}"
echo "1. A test email from Meetini"
echo "2. An invitation email for a test meeting"

# If we started the server, ask if we should stop it
if [ ! -z "$SERVER_PID" ]; then
  read -p "Would you like to stop the development server? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    kill $SERVER_PID
    echo "Development server stopped."
  fi
fi 
