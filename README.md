# Target Process Documentation Scraper

This tool scrapes Target Process documentation and provides searchable local markdown files. It includes the ability to scrape general documentation, site-specific API documentation, and generate OpenAPI specifications.

## Features

- Scrapes general documentation from dev.targetprocess.com/docs
- Converts HTML to markdown format
- Creates a searchable SQLite database with full-text search
- Scrapes site-specific API documentation from Target Process instances
- Generates OpenAPI specifications from site-specific API metadata
- **NEW**: Unified interactive script for all operations
- **NEW**: Organized output in a centralized directory structure

## Installation

```bash
git clone <this-repository>
cd target-process-docs
npm install
```

## Quick Start

Run the unified interactive script:

```bash
node tp-docs.js
# or
npm start
```

This will guide you through the available options:
- Scraping general documentation from dev.targetprocess.com
- Scraping API documentation from a specific Target Process site
- Generating OpenAPI specifications

## New Directory Structure

All generated content is now stored in the `generated/` directory:

```
generated/
├── dev-docs/       # General documentation
├── api-docs/       # Site-specific API documentation
│   └── sitename/   # Each site gets its own directory
└── openapi/        # OpenAPI specifications
```

For backward compatibility, symlinks are created from the legacy paths:
- `docs/` → `generated/dev-docs/`
- `api-docs/` → `generated/api-docs/`

## Legacy Command Line Usage

The legacy command line interface is still available:

### Scrape General Documentation

```bash
./refresh-docs.sh --scrape
```

This will:
1. Scrape documentation from dev.targetprocess.com/docs
2. Convert it to markdown format
3. Store the files in the `/docs` directory (symlinked to `/generated/dev-docs`)
4. Build a search database

To force a re-scrape of existing documentation:

```bash
./refresh-docs.sh --scrape --force
```

### Search Documentation

```bash
./search-docs.sh "your search query"
```

## Site-Specific API Documentation

The API scraper allows you to fetch and document site-specific API metadata from a Target Process instance.

### Scrape Site-Specific API

```bash
./refresh-docs.sh --api-site https://yoursitename.tpondemand.com
```

This will:
1. Connect to the specified Target Process instance
2. Fetch the API metadata
3. Store both raw XML/JSON data and formatted markdown documentation
4. Create the following structure:
   ```
   generated/api-docs/
   └── yoursitename/
       ├── resources/    # Raw XML/JSON data
       ├── markdown/     # Markdown documentation
       └── index-meta.*  # Index of all resources
   ```

### Generate OpenAPI Specification

You can generate an OpenAPI specification from the scraped API metadata:

```bash
./refresh-docs.sh --api-site https://yoursitename.tpondemand.com --generate-openapi
```

Or if you've already scraped the API metadata:

```bash
./refresh-docs.sh --generate-openapi --site-name yoursitename
```

The OpenAPI specification will be saved in two locations:
- `generated/api-docs/yoursitename/openapi.json` (original location)
- `generated/openapi/yoursitename-openapi.json` (centralized storage)

## Using the Generated Documentation

### General Documentation

General documentation is stored as markdown files in the `generated/dev-docs/` directory. You can:
- Read it directly in any markdown viewer
- Search it using the `search-docs.sh` script
- Visualize document relationships using `./visualize-docs.sh`

### Site-Specific API Documentation

API documentation is stored in `generated/api-docs/sitename/markdown/`. It includes:
- An index of all available resources
- Detailed documentation for each resource including properties, operations, and relationships
- Links between related resources

### OpenAPI Specification

The generated OpenAPI specification can be:
- Imported into tools like Swagger UI, Postman, or Insomnia
- Used to generate client libraries using tools like OpenAPI Generator
- Used as reference documentation for developers

## Scripts Reference

- `tp-docs.js` - **NEW** Unified interactive script for all operations
- `scrape.js` - Scrapes general documentation
- `site-api-scraper.js` - Scrapes site-specific API documentation
- `openapi-generator.js` - Generates OpenAPI specifications
- `build-search-db.js` - Builds the search database
- `refresh-docs.sh` - Command-line script that combines operations (legacy support)

## NPM Scripts

```bash
npm start            # Run the unified interactive script
npm run dev-docs     # Run the general documentation scraper
npm run build-search # Build the search database
npm run visualize    # Generate visualization
npm run api-scrape   # Run the site-specific API scraper (requires --site param)
npm run generate-openapi # Generate OpenAPI spec (requires --site param)
```

## Notes

- Site-specific resources may include custom entities that do not exist in the general documentation
- The OpenAPI specification includes standard CRUD operations for all resources
- Authentication methods supported include Basic Auth and API Token
- Generated content is excluded from git to prevent repository bloat
