# Target Process Documentation Scraper

This tool scrapes the Target Process documentation from https://dev.targetprocess.com/docs and converts it to a local markdown documentation repository.

## Features

- Converts HTML documentation to Markdown format
- Maintains original documentation structure
- Preserves internal links and references
- Handles errors gracefully

## Setup

1. Clone this repository
2. Install dependencies:
```bash
npm install
```

## Usage

Run the documentation scraper:
```bash
./refresh-docs.sh
```

This will:
1. Install dependencies if needed
2. Remove any existing docs (if present)
3. Scrape and convert the latest documentation
4. Save all files in the `docs/` directory

## Output

The scraped documentation will be saved in the `docs/` directory, maintaining the original URL path structure. Note that the `docs/` directory is git-ignored - you'll need to run the scraper to populate it with the latest documentation.

## Project Structure

- `scrape.js` - Main scraper script
- `refresh-docs.sh` - Convenience script to refresh documentation
- `package.json` - Project dependencies
- `.gitignore` - Excludes scraped content and dependencies from version control
