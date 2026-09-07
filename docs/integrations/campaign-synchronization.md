# Campaign synchronization

Campaign synchronization is a tenant-scoped, bidirectional integration flow. A CRM submits a batch of campaign changes to Zinto; Zinto validates and applies each change using the campaign's stable `externalId`. Zinto then emits campaign-change webhooks so the CRM can converge its copy of the record.

## Inbound batches

Send a non-empty array of campaign records. Each record must include an `externalId` that is stable in the CRM. A batch contains **1 to 100** records, and every `externalId` must be unique within that request. Invalid batches are rejected before any campaign is processed, with either:

- `Campaign sync batch must contain between 1 and 100 campaigns`
- `Campaign sync batch contains duplicate external ID: <externalId>`

Use the same `externalId` on retries and updates. Do not treat Zinto's internal campaign ID as the CRM's synchronization key.

## Webhook expectations

Configure a webhook endpoint that can accept campaign-change events and return a successful response promptly. Treat delivery as at-least-once: deduplicate events using the event identifier (or a persisted combination of event type and campaign external ID), and make processing idempotent.

Verify the webhook signature against the exact raw request body before parsing JSON. The signature format is `v1=<hex-hmac>` and is an HMAC-SHA256 over `<timestamp>.<raw-body>` using the integration's webhook secret. Reject missing, malformed, or stale timestamps according to the receiving system's replay window.

On a transient failure, return a non-2xx response so delivery can be retried. Return 2xx only after the event has been accepted for durable processing; downstream retries must not create a second campaign.
