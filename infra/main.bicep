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

@description('Email address for Azure Monitor alert notifications')
param alertEmail string = ''

@description('App Insights API key for admin analytics page')
param appInsightsApiKey string = ''

@description('Easy Auth client secret for Entra ID')
@secure()
param easyAuthClientSecret string = ''

// ── Naming ─────────────────────────────────────────────────────────────────

var prefix = 'df-thoughtbox-${environmentName}'
var appServicePlanName = 'asp-${prefix}'
var appServiceName = 'app-${prefix}'
var postgresServerName = 'psql-${prefix}'
var appInsightsName = 'appi-${prefix}'
var logWorkspaceName = 'log-${prefix}'
var keyVaultName = 'kv-${prefix}'
var storageAccountName = 'stdfthoughtbox${environmentName}'
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

// Only create/update database-url secret if credentials are provided.
// Empty params would overwrite a valid secret with an empty connection string.
resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(postgresAdminLogin) && !empty(postgresAdminPassword)) {
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

resource secretAppInsightsApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(appInsightsApiKey)) {
  parent: keyVault
  name: 'appinsights-api-key'
  properties: {
    value: appInsightsApiKey
  }
}

resource secretEasyAuthClientSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(easyAuthClientSecret)) {
  parent: keyVault
  name: 'easy-auth-client-secret'
  properties: {
    value: easyAuthClientSecret
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
      backupRetentionDays: 14
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

// ── Storage Account ────────────────────────────────────────────────────────
// Blob storage for profile photos and file attachments.
// Shared key access disabled — App Service uses managed identity (RBAC).

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 14
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 14
    }
    isVersioningEnabled: true
  }
}

resource photosContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobServices
  name: 'photos'
  properties: {
    publicAccess: 'None'
  }
}

resource attachmentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobServices
  name: 'attachments'
  properties: {
    publicAccess: 'None'
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

// ── Storage Role Assignment ────────────────────────────────────────────────
// Grant the App Service managed identity "Storage Blob Data Contributor" role

resource storageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, appService.id, 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: appService.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── App Settings ───────────────────────────────────────────────────────────
// Separate from siteConfig to ensure managed identity exists before KV refs resolve

resource appSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: appService
  name: 'appsettings'
  dependsOn: [kvRoleAssignment]
  properties: {
    NODE_ENV: 'production'
    DATABASE_URL: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=database-url)'
    AZURE_STORAGE_ACCOUNT: storageAccount.name
    AZURE_CLIENT_ID: azureClientId
    AZURE_TENANT_ID: azureTenantId
    GRAPH_CLIENT_ID: graphClientId
    GRAPH_CLIENT_SECRET: !empty(graphClientSecret) ? '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=graph-client-secret)' : ''
    THOUGHTBOX_SHARED_MAILBOX: sharedMailbox
    AI_PROVIDER: aiProvider
    ANTHROPIC_API_KEY: !empty(anthropicApiKey) ? '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=anthropic-api-key)' : ''
    APP_URL: !empty(customDomain) ? 'https://${customDomain}' : 'https://${appService.properties.defaultHostName}'
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
    APPINSIGHTS_API_KEY: !empty(appInsightsApiKey) ? '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=appinsights-api-key)' : ''
    ApplicationInsightsAgent_EXTENSION_VERSION: '~3'
    MICROSOFT_PROVIDER_AUTHENTICATION_SECRET: !empty(easyAuthClientSecret) ? '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=easy-auth-client-secret)' : ''
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    WEBSITE_RUN_FROM_PACKAGE: '1'
    WEBSITE_HTTPLOGGING_RETENTION_DAYS: '3'
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
      excludedPaths: ['/health']
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
// Hostname binding and managed SSL certificate are managed via Azure CLI,
// not Bicep. Bicep's hostNameBindings resource resets sslState to Disabled
// on every deploy, breaking the SSL binding. Do not add it back.
//
// Setup commands (one-time):
//   az webapp config hostname add --webapp-name app-df-thoughtbox-prod -g rg-df-thoughtbox-prod --hostname thoughtbox.desertfinancial.com
//   az webapp config ssl create --name app-df-thoughtbox-prod -g rg-df-thoughtbox-prod --hostname thoughtbox.desertfinancial.com
//   az webapp config ssl bind --name app-df-thoughtbox-prod -g rg-df-thoughtbox-prod --certificate-thumbprint <thumbprint> --ssl-type SNI

// ── Monitoring: Action Group ───────────────────────────────────────────────

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-${prefix}'
  location: 'global'
  properties: {
    groupShortName: 'ThoughtBox'
    enabled: true
    emailReceivers: !empty(alertEmail) ? [
      {
        name: 'Admin'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ] : []
  }
}

// ── Monitoring: Availability Test ──────────────────────────────────────────

var healthUrl = 'https://${!empty(customDomain) ? customDomain : appService.properties.defaultHostName}/health'

resource availabilityTest 'Microsoft.Insights/webtests@2022-06-15' = {
  name: 'avail-${prefix}'
  location: location
  tags: {
    'hidden-link:${appInsights.id}': 'Resource'
  }
  kind: 'standard'
  properties: {
    SyntheticMonitorId: 'avail-${prefix}'
    Name: 'ThoughtBox Health Check'
    Enabled: true
    Frequency: 300
    Timeout: 30
    Kind: 'standard'
    RetryEnabled: true
    Locations: [
      { Id: 'us-tx-sn1-azr' }
      { Id: 'us-il-ch1-azr' }
      { Id: 'us-ca-sjc-azr' }
    ]
    Request: {
      RequestUrl: healthUrl
      HttpVerb: 'GET'
      ParseDependentRequests: false
    }
    ValidationRules: {
      ExpectedHttpStatusCode: 200
      SSLCheck: true
      SSLCertRemainingLifetimeCheck: 7
    }
  }
}

// ── Monitoring: Alert — Availability ───────────────────────────────────────

resource alertAvailability 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${prefix}-availability'
  location: 'global'
  properties: {
    description: 'ThoughtBox health check failing from 2+ locations'
    severity: 1
    enabled: true
    scopes: [appInsights.id, availabilityTest.id]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.WebtestLocationAvailabilityCriteria'
      webTestId: availabilityTest.id
      componentId: appInsights.id
      failedLocationCount: 2
    }
    actions: [
      { actionGroupId: actionGroup.id }
    ]
  }
}

