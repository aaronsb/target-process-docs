# Stable Visualization Setup

This branch contains a special combination of components that provides an optimal visualization experience for the Target Process documentation:

1. **Initial Visualization Code**: The original 3D visualization tool (commit c63e56f)
2. **Advanced Database Generator**: The latest database generator with categorization support

## Why This Combination Works Well

This setup combines:
- The simplicity and performance of the initial visualization code
- The advanced categorization features of the latest database generator

The initial visualization code focuses on the core functionality without some of the more experimental features added in later commits, resulting in a more stable and performant experience.

## How to Use This Setup

### 1. Generate the Database

```bash
# Run the documentation scraper and database generator
./refresh-docs.sh
```

This will:
- Scrape the Target Process documentation (if needed)
- Generate a database (docs.db) with the advanced schema including:
  - Core tables (docs, sections, relationships)
  - Categorization tables (keywords, node_keywords)
  - The node_primary_category view

### 2. Run the Visualization

```bash
# Start the visualization server
./visualize-docs.sh
```

This will:
- Check for the database
- Install dependencies if needed
- Start the visualization server
- Open the visualization in your browser

## Database Schema

The database includes:

### Core Tables
- **docs**: Document information (path, content, title, tags, section_path)
- **sections**: Section information (doc_path, section_id, title, content, level, parent_id, section_path)
- **relationships**: Relationship information (source_id, target_id, relationship_type)

### Categorization Tables
- **keywords**: Keyword information (id, term, category, weight)
- **node_keywords**: Maps nodes to keywords (node_id, keyword_id, count, tf_idf)
- **node_primary_category**: A view that calculates the primary category for each node

### Categories
The database categorizes content into these categories:
1. Data Management
2. Integration
3. Process Control
4. System
5. UI Components
6. User Management

## Reference Database

A reference database with the correct structure is preserved as `docs.unknown-structure.db`. This can be used as a reference if needed, but the setup should be able to recreate an equivalent database using the refresh-docs.sh script.
