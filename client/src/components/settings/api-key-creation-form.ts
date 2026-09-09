export type ApiKeyEnvironment = 'sandbox' | 'production';

export interface ApiKeyCreationFormValues {
  name: string;
  environment: ApiKeyEnvironment;
  webhookUrl: string;
}

export function buildApiKeyCreationPayload({
  name,
  environment,
  webhookUrl,
}: ApiKeyCreationFormValues): ApiKeyCreationFormValues {
  return {
    name: name.trim(),
    environment,
    webhookUrl: webhookUrl.trim(),
  };
}
