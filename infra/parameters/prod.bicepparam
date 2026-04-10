using '../main.bicep'

param location = 'westus3'
param environmentName = 'prod'
param appServicePlanSku = 'B1'

// Entra ID — fill in after app registration
param azureTenantId = 'cd551af0-e42b-4a17-a193-1748738a72d7'
param azureClientId = '8f876f3f-82c1-46c0-abb7-73aaafde8248'

// Graph API — fill in after app registration
param graphClientId = ''

// Custom domain
param customDomain = 'thoughtbox.desertfinancial.com'

// Email
param sharedMailbox = 'thoughtbox@desertfinancial.com'

// AI
param aiProvider = 'anthropic'

// Secure params — supplied at deployment time via CLI or pipeline secrets
// az deployment group create ... --parameters postgresAdminLogin=<val> postgresAdminPassword=<val> ...
param postgresAdminLogin = ''
param postgresAdminPassword = ''
param graphClientSecret = ''
param anthropicApiKey = ''
