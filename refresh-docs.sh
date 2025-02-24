#!/bin/bash

echo "Refreshing Target Process Documentation..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Remove old docs directory if it exists
if [ -d "docs" ]; then
    echo "Removing old docs..."
    rm -rf docs
fi

# Run the scraper
echo "Running scraper..."
node scrape.js

echo "Documentation refresh complete!"
