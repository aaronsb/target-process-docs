#!/usr/bin/env node
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'node:url';
import colors from 'ansi-colors';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Database path
const DATABASE_DIR = path.join('generated', 'database');
const DATABASE_PATH = path.join(DATABASE_DIR, 'docs.db');

// CLI setup
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options] <search terms>')
  .option('type', {
    alias: 't',
    describe: 'Type of content to search',
    choices: ['docs', 'sections', 'all'],
    default: 'all'
  })
  .option('category', {
    alias: 'c',
    describe: 'Filter by category',
    type: 'string'
  })
  .option('limit', {
    alias: 'l',
    describe: 'Maximum number of results to display',
    type: 'number',
    default: 10
  })
  .option('exact', {
    alias: 'e',
    describe: 'Require exact phrase match',
    type: 'boolean',
    default: false
  })
  .option('context', {
    alias: 'x',
    describe: 'Show context around matches',
    type: 'boolean',
    default: true
  })
  .option('related', {
    alias: 'r',
    describe: 'Show related content',
    type: 'boolean',
    default: false
  })
  .option('list-categories', {
    describe: 'List available categories',
    type: 'boolean',
    default: false
  })
  .example('$0 "user story"', 'Search for "user story" in all content')
  .example('$0 -t docs api', 'Search for "api" in document titles and content')
  .example('$0 -c feature epic', 'Search for "epic" filtered by "feature" category')
  .example('$0 -e "acceptance criteria"', 'Search for exact phrase "acceptance criteria"')
  .example('$0 --list-categories', 'List all available categories')
  .epilog('For more information, see the README.md file')
  .help()
  .alias('help', 'h')
  .argv;

// Main function
async function main() {
  // Check for search terms
  const searchTerms = argv._.join(' ');
  
  if (!searchTerms && !argv.listCategories) {
    console.log('Error: No search terms provided');
    yargs.showHelp();
    process.exit(1);
  }

  try {
    // Open database connection
    // Make sure to use the correct path for the database
    const dbPath = path.resolve(process.cwd(), DATABASE_PATH);
    console.log(`Looking for database at: ${dbPath}`);
    
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // If user wants to list categories
    if (argv.listCategories) {
      await listCategories(db);
      await db.close();
      return;
    }

    // Format search query for FTS5
    // Keep the original search terms for display and fallback - need to make it globally available
    global.originalTerms = searchTerms;
    const searchQuery = argv.exact ? `"${searchTerms}"` : searchTerms.split(' ').filter(term => term.length > 0).map(term => `${term}*`).join(' OR ');
    
    // Perform search
    console.log(`\n${colors.cyan('Searching for:')} ${colors.bold(searchTerms)}`);
    
    let totalResults = 0;
    
    // Search docs if requested
    if (argv.type === 'docs' || argv.type === 'all') {
      const docResults = await searchDocs(db, searchQuery);
      if (docResults.length > 0) {
        totalResults += docResults.length;
        displayDocResults(docResults);
      }
    }
    
    // Search sections if requested
    if (argv.type === 'sections' || argv.type === 'all') {
      const sectionResults = await searchSections(db, searchQuery);
      if (sectionResults.length > 0) {
        totalResults += sectionResults.length;
        displaySectionResults(sectionResults);
      }
    }
    
    // Show related content if requested
    if (argv.related && totalResults > 0) {
      // Implementation of related content would go here
      console.log(`\n${colors.yellow('Related content not yet implemented')}`);
    }
    
    // Summary
    console.log(`\n${colors.green('Found')} ${colors.bold(totalResults)} ${colors.green('results')}`);
    
    // Close the database connection
    await db.close();
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('no such file')) {
      console.error('\nThe search database does not exist. Run the following to create it:');
      console.error('  node tp-docs.js');
      console.error('or');
      console.error('  node build-search-db.js');
    }
    process.exit(1);
  }
}

