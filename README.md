# Target Process Documentation Scraper

This tool scrapes Target Process documentation and provides searchable local markdown files. It includes the ability to scrape general documentation, site-specific API documentation, and generate OpenAPI specifications.

## Features

- Scrapes general documentation from dev.targetprocess.com/docs
- Converts HTML to markdown format
- Creates a searchable SQLite database with full-text search
- Scrapes site-specific API documentation from Target Process instances
- Generates OpenAPI specifications from site-specific API metadata
- Visualizes documentation relationships in an interactive 3D graph
- Unified interactive script for all operations
- Organized output in a centralized directory structure

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
- Visualizing documentation relationships

## Directory Structure

All generated content is stored in the `generated/` directory:

```
generated/
├── dev-docs/       # General documentation
├── api-docs/       # Site-specific API documentation
│   └── sitename/   # Each site gets its own directory
├── openapi/        # OpenAPI specifications
├── database/       # Search database and metadata
└── visualization/  # Visualization assets
```

## Using the Generated Documentation

### General Documentation

General documentation is stored as markdown files in the `generated/dev-docs/` directory. You can:
- Read it directly in any markdown viewer
- Search it using the database
- Visualize document relationships using the visualization tool

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

### Visualization

The visualization tool provides an interactive 3D graph of documentation relationships:
- Documents and sections are represented as nodes
- Relationships between nodes are represented as links
- Nodes are color-coded by category
- You can filter, search, and interact with the graph

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
