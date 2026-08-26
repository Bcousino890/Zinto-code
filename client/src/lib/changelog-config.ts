export interface ChangelogEntry {
  date: string;
  category: string;
  categoryColor: 'green' | 'red' | 'blue' | 'purple';
  title: string;
  description: string;
  /** Optional i18n keys; when set, the dialog translates title/description/category. */
  titleKey?: string;
  descriptionKey?: string;
  categoryKey?: string;
  learnMoreUrl?: string;
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    date: 'Aug 8, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Custom team roles',
    description:
      'Create your own roles (for example Supervisor or Billing) under Settings → Roles & Permissions. Each custom role has its own permission defaults. When you add or edit a team member, pick Administrator, Agent, or any custom role you created. Members on a custom role still follow Agent-level admin gates, but they inherit (or can customize) the permissions you set on that role. You cannot delete a custom role while people are still assigned to it—reassign them first.',
    titleKey: 'changelog.custom_team_roles.title',
    descriptionKey: 'changelog.custom_team_roles.description',
    categoryKey: 'changelog.category.new_feature',
  },
  {
    date: 'Jul 29, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'ERP Debit Notes and Credit Notes',
    description:
      'Full support for Debit and Credit Notes in the ERP invoicing module. Adjust invoice balances with a complete audit trail without modifying original documents. Automatically calculate net balances, view related adjustments in a new dedicated tab, and issue notes with pre-filled details directly from the invoice view.',
  },

  {
    date: 'Jul 23, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Dental Clinic ERP module',
    description:
      'ERP now supports Dental Clinic as a business type alongside Default and Restaurant. Manage patient records, appointments, and professional odontograms. Create multi-step treatment plans with estimates, generate quotations, record approvals, and issue invoices.',
  },
  {
    date: 'Jul 16, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Add multiple line items when creating quotations and sales orders',
    description:
      'When you create a new quotation or sales order, you can now stage several products and services before saving—no need to create the document first and add lines in edit mode. Pick each item, set quantity and price, use Add item to build the list, then create once with every line included. The create form also clears when you close the dialog.',
  },
  {
    date: 'Jul 14, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Send all ERP product photos in chat',
    description:
      'When a customer asks for a product photo, the AI Assistant can send every uploaded image for that product—not just the first—as native channel media. Telegram sends a photo album when there are multiple images; other channels send them one by one. Configure when images are sent, how many products get images on multi-match searches, a per-product image cap, and caption placement in the AI Assistant ERP Product images settings.',
  },
  {
    date: 'Jul 14, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'ERP product custom fields, min stock, and expiration',
    description:
      'Define company-specific product fields (text, long text, number, date, dropdown, or checkbox) under ERP Settings and fill them on each product. Products also support a minimum stock level with low-stock badges and filters, plus an expiration date. Min stock, expiration, and custom fields can be mapped when importing products from CSV.',
  },
  {
    date: 'Jul 12, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Generate Code Execution scripts with AI',
    description:
      'In the Code Execution node, open Generate with AI to describe the sandbox script you need—or ask to fix and refactor the code already in the editor. Chat with your chosen provider and model, use company/system/manual credentials for that session, then insert the result with Replace or Append. Current editor contents are sent as context so the model can improve what you already wrote.',
  },
  {
    date: 'Jul 12, 2026',
    category: 'Improvements',
    categoryColor: 'green',
    title: 'More reliable Code Execution sandbox and editor',
    description:
      'Code Execution runs more reliably in the secure sandbox (async/await, fetch, and variables). The editor is larger, timeout sits under the code field, you can copy {{code_execution_output}} in one click, and templates plus full English/Spanish help docs make scripting in flows easier.',
  },
  {
    date: 'Jun 10, 2026',
    category: 'Improvements',
    categoryColor: 'green',
    title: 'Create or update deals from Contacts',
    description:
      'Use the new deal action on a contact to quickly add a deal or open the contact\'s latest active deal. The deal form can now pick a pipeline, prefill the selected contact, prevent duplicate active deals in the same pipeline, and reopen the saved deal details after changes.',
  },
  {
    date: 'Jun 5, 2026',
    category: 'Integrations',
    categoryColor: 'blue',
    title: 'Master Shop automation in Flow Builder',
    description:
      'Build Master Shop workflows directly in Flow Builder. New nodes can search products, create orders, look up and filter orders, check return tracking, review wallet movements, validate customer phone numbers, and start flows from Master Shop order webhook events.',
  },
  {
    date: 'May 16, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Send price quotes from sales orders',
    description:
      'Turn a sales order into a polished quote you can send to the customer with a few clicks. Prices and currency labels now line up the same way on quotes, invoices, purchase orders, and supplier pages so nothing looks mismatched. You can also decide how customers are notified about quotations from your business settings.',
  },
  {
    date: 'May 15, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'AI writing assist in the inbox',
    description:
      'Improve drafts before you send: open the sparkles menu in the message composer to fix grammar, adjust tone, translate, continue writing, draft a reply from recent messages, or apply a custom instruction. Results stream into the text box and can be cancelled to restore your original draft.',
  },
  {
    date: 'May 13, 2026',
    category: 'Integrations',
    categoryColor: 'blue',
    title: 'Database node in Flow Builder',
    description:
      'New Database node under Integrations: query PostgreSQL or MySQL with parameterized SQL, test queries in the builder, and map rows and fields into flow variables for later steps.',
  },
  {
    date: 'Apr 30, 2026',
    category: 'Integrations',
    categoryColor: 'blue',
    title: 'ERP node in Flow Builder',
    description:
      'New ERP automation node under Integrations: drive sales orders, invoices, invoicing workflows (generate, send, record payment, cancel/void), and customer notifications from your flows.',
  },
  {
    date: 'Apr 20, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'ERP module (initial version)',
    description:
      'First release of the integrated ERP: products and inventory, sales and supplier orders, invoices, accounting, HR, payroll, reports, configuration, and (where enabled) restaurant tools such as floors, POS, kitchen, reservations, and delivery.',
  },
  
  {
    date: 'Apr 19, 2026',
    category: 'Improvements',
    categoryColor: 'green',
    title: 'Save flow: optional session reset and clearer canvas',
    description:
      'Saving a flow opens a short confirmation: save only (default) or save and clear all bot sessions so contacts start fresh. The flow canvas also fits every node in view when you open or load a flow.'
  },
  {
    date: 'Apr 19, 2026',
    category: 'Improvements',
    categoryColor: 'green',
    title: 'Contact notifications use the channel you pick',
    description:
      'The Contact Notification node can target a specific active CRM channel (e.g. WhatsApp, Telegram, Twilio SMS).'
  },
  {
    date: 'Apr 19, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Multiple media items in media nodes',
    description:
      'Image, video, audio, and document send nodes now support multiple items, keyword routing, and variable substitution. Each item can have its own URL, caption, and delay between sends.'
  },
  {
    date: 'Apr 16, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Manage Task node in the flow builder',
    description:
      'Add a Manage Task node under Flow Control to create, update, or delete tasks for the current contact from your automation. Configure title, description, priority, status, due date, assignee, and category; updates can target a task by variable and only change the fields you enable.'
  },
  {
    date: 'Apr 14, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Multi-select on the flow canvas (Ctrl or Command)',
    description:
      'Hold Control (Windows/Linux) or Command (macOS) and drag on empty canvas to draw a lasso selection box and select multiple nodes at once. Drag any selected node to move the whole group. Dragging without the key still pans the view as before.'
  },
  {
    date: 'Apr 14, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Collapsible node sidebar in the flow builder',
    description:
      'Collapse the node and variables panel to free up canvas space, then expand it again from the strip.'
  },
  {
    date: 'Apr 14, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Task groups in the AI Assistant node',
    description:
      'Organize AI Assistant tasks into groups with updated controls in the task configuration UI.'
  },

  {
    date: 'Mar 31, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Auto-pause bot replies after owner responses',
    description:
      'When an owner/agent replies to a contact, bot responses are automatically paused for that contact (default 3 minutes) to avoid interrupting human conversations. Configure this from Inbox Settings with a toggle (enabled by default) and a customizable pause duration.'
  },
  {
    date: 'Mar 31, 2026',
    category: 'Improvements',
    categoryColor: 'green',
    title: 'Flow builder text selection improvements',
    description:
      'Fixed node dragging while selecting text in flow-builder inputs and textareas, so editing prompts/messages is now smooth across nodes.'
  },
  {
    date: 'Mar 22, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Generate AI assistant system prompts in the flow builder',
    description:
      'In the AI Assistant node, use Generate with AI next to the system prompt to open a chat. Describe your business or refine instructions; the model drafts a prompt you can replace or append to the field. Responses use your selected provider and credentials.'
  },
  {
    date: 'Mar 21, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Deal stage notification',
    description:
      'When a deal moves to a new pipeline stage, a notification is sent about the status of that stage in the pipeline.'
  },
  {
    date: 'Mar 18, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Captured data management',
    description:
      'View and manage form submissions captured by Data Capture nodes in flows. A new Captured Data page in the sidebar lets you browse submissions. Data Capture nodes now support validation and form mode options.'
  },
  {
    date: 'Mar 15, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Agent calendar settings',
    description:
      'Calendar settings can be accessed from the Calendar page using the gear icon to set working hours and availability. In the flow builder, you can choose how calendars are assigned to agents. The calendar view also shows agent availability, and it supports syncing with Google, Zoho, and Calendly. Now each agent can manages their own calendar settings individually'
  },
  {
    date: 'Mar 12, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Trigger another flow from your main Flow',
    description:
      'Add a Trigger Flow node in the flow builder to call another flow from within your current flow. Connect the node to any step, pick the target flow from the dropdown, and execution will continue in the selected flow. Great for reusable sub-flows, handoffs, and modular automation.'
  },
  {
    date: 'Mar 6, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Add custom JavaScript to company-facing pages',
    description:
      'Configure company-side custom JavaScript from Settings and load it only for authenticated company users. Use it for trusted widgets, embeds, or lightweight client-side customizations without affecting public pages.'
  },
  {
    date: 'Mar 3, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Transcribe inbound audio messages in the inbox',
    description:
      'Convert voice messages to text with one click. Enable transcription in Inbox Settings, choose manual or automatic mode, and configure your OpenAI credentials. Transcriptions appear below the audio player for quick reading.'
  },
  {
    date: 'Feb 25, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Pin important chats and contacts to the top',
    description:
      'Keep your most important conversations and contacts at the top of your list. Pin up to 7 items for quick access—no more scrolling to find your VIP customers.'
  },
  {
    date: 'Feb 25, 2026',
    category: 'Improvements',
    categoryColor: 'green',
    title: 'Faster loading and smoother chat experience',
    description:
      'Links and images now load quicker. Your chat automatically scrolls to the latest messages when new ones arrive, so you never miss a beat.'
  },
  {
    date: 'Feb 24, 2026',
    category: 'Improvements',
    categoryColor: 'blue',
    title: 'More reliable WhatsApp connections',
    description:
      'Your WhatsApp connection stays online longer and recovers automatically when it drops. We now save your connection state so reconnecting is smoother and faster.'
  },
  {
    date: 'Feb 24, 2026',
    category: 'Improvements',
    categoryColor: 'blue',
    title: 'Better link previews and image viewing',
    description:
      'Shared links show rich previews so you can see what you are clicking before you open them. Tap images in chat to view them in full size.'
  },
  {
    date: 'Feb 23, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'AI-powered phone calls',
    description:
      'Connect your phone number to an AI assistant that can make and receive calls. Handle customer inquiries, book appointments, and answer questions—all through natural voice conversations.'
  },
  {
    date: 'Feb 21, 2026',
    category: 'Improvements',
    categoryColor: 'green',
    title: 'Clearer WhatsApp connection status',
    description:
      'See exactly when your WhatsApp is connecting, reconnecting, or ready to use. Improved messages and buttons make it easier to fix connection issues when they happen.'
  },
  {
    date: 'Feb 21, 2026',
    category: 'New Feature',
    categoryColor: 'red',
    title: 'Search through your messages',
    description:
      'Find any message in seconds. Search across your chat history to locate that important detail, order number, or note—without scrolling through endless conversations.'
  },
  {
    date: 'Feb 21, 2026',
    category: 'Improvements',
    categoryColor: 'purple',
    title: 'Set your time zone for accurate scheduling',
    description:
      "Set your company's default time zone so messages, appointments, and automated flows run at the right time for your business and your customers."
  },
  {
    date: 'Feb 11, 2026',
    category: 'Improvements',
    categoryColor: 'purple',
    title: 'Easier QR code setup for WhatsApp',
    description:
      'Connecting WhatsApp with a QR code is now smoother. Better handling when the code expires or needs to be refreshed, so you spend less time troubleshooting.'
  }
];
