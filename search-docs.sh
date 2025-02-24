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

# Function to render markdown
render_markdown() {
    local file="$1"
    if check_dependency mdcat; then
        # Use mdcat for terminal markdown rendering in ANSI mode
        mdcat --ansi --no-pager "$file"
    else
        # Simple fallback - just output the content
        cat "$file"
    fi
}

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
    echo "Total documents: $(grep totalDocuments docs/metadata.json | cut -d':' -f2 | tr -d ' ,')"
fi
echo "----------------------------------------"

# Function to show usage
show_usage() {
    echo "Usage: ./search-docs.sh [OPTIONS] <search_term>"
    echo
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -t, --title         Search in titles only"
    echo "  -p, --path          Search in file paths"
    echo "  -r, --related       Show related documents for a given path"
    echo "  -l, --limit N       Limit results (default: 10)"
    echo
    echo "Examples:"
    echo "  ./search-docs.sh api                    # Search for 'api' in all content"
    echo "  ./search-docs.sh -t 'getting started'   # Search for 'getting started' in titles"
    echo "  ./search-docs.sh -p automation          # Search for 'automation' in paths"
    echo "  ./search-docs.sh -r api-v1-overview.md  # Show related documents"
}

# Default values
LIMIT=10
SEARCH_TYPE="content"
SEARCH_TERM=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -t|--title)
            SEARCH_TYPE="title"
            shift
            ;;
        -p|--path)
            SEARCH_TYPE="path"
            shift
            ;;
        -r|--related)
            SEARCH_TYPE="related"
            shift
            ;;
        -l|--limit)
            LIMIT="$2"
            shift
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

# Function to format results and show content
format_results() {
    while IFS='|' read -r path title snippet; do
        echo -e "\n\033[1;34m$path\033[0m"
        if [ ! -z "$title" ]; then
            echo -e "\033[1m$title\033[0m"
        fi
        if [ ! -z "$snippet" ]; then
            echo -e "$snippet\n"
        fi
        
        # Display rendered markdown content if file exists
        if [ -f "docs/$path" ]; then
            echo -e "\033[1mContent:\033[0m"
            render_markdown "docs/$path"
            echo
        fi
        echo "----------------------------------------"
    done
}

# Perform search based on type
case $SEARCH_TYPE in
    "content")
        echo "Searching content for: $SEARCH_TERM"
        sqlite3 docs.db <<EOF | format_results
WITH RECURSIVE
matched_docs AS (
    SELECT path, title, snippet(docs, 2, '\033[1;31m', '\033[0m', '...', 64) as snippet
    FROM docs
    WHERE docs MATCH '$SEARCH_TERM'
    LIMIT $LIMIT
)
SELECT path, title, snippet FROM matched_docs;
EOF
        ;;
    "title")
        echo "Searching titles for: $SEARCH_TERM"
        sqlite3 docs.db <<EOF | format_results
SELECT path, title, ''
FROM docs
WHERE title MATCH '$SEARCH_TERM'
LIMIT $LIMIT;
EOF
        ;;
    "path")
        echo "Searching paths for: $SEARCH_TERM"
        sqlite3 docs.db <<EOF | format_results
SELECT path, title, ''
FROM docs
WHERE path MATCH '$SEARCH_TERM'
LIMIT $LIMIT;
EOF
        ;;
    "related")
        echo "Finding documents related to: $SEARCH_TERM"
        sqlite3 docs.db <<EOF | format_results
WITH RECURSIVE
related_docs AS (
    SELECT DISTINCT d.path, d.title, ''
    FROM docs d
    JOIN relationships r ON d.path = r.target_id
    WHERE r.source_id = '$SEARCH_TERM'
    UNION
    SELECT DISTINCT d.path, d.title, ''
    FROM docs d
    JOIN relationships r ON d.path = r.source_id
    WHERE r.target_id = '$SEARCH_TERM'
)
SELECT path, title, '' FROM related_docs
LIMIT $LIMIT;
EOF
        ;;
esac
