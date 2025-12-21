import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { bulkAssignContacts, analyzeContact } from '@/lib/services/nvidiaAIService';
import type { Contact, PipelineStage } from '@/lib/types';

// POST /api/ai/analyze - Analyze contacts and optionally assign to stages
export async function POST(request: NextRequest) {
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const model = body.model || 'meta/llama-3.1-8b-instruct';
        const pipelineId = body.pipeline_id;
        const contactIds = body.contact_ids; // Optional: specific contacts to analyze

        // Get contacts to analyze
        let contactsQuery = supabase
            .from('contacts')
            .select('*')
            .eq('user_id', user.id);

        if (contactIds && Array.isArray(contactIds) && contactIds.length > 0) {
            contactsQuery = contactsQuery.in('id', contactIds);
        } else {
            // Get unanalyzed contacts or all if none specified
            contactsQuery = contactsQuery
                .is('ai_analysis', null)
                .limit(50);
        }

        const { data: contacts, error: contactsError } = await contactsQuery;

        if (contactsError) {
            console.error('Failed to fetch contacts:', contactsError);
            return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
        }

        if (!contacts || contacts.length === 0) {
            return NextResponse.json({
                message: 'No contacts to analyze',
                analyzed: 0,
            });
        }

        // Analyze each contact
        let totalTokens = 0;
        const analyzedContacts: Contact[] = [];

        for (const contact of contacts) {
            try {
                // Get contact's messages
                const { data: messages } = await supabase
                    .from('messages')
                    .select('content, direction, created_at')
                    .eq('contact_id', contact.id)
                    .order('created_at', { ascending: true })
                    .limit(20);

                const result = await analyzeContact(
                    contact as Contact,
                    messages || [],
                    model
                );

                // Update contact with analysis
                await supabase
                    .from('contacts')
                    .update({
                        ai_analysis: {
                            ...result.analysis,
                            analyzed_at: new Date().toISOString(),
                        },
                    })
                    .eq('id', contact.id);

                analyzedContacts.push({
                    ...contact,
                    ai_analysis: result.analysis,
                } as Contact);

                totalTokens += result.tokensUsed;
            } catch (analysisError) {
                console.error(`Failed to analyze contact ${contact.id}:`, analysisError);
            }
        }

        // If pipeline_id is provided, assign contacts to stages
        let assignments: { contact_id: string; stage_id: string; confidence: number }[] = [];

        if (pipelineId && analyzedContacts.length > 0) {
            // Get pipeline stages
            const { data: stages, error: stagesError } = await supabase
                .from('pipeline_stages')
                .select('*')
                .eq('pipeline_id', pipelineId)
                .order('order_index');

            if (!stagesError && stages && stages.length > 0) {
                const bulkResult = await bulkAssignContacts(
                    analyzedContacts,
                    stages as PipelineStage[],
                    model
                );

                assignments = bulkResult.assignments;
                totalTokens += bulkResult.tokensUsed;

                // Save assignments to database
                for (const assignment of assignments) {
                    await supabase
                        .from('contact_stage_assignments')
                        .upsert({
                            contact_id: assignment.contact_id,
                            stage_id: assignment.stage_id,
                            pipeline_id: pipelineId,
                            assigned_by: 'ai',
                        }, {
                            onConflict: 'contact_id,pipeline_id',
                        });
                }
            }
        }

        // Log the AI action
        await supabase
            .from('ai_analysis_logs')
            .insert({
                user_id: user.id,
                action_type: pipelineId ? 'bulk_assign' : 'analyze_contact',
                model_used: model,
                input_summary: `Analyzed ${analyzedContacts.length} contacts`,
                output_summary: pipelineId
                    ? `Assigned ${assignments.length} contacts to stages`
                    : `Completed analysis for ${analyzedContacts.length} contacts`,
                tokens_used: totalTokens,
            });

        return NextResponse.json({
            analyzed: analyzedContacts.length,
            assignments: assignments.length,
            tokens_used: totalTokens,
        });
    } catch (err) {
        console.error('Analysis error:', err);
        return NextResponse.json({ error: 'Failed to analyze contacts' }, { status: 500 });
    }
}
