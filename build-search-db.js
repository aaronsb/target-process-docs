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

    // Drop existing tables
    await db.exec(`DROP TABLE IF EXISTS docs;`);
    await db.exec(`DROP TABLE IF EXISTS sections;`);
    await db.exec(`DROP TABLE IF EXISTS relationships;`);

    // Create tables with improved schema
    await db.exec(`
        CREATE VIRTUAL TABLE docs USING fts5(
            path,              -- File path relative to docs directory
            content,           -- Full document content
            title,            -- Document title
            tags,             -- Document tags
            section_path      -- Full section path (e.g., "Introduction > Getting Started")
        );

        CREATE VIRTUAL TABLE sections USING fts5(
            doc_path,         -- Reference to parent document
            section_id,       -- Unique section identifier
            title,            -- Section title
            content,          -- Section content
            level,            -- Header level (1-6)
            parent_id,        -- Parent section ID
            section_path      -- Full section path
        );

        CREATE TABLE relationships (
            source_id TEXT,
            target_id TEXT,
            relationship_type TEXT
        );
    `);

    return db;
}

// Extract sections from markdown content
function extractSections(content) {
    const sections = [];
    const lines = content.split('\n');
    let currentSection = {
        title: '',
        content: [],
        level: 0,
        parent_id: null,
        section_path: []
    };
    
    const headerRegex = /^(#{1,6})\s+(.+)$/;
    const sectionStack = [];
    
    for (const line of lines) {
        const headerMatch = line.match(headerRegex);
        
        if (headerMatch) {
            // Save previous section if it exists
            if (currentSection.content.length > 0) {
                sections.push({
                    ...currentSection,
                    content: currentSection.content.join('\n'),
                    section_path: currentSection.section_path.join(' > ')
                });
            }
            
            const level = headerMatch[1].length;
            const title = headerMatch[2].trim();
            
            // Update section stack
            while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= level) {
                sectionStack.pop();
            }
            
            // Create new section
            currentSection = {
                title,
                content: [],
                level,
                parent_id: sectionStack.length > 0 ? sectionStack[sectionStack.length - 1].title : null,
                section_path: [...sectionStack.map(s => s.title), title]
            };
            
            sectionStack.push({ title, level });
        } else {
            currentSection.content.push(line);
        }
    }
    
    // Add final section
    if (currentSection.content.length > 0) {
        sections.push({
            ...currentSection,
            content: currentSection.content.join('\n'),
            section_path: currentSection.section_path.join(' > ')
        });
    }
    
    return sections;
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
    const stats = await fs.stat(filePath);
    const relativePath = path.relative('docs', filePath);
    const title = extractTitle(content);
    const links = findInternalLinks(content);
    const sections = extractSections(content);

    // Insert main document
    await db.run(
        'INSERT INTO docs (path, content, title, tags, section_path) VALUES (?, ?, ?, ?, ?)',
        [
            relativePath,
            content,
            title,
            '',
            sections.map(s => s.title).join(' > ')
        ]
    );

    // Insert sections
    for (const section of sections) {
        await db.run(
            'INSERT INTO sections (doc_path, section_id, title, content, level, parent_id, section_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                relativePath,
                `${relativePath}#${section.title.toLowerCase().replace(/\s+/g, '-')}`,
                section.title,
                section.content,
                section.level,
                section.parent_id,
                section.section_path
            ]
        );
    }

    // Insert relationships
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

        // Clear existing data
        await db.exec('DELETE FROM docs; DELETE FROM sections; DELETE FROM relationships;');

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
