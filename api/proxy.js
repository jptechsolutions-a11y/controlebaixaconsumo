// api/proxy.js
import fetch from 'node-fetch';

// As chaves são carregadas das Variáveis de Ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
// NOVO: Adicione a Chave Anônima, pois a API REST do Supabase a requer.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 

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
    // Reconstrói os query parameters originais, removendo os que são do proxy
    const searchParams = new URLSearchParams(req.url.split('?')[1]);
    searchParams.delete('endpoint');
    searchParams.delete('upsert'); 

    // Monta a URL final para o Supabase
    const fullSupabaseUrl = `${SUPABASE_URL}/rest/v1/${endpoint}?${searchParams.toString()}`;
    
    // 3. CONFIGURAÇÃO DA REQUISIÇÃO (USANDO O TOKEN DO USUÁRIO)
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // Token do usuário para RLS (Row Level Security)
            'Authorization': `Bearer ${userJwt}`,
            // CORREÇÃO: Usar a Chave ANÔNIMA para 'apiKey'
            'apiKey': SUPABASE_ANON_KEY 
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
