import type { Contact, PipelineSuggestion, ContactStageSuggestion, PipelineStage } from '@/lib/types';

const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';

interface NvidiaMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface NvidiaCompletionResponse {
    id: string;
    choices: {
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Call NVIDIA NIM API for chat completion
 */
async function callNvidiaAPI(
    model: string,
    messages: NvidiaMessage[],
    maxTokens: number = 2048,
    temperature: number = 0.7
): Promise<{ content: string; tokensUsed: number }> {
    const apiKey = process.env.NVIDIA_API_KEY;

    if (!apiKey) {
        throw new Error('NVIDIA_API_KEY is not set');
    }

    const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`NVIDIA API error: ${error}`);
    }

    const data: NvidiaCompletionResponse = await response.json();

    return {
        content: data.choices[0]?.message?.content || '',
        tokensUsed: data.usage?.total_tokens || 0,
    };
}

/**
 * Analyze a contact to extract insights
 */
export async function analyzeContact(
    contact: Contact,
    messages: { content: string; direction: 'inbound' | 'outbound'; created_at: string }[],
    model: string = 'meta/llama-3.1-8b-instruct'
): Promise<{
    analysis: {
        summary: string;
        intent: string;
        urgency: 'low' | 'medium' | 'high';
        tags: string[];
    };
    tokensUsed: number;
}> {
    const contactInfo = [
        contact.full_name && `Name: ${contact.full_name}`,
        contact.email && `Email: ${contact.email}`,
        contact.phone && `Phone: ${contact.phone}`,
        Object.keys(contact.custom_fields || {}).length > 0 &&
        `Additional Info: ${JSON.stringify(contact.custom_fields)}`,
    ].filter(Boolean).join('\n');

    const messageHistory = messages.length > 0
        ? messages.map(m => `[${m.direction.toUpperCase()}] ${m.content}`).join('\n')
        : 'No messages yet';

    const systemPrompt = `You are an AI assistant that analyzes leads/contacts for a sales pipeline.
Your task is to analyze the contact and their message history to provide insights.
Always respond in valid JSON format only.`;

    const userPrompt = `Analyze this contact:

CONTACT INFO:
${contactInfo}

MESSAGE HISTORY:
${messageHistory}

Respond with this exact JSON structure:
{
  "summary": "Brief 1-2 sentence summary of the contact and their needs",
  "intent": "What the contact is looking for or trying to achieve",
  "urgency": "low" | "medium" | "high",
  "tags": ["tag1", "tag2", "tag3"]
}`;

    const result = await callNvidiaAPI(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ]);

    try {
        // Extract JSON from response (handle markdown code blocks)
        let jsonContent = result.content;
        const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonContent = jsonMatch[1];
        }

        const analysis = JSON.parse(jsonContent.trim());
        return {
            analysis: {
                summary: analysis.summary || 'No summary available',
                intent: analysis.intent || 'Unknown',
                urgency: ['low', 'medium', 'high'].includes(analysis.urgency) ? analysis.urgency : 'medium',
                tags: Array.isArray(analysis.tags) ? analysis.tags : [],
            },
            tokensUsed: result.tokensUsed,
        };
    } catch {
        console.error('Failed to parse AI response:', result.content);
        return {
            analysis: {
                summary: 'Analysis pending',
                intent: 'Unknown',
                urgency: 'medium' as const,
                tags: [],
            },
            tokensUsed: result.tokensUsed,
        };
    }
}

/**
 * Suggest a pipeline structure based on contacts
 */
