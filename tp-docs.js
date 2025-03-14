#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { scrapeApiMetadata } from './site-api-scraper.js';
import { generateOpenApiSpec } from './openapi-generator.js';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Output directories
const GENERATED_DIR = 'generated';
const DEV_DOCS_DIR = path.join(GENERATED_DIR, 'dev-docs');
const API_DOCS_DIR = path.join(GENERATED_DIR, 'api-docs');
const OPENAPI_DIR = path.join(GENERATED_DIR, 'openapi');

// Utility to ask a question and get response
function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Utility for yes/no questions
async function confirm(question) {
  const answer = await ask(`${question} (y/n): `);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

// Utility to create necessary directories
async function ensureDirectories() {
  try {
    await fs.mkdir(GENERATED_DIR, { recursive: true });
    await fs.mkdir(DEV_DOCS_DIR, { recursive: true });
    await fs.mkdir(API_DOCS_DIR, { recursive: true });
    await fs.mkdir(OPENAPI_DIR, { recursive: true });
    console.log(`✅ Created output directories in ${GENERATED_DIR}/`);
  } catch (error) {
    console.error('Error creating directories:', error);
    throw error;
  }
}

// Check if content exists
async function checkExistingContent() {
  const existing = {
    devDocs: false,
    apiDocs: false,
    openapi: false
  };

  try {
    try {
      const devDocsStats = await fs.stat(path.join(DEV_DOCS_DIR, 'metadata.json'));
      existing.devDocs = devDocsStats.isFile();
    } catch (e) {
      // File doesn't exist, ignore
    }

    // Check for API docs (look for any site directory)
    try {
      const apiSites = await fs.readdir(API_DOCS_DIR);
      existing.apiDocs = apiSites.length > 0;
    } catch (e) {
      // Directory empty or doesn't exist, ignore
    }

    // Check for OpenAPI specs
    try {
      const openapiFiles = await fs.readdir(OPENAPI_DIR);
      existing.openapi = openapiFiles.length > 0;
    } catch (e) {
      // Directory empty or doesn't exist, ignore
    }

    return existing;
  } catch (error) {
    console.error('Error checking existing content:', error);
    return existing;
  }
}

// Update symbolic links for backward compatibility
async function updateBackwardCompatibility() {
  try {
    // Create symlinks for backward compatibility with legacy paths
    // First remove any existing symlinks/directories
    try {
      await fs.rm('docs', { recursive: true, force: true });
      console.log('✅ Removed legacy docs directory');
    } catch (e) {
      // Might not exist, ignore
    }

    try {
      await fs.rm('api-docs', { recursive: true, force: true });
      console.log('✅ Removed legacy api-docs directory');
    } catch (e) {
      // Might not exist, ignore
    }

    // Create symbolic links
    await fs.symlink(DEV_DOCS_DIR, 'docs', 'dir');
    console.log('✅ Created symbolic link from docs -> generated/dev-docs');
    
    await fs.symlink(API_DOCS_DIR, 'api-docs', 'dir');
    console.log('✅ Created symbolic link from api-docs -> generated/api-docs');
  } catch (error) {
    console.error('⚠️ Warning: Failed to create backward compatibility links:', error.message);
    console.log('You may need to manually delete the docs and api-docs directories if they exist.');
  }
}

// Function to scrape general documentation from dev.targetprocess.com
async function scrapeDevDocs(force = false) {
  console.log('\n🔄 Scraping documentation from dev.targetprocess.com...');
  
  // Check if docs exist and handle accordingly
  const existing = await checkExistingContent();
  if (existing.devDocs && !force) {
    const shouldRefresh = await confirm('Documentation already exists. Would you like to refresh it?');
    if (!shouldRefresh) {
      console.log('➡️ Skipping documentation scraping.');
      return false;
    }
    
    console.log('🗑️ Removing existing documentation...');
    await fs.rm(DEV_DOCS_DIR, { recursive: true, force: true });
    await fs.mkdir(DEV_DOCS_DIR, { recursive: true });
  }
  
  // Make sure the legacy path is removed for clean scraping
  try {
    await fs.rm('docs', { recursive: true, force: true });
  } catch (e) {
    // Might not exist, ignore
  }
  
  console.log('🚀 Running general documentation scraper...');
  
  // We'll create a symbolic link first to ensure compatibility with the scraper
  await fs.symlink(DEV_DOCS_DIR, 'docs', 'dir');
  
  try {
    // Run the scraper
    execSync('node scrape.js', { stdio: 'inherit' });
    console.log('📦 Building search database...');
    execSync('node build-search-db.js', { stdio: 'inherit' });
    console.log('✅ Documentation scraping completed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Error during documentation scraping:', error);
    return false;
  }
}

// Function to scrape API metadata from a specific Target Process instance
async function scrapeApiData(siteUrl, force = false) {
  if (!siteUrl) {
    console.log('⚠️ No site URL provided. Skipping API scraping.');
    return false;
  }
  
  console.log(`\n🔄 Preparing to scrape API metadata from ${siteUrl}...`);
  
  // Extract site name from URL
  const siteName = new URL(siteUrl).hostname.split('.')[0];
  const siteDir = path.join(API_DOCS_DIR, siteName);
  
  // Check if this site's API docs already exist
  try {
    const siteExists = await fs.stat(siteDir).then(stats => stats.isDirectory()).catch(() => false);
    
    if (siteExists && !force) {
      const shouldRefresh = await confirm(`API documentation for ${siteName} already exists. Would you like to refresh it?`);
      if (!shouldRefresh) {
        console.log('➡️ Skipping API scraping.');
        return { siteName, success: false, skipped: true };
      }
      
      console.log(`🗑️ Removing existing API documentation for ${siteName}...`);
      await fs.rm(siteDir, { recursive: true, force: true });
    }
  } catch (error) {
    // Directory doesn't exist, which is fine
  }
  
  console.log(`🚀 Scraping API metadata from ${siteUrl}...`);
  
  try {
    // Use the imported function from site-api-scraper.js
    const result = await scrapeApiMetadata(siteUrl);
    console.log(`✅ API metadata scraping completed successfully for ${siteName}!`);
    return { siteName, success: true };
  } catch (error) {
    console.error(`❌ Error scraping API metadata from ${siteUrl}:`, error);
    return { siteName, success: false, error: error.message };
  }
}

// Function to generate OpenAPI specification
async function generateOpenApi(siteName, force = false) {
  if (!siteName) {
    console.log('⚠️ No site name provided. Skipping OpenAPI generation.');
    return false;
  }
  
  console.log(`\n🔄 Preparing to generate OpenAPI specification for ${siteName}...`);
  
  const openApiPath = path.join(OPENAPI_DIR, `${siteName}-openapi.json`);
  const siteApiDocsPath = path.join(API_DOCS_DIR, siteName);
  
  // Check if API docs exist for this site
  const apiDocsExist = await fs.stat(siteApiDocsPath).then(stats => stats.isDirectory()).catch(() => false);
  if (!apiDocsExist) {
    console.error(`❌ Error: API documentation for ${siteName} does not exist. Please scrape the API first.`);
    return false;
  }
  
  // Check if OpenAPI spec already exists
  try {
    const specExists = await fs.stat(openApiPath).then(stats => stats.isFile()).catch(() => false);
    
    if (specExists && !force) {
      const shouldRefresh = await confirm(`OpenAPI specification for ${siteName} already exists. Would you like to regenerate it?`);
      if (!shouldRefresh) {
        console.log('➡️ Skipping OpenAPI generation.');
        return false;
      }
    }
  } catch (error) {
    // File doesn't exist, which is fine
  }
  
  console.log(`🚀 Generating OpenAPI specification for ${siteName}...`);
  
  try {
    // Use the imported function from openapi-generator.js
    const result = await generateOpenApiSpec(siteName);
    
    // Copy the generated OpenAPI spec to our central location
    const sourceSpec = path.join(API_DOCS_DIR, siteName, 'openapi.json');
    await fs.copyFile(sourceSpec, openApiPath);
    
    console.log(`✅ OpenAPI specification generated successfully at ${openApiPath}!`);
    return true;
  } catch (error) {
    console.error(`❌ Error generating OpenAPI specification for ${siteName}:`, error);
    return false;
  }
}

// Main function to run the interactive scraper
async function main() {
  try {
    console.log('📚 Target Process Documentation & API Tool');
    console.log('==========================================');
    
    // Ensure output directories exist
    await ensureDirectories();
    
    // Check what content already exists
    const existing = await checkExistingContent();
    
    // Display current state
    console.log('\n📊 Current Status:');
    console.log(`- Dev Documentation: ${existing.devDocs ? '✅ Present' : '❌ Not found'}`);
    console.log(`- API Documentation: ${existing.apiDocs ? '✅ Present' : '❌ Not found'}`);
    console.log(`- OpenAPI Specs: ${existing.openapi ? '✅ Present' : '❌ Not found'}`);
    
    // Ask what to do
    console.log('\n🔄 Available Actions:');
    
    // 1. General documentation
    const scrapeDevDocsOption = await confirm('Would you like to scrape general documentation from dev.targetprocess.com?');
    
    // 2. API documentation
    const scrapeApiOption = await confirm('Would you like to scrape API documentation from a specific Target Process site?');
    let siteUrl = null;
    let siteName = null;
    
    if (scrapeApiOption) {
      siteUrl = await ask('Enter Target Process site URL (e.g., https://example.tpondemand.com): ');
      
      // Validate URL
      try {
        const url = new URL(siteUrl);
        siteName = url.hostname.split('.')[0];
      } catch (error) {
        console.error('❌ Invalid URL format. Please provide a valid URL.');
        rl.close();
        return;
      }
    }
    
    // 3. OpenAPI specification
    let generateOpenApiOption = false;
    
    if (scrapeApiOption) {
      generateOpenApiOption = await confirm('Would you like to generate an OpenAPI specification from the API documentation?');
    } else if (existing.apiDocs) {
      generateOpenApiOption = await confirm('Would you like to generate an OpenAPI specification from existing API documentation?');
      
      if (generateOpenApiOption) {
        // Get list of available sites
        const sites = await fs.readdir(API_DOCS_DIR);
        
        if (sites.length === 0) {
          console.log('❌ No API documentation found. Please scrape API documentation first.');
          generateOpenApiOption = false;
        } else if (sites.length === 1) {
          siteName = sites[0];
          console.log(`📁 Using API documentation for site: ${siteName}`);
        } else {
          console.log('📁 Available sites:');
          sites.forEach((site, index) => {
            console.log(`  ${index + 1}. ${site}`);
          });
          
          const siteIndex = parseInt(await ask('Enter the number of the site to use: '), 10) - 1;
          
          if (isNaN(siteIndex) || siteIndex < 0 || siteIndex >= sites.length) {
            console.error('❌ Invalid selection. Skipping OpenAPI generation.');
            generateOpenApiOption = false;
          } else {
            siteName = sites[siteIndex];
          }
        }
      }
    }
    
    // Execute selected actions
    let success = true;
    
    // 1. Scrape general documentation
    if (scrapeDevDocsOption) {
      const devDocsResult = await scrapeDevDocs(false); // Don't force by default
      success = success && devDocsResult;
    }
    
    // 2. Scrape API documentation
    if (scrapeApiOption && siteUrl) {
      const apiResult = await scrapeApiData(siteUrl, false); // Don't force by default
      success = success && apiResult.success;
    }
    
    // 3. Generate OpenAPI specification
    if (generateOpenApiOption && siteName) {
      const openApiResult = await generateOpenApi(siteName, false); // Don't force by default
      success = success && openApiResult;
    }
    
    // Update backward compatibility links
    await updateBackwardCompatibility();
    
    console.log('\n📋 Summary:');
    console.log(`- Generated content located in: ${path.resolve(GENERATED_DIR)}/`);
    console.log('- Backward compatibility links created for legacy paths');
    
    if (success) {
      console.log('\n✅ All requested operations completed successfully!');
    } else {
      console.log('\n⚠️ Some operations encountered issues. See logs above for details.');
    }
    
    rl.close();
  } catch (error) {
    console.error('❌ An error occurred:', error);
    rl.close();
  }
}

// Run the main function
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { 
  scrapeDevDocs, 
  scrapeApiData, 
  generateOpenApi 
};
