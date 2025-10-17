// /api/upload.js
import { createClient } from '@supabase/supabase-js';

// Pega as credenciais das Variáveis de Ambiente
const supabaseUrl = process.env.SUPABASE_URL;
// IMPORTANTE: Usar a Service Role Key aqui para ter permissão de upload no backend
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Nome do seu bucket no Supabase Storage
const BUCKET_NAME = 'arquivos-baixas'; // <-- VERIFIQUE SE ESTE É O NOME CORRETO DO SEU BUCKET

export default async (req, res) => {
    // 1. Segurança: Apenas aceita requisições POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    // 2. Extrai dados da query string (nome do arquivo e tipo de conteúdo)
    // O frontend enviará o arquivo no corpo como raw binary/octet-stream
    const fileName = req.query.fileName || `arquivo_${Date.now()}`;
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const solicitacaoId = req.query.solicitacaoId; // ID da solicitação para organizar
    const fileType = req.query.fileType || 'anexo'; // 'anexo' ou 'foto_retirada'

    if (!solicitacaoId) {
         return res.status(400).json({ error: 'ID da solicitação não especificado.' });
    }

    // Define o caminho no Storage (Ex: anexos_baixa/123/timestamp_nomearquivo.pdf)
    const folder = fileType === 'foto_retirada' ? 'fotos_retirada' : 'anexos_baixa';
    const filePath = `${folder}/${solicitacaoId}/${Date.now()}_${fileName}`;

    try {
         console.log(`[Upload API] Recebendo arquivo: ${filePath}, Tipo: ${contentType}`);

        // 3. Faz o upload para o Supabase Storage
        // O corpo da requisição (req) é o stream do arquivo
        const { data, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, req, {
                contentType: contentType,
                upsert: false // Não sobrescrever se já existir (improvável com timestamp)
            });

        if (uploadError) {
            console.error('[Upload API] Erro no Supabase Storage Upload:', uploadError);
            throw new Error(`Falha no upload para o Supabase: ${uploadError.message}`);
        }

        // 4. Obtém a URL pública do arquivo recém-criado
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        if (!urlData || !urlData.publicUrl) {
             console.error('[Upload API] Erro ao obter URL pública para:', filePath);
             throw new Error('Falha ao obter a URL pública do arquivo após upload.');
        }

        console.log(`[Upload API] Upload concluído! URL: ${urlData.publicUrl}`);

        // 5. Retorna a URL pública para o frontend
        return res.status(200).json({ publicUrl: urlData.publicUrl });

    } catch (error) {
        console.error('[Upload API] Erro geral:', error);
        return res.status(500).json({ error: 'Falha interna no upload', details: error.message });
    }
};

// Configuração para Vercel entender que o corpo é raw/stream
export const config = {
    api: {
        bodyParser: false, // Desabilita o parse automático do corpo pela Vercel
    },
};
