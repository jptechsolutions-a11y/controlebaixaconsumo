// /api/send-email.js
import { Resend } from 'resend';

// Pega as chaves das Variáveis de Ambiente
const resend = new Resend(process.env.RESEND_API_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const EMAIL_FROM = process.env.EMAIL_FROM;
const APP_URL = process.env.APP_URL || 'https://seu-app.vercel.app';

// Links para HTML e Texto Puro
const APP_LINK_HTML = `<p>Acesse o sistema clicando aqui: <a href="${APP_URL}">Acessar Controle de Baixas</a></p>`;
const APP_LINK_TEXT = `Acesse o sistema em: ${APP_URL}`;

// --- NOVAS FUNÇÕES HELPER DE FETCH (Sem alteração) ---

/**
 * Função helper para buscar MÚLTIPLOS registros do Supabase.
 * Retorna um array.
 */
async function fetchSupabaseQuery(endpoint) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Accept': 'application/json'
            },
        });
        if (!response.ok) {
            throw new Error(`Supabase fetch failed: ${response.statusText}`);
        }
        const data = await response.json();
        return data || []; // Retorna array vazio se a resposta for nula
    } catch (error) {
        console.error('Erro ao buscar query do Supabase:', error);
        return [];
    }
}

/**
 * Função helper para buscar UM ÚNICO registro do Supabase.
 * Retorna um objeto ou null.
 */
