import { IHealthIntegrationProvider, HealthIntegrationResult } from '../types';
import { ElectronicInvoicingRegistry } from '../service';
import { storage } from '../../../../storage';
import { Invoice, InvoiceItem, DentalTreatmentProcedure } from '@shared/schema';

// RIPS JSON Structure based on Resolution 2275/2023 (Simplified for initial implementation)
interface RipsJson {
  numFactura: string;
  tipoDocumentoPrestador: string;
  numDocumentoPrestador: string;
  fechaExpedicionFactura: string;
  codPrestador: string;
  modalidadPago: string;
  fuenteFinanciacion1: string;
  coberturaSalud: string;
  usuarios: RipsUsuario[];
  servicios: RipsServicios;
}

interface RipsUsuario {
  tipoIdentificacionUsuario: string;
  numIdentificacionUsuario: string;
  primerNombre: string;
  primerApellido: string;
  tipoUsuario: string;
  fechaNacimiento: string;
  sexoBiologico: string;
  paisResidencia: string;
  departamentoResidencia: string;
  ciudadResidencia: string;
  zonaResidencia: string;
}

interface RipsServicios {
  consultas: RipsConsulta[];
  procedimientos: RipsProcedimiento[];
  medicamentos: any[]; // To be defined
  otrosServicios: any[]; // To be defined
}

interface RipsConsulta {
  codPrestador: string;
  fechaInicioAtencion: string;
  numAutorizacion: string | null;
  codConsulta: string;
  modalidadGrupoServicio: string;
  grupoServicios: string;
  finalidadTecnologiaSalud: string;
  causaMotivoAtencion: string;
  codDiagnosticoPrincipal: string;
  codDiagnosticoRelacionado1: string | null;
  codDiagnosticoRelacionado2: string | null;
  codDiagnosticoRelacionado3: string | null;
  tipoDiagnosticoPrincipal: string;
  valorPagoModerador: number;
  valorConcepto: number;
}

interface RipsProcedimiento {
  codPrestador: string;
  fechaInicioAtencion: string;
  idMipres: string | null;
  numAutorizacion: string | null;
  codProcedimiento: string;
  viaIngresoServicio: string;
  modalidadGrupoServicio: string;
  grupoServicios: string;
  finalidadTecnologiaSalud: string;
  tipoDocumentoIdentificacion: string;
  numDocumentoIdentificacion: string;
  codDiagnosticoPrincipal: string;
  codDiagnosticoRelacionado1: string | null;
  tipoDiagnosticoPrincipal: string;
  valorPagoModerador: number;
  valorConcepto: number;
}

export class ColombiaMinSaludProvider implements IHealthIntegrationProvider {
  getProviderName(): string {
    return 'colombia-minsalud';
  }

