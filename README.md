1
# Target Process Documentation Scraper

This tool scrapes the Target Process documentation from https://dev.targetprocess.com/docs and converts it to a local markdown documentation repository with full-text search capabilities.

## Features

- Converts HTML documentation to Markdown format
- Maintains original documentation structure
- Preserves internal links and references
- Handles errors gracefully
- Full-text search with SQLite FTS5
- Tracks document relationships through internal links
- Colored search result highlighting

## Setup

1. Clone this repository
2. Install dependencies:
```bash
npm install
```
3. System Requirements:
   - sqlite3: Required for search functionality
   - jq: Required for JSON processing (installed automatically via npm)
   - glow: Optional, recommended for enhanced markdown rendering (installed automatically via npm)

## Usage

### Refresh Documentation

Run the documentation scraper and build the search index:
```bash
./refresh-docs.sh
```

This will:
1. Install dependencies if needed
2. Remove any existing docs and search index
3. Scrape and convert the latest documentation
4. Build a searchable SQLite database
5. Save all files in the `docs/` directory

### Search Documentation

Use the search script to find documentation:
```bash
./search-docs.sh [OPTIONS] <search_term>
```

Options:
- `-h, --help`: Show help message
- `-t, --title`: Search in titles only
- `-p, --path`: Search in file paths
- `-r, --related`: Show related documents for a given path
- `-l, --limit N`: Limit results (default: 10)

Examples:
```bash
# Full-text search
./search-docs.sh api

# Search titles only
./search-docs.sh -t "getting started"

# Search paths
./search-docs.sh -p automation

# Find related documents
./search-docs.sh -r api-v1-overview.md
```

## Output

The following files are generated:
- `docs/`: Directory containing markdown files (git-ignored)
- `docs.db`: SQLite search database (git-ignored)
- `docs/metadata.json`: Contains last scrape time and document count

Note: All generated files are git-ignored - you'll need to run the scraper to populate them with the latest documentation. The metadata file helps track when the documentation was last updated to avoid unnecessary scraping.

### Search Results Display

Search results are displayed directly in the terminal:

1. With `glow` (recommended):
   - Terminal-optimized markdown rendering
   - Link highlighting
   - List formatting
   - Table support
   - Installed automatically via npm dependencies

2. Without `glow`:
   - Plain text display
   - Basic markdown readability
   - No special formatting

## Project Structure

- `scrape.js` - Main scraper script
- `build-search-db.js` - Builds SQLite search database
- `refresh-docs.sh` - Convenience script to refresh documentation and search index
- `search-docs.sh` - Search interface for documentation
- `package.json` - Project dependencies
- `.gitignore` - Excludes scraped content, search index, and dependencies
