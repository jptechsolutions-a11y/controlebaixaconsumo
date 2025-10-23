// api/proxy.js (Conteúdo completo e corrigido)
import fetch from 'node-fetch';

// As chaves são carregadas das Variáveis de Ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 

export default async (req, res) => {
    const { endpoint } = req.query;
    const { method, body } = req;
    
    // ... Código para obter o userJwt e montar a URL ...

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
    }
    const userJwt = authHeader.split(' ')[1];
    
    const searchParams = new URLSearchParams(req.url.split('?')[1]);
    searchParams.delete('endpoint');
    searchParams.delete('upsert'); 
    const fullSupabaseUrl = `${SUPABASE_URL}/rest/v1/${endpoint}?${searchParams.toString()}`;
    
    // 3. CONFIGURAÇÃO DA REQUISIÇÃO (USANDO O TOKEN DO USUÁRIO)
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // Token do usuário para RLS (Row Level Security)
            'Authorization': `Bearer ${userJwt}`,
            // CORREÇÃO: Usar a Chave ANÔNIMA para 'apiKey' (Requisito da API REST)
            'apiKey': SUPABASE_ANON_KEY 
        }
    };

    if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
        options.body = JSON.stringify(body);
    }
    
    // ... Código para execução e tratamento de erros ...

    try {
        const response = await fetch(fullSupabaseUrl, options);
        // ... (resto do tratamento de erro)
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
