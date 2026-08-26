/**
 * Advanced Node Knowledge System
 * Zapier-level understanding of node functions and capabilities
 */

import {
  DOCUMENT_GENERATOR_DEFAULT_CONTENT_TEMPLATE,
  DOCUMENT_GENERATOR_DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_GENERATOR_DEFAULT_LANGUAGE,
  DOCUMENT_GENERATOR_DOCUMENT_TYPES,
  DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS,
} from '@shared/document-generator-defaults';

// Mirror of client/src/components/flow-builder/flowHandleIds.ts
const H = {
  IN: 'flow-in',
  OUT: 'flow-out',
  TOOL_IN: 'tool-input',
  VAR_DONE: 'variables-complete',
  CAL_DONE: 'calendar-booking-completed',
  INIT_MSG: 'initial-message',
  TRUE: 'true',
  FALSE: 'false',
} as const;

const ALL_TRIGGERS = ['trigger', 'webhookTrigger', 'mastershopWebhookTrigger', 'flow_trigger'] as const;

const ALL_NON_TRIGGERS = [
  'message', 'quickReply', 'whatsappInteractiveButtons', 'whatsappInteractiveList',
  'whatsappCTAURL', 'whatsappLocationRequest', 'whatsappPoll', 'followUp', 'whatsappFlows',
  'contactNotification', 'image', 'video', 'audio', 'document', 'condition', 'wait', 'input',
  'action', 'translation', 'codeExecution', 'data_capture', 'manageContact', 'manageTask',
  'aiAssistant', 'webhook', 'httpRequest', 'databaseQuery', 'mcp_execute_tool', 'stripe', 'erp',
  'callAgent', 'shopify', 'woocommerce', 'mastershop', 'typebot', 'flowise', 'n8n', 'make',
  'google_sheets', 'documind', 'chat_pdf', 'document_generator', 'googleCalendar', 'botDisable', 'botReset',
  'updatePipelineStage', 'moveDealToPipeline',
] as const;

const ALL_FLOW_NODES: readonly string[] = ALL_NON_TRIGGERS;
const TERMINAL_NODES = ['botDisable', 'botReset'] as const;

const DEFAULT_PERFORMANCE = {
  executionTime: '< 200ms',
  resourceUsage: 'low',
  scalability: 'high',
} as const;

export interface NodeFunction {
  name: string;
  description: string;
  parameters: NodeParameter[];
  returnType: string;
  examples: NodeExample[];
  dependencies: string[];
  category: string;
  complexity: 'simple' | 'medium' | 'advanced';
  useCases: string[];
  bestPractices: string[];
  commonMistakes: string[];
  performance: {
    executionTime: string;
    resourceUsage: string;
    scalability: string;
  };
  inputHandles?: string[];
  outputHandles?: string[];
  validPredecessors?: string[];
  validSuccessors?: string[];
}

export interface NodeParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'function';
  required: boolean;
  description: string;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
  examples: any[];
  relatedVariables: string[];
}

export interface NodeExample {
  title: string;
  description: string;
  code: any;
  context: string;
  expectedOutput: any;
  useCase: string;
}

export interface NodeRelationship {
  sourceNode: string;
  targetNode: string;
  relationshipType: 'data_flow' | 'conditional' | 'sequential' | 'parallel' | 'error_handling' | 'tool_provider';
  dataMapping: {
    sourceField: string;
    targetField: string;
    transformation?: string;
  }[];
  conditions?: string[];
  performance: {
    latency: number;
    reliability: number;
    cost: number;
  };
}

export interface NodeContext {
  industry: string[];
  useCase: string[];
  complexity: 'simple' | 'medium' | 'advanced';
  integration: string[];
  performance: {
    executionTime: number;
    resourceUsage: number;
    scalability: number;
  };
  dependencies: string[];
  alternatives: string[];
}

type NodeDefOptions = {
  name: string;
  description: string;
  category: string;
  complexity: 'simple' | 'medium' | 'advanced';
  parameters: NodeParameter[];
  returnType?: string;
  examples?: NodeExample[];
  dependencies?: string[];
  useCases?: string[];
  bestPractices?: string[];
  commonMistakes?: string[];
  performance?: NodeFunction['performance'];
  inputHandles?: string[];
  outputHandles?: string[];
  validPredecessors?: string[];
  validSuccessors?: string[];
};

export class NodeKnowledgeBase {
  private static instance: NodeKnowledgeBase;
  private _initialized = false;
  private nodeFunctions: Map<string, NodeFunction> = new Map();
  private nodeTypeByFunction: Map<NodeFunction, string> = new Map();
  private nodeRelationships: Map<string, NodeRelationship[]> = new Map();
  private nodeContexts: Map<string, NodeContext> = new Map();
  private learningData: Map<string, any> = new Map();

  static getInstance(): NodeKnowledgeBase {
    if (!NodeKnowledgeBase.instance) {
      NodeKnowledgeBase.instance = new NodeKnowledgeBase();
    }
    return NodeKnowledgeBase.instance;
  }

  static resetInstance(): void {
    if (process.env.NODE_ENV === 'test') {
      if (NodeKnowledgeBase.instance) {
        NodeKnowledgeBase.instance._initialized = false;
      }
      NodeKnowledgeBase.instance = undefined as any;
    }
  }

  async initializeNodeKnowledge(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;
    this.loadCoreNodeFunctions();
    this.loadNodeRelationships();
    this.loadNodeContexts();
    this.loadLearningData();
  }

  getNodeFunction(nodeType: string): NodeFunction | null {
    return this.nodeFunctions.get(nodeType) || null;
  }

  getNodeType(fn: NodeFunction): string | null {
    return this.nodeTypeByFunction.get(fn) ?? null;
  }

  getNodeFunctions(nodeType: string): NodeFunction[] {
    const func = this.nodeFunctions.get(nodeType);
    return func ? [func] : [];
  }

  getNodeRelationships(nodeType: string): NodeRelationship[] {
    return this.nodeRelationships.get(nodeType) || [];
  }

  getNodeContext(nodeType: string): NodeContext | null {
    return this.nodeContexts.get(nodeType) || null;
  }

  getAllNodeTypes(): string[] {
    return Array.from(this.nodeFunctions.keys());
  }

  findOptimalNodeCombinations(requirements: {
    useCase: string;
    industry: string;
    complexity: string;
    performance: any;
  }): string[] {
    const candidates: string[] = [];

    for (const [nodeType, context] of this.nodeContexts) {
      if (this.matchesRequirements(nodeType, context, requirements)) {
        candidates.push(nodeType);
      }
    }

    return this.rankNodesByOptimality(candidates, requirements);
  }

  getIntelligentRecommendations(
    currentFlow: any[],
    userIntent: string,
    context: any
  ): {
    suggestedNodes: string[];
    reasoning: string;
    confidence: number;
    alternatives: string[];
  } {
    const analysis = this.analyzeCurrentFlow(currentFlow);
    const intent = this.parseUserIntent(userIntent);
    const recommendations = this.generateRecommendations(analysis, intent, context);

    return {
      suggestedNodes: recommendations.nodes,
      reasoning: recommendations.reasoning,
      confidence: recommendations.confidence,
      alternatives: recommendations.alternatives,
    };
  }

  learnFromInteraction(
    nodeType: string,
    configuration: any,
    outcome: 'success' | 'failure',
    userFeedback?: string
  ): void {
    const learningKey = `${nodeType}_${JSON.stringify(configuration)}`;
    const currentData = this.learningData.get(learningKey) || {
      successes: 0,
      failures: 0,
      configurations: [],
      feedback: [],
    };

    if (outcome === 'success') {
      currentData.successes++;
    } else {
      currentData.failures++;
    }

    if (userFeedback) {
      currentData.feedback.push(userFeedback);
    }

    currentData.configurations.push(configuration);
    this.learningData.set(learningKey, currentData);
  }

  private ex(
    title: string,
    description: string,
    code: any,
    context: string,
    expectedOutput: any,
    useCase: string
  ): NodeExample {
    return { title, description, code, context, expectedOutput, useCase };
  }

  private param(
    name: string,
    type: NodeParameter['type'],
    required: boolean,
    description: string,
    extras: Partial<NodeParameter> = {}
  ): NodeParameter {
    return {
      name,
      type,
      required,
      description,
      examples: extras.examples ?? [],
      relatedVariables: extras.relatedVariables ?? [],
      ...extras,
    };
  }

  private def(opts: NodeDefOptions): NodeFunction {
    return {
      name: opts.name,
      description: opts.description,
      parameters: opts.parameters,
      returnType: opts.returnType ?? 'void',
      examples: opts.examples ?? [],
      dependencies: opts.dependencies ?? [],
      category: opts.category,
      complexity: opts.complexity,
      useCases: opts.useCases ?? [],
      bestPractices: opts.bestPractices ?? [],
      commonMistakes: opts.commonMistakes ?? [],
      performance: opts.performance ?? { ...DEFAULT_PERFORMANCE },
      inputHandles: opts.inputHandles,
      outputHandles: opts.outputHandles,
      validPredecessors: opts.validPredecessors,
      validSuccessors: opts.validSuccessors,
    };
  }

  private flowNode(opts: NodeDefOptions): NodeFunction {
    return this.def({
      ...opts,
      inputHandles: opts.inputHandles ?? [H.IN],
      outputHandles: opts.outputHandles ?? [H.OUT],
      validPredecessors: opts.validPredecessors ?? [...ALL_FLOW_NODES, ...ALL_TRIGGERS],
      validSuccessors: opts.validSuccessors ?? [...ALL_FLOW_NODES],
    });
  }

