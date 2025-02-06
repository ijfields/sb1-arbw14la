import { getProviderConfig } from './services/ai/config';
import { getAIService } from './services/ai/factory';
import { supabase } from './lib/supabase';
import type { ExecutiveOrder } from './types';

async function testAssessment() {
  try {
    console.log('Starting assessment test...');

    // Get one pending and one verified order
    const { data: orders, error: ordersError } = await supabase
      .from('executive_orders')
      .select('*')
      .or('status.eq.pending,status.eq.verified')
      .limit(2);

    if (ordersError) throw ordersError;
    if (!orders?.length) throw new Error('No test orders found');

    // Get a policy document
    const { data: documents, error: docsError } = await supabase
      .from('policy_documents')
      .select('*')
      .limit(1);

    if (docsError) throw docsError;
    if (!documents?.length) throw new Error('No policy documents found');

    const document = documents[0];
    console.log('Testing with document:', {
      id: document.id,
      title: document.title,
      type: document.document_type
    });

    // Test each order with both providers
    for (const order of orders) {
      console.log(`Testing order ${order.number} (${order.status})...`);

      const providers = ['latimer', 'perplexity'] as const;
      for (const provider of providers) {
        try {
          console.log(`Testing ${provider}...`);
          const config = getProviderConfig(provider);
          const service = await getAIService(provider, config);

          const result = await service.assess({
            executiveOrderText: order.summary || order.title,
            policyDocumentText: document.content,
            maxTokens: 500,
            temperature: 0.3
          });

          console.log(`${provider} assessment result:`, {
            rating: result.rating,
            confidence: result.confidence,
            textPreview: result.text.substring(0, 100) + '...'
          });

          // Store the assessment
          const { error: insertError } = await supabase
            .from('ai_assessments')
            .insert({
              executive_order_id: order.id,
              policy_document_id: document.id,
              provider,
              assessment_text: result.text,
              rating: result.rating,
              confidence: result.confidence
            });

          if (insertError) throw insertError;

          console.log(`${provider} assessment stored successfully`);
        } catch (error) {
          console.error(`Error with ${provider}:`, error);
        }
      }

      // Update impact assessment
      await updateImpactAssessment(order.id, document.id);
    }

    console.log('Assessment test completed successfully');
  } catch (error) {
    console.error('Assessment test failed:', error);
    throw error;
  }
}

async function updateImpactAssessment(
  executiveOrderId: string,
  policyDocumentId: string
) {
  // Get all AI assessments for this combination
  const { data: assessments, error } = await supabase
    .from('ai_assessments')
    .select('*')
    .eq('executive_order_id', executiveOrderId)
    .eq('policy_document_id', policyDocumentId);

  if (error) throw error;
  if (!assessments?.length) return;

  // Calculate weighted average
  const weights = { latimer: 0.6, perplexity: 0.4 };
  const scores = { positive: 1, neutral: 0, negative: -1 };
  
  let totalWeight = 0;
  let weightedScore = 0;
  let totalConfidence = 0;

  assessments.forEach(assessment => {
    const weight = weights[assessment.provider];
    const score = scores[assessment.rating];
    
    weightedScore += score * weight * assessment.confidence;
    totalWeight += weight;
    totalConfidence += assessment.confidence;
  });

  const avgScore = weightedScore / totalWeight;
  const avgConfidence = totalConfidence / assessments.length;

  // Determine final rating
  let finalRating: 'positive' | 'neutral' | 'negative';
  if (avgScore > 0.3) finalRating = 'positive';
  else if (avgScore < -0.3) finalRating = 'negative';
  else finalRating = 'neutral';

  // Update impact assessment
  const { error: updateError } = await supabase
    .from('impact_assessments')
    .upsert({
      executive_order_id: executiveOrderId,
      policy_document_id: policyDocumentId,
      final_rating: finalRating,
      confidence: avgConfidence,
      last_updated: new Date().toISOString()
    });

  if (updateError) throw updateError;
  
  console.log('Impact assessment updated:', {
    rating: finalRating,
    confidence: avgConfidence
  });
}

// Run the test
if (require.main === module) {
  testAssessment()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}