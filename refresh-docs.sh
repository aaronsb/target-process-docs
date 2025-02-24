#!/bin/bash

# Function to show usage
show_usage() {
    echo "Usage: ./refresh-docs.sh [OPTIONS]"
    echo
    echo "Options:"
    echo "  --scrape     Scrape new documentation (requires --force if docs exist)"
    echo "  --force      Force scraping even if docs exist"
    echo "  --help       Show this help message"
    echo
    echo "Default behavior: Rebuild search index if docs exist"
}

# Parse command line arguments
SCRAPE=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --scrape)
            SCRAPE=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo "Error: Unknown option $1"
            show_usage
            exit 1
            ;;
    esac
done

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Check if docs and metadata exist
if [ -d "docs" ] && [ -f "docs/metadata.json" ]; then
    # Show current metadata
    echo "Current documentation metadata:"
    if command -v jq &> /dev/null; then
        jq -r '"Last scraped: \(.lastScraped)\nTotal documents: \(.totalDocuments)"' docs/metadata.json
    else
        echo "Last scraped: $(grep lastScraped docs/metadata.json | cut -d'"' -f4)"
        echo "Total documents: $(grep totalDocuments docs/metadata.json | tr -d ' ,' | cut -d':' -f2)"
    fi
    echo "----------------------------------------"

    if [ "$SCRAPE" = true ]; then
        if [ "$FORCE" = false ]; then
            echo "Error: Documentation already exists. Use --force to rescrape."
            exit 1
        fi
        echo "Force flag detected. Removing existing documentation..."
        rm -rf docs
        rm -f docs.db
    else
        echo "Rebuilding search index only..."
    fi
else
    if [ "$SCRAPE" = false ]; then
        echo "No existing documentation found. Running scraper..."
        SCRAPE=true
    fi
fi

# Run the scraper if needed
if [ "$SCRAPE" = true ]; then
    echo "Running scraper..."
    node scrape.js
fi

# Build the search database
echo "Building search database..."
node build-search-db.js

echo "Documentation refresh complete!"
