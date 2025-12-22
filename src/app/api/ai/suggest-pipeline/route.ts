import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServerClientWithCookies } from '@/lib/supabase/client';
import { suggestPipeline, suggestMultiplePipelines } from '@/lib/services/nvidiaAIService';
import type { Contact } from '@/lib/types';

// POST /api/ai/suggest-pipeline - Generate pipeline suggestion(s)
export async function POST(request: NextRequest) {
    const authClient = await createServerClientWithCookies();
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const model = body.model || 'meta/llama-3.1-8b-instruct';
        const businessGoal = body.business_goal || body.business_context || '';
        const generateMultiple = body.generate_multiple === true;

        // Get user's contacts (up to 200 for analysis)
        const { data: contacts, error: contactsError } = await supabase
            .from('contacts')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(200);

        if (contactsError) {
            console.error('Failed to fetch contacts:', contactsError);
            return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
        }

        if (!contacts || contacts.length === 0) {
            return NextResponse.json({
                error: 'No contacts found. Add some contacts first before generating a pipeline.'
            }, { status: 400 });
        }

        if (generateMultiple && businessGoal) {
            // Generate multiple pipeline variations
            const result = await suggestMultiplePipelines(contacts as Contact[], businessGoal, model);

            // Log the AI action
            await supabase
                .from('ai_analysis_logs')
                .insert({
                    user_id: user.id,
                    action_type: 'suggest_pipeline',
                    model_used: model,
                    input_summary: `Generated ${result.suggestions.length} pipeline variations for goal: "${businessGoal}" from ${contacts.length} contacts`,
                    output_summary: `Pipelines: ${result.suggestions.map(s => s.name).join(', ')}`,
                    tokens_used: result.tokensUsed,
                });

            return NextResponse.json({
                suggestions: result.suggestions,
                tokens_used: result.tokensUsed,
                contacts_analyzed: contacts.length,
            });
        } else {
            // Generate single pipeline suggestion
            const result = await suggestPipeline(contacts as Contact[], businessGoal, model);

            // Log the AI action
            await supabase
                .from('ai_analysis_logs')
                .insert({
                    user_id: user.id,
                    action_type: 'suggest_pipeline',
                    model_used: model,
                    input_summary: `Analyzed ${contacts.length} contacts for pipeline suggestion`,
                    output_summary: `Suggested: ${result.suggestion.name} with ${result.suggestion.stages.length} stages`,
                    tokens_used: result.tokensUsed,
                });

            return NextResponse.json({
                suggestion: result.suggestion,
                tokens_used: result.tokensUsed,
                contacts_analyzed: contacts.length,
            });
        }
    } catch (err) {
        console.error('Pipeline suggestion error:', err);
        return NextResponse.json({ error: 'Failed to generate pipeline suggestion' }, { status: 500 });
    }
}

