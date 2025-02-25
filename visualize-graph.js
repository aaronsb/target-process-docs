#!/usr/bin/env node
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import * as openBrowser from 'open';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Main async function to allow top-level await
async function main() {
  // Parse command line arguments
  const argv = yargs(hideBin(process.argv))
    .option('db', {
      alias: 'd',
      description: 'Path to SQLite database file',
      type: 'string',
      default: 'docs.db'
    })
    .option('port', {
      alias: 'p',
      description: 'Port to run the server on',
      type: 'number',
      default: 8080
    })
    .help()
    .alias('help', 'h')
    .argv;

  // Get the directory name of the current module
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Check if database exists
  if (!fs.existsSync(argv.db)) {
    console.error(`Error: Database file '${argv.db}' not found.`);
    console.error('Run ./refresh-docs.sh first to build the documentation and search index.');
    process.exit(1);
  }

  // Connect to the database
  const db = await open({
    filename: argv.db,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY
  });

  // Function to extract data from the database
  async function extractGraphData() {
    // Get all documents
    const docs = await db.all('SELECT path, title, section_path FROM docs');
    
    // Get all sections
    const sections = await db.all('SELECT doc_path, section_id, title, level, parent_id, section_path FROM sections');
    
    // Get all relationships
    const relationships = await db.all('SELECT source_id, target_id, relationship_type FROM relationships');
    
    // Get keyword category scores for all nodes
    const categoryScores = await db.all(`
      SELECT node_id, category, match_score 
      FROM node_primary_category
      ORDER BY node_id, category_count DESC
    `);
    
    // Create a map of node categories and scores
    const nodeCategories = new Map();
    categoryScores.forEach(score => {
      if (!nodeCategories.has(score.node_id)) {
        nodeCategories.set(score.node_id, []);
      }
      nodeCategories.get(score.node_id).push({
        category: score.category,
        score: score.match_score
      });
    });
    
    // Create nodes and links for the graph
    const nodes = [];
    const links = [];
    const nodeMap = new Map();
    
    // Add document nodes
    docs.forEach((doc, index) => {
      // Get category data for this document
      const categories = nodeCategories.get(doc.path) || [];
      // Get primary category (highest score)
      const primaryCategory = categories.length > 0 ? categories[0] : null;
      
      const node = {
        id: doc.path,
        name: doc.title || doc.path,
        val: 20, // Size for document nodes
        group: 'document',
        path: doc.path,
        section_path: doc.section_path,
        categories: categories,
        primaryCategory: primaryCategory ? primaryCategory.category : null,
        categoryScore: primaryCategory ? primaryCategory.score : 0
      };
      nodes.push(node);
      nodeMap.set(doc.path, index);
    });
    
    // Add section nodes
    sections.forEach((section, index) => {
      // Get category data for this section
      const categories = nodeCategories.get(section.section_id) || [];
      // Get primary category (highest score)
      const primaryCategory = categories.length > 0 ? categories[0] : null;
      
      const node = {
        id: section.section_id,
        name: section.title,
        val: 10, // Size for section nodes
        group: 'section',
        level: section.level,
        doc_path: section.doc_path,
        section_path: section.section_path,
        categories: categories,
        primaryCategory: primaryCategory ? primaryCategory.category : null,
        categoryScore: primaryCategory ? primaryCategory.score : 0
      };
      nodes.push(node);
      nodeMap.set(section.section_id, index + docs.length);
    
    // Add link from document to section
    if (nodeMap.has(section.doc_path)) {
      links.push({
        source: section.doc_path,
        target: section.section_id,
        type: 'contains'
      });
    }
    
    // Add link from parent section to child section
    if (section.parent_id && nodeMap.has(section.parent_id)) {
      links.push({
        source: section.parent_id,
        target: section.section_id,
        type: 'parent-child'
      });
    }
  });
  
    // Add relationship links
    relationships.forEach(rel => {
    if (nodeMap.has(rel.source_id) && nodeMap.has(rel.target_id)) {
      links.push({
        source: rel.source_id,
        target: rel.target_id,
        type: rel.relationship_type
      });
    }
  });
  
    return { nodes, links };
  }

  // Create Express app
  const app = express();

  // Serve static files from the visualization directory
  app.use(express.static(join(__dirname, 'visualization')));

  // API endpoint to get graph data
  app.get('/api/graph-data', async (req, res) => {
    try {
      const graphData = await extractGraphData();
      res.json(graphData);
    } catch (error) {
      console.error('Error extracting graph data:', error);
      res.status(500).json({ error: 'Failed to extract graph data' });
    }
  });

  // Serve the main HTML file
  app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'visualization', 'index.html'));
  });

  // Function to start the server with port fallback
  function startServer(port) {
    const server = app.listen(port)
      .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Port ${port} is already in use, trying port ${port + 1}...`);
          startServer(port + 1);
        } else {
          console.error('Server error:', err);
          process.exit(1);
        }
      })
      .on('listening', () => {
        const actualPort = server.address().port;
        const url = `http://localhost:${actualPort}`;
        console.log(`Visualization server running at ${url}`);
        console.log('Press Ctrl+C to stop the server');
        
        // Open the browser
        openBrowser.default(url);
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
          console.log('Shutting down server...');
          server.close(async () => {
            console.log('Server stopped');
            await db.close();
            process.exit(0);
          });
        });
      });
    
    return server;
  }
  
  // Start the server with the specified port
  const server = startServer(argv.port);

}

// Run the main function
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
