import { supabase } from '../lib/supabase';

interface TokenUsage {
  provider: string;
  tokens: number;
  cost: number;
  timestamp: string;
}

export async function logTokenUsage(
  provider: string,
  tokens: number,
  cost: number = 0
): Promise<void> {
  try {
    console.log('Logging token usage:', { provider, tokens, cost });

    if (!provider || tokens < 0) {
      throw new Error('Invalid token usage data');
    }

    const { error } = await supabase
      .from('token_usage')
      .insert({
        provider,
        tokens,
        cost,
        timestamp: new Date().toISOString()
      });

    if (error) {
      console.error('Error inserting token usage:', error);
      // Don't throw here - we don't want token logging to break the assessment
      return;
    }

    console.log('Token usage logged successfully');
  } catch (error) {
    console.error('Error logging token usage:', error);
    // Don't throw - token logging should not break the main functionality
  }
}

export async function getTokenUsage(
  startDate?: Date,
  endDate?: Date
): Promise<TokenUsage[]> {
  try {
    let query = supabase
      .from('token_usage')
      .select('*')
      .order('timestamp', { ascending: false });

    if (startDate) {
      query = query.gte('timestamp', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('timestamp', endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching token usage:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getTokenUsage:', error);
    throw error instanceof Error ? error : new Error('Failed to fetch token usage');
  }
}