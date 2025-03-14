import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';
import path from 'path';

// Define directory structure
const GENERATED_DIR = 'generated';
const DEV_DOCS_DIR = path.join(GENERATED_DIR, 'dev-docs');
const DATABASE_DIR = path.join(GENERATED_DIR, 'database');
const DATABASE_PATH = path.join(DATABASE_DIR, 'docs.db');

// Initialize database
async function initializeDb() {
    // Ensure database directory exists
    await fs.mkdir(DATABASE_DIR, { recursive: true });
    
    const db = await open({
        filename: DATABASE_PATH,
        driver: sqlite3.Database
    });

    // Drop existing tables
    await db.exec(`DROP TABLE IF EXISTS docs;`);
    await db.exec(`DROP TABLE IF EXISTS sections;`);
    await db.exec(`DROP TABLE IF EXISTS relationships;`);
    await db.exec(`DROP TABLE IF EXISTS keywords;`);
    await db.exec(`DROP TABLE IF EXISTS node_keywords;`);

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
        
        CREATE TABLE keywords (
            id INTEGER PRIMARY KEY,
            term TEXT UNIQUE,
            category TEXT,
            weight INTEGER DEFAULT 1
        );
        
        CREATE TABLE node_keywords (
            node_id TEXT,
            keyword_id INTEGER,
            count INTEGER DEFAULT 1,
            match_score REAL DEFAULT 0.5, -- New column for normalized score (0-1)
            FOREIGN KEY (keyword_id) REFERENCES keywords(id)
        );
        
        CREATE INDEX idx_node_keywords ON node_keywords(node_id, keyword_id);
        CREATE INDEX idx_keywords_category ON keywords(category);
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

// Load keyword categories from JSON file
async function loadKeywordCategories() {
    try {
        const data = await fs.readFile('keyword-categories.json', 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading keyword categories:', error);
        // Fallback to default categories if file not found
        return {
            'User Management': ['user', 'group', 'permission', 'role', 'access', 'account', 'member', 'team'],
            'Integration': ['api', 'rest', 'webhook', 'workato', 'zapier', 'integration', 'service', 'endpoint'],
            'Process Control': ['workflow', 'automation', 'rule', 'trigger', 'process', 'flow', 'action', 'event'],
            'Data Management': ['field', 'entity', 'custom field', 'metric', 'data', 'attribute', 'property', 'value'],
            'UI Components': ['view', 'board', 'dashboard', 'report', 'chart', 'graph', 'visualization', 'interface'],
            'System': ['setting', 'configuration', 'setup', 'system', 'admin', 'management', 'environment', 'server']
        };
    }
}

// Prepare regex patterns for each category (for faster matching)
let categoryPatterns = {};

// Process all markdown files in the docs directory
async function processAllFiles(db) {
    // Load keyword categories from JSON file
    const keywordCategories = await loadKeywordCategories();
    
    // Prepare regex patterns for each category
    categoryPatterns = {};
    for (const [category, terms] of Object.entries(keywordCategories)) {
        categoryPatterns[category] = new RegExp('\\b(' + terms.join('|') + ')\\b', 'gi');
    }
    
    // Ensure dev docs directory exists
    await fs.mkdir(DEV_DOCS_DIR, { recursive: true });
    
    const files = await fs.readdir(DEV_DOCS_DIR);
    const markdownFiles = files.filter(file => file.endsWith('.md'));

    console.log(`Found ${markdownFiles.length} markdown files to process...`);
    
    // Prepare batch arrays
    const docsToInsert = [];
    const sectionsToInsert = [];
    const relationshipsToInsert = [];
    const keywordsToProcess = [];
    
    // Process each file
    for (const file of markdownFiles) {
        const filePath = path.join(DEV_DOCS_DIR, file);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const relativePath = path.relative(DEV_DOCS_DIR, filePath);
            const title = extractTitle(content);
            const links = findInternalLinks(content);
            const sections = extractSections(content);
            
            // Add document to batch
            docsToInsert.push({
                path: relativePath,
                content: content,
                title: title,
                tags: '',
                section_path: sections.map(s => s.title).join(' > ')
            });
            
            // Extract document keywords
            const docCategories = extractCategories(content);
            keywordsToProcess.push({
                nodeId: relativePath,
                categories: docCategories
            });
            
            // Process sections
            for (const section of sections) {
                const sectionId = `${relativePath}#${section.title.toLowerCase().replace(/\s+/g, '-')}`;
                
                // Add section to batch
                sectionsToInsert.push({
                    doc_path: relativePath,
                    section_id: sectionId,
                    title: section.title,
                    content: section.content,
                    level: section.level,
                    parent_id: section.parent_id,
                    section_path: section.section_path
                });
                
                // Extract section keywords
                const sectionCategories = extractCategories(section.title + ' ' + section.content);
                keywordsToProcess.push({
                    nodeId: sectionId,
                    categories: sectionCategories
                });
            }
            
            // Add relationships to batch
            for (const link of links) {
                relationshipsToInsert.push({
                    source_id: relativePath,
                    target_id: link.target,
                    relationship_type: 'link'
                });
            }
            
            // Add document-section relationships
            for (const section of sections) {
                const sectionId = `${relativePath}#${section.title.toLowerCase().replace(/\s+/g, '-')}`;
                
                // Create bidirectional relationships between document and its sections
                relationshipsToInsert.push({
                    source_id: relativePath,
                    target_id: sectionId,
                    relationship_type: 'category'
                });
                
                relationshipsToInsert.push({
                    source_id: sectionId,
                    target_id: relativePath,
                    relationship_type: 'category'
                });
            }
            
            process.stdout.write('.');
        } catch (error) {
            console.error(`\nError processing ${file}:`, error);
        }
    }
    
    console.log('\nInserting data into database...');
    
    // Begin transaction for better performance
    await db.exec('BEGIN TRANSACTION');
    
    try {
        // Insert documents
        const docStmt = await db.prepare('INSERT INTO docs (path, content, title, tags, section_path) VALUES (?, ?, ?, ?, ?)');
        for (const doc of docsToInsert) {
            await docStmt.run(doc.path, doc.content, doc.title, doc.tags, doc.section_path);
        }
        await docStmt.finalize();
        
        // Insert sections
        const sectionStmt = await db.prepare('INSERT INTO sections (doc_path, section_id, title, content, level, parent_id, section_path) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const section of sectionsToInsert) {
            await sectionStmt.run(
                section.doc_path, 
                section.section_id, 
                section.title, 
                section.content, 
                section.level, 
                section.parent_id, 
                section.section_path
            );
        }
        await sectionStmt.finalize();
        
        // Insert relationships
        const relStmt = await db.prepare('INSERT INTO relationships (source_id, target_id, relationship_type) VALUES (?, ?, ?)');
        for (const rel of relationshipsToInsert) {
            await relStmt.run(rel.source_id, rel.target_id, rel.relationship_type);
        }
        await relStmt.finalize();
        
        // Process keywords
        await processKeywordsBatch(db, keywordsToProcess);
        
        // Commit transaction
        await db.exec('COMMIT');
    } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
    }
    
    console.log('\nDone processing files!');
}

