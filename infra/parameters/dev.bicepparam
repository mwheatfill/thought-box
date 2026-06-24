using '../main.bicep'

param location = 'westus3'
param environmentName = 'dev'
param appServicePlanSku = 'B1'

// Entra ID — a SEPARATE dev app registration is recommended (isolation from
// prod). Fill in after creating it; add the dev redirect URI + admin consent.
param azureTenantId = 'cd551af0-e42b-4a17-a193-1748738a72d7'
param azureClientId = ''

// Graph API — dev app registration (Mail.Send scoped to the DEV mailbox).
param graphClientId = ''

// Custom domain (dev)
param customDomain = 'thoughtbox-dev.desertfinancial.com'

// Email — DEV shared mailbox. MUST NOT be the prod address: the persona override
// is gated off whenever THOUGHTBOX_SHARED_MAILBOX is the prod mailbox.
param sharedMailbox = 'thoughtbox-dev@desertfinancial.com'

// AI
param aiProvider = 'anthropic'

// Monitoring — alert notifications (dev mailbox)
param alertEmail = 'thoughtbox-dev@desertfinancial.com'
// Supplied at deployment time — do not hardcode
param appInsightsApiKey = ''

// Easy Auth client secret — supplied at deployment time
param easyAuthClientSecret = ''

// Secure params — supplied at deployment time via CLI or pipeline secrets
// az deployment group create ... --parameters postgresAdminLogin=<val> postgresAdminPassword=<val> ...
param postgresAdminLogin = ''
param postgresAdminPassword = ''
param graphClientSecret = ''
param anthropicApiKey = ''