  private register(key: string, node: NodeFunction): void {
    this.nodeFunctions.set(key, node);
    this.nodeTypeByFunction.set(node, key);
  }

  private loadCoreNodeFunctions(): void {
    this.loadTriggerNodes();
    this.loadMessageNodes();
    this.loadMediaNodes();
    this.loadLogicNodes();
    this.loadIntegrationNodes();
    this.loadEcommerceNodes();
    this.loadExternalNodes();
    this.loadCalendarNodes();
    this.loadBotControlNodes();
    this.loadPipelineNodes();
  }

  private loadTriggerNodes(): void {
    const triggerSuccessors = [...ALL_NON_TRIGGERS];

    this.register('trigger', this.def({
      name: 'Message Trigger',
      description: 'Starts a flow when an inbound message matches channel and keyword rules',
      category: 'trigger',
      complexity: 'simple',
      outputHandles: [H.OUT, H.INIT_MSG],
      validPredecessors: [],
      validSuccessors: triggerSuccessors,
      parameters: [
        this.param('channelTypes', 'array', true, 'Channel types that activate this trigger', {
          validation: { enum: ['whatsapp_official', 'whatsapp_unofficial', 'messenger', 'instagram', 'email', 'telegram'] },
          examples: [['whatsapp_official']],
        }),
        this.param('conditionType', 'string', false, 'Optional keyword match type'),
        this.param('conditionValue', 'string', false, 'Optional keyword or pattern value'),
        this.param('enableSessionPersistence', 'boolean', false, 'Persist session across messages', { defaultValue: false }),
        this.param('sessionTimeout', 'number', false, 'Session timeout duration'),
      ],
      useCases: ['entry_point', 'onboarding', 'support'],
      bestPractices: ['Scope channelTypes to active integrations', 'Use initial-message handle for first-contact routing'],
      examples: [
        this.ex(
          'WhatsApp keyword trigger',
          'Start flow when inbound WhatsApp message contains "help"',
          { channelTypes: ['whatsapp_official'], conditionType: 'contains', conditionValue: 'help' },
          'Customer support entry point',
          { flowStarted: true },
          'support'
        ),
      ],
    }));

    this.register('webhookTrigger', this.def({
      name: 'Webhook Trigger',
      description: 'Starts a flow when an HTTP webhook is received',
      category: 'trigger',
      complexity: 'simple',
      outputHandles: [H.OUT],
      validPredecessors: [],
      validSuccessors: triggerSuccessors,
      parameters: [
        this.param('webhookPath', 'string', true, 'Unique webhook path segment', { examples: ['/orders/inbound'] }),
        this.param('secretToken', 'string', false, 'Optional shared secret for verification'),
        this.param('method', 'string', false, 'HTTP method', { validation: { enum: ['GET', 'POST', 'PUT', 'PATCH'] } }),
      ],
      useCases: ['entry_point', 'integration', 'automation'],
      examples: [
        this.ex(
          'Order webhook entry',
          'Start flow on POST to /orders/inbound',
          { webhookPath: '/orders/inbound', method: 'POST', secretToken: 'shared-secret' },
          'E-commerce order notifications',
          { payload: { orderId: '12345' } },
          'integration'
        ),
      ],
    }));

    this.register('mastershopWebhookTrigger', this.def({
      name: 'Mastershop Webhook Trigger',
      description: 'Starts a flow on Mastershop e-commerce webhook events',
      category: 'trigger',
      complexity: 'simple',
      outputHandles: [H.OUT],
      validPredecessors: [],
      validSuccessors: triggerSuccessors,
      parameters: [],
      useCases: ['entry_point', 'ecommerce', 'order_management'],
      examples: [
        this.ex(
          'Mastershop order webhook',
          'Start flow on Mastershop order events',
          {},
          'E-commerce order lifecycle automation',
          { event: 'order.created' },
          'order_management'
        ),
      ],
    }));

    this.register('flow_trigger', this.def({
      name: 'Flow Trigger',
      description: 'Sub-flow entry point invoked by another flow',
      category: 'logic',
      complexity: 'medium',
      outputHandles: [H.OUT],
      validPredecessors: [],
      validSuccessors: triggerSuccessors,
      parameters: [
        this.param('targetFlowId', 'string', true, 'Flow ID to invoke as sub-flow entry', { examples: ['42'] }),
      ],
      useCases: ['entry_point', 'modular_flows', 'handoff'],
      examples: [
        this.ex(
          'Sub-flow handoff',
          'Invoke a reusable sub-flow by ID',
          { targetFlowId: '42' },
          'Modular flow composition',
          { subFlowStarted: true },
          'modular_flows'
        ),
      ],
    }));
  }

  private loadMessageNodes(): void {
    this.register('message', this.flowNode({
      name: 'Send Message',
      description: 'Send a text message with variable support',
      category: 'message',
      complexity: 'simple',
      parameters: [
        this.param('content', 'string', true, 'Message content with variable support', {
          examples: ['Hello {{contact.name}}!'],
          relatedVariables: ['{{contact.name}}', '{{message.content}}'],
        }),
      ],
      useCases: ['onboarding', 'notifications', 'support'],
      bestPractices: ['Use personalization with {{contact.name}}', 'Keep messages concise'],
      commonMistakes: ['Using incorrect variable syntax', 'Making messages too long'],
      performance: { executionTime: '< 100ms', resourceUsage: 'low', scalability: 'high' },
      examples: [
        this.ex(
          'Welcome message',
          'Personalized greeting using contact name variable',
          { content: 'Hello {{contact.name}}, welcome to our store!' },
          'New customer onboarding',
          { messageSent: true },
          'onboarding'
        ),
      ],
    }));

    this.register('quickReply', this.flowNode({
      name: 'Quick Reply',
      description: 'Send a message with quick-reply button options',
      category: 'message',
      complexity: 'simple',
      parameters: [
        this.param('message', 'string', true, 'Prompt message'),
        this.param('options', 'array', true, 'Quick reply options (≥ 1)', { validation: { min: 1 } }),
      ],
      useCases: ['surveys', 'routing', 'support'],
      examples: [
        this.ex(
          'Support routing options',
          'Quick reply buttons for support topic selection',
          { message: 'How can we help?', options: ['Sales', 'Support', 'Billing'] },
          'Customer support routing',
          { selectedOption: 'Support' },
          'routing'
        ),
      ],
    }));

    this.register('whatsappInteractiveButtons', this.flowNode({
      name: 'WhatsApp Interactive Buttons',
      description: 'Send WhatsApp interactive reply buttons (1–3)',
      category: 'message',
      complexity: 'simple',
      parameters: [
        this.param('message', 'string', true, 'Body text above buttons'),
        this.param('buttons', 'array', true, 'Button definitions (1–3)', { validation: { min: 1, max: 3 } }),
      ],
      useCases: ['routing', 'support', 'sales'],
      examples: [
        this.ex(
          'Product inquiry buttons',
          'Interactive buttons for product category selection',
          { message: 'What are you looking for?', buttons: [{ id: 'shoes', title: 'Shoes' }, { id: 'bags', title: 'Bags' }] },
          'E-commerce product routing',
          { selectedButton: 'shoes' },
          'sales'
        ),
      ],
    }));

    this.register('whatsappInteractiveList', this.flowNode({
      name: 'WhatsApp Interactive List',
      description: 'Send a WhatsApp list picker message',
      category: 'message',
      complexity: 'simple',
      parameters: [
        this.param('message', 'string', true, 'Body text'),
        this.param('buttonText', 'string', true, 'List open button label'),
        this.param('sections', 'array', true, 'List sections and rows'),
      ],
      useCases: ['catalog', 'menu', 'support'],
      examples: [
        this.ex(
          'Product catalog list',
          'List picker for browsing product categories',
          { message: 'Browse our catalog', buttonText: 'View Products', sections: [{ title: 'Categories', rows: [{ id: '1', title: 'Electronics' }] }] },
          'Product catalog browsing',
          { selectedRow: '1' },
          'catalog'
        ),
      ],
    }));

    this.register('whatsappCTAURL', this.flowNode({
      name: 'WhatsApp CTA URL',
      description: 'Send a WhatsApp call-to-action URL button',
      category: 'message',
      complexity: 'simple',
      parameters: [
        this.param('message', 'string', true, 'Body text'),
        this.param('ctaText', 'string', true, 'Button label'),
        this.param('ctaUrl', 'string', true, 'Destination URL'),
      ],
      useCases: ['marketing', 'checkout', 'support'],
      examples: [
        this.ex(
          'Checkout CTA',
          'Call-to-action URL button for checkout page',
          { message: 'Complete your purchase', ctaText: 'Checkout Now', ctaUrl: 'https://store.example.com/checkout' },
          'E-commerce checkout promotion',
          { urlClicked: true },
          'checkout'
        ),
      ],
    }));

    this.register('whatsappLocationRequest', this.flowNode({
      name: 'WhatsApp Location Request',
      description: 'Ask the contact to share their location',
      category: 'message',
      complexity: 'simple',
      parameters: [this.param('message', 'string', true, 'Location request prompt')],
      useCases: ['delivery', 'field_service', 'support'],
      examples: [
        this.ex(
          'Delivery location request',
          'Ask customer to share delivery location',
          { message: 'Please share your delivery location' },
          'Food delivery order',
          { locationShared: true },
          'delivery'
        ),
      ],
    }));

    this.register('whatsappPoll', this.flowNode({
      name: 'WhatsApp Poll',
      description: 'Send a WhatsApp poll (2–12 options)',
      category: 'message',
      complexity: 'simple',
      parameters: [
        this.param('question', 'string', true, 'Poll question'),
        this.param('options', 'array', true, 'Poll options (2–12)', { validation: { min: 2, max: 12 } }),
        this.param('selectableCount', 'number', true, 'Number of options the user may select'),
      ],
      useCases: ['feedback', 'surveys', 'engagement'],
      examples: [
        this.ex(
          'Satisfaction poll',
          'Customer satisfaction poll with rating options',
          { question: 'How satisfied are you?', options: ['Great', 'Okay', 'Poor'], selectableCount: 1 },
          'Post-support feedback collection',
          { pollResponse: 'Great' },
          'feedback'
        ),
      ],
    }));

    this.register('followUp', this.flowNode({
      name: 'Follow Up',
      description: 'Schedule a delayed follow-up message',
      category: 'message',
      complexity: 'simple',
      parameters: [
        this.param('message', 'string', true, 'Follow-up message content'),
        this.param('delayMinutes', 'number', true, 'Delay before sending'),
      ],
      useCases: ['drip_campaigns', 'follow_up', 'reminders'],
      examples: [
        this.ex(
          'Delayed follow-up',
          'Send a reminder message after 24 hours',
          { message: 'Just checking in — do you need any help?', delayMinutes: 1440 },
          'Abandoned cart follow-up',
          { followUpSent: true },
          'follow_up'
        ),
      ],
    }));

    this.register('whatsappFlows', this.flowNode({
      name: 'WhatsApp Flows',
      description: 'Launch a WhatsApp Flows form experience',
      category: 'message',
      complexity: 'medium',
      parameters: [this.param('flowId', 'string', true, 'WhatsApp Flows form ID')],
      useCases: ['forms', 'lead_capture', 'checkout'],
      examples: [
        this.ex(
          'Lead capture form',
          'Launch WhatsApp Flows form for lead collection',
          { flowId: 'lead_capture_flow_001' },
          'Lead generation campaign',
          { formSubmitted: true },
          'lead_capture'
        ),
      ],
    }));

    this.register('contactNotification', this.flowNode({
      name: 'Contact Notification',
      description: 'Send an internal notification about the contact',
      category: 'message',
      complexity: 'simple',
      parameters: [
        this.param('notificationTemplate', 'string', true, 'Notification template'),
        this.param('recipientType', 'string', true, 'Who receives the notification'),
      ],
      useCases: ['alerts', 'handoff', 'support'],
      examples: [
        this.ex(
          'Agent handoff alert',
          'Notify team when customer needs human support',
          { notificationTemplate: 'Customer {{contact.name}} needs assistance', recipientType: 'assigned_agent' },
          'Human handoff escalation',
          { notificationSent: true },
          'handoff'
        ),
      ],
    }));
  }

