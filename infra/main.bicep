// ── ThoughtBox Infrastructure ──────────────────────────────────────────────
// All Azure resources for the ThoughtBox application.
// Deploy: az deployment group create -g rg-df-thoughtbox-prod -f infra/main.bicep -p infra/parameters/prod.bicepparam

targetScope = 'resourceGroup'

// ── Parameters ─────────────────────────────────────────────────────────────

@description('Azure region for all resources')
param location string = 'westus3'

@description('Environment name (prod, dev, staging)')
param environmentName string = 'prod'

@description('App Service Plan SKU')
param appServicePlanSku string = 'B1'

@description('PostgreSQL admin login')
@secure()
param postgresAdminLogin string

@description('PostgreSQL admin password')
@secure()
param postgresAdminPassword string

@description('Entra ID tenant ID')
param azureTenantId string

@description('Entra ID app registration client ID (for Easy Auth)')
param azureClientId string

@description('Graph API app registration client ID')
param graphClientId string = ''

@description('Graph API client secret')
@secure()
param graphClientSecret string = ''

@description('Shared mailbox for sending email notifications')
param sharedMailbox string = ''

@description('AI provider: anthropic or azure-openai')
param aiProvider string = 'anthropic'

@description('Custom domain hostname (e.g., thoughtbox.desertfinancial.com). Leave empty to skip.')
param customDomain string = ''

@description('Anthropic API key')
@secure()
param anthropicApiKey string = ''

// ── Naming ─────────────────────────────────────────────────────────────────

var prefix = 'df-thoughtbox-${environmentName}'
var appServicePlanName = 'asp-${prefix}'
var appServiceName = 'app-${prefix}'
var postgresServerName = 'psql-${prefix}'
var appInsightsName = 'appi-${prefix}'
var logWorkspaceName = 'log-${prefix}'
var keyVaultName = 'kv-${prefix}'
var databaseName = 'thoughtbox'

// ── Log Analytics Workspace ────────────────────────────────────────────────

resource logWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logWorkspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ── Application Insights ───────────────────────────────────────────────────

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'Node.JS'
    WorkspaceResourceId: logWorkspace.id
  }
}

// ── Key Vault ──────────────────────────────────────────────────────────────

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

// ── Key Vault Secrets ──────────────────────────────────────────────────────

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'database-url'
  properties: {
    value: 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresServer.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'
  }
}

resource secretGraphClientSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(graphClientSecret)) {
  parent: keyVault
  name: 'graph-client-secret'
  properties: {
    value: graphClientSecret
  }
}

resource secretAnthropicApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(anthropicApiKey)) {
  parent: keyVault
  name: 'anthropic-api-key'
  properties: {
    value: anthropicApiKey
  }
}

// ── PostgreSQL Flexible Server ─────────────────────────────────────────────

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgresServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgresServer
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ── App Service Plan ───────────────────────────────────────────────────────

resource appServicePlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  properties: {
    reserved: true
    zoneRedundant: false
  }
  sku: {
    name: appServicePlanSku
  }
}

// ── App Service ────────────────────────────────────────────────────────────

resource appService 'Microsoft.Web/sites@2024-04-01' = {
  name: appServiceName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node server-adapter.js'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      webSocketsEnabled: true
    }
  }
}

// ── Key Vault Role Assignment ──────────────────────────────────────────────
// Grant the App Service managed identity "Key Vault Secrets User" role

resource kvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, appService.id, '4633458b-17de-408a-b874-0445c86b69e6')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: appService.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── App Settings ───────────────────────────────────────────────────────────
// Separate from siteConfig to ensure managed identity exists before KV refs resolve

resource appSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: appService
  name: 'appsettings'
  dependsOn: [kvRoleAssignment, secretDatabaseUrl]
  properties: {
    NODE_ENV: 'production'
    DATABASE_URL: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=database-url)'
    AZURE_CLIENT_ID: azureClientId
    AZURE_TENANT_ID: azureTenantId
    GRAPH_CLIENT_ID: graphClientId
    GRAPH_CLIENT_SECRET: !empty(graphClientSecret) ? '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=graph-client-secret)' : ''
    THOUGHTBOX_SHARED_MAILBOX: sharedMailbox
    AI_PROVIDER: aiProvider
    ANTHROPIC_API_KEY: !empty(anthropicApiKey) ? '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=anthropic-api-key)' : ''
    APP_URL: !empty(customDomain) ? 'https://${customDomain}' : 'https://${appService.properties.defaultHostName}'
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
    ApplicationInsightsAgent_EXTENSION_VERSION: '~3'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
  }
}

// ── Easy Auth ──────────────────────────────────────────────────────────────

resource authSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: appService
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      requireAuthentication: true
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          openIdIssuer: 'https://sts.windows.net/${azureTenantId}/v2.0'
          clientId: azureClientId
        }
      }
    }
    login: {
      tokenStore: {
        enabled: true
      }
    }
  }
}

// ── Custom Domain ──────────────────────────────────────────────────────────

resource customHostname 'Microsoft.Web/sites/hostNameBindings@2024-04-01' = if (!empty(customDomain)) {
  parent: appService
  name: customDomain
  properties: {
    siteName: appService.name
    hostNameType: 'Verified'
    sslState: 'Disabled'
  }
}

resource managedCert 'Microsoft.Web/certificates@2024-04-01' = if (!empty(customDomain)) {
  name: '${customDomain}-cert'
  location: location
  dependsOn: [customHostname]
  properties: {
    serverFarmId: appServicePlan.id
    canonicalName: customDomain
  }
}

// ── Outputs ────────────────────────────────────────────────────────────────

output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output appServiceName string = appService.name
output postgresServerFqdn string = postgresServer.properties.fullyQualifiedDomainName
output keyVaultName string = keyVault.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