// Extract categories from text with normalized scores
function extractCategories(text) {
    const normalizedText = text.toLowerCase();
    const categories = {};
    const textLength = Math.max(normalizedText.length, 1); // Avoid division by zero
    
    // Count matches for each category
    for (const [category, pattern] of Object.entries(categoryPatterns)) {
        const matches = normalizedText.match(pattern);
        if (matches && matches.length > 0) {
            const count = matches.length;
            
            // Calculate normalized score (0-1)
            // Formula considers both match count and text length
            // We normalize by text length to avoid bias toward longer texts
            const score = Math.min(count / Math.sqrt(textLength / 100), 1);
            
            categories[category] = {
                count: count,
                score: score
            };
        }
    }
    
    return categories;
}

// Process keywords in batch for better performance
async function processKeywordsBatch(db, keywordsToProcess) {
    // Insert keywords
    const keywordMap = new Map();
    const keywordStmt = await db.prepare('INSERT OR IGNORE INTO keywords (term, category, weight) VALUES (?, ?, ?)');
    
    // First pass: insert all unique keywords
    for (const { categories } of keywordsToProcess) {
        for (const [category, data] of Object.entries(categories)) {
            // Use category as the term for simplicity and performance
            const count = typeof data === 'object' ? data.count : data; // Handle both new and old format
            await keywordStmt.run(category, category, Math.min(count, 10));
        }
    }
    await keywordStmt.finalize();
    
    // Get all keywords
    const keywords = await db.all('SELECT id, term, category FROM keywords');
    for (const kw of keywords) {
        keywordMap.set(kw.category, kw.id);
    }
    
    // Insert node-keyword relationships
    const nodeKeywordStmt = await db.prepare('INSERT INTO node_keywords (node_id, keyword_id, count, match_score) VALUES (?, ?, ?, ?)');
    for (const { nodeId, categories } of keywordsToProcess) {
        for (const [category, data] of Object.entries(categories)) {
            const keywordId = keywordMap.get(category);
            if (keywordId) {
                // Handle both new and old format
                if (typeof data === 'object') {
                    await nodeKeywordStmt.run(nodeId, keywordId, data.count, data.score);
                } else {
                    // For backward compatibility, calculate a simple score
                    const count = data;
                    const score = Math.min(count / 10, 1); // Simple normalization
                    await nodeKeywordStmt.run(nodeId, keywordId, count, score);
                }
            }
        }
    }
    await nodeKeywordStmt.finalize();
}