  private loadMediaNodes(): void {
    const mediaParams = (type: string) => [
      this.param('url', 'string', true, `${type} media URL`, { examples: ['https://cdn.example.com/file'] }),
      ...(type !== 'audio' ? [this.param('caption', 'string', false, 'Optional caption')] : []),
      ...(type === 'document' ? [this.param('documentType', 'string', false, 'Document MIME or category')] : []),
    ];

    this.register('image', this.flowNode({
      name: 'Image',
      description: 'Send an image message',
      category: 'media',
      complexity: 'simple',
      parameters: mediaParams('image'),
      useCases: ['marketing', 'product_catalog', 'support'],
      examples: [
        this.ex(
          'Product image',
          'Send product image with caption',
          { url: 'https://cdn.example.com/products/shoe.jpg', caption: 'New arrival — limited stock!' },
          'Product promotion campaign',
          { imageSent: true },
          'marketing'
        ),
      ],
    }));

    this.register('video', this.flowNode({
      name: 'Video',
      description: 'Send a video message',
      category: 'media',
      complexity: 'simple',
      parameters: mediaParams('video'),
      useCases: ['demos', 'tutorials', 'marketing'],
      examples: [
        this.ex(
          'Product demo video',
          'Send a product demonstration video',
          { url: 'https://cdn.example.com/demos/product.mp4', caption: 'See how it works' },
          'Product onboarding',
          { videoSent: true },
          'demos'
        ),
      ],
    }));

    this.register('audio', this.flowNode({
      name: 'Audio',
      description: 'Send an audio message',
      category: 'media',
      complexity: 'simple',
      parameters: mediaParams('audio'),
      useCases: ['voice_notes', 'podcasts', 'support'],
      examples: [
        this.ex(
          'Voice message',
          'Send an audio voice note',
          { url: 'https://cdn.example.com/audio/welcome.mp3' },
          'Voice-based onboarding',
          { audioSent: true },
          'voice_notes'
        ),
      ],
    }));

    this.register('document', this.flowNode({
      name: 'Document',
      description: 'Send a document attachment',
      category: 'media',
      complexity: 'simple',
      parameters: mediaParams('document'),
      useCases: ['invoices', 'contracts', 'support'],
      examples: [
        this.ex(
          'Invoice document',
          'Send an invoice PDF to the customer',
          { url: 'https://cdn.example.com/invoices/INV-001.pdf', caption: 'Your invoice', documentType: 'application/pdf' },
          'Order completion',
          { documentSent: true },
          'invoices'
        ),
      ],
    }));
  }

  private loadLogicNodes(): void {
    this.register('condition', this.flowNode({
      name: 'Condition',
      description: 'Branch flow execution based on rules (true/false outputs)',
      category: 'logic',
      complexity: 'medium',
      outputHandles: [H.TRUE, H.FALSE],
      validPredecessors: [...ALL_FLOW_NODES, ...ALL_TRIGGERS],
      validSuccessors: [...ALL_NON_TRIGGERS],
      parameters: [this.param('rules', 'array', true, 'Condition rules array')],
      useCases: ['branching', 'logic', 'routing'],
      bestPractices: ['Wire both true and false branches', 'Keep rules readable and testable'],
      examples: [
        this.ex(
          'VIP customer check',
          'Branch flow based on customer tag',
          { rules: [{ field: 'contact.tags', operator: 'contains', value: 'vip' }] },
          'VIP routing logic',
          { branch: 'true' },
          'branching'
        ),
      ],
    }));

    this.register('wait', this.flowNode({
      name: 'Wait',
      description: 'Pause flow execution for a duration',
      category: 'logic',
      complexity: 'simple',
      parameters: [
        this.param('duration', 'number', true, 'Wait duration value'),
        this.param('unit', 'string', true, 'Time unit', { validation: { enum: ['minutes', 'hours', 'days'] } }),
      ],
      useCases: ['pacing', 'follow_up', 'drip_campaigns'],
      examples: [
        this.ex(
          '24-hour wait',
          'Pause flow for one day before follow-up',
          { duration: 1, unit: 'days' },
          'Drip campaign pacing',
          { waitCompleted: true },
          'drip_campaigns'
        ),
      ],
    }));

    this.register('input', this.flowNode({
      name: 'Input',
      description: 'Ask the user a question and store the answer in a variable',
      category: 'logic',
      complexity: 'simple',
      parameters: [
        this.param('question', 'string', true, 'Question to ask'),
        this.param('variableName', 'string', true, 'Variable name for the answer'),
      ],
      useCases: ['data_collection', 'surveys', 'support'],
      examples: [
        this.ex(
          'Email collection',
          'Ask user for email and store in variable',
          { question: 'What is your email address?', variableName: 'email' },
          'Lead capture flow',
          { variableSet: 'email' },
          'data_collection'
        ),
      ],
    }));

    this.register('action', this.flowNode({
      name: 'Action',
      description: 'Execute a built-in platform action',
      category: 'logic',
      complexity: 'medium',
      parameters: [
        this.param('actionType', 'string', true, 'Action type identifier'),
        this.param('parameters', 'object', true, 'Action-specific parameters'),
      ],
      useCases: ['automation', 'crm', 'routing'],
      examples: [
        this.ex(
          'Tag contact action',
          'Apply a tag to the current contact',
          { actionType: 'tag_contact', parameters: { tag: 'interested' } },
          'Lead qualification automation',
          { actionExecuted: true },
          'automation'
        ),
      ],
    }));

    this.register('translation', this.flowNode({
      name: 'Translation',
      description: 'Translate text from one language to another',
      category: 'logic',
      complexity: 'simple',
      parameters: [
        this.param('targetLanguage', 'string', true, 'Target language code'),
        this.param('sourceField', 'string', true, 'Field or variable containing source text'),
      ],
      useCases: ['multilingual', 'support', 'localization'],
      examples: [
        this.ex(
          'Translate to Spanish',
          'Translate message content to Spanish',
          { targetLanguage: 'es', sourceField: 'message.content' },
          'Multilingual customer support',
          { translatedText: 'Hola' },
          'multilingual'
        ),
      ],
    }));

    this.register('codeExecution', this.flowNode({
      name: 'Code Execution',
      description: 'Run custom JavaScript in the flow context',
      category: 'logic',
      complexity: 'advanced',
      parameters: [this.param('code', 'string', true, 'JavaScript code to execute')],
      returnType: 'object',
      useCases: ['custom_logic', 'transformation', 'integration'],
      performance: { executionTime: '100ms - 1s', resourceUsage: 'medium', scalability: 'medium' },
      examples: [
        this.ex(
          'Format order total',
          'Calculate formatted order total with custom JS',
          { code: 'return { total: `$${context.order.amount.toFixed(2)}` };' },
          'Order summary formatting',
          { total: '$49.99' },
          'custom_logic'
        ),
      ],
    }));

    this.register('data_capture', this.flowNode({
      name: 'Data Capture',
      description: 'Collect structured fields from the contact',
      category: 'logic',
      complexity: 'medium',
      parameters: [this.param('fields', 'array', true, 'Capture field definitions')],
      returnType: 'object',
      useCases: ['lead_capture', 'forms', 'onboarding'],
      examples: [
        this.ex(
          'Lead form fields',
          'Capture name and email from contact',
          { fields: [{ name: 'name', type: 'text', label: 'Full Name' }, { name: 'email', type: 'email', label: 'Email' }] },
          'Lead generation onboarding',
          { capturedData: { name: 'Jane', email: 'jane@example.com' } },
          'lead_capture'
        ),
      ],
    }));

    this.register('manageContact', this.flowNode({
      name: 'Manage Contact',
      description: 'Update contact fields, tags, or attributes',
      category: 'logic',
      complexity: 'simple',
      parameters: [
        this.param('operation', 'string', true, 'Contact operation', { validation: { enum: ['update', 'tag', 'untag'] } }),
        this.param('fieldUpdates', 'object', true, 'Fields or tags to apply'),
      ],
      useCases: ['crm', 'segmentation', 'onboarding'],
      examples: [
        this.ex(
          'Update contact name',
          'Update contact first name field',
          { operation: 'update', fieldUpdates: { firstName: '{{captured.name}}' } },
          'Post-capture CRM update',
          { contactUpdated: true },
          'crm'
        ),
      ],
    }));

    this.register('manageTask', this.flowNode({
      name: 'Manage Task',
      description: 'Create, update, or delete tasks linked to the current contact',
      category: 'logic',
      complexity: 'simple',
      parameters: [
        this.param('operation', 'string', true, 'Task operation', {
          validation: { enum: ['create_task', 'update_task', 'delete_task'] },
        }),
        this.param('title', 'string', true, 'Task title with variable support', {
          relatedVariables: ['{{contact.name}}'],
        }),
      ],
      useCases: ['task_automation', 'follow_up', 'crm'],
      bestPractices: ['Always set a descriptive title', 'Use {{task.id}} to chain create → update'],
      examples: [
        this.ex(
          'Create follow-up task',
          'Create a task for sales follow-up',
          { operation: 'create_task', title: 'Follow up with {{contact.name}}' },
          'Sales pipeline automation',
          { taskId: 'task_123' },
          'follow_up'
        ),
      ],
    }));
  }

