/**
 * Conversation Analysis Service
 * Re-analyzes contacts based on their message history and moves them to appropriate stages
 */

import { analyzeContact, assignContactToStage } from './nvidiaAIService';
import { sendConversionEvent } from './facebookService';
import type { Contact, PipelineStage } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Message {
    id: string;
    direction: 'inbound' | 'outbound';
    content: string;
    created_at: string;
}

interface FacebookConfig {
    user_id: string;
    page_id: string;
    page_access_token: string;
    dataset_id?: string;
}

/**
 * Re-analyze a contact based on their conversation history
 * This is called when new messages are received
 */
export async function reanalyzeContactWithConversation(
    contact: Contact,
    messages: Message[],
    fbConfig: FacebookConfig,
    supabase: SupabaseClient
): Promise<void> {
    try {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔄 CONVERSATION RE-ANALYSIS');
        console.log('Contact:', contact.full_name || contact.email);
        console.log('Messages in history:', messages.length);

        // Build conversation context for AI
        const conversationContext = messages.map(m =>
            `[${m.direction === 'inbound' ? 'CUSTOMER' : 'BOT'}]: ${m.content}`
        ).join('\n');

        // Re-analyze with conversation context
        const analysisResult = await analyzeContact(contact, messages);

        // Extract conversation insights
        const conversationInsights = await analyzeConversationIntent(
            conversationContext,
            contact,
            analysisResult.analysis
        );

        console.log('📊 New AI Analysis:');
        console.log('   - Urgency:', conversationInsights.urgency);
        console.log('   - Intent:', conversationInsights.intent);
        console.log('   - Stage Recommendation:', conversationInsights.recommended_action);

        // Update contact with new analysis
        await supabase
            .from('contacts')
            .update({
                ai_analysis: {
                    ...analysisResult.analysis,
                    ...conversationInsights,
                    last_conversation_at: new Date().toISOString(),
                    message_count: messages.length,
                },
            })
            .eq('id', contact.id);

        // Get current stage assignment
        const { data: currentAssignment } = await supabase
            .from('contact_stage_assignments')
            .select('*, pipeline_stages(*)')
            .eq('contact_id', contact.id)
            .single();

        // Get user's default pipeline with stages
        const { data: pipeline } = await supabase
            .from('pipelines')
            .select('*, pipeline_stages(*)')
            .eq('user_id', fbConfig.user_id)
            .eq('is_default', true)
            .single();

        if (!pipeline || !pipeline.pipeline_stages?.length) {
            console.log('⚠️ No default pipeline found');
            return;
        }

        const stages = (pipeline.pipeline_stages as PipelineStage[]).sort(
            (a, b) => a.order_index - b.order_index
        );

        // Only re-assign if conversation indicates a stage change is needed
        if (conversationInsights.should_move_stage) {
            console.log('🔄 AI recommends moving to a different stage');

            // Get AI suggestion for new stage
            const stageResult = await assignContactToStage(
                { ...contact, ai_analysis: { ...analysisResult.analysis, ...conversationInsights, analyzed_at: new Date().toISOString() } } as unknown as Contact,
                messages,
                stages
            );

            const newStage = stages.find(s => s.id === stageResult.suggestion.recommended_stage_id);
            const currentStage = currentAssignment?.pipeline_stages as PipelineStage | undefined;

            // Check if actually moving to a different stage
            if (newStage && newStage.id !== currentAssignment?.stage_id) {
                console.log('📍 MOVING STAGE:');
                console.log('   From:', currentStage?.name || 'None');
                console.log('   To:', newStage.name);
                console.log('   Reason:', stageResult.suggestion.reasoning);

                // Update stage assignment
                await supabase
                    .from('contact_stage_assignments')
                    .upsert({
                        contact_id: contact.id,
                        stage_id: newStage.id,
                        pipeline_id: pipeline.id,
                        assigned_by: 'ai',
                        notes: `Moved based on conversation: ${stageResult.suggestion.reasoning}`,
                    }, {
                        onConflict: 'contact_id,pipeline_id',
                    });

                // Log the stage change
                await supabase
                    .from('ai_analysis_logs')
                    .insert({
                        user_id: fbConfig.user_id,
                        contact_id: contact.id,
                        action_type: 'reanalyze',
                        model_used: 'meta/llama-3.1-8b-instruct',
                        input_summary: `Re-analyzed after ${messages.length} messages`,
                        output_summary: `Moved from "${currentStage?.name || 'None'}" to "${newStage.name}": ${stageResult.suggestion.reasoning}`,
                        tokens_used: stageResult.tokensUsed,
                    });

                // Send CAPI event if new stage has one configured
                if (newStage.capi_event_name && fbConfig.dataset_id) {
                    console.log('📤 Sending CAPI event for stage change:', newStage.capi_event_name);
                    try {
                        await sendConversionEvent(
                            fbConfig.dataset_id,
                            fbConfig.page_access_token,
                            newStage.capi_event_name,
                            {
                                email: contact.email,
                                phone: contact.phone,
                                firstName: contact.first_name,
                                lastName: contact.last_name,
                                externalId: contact.id,
                            },
                            {
                                pipeline_stage: newStage.name,
                                previous_stage: currentStage?.name,
                                trigger: 'conversation_analysis',
                            }
                        );
                        console.log('✅ CAPI event sent');
                    } catch (err) {
                        console.error('❌ Failed to send CAPI event:', err);
                    }
                }
            } else {
                console.log('📍 Staying in current stage:', currentStage?.name);
            }
        } else {
            console.log('📍 No stage change needed based on conversation');
        }

        console.log('✅ Conversation re-analysis complete');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error) {
        console.error('❌ Conversation analysis failed:', error);
    }
}

