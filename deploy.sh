#!/bin/bash

# Dice Game Deployment Script
# This script automates the build and deployment process

set -e  # Exit on any error

echo "Starting Dice Game Deployment..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}ERROR: Node.js version 18+ is required. Current version: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}OK: Node.js version: $(node -v)${NC}"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}WARNING: PM2 is not installed. Installing PM2 globally...${NC}"
    npm install -g pm2
    echo -e "${GREEN}OK: PM2 installed${NC}"
else
    echo -e "${GREEN}OK: PM2 is installed${NC}"
fi

# Check if .env files exist
if [ ! -f "server/.env" ]; then
    echo -e "${YELLOW}WARNING: server/.env not found. Creating from example...${NC}"
    if [ -f "server/.env.example" ]; then
        cp server/.env.example server/.env
        echo -e "${YELLOW}WARNING: Please edit server/.env with your production values before continuing.${NC}"
        read -p "Press Enter to continue after editing server/.env..."
    else
        echo -e "${RED}ERROR: server/.env.example not found. Cannot create .env file.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}OK: server/.env exists${NC}"
fi

if [ ! -f "client/.env" ]; then
    echo -e "${YELLOW}WARNING: client/.env not found. Creating from example...${NC}"
    if [ -f "client/.env.example" ]; then
        cp client/.env.example client/.env
        echo -e "${YELLOW}WARNING: Please edit client/.env with your production values before continuing.${NC}"
        read -p "Press Enter to continue after editing client/.env..."
    else
        echo -e "${RED}ERROR: client/.env.example not found. Cannot create .env file.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}OK: client/.env exists${NC}"
fi

echo ""
echo "Installing dependencies..."
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}OK: Dependencies installed${NC}"
else
    echo -e "${RED}ERROR: Failed to install dependencies${NC}"
    exit 1
fi

echo ""
echo "Building client..."
cd client
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}OK: Client built successfully${NC}"
else
    echo -e "${RED}ERROR: Client build failed${NC}"
    exit 1
fi
cd ..

echo ""
echo "Building server..."
cd server
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}OK: Server built successfully${NC}"
else
    echo -e "${RED}ERROR: Server build failed${NC}"
    exit 1
fi
cd ..

echo ""
echo "Creating logs directory..."
mkdir -p logs
echo -e "${GREEN}OK: Logs directory created${NC}"

echo ""
echo "Starting application with PM2..."

# Check if app is already running
if pm2 list | grep -q "dice-game"; then
    echo -e "${YELLOW}WARNING: Application is already running. Restarting...${NC}"
    pm2 restart dice-game
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}OK: Application restarted${NC}"
    else
        echo -e "${RED}ERROR: Failed to restart application${NC}"
        exit 1
    fi
else
    pm2 start ecosystem.config.js
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}OK: Application started${NC}"
    else
        echo -e "${RED}ERROR: Failed to start application${NC}"
        exit 1
    fi
fi

# Save PM2 process list
pm2 save

echo ""
echo -e "${GREEN}SUCCESS: Deployment completed successfully!${NC}"
echo ""
echo "Application Status:"
pm2 status

echo ""
echo "Useful commands:"
echo "  - View logs:      pm2 logs dice-game"
echo "  - Stop app:       pm2 stop dice-game"
echo "  - Restart app:    pm2 restart dice-game"
echo "  - Monitor:        pm2 monit"
echo ""
echo "Health check: curl http://localhost:3000/health"
echo ""