  private loadIntegrationNodes(): void {
    this.register('aiAssistant', this.flowNode({
      name: 'AI Assistant',
      description: 'GPT-powered conversational AI with function calling and tool input handle',
      category: 'integration',
      complexity: 'advanced',
      inputHandles: [H.IN, H.TOOL_IN],
      outputHandles: [H.OUT, H.VAR_DONE, H.CAL_DONE],
      parameters: [
        this.param('provider', 'string', true, 'AI provider', { validation: { enum: ['openai', 'openrouter'] } }),
        this.param('model', 'string', true, 'AI model identifier'),
        this.param('prompt', 'string', true, 'System prompt for AI behavior'),
      ],
      returnType: 'string',
      useCases: ['support', 'sales', 'content_generation'],
      bestPractices: ['Use specific prompts', 'Connect MCP client tool via tool-input handle'],
      performance: { executionTime: '2-5 seconds', resourceUsage: 'high', scalability: 'medium' },
      examples: [
        this.ex(
          'Customer support AI',
          'GPT-powered support assistant with system prompt',
          { provider: 'openai', model: 'gpt-4o', prompt: 'You are a helpful customer support agent. Be concise and friendly.' },
          'Automated customer support',
          { aiResponse: 'I can help you with your order.' },
          'support'
        ),
      ],
    }));

    this.register('webhook', this.flowNode({
      name: 'Webhook',
      description: 'Send an outbound HTTP webhook',
      category: 'integration',
      complexity: 'medium',
      parameters: [
        this.param('url', 'string', true, 'Webhook URL'),
        this.param('method', 'string', true, 'HTTP method', { validation: { enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] } }),
      ],
      returnType: 'object',
      useCases: ['integration', 'automation', 'notifications'],
      examples: [
        this.ex(
          'Order notification webhook',
          'POST order data to external system',
          { url: 'https://api.example.com/orders', method: 'POST' },
          'Order sync integration',
          { statusCode: 200 },
          'integration'
        ),
      ],
    }));

