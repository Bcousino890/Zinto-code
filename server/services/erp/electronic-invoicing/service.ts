import { storage } from '../../../storage';
import { IElectronicInvoiceProvider, IHealthIntegrationProvider } from './types';

export class ElectronicInvoicingRegistry {
  private static invoiceProviders = new Map<string, IElectronicInvoiceProvider>();
  private static healthProviders = new Map<string, IHealthIntegrationProvider>();

  public static registerInvoiceProvider(countryCode: string, provider: IElectronicInvoiceProvider) {
    this.invoiceProviders.set(countryCode.toUpperCase(), provider);
  }

  public static registerHealthProvider(countryCode: string, provider: IHealthIntegrationProvider) {
    this.healthProviders.set(countryCode.toUpperCase(), provider);
  }

  public static getInvoiceProvider(countryCode: string): IElectronicInvoiceProvider | undefined {
    return this.invoiceProviders.get(countryCode.toUpperCase());
  }

  public static getHealthProvider(countryCode: string): IHealthIntegrationProvider | undefined {
    return this.healthProviders.get(countryCode.toUpperCase());
  }
}

export class ElectronicInvoicingService {
  async getConfiguration(companyId: number) {
    const enabledSetting = await storage.getCompanySetting(companyId, 'electronic_invoicing.enabled');
    const countrySetting = await storage.getCompanySetting(companyId, 'electronic_invoicing.country');
    const credentialsSetting = await storage.getCompanySetting(companyId, 'electronic_invoicing.credentials');
    const healthEnabledSetting = await storage.getCompanySetting(companyId, 'health_integration.enabled');
    const healthCredentialsSetting = await storage.getCompanySetting(companyId, 'health_integration.credentials');

    const enabled = enabledSetting?.value === true || enabledSetting?.value === 'true';
    const country = (countrySetting?.value as string) || 'CO';
    const credentials = credentialsSetting?.value || {};
    const healthEnabled = healthEnabledSetting?.value === true || healthEnabledSetting?.value === 'true';
    const healthCredentials = healthCredentialsSetting?.value || {};

    return {
      enabled,
      country,
      credentials,
      healthEnabled,
      healthCredentials,
    };
  }

  async getInvoiceProvider(companyId: number): Promise<IElectronicInvoiceProvider | undefined> {
    const config = await this.getConfiguration(companyId);
    if (!config.enabled) {
      return undefined;
    }
    return ElectronicInvoicingRegistry.getInvoiceProvider(config.country);
  }

  async getHealthProvider(companyId: number): Promise<IHealthIntegrationProvider | undefined> {
    const config = await this.getConfiguration(companyId);
    if (!config.enabled || !config.healthEnabled) {
      return undefined;
    }
    return ElectronicInvoicingRegistry.getHealthProvider(config.country);
  }
}

export const electronicInvoicingService = new ElectronicInvoicingService();
