import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';

async function generateOpenApiSpec(siteName) {
    console.log(`Generating OpenAPI specification for ${siteName}...`);

    try {
        // Use both legacy and generated paths
        const siteDir = path.join('api-docs', siteName);
        const generatedSiteDir = path.join('generated/api-docs', siteName);
        const resourcesDir = path.join(siteDir, 'resources');
        const generatedResourcesDir = path.join(generatedSiteDir, 'resources');

        // Verify the resources directory exists (check both locations)
        let useGeneratedPath = false;
        try {
            await fs.access(resourcesDir);
        } catch (error) {
            try {
                await fs.access(generatedResourcesDir);
                useGeneratedPath = true;
            } catch (error2) {
                throw new Error(`Resources directory not found for site ${siteName}. Please run the API scraper first.`);
            }
        }

        // Read the index metadata from the appropriate location
        const indexMetadataPath = useGeneratedPath 
            ? path.join(generatedSiteDir, 'index-meta.json')
            : path.join(siteDir, 'index-meta.json');
        
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
                await processResourceForOpenApi(resourceData, resourceName, openApiSpec, resource.$.Description);
                
            } catch (error) {
                console.error(`Error processing ${resourceName} for OpenAPI:`, error.message);
            }
        }
        
        // Save OpenAPI specification to both locations
        const openApiJson = JSON.stringify(openApiSpec, null, 2);
        await fs.writeFile(
            path.join(siteDir, 'openapi.json'),
            openApiJson
        );
        
        // Also save to generated directory
        await fs.writeFile(
            path.join(generatedSiteDir, 'openapi.json'),
            openApiJson
        );
        
        // Also save to the central openapi directory
        await fs.mkdir(path.join('generated', 'openapi'), { recursive: true });
        await fs.writeFile(
            path.join('generated', 'openapi', `${siteName}-openapi.json`),
            openApiJson
        );
        
        console.log(`OpenAPI specification generated at multiple locations:`);
        console.log(`- ${path.join(siteDir, 'openapi.json')}`);
        console.log(`- ${path.join(generatedSiteDir, 'openapi.json')}`);
        console.log(`- ${path.join('generated', 'openapi', `${siteName}-openapi.json`)}`);
        return openApiSpec;
    } catch (error) {
        console.error('Error generating OpenAPI specification:', error);
        throw error;
    }
}

async function processResourceForOpenApi(resourceData, resourceName, openApiSpec, description) {
    // Add schema component
    const properties = await extractProperties(resourceData, resourceName);
    
    // Determine which properties are required
    const requiredProperties = [];
    for (const [propName, propDef] of Object.entries(properties)) {
        if (propDef.required === true) {
            requiredProperties.push(propName);
            // Remove the required flag from the property definition as it's moved to the schema level
            delete propDef.required;
        }
    }
    
    openApiSpec.components.schemas[resourceName] = {
        type: 'object',
        description: description || `${resourceName} entity`,
        properties: properties
    };
    
    // Add required properties if any exist
    if (requiredProperties.length > 0) {
        openApiSpec.components.schemas[resourceName].required = requiredProperties;
    }
    
    // Add paths for standard operations
    addResourcePaths(resourceName, openApiSpec, properties);
}

