import { fileURLToPath } from 'url';
import got from 'got';
import fs from 'fs/promises';
import path from 'path';
import xml2js from 'xml2js';

const parseStringPromise = xml2js.parseString;

async function scrapeApiMetadata(siteUrl) {
    try {
        const siteName = new URL(siteUrl).hostname.split('.')[0];
        console.log(`Scraping API metadata from ${siteUrl}...`);
        
        // Create directory structure
        const siteDir = path.join('api-docs', siteName);
        const resourcesDir = path.join(siteDir, 'resources');
        const markdownDir = path.join(siteDir, 'markdown');
        
        await fs.mkdir(resourcesDir, { recursive: true });
        await fs.mkdir(markdownDir, { recursive: true });
        
        // Fetch the API metadata index
        const metaUrl = new URL('/api/v1/index/meta', siteUrl).toString();
        const metaResponse = await got(metaUrl);
        
        // Save raw metadata
        await fs.writeFile(
            path.join(siteDir, 'index-meta.xml'),
            metaResponse.body
        );
        
        // Parse XML response
        const result = await promisifyXmlParse(metaResponse.body);
        const resources = result.ResourceMetadataDescriptionIndex.ResourceMetadataDescription;
        
        // Save JSON version for easier processing
        await fs.writeFile(
            path.join(siteDir, 'index-meta.json'),
            JSON.stringify(resources, null, 2)
        );
        
        // Generate index markdown
        await fs.writeFile(
            path.join(markdownDir, 'index.md'),
            generateIndexMarkdown(resources, siteUrl)
        );
        
        // Fetch detailed metadata for each resource
        console.log(`Found ${resources.length} resources. Fetching details...`);
        
        // Process resources in batches to avoid overwhelming the server
        const batchSize = 10;
        for (let i = 0; i < resources.length; i += batchSize) {
            const batch = resources.slice(i, i + batchSize);
            await Promise.all(batch.map(resource => 
                scrapeResourceMetadata(resource, siteDir, siteUrl)
            ));
            console.log(`Processed ${Math.min(i + batchSize, resources.length)}/${resources.length} resources`);
        }
        
        console.log(`Completed scraping API metadata from ${siteUrl}`);
        return {
            siteName,
            totalResources: resources.length
        };
    } catch (error) {
        console.error('Error scraping API metadata:', error);
        throw error;
    }
}

