import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import {
    verifyWebhookSignature,
    fetchLeadDetails,
    parseLeadData,
    sendConversionEvent
} from '@/lib/services/facebookService';
import { analyzeContact, assignContactToStage } from '@/lib/services/nvidiaAIService';
import type { FacebookLeadgenEvent, Contact, PipelineStage } from '@/lib/types';

// Webhook verification (GET request from Facebook)
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('Webhook verified successfully');
        return new NextResponse(challenge, { status: 200 });
    }

    console.error('Webhook verification failed');
    return new NextResponse('Forbidden', { status: 403 });
}

// Webhook event handler (POST request from Facebook)
export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.text();
        const signature = request.headers.get('x-hub-signature-256') || '';
        const appSecret = process.env.FACEBOOK_APP_SECRET!;

        // Verify signature
        if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
            console.error('Invalid webhook signature');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const body: FacebookLeadgenEvent = JSON.parse(rawBody);

        // Process each entry
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                if (change.field === 'leadgen') {
                    await processLeadgenEvent(change.value);
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Webhook processing error:', error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}

async function processLeadgenEvent(leadData: {
    form_id: string;
    leadgen_id: string;
    page_id: string;
    created_time: number;
}) {
    const supabase = createServerClient();

    try {
        // Find the user who owns this page
        const { data: fbConfig, error: configError } = await supabase
            .from('facebook_configs')
            .select('*')
            .eq('page_id', leadData.page_id)
            .single();

        if (configError || !fbConfig) {
            console.error('No Facebook config found for page:', leadData.page_id);
            return;
        }

        // Fetch full lead details from Facebook
        const leadDetails = await fetchLeadDetails(
            leadData.leadgen_id,
            fbConfig.page_access_token
        );

        // Parse the lead data
        const parsed = parseLeadData(leadDetails.field_data);

        // Create contact in database with ad attribution
        const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .insert({
                user_id: fbConfig.user_id,
                facebook_lead_id: leadData.leadgen_id,
                facebook_page_id: leadData.page_id,
                // Ad attribution from Facebook
                facebook_ad_id: leadDetails.ad_id || null,
                facebook_adset_id: leadDetails.adset_id || null,
                facebook_campaign_id: leadDetails.campaign_id || null,
                facebook_form_id: leadDetails.form_id || leadData.form_id || null,
                ad_name: leadDetails.ad_name || null,
                adset_name: leadDetails.adset_name || null,
                campaign_name: leadDetails.campaign_name || null,
                // Contact info
                email: parsed.email,
                phone: parsed.phone,
                first_name: parsed.firstName,
                last_name: parsed.lastName,
                full_name: parsed.fullName || `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim() || null,
                custom_fields: parsed.customFields,
                source: 'webhook',
            })
            .select()
            .single();

        if (contactError) {
            console.error('Failed to create contact:', contactError);
            return;
        }

        console.log('Contact created:', contact.id);

        // Analyze the contact with AI
        const analysisResult = await analyzeContact(contact as Contact, []);

        // Update contact with analysis
        await supabase
            .from('contacts')
            .update({
                ai_analysis: {
                    ...analysisResult.analysis,
                    analyzed_at: new Date().toISOString(),
                },
            })
            .eq('id', contact.id);

        // Log the AI analysis
        await supabase
            .from('ai_analysis_logs')
            .insert({
                user_id: fbConfig.user_id,
                contact_id: contact.id,
                action_type: 'analyze_contact',
                model_used: 'meta/llama-3.1-8b-instruct',
                input_summary: `Analyzed new lead: ${contact.full_name || contact.email}`,
                output_summary: analysisResult.analysis.summary,
                tokens_used: analysisResult.tokensUsed,
            });

        // Get user's default pipeline and stages
        const { data: pipeline } = await supabase
            .from('pipelines')
            .select('*, pipeline_stages(*)')
            .eq('user_id', fbConfig.user_id)
            .eq('is_default', true)
            .single();

        if (pipeline && pipeline.pipeline_stages?.length > 0) {
            // Sort stages by order_index
            const stages = (pipeline.pipeline_stages as PipelineStage[]).sort(
                (a, b) => a.order_index - b.order_index
            );

            // Get AI suggestion for stage assignment
            const stageResult = await assignContactToStage(
                { ...contact, ai_analysis: analysisResult.analysis } as Contact,
                [],
                stages
            );

            // Assign contact to stage
            await supabase
                .from('contact_stage_assignments')
                .insert({
                    contact_id: contact.id,
                    stage_id: stageResult.suggestion.recommended_stage_id,
                    pipeline_id: pipeline.id,
                    assigned_by: 'ai',
                    notes: stageResult.suggestion.reasoning,
                });

            // Log the stage assignment
            await supabase
                .from('ai_analysis_logs')
                .insert({
                    user_id: fbConfig.user_id,
                    contact_id: contact.id,
                    action_type: 'assign_stage',
                    model_used: 'meta/llama-3.1-8b-instruct',
                    input_summary: `Assigned to pipeline: ${pipeline.name}`,
                    output_summary: `Stage: ${stages.find(s => s.id === stageResult.suggestion.recommended_stage_id)?.name}`,
                    tokens_used: stageResult.tokensUsed,
                });

            // Send CAPI event if the stage has one configured
            const assignedStage = stages.find(s => s.id === stageResult.suggestion.recommended_stage_id);
            if (assignedStage?.capi_event_name && fbConfig.dataset_id) {
                try {
                    await sendConversionEvent(
                        fbConfig.dataset_id,
                        fbConfig.page_access_token,
                        assignedStage.capi_event_name,
                        {
                            email: contact.email,
                            phone: contact.phone,
                            firstName: contact.first_name,
                            lastName: contact.last_name,
                            externalId: contact.id,
                        },
                        {
                            pipeline_stage: assignedStage.name,
                            source: 'lead_pipeline',
                        }
                    );
                    console.log('CAPI event sent:', assignedStage.capi_event_name);
                } catch (capiError) {
                    console.error('Failed to send CAPI event:', capiError);
                }
            }
        }

        console.log('Lead processed successfully:', leadData.leadgen_id);
    } catch (error) {
        console.error('Error processing leadgen event:', error);
    }
}
