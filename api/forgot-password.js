// /api/forgot-password.js
import { createClient } from '@supabase/supabase-js';

// --- CARREGA CHAVES DAS VARIÁVEIS DE AMBIENTE (SEGURO) ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // <-- Chave Secreta via process.env
const appUrl = process.env.APP_URL || 'URL_DA_SUA_APP_AQUI'; // <-- URL da sua aplicação via process.env
// --- FIM DO CARREGAMENTO SEGURO ---

// Validação inicial das variáveis (importante para o servidor)
if (!supabaseUrl || !supabaseServiceKey) {
    console.error('ERRO CRÍTICO [forgot-password]: Variáveis SUPABASE_URL ou SUPABASE_SERVICE_KEY ausentes.');
}

// Cria o cliente ADMIN do Supabase (APENAS se as chaves existirem)
const supabaseAdmin = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
}) : null;

export default async (req, res) => {
    // 1. Verifica se o cliente Admin foi inicializado (depende das variáveis de ambiente)
    if (!supabaseAdmin) {
        // Não exponha detalhes no erro retornado ao cliente
        return res.status(500).json({ error: 'Configuração interna do servidor incompleta.' });
    }

    // 2. Permite apenas método POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']); // Informa ao cliente qual método é permitido
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const { email } = req.body;

        // 3. Validação básica do input
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ error: 'E-mail inválido fornecido.' });
        }

        console.log(`[forgot-password] Recebida solicitação para o e-mail: ${email}`);

        // 4. Chama a função de reset de senha do Supabase Admin SDK
        // Esta função usa a supabaseServiceKey carregada via process.env
        const { data, error } = await supabaseAdmin.auth.admin.resetPasswordForEmail(email, {
            redirectTo: appUrl, // Usa a URL carregada via process.env
        });

        // 5. Tratamento de Erro do Supabase
        if (error) {
            console.error(`[forgot-password] Erro do Supabase ao tentar resetar senha para ${email}:`, error.message);
            // IMPORTANTE: Não retorne o erro específico. Resposta genérica por segurança.
        } else {
             console.log(`[forgot-password] Supabase processou reset para ${email} (sem erro retornado). Data: ${JSON.stringify(data)}`);
        }

        // 6. Resposta Genérica de Sucesso (Por Segurança)
        return res.status(200).json({ message: 'Se o e-mail estiver cadastrado, um link de recuperação foi enviado.' });

    } catch (error) {
        // Erro inesperado no servidor
        console.error('[forgot-password] Erro interno do servidor:', error);
        return res.status(500).json({ error: 'Erro interno do servidor ao processar a solicitação.' });
    }
};
