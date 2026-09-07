export type ApiKeyEnvironment = 'sandbox' | 'production';

export interface SandboxApiKeyConfiguration {
  environment: ApiKeyEnvironment;
  webhookUrl: string;
}

export class SandboxApiKeyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxApiKeyConfigurationError';
  }
}

export function validateSandboxApiKeyConfiguration(
  input: Record<string, unknown>,
): SandboxApiKeyConfiguration {
  const environment = validateEnvironment(input.environment);
  const webhookUrl = parseWebhookUrl(input.webhookUrl);

  if (environment === 'sandbox') {
    if (!isSandboxWebhookHost(webhookUrl.hostname)) {
      throw new SandboxApiKeyConfigurationError(
        'Sandbox webhook URL must target localhost or a .test or .example domain',
      );
    }
  } else {
    if (webhookUrl.protocol !== 'https:') {
      throw new SandboxApiKeyConfigurationError('Production webhook URL must use HTTPS');
    }
    if (isLocalhost(webhookUrl.hostname)) {
      throw new SandboxApiKeyConfigurationError('Production webhook URL must not target localhost');
    }
  }

  return { environment, webhookUrl: webhookUrl.toString() };
}

function validateEnvironment(value: unknown): ApiKeyEnvironment {
  if (value === 'sandbox' || value === 'production') return value;
  throw new SandboxApiKeyConfigurationError('environment must be either sandbox or production');
}

function parseWebhookUrl(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SandboxApiKeyConfigurationError('webhookUrl must be a non-empty URL');
  }

  try {
    return new URL(value);
  } catch {
    throw new SandboxApiKeyConfigurationError('webhookUrl must be a valid URL');
  }
}

function isSandboxWebhookHost(hostname: string): boolean {
  return isLocalhost(hostname) || hostname.endsWith('.test') || hostname.endsWith('.example');
}

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
