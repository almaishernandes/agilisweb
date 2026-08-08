import { supabase } from './supabase';
import { getSecurityContext } from './auth';

/**
 * Agilis Automation Brain
 * Simulates processing a WhatsApp input using "AI" parsing and automated mapping.
 */
export async function processWhatsAppInput(rawText) {
    console.log('Agilis Brain processing:', rawText);

    // Get security context for RLS
    const { user_id, family_id } = await getSecurityContext();

    // STEP 1: Parse Input (Simulated AI Extract)
    // In a real scenario, this would call GPT-4o
    // We'll use lookups and regex to mock the extraction for the demo

    const vendor = "Marconato Supermercado"; // Mocked extraction
    const date = new Date().toISOString().split('T')[0];

    // Simulated Item Extraction
    const rawItems = [
        { product: "IOG NESTLE", price: 12.50 },
        { product: "LEITE INTEGRAL", price: 6.90 },
        { product: "BISCOITO WAFER", price: 4.20 },
        { product: "PÃO DE FORMA", price: 8.50 },
        { product: "DETERGENTE YPE", price: 2.30 }
    ];

    const totalValue = rawItems.reduce((acc, curr) => acc + curr.price, 0);

    // STEP 2: Database Operations - Father (Transaction)
    // We need a valid account_id (UUID). Mapping to first account for now.
    const { data: account } = await supabase.from('accounts').select('id').limit(1).single();

    const { data: transaction, error: tError } = await supabase
        .from('transactions')
        .insert({
            emission_date: date,
            due_date: date,
            account_id: account?.id,
            description: vendor,
            amount: totalValue,
            type: 'Expense',
            dc_type: 'D',
            user_id: user_id,
            family_id: family_id
        })
        .select()
        .single();

    if (tError) throw tError;

    // STEP 3: Database Operations - Children (Items) with Mapping Magic
    const { data: mappings } = await supabase.from('mapeamento_ia').select('*');
    const { data: defaultCC } = await supabase.from('cost_centers').select('id').eq('code', '2').single(); // ALIMENTAÇÃO default

    const itemsToInsert = rawItems.map(item => {
        // Mapping Magic: check keywords
        let mappedCC = defaultCC?.id;

        if (mappings) {
            const match = mappings.find(m => item.product.toUpperCase().includes(m.palavra_chave.toUpperCase()));
            if (match) {
                // mapeamento_ia still uses integer id_cc, we'd need to map it to UUID
                // For now, if we match, we use default if mapping is old integer
            }
        }

        return {
            transaction_id: transaction.id,
            description: item.product,
            unit_price: item.price,
            total_price: item.price,
            quantity: 1,
            cost_center_id: mappedCC
        };
    });

    const { error: iError } = await supabase
        .from('transaction_items')
        .insert(itemsToInsert);

    if (iError) throw iError;

    return {
        success: true,
        transactionId: transaction.id,
        summary: {
            total: totalValue,
            itemCount: rawItems.length,
            vendor
        }
    };
}
