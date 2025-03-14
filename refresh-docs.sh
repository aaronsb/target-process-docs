#!/bin/bash

# Function to show usage
show_usage() {
    echo "Usage: ./refresh-docs.sh [OPTIONS]"
    echo
    echo "Options:"
    echo "  --scrape              Scrape general documentation (requires --force if docs exist)"
    echo "  --force               Force scraping even if docs exist"
    echo "  --api-site <url>      Scrape API documentation from specific site"
    echo "  --generate-openapi    Generate OpenAPI specification from scraped API docs"
    echo "  --site-name <name>    Site name for OpenAPI generation (derived from URL if not provided)"
    echo "  --help                Show this help message"
    echo
    echo "Examples:"
    echo "  ./refresh-docs.sh --scrape                   # Scrape general documentation"
    echo "  ./refresh-docs.sh --api-site https://example.tpondemand.com  # Scrape API docs"
    echo "  ./refresh-docs.sh --generate-openapi --site-name example     # Generate OpenAPI spec"
}

# Parse command line arguments
SCRAPE=false
FORCE=false
API_SITE=""
SITE_NAME=""
GENERATE_OPENAPI=false

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
        --api-site)
            API_SITE="$2"
            shift 2
            ;;
        --site-name)
            SITE_NAME="$2"
            shift 2
            ;;
        --generate-openapi)
            GENERATE_OPENAPI=true
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

# Check for xml2js dependency (needed for API scraper)
if [ -n "$API_SITE" ] || [ "$GENERATE_OPENAPI" = true ]; then
    if ! grep -q "xml2js" package.json; then
        echo "Installing xml2js dependency for API scraping..."
        npm install xml2js
    fi
fi

# Handle general documentation scraping
if [ "$SCRAPE" = true ]; then
    if [ -d "docs" ] && [ -f "docs/metadata.json" ] && [ "$FORCE" = false ]; then
        echo "Error: Documentation already exists. Use --force to rescrape."
        exit 1
    fi
    
    if [ -d "docs" ] && [ "$FORCE" = true ]; then
        echo "Force flag detected. Removing existing documentation..."
        rm -rf docs
        rm -f docs.db
    fi
    
    echo "Running general documentation scraper..."
    node scrape.js
    
    echo "Building search database..."
    node build-search-db.js
fi

# Handle API documentation scraping
if [ -n "$API_SITE" ]; then
    echo "Scraping API documentation from $API_SITE..."
    node site-api-scraper.js --site "$API_SITE"
    
    # Extract site name from URL if not provided
    if [ -z "$SITE_NAME" ]; then
        SITE_NAME=$(echo "$API_SITE" | sed -E 's/https?:\/\/([^.]+).*/\1/')
    fi
    
    # Auto-generate OpenAPI if requested
    if [ "$GENERATE_OPENAPI" = true ]; then
        echo "Generating OpenAPI specification for $SITE_NAME..."
        node openapi-generator.js --site "$SITE_NAME"
    fi
fi

# If only OpenAPI generation was requested
if [ "$GENERATE_OPENAPI" = true ] && [ -z "$API_SITE" ]; then
    if [ -z "$SITE_NAME" ]; then
        echo "Error: Site name is required for OpenAPI generation. Use --site-name <name>"
        exit 1
    fi
    
    echo "Generating OpenAPI specification for $SITE_NAME..."
    node openapi-generator.js --site "$SITE_NAME"
fi

echo "Operation completed successfully!"
