/**
 * Helpers to detect when an outbound campaign/notification sender email
 * (currently: the single, platform-wide Amazon SES "From" address) is not
 * connected to a monitored inbox for a given company — meaning replies sent
 * to that address will never be polled/imported and will be invisible in
 * the CRM's shared Inbox.
 *
 * Purely additive/advisory: nothing here blocks saving settings or sending
 * campaigns, it only computes a boolean/message used by callers to render a
 * non-blocking warning.
 */
import { storage } from '../storage';
import { isEmailAddressMonitored, type EmailMonitoringConnection } from '../../shared/channel-utils';

/**
 * Resolves the actual mailbox address for each of a company's email-type
 * channel connections, using the same source of truth the email channel
 * service itself uses (the `email_configs` table via
 * `storage.getEmailConfigByConnectionId`), falling back to whatever address
 * was captured on the connection itself when no dedicated email config row
 * exists yet.
 */
export async function resolveCompanyEmailConnections(companyId: number): Promise<EmailMonitoringConnection[]> {
  const connections = await storage.getChannelConnections(null, companyId);
  const emailConnections = connections.filter((conn) => conn.channelType === 'email');

  return Promise.all(
    emailConnections.map(async (conn): Promise<EmailMonitoringConnection> => {
      let emailAddress: string | null = null;

      try {
        const emailConfig = await storage.getEmailConfigByConnectionId(conn.id);
        if (emailConfig?.emailAddress) {
          emailAddress = emailConfig.emailAddress;
        }
      } catch (error) {
        console.error(`Error resolving email config for connection ${conn.id}:`, error);
      }

      if (!emailAddress) {
        const connectionData = conn.connectionData as Record<string, any> | null | undefined;
        emailAddress = connectionData?.emailAddress || conn.accountId || conn.accountName || null;
      }

      return {
        channelType: conn.channelType,
        status: conn.status,
        emailAddress
      };
    })
  );
}

/**
 * Checks whether `fromEmail` is connected as an actively-monitored inbox for
 * the given company.
 */
export async function isSesFromEmailMonitoredForCompany(companyId: number, fromEmail: string): Promise<boolean> {
  const connections = await resolveCompanyEmailConnections(companyId);
  return isEmailAddressMonitored(fromEmail, connections);
}

export const EMAIL_REPLY_WARNING_MESSAGE =
  'The configured sender email is not connected to a monitored inbox — customer replies to this campaign will not appear in your CRM.';

/**
 * Computes a non-blocking, human-readable warning for an email campaign
 * using Amazon SES, or `undefined` when there's nothing to warn about
 * (SES not configured, no fromEmail set, or the fromEmail is monitored).
 */
export async function getSesCampaignReplyWarning(
  companyId: number,
  sesFromEmail: string | null | undefined
): Promise<string | undefined> {
  if (!sesFromEmail) {
    return undefined;
  }

  try {
    const monitored = await isSesFromEmailMonitoredForCompany(companyId, sesFromEmail);
    return monitored ? undefined : EMAIL_REPLY_WARNING_MESSAGE;
  } catch (error) {
    console.error('Error computing SES reply-monitoring warning:', error);
    return undefined;
  }
}
