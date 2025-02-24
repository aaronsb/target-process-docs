#!/bin/bash

echo "Refreshing Target Process Documentation..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Remove old docs directory and database if they exist
if [ -d "docs" ]; then
    echo "Removing old docs..."
    rm -rf docs
fi
if [ -f "docs.db" ]; then
    echo "Removing old database..."
    rm docs.db
fi

# Run the scraper
echo "Running scraper..."
node scrape.js

# Build the search database
echo "Building search database..."
node build-search-db.js

echo "Documentation refresh complete!"
