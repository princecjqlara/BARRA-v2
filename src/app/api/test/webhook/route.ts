import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { parseLeadData } from '@/lib/services/facebookService';
import { analyzeContact, assignContactToStage } from '@/lib/services/nvidiaAIService';
import type { Contact, PipelineStage } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/test/webhook - Simulate a Facebook webhook lead
 * This allows testing the full lead processing pipeline without actual Facebook data
 */
export async function POST(request: NextRequest) {
    const supabase = createServerClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();

        // Get user's Facebook config (for page_id reference)
        const { data: fbConfig } = await supabase
            .from('facebook_configs')
            .select('*')
            .eq('user_id', user.id)
            .single();

        // Create test lead data
        const testLeadId = `test_lead_${uuidv4()}`;
        const testData = {
            email: body.email || `test-${Date.now()}@example.com`,
            phone: body.phone || '+1234567890',
            firstName: body.first_name || 'Test',
            lastName: body.last_name || 'Lead',
            fullName: body.full_name || `${body.first_name || 'Test'} ${body.last_name || 'Lead'}`,
            customFields: body.custom_fields || { source: 'test_mode' },
        };

        const steps: { step: string; status: 'success' | 'error' | 'skipped'; details?: string }[] = [];

        // Step 1: Create contact
        const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .insert({
                user_id: user.id,
                facebook_lead_id: testLeadId,
                facebook_page_id: fbConfig?.page_id || 'test_page',
                facebook_ad_id: body.ad_id || 'test_ad_123',
                facebook_campaign_id: body.campaign_id || 'test_campaign_123',
                ad_name: body.ad_name || 'Test Ad',
                campaign_name: body.campaign_name || 'Test Campaign',
                email: testData.email,
                phone: testData.phone,
                first_name: testData.firstName,
                last_name: testData.lastName,
                full_name: testData.fullName,
                custom_fields: testData.customFields,
                source: 'webhook',
            })
            .select()
            .single();

        if (contactError) {
            steps.push({ step: 'Create Contact', status: 'error', details: contactError.message });
            return NextResponse.json({ success: false, steps, error: 'Failed to create contact' }, { status: 500 });
        }

        steps.push({ step: 'Create Contact', status: 'success', details: `Contact ID: ${contact.id}` });

        // Step 2: AI Analysis
        let analysisResult;
        try {
            analysisResult = await analyzeContact(contact as Contact, []);

            await supabase
                .from('contacts')
                .update({
                    ai_analysis: {
                        ...analysisResult.analysis,
                        analyzed_at: new Date().toISOString(),
                    },
                })
                .eq('id', contact.id);

            steps.push({
                step: 'AI Analysis',
                status: 'success',
                details: `Urgency: ${analysisResult.analysis.urgency}, Tokens: ${analysisResult.tokensUsed}`
            });
        } catch (aiError) {
            steps.push({
                step: 'AI Analysis',
                status: 'error',
                details: aiError instanceof Error ? aiError.message : 'AI analysis failed'
            });
        }

        // Step 3: Pipeline Assignment
        const { data: pipeline } = await supabase
            .from('pipelines')
            .select('*, pipeline_stages(*)')
            .eq('user_id', user.id)
            .eq('is_default', true)
            .single();

        if (pipeline && pipeline.pipeline_stages?.length > 0) {
            try {
                const stages = (pipeline.pipeline_stages as PipelineStage[]).sort(
                    (a, b) => a.order_index - b.order_index
                );

                const stageResult = await assignContactToStage(
                    { ...contact, ai_analysis: analysisResult?.analysis } as Contact,
                    [],
                    stages
                );

                await supabase
                    .from('contact_stage_assignments')
                    .insert({
                        contact_id: contact.id,
                        stage_id: stageResult.suggestion.recommended_stage_id,
                        pipeline_id: pipeline.id,
                        assigned_by: 'ai',
                        notes: 'Test lead',
                    });

                const assignedStage = stages.find(s => s.id === stageResult.suggestion.recommended_stage_id);
                steps.push({
                    step: 'Pipeline Assignment',
                    status: 'success',
                    details: `Assigned to: ${assignedStage?.name || 'Unknown stage'}`
                });

                // Step 4: CAPI Event (if configured)
                if (assignedStage?.capi_event_name && fbConfig?.dataset_id) {
                    steps.push({
                        step: 'CAPI Event',
                        status: 'skipped',
                        details: `Would send: ${assignedStage.capi_event_name} (skipped in test mode)`
                    });
                } else {
                    steps.push({
                        step: 'CAPI Event',
                        status: 'skipped',
                        details: 'No CAPI event configured for this stage'
                    });
                }
            } catch (pipelineError) {
                steps.push({
                    step: 'Pipeline Assignment',
                    status: 'error',
                    details: pipelineError instanceof Error ? pipelineError.message : 'Failed'
                });
            }
        } else {
            steps.push({
                step: 'Pipeline Assignment',
                status: 'skipped',
                details: 'No default pipeline configured'
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Test lead processed successfully!',
            contact_id: contact.id,
            steps,
            summary: {
                total_steps: steps.length,
                successful: steps.filter(s => s.status === 'success').length,
                failed: steps.filter(s => s.status === 'error').length,
                skipped: steps.filter(s => s.status === 'skipped').length,
            },
        });
    } catch (error) {
        console.error('Test webhook failed:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Test failed',
        }, { status: 500 });
    }
}
