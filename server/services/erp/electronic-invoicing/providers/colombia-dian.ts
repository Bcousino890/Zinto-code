import crypto from 'crypto';
import { IElectronicInvoiceProvider, ElectronicInvoiceResult } from '../types';
import { ElectronicInvoicingRegistry } from '../service';

export class ColombiaDianProvider implements IElectronicInvoiceProvider {
  getProviderName(): string {
    return 'colombia-dian';
  }

  /**
   * Generates a compliant UBL 2.1 XML structure for DIAN e-Invoicing
   */
  generateXml(invoice: any, items: any[], ctx: any): string {
    const numFac = invoice.invoiceNumber;
    const issueDate = new Date(invoice.issueDate || invoice.createdAt || new Date());
    const fecFac = issueDate.toISOString().split('T')[0];
    const horFac = issueDate.toTimeString().split(' ')[0] + '-05:00';
    const valFac = parseFloat(invoice.subtotal || '0').toFixed(2);
    
    const nitOfe = ctx.supplierNit || '900123456';
    const numAdq = ctx.customerNit || '1015332211';
    const tipoAmb = ctx.environment === 'production' ? '1' : '2';
    const cufe = this.calculateIdentifier(invoice, items, ctx);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <DianExtensions>
          <SoftwareProvider>
            <ProviderID>${ctx.softwareId || 'dian-soft-uuid-here'}</ProviderID>
            <SecurityCode>${ctx.apiKey || 'pst_token_abc_123'}</SecurityCode>
          </SoftwareProvider>
        </DianExtensions>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:ID>${numFac}</cbc:ID>
  <cbc:UUID schemeID="${tipoAmb === '1' ? 'CUFE-SHA384' : 'CUFE-SHA384'}">${cufe}</cbc:UUID>
  <cbc:IssueDate>${fecFac}</cbc:IssueDate>
  <cbc:IssueTime>${horFac}</cbc:IssueTime>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${nitOfe}</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${numAdq}</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${invoice.currency || 'COP'}">${valFac}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${invoice.currency || 'COP'}">${valFac}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${invoice.currency || 'COP'}">${invoice.totalAmount}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${invoice.currency || 'COP'}">${invoice.totalAmount}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

    // Add XML line items
    items.forEach((item, index) => {
      const lineNum = index + 1;
      const desc = item.description || 'Service/Item';
      const qty = parseFloat(item.quantity || '1').toFixed(2);
      const price = parseFloat(item.unitPrice || '0').toFixed(2);
      const total = parseFloat(item.lineTotal || '0').toFixed(2);

      xml += `
  <cac:InvoiceLine>
    <cbc:ID>${lineNum}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="94">${qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${invoice.currency || 'COP'}">${total}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>${desc}</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${invoice.currency || 'COP'}">${price}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    });

    xml += `
</Invoice>`;

    return xml;
  }

  /**
   * Calculates SHA-384 based CUFE (Clave Única de Facturación Electrónica)
   */
  calculateIdentifier(invoice: any, items: any[], ctx: any): string {
    const numFac = invoice.invoiceNumber;
    const issueDate = new Date(invoice.issueDate || invoice.createdAt || new Date());
    const fecFac = issueDate.toISOString().split('T')[0];
    const horFac = issueDate.toTimeString().split(' ')[0] + '-05:00';
    const valFac = parseFloat(invoice.subtotal || '0').toFixed(2);
    
    const codImp1 = '01'; // IVA
    const valImp1 = parseFloat(invoice.taxAmount || '0').toFixed(2);
    const codImp2 = '02'; // Default/placeholder
    const valImp2 = '0.00';
    const codImp3 = '03'; // Default/placeholder
    const valImp3 = '0.00';
    const valImpTot = parseFloat(invoice.taxAmount || '0').toFixed(2);

    const nitOfe = ctx.supplierNit || '900123456';
    const numAdq = ctx.customerNit || '1015332211';
    const clvTec = ctx.technicalKey || 'clv_technical_key_here';
    const tipoAmb = ctx.environment === 'production' ? '1' : '2';

    const concatStr = `${numFac}${fecFac}${horFac}${valFac}${codImp1}${valImp1}${codImp2}${valImp2}${codImp3}${valImp3}${valImpTot}${nitOfe}${numAdq}${clvTec}${tipoAmb}`;
    
    return crypto.createHash('sha384').update(concatStr).digest('hex').toLowerCase();
  }

  /**
   * Simulates/appends XMLDSIG digital signatures
   */
  signXml(unsignedXml: string, ctx: any): string {
    const signatureBlock = `
  <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="Signature-1">
    <ds:SignedInfo>
      <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha384"/>
      <ds:Reference URI="">
        <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha384"/>
        <ds:DigestValue>signed-digest-placeholder</ds:DigestValue>
      </ds:Reference>
    </ds:SignedInfo>
    <ds:SignatureValue>digital-signature-hash-using-cert</ds:SignatureValue>
  </ds:Signature>`;
    
    return unsignedXml.replace('</ext:UBLExtensions>', `${signatureBlock}\n  </ext:UBLExtensions>`);
  }

  /**
   * Stub transmission to DIAN (or representative PST API client)
   */
  async transmit(signedXml: string, ctx: any): Promise<ElectronicInvoiceResult> {
    const success = !ctx.forceFailure;
    if (success) {
      return {
        success: true,
        status: 'validated',
        xmlUrl: `https://certified-invoices.dian.gov.co/xml/${Date.now()}.xml`,
        qrCodeText: `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${ctx.cufe}`,
        metadata: {
          pstTransactionId: `pst-${Math.random().toString(36).substr(2, 9)}`,
          dianReceivedAt: new Date().toISOString(),
          responseCode: '200',
          message: 'Document validated and pre-cleared successfully by DIAN.'
        }
      };
    } else {
      return {
        success: false,
        status: 'rejected',
        errors: ['NIT validation failed', 'Digital certificate mismatch'],
        metadata: {
          responseCode: '400',
          message: 'UBL document rejection by DIAN.'
        }
      };
    }
  }
}

// Automatically register the provider
ElectronicInvoicingRegistry.registerInvoiceProvider('CO', new ColombiaDianProvider());
