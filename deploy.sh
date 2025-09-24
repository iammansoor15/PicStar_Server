#!/bin/bash

# Universal Deployment Script for Narayana App Server
# Works on any platform that supports Node.js

echo "🚀 Starting Narayana App Server deployment..."

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Please run this script from the server directory."
    exit 1
fi

echo "✅ Node.js and npm are available"

# Install dependencies
echo "📦 Installing production dependencies..."
npm install --production --silent

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating from example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Created .env from .env.example"
        echo "⚠️  Please edit .env with your production values before starting the server"
    else
        echo "❌ No .env.example found. Please create a .env file manually."
        exit 1
    fi
fi

# Create logs directory if it doesn't exist
mkdir -p logs

echo "✅ Setup completed successfully!"
echo ""
echo "🔧 Next steps:"
echo "1. Edit .env with your production values:"
echo "   - Set NODE_ENV=production"
echo "   - Set SERVER_URL to your deployed URL"
echo "   - Configure other environment variables as needed"
echo ""
echo "2. Start the server:"
echo "   npm start"
echo ""
echo "3. Test the deployment:"
echo "   curl http://localhost:3000/health"
echo ""
echo "📱 Configure your mobile app:"
echo "   Enter your server URL in the ServerConfig component"
echo ""
echo "🎉 Ready for deployment on any platform!"