  buildRipsJson(data: any, ctx: any): string | Promise<string> {
    // Keep payload construction usable for isolated callers that already loaded clinical data.
    if (data.patientProfile && data.patientContact && Array.isArray(data.procedures)) {
      const patient = data.patientProfile;
      const contact = data.patientContact;
      const procedures = data.procedures.map((procedure: any) => ({
        codPrestador: ctx.codPrestador || '1234567890',
        fechaInicioAtencion: new Date().toISOString().split('T')[0],
        idMipres: null,
        numAutorizacion: null,
        codProcedimiento: procedure.product?.customFields?.cups || procedure.procedureCode || '999999',
        viaIngresoServicio: '01',
        modalidadGrupoServicio: '01',
        grupoServicios: '01',
        finalidadTecnologiaSalud: '01',
        tipoDocumentoIdentificacion: contact.identificationType || 'CC',
        numDocumentoIdentificacion: contact.identificationNumber || '',
        codDiagnosticoPrincipal: String(procedure.notes || 'K021').match(/[A-Z]\d{3}/)?.[0] || 'K021',
        codDiagnosticoRelacionado1: null,
        tipoDiagnosticoPrincipal: '01',
        valorPagoModerador: 0,
        valorConcepto: Number(procedure.estimatedAmount || procedure.unitPrice || 0),
      }));
      return JSON.stringify({
        numFactura: data.invoice.invoiceNumber,
        tipoDocumentoPrestador: ctx.tipoDocumentoPrestador || 'NI',
        numDocumentoPrestador: ctx.numDocumentoPrestador || '900000000',
        fechaExpedicionFactura: new Date(data.invoice.issueDate || new Date()).toISOString().split('T')[0],
        codPrestador: ctx.codPrestador || '1234567890',
        modalidadPago: '01', fuenteFinanciacion1: '1', coberturaSalud: '01',
        usuarios: [{
          tipoIdentificacionUsuario: contact.identificationType || 'CC',
          numIdentificacionUsuario: contact.identificationNumber || '',
          primerNombre: this.extractFirstName(contact.name || ''),
          primerApellido: this.extractLastName(contact.name || ''),
          tipoUsuario: '01',
          fechaNacimiento: String(patient.dateOfBirth || '1900-01-01').split('T')[0],
          sexoBiologico: this.mapSex(patient.sex), paisResidencia: '170', departamentoResidencia: '11', ciudadResidencia: '11001', zonaResidencia: '01',
        }],
        servicios: { consultas: [], procedimientos: procedures, medicamentos: [], otrosServicios: [] },
      });
    }
    return (async () => {
    const { invoice, companyId } = data;

    if (!invoice.contactId) {
      throw new Error('Invoice must have a contact associated for RIPS generation.');
    }

    // 1. Fetch patient and contact data
    const contact = await storage.getContact(invoice.contactId);
    if (!contact) {
      throw new Error(`Contact with ID ${invoice.contactId} not found.`);
    }

    const dentalPatient = await storage.getDentalPatientByContactId(companyId, invoice.contactId);
    if (!dentalPatient) {
      // For now, we'll require a dental patient profile.
      // In the future, we might need to handle non-dental patients if RIPS applies to them too.
      throw new Error(`Dental patient profile not found for contact ID ${invoice.contactId}.`);
    }

    // 2. Fetch company data for provider details
    const company = await storage.getCompany(companyId);
    if (!company) {
      throw new Error(`Company with ID ${companyId} not found.`);
    }
    // In a real scenario, these would come from company settings or a dedicated provider profile
    // For now, using hardcoded defaults or assumptions
    const tipoDocumentoPrestador = 'NI'; // NIT
    // Assuming company.businessId is the NIT. Need to verify this mapping.
    const numDocumentoPrestador = (company as any).businessId || (company as any).taxId || '900000000';
    const codPrestador = '1234567890'; // Assumed provider code. Must be configurable.

    // 3. Build the Usuario object
    const usuario: RipsUsuario = {
      tipoIdentificacionUsuario: this.mapDocumentType(contact.identifierType),
      numIdentificacionUsuario: contact.identifier || '',
      primerNombre: this.extractFirstName(contact.name),
      primerApellido: this.extractLastName(contact.name),
      // Assuming '01' (Contributivo) for now. Should be a field in DentalPatientProfile or Contact.
      tipoUsuario: '01',
       fechaNacimiento: dentalPatient.dateOfBirth ? String(dentalPatient.dateOfBirth).split('T')[0] : '1900-01-01',
      sexoBiologico: this.mapSex(dentalPatient.sex),
      paisResidencia: '170', // Colombia
      departamentoResidencia: '11', // Bogotá (example)
      ciudadResidencia: '11001', // Bogotá (example)
      zonaResidencia: '01', // Urbana (example)
    };

    // 4. Build RIPS Structure
    const consultas: RipsConsulta[] = [];
    const procedimientos: RipsProcedimiento[] = [];

    if (invoice.salesOrderId) {
      // Find the dental treatment plan associated with the sales order
      // We need to find the plan ID first. We can do this by listing plans for the contact and filtering by salesOrderId.
      const { data: plans } = await storage.listDentalTreatmentPlans(companyId, { contactId: invoice.contactId });
      const treatmentPlan = plans.find(plan => plan.salesOrderId === invoice.salesOrderId);

      if (treatmentPlan) {
        const fullPlan = await storage.getDentalTreatmentPlan(companyId, treatmentPlan.id);
        if (fullPlan && fullPlan.procedures) {
          for (const procedure of fullPlan.procedures) {
            // Basic mapping for now. Needs to be expanded based on procedure data.
            // We assume for now that dental procedures map to RIPS 'procedimientos'.
            // If they are consultations, they should map to 'consultas'. This distinction needs to be made based on procedure type/code.

            // This is a placeholder mapping. Real mapping requires more data from DentalTreatmentProcedure
            const ripsProcedimiento: RipsProcedimiento = {
              codPrestador,
               fechaInicioAtencion: procedure.createdAt ? new Date(procedure.createdAt).toISOString().split('T')[0] : new Date(invoice.issueDate || new Date()).toISOString().split('T')[0],
              idMipres: null, // Not available in DentalTreatmentProcedure
              numAutorizacion: null, // Not available in DentalTreatmentProcedure
               codProcedimiento: (procedure as any).procedureCode || (procedure as any).code || '999999', // Using mapped procedure code or a default
              viaIngresoServicio: '01', // Demanda espontánea (example)
              modalidadGrupoServicio: '01', // Intramural (example)
              grupoServicios: '01', // Consulta externa (example)
              finalidadTecnologiaSalud: '01', // Diagnóstico (example)
              tipoDocumentoIdentificacion: usuario.tipoIdentificacionUsuario,
              numDocumentoIdentificacion: usuario.numIdentificacionUsuario,
              codDiagnosticoPrincipal: 'K021', // Caries de dentina (example) - Need to fetch from procedure or diagnosis
              codDiagnosticoRelacionado1: null,
              tipoDiagnosticoPrincipal: '01', // Impresión diagnóstica (example)
              valorPagoModerador: 0, // Need to determine
              valorConcepto: Number(procedure.unitPrice) || 0,
            };
            procedimientos.push(ripsProcedimiento);
          }
        }
      }
    }

    const ripsJson: RipsJson = {
      numFactura: invoice.invoiceNumber,
      tipoDocumentoPrestador,
      numDocumentoPrestador,
       fechaExpedicionFactura: new Date(invoice.issueDate || new Date()).toISOString().split('T')[0],
      codPrestador,
      modalidadPago: '01', // 01: Pago por evento (default for now)
      fuenteFinanciacion1: '1', // 1: Recursos propios (default for now)
      coberturaSalud: '01', // 01: Plan de beneficios en salud (default for now)
      usuarios: [usuario],
      servicios: {
        consultas,
        procedimientos,
        medicamentos: [],
        otrosServicios: [],
      },
    };

    return JSON.stringify(ripsJson);
    })();
  }

