import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';
import path from 'path';

// Initialize database
async function initializeDb() {
    const db = await open({
        filename: 'docs.db',
        driver: sqlite3.Database
    });

    // Create tables
    await db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
            path,
            content,
            title,
            tags
        );

        CREATE TABLE IF NOT EXISTS relationships (
            source_id TEXT,
            target_id TEXT,
            relationship_type TEXT,
            FOREIGN KEY(source_id) REFERENCES docs(path),
            FOREIGN KEY(target_id) REFERENCES docs(path)
        );
    `);

    return db;
}

// Extract title from markdown content
function extractTitle(content) {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : '';
}

// Find internal links in markdown content
function findInternalLinks(content) {
    const links = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
        const [, text, url] = match;
        // Only include internal markdown links
        if (url.endsWith('.md') && !url.startsWith('http')) {
            links.push({
                text,
                target: url
            });
        }
    }

    return links;
}

// Process a single markdown file
async function processFile(db, filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative('docs', filePath);
    const title = extractTitle(content);
    const links = findInternalLinks(content);

    // Insert document
    await db.run(
        'INSERT INTO docs (path, content, title, tags) VALUES (?, ?, ?, ?)',
        [relativePath, content, title, '']
    );

    // Insert relationships for internal links
    for (const link of links) {
        await db.run(
            'INSERT INTO relationships (source_id, target_id, relationship_type) VALUES (?, ?, ?)',
            [relativePath, link.target, 'link']
        );
    }
}

// Process all markdown files in the docs directory
async function processAllFiles(db) {
    const files = await fs.readdir('docs');
    const markdownFiles = files.filter(file => file.endsWith('.md'));

    console.log(`Found ${markdownFiles.length} markdown files to process...`);

    for (const file of markdownFiles) {
        const filePath = path.join('docs', file);
        try {
            await processFile(db, filePath);
            process.stdout.write('.');
        } catch (error) {
            console.error(`\nError processing ${file}:`, error);
        }
    }
    console.log('\nDone processing files!');
}

// Main function
async function main() {
    try {
        console.log('Initializing search database...');
        const db = await initializeDb();

        console.log('Processing markdown files...');
        await processAllFiles(db);

        await db.close();
        console.log('Search database built successfully!');
    } catch (error) {
        console.error('Error building search database:', error);
        process.exit(1);
    }
}

main();
