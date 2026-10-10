// Monthly cost budgets on the resource group. They only alert; they never stop anything.

@description('Budget amounts in the billing currency.')
param amounts int[]

@description('Email address that receives the alerts.')
param contactEmail string

@description('First day of the first budget month, yyyy-MM-dd. Must be the first of the current month.')
param startDate string

resource budgets 'Microsoft.Consumption/budgets@2024-08-01' = [
  for amount in amounts: {
    name: 'budget-${amount}'
    properties: {
      category: 'Cost'
      amount: amount
      timeGrain: 'Monthly'
      timePeriod: {
        startDate: startDate
      }
      notifications: {
        actual100: {
          enabled: true
          operator: 'GreaterThanOrEqualTo'
          threshold: 100
          thresholdType: 'Actual'
          contactEmails: [contactEmail]
        }
        forecast100: {
          enabled: true
          operator: 'GreaterThanOrEqualTo'
          threshold: 100
          thresholdType: 'Forecasted'
          contactEmails: [contactEmail]
        }
      }
    }
  }
]
