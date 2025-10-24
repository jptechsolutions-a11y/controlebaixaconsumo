// /api/request-access.js
import { Resend } from 'resend';

// --- CARREGA CHAVES DAS VARIÁVEIS DE AMBIENTE (SEGURO) ---
const resendApiKey = process.env.RESEND_API_KEY; // <-- Chave Secreta Resend via process.env
const adminEmail = process.env.ADMIN_EMAIL;     // <-- E-mail do Admin via process.env
const emailFrom = process.env.EMAIL_FROM;       // <-- E-mail Remetente via process.env
// --- FIM DO CARREGAMENTO SEGURO ---

// Validação inicial das variáveis
if (!resendApiKey || !adminEmail || !emailFrom) {
    console.error('ERRO CRÍTICO [request-access]: Variáveis RESEND_API_KEY, ADMIN_EMAIL ou EMAIL_FROM ausentes.');
}

// Inicializa o cliente Resend (APENAS se a chave existir)
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export default async (req, res) => {
    // 1. Verifica se o cliente Resend e e-mails estão configurados
    if (!resend || !adminEmail || !emailFrom) {
        // Não exponha detalhes no erro retornado ao cliente
        return res.status(500).json({ error: 'Configuração interna do servidor para envio de e-mail incompleta.' });
    }

    // 2. Permite apenas método POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const { nome, email, motivo } = req.body;

        // 3. Validação rigorosa dos inputs
        if (!nome || typeof nome !== 'string' || nome.trim().length === 0 || nome.length > 100) { // Limite de tamanho
            return res.status(400).json({ error: 'Nome inválido ou ausente (máx 100 caracteres).' });
        }
        // Validação de e-mail mais robusta (exemplo simples)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || typeof email !== 'string' || !emailRegex.test(email) || email.length > 100) {
            return res.status(400).json({ error: 'E-mail inválido ou ausente (máx 100 caracteres).' });
        }
        if (!motivo || typeof motivo !== 'string' || motivo.trim().length === 0 || motivo.length > 500) { // Limite de tamanho
            return res.status(400).json({ error: 'Motivo/Justificativa inválido ou ausente (máx 500 caracteres).' });
        }

        // Sanitiza os inputs antes de usar no corpo do e-mail (usando a função do seu frontend)
        // Você precisaria ter essa função `escapeHTML` disponível aqui ou usar uma biblioteca
        const escapeHTML = (str) => {
             if (str === null || str === undefined) return '';
             return String(str)
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;');
        };
        const safeNome = escapeHTML(nome.trim());
        const safeEmail = escapeHTML(email.trim());
        const safeMotivo = escapeHTML(motivo.trim()).replace(/\n/g, '<br>'); // Preserva quebras de linha no HTML

        console.log(`[request-access] Recebida solicitação de ${safeNome} (${safeEmail})`);

        // 4. Monta o conteúdo do e-mail para o administrador (com dados sanitizados)
        const subject = `Nova Solicitação de Acesso - Controle de Baixas`;
        const emailBodyHtml = `
            <h1>Nova Solicitação de Acesso</h1>
            <p>Um novo usuário solicitou acesso ao sistema Controle de Baixas:</p>
            <ul>
                <li><strong>Nome:</strong> ${safeNome}</li>
                <li><strong>E-mail:</strong> ${safeEmail}</li>
                <li><strong>Motivo/Justificativa:</strong></li>
            </ul>
            <p style="padding: 10px; border-left: 3px solid #ccc; background-color: #f9f9f9;">${safeMotivo}</p>
            <hr>
            <p><strong>Ação Necessária:</strong> Para conceder acesso, crie uma conta para este usuário no painel de Autenticação do Supabase e, em seguida, edite o perfil dele no sistema ("Gerenciar Usuários") para atribuir o grupo (Role) e as filiais corretas.</p>
        `;
        const emailBodyText = `
            Nova Solicitação de Acesso - Controle de Baixas\n
            Nome: ${safeNome}\n
            E-mail: ${safeEmail}\n
            Motivo/Justificativa:\n${motivo.trim()}\n\n
            Ação Necessária: Crie a conta no Supabase Auth e edite o perfil no sistema.
        `; // Usa motivo original (sem <br>) para texto puro

        // 5. Envia o e-mail usando Resend (com as chaves carregadas via process.env)
        const { data, error } = await resend.emails.send({
            from: emailFrom, // Usa a variável de ambiente
            to: adminEmail, // Usa a variável de ambiente
            subject: subject,
            html: emailBodyHtml,
            text: emailBodyText,
            reply_to: safeEmail // Usa e-mail sanitizado
        });

        // 6. Tratamento de Erro do Resend
        if (error) {
            console.error(`[request-access] Erro ao enviar e-mail via Resend para ${adminEmail}:`, error);
            const errorMessage = error.message || 'Falha ao enviar e-mail de notificação.';
            return res.status(500).json({ error: errorMessage });
        }

        console.log(`[request-access] E-mail de notificação enviado para ${adminEmail}. ID: ${data?.id}`);

        // 7. Resposta de Sucesso
        return res.status(200).json({ message: 'Solicitação de acesso enviada com sucesso!' });

    } catch (error) {
        // Erro inesperado no servidor
        console.error('[request-access] Erro interno do servidor:', error);
        const safeErrorMessage = (typeof error?.message === 'string') ? error.message : 'Erro interno do servidor.';
        return res.status(500).json({ error: 'Erro interno do servidor ao processar a solicitação.', details: safeErrorMessage });
    }
};