// List available categories
async function listCategories(db) {
  try {
    const categories = await db.all(`
      SELECT category, COUNT(*) as count 
      FROM keywords 
      GROUP BY category 
      ORDER BY count DESC
    `);
    
    console.log(`\n${colors.cyan('Available categories:')}`);
    if (categories.length === 0) {
      console.log(`  ${colors.yellow('No categories found in the database')}`);
    } else {
      for (const cat of categories) {
        console.log(`${colors.green('•')} ${colors.bold(cat.category || 'Uncategorized')} (${cat.count} keywords)`);
      }
    }
  } catch (error) {
    console.error(`Error listing categories: ${error.message}`);
    console.log(`\n${colors.cyan('Available categories:')}`);
    console.log(`  ${colors.yellow('Unable to retrieve categories from the database')}`);
  }
}

// Search documents
async function searchDocs(db, searchQuery) {
  try {
    // First check if the docs table exists and has records
    const tableInfo = await db.get(`SELECT COUNT(*) as count FROM docs`);
    
    if (tableInfo.count === 0) {
      console.log(`${colors.yellow('No documents found in the database. Run build-search-db.js to populate it.')}`);
      return [];
    }
    
    // FTS5 query - match against either content, title, or path
    let query = `
      SELECT 
        path, 
        title, 
        content,
        highlight(docs, 0, '${colors.cyan('**')}', '${colors.cyan('**')}') as highlighted_content
      FROM 
        docs
      WHERE 
        docs MATCH ?
    `;
    
    // Add category filter if requested
    const params = [searchQuery];
    if (argv.category) {
      query += `
        AND path IN (
          SELECT node_id 
          FROM node_keywords nk
          JOIN keywords k ON nk.keyword_id = k.id
          WHERE k.category = ?
        )
      `;
      params.push(argv.category);
    }
    
    // Add limit
    query += `
      LIMIT ?
    `;
    params.push(argv.limit);
    
    console.log(`Debug - SQL Parameters: ${params.join(', ')}`);
    return await db.all(query, params);
  } catch (error) {
    console.error(`Error executing docs query: ${error.message}`);
    
    // Fall back to simpler query if FTS5 is not working
    try {
      const query = `
        SELECT path, title, content 
        FROM docs 
        WHERE content LIKE ? OR title LIKE ? 
        LIMIT ?
      `;
      const params = [`%${originalTerms}%`, `%${originalTerms}%`, argv.limit];
      console.log(`Falling back to simple query: ${query} with params ${params.join(', ')}`);
      return await db.all(query, params);
    } catch (fallbackError) {
      console.error(`Fallback query failed: ${fallbackError.message}`);
      return [];
    }
  }
}

// Search sections
async function searchSections(db, searchQuery) {
  try {
    // First check if the sections table exists and has records
    const tableInfo = await db.get(`SELECT COUNT(*) as count FROM sections`);
    
    if (tableInfo.count === 0) {
      console.log(`${colors.yellow('No sections found in the database. Run build-search-db.js to populate it.')}`);
      return [];
    }
    
    // FTS5 query
    let query = `
      SELECT 
        doc_path,
        section_id,
        title, 
        section_path,
        content,
        highlight(sections, 0, '${colors.cyan('**')}', '${colors.cyan('**')}') as highlighted_content
      FROM 
        sections
      WHERE 
        sections MATCH ?
    `;
    
    // Add category filter if requested
    const params = [searchQuery];
    if (argv.category) {
      query += `
        AND section_id IN (
          SELECT node_id 
          FROM node_keywords nk
          JOIN keywords k ON nk.keyword_id = k.id
          WHERE k.category = ?
        )
      `;
      params.push(argv.category);
    }
    
    // Add limit
    query += `
      LIMIT ?
    `;
    params.push(argv.limit);
    
    return await db.all(query, params);
  } catch (error) {
    console.error(`Error executing sections query: ${error.message}`);
    
    // Fall back to simpler query if FTS5 is not working
    try {
      const query = `
        SELECT doc_path, section_id, title, section_path, content 
        FROM sections 
        WHERE content LIKE ? OR title LIKE ? 
        LIMIT ?
      `;
      const params = [`%${originalTerms}%`, `%${originalTerms}%`, argv.limit];
      console.log(`Falling back to simple sections query with params ${params.join(', ')}`);
      return await db.all(query, params);
    } catch (fallbackError) {
      console.error(`Fallback query failed: ${fallbackError.message}`);
      return [];
    }
  }
}

