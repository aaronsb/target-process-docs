# Target Process Documentation Scraper

This tool is designed to help automated code agents write better software by providing local, searchable access to Target Process documentation. By converting the documentation from https://dev.targetprocess.com/docs into a markdown repository with full-text search capabilities, it enables AI agents to quickly look up and reference Target Process concepts, APIs, and best practices while writing code.

## Features

- Optimized for AI code agents:
  - Markdown format for easy parsing and understanding
  - Fast full-text search with SQLite FTS5
  - Structured documentation with preserved relationships
  - Local access for quick reference during development
- Additional features:
  - Maintains original documentation structure
  - Preserves internal links and references
  - Handles errors gracefully
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

### Visualize Documentation Graph

Visualize the documentation structure and relationships in an interactive 3D graph:
```bash
./visualize-docs.sh [OPTIONS]
```

Options:
- `--db <path>`: Path to SQLite database file (default: docs.db)
- `--port <number>`: Port to run the server on (default: 8080)
- `-h, --help`: Show help message

This will:
1. Check if the database exists
2. Install dependencies if needed
3. Start a local web server
4. Open your browser to the visualization

The visualization provides:
- Interactive 3D graph of documents and sections
- Filtering by node and link types
- Search functionality
- Node highlighting and information display
- Camera controls and auto-rotation

Example:
```bash
# Run with default settings
./visualize-docs.sh

# Specify a different database file and port
./visualize-docs.sh --db custom-docs.db --port 3000
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
- `visualize-graph.js` - Extracts data from the database and serves the visualization
- `visualize-docs.sh` - Convenience script to run the visualization
- `visualization/` - Directory containing visualization files
  - `index.html` - Main visualization interface
- `package.json` - Project dependencies
- `.gitignore` - Excludes scraped content, search index, and dependencies
