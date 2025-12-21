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

        // ========================================
        // STEP 1: AI ANALYSIS
        // ========================================
        console.log('🤖 Starting AI analysis for:', contact.full_name || contact.email);

        const analysisResult = await analyzeContact(contact as Contact, []);

        // Calculate lead quality score (0-100)
        let leadQualityScore = 0;

        // Contact completeness (max 30 points)
        if (contact.email) leadQualityScore += 10;
        if (contact.phone) leadQualityScore += 10;
        if (contact.full_name) leadQualityScore += 10;

        // AI urgency score (max 40 points)
        switch (analysisResult.analysis.urgency) {
            case 'high': leadQualityScore += 40; break;
            case 'medium': leadQualityScore += 25; break;
            case 'low': leadQualityScore += 10; break;
        }

        // Custom fields richness (max 30 points)
        const customFieldCount = Object.keys(parsed.customFields || {}).length;
        leadQualityScore += Math.min(30, customFieldCount * 10);

        // Update contact with analysis AND quality score
        await supabase
            .from('contacts')
            .update({
                ai_analysis: {
                    ...analysisResult.analysis,
                    analyzed_at: new Date().toISOString(),
                },
                lead_quality_score: Math.min(100, leadQualityScore),
            })
            .eq('id', contact.id);

        console.log('✅ AI Analysis complete. Quality Score:', leadQualityScore);

        // Log the AI analysis
        await supabase
            .from('ai_analysis_logs')
            .insert({
                user_id: fbConfig.user_id,
                contact_id: contact.id,
                action_type: 'analyze_contact',
                model_used: 'meta/llama-3.1-8b-instruct',
                input_summary: `Analyzed new lead: ${contact.full_name || contact.email}`,
                output_summary: `Urgency: ${analysisResult.analysis.urgency}, Quality: ${leadQualityScore}. ${analysisResult.analysis.summary}`,
                tokens_used: analysisResult.tokensUsed,
            });

        // ========================================
        // STEP 2: AUTO-ASSIGN TO PIPELINE STAGE
        // ========================================

        // Get user's default pipeline and stages
        const { data: pipeline } = await supabase
            .from('pipelines')
            .select('*, pipeline_stages(*)')
            .eq('user_id', fbConfig.user_id)
            .eq('is_default', true)
            .single();

        if (pipeline && pipeline.pipeline_stages?.length > 0) {
            console.log('📊 Found default pipeline:', pipeline.name);

            // Sort stages by order_index
            const stages = (pipeline.pipeline_stages as PipelineStage[]).sort(
                (a, b) => a.order_index - b.order_index
            );
            console.log('📋 Available stages:', stages.map(s => s.name).join(' → '));

            // Get AI suggestion for stage assignment
            console.log('🤖 Asking AI to determine best stage...');
            const stageResult = await assignContactToStage(
                { ...contact, ai_analysis: analysisResult.analysis } as Contact,
                [],
                stages
            );

            const assignedStage = stages.find(s => s.id === stageResult.suggestion.recommended_stage_id);
            console.log('✅ AI DECISION: Move to stage "' + assignedStage?.name + '"');
            console.log('💭 Reasoning:', stageResult.suggestion.reasoning);

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

            console.log('📍 Contact assigned to stage:', assignedStage?.name);

            // Log the stage assignment
            await supabase
                .from('ai_analysis_logs')
                .insert({
                    user_id: fbConfig.user_id,
                    contact_id: contact.id,
                    action_type: 'assign_stage',
                    model_used: 'meta/llama-3.1-8b-instruct',
                    input_summary: `Auto-assigned to pipeline: ${pipeline.name}`,
                    output_summary: `Stage: ${assignedStage?.name}. Reason: ${stageResult.suggestion.reasoning}`,
                    tokens_used: stageResult.tokensUsed,
                });

            // ========================================
            // STEP 3: SEND CAPI EVENT (if configured)
            // ========================================
            if (assignedStage?.capi_event_name && fbConfig.dataset_id) {
                console.log('📤 Sending CAPI event:', assignedStage.capi_event_name);
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
                    console.log('✅ CAPI event sent successfully:', assignedStage.capi_event_name);
                } catch (capiError) {
                    console.error('❌ Failed to send CAPI event:', capiError);
                }
            }
        } else {
            console.log('⚠️ No default pipeline found. Contact not assigned to any stage.');
        }

        console.log('🎉 Lead processing complete:', contact.full_name || contact.email);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error) {
        console.error('❌ Error processing leadgen event:', error);
    }
}

