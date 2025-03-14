import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';

async function generateOpenApiSpec(siteName) {
    console.log(`Generating OpenAPI specification for ${siteName}...`);
    
    try {
        const siteDir = path.join('api-docs', siteName);
        const resourcesDir = path.join(siteDir, 'resources');
        
        // Verify the resources directory exists
        try {
            await fs.access(resourcesDir);
        } catch (error) {
            throw new Error(`Resources directory not found for site ${siteName}. Please run the API scraper first.`);
        }
        
        // Read the index metadata
        const indexMetadataPath = path.join(siteDir, 'index-meta.json');
        let indexMetadata;
        try {
            indexMetadata = JSON.parse(
                await fs.readFile(indexMetadataPath, 'utf-8')
            );
        } catch (error) {
            throw new Error(`Could not read index metadata for site ${siteName}: ${error.message}`);
        }
        
        // Initialize OpenAPI structure
        const openApiSpec = {
            openapi: '3.0.0',
            info: {
                title: `${siteName} Target Process API`,
                description: 'Auto-generated API specification from site-specific Target Process metadata',
                version: '1.0.0'
            },
            servers: [
                {
                    url: `https://${siteName}.tpondemand.com/api/v1`,
                    description: 'Target Process API v1'
                }
            ],
            paths: {},
            components: {
                schemas: {},
                securitySchemes: {
                    basicAuth: {
                        type: 'http',
                        scheme: 'basic',
                        description: 'Basic authentication with username and password'
                    },
                    tokenAuth: {
                        type: 'apiKey',
                        in: 'query',
                        name: 'access_token',
                        description: 'API token authentication'
                    }
                }
            },
            security: [
                { basicAuth: [] },
                { tokenAuth: [] }
            ]
        };
        
        // Process each resource
        console.log(`Processing ${indexMetadata.length} resources for OpenAPI specification...`);
        
        for (const resource of indexMetadata) {
            const resourceName = resource.$.Name;
            
            try {
                // Read resource metadata
                const resourceDataPath = path.join(resourcesDir, `${resourceName}.json`);
                let resourceData;
                
                try {
                    resourceData = JSON.parse(
                        await fs.readFile(resourceDataPath, 'utf-8')
                    );
                } catch (error) {
                    console.error(`Could not read resource data for ${resourceName}: ${error.message}`);
                    continue;
                }
                
                // Process resource into OpenAPI components
                processResourceForOpenApi(resourceData, resourceName, openApiSpec, resource.$.Description);
                
            } catch (error) {
                console.error(`Error processing ${resourceName} for OpenAPI:`, error.message);
            }
        }
        
        // Save OpenAPI specification
        await fs.writeFile(
            path.join(siteDir, 'openapi.json'),
            JSON.stringify(openApiSpec, null, 2)
        );
        
        console.log(`OpenAPI specification generated at ${path.join(siteDir, 'openapi.json')}`);
        return openApiSpec;
    } catch (error) {
        console.error('Error generating OpenAPI specification:', error);
        throw error;
    }
}

function processResourceForOpenApi(resourceData, resourceName, openApiSpec, description) {
    // Add schema component
    const properties = extractProperties(resourceData);
    
    openApiSpec.components.schemas[resourceName] = {
        type: 'object',
        description: description || `${resourceName} entity`,
        properties: properties
    };
    
    // Add paths for standard operations
    addResourcePaths(resourceName, openApiSpec, properties);
}

function extractProperties(resourceData) {
    // This function extracts property definitions from the resource metadata
    const properties = {};
    
    if (resourceData.ResourceMetadataDescription && 
        resourceData.ResourceMetadataDescription.Properties && 
        resourceData.ResourceMetadataDescription.Properties.length > 0 &&
        resourceData.ResourceMetadataDescription.Properties[0].Property) {
        
        for (const prop of resourceData.ResourceMetadataDescription.Properties[0].Property) {
            const name = prop.$.Name;
            const type = mapType(prop.$.Type);
            const description = prop.$.Description || '';
            
            properties[name] = {
                type: type.type,
                description: description
            };
            
            // Add format if available
            if (type.format) {
                properties[name].format = type.format;
            }
            
            // Handle enum types
            if (prop.$.IsEnum === 'true' && prop.EnumValues && prop.EnumValues.length > 0 && prop.EnumValues[0].Value) {
                properties[name].enum = prop.EnumValues[0].Value.map(v => v._);
            }
        }
    }
    
    return properties;
}

function mapType(tpType) {
    // Map Target Process types to OpenAPI types
    switch (tpType) {
        case 'String':
            return { type: 'string' };
        case 'Int32':
            return { type: 'integer', format: 'int32' };
        case 'Int64':
            return { type: 'integer', format: 'int64' };
        case 'Single':
        case 'Double':
        case 'Decimal':
            return { type: 'number', format: 'double' };
        case 'Boolean':
            return { type: 'boolean' };
        case 'DateTime':
            return { type: 'string', format: 'date-time' };
        case 'Date':
            return { type: 'string', format: 'date' };
        case 'EntityReference':
        case 'EntityCollection':
            return { type: 'object' };
        default:
            return { type: 'string' };
    }
}

