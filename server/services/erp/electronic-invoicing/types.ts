
import { Company, CompanySetting } from "../../../../shared/schema";

/**
 * Context required for electronic invoicing operations.
 * Includes company details and settings specific to the country's integration.
 */
export interface ElectronicInvoiceContext {
  companyId: number;
  company: Company;
  companySettings?: CompanySetting;
  providerName: string;
  providerConfig?: Record<string, any>; // Encrypted credentials, environment settings, etc.
}

/**
 * Standardized result structure for electronic invoicing operations.
 */
export interface ElectronicInvoiceResult {
  success: boolean;
  status: 'validated' | 'rejected' | 'failed';
  documentNumber?: string;
  cufe?: string; // Unique Code of Electronic Invoice
  transactionId?: string; // Provider's transaction ID
  pdfUrl?: string;
  xmlUrl?: string;
  qrCodeText?: string;
  metadata?: Record<string, any>;
  errors?: string[];
  rawResponse?: any; // Raw provider response for logging/debugging
}

/**
 * Standardized result for RIPS submission operations.
 */
export interface RipsSubmissionResult {
  success: boolean;
  submissionId?: string; // e.g., CUV (Código Único de Validación)
  validationStatus?: 'valid' | 'invalid' | 'pending';
  errors?: string[];
  rawResponse?: any;
}

/**
 * Input data for RIPS generation and submission.
 * This structure will need to accommodate the various data required by the new JSON format (users, transactions, procedures, medications, etc.).
 */
export interface RipsInputData {
  // This will be further defined based on the JSON schema requirements (Anexo Técnico 2)
  // Placeholder for now to define the structure of the data to be processed.
  data: Record<string, any>; 
}


/**
 * Core interface for a country-specific electronic invoicing provider strategy.
 */
export interface IElectronicInvoiceProvider {
  /**
   * Gets the unique identifier for the provider (e.g., 'colombia-dian').
   */
  getProviderName(): string;

  calculateIdentifier(invoice: any, items: any[], context: any): string;
  generateXml(invoice: any, items: any[], context: any): string;
  signXml(unsignedXml: string, context: any): string;
  transmit(signedXml: string, context: any): Promise<ElectronicInvoiceResult>;

  /**
   * Emits an electronic invoice for a given transaction.
   * @param context - The context required for the operation (company, settings, etc.).
   * @param transactionData - The specific data for the invoice transaction.
   * @returns A promise that resolves to the result of the operation.
   */
  emitInvoice?(context: ElectronicInvoiceContext, transactionData: any): Promise<ElectronicInvoiceResult>;

  // Future methods could be added here for other document types (credit notes, debit notes, etc.)
}

/**
 * Core interface for a country-specific health integration provider strategy (e.g., for RIPS).
 */
export interface IHealthIntegrationProvider {
  /**
   * Gets the unique identifier for the health integration provider (e.g., 'colombia-minsalud').
   */
  getProviderName(): string;

  buildRipsJson(data: any, context: any): string | Promise<string>;
  transmitSimultaneously(fevXml: string, ripsJson: string, context: any): Promise<HealthIntegrationResult>;

  /**
   * Generates the health data file (e.g., RIPS JSON).
   * @param context - The context required for the operation.
   * @param inputData - The data to be transformed into the required format.
   * @returns A promise that resolves to the generated data (e.g., a JSON string or object).
   */
  generateHealthData?(context: ElectronicInvoiceContext, inputData: RipsInputData): Promise<any>;

  /**
   * Submits the health data to the relevant authority.
   * @param context - The context required for the operation.
   * @param healthData - The generated health data to be submitted.
   * @returns A promise that resolves to the result of the submission.
   */
  submitHealthData?(context: ElectronicInvoiceContext, healthData: any): Promise<RipsSubmissionResult>;

  /**
   * Validates the health data against the required schema.
   * @param context - The context required for the operation.
   * @param healthData - The generated health data to be validated.
   * @returns A promise that resolves to the validation result (success or list of errors).
   */
  validateHealthData?(context: ElectronicInvoiceContext, healthData: any): Promise<{ success: boolean; errors?: string[] }>;
}

export interface HealthIntegrationResult {
  success?: boolean;
  status: 'validated' | 'rejected' | 'failed';
  cuv?: string;
  ripsJsonUrl?: string;
  errors?: string[];
  metadata?: Record<string, any>;
}
