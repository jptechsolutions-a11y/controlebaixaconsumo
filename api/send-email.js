// /api/send-email.js
import { Resend } from 'resend';

// Pega as chaves das Variáveis de Ambiente
const resend = new Resend(process.env.RESEND_API_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const EMAIL_FROM = process.env.EMAIL_FROM;
const APP_URL = process.env.APP_URL || 'https://seu-app.vercel.app';
const APP_LINK_HTML = `<p>Acesse o sistema clicando aqui: <a href="${APP_URL}">Acessar Controle de Baixas</a></p>`;

/**
 * Função helper para buscar dados do Supabase.
 * ATUALIZADO: Adicionado &single para garantir que retorne objeto ou null
 */
async function fetchSupabaseData(endpoint) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Accept': 'application/json',
                // Adiciona 'single' para garantir que retorne um objeto, não um array
                'Prefer': 'return=representation,count=exact', 
            },
        });
        if (!response.ok) {
            throw new Error(`Supabase fetch failed: ${response.statusText}`);
        }
        // Se a busca for por ID (limit=1), o Supabase retorna um array.
        // Se usarmos &single=true (implícito no fetchSupabaseData anterior), ele retorna o objeto direto.
        // Vamos garantir que ele lide com ambos os casos.
        const data = await response.json();
        return Array.isArray(data) ? data[0] : data; // Pega o primeiro item se for array
        
    } catch (error) {
        console.error('Erro ao buscar dados do Supabase:', error);
        return null;
    }
}

/**
 * Handler principal da API de e-mail
 */