// ── Monitoring: Alert — HTTP 5xx Errors ────────────────────────────────────

resource alert5xx 'Microsoft.Insights/scheduledQueryRules@2021-08-01' = {
  name: 'alert-${prefix}-5xx'
  location: location
  properties: {
    description: 'HTTP 5xx server errors exceeded threshold'
    severity: 1
    enabled: true
    scopes: [appInsights.id]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          query: 'requests | where toint(resultCode) >= 500'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 5
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
    }
  }
}

// ── Monitoring: Alert — Failed Dependencies ────────────────────────────────

resource alertDependencies 'Microsoft.Insights/scheduledQueryRules@2021-08-01' = {
  name: 'alert-${prefix}-dependencies'
  location: location
  properties: {
    description: 'External dependency failures (DB, Graph API) exceeded threshold'
    severity: 2
    enabled: true
    scopes: [appInsights.id]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          query: 'dependencies | where success == false'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 10
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
    }
  }
}

// ── Monitoring: Alert — Unhandled Exceptions ───────────────────────────────

resource alertExceptions 'Microsoft.Insights/scheduledQueryRules@2021-08-01' = {
  name: 'alert-${prefix}-exceptions'
  location: location
  properties: {
    description: 'Unhandled exception rate exceeded threshold'
    severity: 2
    enabled: true
    scopes: [appInsights.id]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          query: 'exceptions'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 10
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
    }
  }
}

// ── Monitoring: Alert — Slow Response Time ─────────────────────────────────

resource alertResponseTime 'Microsoft.Insights/scheduledQueryRules@2021-08-01' = {
  name: 'alert-${prefix}-response-time'
  location: location
  properties: {
    description: 'Too many requests exceeding 5 second response time'
    severity: 2
    enabled: true
    scopes: [appInsights.id]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      allOf: [
        {
          query: 'requests | where duration > 5000'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 20
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
    }
  }
}

// ── Monitoring: Alert — PostgreSQL CPU ─────────────────────────────────────

resource alertPostgresCpu 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${prefix}-postgres-cpu'
  location: 'global'
  properties: {
    description: 'PostgreSQL CPU utilization exceeded 80%'
    severity: 2
    enabled: true
    scopes: [postgresServer.id]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighCpu'
          metricName: 'cpu_percent'
          metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers'
          operator: 'GreaterThan'
          threshold: 80
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      { actionGroupId: actionGroup.id }
    ]
  }
}

// ── Monitoring: Alert — PostgreSQL Storage ─────────────────────────────────

resource alertPostgresStorage 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${prefix}-postgres-storage'
  location: 'global'
  properties: {
    description: 'PostgreSQL storage utilization exceeded 80%'
    severity: 2
    enabled: true
    scopes: [postgresServer.id]
    evaluationFrequency: 'PT15M'
    windowSize: 'PT1H'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighStorage'
          metricName: 'storage_percent'
          metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers'
          operator: 'GreaterThan'
          threshold: 80
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      { actionGroupId: actionGroup.id }
    ]
  }
}

// ── Outputs ────────────────────────────────────────────────────────────────

output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output appServiceName string = appService.name
output postgresServerFqdn string = postgresServer.properties.fullyQualifiedDomainName
output keyVaultName string = keyVault.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
