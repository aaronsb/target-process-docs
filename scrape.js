import { NodeHtmlMarkdown } from 'node-html-markdown';
import got from 'got';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const nhm = new NodeHtmlMarkdown();
const baseUrl = 'https://dev.targetprocess.com/docs';

async function fetchAndConvert(url) {
    try {
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
        
        // Ensure directory exists
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        
        // Save markdown file
        await fs.writeFile(outputPath, markdown);
        console.log(`Saved ${outputPath}`);
        
        // Find and process links to other doc pages
        const links = $('a[href^="/docs/"]')
            .map((_, el) => $(el).attr('href'))
            .get()
            .filter((href, index, self) => self.indexOf(href) === index); // Remove duplicates
            
        // Process each link
        for (const link of links) {
            const fullUrl = new URL(link, baseUrl).toString();
            if (!processedUrls.has(fullUrl)) {
                processedUrls.add(fullUrl);
                await fetchAndConvert(fullUrl);
            }
        }
    } catch (error) {
        console.error(`Error processing ${url}:`, error.message);
    }
}

// Keep track of processed URLs to avoid duplicates
const processedUrls = new Set();

// Write metadata file with scrape timestamp
async function writeMetadata() {
    const metadata = {
        lastScraped: new Date().toISOString(),
        baseUrl: baseUrl,
        totalDocuments: processedUrls.size
    };
    
    await fs.writeFile(
        'docs/metadata.json',
        JSON.stringify(metadata, null, 2)
    );
    
    console.log(`\nLast scraped: ${metadata.lastScraped}`);
    console.log(`Total documents: ${metadata.totalDocuments}`);
    console.log('\nNote: Please consider waiting between documentation updates to avoid unnecessary load on the server.');
}

// Start scraping
console.log('Starting documentation scraping...');
fetchAndConvert('https://dev.targetprocess.com/docs/overview')
    .then(async () => {
        console.log('Scraping complete!');
        await writeMetadata();
    })
    .catch(console.error);
