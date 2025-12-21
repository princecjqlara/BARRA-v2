// Database Types

export interface User {
    id: string;
    email: string;
    created_at: string;
    updated_at: string;
}

export interface FacebookConfig {
    id: string;
    user_id: string;
    page_id: string;
    page_name: string;
    page_access_token: string;
    ad_account_id?: string;
    dataset_id?: string;
    webhook_subscribed: boolean;
    created_at: string;
    updated_at: string;
}

export interface Contact {
    id: string;
    user_id: string;
    facebook_lead_id?: string;
    facebook_page_id?: string;
    // Ad Attribution
    facebook_ad_id?: string;
    facebook_adset_id?: string;
    facebook_campaign_id?: string;
    facebook_form_id?: string;
    facebook_form_name?: string;
    ad_name?: string;
    campaign_name?: string;
    adset_name?: string;
    // Contact Info
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    custom_fields: Record<string, string>;
    ai_analysis?: ContactAnalysis;
    source: 'webhook' | 'manual' | 'import';
    created_at: string;
    updated_at: string;
}

export interface ContactAnalysis {
    summary: string;
    intent: string;
    urgency: 'low' | 'medium' | 'high';
    recommended_stage?: string;
    tags: string[];
    analyzed_at: string;
}

export interface Pipeline {
    id: string;
    user_id: string;
    name: string;
    description?: string;
    is_default: boolean;
    ai_generated: boolean;
    created_at: string;
    updated_at: string;
}

export interface PipelineStage {
    id: string;
    pipeline_id: string;
    name: string;
    description?: string;
    order_index: number;
    color: string;
    requirements?: StageRequirements;
    capi_event_name?: string; // Event to send to Facebook when contact enters this stage
    created_at: string;
    updated_at: string;
}

export interface StageRequirements {
    criteria: string[];
    auto_move_conditions?: string;
}

export interface ContactStageAssignment {
    id: string;
    contact_id: string;
    stage_id: string;
    pipeline_id: string;
    assigned_by: 'ai' | 'manual';
    notes?: string;
    created_at: string;
    updated_at: string;
}

export interface Message {
    id: string;
    contact_id: string;
    user_id: string;
    direction: 'inbound' | 'outbound';
    content: string;
    platform: 'messenger' | 'whatsapp' | 'instagram';
    facebook_message_id?: string;
    created_at: string;
}

export interface AIAnalysisLog {
    id: string;
    user_id: string;
    contact_id?: string;
    action_type: 'analyze_contact' | 'suggest_pipeline' | 'assign_stage' | 'reanalyze';
    model_used: string;
    input_summary: string;
    output_summary: string;
    tokens_used?: number;
    created_at: string;
}

// API Types

export interface FacebookLeadgenEvent {
    entry: {
        id: string;
        time: number;
        changes: {
            field: string;
            value: {
                form_id: string;
                leadgen_id: string;
                page_id: string;
                created_time: number;
            };
        }[];
    }[];
}

export interface FacebookLeadData {
    id: string;
    created_time: string;
    field_data: {
        name: string;
        values: string[];
    }[];
    // Ad attribution (available via Graph API)
    ad_id?: string;
    ad_name?: string;
    adset_id?: string;
    adset_name?: string;
    campaign_id?: string;
    campaign_name?: string;
    form_id?: string;
    form_name?: string;
}

export interface PipelineSuggestion {
    name: string;
    description: string;
    stages: {
        name: string;
        description: string;
        order_index: number;
        color: string;
        requirements: StageRequirements;
        capi_event_name?: string;
    }[];
    reasoning: string;
}

export interface ContactStageSuggestion {
    contact_id: string;
    recommended_stage_id: string;
    confidence: number;
    reasoning: string;
}

// NVIDIA AI Types

export interface NvidiaAIModel {
    id: string;
    name: string;
    description: string;
    speed: 'fast' | 'medium' | 'slow';
    reasoning: 'basic' | 'advanced';
}

export const NVIDIA_MODELS: NvidiaAIModel[] = [
    {
        id: 'meta/llama-3.1-8b-instruct',
        name: 'Llama 3.1 8B',
        description: 'Fast and balanced for general tasks',
        speed: 'fast',
        reasoning: 'basic',
    },
    {
        id: 'mistralai/mistral-7b-instruct-v0.3',
        name: 'Mistral 7B',
        description: 'Efficient and quick analysis',
        speed: 'fast',
        reasoning: 'basic',
    },
    {
        id: 'nvidia/nemotron-mini-4b-instruct',
        name: 'Nemotron Mini 4B',
        description: 'Ultra-fast for simple tasks',
        speed: 'fast',
        reasoning: 'basic',
    },
];

// Facebook CAPI Types

export interface CAPIEvent {
    event_name: string;
    event_time: number;
    event_id: string;
    event_source_url?: string;
    action_source: 'website' | 'app' | 'chat' | 'other';
    user_data: {
        em?: string[]; // Hashed email
        ph?: string[]; // Hashed phone
        fn?: string[]; // Hashed first name
        ln?: string[]; // Hashed last name
        external_id?: string[];
    };
    custom_data?: Record<string, unknown>;
}

export interface CAPIResponse {
    events_received: number;
    messages?: string[];
    fbtrace_id?: string;
}