async function extractProperties(resourceData, resourceName) {
    // This function extracts property definitions from the resource metadata
    const properties = {};
    
    try {
        // Get the site name from the current working directory structure
        const currentDir = process.cwd();
        const siteDir = path.join('api-docs');
        const generatedSiteDir = path.join('generated/api-docs');
        
        // Find all site directories
        const siteDirs = [];
        try {
            const sites = await fs.readdir(siteDir);
            for (const site of sites) {
                const sitePath = path.join(siteDir, site);
                const stats = await fs.stat(sitePath);
                if (stats.isDirectory()) {
                    siteDirs.push({ name: site, path: sitePath });
                }
            }
        } catch (error) {
            console.warn(`Could not read site directories: ${error.message}`);
        }
        
        // Find the site directory that contains the resource metadata
        let siteName = null;
        for (const site of siteDirs) {
            const resourcePath = path.join(site.path, 'resources', `${resourceName}.json`);
            try {
                await fs.access(resourcePath);
                siteName = site.name;
                break;
            } catch (error) {
                // Resource not found in this site, continue
            }
        }
        
        if (!siteName) {
            console.warn(`Could not determine site name for resource ${resourceName}`);
            // Fall back to basic metadata
        } else {
            // First try to load the detailed metadata file
            const detailedMetadataPath = path.join(siteDir, siteName, 'resources', `${resourceName}-meta.json`);
            const generatedDetailedMetadataPath = path.join(generatedSiteDir, siteName, 'resources', `${resourceName}-meta.json`);
            
            let detailedMetadata = null;
            
            try {
                // Try to read from the legacy path first
                detailedMetadata = JSON.parse(
                    await fs.readFile(detailedMetadataPath, 'utf-8')
                );
            } catch (error) {
                try {
                    // If that fails, try the generated path
                    detailedMetadata = JSON.parse(
                        await fs.readFile(generatedDetailedMetadataPath, 'utf-8')
                    );
                } catch (error2) {
                    // If both fail, we'll fall back to the basic metadata
                    console.warn(`Detailed metadata not found for ${resourceName}, falling back to basic metadata`);
                }
            }
            
            if (detailedMetadata && detailedMetadata.ResourceMetadataDescription) {
            // Process detailed metadata
            const metadata = detailedMetadata.ResourceMetadataDescription;
            
            // Process simple properties
            if (metadata.ResourceMetadataPropertiesDescription && 
                metadata.ResourceMetadataPropertiesDescription.length > 0 &&
                metadata.ResourceMetadataPropertiesDescription[0].ResourceMetadataPropertiesResourceValuesDescription &&
                metadata.ResourceMetadataPropertiesDescription[0].ResourceMetadataPropertiesResourceValuesDescription.length > 0) {
                
                const simpleProps = metadata.ResourceMetadataPropertiesDescription[0].ResourceMetadataPropertiesResourceValuesDescription[0].ResourceFieldMetadataDescription;
                
                if (Array.isArray(simpleProps)) {
                    for (const prop of simpleProps) {
                        const name = prop.$.Name;
                        const type = mapType(prop.$.Type);
                        const description = prop.$.Description || '';
                        const isRequired = prop.$.IsRequired === 'true';
                        const canSet = prop.$.CanSet === 'true';
                        const canGet = prop.$.CanGet === 'true';
                        const isDeprecated = prop.$.IsDeprecated === 'true';
                        
                        properties[name] = {
                            type: type.type,
                            description: description,
                            required: isRequired,
                            readOnly: !canSet && canGet,
                            deprecated: isDeprecated
                        };
                        
                        // Add format if available
                        if (type.format) {
                            properties[name].format = type.format;
                        }
                    }
                }
            }
            
            // Process reference properties (complex types)
            if (metadata.ResourceMetadataPropertiesDescription && 
                metadata.ResourceMetadataPropertiesDescription.length > 0 &&
                metadata.ResourceMetadataPropertiesDescription[0].ResourceMetadataPropertiesResourceReferencesDescription &&
                metadata.ResourceMetadataPropertiesDescription[0].ResourceMetadataPropertiesResourceReferencesDescription.length > 0) {
                
                const refProps = metadata.ResourceMetadataPropertiesDescription[0].ResourceMetadataPropertiesResourceReferencesDescription[0].ResourceFieldMetadataDescription;
                
                if (Array.isArray(refProps)) {
                    for (const prop of refProps) {
                        const name = prop.$.Name;
                        const refType = prop.$.Type;
                        const description = prop.$.Description || '';
                        const isRequired = prop.$.IsRequired === 'true';
                        const canSet = prop.$.CanSet === 'true';
                        const canGet = prop.$.CanGet === 'true';
                        const isDeprecated = prop.$.IsDeprecated === 'true';
                        
                        properties[name] = {
                            type: 'object',
                            description: `${description} (Reference to ${refType})`,
                            required: isRequired,
                            readOnly: !canSet && canGet,
                            deprecated: isDeprecated,
                            properties: {
                                id: {
                                    type: 'integer',
                                    format: 'int32',
                                    description: `ID of the referenced ${refType}`
                                }
                            }
                        };
                    }
                }
            }
            
            // Process collection properties
            if (metadata.ResourceMetadataPropertiesDescription && 
                metadata.ResourceMetadataPropertiesDescription.length > 0 &&
                metadata.ResourceMetadataPropertiesDescription[0].ResourceMetadataPropertiesResourceCollectionsDescription &&
                metadata.ResourceMetadataPropertiesDescription[0].ResourceMetadataPropertiesResourceCollectionsDescription.length > 0) {
                
                const collProps = metadata.ResourceMetadataPropertiesDescription[0].ResourceMetadataPropertiesResourceCollectionsDescription[0].ResourceCollecitonFieldMetadataDescription;
                
                if (Array.isArray(collProps)) {
                    for (const prop of collProps) {
                        const name = prop.$.Name;
                        const collType = prop.$.Type;
                        const description = prop.$.Description || '';
                        const isRequired = prop.$.IsRequired === 'true';
                        const canSet = prop.$.CanSet === 'true';
                        const canGet = prop.$.CanGet === 'true';
                        const isDeprecated = prop.$.IsDeprecated === 'true';
                        const canAdd = prop.$.CanAdd === 'true';
                        const canRemove = prop.$.CanRemove === 'true';
                        
                        properties[name] = {
                            type: 'array',
                            description: `${description} (Collection of ${collType})`,
                            required: isRequired,
                            readOnly: !canSet && canGet,
                            deprecated: isDeprecated,
                            items: {
                                type: 'object',
                                properties: {
                                    id: {
                                        type: 'integer',
                                        format: 'int32',
                                        description: `ID of the ${collType} item`
                                    }
                                }
                            }
                        };
                    }
                }
            }
        } else {
            // Fall back to basic metadata if detailed metadata is not available
            if (resourceData.ResourceMetadataDescription && 
                resourceData.ResourceMetadataDescription.Properties && 
                resourceData.ResourceMetadataDescription.Properties.length > 0 &&
                resourceData.ResourceMetadataDescription.Properties[0].Property) {
                
                for (const prop of resourceData.ResourceMetadataDescription.Properties[0].Property) {
                    const name = prop.$.Name;
                    const type = mapType(prop.$.Type);
                    const description = prop.$.Description || '';
                    const isRequired = prop.$.IsRequired === 'true';
                    
                    properties[name] = {
                        type: type.type,
                        description: description,
                        required: isRequired
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
        }
        }
    } catch (error) {
        console.error(`Error extracting properties for ${resourceName}:`, error.message);
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
