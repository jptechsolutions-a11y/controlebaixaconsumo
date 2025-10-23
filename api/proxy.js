// api/proxy.js
import fetch from 'node-fetch';

// AS VARIÁVEIS DE CHAVE ANON E SERVICE NÃO SÃO MAIS USADAS
const SUPABASE_URL = process.env.SUPABASE_URL;

export default async (req, res) => {
    const { endpoint } = req.query;
    const { method, body } = req;
    
    // VERIFICAÇÃO INICIAL DE ENDPOINT
    if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint Supabase não especificado.' });
    }

    // 1. MIDDLEWARE DE SEGURANÇA: EXTRAIR E VALIDAR O JWT
    const authHeader = req.headers.authorization;
    
    // Verifica se o cabeçalho de autorização está presente
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // Retorna 401: Não Autorizado
        return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
    }

    // Extrai o token
    const userJwt = authHeader.split(' ')[1];
    
    // 2. CONSTRUÇÃO DA URL E REMOÇÃO DE PARÂMETROS DO PROXY
    // Reconstrói os query parameters originais, removendo os que são do proxy (upsert não será mais necessário aqui)
    const searchParams = new URLSearchParams(req.url.split('?')[1]);
    searchParams.delete('endpoint');
    searchParams.delete('upsert'); // Remove o upsert que era tratado pelo proxy

    // Monta a URL final para o Supabase
    const fullSupabaseUrl = `${SUPABASE_URL}/rest/v1/${endpoint}?${searchParams.toString()}`;
    
    // 3. CONFIGURAÇÃO DA REQUISIÇÃO (USANDO O TOKEN DO USUÁRIO)
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // Agora usamos o TOKEN DO USUÁRIO no cabeçalho "Authorization" (RLS será aplicado)
            'Authorization': `Bearer ${userJwt}`,
            // O Supabase pode aceitar o JWT no apiKey também, mas o Authorization é o principal.
            'apiKey': userJwt
        }
    };

    if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
        options.body = JSON.stringify(body);
    }
    
    // 4. EXECUÇÃO E TRATAMENTO DE ERROS
    try {
        const response = await fetch(fullSupabaseUrl, options);
        
        const responseBodyText = await response.text();
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');

        if (!response.ok) {
            let errorJson;
            try { errorJson = JSON.parse(responseBodyText); }
            catch (e) { return res.status(response.status).send(responseBodyText || 'Erro desconhecido do Supabase'); }
            return res.status(response.status).json(errorJson);
        }

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
