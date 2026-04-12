import { Hono } from 'https://esm.sh/hono@4.3.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors } from 'https://esm.sh/hono@4.3.0/cors'

const app = new Hono()

// Middleware de CORS para permitir requisições do frontend
app.use('/*', cors())

app.post('/*', async (c) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const x402ServerUrl = Deno.env.get('X402_SERVER_URL') || 'http://localhost:3000';

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Receber POST com { escrow_id, release_to_payee: bool }
    const body = await c.req.json();
    const { escrow_id, release_to_payee } = body;

    if (!escrow_id || release_to_payee === undefined) {
      return c.json({ error: 'Missing escrow_id or release_to_payee parameters' }, 400);
    }

    // 2. Buscar o escrow na tabela escrows pelo escrow_id e verificar se status é disputed
    const { data: escrowData, error: escrowError } = await supabase
      .from('escrows')
      .select('id, status')
      .eq('escrow_id', escrow_id)
      .single();

    if (escrowError || !escrowData) {
      return c.json({ error: 'Escrow not found in database', details: escrowError }, 404);
    }

    // 3. Se não for disputed, retornar erro 400
    if (escrowData.status !== 'disputed') {
      return c.json({ error: 'Escrow is not in disputed status' }, 400);
    }

    // 4. Fazer fetch para o servidor x402 em POST /resolve passando o body
    const paymentHeader = c.req.header('X-PAYMENT');
    const headersInit: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Propagar header de pagamento, se existir, para o servidor x402
    if (paymentHeader) {
      headersInit['X-PAYMENT'] = paymentHeader;
    }

    const x402Res = await fetch(`${x402ServerUrl}/resolve`, {
      method: 'POST',
      headers: headersInit,
      body: JSON.stringify(body)
    });

    // 5. Se receber 402, extrair o header X-PAYMENT-REQUIRED e retornar para o frontend
    if (x402Res.status === 402) {
      const paymentRequiredStr = x402Res.headers.get('X-PAYMENT-REQUIRED') || x402Res.headers.get('x-payment-required');
      return c.json({ error: 'Payment required' }, 402, {
        'X-PAYMENT-REQUIRED': paymentRequiredStr || ''
      });
    }

    if (!x402Res.ok) {
        const errText = await x402Res.text();
        return c.json({ error: 'Error calling x402 server', details: errText }, x402Res.status);
    }

    // 6. Se receber 200, pegar o veredito retornado
    const verdictData = await x402Res.json();
    const { verdict } = verdictData; // esperado "payee" ou "payer"

    // 7. Atualizar a tabela escrows: setar status para completed ou refunded baseado no verdict
    const finalStatus = verdict === 'payee' ? 'completed' : 'refunded';
    const { error: updateError } = await supabase
      .from('escrows')
      .update({ status: finalStatus })
      .eq('escrow_id', escrow_id);

    if (updateError) {
      return c.json({ error: 'Failed to update escrow status', details: updateError }, 500);
    }

    // 8. Inserir um registro na tabela event_logs com event_type DisputeOpened e o payload do veredito
    const { error: insertError } = await supabase
      .from('event_logs')
      .insert([
        {
          escrow_id: escrow_id,
          event_type: 'DisputeOpened',
          payload: verdictData
        }
      ]);

    if (insertError) {
      console.warn('Failed to insert event_logs record:', insertError);
    }

    // 9. Retornar o veredito final para o frontend
    return c.json(verdictData, 200);

  } catch (error: any) {
    return c.json({ error: 'Internal server error', details: error.message }, 500);
  }
});

// Inicializando o servidor Deno na Edge Function
Deno.serve(app.fetch)