/**
 * Analyze conversation to determine intent and whether stage should change
 */
async function analyzeConversationIntent(
    conversationText: string,
    contact: Contact,
    baseAnalysis: { urgency: string; summary: string }
): Promise<{
    urgency: string;
    intent: string;
    sentiment: string;
    should_move_stage: boolean;
    recommended_action: string;
    key_topics: string[];
}> {
    const NVIDIA_API_KEY = process.env.NVIDIA_NIM_API_KEY!;
    const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

    const prompt = `Analyze this customer conversation and determine the appropriate action.

CONTACT INFO:
- Name: ${contact.full_name || 'Unknown'}
- Previous Urgency: ${baseAnalysis.urgency}
- Previous Summary: ${baseAnalysis.summary}

CONVERSATION:
${conversationText || 'No messages yet'}

Based on the conversation, provide a JSON response with:
1. "urgency": "low", "medium", or "high" - based on latest messages
2. "intent": What the customer wants (e.g., "purchase", "inquiry", "complaint", "support")
3. "sentiment": "positive", "neutral", or "negative"
4. "should_move_stage": true if the conversation indicates they should move to a different pipeline stage
5. "recommended_action": What action to take next
6. "key_topics": Array of main topics discussed

Respond ONLY with valid JSON.`;

    try {
        const response = await fetch(NVIDIA_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NVIDIA_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'meta/llama-3.1-8b-instruct',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 500,
            }),
        });

        if (!response.ok) {
            throw new Error('NVIDIA API request failed');
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || '';

        // Parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('Conversation intent analysis failed:', error);
    }

    // Default response if AI fails
    return {
        urgency: baseAnalysis.urgency,
        intent: 'unknown',
        sentiment: 'neutral',
        should_move_stage: false,
        recommended_action: 'Follow up with customer',
        key_topics: [],
    };
}

/**
 * Link a Facebook PSID to an existing contact
 * Called when we can match a message sender to a contact
 */
export async function linkPsidToContact(
    contactId: string,
    psid: string,
    supabase: SupabaseClient
): Promise<void> {
    const { data: contact } = await supabase
        .from('contacts')
        .select('custom_fields')
        .eq('id', contactId)
        .single();

    if (contact) {
        await supabase
            .from('contacts')
            .update({
                custom_fields: {
                    ...contact.custom_fields,
                    psid: psid,
                },
            })
            .eq('id', contactId);
    }
}