function addResourcePaths(resourceName, openApiSpec, properties) {
    // Add standard CRUD paths for the resource
    const basePath = `/${resourceName}s`;
    const pluralName = `${resourceName}s`;
    
    // GET collection
    openApiSpec.paths[basePath] = {
        get: {
            summary: `Get all ${pluralName}`,
            description: `Retrieves a collection of ${resourceName} entities`,
            operationId: `getAll${pluralName}`,
            tags: [resourceName],
            parameters: [
                {
                    name: 'take',
                    in: 'query',
                    description: 'Number of items to return',
                    schema: { type: 'integer', default: 100 }
                },
                {
                    name: 'skip',
                    in: 'query',
                    description: 'Number of items to skip',
                    schema: { type: 'integer', default: 0 }
                },
                {
                    name: 'orderBy',
                    in: 'query',
                    description: 'Property to order by',
                    schema: { type: 'string' }
                },
                {
                    name: 'where',
                    in: 'query',
                    description: 'Filter condition',
                    schema: { type: 'string' }
                },
                {
                    name: 'format',
                    in: 'query',
                    description: 'Response format (json or xml)',
                    schema: { type: 'string', enum: ['json', 'xml'], default: 'json' }
                },
                {
                    name: 'include',
                    in: 'query',
                    description: 'Related entities to include',
                    schema: { type: 'string' }
                }
            ],
            responses: {
                '200': {
                    description: `Array of ${resourceName} items`,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: `#/components/schemas/${resourceName}` }
                            }
                        }
                    }
                },
                '400': {
                    description: 'Bad request'
                },
                '401': {
                    description: 'Unauthorized'
                }
            }
        }
    };
    
    // GET single item
    openApiSpec.paths[`${basePath}/{id}`] = {
        get: {
            summary: `Get a single ${resourceName}`,
            description: `Retrieves a specific ${resourceName} by ID`,
            operationId: `get${resourceName}`,
            tags: [resourceName],
            parameters: [
                {
                    name: 'id',
                    in: 'path',
                    required: true,
                    description: `ID of the ${resourceName}`,
                    schema: { type: 'integer' }
                },
                {
                    name: 'format',
                    in: 'query',
                    description: 'Response format (json or xml)',
                    schema: { type: 'string', enum: ['json', 'xml'], default: 'json' }
                },
                {
                    name: 'include',
                    in: 'query',
                    description: 'Related entities to include',
                    schema: { type: 'string' }
                }
            ],
            responses: {
                '200': {
                    description: `${resourceName} found`,
                    content: {
                        'application/json': {
                            schema: { $ref: `#/components/schemas/${resourceName}` }
                        }
                    }
                },
                '404': {
                    description: `${resourceName} not found`
                },
                '401': {
                    description: 'Unauthorized'
                }
            }
        }
    };
    
    // POST - Create new item
    openApiSpec.paths[basePath].post = {
        summary: `Create a new ${resourceName}`,
        description: `Creates a new ${resourceName} entity`,
        operationId: `create${resourceName}`,
        tags: [resourceName],
        requestBody: {
            description: `${resourceName} object to be created`,
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: `#/components/schemas/${resourceName}` }
                }
            }
        },
        responses: {
            '201': {
                description: `${resourceName} created successfully`,
                content: {
                    'application/json': {
                        schema: { $ref: `#/components/schemas/${resourceName}` }
                    }
                }
            },
            '400': {
                description: 'Bad request'
            },
            '401': {
                description: 'Unauthorized'
            }
        }
    };
    
    // PUT - Update item
    openApiSpec.paths[`${basePath}/{id}`].put = {
        summary: `Update a ${resourceName}`,
        description: `Updates an existing ${resourceName} entity`,
        operationId: `update${resourceName}`,
        tags: [resourceName],
        parameters: [
            {
                name: 'id',
                in: 'path',
                required: true,
                description: `ID of the ${resourceName}`,
                schema: { type: 'integer' }
            }
        ],
        requestBody: {
            description: `Updated ${resourceName} object`,
            required: true,
            content: {
                'application/json': {
                    schema: { $ref: `#/components/schemas/${resourceName}` }
                }
            }
        },
        responses: {
            '200': {
                description: `${resourceName} updated successfully`,
                content: {
                    'application/json': {
                        schema: { $ref: `#/components/schemas/${resourceName}` }
                    }
                }
            },
            '400': {
                description: 'Bad request'
            },
            '404': {
                description: `${resourceName} not found`
            },
            '401': {
                description: 'Unauthorized'
            }
        }
    };
    
    // DELETE - Delete item
    openApiSpec.paths[`${basePath}/{id}`].delete = {
        summary: `Delete a ${resourceName}`,
        description: `Deletes an existing ${resourceName} entity`,
        operationId: `delete${resourceName}`,
        tags: [resourceName],
        parameters: [
            {
                name: 'id',
                in: 'path',
                required: true,
                description: `ID of the ${resourceName}`,
                schema: { type: 'integer' }
            }
        ],
        responses: {
            '204': {
                description: `${resourceName} deleted successfully`
            },
            '404': {
                description: `${resourceName} not found`
            },
            '401': {
                description: 'Unauthorized'
            }
        }
    };
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    let siteName = null;
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--site' && i + 1 < args.length) {
            siteName = args[i + 1];
            i++;
        }
    }
    
    if (!siteName) {
        console.error('Error: Site name is required. Use --site <name>');
        process.exit(1);
    }
    
    try {
        await generateOpenApiSpec(siteName);
    } catch (error) {
        console.error('Error generating OpenAPI specification:', error);
        process.exit(1);
    }
}

// Run main if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}

export { generateOpenApiSpec };