async function fetchSupabaseRecord(endpoint) {
    // Garante que a query peça apenas 1 registro
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}${separator}limit=1`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Accept': 'application/json',
                 // Pede um objeto único em vez de um array
                'Prefer': 'return=representation'
            },
        });
        if (!response.ok) {
            throw new Error(`Supabase fetch failed: ${response.statusText}`);
        }
        const data = await response.json();
        return (Array.isArray(data) && data.length > 0) ? data[0] : null; // Retorna o primeiro item ou null
    } catch (error) {
        console.error('Erro ao buscar record do Supabase:', error);
        return null;
    }
}


/**
 * Helper para formatar uma lista de itens em HTML e TEXTO
 * AGORA RETORNA UM OBJETO: { html: "...", text: "..." }
 */
function formatarListaItens(itens) {
    if (!itens || itens.length === 0) {
        return {
            html: '<p>Nenhum item encontrado.</p>',
            text: 'Nenhum item encontrado.'
        };
    }
    
    const totalPedido = itens.reduce((acc, item) => acc + (item.valor_total_solicitado || 0), 0);
    
    let html = '<ul>';
    let text = '';
    
    itens.forEach(item => {
        const produtoDesc = item.produtos ? `${item.produtos.codigo} - ${item.produtos.descricao}` : 'Produto desconhecido';
        
        html += `
            <li>
                <strong>${produtoDesc}</strong><br>
                Qtd: ${item.quantidade_solicitada} | 
                Valor: R$ ${item.valor_total_solicitado.toFixed(2)}
            </li>
        `;
        
        // Versão em texto puro
        text += `* ${produtoDesc}\n  Qtd: ${item.quantidade_solicitada} | Valor: R$ ${item.valor_total_solicitado.toFixed(2)}\n`;
    });
    
    html += '</ul>';
    html += `<p><strong>Valor Total do Pedido: R$ ${totalPedido.toFixed(2)}</strong></p>`;
    
    text += `\nValor Total do Pedido: R$ ${totalPedido.toFixed(2)}`;
    
    return { html, text };
}

/**
 * Handler principal da API de e-mail (REESCRITO)
 */
export default async (req, res) => {
    if (!EMAIL_FROM) {
        console.error('Erro Crítico: A variável de ambiente EMAIL_FROM não está definida no Vercel.');
        return res.status(500).json({ error: 'Configuração de e-mail do servidor está incompleta.' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const payload = req.body;
        console.log('Webhook recebido:', payload.type, 'Tabela:', payload.table, 'Record ID:', payload.record?.id);

        let subject = '';
        let htmlBody = '';
        let textBody = ''; // NOVO: Variável para o texto puro
        let toEmails = [];

        // --- LÓGICA PARA A TABELA DE PEDIDOS (solicitacoes_baixa) ---
        if (payload.table === 'solicitacoes_baixa') {
            
            // Evento: Novo Pedido criado
            if (payload.type === 'INSERT') {
                const { id, solicitante_id, filial_id } = payload.record;
                
                // 1. Buscar o Solicitante (para notificar)
                const solicitante = await fetchSupabaseRecord(`usuarios?id=eq.${solicitante_id}&select=nome,email`);
                // 2. Buscar os Gestores (para aprovar)
                const gestoresData = await fetchSupabaseQuery(`usuario_filiais?filial_id=eq.${filial_id}&select=usuarios(email,role)&usuarios.role=eq.gestor`);
                // 3. Buscar os Itens do pedido
                const itens = await fetchSupabaseQuery(`solicitacao_itens?solicitacao_id=eq.${id}&select=quantidade_solicitada,valor_total_solicitado,produtos(codigo,descricao)`);

                const solicitanteNome = solicitante?.nome ?? 'Solicitante';
                if (gestoresData && gestoresData.length > 0) {
                    toEmails = gestoresData.map(g => g.usuarios.email).filter(Boolean);
                }

                // Pega ambas as versões HTML e Texto
                const { html: itensHtml, text: itensText } = formatarListaItens(itens);

                if (toEmails.length > 0) {
                    subject = `Nova Solicitação de Baixa (#${id}) - ${itens.length} Iten(s)`;
                    
                    htmlBody = `
                        <p>Olá Gestor,</p>
                        <p>Uma nova solicitação de baixa com ${itens.length} iten(s) foi criada por <strong>${solicitanteNome}</strong> e aguarda sua aprovação.</p>
                        <h3>Itens do Pedido:</h3>
                        ${itensHtml}
                        ${APP_LINK_HTML}`;
                    
                    textBody = `Olá Gestor,\n\nUma nova solicitação de baixa com ${itens.length} iten(s) foi criada por ${solicitanteNome} e aguarda sua aprovação.\n\nItens do Pedido:\n${itensText}\n\n${APP_LINK_TEXT}`;
                    
                    // Adiciona o solicitante na cópia
                    if (solicitante?.email) toEmails.push(solicitante.email);
                }
            }
            
            // Evento: Pedido foi Aprovado ou Negado
            else if (payload.type === 'UPDATE') {
                const { id, status, solicitante_id } = payload.record;
                const old_status = payload.old_record.status;

                if (status === old_status) {
                    return res.status(200).json({ message: 'Nenhuma mudança de status, e-mail não enviado.' });
                }

                // 1. Buscar o Solicitante (para notificar)
                const solicitante = await fetchSupabaseRecord(`usuarios?id=eq.${solicitante_id}&select=nome,email`);
                if (solicitante?.email) toEmails.push(solicitante.email);

                // 2. Buscar os Itens do pedido
                const itens = await fetchSupabaseQuery(`solicitacao_itens?solicitacao_id=eq.${id}&select=quantidade_solicitada,valor_total_solicitado,motivo_negacao,produtos(codigo,descricao),usuarios_aprovador:usuarios!solicitacao_itens_aprovador_id_fkey(nome)`);

                const solicitanteNome = solicitante?.nome ?? 'Solicitante';
                const aprovadorNome = itens[0]?.usuarios_aprovador?.nome ?? 'Gestor';
                const motivo = itens[0]?.motivo_negacao || 'N/A';
                
                // Pega ambas as versões HTML e Texto
                const { html: itensHtml, text: itensText } = formatarListaItens(itens);

                if (status === 'aprovada') {
                    subject = `Pedido Aprovado (#${id})`;
                    htmlBody = `<p>Olá ${solicitanteNome},</p><p>Seu pedido #${id} foi <strong>APROVADO</strong> por ${aprovadorNome}.</p><p>A equipe de Prevenção já foi notificada para executar a baixa dos itens.</p>${itensHtml}${APP_LINK_HTML}`;
                    textBody = `Olá ${solicitanteNome},\n\nSeu pedido #${id} foi APROVADO por ${aprovadorNome}.\nA equipe de Prevenção já foi notificada para executar a baixa dos itens.\n\n${itensText}\n\n${APP_LINK_TEXT}`;
                } 
                else if (status === 'negada') {
                    subject = `Pedido Negado (#${id})`;
                    htmlBody = `<p>Olá ${solicitanteNome},</p><p>Seu pedido #${id} foi <strong>NEGADO</strong> por ${aprovadorNome}.</p><p>Motivo: ${motivo}</p>${itensHtml}${APP_LINK_HTML}`;
                    textBody = `Olá ${solicitanteNome},\n\nSeu pedido #${id} foi NEGADO por ${aprovadorNome}.\nMotivo: ${motivo}\n\n${itensText}\n\n${APP_LINK_TEXT}`;
                }
            }
        }
        
        // --- LÓGICA PARA A TABELA DE ITENS (solicitacao_itens) ---
        else if (payload.table === 'solicitacao_itens') {
            
            // Evento: Um item foi atualizado
            if (payload.type === 'UPDATE') {
                const { id, status, solicitacao_id } = payload.record;
                const old_status = payload.old_record.status;

                if (status === old_status) {
                    return res.status(200).json({ message: 'Nenhuma mudança de status do item.' });
                }
                
                // 1. Buscar o Pedido (para pegar o solicitante)
                const pedido = await fetchSupabaseRecord(`solicitacoes_baixa?id=eq.${solicitacao_id}&select=usuarios(nome,email)`);
                const solicitanteNome = pedido?.usuarios?.nome ?? 'Solicitante';
                const solicitanteEmail = pedido?.usuarios?.email;
                if (solicitanteEmail) toEmails.push(solicitanteEmail);

                // 2. Buscar os dados completos do ITEM atualizado
                const item = await fetchSupabaseRecord(
                    `solicitacao_itens?id=eq.${id}&select=*,produtos(codigo,descricao),usuarios_executor:usuarios!solicitacao_itens_executor_id_fkey(nome,email),usuarios_retirada:usuarios!solicitacao_itens_retirada_por_id_fkey(nome,email),usuarios_aprovador:usuarios!solicitacao_itens_aprovador_id_fkey(nome,email)`
                );
                
                if (!item) throw new Error(`Item #${id} não encontrado.`);

                const executorNome = item.usuarios_executor?.nome ?? 'Executor';
                const retiradaNome = item.usuarios_retirada?.nome ?? 'Operação';
                const produtoDesc = item.produtos ? `${item.produtos.codigo} - ${item.produtos.descricao}` : 'Produto';

                // Evento: Item pronto para retirada
                if (status === 'aguardando_retirada') {
                    subject = `Item Pronto para Retirada (Pedido #${solicitacao_id}, Item #${id})`;
                    
                    htmlBody = `
                        <p>Olá ${solicitanteNome},</p>
                        <p>O item <strong>${produtoDesc}</strong> (Pedido #${solicitacao_id}) foi <strong>EXECUTADO</strong> por ${executorNome} e está pronto para retirada.</p>
                        <ul>
                            <li><strong>Qtd. Executada:</strong> ${item.quantidade_executada}</li>
                            <li><strong>Valor Total Executado:</strong> R$ ${item.valor_total_executado.toFixed(2)}</li>
                            <li><strong>Justificativa:</strong> ${item.justificativa_execucao}</li>
                            <li><strong>CGO:</strong> ${item.codigo_movimentacao}</li>
                        </ul>
                        <p>Por favor, acesse o sistema para confirmar a retirada no modal de "Detalhes" do pedido ou na lista principal.</p>
                        ${APP_LINK_HTML}`;
                    
                    textBody = `Olá ${solicitanteNome},\n\nO item "${produtoDesc}" (Pedido #${solicitacao_id}) foi EXECUTADO por ${executorNome} e está pronto para retirada.\n\n* Qtd. Executada: ${item.quantidade_executada}\n* Valor Total Executado: R$ ${item.valor_total_executado.toFixed(2)}\n* Justificativa: ${item.justificativa_execucao}\n* CGO: ${item.codigo_movimentacao}\n\nPor favor, acesse o sistema para confirmar a retirada.\n\n${APP_LINK_TEXT}`;
                    
                    if (item.usuarios_aprovador?.email) toEmails.push(item.usuarios_aprovador.email);
                } 
                
                // Evento: Item finalizado (Laudo do Item)
                else if (status === 'finalizada') {
                    subject = `Baixa de Item Finalizada (Item #${id}) - Laudo`;
                    
                    // Busca anexos do PEDIDO PAI (pois o upload.js salva na pasta do pedido)
                    const anexos = await fetchSupabaseQuery(`anexos_baixa?solicitacao_id=eq.${solicitacao_id}`);
                    
                    // Versão HTML dos anexos
                    let anexosHtml = 'Nenhum anexo encontrado para este pedido.';
                    if (anexos && anexos.length > 0) {
                        anexosHtml = '<ul>' + anexos.map(anexo => `<li><a href="${anexo.url_arquivo}">${anexo.nome_arquivo || 'Ver Anexo'}</a></li>`).join('') + '</ul>';
                    }
                    // Versão TEXTO dos anexos
                    let anexosText = 'Nenhum anexo encontrado para este pedido.';
                    if (anexos && anexos.length > 0) {
                        anexosText = anexos.map(anexo => `* ${anexo.nome_arquivo || 'Ver Anexo'}: ${anexo.url_arquivo}`).join('\n');
                    }
                    
                    // Versão HTML das fotos
                    let fotosHtml = '<p>Não foram anexadas fotos da retirada.</p>';
                    if (item.fotos_retirada_urls && item.fotos_retirada_urls.length > 0) {
                        fotosHtml = '<p><strong>Fotos/Anexos da Retirada:</strong></p>';
                        item.fotos_retirada_urls.forEach(url => {
                            if (/\.(jpe?g|png|gif|webp)$/i.test(url)) {
                                fotosHtml += `<a href="${url}" style="margin-right: 10px; display: inline-block; border: 1px solid #ccc; border-radius: 8px; padding: 5px;"><img src="${url}" alt="Foto da Retirada" style="max-width: 300px; height: auto;" /></a>`;
                            } else {
                                fotosHtml += `<a href="${url}" style="display: block; margin-top: 5px;">Ver Anexo (PDF ou outro)</a>`;
                            }
                        });
                    }
                    // Versão TEXTO das fotos
                    let fotosText = 'Não foram anexadas fotos da retirada.';
                     if (item.fotos_retirada_urls && item.fotos_retirada_urls.length > 0) {
                        fotosText = 'Fotos/Anexos da Retirada:\n' + item.fotos_retirada_urls.map(url => `* Ver anexo: ${url}`).join('\n');
                     }
                    
                    htmlBody = `
                        <h1>Laudo de Item Finalizado - (Pedido #${solicitacao_id}, Item #${id})</h1>
                        <p>A baixa para o item <strong>${produtoDesc}</strong> foi concluída.</p>
                        <hr>
                        <h3>Detalhes da Execução (Prevenção)</h3>
                        <ul>
                            <li><strong>Executor:</strong> ${executorNome}</li>
                            <li><strong>Data:</strong> ${new Date(item.data_execucao).toLocaleString('pt-BR')}</li>
                            <li><strong>Qtd. Executada:</strong> ${item.quantidade_executada}</li>
                            <li><strong>Valor Total Executado:</strong> R$ ${item.valor_total_executado.toFixed(2)}</li>
                            <li><strong>Justificativa:</strong> ${item.justificativa_execucao}</li>
                            <li><strong>Anexos do Pedido (Execução):</strong> ${anexosHtml}</li>
                        </ul>
                         <h3>Detalhes da Retirada (Operação)</h3>
                        <ul>
                            <li><strong>Retirado por:</strong> ${retiradaNome}</li>
                            <li><strong>Data:</strong> ${new Date(item.data_retirada).toLocaleString('pt-BR')}</li>
                        </ul>
                        ${fotosHtml}
                        <hr>
                        ${APP_LINK_HTML}
                    `;
                    
                    textBody = `
Laudo de Item Finalizado - (Pedido #${solicitacao_id}, Item #${id})
A baixa para o item "${produtoDesc}" foi concluída.
------------------------------------------------
Detalhes da Execução (Prevenção)
* Executor: ${executorNome}
* Data: ${new Date(item.data_execucao).toLocaleString('pt-BR')}
* Qtd. Executada: ${item.quantidade_executada}
* Valor Total Executado: R$ ${item.valor_total_executado.toFixed(2)}
* Justificativa: ${item.justificativa_execucao}
* Anexos do Pedido (Execução):\n${anexosText}

Detalhes da Retirada (Operação)
* Retirado por: ${retiradaNome}
* Data: ${new Date(item.data_retirada).toLocaleString('pt-BR')}

${fotosText}
------------------------------------------------
${APP_LINK_TEXT}
                    `;
                    
                    // Envia o laudo para todos os envolvidos no item
                    if (item.usuarios_aprovador?.email) toEmails.push(item.usuarios_aprovador.email);
                    if (item.usuarios_executor?.email) toEmails.push(item.usuarios_executor.email);
                    if (item.usuarios_retirada?.email) toEmails.push(item.usuarios_retirada.email);
                }
            }
        }
        
        
        if (toEmails.length > 0 && subject && (htmlBody || textBody)) {
            const uniqueEmails = [...new Set(toEmails.filter(Boolean))]; 
            
            if (uniqueEmails.length > 0) {
                console.log(`Enviando e-mail [${subject}] de [${EMAIL_FROM}] para:`, uniqueEmails);

                await resend.emails.send({
                    from: EMAIL_FROM, 
                    to: uniqueEmails,
                    subject: subject,
                    html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</div>`,
                    text: textBody, // AQUI ESTÁ A CORREÇÃO
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