// Display document search results
function displayDocResults(results) {
  console.log(`\n${colors.bold.yellow('Documents:')} (${results.length} results)`);
  
  if (results.length === 0) {
    console.log(`  ${colors.dim('No matching documents found')}`);
    return;
  }
  
  for (const result of results) {
    console.log(`\n${colors.bold.green(result.title || 'Untitled')} ${colors.dim(`(${result.path})`)}`);
    
    if (argv.context) {
      if (result.highlighted_content) {
        // If we have highlighted content from FTS, use that
        const lines = result.highlighted_content.split('\n').slice(0, 3);
        console.log(`  ${lines.join(' ').substring(0, 300)}${lines.join(' ').length > 300 ? '...' : ''}`);
      } else {
        // Otherwise create a snippet manually
        const content = result.content || '';
        const searchIndex = content.toLowerCase().indexOf(originalTerms.toLowerCase());
        if (searchIndex >= 0) {
          const start = Math.max(0, searchIndex - 100);
          const end = Math.min(content.length, searchIndex + originalTerms.length + 100);
          let snippet = content.substring(start, end);
          
          // Add ellipsis if we're not at the beginning/end
          if (start > 0) snippet = '...' + snippet;
          if (end < content.length) snippet = snippet + '...';
          
          // Highlight the search term
          const highlightedSnippet = snippet.replace(
            new RegExp(originalTerms, 'ig'), 
            match => colors.cyan(`**${match}**`)
          );
          
          console.log(`  ${highlightedSnippet.replace(/\n/g, ' ')}`);
        } else {
          // If we can't find the term, just show the beginning
          console.log(`  ${content.substring(0, 200).replace(/\n/g, ' ')}...`);
        }
      }
    }
  }
}

// Display section search results
function displaySectionResults(results) {
  console.log(`\n${colors.bold.yellow('Sections:')} (${results.length} results)`);
  
  if (results.length === 0) {
    console.log(`  ${colors.dim('No matching sections found')}`);
    return;
  }
  
  for (const result of results) {
    console.log(`\n${colors.bold.green(result.title || 'Untitled')} ${colors.dim(`(${result.section_path || 'Unknown section'})`)}`);
    console.log(`  ${colors.dim(`Path: ${result.doc_path || 'Unknown document'}`)}`);
    
    if (argv.context) {
      if (result.highlighted_content) {
        // If we have highlighted content from FTS, use that
        const lines = result.highlighted_content.split('\n').slice(0, 3);
        console.log(`  ${lines.join(' ').substring(0, 300)}${lines.join(' ').length > 300 ? '...' : ''}`);
      } else {
        // Otherwise create a snippet manually
        const content = result.content || '';
        const searchIndex = content.toLowerCase().indexOf(originalTerms.toLowerCase());
        if (searchIndex >= 0) {
          const start = Math.max(0, searchIndex - 100);
          const end = Math.min(content.length, searchIndex + originalTerms.length + 100);
          let snippet = content.substring(start, end);
          
          // Add ellipsis if we're not at the beginning/end
          if (start > 0) snippet = '...' + snippet;
          if (end < content.length) snippet = snippet + '...';
          
          // Highlight the search term
          const highlightedSnippet = snippet.replace(
            new RegExp(originalTerms, 'ig'), 
            match => colors.cyan(`**${match}**`)
          );
          
          console.log(`  ${highlightedSnippet.replace(/\n/g, ' ')}`);
        } else {
          // If we can't find the term, just show the beginning
          console.log(`  ${content.substring(0, 200).replace(/\n/g, ' ')}...`);
        }
      }
    }
  }
}

// Run the main function
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});