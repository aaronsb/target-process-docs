# Target Process Documentation Scraper

This tool scrapes Target Process documentation and provides searchable local markdown files. It now includes the ability to scrape site-specific API documentation and generate OpenAPI specifications.

## Features

- Scrapes general documentation from dev.targetprocess.com/docs
- Converts HTML to markdown format
- Creates a searchable SQLite database with full-text search
- **NEW**: Scrapes site-specific API documentation from Target Process instances
- **NEW**: Generates OpenAPI specifications from site-specific API metadata

## Installation

```bash
git clone <this-repository>
cd target-process-docs
npm install
```

## Basic Usage

### Scrape General Documentation

```bash
./refresh-docs.sh --scrape
```

This will:
1. Scrape documentation from dev.targetprocess.com/docs
2. Convert it to markdown format
3. Store the files in the `/docs` directory
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

The new API scraper allows you to fetch and document site-specific API metadata from a Target Process instance.

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
   api-docs/
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

The OpenAPI specification will be saved as `api-docs/yoursitename/openapi.json`.

## Combined Usage

You can combine these operations:

```bash
./refresh-docs.sh --scrape --force --api-site https://yoursitename.tpondemand.com --generate-openapi
```

This will:
1. Scrape and refresh general documentation
2. Scrape site-specific API documentation
3. Generate an OpenAPI specification

## Using the Generated Documentation

### General Documentation

General documentation is stored as markdown files in the `docs/` directory. You can:
- Read it directly in any markdown viewer
- Search it using the `search-docs.sh` script
- Visualize document relationships using `./visualize-docs.sh`

### Site-Specific API Documentation

API documentation is stored in `api-docs/sitename/markdown/`. It includes:
- An index of all available resources
- Detailed documentation for each resource including properties, operations, and relationships
- Links between related resources

### OpenAPI Specification

The generated OpenAPI specification can be:
- Imported into tools like Swagger UI, Postman, or Insomnia
- Used to generate client libraries using tools like OpenAPI Generator
- Used as reference documentation for developers

## Scripts Reference

- `scrape.js` - Scrapes general documentation
- `site-api-scraper.js` - Scrapes site-specific API documentation
- `openapi-generator.js` - Generates OpenAPI specifications
- `build-search-db.js` - Builds the search database
- `refresh-docs.sh` - Main script that combines all operations

## NPM Scripts

```bash
npm run start           # Run the general documentation scraper
npm run build-search    # Build the search database
npm run visualize       # Generate visualization
npm run api-scrape      # Run the site-specific API scraper (requires --site param)
npm run generate-openapi # Generate OpenAPI spec (requires --site param)
```

## Notes

- Site-specific resources may include custom entities that do not exist in the general documentation
- The OpenAPI specification includes standard CRUD operations for all resources
- Authentication methods supported include Basic Auth and API Token
