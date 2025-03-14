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
  
  // Make sure the legacy path is removed for clean scraping
  try {
    await fs.rm('docs', { recursive: true, force: true });
  } catch (e) {
    // Might not exist, ignore
  }
  
  console.log('🚀 Running general documentation scraper...');
  
  // Create a direct path for the scraper to use instead of symlink during scraping
  // This prevents duplicate scraping issues by ensuring a clean target directory
  await fs.mkdir('docs', { recursive: true });
  
  try {
    // Run the scraper
    execSync('node scrape.js', { stdio: 'inherit' });
    console.log('✅ Documentation scraping completed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Error during documentation scraping:', error);
    return false;
  }
}

// Function to build search database
async function buildSearchDb() {
  console.log('\n🔄 Building search database...');
  try {
    execSync('node build-search-db.js', { stdio: 'inherit' });
    console.log('✅ Search database built successfully!');
    return true;
  } catch (error) {
    console.error('❌ Error building search database:', error);
    return false;
  }
}

// Function to scrape API metadata from a specific Target Process instance
async function scrapeApiData(siteUrl, force = false) {
  if (!siteUrl) {
    console.log('⚠️ No site URL provided. Skipping API scraping.');
    return { success: false, skipped: true };
  }
  
  console.log(`\n🔄 Preparing to scrape API metadata from ${siteUrl}...`);
  
  // Extract site name from URL
  const siteName = new URL(siteUrl).hostname.split('.')[0];
  const siteDir = path.join(API_DOCS_DIR, siteName);
  
  // Check if this site's API docs already exist
  try {
    const siteExists = await fs.stat(siteDir).then(stats => stats.isDirectory()).catch(() => false);
    
    if (siteExists && !force) {
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
async function generateOpenApi(siteName) {
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

// Function to handle complete refresh
async function completeRefresh() {
  console.log('\n🧹 Performing complete refresh of all documentation...');
  
  // Clear all existing data
  try {
    await fs.rm(GENERATED_DIR, { recursive: true, force: true });
    console.log('✅ Removed all existing documentation');
    await ensureDirectories();
  } catch (e) {
    // Might not exist, ignore
  }
  
  // Scrape dev docs
  const devDocsSuccess = await scrapeDevDocs();
  
  // Ask for API site URL
  const siteUrl = await ask('Enter Target Process site URL for API scraping (or press Enter to skip): ');
  let apiSiteResult = { success: false, siteName: null };
  
  if (siteUrl.trim()) {
    apiSiteResult = await scrapeApiData(siteUrl);
  } else {
    console.log('➡️ Skipping API scraping.');
  }
  
  // Build search database
  await buildSearchDb();
  
  // Generate OpenAPI if API was scraped
  if (apiSiteResult.success && apiSiteResult.siteName) {
    await generateOpenApi(apiSiteResult.siteName);
  }
  
  return devDocsSuccess;
}

// Main function to run the interactive scraper with simplified flow
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
    console.log(`- General Documentation: ${existing.devDocs ? '✅ Present' : '❌ Not found'}`);
    console.log(`- API Documentation: ${existing.apiDocs ? '✅ Present' : '❌ Not found'}`);
    console.log(`- OpenAPI Specs: ${existing.openapi ? '✅ Present' : '❌ Not found'}`);
    
    // Step 1: Ask if user wants a complete refresh
    const completeRefreshOption = await confirm('\nWould you like to completely clean and refresh all documentation?');
    
    let success = true;
    let apiSiteName = null;
    
    if (completeRefreshOption) {
      // Simple path: complete refresh of everything
      success = await completeRefresh();
    } else {
      // Selective refresh path
      
      // Step 2: Ask about dev.targetprocess.com docs
      if (await confirm('\nWould you like to scrape general documentation from dev.targetprocess.com?')) {
        if (existing.devDocs) {
          console.log('🗑️ Removing existing documentation...');
          await fs.rm(DEV_DOCS_DIR, { recursive: true, force: true });
          await fs.mkdir(DEV_DOCS_DIR, { recursive: true });
        }
        
        const devDocsResult = await scrapeDevDocs();
        success = success && devDocsResult;
      }
      
      // Step 3: Ask about API documentation
      if (await confirm('\nWould you like to scrape API documentation from a specific Target Process site?')) {
        const siteUrl = await ask('Enter Target Process site URL (e.g., https://example.tpondemand.com): ');
        
        if (siteUrl.trim()) {
          // Validate URL
          try {
            const url = new URL(siteUrl);
            const apiResult = await scrapeApiData(siteUrl);
            success = success && apiResult.success;
            
            if (apiResult.success) {
              apiSiteName = apiResult.siteName;
            }
          } catch (error) {
            console.error('❌ Invalid URL format. Skipping API scraping.');
          }
        } else {
          console.log('➡️ No URL provided. Skipping API scraping.');
        }
      } else if (existing.apiDocs) {
        // If we're not scraping API but it exists, get the site name for OpenAPI generation
        try {
          const sites = await fs.readdir(API_DOCS_DIR);
          if (sites.length === 1) {
            apiSiteName = sites[0];
          } else if (sites.length > 1) {
            console.log('\n📁 Available API sites:');
            sites.forEach((site, index) => {
              console.log(`  ${index + 1}. ${site}`);
            });
            
            const siteIndex = parseInt(await ask('Enter the number of the site to use (or press Enter to skip): '), 10) - 1;
            
            if (!isNaN(siteIndex) && siteIndex >= 0 && siteIndex < sites.length) {
              apiSiteName = sites[siteIndex];
            }
          }
        } catch (e) {
          // No sites available
        }
      }
      
      // Step 4: Ask about rebuilding search database
      if (existing.devDocs || success) {
        if (await confirm('\nWould you like to rebuild the search database?')) {
          const searchDbResult = await buildSearchDb();
          success = success && searchDbResult;
        }
      }
      
      // Step 5: Ask about generating OpenAPI spec
      if (apiSiteName && (await confirm(`\nWould you like to generate an OpenAPI specification for ${apiSiteName}?`))) {
        const openApiResult = await generateOpenApi(apiSiteName);
        success = success && openApiResult;
      }
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