// Main function
async function main() {
    try {
        console.log('Initializing search database...');
        const db = await initializeDb();

        // Clear existing data
        await db.exec('DELETE FROM docs; DELETE FROM sections; DELETE FROM relationships; DELETE FROM keywords; DELETE FROM node_keywords;');

        console.log('Processing markdown files...');
        await processAllFiles(db);
        
        console.log('\nCreating category index...');
        await createCategoryIndex(db);

        await db.close();
        console.log('Search database built successfully!');
    } catch (error) {
        console.error('Error building search database:', error);
        process.exit(1);
    }
}

// Create a simplified category index for visualization
async function createCategoryIndex(db) {
    // Create a view for primary category per node with normalized scores
    await db.exec(`
        DROP VIEW IF EXISTS node_primary_category;
        CREATE VIEW node_primary_category AS
        SELECT node_id, 
               k.category,
               SUM(nk.count) as category_count,
               AVG(nk.match_score) as match_score
        FROM node_keywords nk
        JOIN keywords k ON nk.keyword_id = k.id
        GROUP BY node_id, k.category
        ORDER BY node_id, category_count DESC
    `);
    
    // Create targeted category relationships between related nodes
    console.log('Creating targeted category relationships...');
    
    // Get documents with their primary categories
    const docCategories = await db.all(`
        WITH ranked_categories AS (
            SELECT node_id, category, category_count,
                   ROW_NUMBER() OVER (PARTITION BY node_id ORDER BY category_count DESC) as rank
            FROM node_primary_category
        )
        SELECT node_id, category
        FROM ranked_categories
        WHERE rank = 1 AND node_id NOT LIKE '%#%'
        ORDER BY category, node_id
    `);
    
    // Get sections with their primary categories
    const sectionCategories = await db.all(`
        WITH ranked_categories AS (
            SELECT node_id, category, category_count,
                   ROW_NUMBER() OVER (PARTITION BY node_id ORDER BY category_count DESC) as rank
            FROM node_primary_category
        )
        SELECT node_id, category
        FROM ranked_categories
        WHERE rank = 1 AND node_id LIKE '%#%'
        ORDER BY category, node_id
    `);
    
    // Create a map of documents by category
    const docsByCategory = {};
    for (const { node_id, category } of docCategories) {
        if (!docsByCategory[category]) {
            docsByCategory[category] = [];
        }
        docsByCategory[category].push(node_id);
    }
    
    // Create a map of sections by category
    const sectionsByCategory = {};
    for (const { node_id, category } of sectionCategories) {
        if (!sectionsByCategory[category]) {
            sectionsByCategory[category] = [];
        }
        sectionsByCategory[category].push(node_id);
    }
    
    // Create relationships between nodes in the same category
    let relationshipCount = 0;
    await db.exec('BEGIN TRANSACTION');
    
    try {
        const relStmt = await db.prepare('INSERT INTO relationships (source_id, target_id, relationship_type) VALUES (?, ?, ?)');
        
        // For each category, create relationships between a limited number of documents
        for (const [category, docs] of Object.entries(docsByCategory)) {
            // Limit to 10 documents per category to avoid too many relationships
            const limitedDocs = docs.slice(0, 10);
            
            // Create relationships between these documents
            for (let i = 0; i < limitedDocs.length; i++) {
                for (let j = i + 1; j < limitedDocs.length; j++) {
                    // Create bidirectional relationships
                    await relStmt.run(limitedDocs[i], limitedDocs[j], 'category');
                    await relStmt.run(limitedDocs[j], limitedDocs[i], 'category');
                    relationshipCount += 2;
                }
            }
            
            // For each document, connect to a few sections in the same category
            for (const doc of limitedDocs) {
                const sectionsInCategory = sectionsByCategory[category] || [];
                // Get sections that don't belong to this document
                const otherSections = sectionsInCategory.filter(section => !section.startsWith(doc));
                
                // Connect to up to 5 sections from other documents
                const limitedSections = otherSections.slice(0, 5);
                for (const section of limitedSections) {
                    await relStmt.run(doc, section, 'category');
                    await relStmt.run(section, doc, 'category');
                    relationshipCount += 2;
                }
            }
        }
        
        await relStmt.finalize();
        await db.exec('COMMIT');
        console.log(`Created ${relationshipCount} category relationships`);
    } catch (error) {
        await db.exec('ROLLBACK');
        console.error('Error creating category relationships:', error);
    }
    
    // Log some statistics about keyword distribution
    const categoryCounts = await db.all(`
        WITH ranked_categories AS (
            SELECT node_id, category, category_count,
                   ROW_NUMBER() OVER (PARTITION BY node_id ORDER BY category_count DESC) as rank
            FROM node_primary_category
        )
        SELECT category, COUNT(DISTINCT node_id) as node_count
        FROM ranked_categories
        WHERE rank = 1
        GROUP BY category
        ORDER BY node_count DESC
    `);
    
    console.log('\nKeyword category distribution:');
    for (const { category, node_count } of categoryCounts) {
        console.log(`- ${category}: ${node_count} nodes`);
    }
}

main();