export async function suggestPipeline(
    contacts: Contact[],
    businessContext?: string,
    model: string = 'meta/llama-3.1-8b-instruct'
): Promise<{
    suggestion: PipelineSuggestion;
    tokensUsed: number;
}> {
    const contactSummary = contacts.slice(0, 20).map((c, i) => {
        const analysis = c.ai_analysis;
        return `${i + 1}. ${c.full_name || c.email || 'Unknown'} - ${analysis?.summary || 'Not analyzed'} [${analysis?.urgency || 'unknown'} urgency]`;
    }).join('\n');

    const systemPrompt = `You are an AI assistant that designs sales pipelines based on the types of leads a business receives.
Your task is to suggest a pipeline structure with appropriate stages.
Always respond in valid JSON format only.`;

    const userPrompt = `Based on these contacts/leads, suggest a pipeline structure:

CONTACTS (${contacts.length} total, showing up to 20):
${contactSummary}

${businessContext ? `BUSINESS CONTEXT: ${businessContext}` : ''}

Respond with this exact JSON structure:
{
  "name": "Suggested pipeline name",
  "description": "Brief description of the pipeline purpose",
  "stages": [
    {
      "name": "Stage Name",
      "description": "What this stage represents",
      "order_index": 0,
      "color": "#hexcolor",
      "requirements": {
        "criteria": ["What contact needs to meet to be in this stage"]
      },
      "capi_event_name": "Lead" 
    }
  ],
  "reasoning": "Why this pipeline structure works for these contacts"
}

Common CAPI event names: Lead, Contact, CompleteRegistration, Schedule, InitiateCheckout, Purchase
Use 4-6 stages typically. Use distinct, visually appealing colors.`;

    const result = await callNvidiaAPI(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ], 3000);

    try {
        let jsonContent = result.content;
        const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonContent = jsonMatch[1];
        }

        const suggestion = JSON.parse(jsonContent.trim());
        return {
            suggestion: {
                name: suggestion.name || 'Sales Pipeline',
                description: suggestion.description || '',
                stages: (suggestion.stages || []).map((s: PipelineStage, i: number) => ({
                    name: s.name || `Stage ${i + 1}`,
                    description: s.description || '',
                    order_index: s.order_index ?? i,
                    color: s.color || '#6366f1',
                    requirements: s.requirements || { criteria: [] },
                    capi_event_name: s.capi_event_name,
                })),
                reasoning: suggestion.reasoning || '',
            },
            tokensUsed: result.tokensUsed,
        };
    } catch {
        console.error('Failed to parse pipeline suggestion:', result.content);
        // Return default pipeline
        return {
            suggestion: {
                name: 'Default Sales Pipeline',
                description: 'A standard sales pipeline',
                stages: [
                    { name: 'New Lead', description: 'Newly acquired leads', order_index: 0, color: '#3b82f6', requirements: { criteria: ['Just received'] }, capi_event_name: 'Lead' },
                    { name: 'Contacted', description: 'Initial contact made', order_index: 1, color: '#8b5cf6', requirements: { criteria: ['Responded to first outreach'] }, capi_event_name: 'Contact' },
                    { name: 'Qualified', description: 'Qualified as potential customer', order_index: 2, color: '#f59e0b', requirements: { criteria: ['Confirmed interest and budget'] } },
                    { name: 'Proposal', description: 'Proposal sent', order_index: 3, color: '#10b981', requirements: { criteria: ['Received quote or proposal'] } },
                    { name: 'Closed Won', description: 'Deal closed successfully', order_index: 4, color: '#22c55e', requirements: { criteria: ['Payment received'] }, capi_event_name: 'Purchase' },
                ],
                reasoning: 'Default pipeline structure for general sales processes',
            },
            tokensUsed: result.tokensUsed,
        };
    }
}

/**
 * Assign a contact to the most appropriate stage
 */
