import { NodeHtmlMarkdown } from 'node-html-markdown';
import got from 'got';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const nhm = new NodeHtmlMarkdown();
const baseUrl = 'https://dev.targetprocess.com/docs';

// Initialize the set of processed URLs
const processedUrls = new Set();

async function fetchAndConvert(url) {
    try {
        // Check if URL has already been processed to prevent duplicate scraping
        if (processedUrls.has(url)) {
            console.log(`Dev Doc Processed: ${url}`);
            return;
        }
        
        // Mark URL as processed before fetching to prevent parallel duplications
        processedUrls.add(url);
        
        console.log(`Fetching: ${url}`);
        
        // Fetch the page
        const response = await got(url);
        const html = response.body;
        
        // Parse HTML with cheerio
        const $ = cheerio.load(html);
        
        // Get main content
        const mainContent = $('.content').html() || $('main').html() || $('article').html() || $('body').html();
        
        if (!mainContent) {
            console.error(`No content found for ${url}`);
            return;
        }
        
        // Convert to markdown
        const markdown = nhm.translate(mainContent);
        
        // Create filename from URL
        const urlPath = new URL(url).pathname;
        const relativePath = urlPath.replace('/docs/', '');
        const outputPath = path.join('docs', `${relativePath || 'index'}.md`);
        const generatedOutputPath = path.join('generated/dev-docs', `${relativePath || 'index'}.md`);
        
        // Ensure directories exist
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.mkdir(path.dirname(generatedOutputPath), { recursive: true });
        
        // Save markdown file to both locations
        await fs.writeFile(outputPath, markdown);
        await fs.writeFile(generatedOutputPath, markdown);
        console.log(`Saved ${outputPath} and ${generatedOutputPath}`);
        
        // Find and process links to other doc pages
        const links = $('a[href^="/docs/"]')
            .map((_, el) => $(el).attr('href'))
            .get()
            .filter((href, index, self) => self.indexOf(href) === index); // Remove duplicates
            
        // Process each link
        for (const link of links) {
            const fullUrl = new URL(link, baseUrl).toString();
            await fetchAndConvert(fullUrl);
        }
    } catch (error) {
        console.error(`Error processing ${url}:`, error.message);
    }
}

// Write metadata file with scrape timestamp
async function writeMetadata() {
    const metadata = {
        lastScraped: new Date().toISOString(),
        baseUrl: baseUrl,
        totalDocuments: processedUrls.size,
        sourceSystem: 'dev.targetprocess.com'
    };
    
    try {
        // Save to 'docs/metadata.json' for direct usage
        await fs.writeFile(
            'docs/metadata.json',
            JSON.stringify(metadata, null, 2)
        );
        
        // Also try to save to the generated directory if it exists
        try {
            await fs.writeFile(
                'generated/dev-docs/metadata.json',
                JSON.stringify(metadata, null, 2)
            );
        } catch (err) {
            // generated directory might not exist yet, which is fine
        }
        
        console.log(`\nLast scraped: ${metadata.lastScraped}`);
        console.log(`Total documents: ${metadata.totalDocuments}`);
        console.log('\nNote: Please consider waiting between documentation updates to avoid unnecessary load on the server.');
    } catch (error) {
        console.error('Error writing metadata:', error.message);
    }
}

// Start scraping
console.log('Starting documentation scraping...');
fetchAndConvert('https://dev.targetprocess.com/docs/overview')
    .then(async () => {
        console.log('Scraping complete!');
        await writeMetadata();
    })
    .catch(console.error);