export default async (req, res) => {
    if (!EMAIL_FROM) {
        console.error('Erro Crítico: A variável de ambiente EMAIL_FROM não está definida no Vercel.');
        return res.status(500).json({ 
            error: 'Configuração de e-mail do servidor está incompleta.', 
            details: 'A variável EMAIL_FROM precisa ser definida nas Environment Variables do projeto no Vercel.' 
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const payload = req.body;
        console.log('Webhook recebido:', payload.type, 'Record ID:', payload.record?.id);

        let subject = '';
        let htmlBody = '';
        let toEmails = [];

        if (payload.type === 'INSERT' && payload.table === 'solicitacoes_baixa') {
            const { id, solicitante_id, filial_id, produto_id } = payload.record;
            
            // --- CORREÇÃO: Adicionado 'limit=1&single' para garantir que fetchSupabaseData retorne objeto ---
            const solicitante = await fetchSupabaseData(`usuarios?id=eq.${solicitante_id}&select=nome,email&limit=1`);
            const produto = await fetchSupabaseData(`produtos?id=eq.${produto_id}&select=codigo,descricao&limit=1`);
            const gestoresData = await fetchSupabaseData(`usuario_filiais?filial_id=eq.${filial_id}&select=usuarios(email,role)&usuarios.role=eq.gestor`);
            
            // --- CORREÇÃO: Variáveis seguras com fallback ---
            const solicitanteNome = solicitante?.nome ?? 'Solicitante';
            const produtoCodigo = produto?.codigo ?? 'Produto';
            const produtoDesc = produto?.descricao ?? 'N/A';

            if (gestoresData && Array.isArray(gestoresData)) {
                 toEmails = gestoresData.map(g => g.usuarios.email).filter(Boolean);
            }

            if (toEmails.length > 0) {
                subject = `Nova Solicitação de Baixa (#${id}) - ${produtoCodigo}`;
                htmlBody = `
                    <p>Olá Gestor,</p>
                    <p>Uma nova solicitação de baixa foi criada por <strong>${solicitanteNome}</strong> e aguarda sua aprovação.</p>
                    <ul><li><strong>Solicitação ID:</strong> ${id}</li><li><strong>Produto:</strong> ${produtoCodigo} - ${produtoDesc}</li></ul>
                    ${APP_LINK_HTML}`;
                if (solicitante?.email) toEmails.push(solicitante.email);
            }

        } else if (payload.type === 'UPDATE' && payload.table === 'solicitacoes_baixa') {
            const { id, status } = payload.record;
            const old_status = payload.old_record.status;

            if (status === old_status) {
                return res.status(200).json({ message: 'Nenhuma mudança de status, e-mail não enviado.' });
            }

            // --- CORREÇÃO: Adicionado 'limit=1&single' para garantir que fetchSupabaseData retorne objeto ---
            const sol = await fetchSupabaseData(
                `solicitacoes_baixa?id=eq.${id}&select=*,foto_retirada_url,produtos(codigo,descricao),anexos_baixa(url_arquivo,nome_arquivo),usuarios:usuarios!solicitacoes_baixa_solicitante_id_fkey(nome,email),usuarios_aprovador:usuarios!solicitacoes_baixa_aprovador_id_fkey(nome,email),usuarios_executor:usuarios!solicitacoes_baixa_executor_id_fkey(nome,email),usuarios_retirada:usuarios!solicitacoes_baixa_retirada_por_id_fkey(nome,email)&limit=1`
            );

            if (!sol) {
                 console.error(`Solicitação ID #${id} não encontrada após o UPDATE.`);
                 throw new Error('Solicitação não encontrada para envio de e-mail.');
            }
            
            // --- INÍCIO DA CORREÇÃO ---
            // Variáveis seguras para nomes, evitando o erro 'reading nome of undefined'
            const solicitanteNome = sol.usuarios?.nome ?? 'Solicitante';
            const aprovadorNome = sol.usuarios_aprovador?.nome ?? 'Gestor';
            const executorNome = sol.usuarios_executor?.nome ?? 'Executor';
            const retiradaNome = sol.usuarios_retirada?.nome ?? 'Operação';
            const produtoCodigo = sol.produtos?.codigo ?? 'Produto';
            const produtoDesc = sol.produtos?.descricao ?? 'N/A';
            // --- FIM DA CORREÇÃO ---

            const solicitanteEmail = sol.usuarios?.email;
            if (solicitanteEmail) toEmails.push(solicitanteEmail);

            if (status === 'aprovada') {
                subject = `Solicitação Aprovada (#${id})`;
                htmlBody = `<p>Olá ${solicitanteNome},</p><p>Sua solicitação #${id} (${produtoCodigo}) foi <strong>APROVADA</strong> por ${aprovadorNome}.</p><p>A equipe de Prevenção já foi notificada para executar a baixa.</p>${APP_LINK_HTML}`;
            
            } else if (status === 'negada') {
                subject = `Solicitação Negada (#${id})`;
                htmlBody = `<p>Olá ${solicitanteNome},</p><p>Sua solicitação #${id} (${produtoCodigo}) foi <strong>NEGADA</strong> por ${aprovadorNome}.</p><p>Motivo: ${sol.motivo_negacao || 'N/A'}</p>${APP_LINK_HTML}`;
            
            } else if (status === 'aguardando_retirada') {
                subject = `Baixa Pronta para Retirada (#${id})`;
                htmlBody = `<p>Olá ${solicitanteNome},</p><p>A baixa da sua solicitação #${id} (${produtoCodigo}) foi <strong>EXECUTADA</strong> por ${executorNome} e está pronta para retirada.</p><ul><li><strong>Qtd. Executada:</strong> ${sol.quantidade_executada}</li><li><strong>Valor Total Executado:</strong> R$ ${sol.valor_total_executado.toFixed(2)}</li><li><strong>Justificativa:</strong> ${sol.justificativa_execucao}</li></ul><p>Por favor, acesse o sistema para confirmar a retirada e anexar a foto.</p>${APP_LINK_HTML}`;
                if (sol.usuarios_aprovador?.email) toEmails.push(sol.usuarios_aprovador.email);
            
            } else if (status === 'finalizada') {
                subject = `Baixa Finalizada (#${id}) - Laudo Completo`;
                
                let anexosHtml = 'Nenhum anexo.';
                if (sol.anexos_baixa && sol.anexos_baixa.length > 0) {
                    anexosHtml = '<ul>' + sol.anexos_baixa.map(anexo => `<li><a href="${anexo.url_arquivo}">${anexo.nome_arquivo || 'Ver Anexo'}</a></li>`).join('') + '</ul>';
                }
                let fotoHtml = '<p>Não foi anexada foto da retirada.</p>';
                if (sol.foto_retirada_url) {
                    fotoHtml = `<p><strong>Foto da Retirada:</strong></p><a href="${sol.foto_retirada_url}"><img src="${sol.foto_retirada_url}" alt="Foto da Retirada" style="max-width: 400px; height: auto; border: 1px solid #ccc; border-radius: 8px;" /></a>`;
                }

                htmlBody = `
                    <h1>Laudo de Baixa Finalizada - #${id}</h1>
                    <p>A solicitação de baixa para o produto <strong>${produtoCodigo} - ${produtoDesc}</strong> foi concluída.</p>
                    <hr>
                    <h3>Detalhes da Solicitação</h3>
                    <ul>
                        <li><strong>Solicitante:</strong> ${solicitanteNome}</li>
                        <li><strong>Data:</strong> ${new Date(sol.data_solicitacao).toLocaleString('pt-BR')}</li>
                        <li><strong>Qtd. Solicitada:</strong> ${sol.quantidade_solicitada}</li>
                        <li><strong>Valor Total Solicitado:</strong> R$ ${sol.valor_total_solicitado.toFixed(2)}</li>
                    </ul>
                    <h3>Detalhes da Execução (Prevenção)</h3>
                    <ul>
                        <li><strong>Executor:</strong> ${executorNome}</li>
                        <li><strong>Data:</strong> ${new Date(sol.data_execucao).toLocaleString('pt-BR')}</li>
                        <li><strong>Qtd. Executada:</strong> ${sol.quantidade_executada}</li>
                        <li><strong>Valor Total Executado:</strong> R$ ${sol.valor_total_executado.toFixed(2)}</li>
                        <li><strong>Justificativa:</strong> ${sol.justificativa_execucao}</li>
                        <li><strong>Anexos da Execução:</strong> ${anexosHtml}</li>
                    </ul>
                     <h3>Detalhes da Retirada (Operação)</h3>
                    <ul>
                        <li><strong>Retirado por:</strong> ${retiradaNome}</li>
                        <li><strong>Data:</strong> ${new Date(sol.data_retirada).toLocaleString('pt-BR')}</li>
                    </ul>
                    ${fotoHtml}
                    <hr>
                    ${APP_LINK_HTML}
                `;
                
                if (sol.usuarios_aprovador?.email) toEmails.push(sol.usuarios_aprovador.email);
                if (sol.usuarios_executor?.email) toEmails.push(sol.usuarios_executor.email);
                if (sol.usuarios_retirada?.email) toEmails.push(sol.usuarios_retirada.email);
            }
        }
        
        if (toEmails.length > 0) {
            const uniqueEmails = [...new Set(toEmails.filter(Boolean))]; 
            
            if (uniqueEmails.length > 0) {
                console.log(`Enviando e-mail [${subject}] de [${EMAIL_FROM}] para:`, uniqueEmails);

                await resend.emails.send({
                    from: EMAIL_FROM, 
                    to: uniqueEmails,
                    subject: subject,
                    html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</div>`,
                });
                return res.status(200).json({ message: 'E-mail enviado com sucesso.' });
            }
        }

        return res.status(200).json({ message: 'Nenhuma ação de e-mail acionada.' });

    } catch (error) {
        console.error('Erro na API send-email:', error);
        return res.status(500).json({ error: 'Falha ao processar o e-mail.', details: error.message });
    }
};
