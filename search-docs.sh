#!/bin/bash

# Check required dependencies
check_dependency() {
    if ! command -v "$1" &> /dev/null; then
        return 1
    fi
    return 0
}

if ! check_dependency sqlite3; then
    echo "Error: sqlite3 is required but not installed."
    echo "Please install sqlite3 to use this script."
    exit 1
fi

# Check if database and metadata exist
if [ ! -f "docs.db" ] || [ ! -f "docs/metadata.json" ]; then
    echo "Error: Search database or metadata not found!"
    echo "Run './refresh-docs.sh' first to build the documentation and search index"
    exit 1
fi

# Show last scrape time
echo "Documentation metadata:"
if check_dependency jq; then
    cat docs/metadata.json | jq -r '"Last scraped: \(.lastScraped)\nTotal documents: \(.totalDocuments)"'
else
    echo "Last scraped: $(grep lastScraped docs/metadata.json | cut -d'"' -f4)"
    echo "Total documents: $(grep totalDocuments docs/metadata.json | tr -d ' ,')"
fi
echo "----------------------------------------"

# Function to show usage
show_usage() {
    echo "Usage: ./search-docs.sh [OPTIONS] <search_term>"
    echo
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -e, --exact         Exact phrase matching"
    echo
    echo "Examples:"
    echo "  ./search-docs.sh api                    # Search for 'api'"
    echo "  ./search-docs.sh -e 'exact phrase'     # Search for exact phrase"
}

# Default values
SEARCH_TERM=""
EXACT_MATCH=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -e|--exact)
            EXACT_MATCH=true
            shift
            ;;
        *)
            SEARCH_TERM="$1"
            shift
            ;;
    esac
done

# Check if search term is provided
if [ -z "$SEARCH_TERM" ]; then
    echo "Error: No search term provided"
    show_usage
    exit 1
fi

# Format the search term for exact matching if needed
if [ "$EXACT_MATCH" = true ]; then
    SEARCH_TERM="\"$SEARCH_TERM\""
fi

echo "Searching for: $SEARCH_TERM"
echo "----------------------------------------"

# Get best match and render its content
best_match=$(sqlite3 docs.db "SELECT path, title FROM docs WHERE docs MATCH '$SEARCH_TERM' ORDER BY rank LIMIT 1;")

if [ ! -z "$best_match" ]; then
    IFS='|' read -r path title <<< "$best_match"
    echo -e "\033[1;34m$(pwd)/docs/$path\033[0m"
    echo -e "\033[1m$title\033[0m"
    echo
    cat "docs/$path"
    echo
fi

echo "----------------------------------------"
echo -e "\033[1mRelated files:\033[0m"
echo

# List other relevant files
sqlite3 docs.db <<EOF | while read -r path; do echo -e "\033[0;36m$(pwd)/docs/$path\033[0m"; done
SELECT DISTINCT path
FROM docs
WHERE docs MATCH '$SEARCH_TERM'
  AND path != '$path'
ORDER BY rank
LIMIT 9;
EOF
