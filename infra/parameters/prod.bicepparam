using '../main.bicep'

param location = 'westus3'
param environmentName = 'prod'
param appServicePlanSku = 'B1'

// Entra ID — fill in after app registration
param azureTenantId = ''
param azureClientId = ''

// Graph API — fill in after app registration
param graphClientId = ''

// Email
param sharedMailbox = ''

// AI
param aiProvider = 'anthropic'

// Secure params — supplied at deployment time via CLI or pipeline secrets
// az deployment group create ... --parameters postgresAdminLogin=<val> postgresAdminPassword=<val> ...
param postgresAdminLogin = ''
param postgresAdminPassword = ''
param graphClientSecret = ''
param anthropicApiKey = ''