// Helper function to promisify xml2js parsing
function promisifyXmlParse(xml) {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

async function scrapeResourceMetadata(resource, siteDir, siteUrl) {
    const resourceName = resource.$.Name;
    const resourceUri = resource.$.Uri;
    
    try {
        // Fetch detailed metadata
        const response = await got(resourceUri);
        
        // Save raw metadata
        await fs.writeFile(
            path.join(siteDir, 'resources', `${resourceName}.xml`),
            response.body
        );
        
        // Parse XML
        const result = await promisifyXmlParse(response.body);
        
        // Save JSON version
        await fs.writeFile(
            path.join(siteDir, 'resources', `${resourceName}.json`),
            JSON.stringify(result, null, 2)
        );
        
        // Generate markdown documentation
        await fs.writeFile(
            path.join(siteDir, 'markdown', `${resourceName}.md`),
            generateResourceMarkdown(result, resourceName, resource.$.Description)
        );
        
    } catch (error) {
        console.error(`Error processing ${resourceName}:`, error.message);
    }
}

// Helper functions for generating markdown
function generateIndexMarkdown(resources, siteUrl) {
    const siteName = new URL(siteUrl).hostname;
    let markdown = `# API Documentation for ${siteName}\n\n`;
    markdown += `This documentation was automatically generated from the Target Process API metadata.\n\n`;
    markdown += `## Available Resources\n\n`;
    
    // Group resources by type (custom vs. system)
    const customResources = resources.filter(r => r.$.Description.startsWith('Custom'));
    const systemResources = resources.filter(r => !r.$.Description.startsWith('Custom'));
    
    markdown += `### System Resources\n\n`;
    markdown += generateResourceTable(systemResources);
    
    markdown += `\n### Custom Resources\n\n`;
    markdown += generateResourceTable(customResources);
    
    return markdown;
}

function generateResourceTable(resources) {
    if (resources.length === 0) {
        return '*No resources found*\n\n';
    }
    
    let table = `| Resource | Description | URI |\n`;
    table += `|----------|-------------|-----|\n`;
    
    for (const resource of resources) {
        const name = resource.$.Name;
        const description = resource.$.Description || '';
        const uri = resource.$.Uri;
        
        table += `| [${name}](${name}.md) | ${description} | \`${uri}\` |\n`;
    }
    
    return table;
}

function generateResourceMarkdown(resourceData, resourceName, description) {
    let markdown = `# ${resourceName}\n\n`;
    markdown += `${description || 'No description provided'}\n\n`;
    
    // Add metadata
    if (resourceData.ResourceMetadataDescription) {
        const metadata = resourceData.ResourceMetadataDescription;
        
        // Add properties section if available
        if (metadata.Properties && metadata.Properties.length > 0 && metadata.Properties[0].Property) {
            markdown += `## Properties\n\n`;
            markdown += `| Name | Type | Description | Is Required |\n`;
            markdown += `|------|------|-------------|-------------|\n`;
            
            for (const prop of metadata.Properties[0].Property) {
                const name = prop.$.Name || '';
                const type = prop.$.Type || '';
                const propDescription = prop.$.Description || '';
                const isRequired = prop.$.IsRequired === 'true' ? '✓' : '';
                
                markdown += `| ${name} | \`${type}\` | ${propDescription} | ${isRequired} |\n`;
            }
            
            markdown += `\n`;
        }
        
        // Add operations section if available
        if (metadata.Operations && metadata.Operations.length > 0 && metadata.Operations[0].Operation) {
            markdown += `## Operations\n\n`;
            
            for (const op of metadata.Operations[0].Operation) {
                const name = op.$.Name || '';
                const opDescription = op.$.Description || '';
                
                markdown += `### ${name}\n\n`;
                markdown += `${opDescription}\n\n`;
                
                // Add parameters if available
                if (op.Parameters && op.Parameters.length > 0 && op.Parameters[0].Parameter) {
                    markdown += `#### Parameters\n\n`;
                    markdown += `| Name | Type | Description | Is Required |\n`;
                    markdown += `|------|------|-------------|-------------|\n`;
                    
                    for (const param of op.Parameters[0].Parameter) {
                        const paramName = param.$.Name || '';
                        const paramType = param.$.Type || '';
                        const paramDescription = param.$.Description || '';
                        const paramRequired = param.$.IsRequired === 'true' ? '✓' : '';
                        
                        markdown += `| ${paramName} | \`${paramType}\` | ${paramDescription} | ${paramRequired} |\n`;
                    }
                    
                    markdown += `\n`;
                }
            }
        }
        
        // Add relationships section if available
        if (metadata.Relationships && metadata.Relationships.length > 0 && metadata.Relationships[0].Relationship) {
            markdown += `## Relationships\n\n`;
            markdown += `| Related Entity | Relationship | Description |\n`;
            markdown += `|---------------|--------------|-------------|\n`;
            
            for (const rel of metadata.Relationships[0].Relationship) {
                const relatedEntity = rel.$.RelatedEntity || '';
                const type = rel.$.Type || '';
                const relDescription = rel.$.Description || '';
                
                markdown += `| ${relatedEntity} | ${type} | ${relDescription} |\n`;
            }
            
            markdown += `\n`;
        }
    }
    
    return markdown;
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    let siteUrl = null;
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--site' && i + 1 < args.length) {
            siteUrl = args[i + 1];
            i++;
        }
    }
    
    if (!siteUrl) {
        console.error('Error: Site URL is required. Use --site <url>');
        process.exit(1);
    }
    
    try {
        const result = await scrapeApiMetadata(siteUrl);
        console.log(`Successfully scraped ${result.totalResources} resources from ${result.siteName}`);
    } catch (error) {
        console.error('Error scraping API metadata:', error);
        process.exit(1);
    }
}

// Run main if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}

export { scrapeApiMetadata };
