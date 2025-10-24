// /api/upload.js
import { createClient } from '@supabase/supabase-js';

// Pega as credenciais das Variáveis de Ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// --- AJUSTE DE SEGURANÇA ---
// Crie um cliente anônimo APENAS para verificar o JWT do usuário
const supabaseAnon = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY); 
// --- FIM DO AJUSTE ---

// Cliente com Service Key para a função .getPublicUrl()
const supabase = createClient(supabaseUrl, supabaseServiceKey); 

const BUCKET_NAME = 'arquivos-baixas';

export default async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    // --- INÍCIO DA VALIDAÇÃO DE SEGURANÇA ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autorizado. Token JWT ausente.' });
    }
    
    const token = authHeader.split(' ')[1];
    // Verifica se o token é válido
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);

    if (authError || !user) {
        console.error("Erro de autenticação no upload:", authError?.message);
        return res.status(401).json({ error: 'Não autorizado. Token inválido.' });
    }
    // --- FIM DA VALIDAÇÃO ---


    // A lógica de nomes de arquivo e pastas continua a mesma
    const fileName = req.query.fileName || `arquivo_${Date.now()}`;
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const solicitacaoId = req.query.solicitacaoId;
    const fileType = req.query.fileType || 'anexo';

    if (!solicitacaoId) {
         return res.status(400).json({ error: 'ID da solicitação não especificado.' });
    }

    const folder = fileType === 'foto_retirada' ? 'fotos_retirada' : (fileType === 'nf_externa' ? 'nfs_externas' : 'anexos_baixa');
    const filePath = `${folder}/${solicitacaoId}/${Date.now()}_${fileName}`;

    // ---- INÍCIO DA NOVA LÓGICA DE UPLOAD ----
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET_NAME}/${filePath}`;
    
    try {
        console.log(`[Upload API v4 - Manual Fetch] Tentando POST para: ${uploadUrl}`);
        
        // Faz o POST direto para a REST API do Supabase Storage
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`, // Chave de serviço
                'Content-Type': contentType,
                'x-upsert': 'false' // Equivalente ao upsert: false
            },
            body: req, // Passa o stream 'req' (o arquivo) diretamente
            
            // --- A CORREÇÃO MÁGICA ---
            // @ts-ignore
            duplex: 'half' 
            // --- FIM DA CORREÇÃO ---
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error('[Upload API v4] Erro do Supabase Storage (Manual Fetch):', errorBody);
            throw new Error(errorBody.message || 'Falha ao fazer upload para o storage.');
        }
        
        console.log('[Upload API v4] Upload manual concluído.');

        // ---- FIM DA NOVA LÓGICA ----

        // Se o upload deu certo (status 200), agora usamos o cliente
        // Supabase apenas para obter a URL pública
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        if (!urlData || !urlData.publicUrl) {
             console.error('[Upload API v4] Erro ao obter URL pública para:', filePath);
             throw new Error('Falha ao obter a URL pública do arquivo após upload.');
        }

        console.log(`[Upload API v4] Upload concluído! URL: ${urlData.publicUrl}`);

        return res.status(200).json({ publicUrl: urlData.publicUrl });

    } catch (error) {
        console.error('[Upload API v4] Erro geral:', error);
        return res.status(500).json({ error: 'Falha interna no upload', details: error.message });
    }
};

// Configuração para Vercel *NÃO* fazer parse do corpo (continua necessária)
export const config = {
    api: {
        bodyParser: false,
    },
};
