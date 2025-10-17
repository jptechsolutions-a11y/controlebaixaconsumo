// /api/upload.js
import { createClient } from '@supabase/supabase-js';

// Pega as credenciais das Variáveis de Ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BUCKET_NAME = 'arquivos-baixas';

// Função para ler o stream da requisição em um buffer
async function streamToBuffer(readableStream) {
    const chunks = [];
    for await (const chunk of readableStream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

export default async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    const fileName = req.query.fileName || `arquivo_${Date.now()}`;
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const solicitacaoId = req.query.solicitacaoId;
    const fileType = req.query.fileType || 'anexo';

    if (!solicitacaoId) {
         return res.status(400).json({ error: 'ID da solicitação não especificado.' });
    }

    const folder = fileType === 'foto_retirada' ? 'fotos_retirada' : 'anexos_baixa';
    const filePath = `${folder}/${solicitacaoId}/${Date.now()}_${fileName}`;

    try {
         console.log(`[Upload API v2] Recebendo arquivo: ${filePath}, Tipo: ${contentType}`);

        // --- MUDANÇA PRINCIPAL: Ler stream para buffer ---
        console.log('[Upload API v2] Lendo stream para buffer...');
        const fileBuffer = await streamToBuffer(req);
        console.log(`[Upload API v2] Buffer criado com tamanho: ${fileBuffer.length} bytes`);
        // --- FIM DA MUDANÇA ---

        // Faz o upload usando o buffer em vez do stream 'req'
        const { data, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, fileBuffer, { // <<<=== ENVIA O BUFFER
                contentType: contentType,
                upsert: false
            });

        if (uploadError) {
            console.error('[Upload API v2] Erro no Supabase Storage Upload:', uploadError);
            // Tenta fornecer mais detalhes do erro original, se disponível
            const details = uploadError.originalError?.message || uploadError.message;
            throw new Error(`Falha no upload para o Supabase: ${details}`);
        }

        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        if (!urlData || !urlData.publicUrl) {
             console.error('[Upload API v2] Erro ao obter URL pública para:', filePath);
             throw new Error('Falha ao obter a URL pública do arquivo após upload.');
        }

        console.log(`[Upload API v2] Upload concluído! URL: ${urlData.publicUrl}`);

        return res.status(200).json({ publicUrl: urlData.publicUrl });

    } catch (error) {
        console.error('[Upload API v2] Erro geral:', error);
        return res.status(500).json({ error: 'Falha interna no upload', details: error.message });
    }
};

// Configuração para Vercel *NÃO* fazer parse do corpo (continua necessária)
export const config = {
    api: {
        bodyParser: false,
    },
};
