"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { AlertTriangle, Info, TestTube, Check, Loader2, ChevronLeft, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { ValidationSummary, type ValidationSection } from "@/components/settings/ValidationSummary";
import { getTwimlAppVoiceUrl, isLocalhostOrigin } from "@/components/settings/voiceConnectionFormUtils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  accountName: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  apiKey: string;
  apiSecret: string;
  twimlAppSid: string;
  callMode: "basic" | "ai-powered";
  elevenLabsApiKey: string;
  elevenLabsAgentId: string;
  elevenLabsAgentPhoneNumberId: string;
  elevenLabsPostCallWebhookUrl: string;
  elevenLabsWebhookSecret: string;
  voiceId: string;
  audioFormat: "ulaw_8000" | "pcm_8000" | "pcm_16000";
  statusCallbackUrl: string;
}

const STEPS = [
  { id: 1, title: "Twilio Account" },
  { id: 2, title: "Voice SDK" },
  { id: 3, title: "Call Mode" },
  { id: 4, title: "ElevenLabs" },
  { id: 5, title: "Webhooks" },
  { id: 6, title: "Review & Save" }
];

export function TwilioVoiceSetupWizard({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const STEP_TITLES: Record<number, string> = {
    1: t('settings.twilio_voice.step_twilio_account', 'Twilio Account'),
    2: t('settings.twilio_voice.step_voice_sdk', 'Voice SDK'),
    3: t('settings.twilio_voice.step_call_mode', 'Call Mode'),
    4: t('settings.twilio_voice.step_elevenlabs', 'ElevenLabs'),
    5: t('settings.twilio_voice.step_webhooks', 'Webhooks'),
    6: t('settings.twilio_voice.step_review_save', 'Review & Save')
  };
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<any>(null);
  const [form, setForm] = useState<FormData>({
    accountName: "",
    accountSid: "",
    authToken: "",
    fromNumber: "",
    apiKey: "",
    apiSecret: "",
    twimlAppSid: "",
    callMode: "basic",
    elevenLabsApiKey: "",
    elevenLabsAgentId: "",
    elevenLabsAgentPhoneNumberId: "",
    elevenLabsPostCallWebhookUrl: `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/elevenlabs/post-call`,
    elevenLabsWebhookSecret: "",
    voiceId: "",
    audioFormat: "ulaw_8000",
    statusCallbackUrl: `${window.location.origin}/api/webhooks/twilio/voice-status`
  });

  const origin = window.location.origin;
  const twimlAppVoiceUrl = getTwimlAppVoiceUrl(origin);
  const isLocalhost = isLocalhostOrigin(origin);
  const voiceWebhookUrl = `${origin}/api/webhooks/twilio/voice`;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const runValidation = async () => {
    const res = await fetch("/api/channel-connections/validate-twilio-voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionData: {
          accountSid: form.accountSid,
          authToken: form.authToken,
          fromNumber: form.fromNumber,
          apiKey: form.apiKey,
          apiSecret: form.apiSecret,
          twimlAppSid: form.twimlAppSid,
          statusCallbackUrl: form.statusCallbackUrl,
          callMode: form.callMode,
          ...(form.callMode === "ai-powered" && {
            elevenLabsApiKey: form.elevenLabsApiKey,
            elevenLabsAgentId: form.elevenLabsAgentId,
            elevenLabsAgentPhoneNumberId: form.elevenLabsAgentPhoneNumberId,
            elevenLabsPostCallWebhookUrl: form.elevenLabsPostCallWebhookUrl,
            elevenLabsWebhookSecret: form.elevenLabsWebhookSecret,
            voiceId: form.voiceId,
            audioFormat: form.audioFormat
          })
        }
      }),
      credentials: "include"
    });
    return res.json();
  };

  const validationReportToSections = (report: any): ValidationSection[] => {
    if (!report) return [];
    const sections: ValidationSection[] = [];
    if (report.twilioRestApi) {
      sections.push({
        key: "twilioRestApi",
        label: t('settings.twilio_voice.section_twilio_account', 'Twilio account'),
        status: report.twilioRestApi.valid ? "valid" : "error",
        responseTime: report.twilioRestApi.responseTime,
        message: report.twilioRestApi.valid ? report.twilioRestApi.accountInfo?.friendlyName : report.twilioRestApi.error,
        recommendedActions: report.twilioRestApi.valid ? undefined : (report.recommendations || []).slice(0, 3)
      });
    }
    if (report.voiceSdk) {
      sections.push({
        key: "voiceSdk",
        label: t('settings.twilio_voice.step_voice_sdk', 'Voice SDK'),
        status: report.voiceSdk.valid ? "valid" : "error",
        responseTime: report.voiceSdk.responseTime,
        message: report.voiceSdk.error,
        recommendedActions: report.voiceSdk.valid ? undefined : (report.recommendations || []).slice(0, 3)
      });
    }
    if (report.twimlApp) {
      const ta = report.twimlApp;
      const mismatch =
        ta.voiceUrlConfigured === false ||
        ta.voiceUrlMatch === false;
      const twimlMessage = ta.valid
        ? [ta.appName, ta.warning].filter(Boolean).join(". ") || t('settings.twilio_voice.twiml_app_ok', 'TwiML App OK')
        : ta.error ||
          (mismatch && ta.expectedVoiceUrl
            ? t('settings.twilio_voice.voice_url_mismatch', 'Voice URL mismatch. Expected: {{expected}}, Got: {{actual}}', { expected: ta.expectedVoiceUrl, actual: ta.configuredVoiceUrl ?? ta.voiceUrl ?? "" })
            : ta.appName || t('settings.twilio_voice.twiml_app_validation_failed', 'TwiML App validation failed'));
      sections.push({
        key: "twimlApp",
        label: t('settings.twilio_voice.section_twiml_app', 'TwiML App'),
        status: ta.valid ? "valid" : "error",
        responseTime: ta.responseTime,
        message: twimlMessage,
        recommendedActions: ta.valid ? undefined : (report.recommendations || []).slice(0, 3)
      });
    }
    if (report.elevenLabs) {
      sections.push({
        key: "elevenLabs",
        label: t('settings.twilio_voice.step_elevenlabs', 'ElevenLabs'),
        status: report.elevenLabs.valid ? "valid" : "error",
        responseTime: report.elevenLabs.responseTime,
        message: report.elevenLabs.error,
        recommendedActions: report.elevenLabs.valid ? undefined : (report.recommendations || []).slice(0, 3)
      });
    }
    if (report.webhooks) {
      const accessible = report.webhooks.statusCallbackAccessible === true;
      sections.push({
        key: "webhooks",
        label: t('settings.twilio_voice.section_webhook_accessibility', 'Webhook accessibility'),
        status: accessible ? "valid" : "warning",
        message: accessible ? t('settings.twilio_voice.status_callback_reachable', 'Status callback URL reachable') : (report.webhooks.error || t('settings.twilio_voice.url_not_reachable', 'URL not reachable')),
        recommendedActions: accessible ? undefined : (report.recommendations || []).slice(0, 3)
      });
    }
    return sections;
  };

  const handleValidateStep1 = async () => {
    if (!form.accountSid || !form.authToken || !form.fromNumber) {
      toast({ title: t('settings.twilio_voice.fill_required_fields', 'Fill required fields'), description: t('settings.twilio_voice.required_fields_step1', 'Account SID, Auth Token, From Number'), variant: "destructive" });
      return;
    }
    setValidating(true);
    try {
      const report = await runValidation();
      setValidationReport(report);
      if (report?.twilioRestApi?.valid) {
        toast({ title: t('settings.twilio_voice.credentials_valid', 'Twilio credentials valid'), description: report.twilioRestApi.accountInfo?.friendlyName ? t('settings.twilio_voice.account_label', 'Account: {{name}}', { name: report.twilioRestApi.accountInfo.friendlyName }) : undefined });
      } else {
        toast({ title: t('settings.twilio_voice.validation_failed', 'Validation failed'), description: report?.twilioRestApi?.error, variant: "destructive" });
      }
    } finally {
      setValidating(false);
    }
  };

  const handleValidateStep2 = async () => {
    if (!form.apiKey || !form.apiSecret || !form.twimlAppSid) {
      toast({ title: t('settings.twilio_voice.fill_required_fields_step2', 'Fill API Key, API Secret, TwiML App SID'), variant: "destructive" });
      return;
    }
    setValidating(true);
    try {
      const report = await runValidation();
      setValidationReport(report);
      if (report?.voiceSdk?.valid && report?.twimlApp?.valid) {
        toast({ title: t('settings.twilio_voice.voice_sdk_valid', 'Voice SDK valid'), description: t('settings.twilio_voice.voice_sdk_valid_desc', 'Token generation and TwiML App OK') });
      } else {
        toast({ title: t('settings.twilio_voice.validation_failed', 'Validation failed'), description: report?.voiceSdk?.error || report?.twimlApp?.error, variant: "destructive" });
      }
    } finally {
      setValidating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('common.copied', 'Copied'), description: t('settings.twilio_voice.url_copied_desc', 'URL copied to clipboard') });
  };

  const stepRequiresValidation = (s: number) => s === 1 || s === 2 || (s === 4 && isStep4Visible) || s === 5;

  const stepValidationPassed = (report: any, s: number): boolean => {
    if (!report) return false;
    if (s === 1) return !!report.twilioRestApi?.valid;
    if (s === 2) return !!(report.voiceSdk?.valid && report.twimlApp?.valid);
    if (s === 4 && isStep4Visible) return !!report.elevenLabs?.valid;
    if (s === 5) return report.webhooks?.statusCallbackAccessible !== false;
    return true;
  };

  const handleNext = async () => {
    if (step === 3) {
      setStep(form.callMode === "ai-powered" ? 4 : 5);
      return;
    }
    if (stepRequiresValidation(step)) {
      if (!form.accountSid || !form.authToken || !form.fromNumber) {
        toast({ title: t('settings.twilio_voice.fill_required_fields', 'Fill required fields'), description: t('settings.twilio_voice.required_fields_step1', 'Account SID, Auth Token, From Number'), variant: "destructive" });
        return;
      }
      if (step === 2 && (!form.apiKey || !form.apiSecret || !form.twimlAppSid)) {
        toast({ title: t('settings.twilio_voice.fill_required_fields_step2', 'Fill API Key, API Secret, TwiML App SID'), variant: "destructive" });
        return;
      }
      if (step === 4 && isStep4Visible && !form.elevenLabsApiKey) {
        toast({ title: t('settings.twilio_voice.elevenlabs_key_required', 'ElevenLabs API Key required for AI-powered mode'), variant: "destructive" });
        return;
      }
      setValidating(true);
      try {
        const report = await runValidation();
        setValidationReport(report);
        if (!stepValidationPassed(report, step)) {
          toast({ title: t('settings.twilio_voice.validation_failed', 'Validation failed'), description: t('settings.twilio_voice.fix_issues_below', 'Fix the issues below before continuing.'), variant: "destructive" });
          setValidating(false);
          return;
        }
        if (step === 1) setStep(2);
        else if (step === 2) setStep(3);
        else if (step === 4) setStep(5);
        else if (step === 5) setStep(6);
      } finally {
        setValidating(false);
      }
      return;
    }
    if (step === 6) return;
    setStep((s) => s + 1);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const report = await runValidation();
      setValidationReport(report);
      if (!report?.success) {
        toast({ title: t('settings.twilio_voice.validation_failed', 'Validation failed'), description: t('settings.twilio_voice.fix_validation_errors', 'Fix validation errors before saving.'), variant: "destructive" });
        setLoading(false);
        return;
      }
      const res = await fetch("/api/channel-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelType: "twilio_voice",
          accountId: form.fromNumber,
          accountName: form.accountName,
          connectionData: {
            accountSid: form.accountSid,
            authToken: form.authToken,
            fromNumber: form.fromNumber,
            apiKey: form.apiKey,
            apiSecret: form.apiSecret,
            twimlAppSid: form.twimlAppSid,
            statusCallbackUrl: form.statusCallbackUrl,
            callMode: form.callMode,
            ...(form.callMode === "ai-powered" && {
              elevenLabsApiKey: form.elevenLabsApiKey,
              elevenLabsAgentId: form.elevenLabsAgentId,
              elevenLabsAgentPhoneNumberId: form.elevenLabsAgentPhoneNumberId,
              elevenLabsPostCallWebhookUrl: form.elevenLabsPostCallWebhookUrl,
              elevenLabsWebhookSecret: form.elevenLabsWebhookSecret,
              voiceId: form.voiceId,
              audioFormat: form.audioFormat
            })
          },
          status: "active"
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || t('settings.twilio_voice.create_connection_failed', 'Failed to create connection'));
      }
      toast({ title: t('settings.twilio_voice.setup_complete', 'Setup complete'), description: t('settings.twilio_voice.setup_complete_desc', 'Voice channel saved. Configure the selected provider webhooks as needed, then test a call.') });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: t('settings.twilio_voice.save_failed', 'Save failed'), description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const exportConfig = () => {
    const config = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      connectionType: "twilio_voice",
      configuration: {
        accountName: form.accountName,
        accountSid: form.accountSid ? form.accountSid.slice(0, 4) + "*".repeat(26) + form.accountSid.slice(-4) : "",
        authToken: "[REDACTED]",
        fromNumber: form.fromNumber,
        apiKey: form.apiKey ? form.apiKey.slice(0, 4) + "*".repeat(28) + form.apiKey.slice(-4) : "",
        apiSecret: "[REDACTED]",
        twimlAppSid: form.twimlAppSid ? form.twimlAppSid.slice(0, 4) + "*".repeat(28) + form.twimlAppSid.slice(-4) : "",
        callMode: form.callMode,
        elevenLabsApiKey: form.elevenLabsApiKey ? "[REDACTED]" : "",
        elevenLabsAgentId: form.elevenLabsAgentId,
        elevenLabsAgentPhoneNumberId: form.elevenLabsAgentPhoneNumberId,
        voiceId: form.voiceId,
        audioFormat: form.audioFormat
      }
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twilio-voice-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t('settings.twilio_voice.exported_title', 'Exported'), description: t('settings.twilio_voice.export_config_saved_desc', 'Configuration saved as JSON') });
  };

  const isStep4Visible = form.callMode === "ai-powered";
  const stepsVisible = STEPS.filter((s) => s.id !== 4 || isStep4Visible);
  const maxStepNum = stepsVisible.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('settings.twilio_voice.wizard_title', 'Voice Channel Setup Wizard')}</DialogTitle>
          <DialogDescription>
            {t('settings.twilio_voice.wizard_step_progress', 'Step {{current}} of {{total}}: {{title}}', { current: stepsVisible.findIndex((s) => s.id === step) + 1 || 1, total: maxStepNum, title: STEP_TITLES[step] })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {stepsVisible.map((s, idx) => {
            const active = step === s.id;
            return (
              <div
                key={s.id}
                className={`shrink-0 px-2 py-1 rounded text-xs font-medium ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {idx + 1}. {STEP_TITLES[s.id]}
              </div>
            );
          })}
        </div>

        {/* Step 1: Twilio Account Credentials */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{t('settings.twilio_sms.account_name', 'Account Name *')}</Label>
              <Input name="accountName" value={form.accountName} onChange={onChange} placeholder={t('settings.twilio_voice.account_name_placeholder', 'e.g. Main Voice Line')} />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.account_sid', 'Account SID *')}</Label>
              <Input name="accountSid" value={form.accountSid} onChange={onChange} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.auth_token', 'Auth Token *')}</Label>
              <Input name="authToken" type="password" value={form.authToken} onChange={onChange} placeholder={t('settings.twilio_sms.auth_token_placeholder', 'Your Twilio Auth Token')} />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_sms.from_number', 'From Number (E.164) *')}</Label>
              <Input name="fromNumber" value={form.fromNumber} onChange={onChange} placeholder="+15551234567" />
            </div>
            {validationReport?.twilioRestApi && (
              <Alert variant={validationReport.twilioRestApi.valid ? "default" : "destructive"}>
                <AlertDescription>
                  {validationReport.twilioRestApi.valid
                    ? t('settings.twilio_voice.account_check_valid', '✓ Account: {{name}}', { name: validationReport.twilioRestApi.accountInfo?.friendlyName || t('settings.twilio_voice.valid_label', 'Valid') })
                    : validationReport.twilioRestApi.error}
                </AlertDescription>
              </Alert>
            )}
            <Button type="button" variant="outline" onClick={handleValidateStep1} disabled={validating}>
              {validating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {t('settings.twilio_voice.validate_credentials', 'Validate credentials')}
            </Button>
          </div>
        )}

        {/* Step 2: Voice SDK */}
        {step === 2 && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                {t('settings.twilio_voice.create_api_key_twiml_app', 'Create API Key and TwiML App in Twilio Console → Account → API Keys and Voice → TwiML Apps.')}
              </AlertDescription>
            </Alert>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.api_key_sid', 'API Key (SID) *')}</Label>
              <Input name="apiKey" value={form.apiKey} onChange={onChange} placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.api_secret', 'API Secret *')}</Label>
              <Input name="apiSecret" type="password" value={form.apiSecret} onChange={onChange} placeholder={t('settings.twilio_voice.api_secret_shown_once', 'Shown once when creating API Key')} />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.twiml_app_sid', 'TwiML App SID *')}</Label>
              <Input name="twimlAppSid" value={form.twimlAppSid} onChange={onChange} placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.twilio_voice.twiml_app_voice_request_url', 'TwiML App Voice Request URL')}</Label>
              <div className="flex gap-2">
                <Input value={twimlAppVoiceUrl} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(twimlAppVoiceUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.twilio_voice.twiml_app_voice_request_url_help', 'Copy this URL and paste it as the Voice Request URL in your Twilio TwiML App (Twilio Console → Voice → TwiML Apps).')}
              </p>
            </div>
            {validationReport?.voiceSdk && (
              <Alert variant={validationReport.voiceSdk.valid && validationReport.twimlApp?.valid ? "default" : "destructive"}>
                <AlertDescription>
                  {validationReport.voiceSdk.valid ? t('settings.twilio_voice.token_generated', '✓ Token generated') : validationReport.voiceSdk.error}
                  {validationReport.twimlApp && (validationReport.twimlApp.valid ? t('settings.twilio_voice.twiml_app_status_ok', ' • TwiML App: {{name}}', { name: validationReport.twimlApp.appName || t('settings.twilio_voice.ok_label', 'OK') }) : t('settings.twilio_voice.twiml_app_status_error', ' • TwiML: {{error}}', { error: validationReport.twimlApp.error }))}
                </AlertDescription>
              </Alert>
            )}
            <Button type="button" variant="outline" onClick={handleValidateStep2} disabled={validating}>
              {validating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {t('settings.twilio_voice.validate_voice_sdk', 'Validate Voice SDK')}
            </Button>
          </div>
        )}

        {/* Step 3: Call Mode */}
        {step === 3 && (
          <div className="space-y-4">
            <Label>{t('settings.twilio_voice.call_mode', 'Call Mode *')}</Label>
            <div className="flex gap-4">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="callMode"
                  value="basic"
                  checked={form.callMode === "basic"}
                  onChange={(e) => setForm((prev) => ({ ...prev, callMode: e.target.value as "basic" | "ai-powered" }))}
                />
                <span>{t('settings.twilio_voice.basic_calls', 'Basic Calls')}</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="callMode"
                  value="ai-powered"
                  checked={form.callMode === "ai-powered"}
                  onChange={(e) => setForm((prev) => ({ ...prev, callMode: e.target.value as "basic" | "ai-powered" }))}
                />
                <span>{t('settings.twilio_voice.ai_powered_calls', 'AI-Powered Calls')}</span>
              </label>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="font-medium">{t('settings.twilio_voice.feature_column', 'Feature')}</th>
                    <th className="font-medium">{t('settings.twilio_voice.basic_column', 'Basic')}</th>
                    <th className="font-medium">{t('settings.twilio_voice.ai_powered_column', 'AI-Powered')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>{t('settings.twilio_voice.feature_webrtc_direct', 'WebRTC / Direct')}</td><td>✓</td><td>✓</td></tr>
                  <tr><td>{t('settings.twilio_voice.feature_elevenlabs_voice', 'ElevenLabs AI voice')}</td><td>—</td><td>✓</td></tr>
                  <tr><td>{t('settings.twilio_voice.feature_conversational_ai', 'Conversational AI')}</td><td>—</td><td>✓</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 4: ElevenLabs (conditional) */}
        {step === 4 && isStep4Visible && (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.elevenlabs_api_key', 'ElevenLabs API Key *')}</Label>
              <Input name="elevenLabsApiKey" type="password" value={form.elevenLabsApiKey} onChange={onChange} placeholder={t('settings.twilio_voice.elevenlabs_api_key_placeholder2', 'Your ElevenLabs API Key')} />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.elevenlabs_agent_id', 'ElevenLabs Agent ID (Optional)')}</Label>
              <Input name="elevenLabsAgentId" value={form.elevenLabsAgentId} onChange={onChange} placeholder={t('settings.twilio_voice.preconfigured_agent_id', 'Pre-configured agent ID')} />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.elevenlabs_agent_phone_number_id', 'ElevenLabs Agent Phone Number ID *')}</Label>
              <Input name="elevenLabsAgentPhoneNumberId" value={form.elevenLabsAgentPhoneNumberId} onChange={onChange} placeholder={t('settings.twilio_voice.from_elevenlabs_phone_numbers', 'From ElevenLabs → Phone Numbers')} />
              <p className="text-xs text-muted-foreground">{t('settings.twilio_voice.agent_phone_number_help', 'Required for "Use AI Agent" outbound calls. Get from ElevenLabs → Phone Numbers → your Twilio number.')}</p>
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.post_call_webhook_url', 'Post-call webhook URL')}</Label>
              <Input name="elevenLabsPostCallWebhookUrl" value={form.elevenLabsPostCallWebhookUrl} onChange={onChange} placeholder={`${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/elevenlabs/post-call`} />
              <p className="text-xs text-muted-foreground">{t('settings.twilio_voice.post_call_webhook_help', 'Copy into ElevenLabs → Agents → Settings → Post-call webhooks.')}</p>
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.webhook_secret', 'Webhook secret')}</Label>
              <Input name="elevenLabsWebhookSecret" type="password" value={form.elevenLabsWebhookSecret} onChange={onChange} placeholder={t('settings.twilio_voice.webhook_secret_placeholder', 'Secret from ElevenLabs webhook settings')} />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.voice_id', 'Voice ID (Optional)')}</Label>
              <Input name="voiceId" value={form.voiceId} onChange={onChange} placeholder={t('settings.twilio_voice.voice_id_placeholder', 'ElevenLabs voice identifier')} />
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_voice.audio_format', 'Audio Format')}</Label>
              <select
                value={form.audioFormat}
                onChange={(e) => setForm((prev) => ({ ...prev, audioFormat: e.target.value as FormData["audioFormat"] }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="ulaw_8000">{t('settings.twilio_voice.audio_format_ulaw', 'μ-law 8000 Hz Telephony (Recommended for Twilio)')}</option>
                <option value="pcm_8000">{t('settings.twilio_voice.audio_format_pcm8', 'PCM 8kHz')}</option>
                <option value="pcm_16000">{t('settings.twilio_voice.audio_format_pcm16', 'PCM 16kHz')}</option>
              </select>
              <p className="text-xs text-muted-foreground">{t('settings.twilio_voice.audio_format_help', 'In ElevenLabs, set "User input audio format" to')} <strong>{t('settings.twilio_voice.ulaw_telephony_label', 'μ-law 8000 Hz Telephony')}</strong> {t('settings.twilio_voice.for_twilio', 'for Twilio.')}</p>
            </div>
            {validationReport?.elevenLabs && (
              <Alert variant={validationReport.elevenLabs.valid ? "default" : "destructive"}>
                <AlertDescription>
                  {validationReport.elevenLabs.valid
                    ? t('settings.twilio_voice.elevenlabs_configured', '✓ ElevenLabs configured')
                    : validationReport.elevenLabs.error}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Step 5: Webhooks */}
        {step === 5 && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>{t('settings.twilio_voice.set_urls_notice', 'Set these URLs in Twilio Console for your phone number and TwiML App.')}</AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>{t('settings.twilio_voice.twiml_app_voice_request_url', 'TwiML App Voice Request URL')}</Label>
              <div className="flex gap-2">
                <Input value={twimlAppVoiceUrl} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(twimlAppVoiceUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.twilio_voice.twiml_app_voice_request_url_help', 'Copy this URL and paste it as the Voice Request URL in your Twilio TwiML App (Twilio Console → Voice → TwiML Apps).')}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>{t('settings.twilio_sms.status_callback_url', 'Status Callback URL')}</Label>
              <div className="flex gap-2">
                <Input readOnly value={form.statusCallbackUrl} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(form.statusCallbackUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('settings.twilio_voice.voice_webhook_url', 'Voice webhook URL')}</Label>
              <div className="flex gap-2">
                <Input readOnly value={voiceWebhookUrl} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(voiceWebhookUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('settings.twilio_voice.voice_webhook_url_help', 'Set this URL as the voice webhook for your Twilio phone number where applicable.')}</p>
            </div>
            {isLocalhost && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('settings.twilio_voice.localhost_warning', 'You are running on localhost. Twilio cannot reach localhost URLs. Use a tunneling tool like ngrok or deploy to a public domain.')}
                </AlertDescription>
              </Alert>
            )}
            {validationReport?.webhooks && (
              <Alert variant={validationReport.webhooks.statusCallbackAccessible ? "default" : "destructive"}>
                <AlertDescription>
                  {validationReport.webhooks.statusCallbackAccessible
                    ? t('settings.twilio_voice.status_callback_reachable_check', '✓ Status callback URL reachable')
                    : (validationReport.webhooks.error || t('settings.twilio_voice.status_callback_not_reachable', 'Status callback URL not reachable'))}
                </AlertDescription>
              </Alert>
            )}
            <Button type="button" variant="outline" size="sm" asChild>
              <a href="https://www.twilio.com/docs/voice" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> {t('settings.twilio_voice.twilio_console_configuration', 'Twilio Console configuration')}
              </a>
            </Button>
          </div>
        )}

        {/* Step 6: Review & Save */}
        {step === 6 && (
          <div className="space-y-4">
            {validationReport && (
              <ValidationSummary
                sections={validationReportToSections(validationReport)}
                onCopyDiagnostics={() =>
                  JSON.stringify(validationReport, null, 2)
                }
              />
            )}
            <div className="rounded-md border p-3 text-sm space-y-1">
              <p><strong>{t('settings.twilio_voice.account_field_label', 'Account:')}</strong> {form.accountName} ({form.fromNumber})</p>
              <p><strong>{t('settings.twilio_voice.call_mode_field_label', 'Call mode:')}</strong> {form.callMode}</p>
              {form.callMode === "ai-powered" && <p><strong>{t('settings.twilio_voice.elevenlabs_field_label', 'ElevenLabs:')}</strong> {form.elevenLabsAgentId || t('settings.twilio_voice.custom_prompt', 'Custom prompt')}</p>}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={exportConfig}>
                {t('settings.twilio_voice.export_config_as_json', 'Export config as JSON')}
              </Button>
              <Button type="button" variant="outline" onClick={() => toast({ title: t('settings.twilio_voice.test_call_title', 'Test Call'), description: t('settings.twilio_voice.test_call_desc', 'Use the call feature from a conversation to place a test call.') })}>
                <TestTube className="h-4 w-4 mr-2" /> {t('settings.twilio_voice.test_call_title', 'Test Call')}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between mt-4">
          <div className="flex gap-2">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((s) => (s === 5 && form.callMode === "basic" ? 3 : s === 5 && form.callMode === "ai-powered" ? 4 : s - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> {t('settings.twilio_voice.back_button', 'Back')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < 6 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={validating}
              >
                {validating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {t('settings.twilio_voice.next_button', 'Next')} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSave} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t('settings.twilio_voice.save_configuration', 'Save configuration')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
