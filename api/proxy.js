// /api/proxy.js

// As credenciais são lidas das Variáveis de Ambiente do Vercel
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
// NOVO: Adiciona a chave de serviço
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async (req, res) => {
    // Extrai o 'endpoint' e 'upsert' dos query parameters da URL da requisição Vercel
    const { endpoint, upsert } = req.query;

    if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint Supabase não especificado.' });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Configuração do Supabase ausente nas variáveis de ambiente.' });
    }
    
    // NOVO: Define qual chave usar. Usa Service Key apenas para rotas que exigem ADMIN
    let useServiceKey = false;
    if (endpoint.includes('realizado_manual_historico') || endpoint.includes('orcamentos_mensais')) {
        useServiceKey = true;
    }
    
    const keyToUse = useServiceKey ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
    const authHeader = `Bearer ${keyToUse}`;

    // Monta a URL base do Supabase
    const supabaseBaseUrl = `${SUPABASE_URL}/rest/v1/${endpoint}`;

    // Reconstrói os query parameters originais, removendo os que são do proxy
    const searchParams = new URLSearchParams(req.url.split('?')[1]);
    searchParams.delete('endpoint');
    searchParams.delete('upsert'); 

    // Monta a URL final para o Supabase
    const fullSupabaseUrl = `${supabaseBaseUrl}?${searchParams.toString()}`;

    // Configurações da requisição para o Supabase
    const options = {
        method: req.method, // Repassa o método original (GET, POST, PATCH, DELETE)
        headers: {
            'apikey': keyToUse, // Usa a chave correta aqui também
            'Authorization': authHeader, // Usa o cabeçalho correto
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Prefer': req.headers.prefer || 'return=representation'
        },
    };

    // Adiciona o corpo da requisição se for POST, PATCH ou PUT
    if (req.body && ['POST', 'PATCH', 'PUT'].includes(req.method)) {
        options.body = JSON.stringify(req.body);
    }

    // Lógica para o header 'Prefer' específico do UPSERT
    if (req.method === 'POST' && upsert === 'true') {
        options.headers.Prefer = 'return=representation,resolution=merge-duplicates';
    }

    try {
        console.log(`[Proxy] Forwarding ${req.method} request to: ${fullSupabaseUrl} (Service Key: ${useServiceKey})`); // Log de debug
        if(options.body) console.log(`[Proxy] Body: ${options.body.substring(0, 100)}...`); 

        // Faz a requisição para o Supabase
        const response = await fetch(fullSupabaseUrl, options);

        const responseBodyText = await response.text();
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');

        // Verifica se a resposta do Supabase foi bem-sucedida
        if (!response.ok) {
            console.error('[Proxy] Supabase Error:', response.status, responseBodyText);
            let errorJson;
            try { errorJson = JSON.parse(responseBodyText); }
            catch (e) { return res.status(response.status).send(responseBodyText || 'Erro desconhecido do Supabase'); }
            return res.status(response.status).json(errorJson);
        }

        // Retorna a resposta
        if (responseBodyText) {
            try {
                res.status(response.status).json(JSON.parse(responseBodyText));
            } catch (e) {
                res.status(response.status).send(responseBodyText);
            }
        } else {
            res.status(response.status).end();
        }

    } catch (error) {
        console.error('[Proxy] Erro ao processar a requisição:', error);
        res.status(500).json({ error: 'Falha interna do proxy', details: error.message });
    }
};