  async transmitSimultaneously(fevXml: string, ripsJson: string, ctx: any): Promise<HealthIntegrationResult> {
    const { companyId } = ctx;
    const healthCredentials = await storage.getCompanySetting(companyId, 'health_integration.credentials');
    const credentials = healthCredentials?.value || {};

    // Simulate MUV response
    // In a real implementation, this would be an HTTP request to the MUV API.

    const isSuccess = !ctx.forceFailure;

    if (isSuccess) {
      return {
        status: 'validated',
        cuv: 'CUV-' + Math.random().toString(36).substring(2, 15).toUpperCase(), // Simulated CUV
        // In a real app, this would be a URL to the stored JSON file
        ripsJsonUrl: 'https://api.minsalud.gov.co/v1/electronic-invoicing/rips/' + Math.random().toString(36).substring(2, 15) + '.json',
        errors: [],
        metadata: {
          muvResponse: {
            statusCode: 200,
            message: 'Documentos validados exitosamente',
            fechaRadicacion: new Date().toISOString(),
          },
        },
      };
    } else {
      if (ctx.failureType === 'technical') {
        return { status: 'failed', errors: ['Gateway timeout', 'MUV system offline'], metadata: { responseCode: '504' } };
      }
      // Simulate semantic validation failure.
      // A real implementation would parse the error response from MUV
      return {
        status: 'rejected',
        errors: [
          'Invalid CUPS code',
          'Missing patient date of birth',
        ],
        metadata: {
          responseCode: '400',
          muvResponse: {
            statusCode: 400,
            message: 'Error de validación',
            listaErrores: [
              { codigo: 'RIPS-001', mensaje: 'Invalid CUPS code' },
              { codigo: 'FEV-002', mensaje: 'Missing patient date of birth' },
            ],
          },
        },
      };
    }
  }

  // Helper methods for mapping data (to be implemented with real mappings)
  private mapDocumentType(type: string | null): string {
    // TODO: Implement actual mapping based on system's document types and Resolution 2275
    switch (type) {
      case 'cc': return 'CC'; // Cédula de Ciudadanía
      case 'ce': return 'CE'; // Cédula de Extranjería
      case 'pa': return 'PA'; // Pasaporte
      case 'ti': return 'TI'; // Tarjeta de Identidad
      case 'rc': return 'RC'; // Registro Civil
      default: return 'CC'; // Default to CC if unknown
    }
  }

  private mapSex(sex: string | null): string {
    // TODO: Implement actual mapping
    switch (String(sex || '').toLowerCase()) {
      case 'male':
      case 'm': return 'M';
      case 'female':
      case 'f': return 'F';
      default: return 'I'; // Indeterminado
    }
  }

  private extractFirstName(name: string): string {
    // Simple extraction, might need to be more robust
    return name.split(' ')[0] || '';
  }

  private extractLastName(name: string): string {
    // Simple extraction, might need to be more robust
    const parts = name.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }
}

// Automatically register the provider
ElectronicInvoicingRegistry.registerHealthProvider('CO', new ColombiaMinSaludProvider());
