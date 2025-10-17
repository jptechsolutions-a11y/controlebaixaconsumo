// /api/send-email.js
import { Resend } from 'resend';

// Pega as chaves das Variáveis de Ambiente
const resend = new Resend(process.env.RESEND_API_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev'; // E-mail de envio

/**
 * Função helper para buscar dados do Supabase usando o proxy interno.
 * Isso é necessário para que a API de e-mail possa buscar os detalhes da solicitação.
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
                'Prefer': 'return=representation', // Garante que o objeto seja retornado
            },
        });
        if (!response.ok) {
            throw new Error(`Supabase fetch failed: ${response.statusText}`);
        }
        const data = await response.json();
        // O select com 'limit=1' e 'single' retorna um objeto, senão retorna um array
        return Array.isArray(data) ? data[0] : data;
    } catch (error) {
        console.error('Erro ao buscar dados do Supabase:', error);
        return null;
    }
}

/**
 * Handler principal da API de e-mail
 */
export default async (req, res) => {
    // 1. Segurança: Apenas aceita requisições POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        // 2. Extrai os dados do corpo (que o Supabase Webhook enviará)
        const payload = req.body;
        
        // Log para debug
        console.log('Webhook recebido:', payload.type, 'Record ID:', payload.record?.id);

        let subject = '';
        let htmlBody = '';
        let toEmails = []; // Lista de e-mails para quem enviar

        // 3. Define qual tipo de e-mail disparar
        // (Estamos interessados em INSERT e UPDATE)
        
        if (payload.type === 'INSERT' && payload.table === 'solicitacoes_baixa') {
            // --- NOVA SOLICITAÇÃO ---
            const { id, solicitante_id, filial_id, produto_id } = payload.record;

            // Buscar dados para compor o e-mail
            const solicitante = await fetchSupabaseData(`usuarios?id=eq.${solicitante_id}&select=nome,email&limit=1`);
            const produto = await fetchSupabaseData(`produtos?id=eq.${produto_id}&select=codigo,descricao&limit=1`);
            
            // Buscar TODOS os gestores daquela filial
            const gestoresData = await fetchSupabaseData(`usuario_filiais?filial_id=eq.${filial_id}&select=usuarios(email,role)&usuarios.role=eq.gestor`);
            
            if (gestoresData && Array.isArray(gestoresData)) {
                 toEmails = gestoresData.map(g => g.usuarios.email).filter(Boolean); // Pega só os e-mails
            }

            if (toEmails.length > 0) {
                subject = `Nova Solicitação de Baixa (#${id}) - ${produto.codigo}`;
                htmlBody = `
                    <p>Olá Gestor,</p>
                    <p>Uma nova solicitação de baixa foi criada por <strong>${solicitante.nome}</strong> e aguarda sua aprovação.</p>
                    <ul>
                        <li><strong>Solicitação ID:</strong> ${id}</li>
                        <li><strong>Produto:</strong> ${produto.codigo} - ${produto.descricao}</li>
                    </ul>
                    <p>Por favor, acesse o sistema para aprovar ou negar.</p>
                `;
                // Adiciona o solicitante em cópia (opcional)
                // if (solicitante.email) {
                //    toEmails.push(solicitante.email);
                // }
            }

        } else if (payload.type === 'UPDATE' && payload.table === 'solicitacoes_baixa') {
            // --- ATUALIZAÇÃO DE STATUS (Aprovada, Negada, Finalizada) ---
            const { id, status } = payload.record;
            const old_status = payload.old_record.status;

            // Só envia e-mail se o status mudou
            if (status === old_status) {
                return res.status(200).json({ message: 'Nenhuma mudança de status, e-mail não enviado.' });
            }

            // Buscar dados completos
            const sol = await fetchSupabaseData(`solicitacoes_baixa?id=eq.${id}&select=*,produtos(codigo,descricao),usuarios:usuarios!solicitacoes_baixa_solicitante_id_fkey(nome,email),usuarios_aprovador:usuarios!solicitacoes_baixa_aprovador_id_fkey(nome,email),usuarios_executor:usuarios!solicitacoes_baixa_executor_id_fkey(nome,email),usuarios_retirada:usuarios!solicitacoes_baixa_retirada_por_id_fkey(nome,email)`);

            if (!sol) throw new Error('Solicitação não encontrada para envio de e-mail.');

            const solicitanteEmail = sol.usuarios?.email;

            if (status === 'aprovada') {
                subject = `Solicitação Aprovada (#${id})`;
                htmlBody = `<p>Olá ${sol.usuarios.nome},</p><p>Sua solicitação #${id} (${sol.produtos.codigo}) foi <strong>APROVADA</strong> por ${sol.usuarios_aprovador.nome}.</p>`;
                if (solicitanteEmail) toEmails.push(solicitanteEmail);
            
            } else if (status === 'negada') {
                subject = `Solicitação Negada (#${id})`;
                htmlBody = `<p>Olá ${sol.usuarios.nome},</p><p>Sua solicitação #${id} (${sol.produtos.codigo}) foi <strong>NEGADA</strong> por ${sol.usuarios_aprovador.nome}.</p><p>Motivo: ${sol.motivo_negacao || 'N/A'}</p>`;
                if (solicitanteEmail) toEmails.push(solicitanteEmail);
            
            } else if (status === 'finalizada') {
                // --- E-MAIL DE LAUDO COMPLETO ---
                subject = `Baixa Finalizada (#${id}) - Laudo`;
                htmlBody = `
                    <h1>Laudo de Baixa Finalizada - #${id}</h1>
                    <p>A solicitação de baixa para o produto <strong>${sol.produtos.codigo} - ${sol.produtos.descricao}</strong> foi concluída.</p>
                    <hr>
                    <h3>Detalhes da Solicitação</h3>
                    <ul>
                        <li><strong>Solicitante:</strong> ${sol.usuarios.nome}</li>
                        <li><strong>Data:</strong> ${new Date(sol.data_solicitacao).toLocaleString('pt-BR')}</li>
                        <li><strong>Qtd. Solicitada:</strong> ${sol.quantidade_solicitada}</li>
                        <li><strong>Valor Total Solicitado:</strong> R$ ${sol.valor_total_solicitado.toFixed(2)}</li>
                    </ul>
                    <h3>Detalhes da Execução (Prevenção)</h3>
                    <ul>
                        <li><strong>Executor:</strong> ${sol.usuarios_executor.nome}</li>
                        <li><strong>Data:</strong> ${new Date(sol.data_execucao).toLocaleString('pt-BR')}</li>
                        <li><strong>Qtd. Executada:</strong> ${sol.quantidade_executada}</li>
                        <li><strong>Valor Total Executado:</strong> R$ ${sol.valor_total_executado.toFixed(2)}</li>
                        <li><strong>Justificativa:</strong> ${sol.justificativa_execucao}</li>
                    </ul>
                     <h3>Detalhes da Retirada (Operação)</h3>
                    <ul>
                        <li><strong>Retirado por:</strong> ${sol.usuarios_retirada.nome}</li>
                        <li><strong>Data:</strong> ${new Date(sol.data_retirada).toLocaleString('pt-BR')}</li>
                    </ul>
                `;
                
                // Envia o laudo para todos os envolvidos
                if (sol.usuarios.email) toEmails.push(sol.usuarios.email);
                if (sol.usuarios_aprovador.email) toEmails.push(sol.usuarios_aprovador.email);
                if (sol.usuarios_executor.email) toEmails.push(sol.usuarios_executor.email);
                if (sol.usuarios_retirada.email) toEmails.push(sol.usuarios_retirada.email);
            }
        }

        // 4. Enviar o e-mail (se houver destinatários)
        if (toEmails.length > 0) {
            // Remove duplicados
            const uniqueEmails = [...new Set(toEmails)]; 
            
            console.log(`Enviando e-mail [${subject}] para:`, uniqueEmails);

            await resend.emails.send({
                from: EMAIL_FROM,
                to: uniqueEmails,
                subject: subject,
                html: htmlBody,
            });
            return res.status(200).json({ message: 'E-mail enviado com sucesso.' });
        }

        return res.status(200).json({ message: 'Nenhuma ação de e-mail acionada.' });

    } catch (error) {
        console.error('Erro na API send-email:', error);
        return res.status(500).json({ error: 'Falha ao processar o e-mail.', details: error.message });
    }
};
