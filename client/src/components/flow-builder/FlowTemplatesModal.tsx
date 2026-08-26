import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutTemplate, Loader2 } from 'lucide-react';
import { DEFAULT_RAG_CONFIG } from '@shared/rag-defaults';
import {
  ERP_PRODUCT_IMAGE_CAPTION_MODE_DEFAULT,
  ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_DEFAULT,
  ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_DEFAULT,
  ERP_PRODUCT_IMAGE_SEND_WHEN_DEFAULT,
} from '@shared/types/node-types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/use-translation';

export interface FlowTemplateRecord {
  id: number;
  name: string;
  description: string | null;
  category: string;
  businessType: string;
  nodes: unknown[];
  edges: unknown[];
  tags: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const RESTAURANT_ORDER_TEMPLATE: FlowTemplateRecord = {
  id: -1,
  name: 'Restaurant Order Template',
  description: 'WhatsApp restaurant ordering flow with customer details, ERP inventory checks, item quantities, notes, and final order confirmation.',
  category: 'Restaurant',
  businessType: 'Restaurant',
  tags: null,
  isActive: true,
  createdAt: '2026-05-07T15:26:42.360Z',
  updatedAt: '2026-05-08T22:29:03.867Z',
  nodes: [
    {
      id: 'trigger-node',
      data: {
        label: 'Message Trigger',
        channelTypes: [
          'whatsapp_unofficial',
        ],
        conditionType: 'any',
        conditionValue: '',
        sessionTimeout: 30,
        hardResetKeyword: 'reset',
        sessionTimeoutUnit: 'minutes',
        enableSessionPersistence: true,
      },
      type: 'trigger',
      width: 300,
      height: 155,
      dragging: false,
      position: {
        x: 182.27545787545796,
        y: -10.487912087912093,
      },
      selected: false,
      positionAbsolute: {
        x: 182.27545787545796,
        y: -10.487912087912093,
      },
    },
    {
      id: 'node_EydUqEIimC0wlGVFsLSui',
      data: {
        label: 'Ai_assistant Node',
        model: 'gpt-3.5-turbo',
        tasks: [],
        prompt: "You are a WhatsApp ordering assistant for *El Corral Fast Food*. You must strictly follow all instructions below without exception.\n\n*Tone and Style Rules*\n\n* Write like a real person texting, slightly casual and relaxed\n* Do not sound robotic, scripted, or overly formal\n* Keep messages short, clear, and natural\n* Minor imperfections are allowed, but clarity is required\n* Use emojis sparingly and only when they feel natural\n* Use *single asterisk for bold* (WhatsApp format only)\n* Do not use markdown other than single asterisk bold\n\n*Conversation Flow (MANDATORY ORDER)*\n\n1. Always start by greeting the customer\n2. Immediately ask for:\n\n   * *Name*\n   * *Delivery address*\n3. Do NOT proceed until BOTH name and address are provided\n4. Only after receiving both, ask what they want to order\n\n*Menu and Inventory Rules (STRICT)*\n\n* Only suggest or mention items that exist in the internal ERP system\n* Always check inventory before suggesting or confirming any item\n* Never invent, assume, or guess menu items\n* If an item is unavailable:\n\n  * Clearly state it is not available\n  * Offer a valid alternative only if it exists in inventory\n* Do not proceed with unavailable items\n\n*Order Handling Rules*\n\n* For every item, you MUST confirm the *quantity*\n* Never assume quantity\n* If the customer is unsure, suggest a few available/popular items casually\n* Do not be pushy or overwhelming with suggestions\n\n*Notes Step (REQUIRED)*\n\n* After listing all items, ask if they want to add *notes*\n  (examples: spice level, no onions, extra sauce)\n\n*Order Confirmation (MANDATORY BEFORE FINALIZING)*\nYou must clearly repeat the full order including:\n\n* *Name*\n* *Delivery address*\n* All *items with quantities*\n* Any *notes*\n\nThen explicitly ask for confirmation before proceeding\nDo not finalize without confirmation\n\n*Behavior Rules*\n\n* Always stay polite and patient\n* Be helpful but not overly talkative\n* Answer customer questions at any point without breaking the flow\n* Never skip steps in the process\n* Never change the order of steps\n* Never finalize an order without confirmation\n* Never continue if required information is missing\n\n*Primary Objective*\nMake the ordering process simple, accurate, and smooth while strictly following all rules above.\n",
        language: 'en',
        provider: 'openai',
        ttsVoice: 'alloy',
        enableErp: true,
        taskGroups: [],
        enableAudio: false,
        enableImage: false,
        erpCurrency: 'PKR',
        stopKeyword: 'stop',
        ttsProvider: 'openai',
        historyLimit: 12,
        enableHistory: true,
        elevenLabsModel: 'eleven_multilingual_v2',
        elevenLabsStyle: 0,
        maxOutputTokens: 500,
        calendarTimeZone: 'Asia/Karachi',
        credentialSource: 'auto',
        exitOutputHandle: 'ai-stopped',
        maxAudioDuration: 30,
        calendarFunctions: [],
        elevenLabsVoiceId: 'JaagUurP1dmW3WscoJ79',
        erpIncludePdfLink: true,
        erpProductImageSendWhen: ERP_PRODUCT_IMAGE_SEND_WHEN_DEFAULT,
        erpProductImageMultiMatchMode: ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_DEFAULT,
        erpProductImageMaxPerProduct: ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_DEFAULT,
        erpProductImageCaptionMode: ERP_PRODUCT_IMAGE_CAPTION_MODE_DEFAULT,
        googleCalendarId: 'primary',
        targetAgentUserId: null,
        bookableAgentUserIds: [],
        voiceResponseMode: 'voice_only',
        assignmentStrategy: '',
        enableTextToSpeech: false,
        enableZohoCalendar: false,
        erpMessageTemplate: 'Aap ka order place hogya janab',
        elevenLabsStability: 0.5,
        enableTaskExecution: false,
        knowledgeBaseConfig: {
          maxRetrievedChunks: DEFAULT_RAG_CONFIG.maxRetrievedChunks,
          similarityThreshold: DEFAULT_RAG_CONFIG.similarityThreshold,
          contextPosition: DEFAULT_RAG_CONFIG.contextPosition,
          contextTemplate: DEFAULT_RAG_CONFIG.contextTemplate,
          greetingAcknowledgementExpressions:
            DEFAULT_RAG_CONFIG.greetingAcknowledgementExpressions,
          vectorDatabase: DEFAULT_RAG_CONFIG.vectorDatabase,
        },
        calendarAdvancedMode: true,
        enableGoogleCalendar: false,
        knowledgeBaseEnabled: false,
        zohoCalendarTimeZone: 'Asia/Karachi',
        calendarBufferMinutes: 0,
        calendarBusinessHours: {
          end: '17:00',
          start: '09:00',
        },
        enableSessionTakeover: true,
        zohoCalendarFunctions: [],
        calendarDefaultDuration: 60,
        calendarAdvancedSettings: {
          offDays: [
            0,
            6,
          ],
          weeklySchedule: [
            {
              dayName: 'Sunday',
              enabled: false,
              endTime: '17:00',
              dayIndex: 0,
              startTime: '09:00',
            },
            {
              dayName: 'Monday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 1,
              startTime: '09:00',
            },
            {
              dayName: 'Tuesday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 2,
              startTime: '09:00',
            },
            {
              dayName: 'Wednesday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 3,
              startTime: '09:00',
            },
            {
              dayName: 'Thursday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 4,
              startTime: '09:00',
            },
            {
              dayName: 'Friday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 5,
              startTime: '09:00',
            },
            {
              dayName: 'Saturday',
              enabled: false,
              endTime: '17:00',
              dayIndex: 6,
              startTime: '09:00',
            },
          ],
        },
        zohoCalendarAdvancedMode: true,
        elevenLabsEnableAudioTags: false,
        elevenLabsPromptInfluence: 0.5,
        elevenLabsSimilarityBoost: 0.75,
        elevenLabsUseSpeakerBoost: true,
        zohoCalendarBusinessHours: {
          end: '17:00',
          start: '09:00',
        },
        zohoCalendarDefaultDuration: 60,
        zohoCalendarAdvancedSettings: {
          offDays: [
            0,
            6,
          ],
          weeklySchedule: [
            {
              dayName: 'Sunday',
              enabled: false,
              endTime: '17:00',
              dayIndex: 0,
              startTime: '09:00',
            },
            {
              dayName: 'Monday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 1,
              startTime: '09:00',
            },
            {
              dayName: 'Tuesday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 2,
              startTime: '09:00',
            },
            {
              dayName: 'Wednesday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 3,
              startTime: '09:00',
            },
            {
              dayName: 'Thursday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 4,
              startTime: '09:00',
            },
            {
              dayName: 'Friday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 5,
              startTime: '09:00',
            },
            {
              dayName: 'Saturday',
              enabled: false,
              endTime: '17:00',
              dayIndex: 6,
              startTime: '09:00',
            },
          ],
        },
        elevenLabsAudioTagsInstructions: 'Use [excited] when discussing features, [whispers] for confidential information, [pause] before important points',
      },
      type: 'ai_assistant',
      width: 550,
      height: 2037,
      dragging: false,
      position: {
        x: 250,
        y: 200,
      },
      selected: true,
      positionAbsolute: {
        x: 250,
        y: 200,
      },
    },
  ],
  edges: [
    {
      id: 'edge-trigger-node-node_EydUqEIimC0wlGVFsLSui',
      type: 'smoothstep',
      source: 'trigger-node',
      target: 'node_EydUqEIimC0wlGVFsLSui',
      animated: true,
      targetHandle: 'flow-in',
    },
  ],
};

const DENTAL_ART_PLUSS_ASSISTANT_PROMPT = `You are *Verónica*, the administrative and patient-support representative for *Dental Art Pluss IPS* on WhatsApp. Follow every rule below without exception.

*Language*
* Default to Spanish (Colombia).
* If the patient writes in English, reply in English for that conversation (or that message thread).
* Detect language from the patient's messages; do not ask which language they prefer unless unclear.

*Tone and Style*
* Write like a real person texting: warm, clear, professional, never robotic.
* Keep messages short and easy to read on WhatsApp.
* Use *single asterisk bold* only (WhatsApp). No other markdown.
* Use emojis sparingly and only when natural.
* Never give medical diagnoses. For urgent pain, swelling, bleeding, or trauma, advise seeking care promptly and offer to book the soonest suitable slot.

*Clinic identity*
* Name: Dental Art Pluss IPS
* Address: Calle 25 # 15-05 esquina, diagonal a la entrada de urgencias del Hospital Central
* Email: admin@dentalartpluss.com
* Website: www.dentalartpluss.com
* WhatsApp support: available 24/7 for messaging (in-person visits only during clinic hours)

*In-person hours (guidance — live slots always come from booking tools)*
* Monday to Friday: 8:00 a.m.–12:00 p.m. and 2:00–5:00 p.m.
* Closed: Saturdays, Sundays, lunch 12:00–1:59 p.m., and blocked dates.
* Blocked dates 2026 (entire IPS): August 7, August 17, October 12, November 3, November 17, December 8, December 25.

*Staff / specialties (guidance for routing — book only people returned by tools)*
* Verónica: administrative / patient support (you). You do not provide clinical care.
* Dr. Juan Carlos González: oral / maxillofacial surgery and exodontics — typically Tuesday 2:00–4:20 p.m., Thursday 8:00–11:00 a.m. (max ~20 patients per session when configured).
* Dr. Fabián Martínez: endodontics — typically Wednesday 8:00 a.m.–12:00 p.m., Friday 2:00–5:00 p.m.
* Dra. Jaissel Pinedo: general dentistry — general IPS schedule; available from August 10, 2026.
* Orthodontics: initial evaluation is free; follow-up appointments are handled by the orthodontics team (do not invent a named doctor).
* Pediatric dentistry: no specific doctor named — use bookable people from tools when available.

*Services*
* Example areas the clinic offers: oral hygiene, operative dentistry, periodontics, oral rehabilitation, prosthetics, implantology, dental aesthetics, oral radiology, pediatric dentistry, orthodontics, endodontics, oral surgery / exodontics, general dentistry.
* NEVER invent service names, prices, durations, or availability.
* For service details and pricing, use ERP tools (search/share products of type service).
* For booking, ONLY use services from the dental booking catalog via select_booking_service. If a service is not bookable, say so and offer a valid alternative from the catalog.

*Proteger / referral (formerly Cajacopi)*
* Patients referred by Proteger need: authorized referral/order, authorization, medical record, ID, and complete readable PDF documents.
* Tell them to email documents to admin@dentalartpluss.com.
* Do NOT block WhatsApp booking while documents are pending. When booking, include a short note in the appointment description that Proteger documents are pending by email.

*Mandatory booking intake (in order)*
1. Greet the patient as Verónica from Dental Art Pluss IPS.
2. Collect *full name* and *cédula / document ID*. Do not proceed to booking tools until both are provided.
3. Clarify the visit type / service. Call select_booking_service (use ERP search first if they are unsure what exists).
4. If multiple specialists match, call list_bookable_people and/or select_booking_person. If only one matches or patient has no preference when allowed, proceed with the eligible specialist from tools.
5. Call check_availability for the requested date range. Present only real returned slots. Never invent open/full days.
6. When the patient picks a slot, repeat a clear summary: name, ID, service, specialist, date/time, location. Ask for explicit confirmation.
7. Only after confirmation, call book_appointment. Put name + ID (and Proteger pending note if relevant) in the title/description as appropriate.

*Cancel and reschedule (self-serve)*
* Use list_my_appointments for this contact only. Never discuss other patients' appointments.
* Cancel: confirm the appointment, then cancel with the appointment id from tools.
* Reschedule: cancel (or follow tool results) then run the booking flow again for a new slot.
* Always confirm before canceling. Encourage as much notice as possible for same-day changes.

*Tool rules (STRICT)*
* Live availability and booking authority come ONLY from local dental booking tools — never Google Calendar, never guessed August calendars.
* Typical order: select_booking_service → list_bookable_people / select_booking_person → check_availability → book_appointment.
* Prefer list_my_appointments over listing the whole clinic calendar.
* If tools say no services/slots/specialists are configured, explain politely that booking is temporarily unavailable and suggest contacting admin@dentalartpluss.com.

*Behavior*
* Stay polite and patient. Answer FAQs (hours, address, services, Proteger) anytime without breaking privacy rules.
* Never skip required intake steps before booking.
* Never finalize a booking without explicit confirmation.
* Primary objective: make appointment booking simple, accurate, and trustworthy while using ERP + local dental schedule only.
`;

const DENTAL_WEEKLY_SCHEDULE = [
  {
    dayName: 'Sunday',
    enabled: false,
    endTime: '17:00',
    dayIndex: 0,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Monday',
    enabled: true,
    endTime: '17:00',
    dayIndex: 1,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Tuesday',
    enabled: true,
    endTime: '17:00',
    dayIndex: 2,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Wednesday',
    enabled: true,
    endTime: '17:00',
    dayIndex: 3,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Thursday',
    enabled: true,
    endTime: '17:00',
    dayIndex: 4,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Friday',
    enabled: true,
    endTime: '17:00',
    dayIndex: 5,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Saturday',
    enabled: false,
    endTime: '17:00',
    dayIndex: 6,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
];

const DENTAL_APPOINTMENT_TEMPLATE: FlowTemplateRecord = {
  id: -2,
  name: 'Dental Appointment Template',
  description:
    'WhatsApp dental appointment flow for Dental Art Pluss IPS: Verónica books via local ERP dental schedule, shares ERP service details, and supports cancel/reschedule.',
  category: 'Healthcare',
  businessType: 'Dental',
  tags: null,
  isActive: true,
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
  nodes: [
    {
      id: 'trigger-node',
      data: {
        label: 'Message Trigger',
        channelTypes: ['whatsapp_unofficial'],
        conditionType: 'any',
        conditionValue: '',
        sessionTimeout: 30,
        hardResetKeyword: 'reset',
        sessionTimeoutUnit: 'minutes',
        enableSessionPersistence: true,
      },
      type: 'trigger',
      width: 300,
      height: 155,
      dragging: false,
      position: {
        x: 182.27545787545796,
        y: -10.487912087912093,
      },
      selected: false,
      positionAbsolute: {
        x: 182.27545787545796,
        y: -10.487912087912093,
      },
    },
    {
      id: 'node_dental_art_pluss_ai',
      data: {
        label: 'Ai_assistant Node',
        model: 'gpt-3.5-turbo',
        tasks: [],
        prompt: DENTAL_ART_PLUSS_ASSISTANT_PROMPT,
        language: 'es',
        provider: 'openai',
        ttsVoice: 'alloy',
        enableErp: true,
        enableLocalDentalBooking: true,
        taskGroups: [],
        enableAudio: false,
        enableImage: false,
        erpCurrency: 'COP',
        stopKeyword: 'stop',
        ttsProvider: 'openai',
        historyLimit: 12,
        enableHistory: true,
        elevenLabsModel: 'eleven_multilingual_v2',
        elevenLabsStyle: 0,
        maxOutputTokens: 500,
        calendarTimeZone: 'America/Bogota',
        credentialSource: 'auto',
        exitOutputHandle: 'ai-stopped',
        maxAudioDuration: 30,
        calendarFunctions: [],
        elevenLabsVoiceId: 'JaagUurP1dmW3WscoJ79',
        erpIncludePdfLink: true,
        erpProductImageSendWhen: ERP_PRODUCT_IMAGE_SEND_WHEN_DEFAULT,
        erpProductImageMultiMatchMode: ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_DEFAULT,
        erpProductImageMaxPerProduct: ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_DEFAULT,
        erpProductImageCaptionMode: ERP_PRODUCT_IMAGE_CAPTION_MODE_DEFAULT,
        googleCalendarId: 'primary',
        targetAgentUserId: null,
        bookableAgentUserIds: [],
        voiceResponseMode: 'voice_only',
        assignmentStrategy: '',
        enableTextToSpeech: false,
        enableZohoCalendar: false,
        erpMessageTemplate: 'Tu cita ha sido registrada. ¡Te esperamos en Dental Art Pluss IPS!',
        elevenLabsStability: 0.5,
        enableTaskExecution: false,
        knowledgeBaseConfig: {
          maxRetrievedChunks: DEFAULT_RAG_CONFIG.maxRetrievedChunks,
          similarityThreshold: DEFAULT_RAG_CONFIG.similarityThreshold,
          contextPosition: DEFAULT_RAG_CONFIG.contextPosition,
          contextTemplate: DEFAULT_RAG_CONFIG.contextTemplate,
          greetingAcknowledgementExpressions:
            DEFAULT_RAG_CONFIG.greetingAcknowledgementExpressions,
          vectorDatabase: DEFAULT_RAG_CONFIG.vectorDatabase,
        },
        calendarAdvancedMode: true,
        enableGoogleCalendar: false,
        knowledgeBaseEnabled: false,
        zohoCalendarTimeZone: 'America/Bogota',
        calendarBufferMinutes: 0,
        calendarBusinessHours: {
          end: '17:00',
          start: '08:00',
        },
        enableSessionTakeover: true,
        zohoCalendarFunctions: [],
        calendarDefaultDuration: 60,
        calendarAdvancedSettings: {
          offDays: [0, 6],
          weeklySchedule: DENTAL_WEEKLY_SCHEDULE,
        },
        zohoCalendarAdvancedMode: true,
        elevenLabsEnableAudioTags: false,
        elevenLabsPromptInfluence: 0.5,
        elevenLabsSimilarityBoost: 0.75,
        elevenLabsUseSpeakerBoost: true,
        zohoCalendarBusinessHours: {
          end: '17:00',
          start: '08:00',
        },
        zohoCalendarDefaultDuration: 60,
        zohoCalendarAdvancedSettings: {
          offDays: [0, 6],
          weeklySchedule: DENTAL_WEEKLY_SCHEDULE,
        },
        elevenLabsAudioTagsInstructions:
          'Use [excited] when discussing features, [whispers] for confidential information, [pause] before important points',
      },
      type: 'ai_assistant',
      width: 550,
      height: 2037,
      dragging: false,
      position: {
        x: 250,
        y: 200,
      },
      selected: true,
      positionAbsolute: {
        x: 250,
        y: 200,
      },
    },
  ],
  edges: [
    {
      id: 'edge-trigger-node-node_dental_art_pluss_ai',
      type: 'smoothstep',
      source: 'trigger-node',
      target: 'node_dental_art_pluss_ai',
      animated: true,
      targetHandle: 'flow-in',
    },
  ],
};

/** Shape passed to onApplyTemplate: nodes, edges, title for the existing apply handler */
export interface FlowTemplateSuggestion {
  nodes: unknown[];
  edges: unknown[];
  title: string;
}

interface FlowTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTemplate: (suggestion: FlowTemplateSuggestion) => void;
}

export function FlowTemplatesModal({
  isOpen,
  onClose,
  onApplyTemplate,
}: FlowTemplatesModalProps) {
  const { t } = useTranslation();
  const { data: templates = [], isLoading, error } = useQuery<FlowTemplateRecord[]>({
    queryKey: ['/api/flow-templates'],
    queryFn: async () => {
      const res = await fetch('/api/flow-templates');
      if (!res.ok) throw new Error('Failed to load flow templates');
      return res.json();
    },
    enabled: isOpen,
  });
  const visibleTemplates = [
    RESTAURANT_ORDER_TEMPLATE,
    DENTAL_APPOINTMENT_TEMPLATE,
    ...templates.filter(
      (template) =>
        template.name !== 'AI Assistant with Memory' &&
        template.businessType !== 'dental_clinic' &&
        template.name !== 'Dental Clinic Flow',
    ),
  ];

  const handleApply = (template: FlowTemplateRecord) => {
    onApplyTemplate({
      nodes: Array.isArray(template.nodes) ? template.nodes : [],
      edges: Array.isArray(template.edges) ? template.edges : [],
      title: template.name,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5" />
            {t('flow_builder.templates.title', 'Flow Templates')}
          </DialogTitle>
          <DialogDescription>
            {t('flow_builder.templates.description', 'Choose a template to apply to your flow. It will replace the current nodes and edges.')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive py-4">
              {t('flow_builder.templates.load_error', 'Failed to load templates')}
            </p>
          )}
          {!isLoading && !error && visibleTemplates.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">
              {t('flow_builder.templates.no_templates', 'No templates available.')}
            </p>
          )}
          {!isLoading && visibleTemplates.length > 0 && (
            <div className="grid gap-3">
              {visibleTemplates.map((template) => (
                <Card key={template.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {template.category}
                      </Badge>
                    </div>
                    {template.description && (
                      <CardDescription>{template.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleApply(template)}
                    >
                      {t('flow_builder.templates.apply', 'Apply template')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