export async function assignContactToStage(
    contact: Contact,
    messages: { content: string; direction: 'inbound' | 'outbound'; created_at: string }[],
    stages: PipelineStage[],
    model: string = 'meta/llama-3.1-8b-instruct'
): Promise<{
    suggestion: ContactStageSuggestion;
    tokensUsed: number;
}> {
    const contactInfo = [
        `Name: ${contact.full_name || 'Unknown'}`,
        contact.email && `Email: ${contact.email}`,
        contact.ai_analysis?.summary && `Summary: ${contact.ai_analysis.summary}`,
        contact.ai_analysis?.intent && `Intent: ${contact.ai_analysis.intent}`,
        contact.ai_analysis?.urgency && `Urgency: ${contact.ai_analysis.urgency}`,
    ].filter(Boolean).join('\n');

    const messageHistory = messages.slice(-10).map(m =>
        `[${m.direction.toUpperCase()}] ${m.content}`
    ).join('\n') || 'No messages';

    const stagesList = stages.map(s =>
        `- ID: ${s.id} | Name: ${s.name} | Requirements: ${s.requirements?.criteria?.join(', ') || 'None'}`
    ).join('\n');

    const systemPrompt = `You are an AI assistant that assigns leads to the appropriate pipeline stage.
Analyze the contact and their conversation to determine the best stage.
Always respond in valid JSON format only.`;

    const userPrompt = `Assign this contact to the most appropriate stage:

CONTACT:
${contactInfo}

RECENT MESSAGES:
${messageHistory}

AVAILABLE STAGES:
${stagesList}

Respond with this exact JSON structure:
{
  "stage_id": "the ID of the recommended stage",
  "confidence": 0.0-1.0,
  "reasoning": "Why this stage is appropriate"
}`;

    const result = await callNvidiaAPI(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ]);

    try {
        let jsonContent = result.content;
        const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonContent = jsonMatch[1];
        }

        const assignment = JSON.parse(jsonContent.trim());

        // Validate stage_id exists
        const validStageId = stages.find(s => s.id === assignment.stage_id)?.id || stages[0]?.id;

        return {
            suggestion: {
                contact_id: contact.id,
                recommended_stage_id: validStageId,
                confidence: Number(assignment.confidence) || 0.5,
                reasoning: assignment.reasoning || '',
            },
            tokensUsed: result.tokensUsed,
        };
    } catch {
        console.error('Failed to parse stage assignment:', result.content);
        return {
            suggestion: {
                contact_id: contact.id,
                recommended_stage_id: stages[0]?.id || '',
                confidence: 0.3,
                reasoning: 'Default assignment - analysis failed',
            },
            tokensUsed: result.tokensUsed,
        };
    }
}

/**
 * Bulk assign contacts to stages
 */
export async function bulkAssignContacts(
    contacts: Contact[],
    stages: PipelineStage[],
    model: string = 'meta/llama-3.1-8b-instruct'
): Promise<{
    assignments: { contact_id: string; stage_id: string; confidence: number }[];
    tokensUsed: number;
}> {
    // For efficiency, process in batches
    const contactSummaries = contacts.map((c, i) => {
        const analysis = c.ai_analysis;
        return `${i}. ID:${c.id} | ${c.full_name || 'Unknown'} | Intent: ${analysis?.intent || 'Unknown'} | Urgency: ${analysis?.urgency || 'unknown'}`;
    }).join('\n');

    const stagesList = stages.map(s =>
        `- ID:${s.id} | ${s.name} | For: ${s.requirements?.criteria?.[0] || s.description || 'General'}`
    ).join('\n');

    const systemPrompt = `You are an AI that assigns leads to pipeline stages in bulk.
Analyze each contact and assign them to appropriate stages.
Always respond in valid JSON format only.`;

    const userPrompt = `Assign these contacts to stages:

CONTACTS:
${contactSummaries}

STAGES:
${stagesList}

Respond with this exact JSON array:
[
  { "contact_id": "id", "stage_id": "stage_id", "confidence": 0.0-1.0 }
]

Assign ALL contacts. Match by contact_id and stage_id exactly as shown above.`;

    const result = await callNvidiaAPI(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ], 4000);

    try {
        let jsonContent = result.content;
        const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonContent = jsonMatch[1];
        }

        const assignments = JSON.parse(jsonContent.trim());

        // Validate and clean assignments
        const validAssignments = (Array.isArray(assignments) ? assignments : []).map((a: { contact_id: string; stage_id: string; confidence?: number }) => {
            const validStageId = stages.find(s => s.id === a.stage_id)?.id || stages[0]?.id;
            return {
                contact_id: a.contact_id,
                stage_id: validStageId,
                confidence: Number(a.confidence) || 0.5,
            };
        });

        return {
            assignments: validAssignments,
            tokensUsed: result.tokensUsed,
        };
    } catch {
        console.error('Failed to parse bulk assignments:', result.content);
        // Default: assign all to first stage
        return {
            assignments: contacts.map(c => ({
                contact_id: c.id,
                stage_id: stages[0]?.id || '',
                confidence: 0.3,
            })),
            tokensUsed: result.tokensUsed,
        };
    }
}
