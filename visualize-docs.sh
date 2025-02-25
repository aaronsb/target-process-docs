#!/bin/bash

# Check if database exists
if [ ! -f "docs.db" ]; then
    echo "Error: Search database not found!"
    echo "Run './refresh-docs.sh' first to build the documentation and search index"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Check for new dependencies
if [ ! -d "node_modules/express" ] || [ ! -d "node_modules/open" ] || [ ! -d "node_modules/yargs" ]; then
    echo "Installing visualization dependencies..."
    npm install express open yargs
fi

# Run the visualization tool
echo "Starting visualization server..."
node visualize-graph.js "$@"
