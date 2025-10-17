// /api/proxy.js  (Coloque este arquivo dentro de uma pasta 'api' no seu projeto Vercel)

// Substitua os placeholders abaixo pelas suas credenciais reais
const SUPABASE_URL = "https://xegbsqcaikionewbdnst.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZ2JzcWNhaWtpb25ld2JkbnN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4OTc5ODEsImV4cCI6MjA3NDQ3Mzk4MX0.infICWCbhpqCugTqz8UxS19N4Hc2CuDJl3YO6skrDE0";

export default async (req, res) => {
    // Extrai o 'endpoint' e 'upsert' dos query parameters da URL da requisição Vercel
    const { endpoint, upsert } = req.query;

    if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint Supabase não especificado.' });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        // Esta verificação é mais útil se você estivesse usando variáveis de ambiente
        return res.status(500).json({ error: 'Configuração do Supabase ausente.' });
    }

    // Monta a URL base do Supabase
    const supabaseBaseUrl = `${SUPABASE_URL}/rest/v1/${endpoint}`;

    // Reconstrói os query parameters originais, removendo os que são do proxy
    const searchParams = new URLSearchParams(req.url.split('?')[1]);
    searchParams.delete('endpoint');
    searchParams.delete('upsert'); // Remove o parâmetro upsert dos parâmetros Supabase

    // Monta a URL final para o Supabase
    const fullSupabaseUrl = `${supabaseBaseUrl}?${searchParams.toString()}`;

    // Configurações da requisição para o Supabase
    const options = {
        method: req.method, // Repassa o método original (GET, POST, PATCH, DELETE)
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // Repassa o header 'Prefer' se existir, senão usa o padrão
            'Prefer': req.headers.prefer || 'return=representation'
        },
    };

    // Adiciona o corpo da requisição se for POST, PATCH ou PUT
    if (req.body && ['POST', 'PATCH', 'PUT'].includes(req.method)) {
         // Vercel já faz o parse do corpo, então podemos usá-lo diretamente
        options.body = JSON.stringify(req.body);
    }

    // Lógica para o header 'Prefer' específico do UPSERT
    if (req.method === 'POST' && upsert === 'true') {
        options.headers.Prefer = 'return=representation,resolution=merge-duplicates';
    }

    try {
        // Log para debug (opcional, pode remover em produção)
        console.log(`[Proxy] Forwarding ${req.method} request to: ${fullSupabaseUrl}`);
        if(options.body) console.log(`[Proxy] Body: ${options.body.substring(0, 100)}...`); // Loga o início do corpo

        // Faz a requisição para o Supabase
        const response = await fetch(fullSupabaseUrl, options);

        // Lê o corpo da resposta como texto primeiro para evitar erros de parse
        const responseBodyText = await response.text();

        // Define o header Content-Type da resposta do proxy
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');

        // Verifica se a resposta do Supabase foi bem-sucedida
        if (!response.ok) {
            console.error('[Proxy] Supabase Error:', response.status, responseBodyText);
            // Tenta fazer o parse do erro, se falhar, retorna o texto puro
            let errorJson;
            try { errorJson = JSON.parse(responseBodyText); }
            catch (e) { return res.status(response.status).send(responseBodyText || 'Erro desconhecido do Supabase'); }
            return res.status(response.status).json(errorJson);
        }

        // Se a resposta foi OK:
        if (responseBodyText) {
            // Tenta fazer o parse como JSON, se falhar, retorna o texto puro
            try {
                res.status(response.status).json(JSON.parse(responseBodyText));
            } catch (e) {
                res.status(response.status).send(responseBodyText);
            }
        } else {
            // Se não houver corpo (ex: DELETE bem-sucedido, status 204)
            res.status(response.status).end();
        }

    } catch (error) {
        console.error('[Proxy] Erro ao processar a requisição:', error);
        res.status(500).json({ error: 'Falha interna do proxy', details: error.message });
    }
};