    this.register('httpRequest', this.flowNode({
      name: 'HTTP Request',
      description: 'Make HTTP requests to external APIs',
      category: 'integration',
      complexity: 'medium',
      parameters: [
        this.param('url', 'string', true, 'API endpoint URL'),
        this.param('method', 'string', true, 'HTTP method', { validation: { enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] } }),
      ],
      returnType: 'object',
      useCases: ['api_integration', 'data_sync', 'webhook_processing'],
      performance: { executionTime: '500ms - 2s', resourceUsage: 'medium', scalability: 'high' },
      examples: [
        this.ex(
          'Fetch customer data',
          'GET customer record from external API',
          { url: 'https://api.example.com/customers/{{contact.id}}', method: 'GET' },
          'CRM data enrichment',
          { response: { name: 'John', email: 'john@example.com' } },
          'api_integration'
        ),
      ],
    }));

    this.register('databaseQuery', this.flowNode({
      name: 'Database Query',
      description: 'Run SQL queries against external Postgres or MySQL databases',
      category: 'integration',
      complexity: 'medium',
      parameters: [
        this.param('engine', 'string', true, 'Database engine', { validation: { enum: ['postgres', 'mysql'] } }),
        this.param('query', 'string', true, 'SQL query with {{variable}} placeholders'),
      ],
      returnType: 'object',
      useCases: ['data_sync', 'crm_integration', 'reporting'],
      performance: { executionTime: '200ms - 5s', resourceUsage: 'medium', scalability: 'medium' },
      examples: [
        this.ex(
          'Query recent orders',
          'Fetch last 5 orders for contact from Postgres',
          { engine: 'postgres', query: 'SELECT * FROM orders WHERE contact_id = {{contact.id}} LIMIT 5' },
          'Order history lookup',
          { rows: [{ id: 1, total: 99.99 }] },
          'data_sync'
        ),
      ],
    }));

    this.register('mcp_client_tool', this.def({
      name: 'MCP Client Tool',
      description:
        'Non-control-flow node: connects to MCP servers and exposes tools to an AI Assistant via the tool-input handle (not flow-in).',
      category: 'integration',
      complexity: 'advanced',
      inputHandles: [],
      outputHandles: [H.TOOL_IN],
      validPredecessors: [],
      validSuccessors: ['aiAssistant'],
      parameters: [
        this.param('servers', 'array', true, 'List of MCP servers to expose'),
      ],
      useCases: ['ai_tools', 'integration', 'mcp'],
      bestPractices: [
        'Connect tool-output to AI Assistant tool-input — this is not a control-flow edge',
        'Restrict tools via include filter in production',
      ],
      commonMistakes: [
        'Treating MCP client tool as a normal flow predecessor',
        'Forgetting to connect to the AI Assistant tool-input handle',
      ],
      performance: { executionTime: '200ms - 2s', resourceUsage: 'medium', scalability: 'medium' },
      examples: [
        this.ex(
          'Expose MCP tools to AI',
          'Connect MCP server tools to AI Assistant',
          { servers: [{ name: 'filesystem', url: 'http://localhost:3001/mcp' }] },
          'AI tool augmentation',
          { toolsExposed: ['read_file', 'write_file'] },
          'ai_tools'
        ),
      ],
    }));

    this.register('mcp_execute_tool', this.flowNode({
      name: 'MCP Execute Tool',
      description: 'Invokes a single MCP tool as an explicit flow step',
      category: 'integration',
      complexity: 'medium',
      parameters: [this.param('toolName', 'string', true, 'Name of the MCP tool to call')],
      returnType: 'object',
      useCases: ['integration', 'automation', 'mcp'],
      examples: [
        this.ex(
          'Execute file read tool',
          'Call MCP read_file tool as a flow step',
          { toolName: 'read_file' },
          'Document processing automation',
          { result: { content: 'file contents' } },
          'automation'
        ),
      ],
    }));

    this.register('stripe', this.flowNode({
      name: 'Stripe',
      description: 'Stripe payment and subscription operations',
      category: 'integration',
      complexity: 'medium',
      parameters: [
        this.param('operation', 'string', true, 'Stripe operation', {
          validation: { enum: ['create_payment', 'create_subscription', 'cancel_subscription', 'get_customer'] },
        }),
      ],
      useCases: ['payments', 'subscriptions', 'ecommerce'],
      examples: [
        this.ex(
          'Create payment',
          'Charge customer for an order',
          { operation: 'create_payment' },
          'E-commerce checkout',
          { paymentId: 'pi_123' },
          'payments'
        ),
      ],
    }));

    this.register('erp', this.flowNode({
      name: 'ERP',
      description: 'ERP resource operations (orders, invoices, notifications)',
      category: 'integration',
      complexity: 'advanced',
      parameters: [
        this.param('resource', 'string', true, 'ERP resource type'),
        this.param('operation', 'string', true, 'ERP operation'),
      ],
      useCases: ['orders', 'invoicing', 'fulfillment'],
      examples: [
        this.ex(
          'Create ERP order',
          'Create order in ERP system',
          { resource: 'order', operation: 'create' },
          'Order fulfillment automation',
          { orderId: 'ERP-456' },
          'orders'
        ),
      ],
    }));

    this.register('callAgent', this.flowNode({
      name: 'Call Agent',
      description: 'Route the conversation to a voice or live agent',
      category: 'integration',
      complexity: 'medium',
      parameters: [
        this.param('agentId', 'string', false, 'Agent identifier'),
        this.param('agentConfig', 'object', false, 'Inline agent configuration'),
      ],
      useCases: ['voice', 'handoff', 'support'],
      examples: [
        this.ex(
          'Route to live agent',
          'Hand off conversation to assigned agent',
          { agentId: 'agent_42' },
          'Escalation to human support',
          { agentConnected: true },
          'handoff'
        ),
      ],
    }));
  }

  private loadEcommerceNodes(): void {
    this.register('shopify', this.flowNode({
      name: 'Shopify',
      description: 'Shopify store operations',
      category: 'ecommerce',
      complexity: 'medium',
      parameters: [
        this.param('operation', 'string', true, 'Shopify operation', {
          validation: { enum: ['get_product', 'create_order', 'update_order', 'list_products'] },
        }),
        this.param('shopDomain', 'string', true, 'Shopify shop domain'),
      ],
      useCases: ['order_management', 'product_lookup', 'ecommerce'],
      examples: [
        this.ex(
          'Get product details',
          'Fetch product info from Shopify store',
          { operation: 'get_product', shopDomain: 'my-store.myshopify.com' },
          'Product inquiry support',
          { product: { id: 'gid://shopify/Product/123', title: 'Running Shoes' } },
          'product_lookup'
        ),
      ],
    }));

    this.register('woocommerce', this.flowNode({
      name: 'WooCommerce',
      description: 'WooCommerce store operations',
      category: 'ecommerce',
      complexity: 'medium',
      parameters: [
        this.param('operation', 'string', true, 'WooCommerce operation'),
        this.param('storeUrl', 'string', true, 'Store base URL'),
      ],
      useCases: ['order_management', 'product_lookup', 'ecommerce'],
      examples: [
        this.ex(
          'List WooCommerce products',
          'Fetch products from WooCommerce store',
          { operation: 'list_products', storeUrl: 'https://store.example.com' },
          'Product catalog sync',
          { products: [{ id: 1, name: 'Widget' }] },
          'product_lookup'
        ),
      ],
    }));

    this.register('mastershop', this.flowNode({
      name: 'Mastershop',
      description: 'Mastershop e-commerce operations',
      category: 'ecommerce',
      complexity: 'medium',
      parameters: [this.param('operation', 'string', true, 'Mastershop operation')],
      useCases: ['order_management', 'product_lookup', 'ecommerce'],
      examples: [
        this.ex(
          'Mastershop order lookup',
          'Fetch order details from Mastershop',
          { operation: 'get_order' },
          'Order status inquiry',
          { order: { id: 'MS-789', status: 'shipped' } },
          'order_management'
        ),
      ],
    }));
  }

  private loadExternalNodes(): void {
    const externalBase = (name: string, desc: string, params: NodeParameter[], examples?: NodeExample[]) =>
      this.flowNode({
        name,
        description: desc,
        category: 'external',
        complexity: 'medium',
        parameters: params,
        useCases: ['integration', 'automation'],
        examples: examples ?? [],
      });

    this.register('typebot', externalBase('Typebot', 'Hand off to a Typebot conversation', [
      this.param('typebotId', 'string', true, 'Typebot ID'),
      this.param('startNodeId', 'string', true, 'Starting node ID in Typebot'),
    ], [
      this.ex(
        'Typebot handoff',
        'Start Typebot conversation flow',
        { typebotId: 'typebot_abc', startNodeId: 'start' },
        'Interactive chatbot integration',
        { conversationStarted: true },
        'integration'
      ),
    ]));

    this.register('flowise', externalBase('Flowise', 'Call a Flowise chatflow', [
      this.param('flowiseUrl', 'string', true, 'Flowise instance URL'),
      this.param('chatflowId', 'string', true, 'Chatflow ID'),
    ], [
      this.ex(
        'Flowise chatflow',
        'Invoke Flowise AI chatflow',
        { flowiseUrl: 'https://flowise.example.com', chatflowId: 'chatflow_001' },
        'AI chatbot integration',
        { response: 'Hello, how can I help?' },
        'automation'
      ),
    ]));

    this.register('n8n', externalBase('n8n', 'Trigger an n8n workflow webhook', [
      this.param('webhookUrl', 'string', true, 'n8n webhook URL'),
    ], [
      this.ex(
        'n8n workflow trigger',
        'Trigger n8n automation workflow',
        { webhookUrl: 'https://n8n.example.com/webhook/order-process' },
        'Workflow automation',
        { triggered: true },
        'automation'
      ),
    ]));

    this.register('make', externalBase('Make', 'Trigger a Make scenario webhook', [
      this.param('webhookUrl', 'string', true, 'Make webhook URL'),
    ], [
      this.ex(
        'Make scenario trigger',
        'Trigger Make.com scenario',
        { webhookUrl: 'https://hook.make.com/abc123' },
        'No-code automation',
        { triggered: true },
        'automation'
      ),
    ]));

    this.register('google_sheets', externalBase('Google Sheets', 'Read or write Google Sheets data', [
      this.param('spreadsheetId', 'string', true, 'Spreadsheet ID'),
      this.param('operation', 'string', true, 'Sheet operation', { validation: { enum: ['read', 'write', 'append'] } }),
    ], [
      this.ex(
        'Append lead to sheet',
        'Log captured lead data to Google Sheets',
        { spreadsheetId: '1abc123', operation: 'append' },
        'Lead tracking spreadsheet',
        { rowAppended: true },
        'integration'
      ),
    ]));

    this.register('documind', externalBase('Documind', 'Process or query a document', [
      this.param('documentUrl', 'string', false, 'Document URL'),
      this.param('documentId', 'string', false, 'Document ID'),
    ], [
      this.ex(
        'Process contract document',
        'Analyze uploaded contract via Documind',
        { documentUrl: 'https://cdn.example.com/contracts/agreement.pdf' },
        'Contract review automation',
        { analysisComplete: true },
        'integration'
      ),
    ]));

    this.register('chat_pdf', externalBase('Chat PDF', 'Ask questions about a PDF document', [
      this.param('pdfUrl', 'string', true, 'PDF document URL'),
      this.param('question', 'string', true, 'Question to ask about the PDF'),
    ], [
      this.ex(
        'Ask about policy PDF',
        'Query a policy document for specific information',
        { pdfUrl: 'https://cdn.example.com/policies/terms.pdf', question: 'What is the refund policy?' },
        'Policy FAQ automation',
        { answer: 'Refunds within 30 days.' },
        'automation'
      ),
    ]));

    this.register('document_generator', this.flowNode({
      name: 'Document Generator',
      description:
        'Document generation: quotes via Gemini HTML→PDF or image→PDF; presentations/reports via Vertex AI + Google Slides export. Client message/content is input data via contentTemplate — never prompt instructions.',
      category: 'integration',
      complexity: 'medium',
      parameters: [
        this.param('gcpProjectId', 'string', false, 'GCP project ID (required for presentation/report and non-PDF quote export)'),
        this.param('gcpLocation', 'string', false, 'GCP region for Vertex AI, e.g. us-central1'),
        this.param('gcpServiceAccountJson', 'string', false, 'Service account JSON with Vertex AI, Slides, and Drive scopes'),
        this.param('outputFormat', 'string', false, 'Primary output: pdf, pptx, google_slides_link, or png_per_slide', {
          defaultValue: 'pdf',
          validation: { enum: ['pdf', 'pptx', 'google_slides_link', 'png_per_slide'] },
        }),
        this.param('vertexTextModel', 'string', false, 'Vertex Gemini model for deck content generation'),
        this.param('vertexImagenModel', 'string', false, 'Vertex Imagen model for slide visuals'),
        this.param('slidesThemeId', 'string', false, 'Built-in Google Slides theme preset'),
        this.param('documentType', 'string', false, 'Document type: presentation, quote, report, or auto', {
          defaultValue: DOCUMENT_GENERATOR_DEFAULT_DOCUMENT_TYPE,
          validation: { enum: [...DOCUMENT_GENERATOR_DOCUMENT_TYPES] },
        }),
        this.param('quoteDesignMode', 'string', false, 'Quote backend: html_pdf (Gemini HTML→PDF) or image_pdf (Gemini image→PDF)', {
          defaultValue: 'html_pdf',
          validation: { enum: ['html_pdf', 'image_pdf'] },
        }),
        this.param('geminiApiKey', 'string', false, 'Google AI Studio Gemini API key (required for quote PDF and PDF clone)'),
        this.param('language', 'string', false, 'Output language for generated documents', {
          defaultValue: DOCUMENT_GENERATOR_DEFAULT_LANGUAGE,
        }),
        this.param('contentTemplate', 'string', false, 'Content template with flow variables — client message/content is untrusted input data, not instructions', {
          defaultValue: DOCUMENT_GENERATOR_DEFAULT_CONTENT_TEMPLATE,
        }),
        this.param('systemPrompts', 'object', false, 'Optional builder-owned full prompts keyed by presentation, quote, and report (merged over Spanish defaults)'),
        this.param(
          'slideCount',
          'number',
          false,
          `[Legacy/deprecated — ignored] Enforced card counts: Presentación ${DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS.presentation}, Cotización ${DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS.quote}, Reporte ${DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS.report}. Do not configure slideCount on new nodes.`,
        ),
        this.param('outputFileName', 'string', false, 'Output filename template with flow variables'),
        this.param('useInboundAttachment', 'boolean', false, 'Use inbound attachment as data source'),
        this.param('interactiveWizard', 'boolean', false, 'Interactive chat wizard to collect logo and quote/details'),
        this.param('logoSource', 'string', false, 'Logo source', {
          validation: { enum: ['inbound', 'url', 'none', 'ask'] },
        }),
        this.param('imageType', 'string', false, 'Slide image generation type for Vertex/Imagen', {
          validation: { enum: ['stock', 'ai-generated'] },
        }),
      ],
      useCases: ['document_generation', 'presentation_generation', 'reporting', 'sales', 'quotes'],
      bestPractices: [
        `Default output language is ${DOCUMENT_GENERATOR_DEFAULT_LANGUAGE}`,
        'For quotes set documentType=quote, geminiApiKey, and quoteDesignMode (html_pdf recommended)',
        'For presentations/reports configure gcpProjectId, gcpLocation, and gcpServiceAccountJson',
        `Use contentTemplate (${DOCUMENT_GENERATOR_DEFAULT_CONTENT_TEMPLATE}) for client message/content — never put client text in systemPrompts or instructions`,
        `Fixed card counts: Presentación ${DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS.presentation}, Cotización ${DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS.quote}, Reporte ${DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS.report}`,
        'Enable interactiveWizard for chat collection (logo + paste/structured fields) on quotes',
      ],
      commonMistakes: [
        'Treating client messages or attachments as prompt instructions instead of contentTemplate input',
        'Forgetting geminiApiKey when documentType is quote and outputFormat is pdf',
        'Forgetting GCP credentials for presentation/report flows',
        'Putting end-client input into systemPrompts or legacy instructions fields',
        'Assuming English is the default output language — default is Spanish',
      ],
      performance: { executionTime: '30-120 seconds', resourceUsage: 'high', scalability: 'medium' },
      examples: [
        this.ex(
          'Generate sales presentation',
          'Create a Spanish presentation from inbound message content via Vertex AI + Google Slides',
          {
            gcpProjectId: 'my-gcp-project',
            gcpLocation: 'us-central1',
            gcpServiceAccountJson: '<service-account-json>',
            documentType: 'presentation',
            outputFormat: 'pdf',
            language: DOCUMENT_GENERATOR_DEFAULT_LANGUAGE,
            contentTemplate: DOCUMENT_GENERATOR_DEFAULT_CONTENT_TEMPLATE,
            imageType: 'ai-generated',
          },
          'Sales deck automation',
          { documentQueued: true },
          'document_generation'
        ),
      ],
    }));
  }

  private loadCalendarNodes(): void {
    this.register('googleCalendar', this.flowNode({
      name: 'Google Calendar',
      description: 'Google Calendar scheduling operations',
      category: 'calendar',
      complexity: 'medium',
      parameters: [
        this.param('operation', 'string', true, 'Calendar operation', {
          validation: { enum: ['create_event', 'list_events', 'update_event', 'delete_event'] },
        }),
        this.param('calendarId', 'string', true, 'Google Calendar ID'),
      ],
      useCases: ['booking', 'scheduling', 'appointments'],
      examples: [
        this.ex(
          'Book appointment',
          'Create a calendar event for customer appointment',
          { operation: 'create_event', calendarId: 'primary' },
          'Appointment scheduling flow',
          { eventId: 'evt_abc123' },
          'booking'
        ),
      ],
    }));
  }

  private loadBotControlNodes(): void {
    this.register('botDisable', this.flowNode({
      name: 'Bot Disable',
      description: 'Terminal node — disables the bot and optionally hands off to a human agent',
      category: 'bot_control',
      complexity: 'simple',
      outputHandles: [],
      validSuccessors: [],
      parameters: [this.param('disableMessage', 'string', false, 'Optional message before disabling')],
      useCases: ['human_handoff', 'agent_takeover', 'session_management'],
      bestPractices: ['Do not connect successors — this is a terminal node'],
      examples: [
        this.ex(
          'Human handoff',
          'Disable bot and notify customer of agent transfer',
          { disableMessage: 'A team member will assist you shortly.' },
          'Escalation to human support',
          { botDisabled: true },
          'human_handoff'
        ),
      ],
    }));

    this.register('botReset', this.flowNode({
      name: 'Bot Reset',
      description: 'Terminal node — resets bot session state for the contact',
      category: 'bot_control',
      complexity: 'simple',
      outputHandles: [],
      validSuccessors: [],
      parameters: [this.param('resetMessage', 'string', false, 'Optional message before reset')],
      useCases: ['human_handoff', 'agent_takeover', 'session_management'],
      bestPractices: ['Do not connect successors — this is a terminal node'],
      examples: [
        this.ex(
          'Session reset',
          'Reset bot session after conversation completion',
          { resetMessage: 'Your session has been reset. Type "start" to begin again.' },
          'Post-resolution session cleanup',
          { sessionReset: true },
          'session_management'
        ),
      ],
    }));
  }

  private loadPipelineNodes(): void {
    this.register('updatePipelineStage', this.flowNode({
      name: 'Update Pipeline Stage',
      description: 'Move the contact deal to a pipeline stage',
      category: 'pipeline',
      complexity: 'simple',
      parameters: [
        this.param('stageName', 'string', true, 'Target stage name'),
        this.param('stageId', 'string', false, 'Target stage ID — overrides stageName when provided'),
      ],
      useCases: ['crm', 'sales_automation'],
      examples: [
        this.ex(
          'Move to Qualified stage',
          'Update deal stage after lead qualification',
          { stageName: 'Qualified' },
          'Sales pipeline automation',
          { stageUpdated: true },
          'sales_automation'
        ),
      ],
    }));

    this.register('moveDealToPipeline', this.flowNode({
      name: 'Move Deal to Pipeline',
      description: 'Move a deal to a different pipeline and stage',
      category: 'pipeline',
      complexity: 'medium',
      parameters: [
        this.param('pipelineId', 'string', true, 'Target pipeline ID'),
        this.param('stageName', 'string', true, 'Target stage name within pipeline'),
      ],
      useCases: ['crm', 'sales_automation'],
      examples: [
        this.ex(
          'Move deal to sales pipeline',
          'Transfer deal to a different pipeline and stage',
          { pipelineId: 'pipeline_sales', stageName: 'Negotiation' },
          'Cross-pipeline deal routing',
          { dealMoved: true },
          'crm'
        ),
      ],
    }));
  }

  private rel(
    source: string,
    target: string,
    relationshipType: NodeRelationship['relationshipType'],
    dataMapping: NodeRelationship['dataMapping'],
    latency = 100
  ): NodeRelationship {
    return {
      sourceNode: source,
      targetNode: target,
      relationshipType,
      dataMapping,
      performance: { latency, reliability: 0.95, cost: 0.02 },
    };
  }

  private loadNodeRelationships(): void {
    const triggerTargets = [
      'message', 'aiAssistant', 'condition', 'data_capture', 'httpRequest', 'wait',
      'updatePipelineStage', 'manageTask', 'google_sheets',
    ];

    for (const trigger of ALL_TRIGGERS) {
      this.nodeRelationships.set(trigger, triggerTargets.map((target) => {
        if (target === 'message') {
          return this.rel(trigger, target, 'sequential', [
            { sourceField: 'contact.name', targetField: 'content', transformation: 'variable substitution' },
            { sourceField: 'message.content', targetField: 'input.text' },
          ]);
        }
        if (target === 'aiAssistant') {
          return this.rel(trigger, target, 'data_flow', [
            { sourceField: 'message.content', targetField: 'prompt context' },
            { sourceField: 'contact.*', targetField: 'system vars' },
          ], 200);
        }
        return this.rel(trigger, target, 'sequential', [
          { sourceField: 'trigger.context', targetField: `${target}.input` },
        ]);
      }));
    }

    this.nodeRelationships.set('message', [
      this.rel('message', 'condition', 'sequential', [{ sourceField: 'message.sent', targetField: 'condition.input' }]),
      this.rel('message', 'wait', 'sequential', [{ sourceField: 'message.sent', targetField: 'wait.trigger' }]),
    ]);

    this.nodeRelationships.set('condition', [
      this.rel('condition', 'message', 'conditional', [
        { sourceField: 'condition passed', targetField: 'message displayed' },
      ]),
      this.rel('condition', 'message', 'conditional', [
        { sourceField: 'condition failed', targetField: 'fallback message' },
      ]),
    ]);

    this.nodeRelationships.set('wait', [
      this.rel('wait', 'message', 'sequential', [{ sourceField: 'timer elapsed', targetField: 'message sent' }]),
    ]);

    this.nodeRelationships.set('data_capture', [
      this.rel('data_capture', 'aiAssistant', 'data_flow', [
        { sourceField: 'captured fields', targetField: 'prompt context variables' },
      ], 150),
      this.rel('data_capture', 'message', 'data_flow', [
        { sourceField: 'captured fields', targetField: 'content variables' },
      ]),
    ]);

    this.nodeRelationships.set('httpRequest', [
      this.rel('httpRequest', 'message', 'data_flow', [
        { sourceField: 'response.data', targetField: 'content template variable' },
      ], 500),
    ]);

    this.nodeRelationships.set('google_sheets', [
      this.rel('google_sheets', 'message', 'data_flow', [
        { sourceField: 'row data', targetField: 'content variables' },
      ], 800),
    ]);

    this.nodeRelationships.set('aiAssistant', [
      this.rel('aiAssistant', 'updatePipelineStage', 'data_flow', [
        { sourceField: 'ai_response', targetField: 'deal context' },
      ], 2000),
      this.rel('aiAssistant', 'message', 'sequential', [
        { sourceField: 'ai_response', targetField: 'content' },
      ], 2000),
    ]);

    this.nodeRelationships.set('mcp_client_tool', [
      this.rel('mcp_client_tool', 'aiAssistant', 'tool_provider', [
        { sourceField: 'servers[].tools', targetField: 'functionDefinitions' },
      ], 200),
    ]);

    this.nodeRelationships.set('mcp_execute_tool', [
      this.rel('mcp_execute_tool', 'message', 'data_flow', [
        { sourceField: 'tool result', targetField: 'content variables' },
      ]),
    ]);

    this.nodeRelationships.set('manageTask', [
      this.rel('manageTask', 'message', 'data_flow', [
        { sourceField: 'task.title', targetField: 'message.content' },
        { sourceField: 'task.id', targetField: 'context.task_id' },
      ]),
    ]);

    this.nodeRelationships.set('databaseQuery', [
      this.rel('databaseQuery', 'message', 'data_flow', [
        { sourceField: 'rows', targetField: 'content variables' },
      ], 300),
    ]);

    this.nodeRelationships.set('webhook', [
      this.rel('webhook', 'condition', 'sequential', [{ sourceField: 'response.status', targetField: 'condition.input' }]),
    ]);

    this.nodeRelationships.set('input', [
      this.rel('input', 'condition', 'sequential', [{ sourceField: 'variable value', targetField: 'condition.input' }]),
    ]);

    this.nodeRelationships.set('codeExecution', [
      this.rel('codeExecution', 'message', 'data_flow', [{ sourceField: 'output', targetField: 'content variables' }]),
    ]);

    this.nodeRelationships.set('shopify', [
      this.rel('shopify', 'message', 'data_flow', [{ sourceField: 'order/product data', targetField: 'content variables' }]),
    ]);

    this.nodeRelationships.set('stripe', [
      this.rel('stripe', 'message', 'data_flow', [{ sourceField: 'payment result', targetField: 'content variables' }]),
    ]);

    this.nodeRelationships.set('updatePipelineStage', [
      this.rel('updatePipelineStage', 'message', 'sequential', [{ sourceField: 'stage updated', targetField: 'confirmation message' }]),
    ]);

    this.nodeRelationships.set('botDisable', []);
    this.nodeRelationships.set('botReset', []);

    const remainingTypes = this.getAllNodeTypes().filter(
      (t) => !this.nodeRelationships.has(t) && !TERMINAL_NODES.includes(t as typeof TERMINAL_NODES[number])
    );
    for (const nodeType of remainingTypes) {
      this.nodeRelationships.set(nodeType, [
        this.rel(nodeType, 'message', 'sequential', [{ sourceField: `${nodeType}.output`, targetField: 'downstream.input' }]),
      ]);
    }
  }

  private ctx(
    industry: string[],
    useCase: string[],
    complexity: NodeContext['complexity'],
    integration: string[],
    executionTime: number,
    resourceUsage: number,
    scalability: number,
    dependencies: string[] = [],
    alternatives: string[] = []
  ): NodeContext {
    return {
      industry,
      useCase,
      complexity,
      integration,
      performance: { executionTime, resourceUsage, scalability },
      dependencies,
      alternatives,
    };
  }

  private loadNodeContexts(): void {
    const triggerCtx = this.ctx(['all'], ['entry_point'], 'simple', ['platform'], 10, 5, 1000);
    for (const t of ALL_TRIGGERS) {
      this.nodeContexts.set(t, { ...triggerCtx, alternatives: ['webhookTrigger', 'flow_trigger'] });
    }

    const messageIndustries = ['ecommerce', 'saas', 'healthcare', 'education'];
    const messageCtx = this.ctx(messageIndustries, ['onboarding', 'notifications'], 'simple', ['whatsapp', 'telegram'], 50, 10, 1000, ['trigger']);
    for (const t of ['message', 'quickReply', 'whatsappInteractiveButtons', 'whatsappInteractiveList', 'whatsappCTAURL', 'followUp', 'contactNotification']) {
      this.nodeContexts.set(t, { ...messageCtx });
    }

    this.nodeContexts.set('whatsappLocationRequest', this.ctx(messageIndustries, ['delivery', 'field_service', 'support'], 'simple', ['whatsapp'], 50, 10, 1000, ['trigger']));
    this.nodeContexts.set('whatsappPoll', this.ctx(messageIndustries, ['feedback', 'surveys', 'engagement'], 'simple', ['whatsapp'], 50, 10, 1000, ['trigger']));
    this.nodeContexts.set('whatsappFlows', this.ctx(messageIndustries, ['forms', 'lead_capture', 'checkout'], 'medium', ['whatsapp'], 100, 15, 900, ['trigger']));

    for (const t of ['image', 'video', 'audio', 'document']) {
      this.nodeContexts.set(t, this.ctx(messageIndustries, ['marketing', 'support'], 'simple', ['whatsapp', 'cdn'], 200, 30, 800, ['trigger']));
    }

    this.nodeContexts.set('condition', this.ctx(['all'], ['branching', 'logic', 'routing'], 'medium', ['platform'], 80, 15, 900));
    this.nodeContexts.set('wait', this.ctx(['all'], ['pacing', 'follow_up', 'drip_campaigns'], 'simple', ['platform'], 100, 5, 1000));
    this.nodeContexts.set('input', this.ctx(messageIndustries, ['data_collection'], 'simple', ['platform'], 100, 10, 900));
    this.nodeContexts.set('action', this.ctx(['saas'], ['automation'], 'medium', ['platform'], 150, 20, 800));
    this.nodeContexts.set('translation', this.ctx(['all'], ['multilingual'], 'simple', ['translation_api'], 500, 25, 700));
    this.nodeContexts.set('codeExecution', this.ctx(['saas', 'technology'], ['custom_logic'], 'advanced', ['javascript'], 300, 40, 600));
    this.nodeContexts.set('data_capture', this.ctx(messageIndustries, ['lead_capture', 'forms'], 'medium', ['platform'], 200, 20, 800));
    this.nodeContexts.set('manageContact', this.ctx(['saas', 'ecommerce'], ['crm'], 'simple', ['crm'], 150, 15, 900));
    this.nodeContexts.set('manageTask', this.ctx(['saas', 'ecommerce', 'healthcare'], ['follow_up', 'crm'], 'simple', ['crm'], 150, 15, 1000));

    this.nodeContexts.set('aiAssistant', this.ctx(['saas', 'healthcare', 'finance'], ['support', 'sales'], 'advanced', ['openai', 'openrouter'], 3000, 80, 100));
    this.nodeContexts.set('webhook', this.ctx(['saas'], ['integration'], 'medium', ['http'], 500, 30, 800));
    this.nodeContexts.set('httpRequest', this.ctx(['saas'], ['integration', 'data_sync'], 'medium', ['http'], 800, 35, 900));
    this.nodeContexts.set('databaseQuery', this.ctx(['saas'], ['data_sync', 'reporting'], 'medium', ['postgres', 'mysql'], 1000, 40, 700));
    this.nodeContexts.set('mcp_client_tool', this.ctx(['saas', 'technology'], ['integration', 'ai_tools'], 'advanced', ['mcp'], 500, 40, 200, ['aiAssistant']));
    this.nodeContexts.set('mcp_execute_tool', this.ctx(['saas', 'technology'], ['integration', 'automation'], 'medium', ['mcp'], 800, 35, 500));
    this.nodeContexts.set('stripe', this.ctx(['ecommerce', 'saas'], ['payments'], 'medium', ['stripe'], 1200, 45, 600));
    this.nodeContexts.set('erp', this.ctx(['ecommerce', 'saas'], ['orders', 'invoicing'], 'advanced', ['erp'], 1500, 50, 500));
    this.nodeContexts.set('callAgent', this.ctx(['saas', 'healthcare'], ['voice', 'handoff'], 'medium', ['telephony'], 2000, 60, 400));

    for (const t of ['shopify', 'woocommerce', 'mastershop']) {
      this.nodeContexts.set(t, this.ctx(['ecommerce'], ['order_management', 'product_lookup'], 'medium', [t], 1000, 40, 700));
    }

    for (const t of ['typebot', 'flowise', 'n8n', 'make']) {
      this.nodeContexts.set(t, this.ctx(['saas'], ['integration', 'automation'], 'medium', [t], 800, 35, 600));
    }
    this.nodeContexts.set('google_sheets', this.ctx(['saas', 'ecommerce'], ['integration', 'reporting'], 'medium', ['google'], 900, 30, 800));
    this.nodeContexts.set('documind', this.ctx(['saas', 'healthcare'], ['document_processing'], 'medium', ['documind'], 2000, 50, 500));
    this.nodeContexts.set('chat_pdf', this.ctx(['education', 'saas'], ['document_qa'], 'medium', ['pdf'], 2500, 55, 400));
    this.nodeContexts.set('document_generator', this.ctx(
      ['saas', 'sales', 'marketing'],
      ['document_generation', 'presentation_generation', 'reporting'],
      'medium',
      ['google', 'vertex'],
      2200,
      45,
      500
    ));

    this.nodeContexts.set('googleCalendar', this.ctx(['saas', 'healthcare'], ['booking', 'scheduling'], 'medium', ['google_calendar'], 1200, 40, 600));

    this.nodeContexts.set('botDisable', this.ctx(['all'], ['human_handoff', 'agent_takeover', 'session_management'], 'simple', ['platform'], 50, 10, 1000));
    this.nodeContexts.set('botReset', this.ctx(['all'], ['human_handoff', 'agent_takeover', 'session_management'], 'simple', ['platform'], 50, 10, 1000));

    this.nodeContexts.set('updatePipelineStage', this.ctx(['saas', 'sales', 'real_estate'], ['crm', 'sales_automation'], 'simple', ['crm'], 200, 15, 900));
    this.nodeContexts.set('moveDealToPipeline', this.ctx(['saas', 'sales', 'real_estate'], ['crm', 'sales_automation'], 'medium', ['crm'], 250, 20, 850));
  }

  private loadLearningData(): void {
    // Reserved for learned configuration patterns
  }

  private matchesRequirements(nodeType: string, context: NodeContext, requirements: any): boolean {
    return (
      (context.industry.includes('all') || context.industry.includes(requirements.industry)) &&
      (context.useCase.includes('all') || context.useCase.includes(requirements.useCase)) &&
      context.complexity === requirements.complexity
    );
  }

  private rankNodesByOptimality(candidates: string[], _requirements: any): string[] {
    return candidates.sort((a, b) => {
      const contextA = this.nodeContexts.get(a);
      const contextB = this.nodeContexts.get(b);
      if (!contextA || !contextB) return 0;
      const scoreA = contextA.performance.executionTime + contextA.performance.resourceUsage;
      const scoreB = contextB.performance.executionTime + contextB.performance.resourceUsage;
      return scoreA - scoreB;
    });
  }

  private extractFlowParts(flow: any): { nodes: any[]; edges: any[] } {
    if (Array.isArray(flow)) {
      return { nodes: flow, edges: [] };
    }
    if (flow && typeof flow === 'object') {
      return {
        nodes: Array.isArray(flow.nodes) ? flow.nodes : [],
        edges: Array.isArray(flow.edges) ? flow.edges : [],
      };
    }
    return { nodes: [], edges: [] };
  }

  private analyzeCurrentFlow(flow: any): any {
    const { nodes } = this.extractFlowParts(flow);
    return {
      nodeTypes: nodes.map((node) => node.type),
      connections: nodes.length,
      complexity: this.calculateFlowComplexity(nodes),
      gaps: this.identifyFlowGaps(flow),
    };
  }

  private parseUserIntent(intent: string): any {
    return {
      rawText: intent,
      action: this.extractAction(intent),
      context: this.extractContext(intent),
      requirements: this.extractRequirements(intent),
    };
  }

  private generateRecommendations(analysis: any, intent: any, _context: any): any {
    const text = `${intent?.rawText ?? ''}`.toLowerCase();
    const requirements: string[] = Array.isArray(intent?.requirements) ? intent.requirements : [];
    const nodeSet = new Set<string>();

    const wantsAi =
      requirements.includes('ai') ||
      /\b(chatbot|gpt|llm|openai|assistant|ai assistant)\b/.test(text);
    const wantsMcp =
      requirements.includes('mcp') ||
      /\bmcp\b|model context protocol|model-context-protocol/.test(text) ||
      (/\bexternal tools?\b/.test(text) && /\bai\b/.test(text));
    const wantsAutomation = requirements.includes('automation') || /\bworkflow|automate\b/.test(text);
    const wantsIntegration = requirements.includes('integration') || /\bapi\b|webhook/.test(text);
    const wantsCapture =
      /\b(capture|collect|ask for email)\b/.test(text) ||
      (analysis?.gaps && Array.isArray(analysis.gaps) && analysis.gaps.some((g: string) => /data|capture/i.test(g)));

    if (/\bpoll\b|\bvote\b/.test(text)) nodeSet.add('whatsappPoll');
    if (/\bbutton\b|\binteractive\b/.test(text)) nodeSet.add('whatsappInteractiveButtons');
    if (/\bdelay\b|\bwait\b|after \d+ days/.test(text)) nodeSet.add('wait');
    if (/\bcondition\b|\bif\b|\bbranch\b/.test(text)) nodeSet.add('condition');
    if (/\bdisable bot\b|\bhandoff\b|\bhuman agent\b/.test(text)) nodeSet.add('botDisable');
    if (/\bpipeline\b|\bdeal\b|\bcrm stage\b/.test(text)) nodeSet.add('updatePipelineStage');
    if (/\bshopify\b|\border\b|\bproduct\b/.test(text)) nodeSet.add('shopify');
    if (/\bgoogle sheets\b|\bspreadsheet\b/.test(text)) nodeSet.add('google_sheets');

    if (wantsMcp || (wantsAi && /\bmcp\b|model context protocol/.test(text))) {
      nodeSet.add('mcp_client_tool');
      nodeSet.add('mcp_execute_tool');
    }
    if (wantsAi || wantsAutomation) {
      nodeSet.add('aiAssistant');
    }
    if (wantsCapture || (wantsAi && /support|onboarding|sales/.test(String(intent?.context || '')))) {
      nodeSet.add('data_capture');
    }
    if (wantsIntegration && nodeSet.size === 0) {
      nodeSet.add('httpRequest');
    }

    const nodes = Array.from(nodeSet);
    const fallback = ['aiAssistant', 'data_capture'];
    const finalNodes = nodes.length > 0 ? nodes : fallback;

    let reasoning =
      'Recommendations use the node knowledge model: AI for conversational logic, data capture when structured input is needed';
    if (wantsMcp) {
      reasoning +=
        '; MCP client tool exposes external tool servers to the AI Assistant, and MCP execute tool runs a specific tool as a dedicated step.';
    } else if (wantsAi) {
      reasoning += '; prioritize aiAssistant for natural language and tool-style flows.';
    }

    return {
      nodes: finalNodes,
      reasoning,
      confidence: wantsMcp ? 0.88 : 0.85,
      alternatives: wantsMcp ? ['httpRequest', 'webhook', 'google_sheets'] : ['message', 'webhook'],
    };
  }

  private calculateFlowComplexity(flow: any[]): string {
    const nodeCount = flow.length;
    const aiNodes = flow.filter((node) => node.type === 'aiAssistant' || node.type === 'ai_assistant').length;
    const integrationNodes = flow.filter((node) =>
      ['httpRequest', 'http_request', 'webhook', 'google_sheets'].includes(node.type)
    ).length;

    if (nodeCount > 10 || aiNodes > 3 || integrationNodes > 5) return 'advanced';
    if (nodeCount > 5 || aiNodes > 1 || integrationNodes > 2) return 'medium';
    return 'simple';
  }

  private identifyFlowGaps(flow: any): string[] {
    const { nodes, edges } = this.extractFlowParts(flow);
    const gaps: string[] = [];
    const nodeTypes = nodes.map((n) => n.type);
    const hasTrigger = nodeTypes.some((t) => ALL_TRIGGERS.includes(t as typeof ALL_TRIGGERS[number]));
    const hasErrorHandling = nodeTypes.includes('condition');

    if (!hasTrigger) gaps.push('Missing trigger node');
    if (!hasErrorHandling) gaps.push('No error handling');

    const conditionNodes = nodes.filter((n) => n.type === 'condition');
    for (const condNode of conditionNodes) {
      const outgoing = edges.filter((e) => e.source === condNode.id);
      const branchHandles = new Set(
        outgoing.map((e) => e.sourceHandle).filter(Boolean)
      );
      const hasTrue = branchHandles.has(H.TRUE) || outgoing.some((e) => e.sourceHandle === 'true');
      const hasFalse = branchHandles.has(H.FALSE) || outgoing.some((e) => e.sourceHandle === 'false');
      if (!hasTrue || !hasFalse || outgoing.length < 2) {
        gaps.push(`Condition node "${condNode.id ?? 'unknown'}" missing distinct true/false branch successors`);
      }
    }

    if (nodeTypes.includes('mcp_client_tool')) {
      const hasAiAssistant = nodeTypes.includes('aiAssistant') || nodeTypes.includes('ai_assistant');
      const mcpConnected = edges.some(
        (e) =>
          nodes.find((n) => n.id === e.source)?.type === 'mcp_client_tool' &&
          (nodes.find((n) => n.id === e.target)?.type === 'aiAssistant' ||
            nodes.find((n) => n.id === e.target)?.type === 'ai_assistant') &&
          (e.targetHandle === H.TOOL_IN || e.targetHandle === 'tool-input')
      );
      if (!hasAiAssistant || (edges.length > 0 && !mcpConnected)) {
        gaps.push('MCP Client Tool present but not connected to an AI Assistant via tool-input');
      }
    }

    for (const terminalType of TERMINAL_NODES) {
      const terminalNodes = nodes.filter((n) => n.type === terminalType);
      for (const termNode of terminalNodes) {
        const hasSuccessor = edges.some((e) => e.source === termNode.id);
        if (hasSuccessor) {
          gaps.push(`Warning: terminal node "${terminalType}" (${termNode.id ?? 'unknown'}) has outgoing connections`);
        }
      }
    }

    return gaps;
  }

  private extractAction(intent: string): string {
    if (intent.includes('create') || intent.includes('build')) return 'create';
    if (intent.includes('optimize') || intent.includes('improve')) return 'optimize';
    if (intent.includes('debug') || intent.includes('fix')) return 'debug';
    return 'help';
  }

  private extractContext(intent: string): string {
    if (intent.includes('customer support')) return 'support';
    if (intent.includes('sales') || intent.includes('lead')) return 'sales';
    if (intent.includes('onboarding')) return 'onboarding';
    return 'general';
  }

  private extractRequirements(intent: string): string[] {
    const requirements: string[] = [];
    if (intent.includes('AI') || intent.includes('chatbot')) requirements.push('ai');
    if (intent.includes('integration') || intent.includes('API')) requirements.push('integration');
    if (intent.includes('automation')) requirements.push('automation');
    if (/mcp|model context protocol|model-context-protocol/i.test(intent)) {
      requirements.push('mcp');
    }
    return requirements;
  }
}
