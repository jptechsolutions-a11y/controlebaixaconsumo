// --- Variáveis Globais ---
let currentUser = null; // { id, nome, username, role, filiais: [{id, nome}] }
let selectedFilial = null; // { id, nome, descricao }
let produtosCache = []; // Cache simples de produtos para lookup
let todasFiliaisCache = []; // Cache de todas as filiais para admin

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Listeners para cálculo automático e busca de produto
    const qtdInput = document.getElementById('quantidadeSolicitada');
    const valorInput = document.getElementById('valorUnitarioSolicitado');
    const codigoInput = document.getElementById('produtoCodigo');

    if (qtdInput && valorInput) {
        qtdInput.addEventListener('input', calcularValorTotalSolicitado);
        valorInput.addEventListener('input', calcularValorTotalSolicitado);
    }
    if (codigoInput) {
        codigoInput.addEventListener('blur', buscarProdutoPorCodigo); // Ao sair do campo
    }

    // Listeners para modal de execução
    const qtdExecInput = document.getElementById('quantidadeExecutada');
    const valorExecInput = document.getElementById('valorUnitarioExecutado');
    if (qtdExecInput && valorExecInput) {
        qtdExecInput.addEventListener('input', calcularValorTotalExecutado);
        valorExecInput.addEventListener('input', calcularValorTotalExecutado);
    }

    // Bind forms (novos)
    document.getElementById('novaSolicitacaoForm')?.addEventListener('submit', handleNovaSolicitacaoSubmit);
    document.getElementById('executarForm')?.addEventListener('submit', handleExecucaoSubmit);
    document.getElementById('retiradaForm')?.addEventListener('submit', handleRetiradaSubmit);
    // NOVO LISTENER
    document.getElementById('usuarioForm')?.addEventListener('submit', handleUsuarioFormSubmit);

});

// --- Funções de Autenticação e Navegação ---

async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value; // Não use trim na senha
    const filialSelect = document.getElementById('filialSelect');
    const filialIdSelecionada = filialSelect.value;
    const alertContainer = document.getElementById('loginAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Autenticando...</div>';

    try {
        // 1. Buscar usuário pelo username
        const userResponse = await supabaseRequest(`usuarios?username=eq.${username}&select=id,nome,senha_hash,role,ativo`);

        if (!userResponse || userResponse.length === 0 || !userResponse[0].ativo) {
            throw new Error('Usuário não encontrado ou inativo.');
        }

        const user = userResponse[0];

        // --- INÍCIO DA ALTERAÇÃO (Comparação de Senha) ---
        // Compara a senha digitada com o valor na coluna senha_hash do banco
        // ATENÇÃO: ISSO SÓ FUNCIONA COM SENHAS EM TEXTO PLANO NO BANCO (NÃO SEGURO!)
        if (password !== user.senha_hash) {
             throw new Error('Senha incorreta.');
        }
        // --- FIM DA ALTERAÇÃO ---


        // 2. Buscar filiais associadas ao usuário
        const filiaisResponse = await supabaseRequest(`usuario_filiais?usuario_id=eq.${user.id}&select=filial_id(id,nome,descricao)`);

        if (!filiaisResponse || filiaisResponse.length === 0) {
            throw new Error('Usuário não associado a nenhuma filial.');
        }

        const filiaisUsuario = filiaisResponse.map(f => f.filial_id);

        currentUser = {
            id: user.id,
            nome: user.nome,
            username: username,
            role: user.role,
            filiais: filiaisUsuario
        };

        // 3. Lógica de Seleção de Filial
        if (filiaisUsuario.length === 1) {
            // Apenas uma filial, seleciona automaticamente
            selectedFilial = filiaisUsuario[0];
            showMainSystem();
        } else {
            // Múltiplas filiais
            const filialSelectGroup = document.getElementById('filialSelectGroup');
            if (filialSelectGroup.style.display === 'none') {
                // Primeira vez, popula o select e mostra
                filialSelect.innerHTML = '<option value="">-- Selecione uma Filial --</option>';
                filiaisUsuario.forEach(f => {
                    filialSelect.innerHTML += `<option value="${f.id}">${f.nome} - ${f.descricao}</option>`;
                });
                filialSelectGroup.style.display = 'block';
                alertContainer.innerHTML = '<div class="alert alert-info">Selecione a filial desejada.</div>';
            } else {
                // Segunda vez (já selecionou a filial no dropdown)
                if (!filialIdSelecionada) {
                    throw new Error('Por favor, selecione uma filial.');
                }
                selectedFilial = filiaisUsuario.find(f => f.id == filialIdSelecionada);
                if (!selectedFilial) {
                     throw new Error('Filial selecionada inválida.');
                }
                showMainSystem();
            }
        }

    } catch (error) {
        console.error("Erro no login:", error);
        // AJUSTE: Mostrar error.message em vez do objeto error inteiro
        alertContainer.innerHTML = `<div class="alert alert-error">${error.message}</div>`;
        document.getElementById('filialSelectGroup').style.display = 'none'; // Esconde filial em caso de erro
    }
}

function showMainSystem() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('mainSystem').style.display = 'flex';

    // Preenche informações no Sidebar
    document.getElementById('sidebarUser').textContent = currentUser.nome;
    document.getElementById('sidebarFilial').textContent = `${selectedFilial.nome} (${selectedFilial.descricao})`;

    // Filtra os links da navegação baseado no role
    filterSidebarNav();

    // Mostra a view inicial (pode ser a home ou a primeira permitida)
    showView('homeView'); // Ou determine a view inicial baseada no role

    showNotification(`Acesso liberado para filial ${selectedFilial.nome}!`, 'success');
}

function filterSidebarNav() {
    const navItems = document.querySelectorAll('.sidebar nav .nav-item');
    let firstVisibleLink = null;

    navItems.forEach(item => {
        const roles = item.dataset.role ? item.dataset.role.split(',') : [];
        // CORREÇÃO: Garante que admin veja tudo corretamente
        if (roles.length === 0 || roles.includes(currentUser.role) || currentUser.role === 'admin') {
            item.style.display = 'flex';
            if (!firstVisibleLink && item.getAttribute('href') !== '#gerenciarUsuarios') { // Não define admin como padrão
                firstVisibleLink = item; // Guarda o primeiro link visível
            }
        } else {
            item.style.display = 'none';
        }
    });

    // Opcional: Ativar o primeiro link visível como default
    // Prioriza 'home' se o usuário for 'admin', senão usa o primeiro link
    if (currentUser.role === 'admin') {
        showView('homeView', document.querySelector('a[href="#homeView"]'));
    } else if (firstVisibleLink) {
        const viewId = firstVisibleLink.getAttribute('href').substring(1) + 'View';
        showView(viewId, firstVisibleLink);
    } else {
        showView('homeView'); // Fallback para home
    }
}


function showView(viewId, element = null) {
    // Esconde todas as views
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
    // Mostra a view desejada
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.add('active');
    }

    // Atualiza o item ativo na navegação
    document.querySelectorAll('.sidebar nav .nav-item').forEach(item => item.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    } else {
        // Se nenhum elemento foi passado, tenta encontrar pelo href
        const linkSelector = viewId === 'homeView' ? '.sidebar nav a[href="#homeView"]' : `.sidebar nav a[href="#${viewId.replace('View', '')}"]`;
        const link = document.querySelector(linkSelector);
        if (link) link.classList.add('active');
    }


    // Carrega dados específicos da view
    switch (viewId) {
        case 'novaSolicitacaoView':
            // Limpar formulário? Carregar algum dado inicial?
            document.getElementById('novaSolicitacaoForm')?.reset();
            break;
        case 'minhasSolicitacoesView':
            loadMinhasSolicitacoes();
            break;
        case 'aprovarSolicitacoesView':
            loadAprovacoesPendentes();
            break;
        case 'executarSolicitacoesView':
            loadExecucoesPendentes();
            break;
        case 'historicoBaixasView':
            loadHistoricoGeral();
            break;
        // NOVO CASE
        case 'gerenciarUsuariosView':
            loadGerenciarUsuarios();
            break;
        // Adicione mais casos conforme necessário
    }

    // Re-renderizar ícones Feather (importante após mudar views)
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
     // Re-inicializar AOS para animações na nova view (se usar)
    if (typeof AOS !== 'undefined') {
        AOS.refresh();
    }
}

function logout() {
    currentUser = null;
    selectedFilial = null;
    todasFiliaisCache = []; // Limpa o cache de admin
    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('loginForm').reset();
    document.getElementById('loginAlert').innerHTML = '';
    document.getElementById('filialSelectGroup').style.display = 'none';
    showNotification('Você foi desconectado.', 'info');
}

// --- Funções de Lógica de Negócio (Solicitações) ---

async function buscarProdutoPorCodigo() {
    const codigo = document.getElementById('produtoCodigo').value.trim();
    const descricaoInput = document.getElementById('produtoDescricao');
    const produtoIdInput = document.getElementById('produtoId');
    const valorUnitInput = document.getElementById('valorUnitarioSolicitado'); // Campo de valor unitário

    if (!codigo) {
        descricaoInput.value = '';
        produtoIdInput.value = '';
        valorUnitInput.value = ''; // Limpa o valor unitário
        calcularValorTotalSolicitado();
        return;
    }

    try {
        // Tenta buscar no cache simples
        let produto = produtosCache.find(p => p.codigo === codigo);

        if (!produto) {
            // Se não está no cache, busca no banco
            const response = await supabaseRequest(`produtos?codigo=eq.${codigo}&select=id,descricao`); // Remover valor_unitario_padrao
            if (response && response.length > 0) {
                produto = response[0];
                produtosCache.push(produto); // Adiciona ao cache
            }
        }

        if (produto) {
            descricaoInput.value = produto.descricao;
            produtoIdInput.value = produto.id;
            // Limpa o valor unitário - o usuário DEVE digitar
            valorUnitInput.value = '';
            valorUnitInput.focus(); // Coloca o foco no campo de valor
        } else {
            descricaoInput.value = 'Produto não encontrado';
            produtoIdInput.value = '';
            valorUnitInput.value = ''; // Limpa o valor unitário
            showNotification('Produto não cadastrado.', 'error');
        }
        calcularValorTotalSolicitado(); // Recalcula total (que será 0)

    } catch (error) {
        console.error("Erro ao buscar produto:", error);
        descricaoInput.value = 'Erro ao buscar';
        produtoIdInput.value = '';
        valorUnitInput.value = ''; // Limpa o valor unitário
        showNotification('Erro ao buscar produto.', 'error');
    }
}


function calcularValorTotalSolicitado() {
    const qtd = parseFloat(document.getElementById('quantidadeSolicitada').value) || 0;
    const valorUnit = parseFloat(document.getElementById('valorUnitarioSolicitado').value) || 0;
    const total = qtd * valorUnit;
    document.getElementById('valorTotalSolicitado').value = total.toFixed(2);
}

async function handleNovaSolicitacaoSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('novaSolicitacaoAlert');
    alertContainer.innerHTML = '';

    const produtoId = document.getElementById('produtoId').value;
    const quantidade = parseInt(document.getElementById('quantidadeSolicitada').value);
    const valorUnitario = parseFloat(document.getElementById('valorUnitarioSolicitado').value);
    const valorTotal = parseFloat(document.getElementById('valorTotalSolicitado').value);

    if (!produtoId || isNaN(quantidade) || quantidade <= 0 || isNaN(valorUnitario) || valorUnitario < 0) {
        alertContainer.innerHTML = '<div class="alert alert-error">Verifique os dados do produto, quantidade e valor.</div>';
        return;
    }

    const solicitacaoData = {
        filial_id: selectedFilial.id,
        produto_id: produtoId,
        solicitante_id: currentUser.id,
        quantidade_solicitada: quantidade,
        valor_unitario_solicitado: valorUnitario,
        valor_total_solicitado: valorTotal,
        status: 'aguardando_aprovacao'
    };

    try {
        await supabaseRequest('solicitacoes_baixa', 'POST', solicitacaoData);
        showNotification('Solicitação de baixa enviada com sucesso!', 'success');
        document.getElementById('novaSolicitacaoForm').reset();
        // Opcional: Redirecionar para "Minhas Solicitações"
        showView('minhasSolicitacoesView', document.querySelector('a[href="#minhasSolicitacoes"]'));

    } catch (error) {
        console.error("Erro ao enviar solicitação:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao enviar: ${error.message}</div>`;
    }
}

// --- Funções de Carregamento de Dados das Views ---

async function loadMinhasSolicitacoes() {
    const tbody = document.getElementById('minhasSolicitacoesBody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading"><div class="spinner"></div>Carregando...</td></tr>`;

    try {
        const response = await supabaseRequest(
            `solicitacoes_baixa?solicitante_id=eq.${currentUser.id}&filial_id=eq.${selectedFilial.id}&select=id,data_solicitacao,status,quantidade_solicitada,valor_total_solicitado,produtos(codigo,descricao)&order=data_solicitacao.desc`
        );
        renderSolicitacoesTable(tbody, response || [], 'operacao');
    } catch (error) {
        console.error("Erro ao carregar minhas solicitações:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}

async function loadAprovacoesPendentes() {
    const tbody = document.getElementById('aprovarSolicitacoesBody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading"><div class="spinner"></div>Carregando...</td></tr>`;

    try {
        // Gestor vê todas da(s) sua(s) filial(is)
        const filialIds = currentUser.filiais.map(f => f.id);
        const response = await supabaseRequest(
            `solicitacoes_baixa?status=eq.aguardando_aprovacao&filial_id=in.(${filialIds.join(',')})&select=id,data_solicitacao,quantidade_solicitada,valor_total_solicitado,produtos(codigo,descricao),usuarios!solicitacoes_baixa_solicitante_id_fkey(nome)&order=data_solicitacao.asc`
        );
        renderSolicitacoesTable(tbody, response || [], 'gestor');
    } catch (error) {
        console.error("Erro ao carregar aprovações:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}

async function loadExecucoesPendentes() {
    const tbody = document.getElementById('executarSolicitacoesBody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading"><div class="spinner"></div>Carregando...</td></tr>`;

    try {
        // Prevenção vê todas aprovadas da(s) sua(s) filial(is)
         const filialIds = currentUser.filiais.map(f => f.id);
        const response = await supabaseRequest(
            `solicitacoes_baixa?status=eq.aprovada&filial_id=in.(${filialIds.join(',')})&select=id,data_solicitacao,quantidade_solicitada,valor_total_solicitado,produtos(codigo,descricao),usuarios!solicitacoes_baixa_solicitante_id_fkey(nome)&order=data_solicitacao.asc`
        );
        renderSolicitacoesTable(tbody, response || [], 'prevencao');
    } catch (error) {
        console.error("Erro ao carregar execuções:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}

async function loadHistoricoGeral() {
    const tbody = document.getElementById('historicoBaixasBody');
    tbody.innerHTML = `<tr><td colspan="9" class="loading"><div class="spinner"></div>Carregando histórico...</td></tr>`;

     try {
        // Gestor/Admin vê histórico de suas filiais
        const filialIds = currentUser.filiais.map(f => f.id);
        const response = await supabaseRequest(
            `solicitacoes_baixa?filial_id=in.(${filialIds.join(',')})&select=id,data_solicitacao,status,quantidade_executada,valor_total_executado,filiais(nome),produtos(codigo,descricao),usuarios!solicitacoes_baixa_solicitante_id_fkey(nome)&order=data_solicitacao.desc&limit=100` // Limite para performance
        );
        renderSolicitacoesTable(tbody, response || [], 'historico');
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
        tbody.innerHTML = `<tr><td colspan="9" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}


// --- Funções de Renderização ---

function renderSolicitacoesTable(tbody, solicitacoes, context) {
    if (!solicitacoes || solicitacoes.length === 0) {
        const colspan = context === 'historico' ? 9 : 7;
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-4 text-gray-500">Nenhuma solicitação encontrada.</td></tr>`;
        return;
    }

    tbody.innerHTML = solicitacoes.map(s => {
        const produtoDesc = s.produtos ? `${s.produtos.codigo} - ${s.produtos.descricao}` : 'Produto não encontrado';
        const solicitanteNome = s.usuarios ? s.usuarios.nome : 'Desconhecido';
        const dataSol = new Date(s.data_solicitacao).toLocaleDateString('pt-BR');
        const valorSol = (s.valor_total_solicitado || 0).toFixed(2);
        const valorExec = (s.valor_total_executado || 0).toFixed(2);
        const qtdExec = s.quantidade_executada ?? '-';
        const filialNome = s.filiais ? s.filiais.nome : selectedFilial.nome; // Para histórico

        let actions = '';
        if (context === 'operacao') {
            actions += `<button class="btn btn-primary btn-small" onclick="abrirDetalhesModal('${s.id}')">Ver</button>`;
            if (s.status === 'aguardando_retirada') {
                 actions += `<button class="btn btn-success btn-small ml-1" onclick="abrirRetiradaModal('${s.id}')">Retirar</button>`;
            }
        } else if (context === 'gestor') {
            actions = `
                <button class="btn btn-success btn-small" onclick="aprovarSolicitacao('${s.id}')">Aprovar</button>
                <button class="btn btn-danger btn-small ml-1" onclick="negarSolicitacao('${s.id}')">Negar</button>
                 <button class="btn btn-primary btn-small ml-1" onclick="abrirDetalhesModal('${s.id}')">Ver</button>
            `;
        } else if (context === 'prevencao') {
            actions = `<button class="btn btn-warning btn-small" onclick="abrirExecutarModal('${s.id}')">Executar</button>
                       <button class="btn btn-primary btn-small ml-1" onclick="abrirDetalhesModal('${s.id}')">Ver</button>`;
        } else if (context === 'historico') {
            actions = `<button class="btn btn-primary btn-small" onclick="abrirDetalhesModal('${s.id}')">Ver Detalhes</button>`;
        }


        if (context === 'historico') {
             return `
                <tr class="text-sm">
                    <td>${s.id}</td>
                    <td>${dataSol}</td>
                    <td>${filialNome}</td>
                    <td>${solicitanteNome}</td>
                    <td>${produtoDesc}</td>
                    <td class="text-center">${qtdExec}</td>
                    <td class="text-right">${valorExec}</td>
                    <td><span class="status-badge status-${s.status}">${getStatusLabel(s.status)}</span></td>
                    <td>${actions}</td>
                </tr>
            `;
        } else {
             return `
                <tr class="text-sm">
                    <td>${s.id}</td>
                    <td>${dataSol}</td>
                    ${context !== 'operacao' ? `<td>${solicitanteNome}</td>` : ''}
                    <td>${produtoDesc}</td>
                    <td class="text-center">${s.quantidade_solicitada}</td>
                    <td class="text-right">${valorSol}</td>
                    <td><span class="status-badge status-${s.status}">${getStatusLabel(s.status)}</span></td>
                    <td>${actions}</td>
                </tr>
            `;
        }


    }).join('');
}

// AJUSTE APLICADO AQUI
function getStatusLabel(status) {
    const labels = {
        'aguardando_aprovacao': 'Aguard. Aprovação',
        'aprovada': 'Aprovada',
        'negada': 'Negada',
        'executando': 'Em Execução', // Embora não deva aparecer aqui, mantemos por segurança
        'aguardando_retirada': 'Aguard. Retirada',
        'finalizada': 'Finalizada'
    };

    // --- INÍCIO DA CORREÇÃO ---
    // Verifica se status é uma string válida antes de tentar usar métodos de string
    if (typeof status === 'string' && status) {
        // Se o status existe no nosso mapa 'labels', retorna o label correspondente
        if (labels[status]) {
            return labels[status];
        }
        // Se não existe no mapa, tenta formatar (ex: 'meu_status_novo' -> 'MEU STATUS NOVO')
        try {
            return status.replace('_', ' ').toUpperCase();
        } catch (e) {
            // Em caso raro de erro na formatação, retorna o status original ou 'Desconhecido'
             console.warn("Erro ao formatar status inesperado:", status, e);
             return status || 'Desconhecido';
        }
    } else {
        // Se status não for uma string válida (undefined, null, etc.), retorna 'Desconhecido'
        console.warn("Status inválido recebido:", status); // Log para ajudar a identificar dados ruins
        return 'Desconhecido';
    }
    // --- FIM DA CORREÇÃO ---
}


// --- Funções de Ações (Aprovar, Negar, Executar, Retirar) ---

async function aprovarSolicitacao(id) {
    try {
        const updateData = {
            status: 'aprovada',
            aprovador_id: currentUser.id,
            data_aprovacao_negacao: new Date().toISOString()
        };
        await supabaseRequest(`solicitacoes_baixa?id=eq.${id}`, 'PATCH', updateData);
        showNotification(`Solicitação #${id} aprovada!`, 'success');
        loadAprovacoesPendentes(); // Recarrega a lista de aprovações
    } catch (error) {
        console.error("Erro ao aprovar:", error);
        showNotification(`Erro ao aprovar #${id}: ${error.message}`, 'error');
    }
}

async function negarSolicitacao(id) {
    // Adicionar um prompt para o motivo (opcional, mas recomendado)
    const motivo = prompt(`Digite o motivo para negar a solicitação #${id}:`);
    if (motivo === null) return; // Cancelado pelo usuário

    try {
        const updateData = {
            status: 'negada',
            aprovador_id: currentUser.id,
            data_aprovacao_negacao: new Date().toISOString(),
            motivo_negacao: motivo || 'Motivo não informado.'
        };
        await supabaseRequest(`solicitacoes_baixa?id=eq.${id}`, 'PATCH', updateData);
        showNotification(`Solicitação #${id} negada.`, 'info');
        loadAprovacoesPendentes(); // Recarrega a lista
    } catch (error) {
        console.error("Erro ao negar:", error);
        showNotification(`Erro ao negar #${id}: ${error.message}`, 'error');
    }
}

// --- Funções dos Modais ---

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        // Limpar alerts dentro do modal ao fechar
        const alertDiv = modal.querySelector('[id$="Alert"]');
        if (alertDiv) alertDiv.innerHTML = '';
        
        // Limpar form específico do modal de usuário
        if (modalId === 'usuarioModal') {
            document.getElementById('usuarioForm').reset();
            document.getElementById('usuarioId').value = '';
        }
    }
}

async function abrirDetalhesModal(id) {
    const modal = document.getElementById('detalhesModal');
    const content = document.getElementById('detalhesContent');
    document.getElementById('detalhesId').textContent = id;
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando...</div>';
    modal.style.display = 'flex';

    
    try {
        // AJUSTE APLICADO PELA SUGESTÃO ANTERIOR (com aliases)
        const s = await supabaseRequest(
            `solicitacoes_baixa?id=eq.${id}&select=*,filiais(nome,descricao),produtos(codigo,descricao),usuarios:usuarios!solicitacoes_baixa_solicitante_id_fkey(nome),usuarios_aprovador:usuarios!solicitacoes_baixa_aprovador_id_fkey(nome),usuarios_executor:usuarios!solicitacoes_baixa_executor_id_fkey(nome),usuarios_retirada:usuarios!solicitacoes_baixa_retirada_por_id_fkey(nome),anexos_baixa(url_arquivo,nome_arquivo)`, 'GET'
        );


        if (!s || s.length === 0) throw new Error('Solicitação não encontrada.');
        const sol = s[0];

        // Formatando datas
        const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('pt-BR') : 'N/A';

        // Links de Anexos
        let anexosHtml = 'Nenhum anexo.';
        if (sol.anexos_baixa && sol.anexos_baixa.length > 0) {
            anexosHtml = sol.anexos_baixa.map(anexo =>
                `<a href="${anexo.url_arquivo}" target="_blank" class="text-blue-600 hover:underline block">${anexo.nome_arquivo || 'Ver Anexo'}</a>`
            ).join('');
        }

        // Foto de Retirada
        const fotoRetiradaHtml = sol.foto_retirada_url
            ? `<a href="${sol.foto_retirada_url}" target="_blank" class="text-blue-600 hover:underline">Ver Foto</a>`
            : 'Não anexada';

        content.innerHTML = `
            <p><strong>Status:</strong> <span class="status-badge status-${sol.status}">${getStatusLabel(sol.status)}</span></p>
            <p><strong>Filial:</strong> ${sol.filiais.nome} - ${sol.filiais.descricao}</p>
            <hr class="my-2">
            <h4 class="font-semibold mb-1">Solicitação</h4>
            <p><strong>Produto:</strong> ${sol.produtos.codigo} - ${sol.produtos.descricao}</p>
            <p><strong>Solicitante:</strong> ${sol.usuarios.nome}</p>
            <p><strong>Data:</strong> ${formatDate(sol.data_solicitacao)}</p>
            <p><strong>Qtd. Solicitada:</strong> ${sol.quantidade_solicitada}</p>
            <p><strong>Valor Unit. Solicitado:</strong> R$ ${sol.valor_unitario_solicitado.toFixed(2)}</p>
            <p><strong>Valor Total Solicitado:</strong> R$ ${sol.valor_total_solicitado.toFixed(2)}</p>
            <hr class="my-2">
            <h4 class="font-semibold mb-1">Aprovação / Negação</h4>
            <p><strong>Aprovador/Negador:</strong> ${sol.usuarios_aprovador?.nome || 'Pendente'}</p>
            <p><strong>Data:</strong> ${formatDate(sol.data_aprovacao_negacao)}</p>
            ${sol.status === 'negada' ? `<p><strong>Motivo Negação:</strong> ${sol.motivo_negacao || 'N/A'}</p>` : ''}
            <hr class="my-2">
            <h4 class="font-semibold mb-1">Execução (Prevenção)</h4>
            <p><strong>Executor:</strong> ${sol.usuarios_executor?.nome || 'Pendente'}</p>
            <p><strong>Data:</strong> ${formatDate(sol.data_execucao)}</p>
            <p><strong>Qtd. Executada:</strong> ${sol.quantidade_executada ?? 'N/A'}</p>
            <p><strong>Valor Unit. Executado:</strong> R$ ${sol.valor_unitario_executado?.toFixed(2) ?? 'N/A'}</p>
            <p><strong>Valor Total Executado:</strong> R$ ${sol.valor_total_executado?.toFixed(2) ?? 'N/A'}</p>
            <p><strong>Justificativa:</strong> ${sol.justificativa_execucao || 'N/A'}</p>
            <p><strong>Cód. Movimentação:</strong> ${sol.codigo_movimentacao || 'N/A'}</p>
            <p><strong>Anexos:</strong></p>
            <div>${anexosHtml}</div>
            <hr class="my-2">
             <h4 class="font-semibold mb-1">Retirada (Operação)</h4>
            <p><strong>Retirado por:</strong> ${sol.usuarios_retirada?.nome || 'Pendente'}</p>
            <p><strong>Data:</strong> ${formatDate(sol.data_retirada)}</p>
            <p><strong>Foto:</strong> ${fotoRetiradaHtml}</p>
        `;

    } catch (error) {
        console.error("Erro ao carregar detalhes:", error);
        content.innerHTML = `<div class="alert alert-error">Erro ao carregar detalhes: ${error.message}</div>`;
    }
}

// Abre modal de Execução (Prevenção)
async function abrirExecutarModal(id) {
    const modal = document.getElementById('executarModal');
    document.getElementById('executarId').textContent = id;
    document.getElementById('executarSolicitacaoId').value = id;
    document.getElementById('executarForm').reset(); // Limpa o form

    try {
         const s = await supabaseRequest(`solicitacoes_baixa?id=eq.${id}&select=quantidade_solicitada,valor_total_solicitado,produtos(codigo,descricao)`);
         if (!s || s.length === 0) throw new Error('Solicitação não encontrada.');
         const sol = s[0];

         document.getElementById('executarProduto').textContent = `${sol.produtos.codigo} - ${sol.produtos.descricao}`;
         document.getElementById('executarQtdSolicitada').textContent = sol.quantidade_solicitada;
         document.getElementById('executarValorSolicitado').textContent = sol.valor_total_solicitado.toFixed(2);

         // Preencher campos com valores solicitados como padrão inicial
         document.getElementById('quantidadeExecutada').value = sol.quantidade_solicitada;
         // Buscar valor unitário original para preencher? Ou deixar em branco? Decidi deixar em branco.
         // document.getElementById('valorUnitarioExecutado').value = (sol.valor_total_solicitado / sol.quantidade_solicitada).toFixed(2);
         calcularValorTotalExecutado();

         modal.style.display = 'flex';

    } catch (error) {
        console.error("Erro ao abrir modal de execução:", error);
        showNotification(`Erro ao carregar dados da solicitação #${id}: ${error.message}`, 'error');
    }
}

function calcularValorTotalExecutado() {
    const qtd = parseFloat(document.getElementById('quantidadeExecutada').value) || 0;
    const valorUnit = parseFloat(document.getElementById('valorUnitarioExecutado').value) || 0;
    const total = qtd * valorUnit;
    document.getElementById('valorTotalExecutado').value = total.toFixed(2);
}

// Submissão do formulário de Execução
async function handleExecucaoSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('executarAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Processando...</div>';

    const solicitacaoId = document.getElementById('executarSolicitacaoId').value;
    const quantidade = parseInt(document.getElementById('quantidadeExecutada').value);
    const valorUnitario = parseFloat(document.getElementById('valorUnitarioExecutado').value);
    const valorTotal = parseFloat(document.getElementById('valorTotalExecutado').value);
    const justificativa = document.getElementById('justificativaExecucao').value.trim();
    const codigoMov = document.getElementById('codigoMovimentacao').value.trim();
    const anexoFiles = document.getElementById('anexosExecucao').files;

     if (isNaN(quantidade) || quantidade < 0 || isNaN(valorUnitario) || valorUnitario < 0 || !justificativa || !codigoMov) {
        alertContainer.innerHTML = '<div class="alert alert-error">Preencha Quantidade, Valor Unitário, Justificativa e Cód. Movimentação.</div>';
        return;
    }

     const updateData = {
        status: 'aguardando_retirada', // Próximo status
        executor_id: currentUser.id,
        data_execucao: new Date().toISOString(),
        quantidade_executada: quantidade,
        valor_unitario_executado: valorUnitario,
        valor_total_executado: valorTotal,
        justificativa_execucao: justificativa,
        codigo_movimentacao: codigoMov
    };

    try {
        // 1. Atualizar a solicitação principal
        await supabaseRequest(`solicitacoes_baixa?id=eq.${solicitacaoId}`, 'PATCH', updateData);

        // 2. Lidar com Upload de Anexos (se houver)
        if (anexoFiles.length > 0) {
            showNotification('Atualizando solicitação... Iniciando upload de anexos...', 'info');
             // *** LÓGICA DE UPLOAD REAL (Exemplo com Supabase Storage) ***
             // Você precisará configurar o Supabase Storage e adaptar este trecho.
            /*
            for (const file of anexoFiles) {
                const filePath = `anexos_baixa/${solicitacaoId}/${Date.now()}_${file.name}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('seu-bucket-name') // Nome do seu bucket
                    .upload(filePath, file);

                if (uploadError) {
                    throw new Error(`Erro no upload do arquivo ${file.name}: ${uploadError.message}`);
                }

                // Obter a URL pública (ou assinada)
                const { data: urlData } = supabase.storage
                    .from('seu-bucket-name')
                    .getPublicUrl(filePath);

                // Salvar referência no banco de dados
                await supabaseRequest('anexos_baixa', 'POST', {
                    solicitacao_id: solicitacaoId,
                    url_arquivo: urlData.publicUrl,
                    nome_arquivo: file.name,
                    uploader_id: currentUser.id
                });
            }
            */
            // Simulação de sucesso (REMOVA EM PRODUÇÃO)
            console.log(`${anexoFiles.length} arquivos selecionados (simulação de upload)`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simula tempo de upload
             showNotification('Anexos processados (simulação).', 'success');

        }

        showNotification(`Baixa da solicitação #${solicitacaoId} executada com sucesso! Aguardando retirada.`, 'success');
        closeModal('executarModal');
        loadExecucoesPendentes(); // Recarrega a lista de execução

    } catch (error) {
        console.error("Erro ao executar baixa:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao executar: ${error.message}</div>`;
    }

}

// Abre modal de Retirada (Operação)
async function abrirRetiradaModal(id) {
     const modal = document.getElementById('retiradaModal');
    document.getElementById('retiradaId').textContent = id;
    document.getElementById('retiradaSolicitacaoId').value = id;
    document.getElementById('retiradaForm').reset(); // Limpa o form

     try {
         const s = await supabaseRequest(`solicitacoes_baixa?id=eq.${id}&select=quantidade_executada,valor_total_executado,produtos(codigo,descricao)`);
         if (!s || s.length === 0) throw new Error('Solicitação não encontrada ou não executada.');
         const sol = s[0];

         document.getElementById('retiradaProduto').textContent = `${sol.produtos.codigo} - ${sol.produtos.descricao}`;
         document.getElementById('retiradaQtdExecutada').textContent = sol.quantidade_executada ?? 'N/A';
         document.getElementById('retiradaValorExecutado').textContent = sol.valor_total_executado?.toFixed(2) ?? 'N/A';

         modal.style.display = 'flex';

    } catch (error) {
        console.error("Erro ao abrir modal de retirada:", error);
        showNotification(`Erro ao carregar dados da solicitação #${id}: ${error.message}`, 'error');
    }
}

// Submissão do formulário de Retirada
async function handleRetiradaSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('retiradaAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Processando...</div>';

    const solicitacaoId = document.getElementById('retiradaSolicitacaoId').value;
    const fotoFile = document.getElementById('fotoRetirada').files[0];

    if (!fotoFile) {
        alertContainer.innerHTML = '<div class="alert alert-error">Por favor, anexe a foto da retirada.</div>';
        return;
    }

    try {
        let fotoUrl = '';
        // *** LÓGICA DE UPLOAD REAL DA FOTO (Exemplo com Supabase Storage) ***
        /*
        const fotoPath = `fotos_retirada/${solicitacaoId}/${Date.now()}_${fotoFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('seu-bucket-name') // Nome do seu bucket
            .upload(fotoPath, fotoFile);

        if (uploadError) {
            throw new Error(`Erro no upload da foto: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
            .from('seu-bucket-name')
            .getPublicUrl(fotoPath);
        fotoUrl = urlData.publicUrl;
        */
        // Simulação de URL (REMOVA EM PRODUÇÃO)
        fotoUrl = `https://example.com/simulacao/foto_${solicitacaoId}.jpg`;
        console.log("Simulando upload da foto:", fotoFile.name);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simula tempo
        showNotification('Foto processada (simulação).', 'info');


        // Atualizar a solicitação
        const updateData = {
            status: 'finalizada', // Status final
            retirada_por_id: currentUser.id,
            data_retirada: new Date().toISOString(),
            foto_retirada_url: fotoUrl
        };
        await supabaseRequest(`solicitacoes_baixa?id=eq.${solicitacaoId}`, 'PATCH', updateData);

        showNotification(`Retirada da solicitação #${solicitacaoId} confirmada! Baixa finalizada.`, 'success');
        closeModal('retiradaModal');
        loadMinhasSolicitacoes(); // Recarrega a lista da operação

    } catch (error) {
        console.error("Erro ao confirmar retirada:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao confirmar: ${error.message}</div>`;
    }
}


// --- Funções Utilitárias ---

/**
 * Função genérica para fazer requisições através do proxy Vercel para o Supabase.
 * @param {string} endpoint Com parâmetros de query. Ex: 'produtos?codigo=eq.MP001&select=id,descricao'
 * @param {string} method 'GET', 'POST', 'PATCH', 'DELETE'
 * @param {object|null} data Corpo da requisição para POST/PATCH
 * @returns {Promise<any>} Dados da resposta ou null
 * @throws {Error} Em caso de falha na requisição
 */
async function supabaseRequest(endpoint, method = 'GET', data = null) {
    // Separa o nome da tabela dos parâmetros de query existentes
    const [endpointBase, queryParams] = endpoint.split('?', 2);

    // Constrói a URL para o proxy, passando o endpoint Supabase como parâmetro 'endpoint'
    // Garantir que a constante SUPABASE_PROXY_URL esteja definida (geralmente no HTML ou no topo do JS)
    if (typeof SUPABASE_PROXY_URL === 'undefined') {
        throw new Error("SUPABASE_PROXY_URL não está definida.");
    }
    let proxyUrl = `${SUPABASE_PROXY_URL}?endpoint=${endpointBase}`;

    // Adiciona os outros parâmetros de query (select, order, filtros eq, etc.)
    if (queryParams) {
        proxyUrl += `&${queryParams}`;
    }

    // Configurações da requisição para o NOSSO PROXY
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // O header 'Prefer' será adicionado no proxy se necessário (como no upsert)
            // Não precisa mais de apikey/Authorization aqui, pois o proxy cuidará disso
        }
    };

    if (data && (method === 'POST' || method === 'PATCH')) {
        options.body = JSON.stringify(data);
    }

    try {
        // Log para debug (opcional)
        console.log(`[Frontend] Requesting via Proxy: ${method} ${proxyUrl}`);
        if(options.body) console.log(`[Frontend] Body: ${options.body.substring(0,100)}...`);

        const response = await fetch(proxyUrl, options);

        // --- START: CORRECTED ERROR HANDLING ---
        if (!response.ok) {
            // Read the body ONLY ONCE as text
            const errorText = await response.text();
            console.error('[Frontend] Proxy/Supabase Error Response Text:', response.status, errorText);

            let errorJson;
            let errorMessage = errorText || `Erro ${response.status} na comunicação.`; // Default message

            try {
                // Try parsing the text as JSON
                errorJson = JSON.parse(errorText);
                // Use specific Supabase error message if available
                errorMessage = errorJson.message || errorJson.error || errorMessage;
            } catch (parseError) {
                // If parsing fails, use the raw text as the error message
                console.warn('[Frontend] Could not parse error response as JSON.');
            }
            // Throw a new error with the best available message
            throw new Error(errorMessage);
        }
        // --- END: CORRECTED ERROR HANDLING ---

        // Processa a resposta bem-sucedida (Only if response.ok is true)
        if (response.status === 204 || method === 'DELETE') {
             return null; // No Content ou DELETE
        }

        // Tenta retornar como JSON
        try {
            // response.json() reads the body stream
            return await response.json();
        } catch (e) {
             console.warn("Resposta bem-sucedida não era JSON válido, retornando null.");
             // Ler como texto como fallback se o parse JSON falhar em sucesso (improvável, mas seguro)
             // Tentar ler de novo causaria 'already read', então retornamos null diretamente.
             return null;
        }

    } catch (error) {
        // Este bloco catch lida com erros lançados acima (como o bloco !response.ok)
        // ou erros de rede do próprio fetch.
        console.error(`Falha na requisição via Proxy [${method} ${endpoint}]:`, error);
        // Exibe o erro na interface do usuário através da notificação
        // Verifica se a função showNotification existe antes de chamá-la
        if (typeof showNotification === 'function') {
            showNotification(`Erro de comunicação: ${error.message}`, 'error');
        } else {
            // Fallback caso showNotification não esteja definida ainda
            alert(`Erro de comunicação: ${error.message}`);
        }
        throw error; // Re-lança o erro para interromper a execução se necessário (e capturado por handleLogin)
    }
}


// Função de Notificação (reutilizada do sistema anterior)
function showNotification(message, type = 'info', timeout = 4000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    let icon = '';
    let title = '';
    if (type === 'success') {
        icon = '<i data-feather="check-circle" class="h-5 w-5 mr-2"></i>';
        title = 'Sucesso!';
    } else if (type === 'error') {
        icon = '<i data-feather="x-circle" class="h-5 w-5 mr-2"></i>';
        title = 'Erro!';
    } else if (type === 'info') {
        icon = '<i data-feather="info" class="h-5 w-5 mr-2"></i>';
        title = 'Informação';
    }

    notification.innerHTML = `
        <div class="notification-header">
            ${icon}
            <span>${title}</span>
        </div>
        <div class="notification-body">${message}</div>
    `;

    container.appendChild(notification);
    if (typeof feather !== 'undefined') {
        feather.replace(); // Renderiza o ícone
    }


    setTimeout(() => {
        notification.classList.add('hide');
        // Espera a animação terminar antes de remover
        notification.addEventListener('animationend', () => notification.remove());
    }, timeout);
}


// =======================================================
// === NOVAS FUNÇÕES - GERENCIAMENTO DE USUÁRIOS (ADMIN) ===
// =======================================================

/**
 * Carrega a lista de usuários e filiais para a view de admin.
 */
async function loadGerenciarUsuarios() {
    const tbody = document.getElementById('usuariosTableBody');
    tbody.innerHTML = `<tr><td colspan="6" class="loading"><div class="spinner"></div>Carregando usuários...</td></tr>`;

    try {
        // 1. Buscar todos os usuários
        const usuarios = await supabaseRequest('usuarios?select=id,nome,username,role,ativo&order=nome.asc');
        renderUsuariosTable(tbody, usuarios || []);

        // 2. Preencher o cache de filiais (se vazio)
        if (todasFiliaisCache.length === 0) {
            todasFiliaisCache = await supabaseRequest('filiais?select=id,nome,descricao&order=nome.asc');
        }
    } catch (error) {
        console.error("Erro ao carregar usuários:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}

/**
 * Renderiza a tabela de usuários na view de admin.
 */
function renderUsuariosTable(tbody, usuarios) {
    if (!usuarios || usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-gray-500">Nenhum usuário encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = usuarios.map(u => {
        const statusClass = u.ativo ? 'text-green-600' : 'text-red-600';
        const statusText = u.ativo ? 'Ativo' : 'Inativo';
        const roleLabel = u.role.charAt(0).toUpperCase() + u.role.slice(1); // Ex: "Admin"

        return `
            <tr class="text-sm">
                <td>${u.id}</td>
                <td>${u.nome}</td>
                <td>${u.username}</td>
                <td>${roleLabel}</td>
                <td><span class="font-semibold ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="abrirUsuarioModal(${u.id})">Editar</button>
                    </td>
            </tr>
        `;
    }).join('');
}

/**
 * Abre o modal para criar (id=null) ou editar (id=valor) um usuário.
 */
async function abrirUsuarioModal(id = null) {
    const modal = document.getElementById('usuarioModal');
    const form = document.getElementById('usuarioForm');
    const alertContainer = document.getElementById('usuarioAlert');
    const title = document.getElementById('usuarioModalTitle');
    const senhaHelp = document.getElementById('usuarioSenhaHelp');
    const filiaisContainer = document.getElementById('usuarioFiliaisCheckboxes');
    alertContainer.innerHTML = '';
    form.reset();
    document.getElementById('usuarioId').value = id || '';

    // 1. Garantir que o cache de filiais está preenchido
    filiaisContainer.innerHTML = '<div class="loading text-sm">Carregando filiais...</div>';
    try {
        if (todasFiliaisCache.length === 0) {
            todasFiliaisCache = await supabaseRequest('filiais?select=id,nome,descricao&order=nome.asc');
        }
    } catch (e) {
        alertContainer.innerHTML = `<div class="alert alert-error">Falha fatal ao carregar filiais: ${e.message}</div>`;
        return;
    }
    
    // 2. Popular checkboxes de filiais
    if (todasFiliaisCache.length > 0) {
         filiaisContainer.innerHTML = todasFiliaisCache.map(f => `
            <label class="flex items-center space-x-2 text-sm">
                <input type="checkbox" value="${f.id}" name="filiais">
                <span>${f.nome} (${f.descricao})</span>
            </label>
         `).join('');
    } else {
        filiaisContainer.innerHTML = '<div class="text-sm text-red-600">Nenhuma filial cadastrada.</div>';
    }


    if (id) {
        // --- MODO EDIÇÃO ---
        title.textContent = `Editar Usuário #${id}`;
        senhaHelp.style.display = 'block'; // Mostra ajuda da senha
        document.getElementById('usuarioSenha').required = false;

        try {
            // Buscar dados atuais do usuário E suas filiais associadas
            const userResponse = await supabaseRequest(`usuarios?id=eq.${id}&select=*,usuario_filiais(filial_id)`);
            if (!userResponse || userResponse.length === 0) throw new Error('Usuário não encontrado.');
            
            const user = userResponse[0];
            const filiaisAtuais = user.usuario_filiais.map(uf => uf.filial_id);

            // Preencher o formulário
            document.getElementById('usuarioNome').value = user.nome;
            document.getElementById('usuarioUsername').value = user.username;
            document.getElementById('usuarioRole').value = user.role;
            document.getElementById('usuarioAtivo').checked = user.ativo;
            
            // Marcar as checkboxes das filiais atuais
            filiaisContainer.querySelectorAll('input[name="filiais"]').forEach(checkbox => {
                if (filiaisAtuais.includes(parseInt(checkbox.value))) {
                    checkbox.checked = true;
                }
            });

        } catch (error) {
            console.error("Erro ao carregar dados do usuário:", error);
            alertContainer.innerHTML = `<div class="alert alert-error">Erro ao carregar dados: ${error.message}</div>`;
            return; // Não abre o modal se falhar
        }

    } else {
        // --- MODO CRIAÇÃO ---
        title.textContent = 'Novo Usuário';
        senhaHelp.style.display = 'none'; // Esconde ajuda da senha
        document.getElementById('usuarioSenha').required = true;
        document.getElementById('usuarioAtivo').checked = true; // Default
    }

    modal.style.display = 'flex';
    // Re-renderizar ícones (caso tenha algum no modal)
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
}

/**
 * Trata a submissão do formulário de criação/edição de usuário.
 */
async function handleUsuarioFormSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('usuarioAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando...</div>';

    // 1. Obter dados do formulário
    const id = document.getElementById('usuarioId').value;
    const nome = document.getElementById('usuarioNome').value;
    const username = document.getElementById('usuarioUsername').value;
    const senha = document.getElementById('usuarioSenha').value;
    const role = document.getElementById('usuarioRole').value;
    const ativo = document.getElementById('usuarioAtivo').checked;
    
    const selectedFiliaisCheckboxes = document.querySelectorAll('#usuarioFiliaisCheckboxes input[name="filiais"]:checked');
    const selectedFilialIds = Array.from(selectedFiliaisCheckboxes).map(cb => parseInt(cb.value));

    const isEdit = !!id;

    // 2. Validação
    if (!nome || !username || !role) {
         alertContainer.innerHTML = '<div class="alert alert-error">Nome, Usuário e Grupo são obrigatórios.</div>';
         return;
    }
    if (!isEdit && !senha) {
        alertContainer.innerHTML = '<div class="alert alert-error">A Senha é obrigatória para novos usuários.</div>';
        return;
    }
     if (selectedFilialIds.length === 0) {
        alertContainer.innerHTML = '<div class="alert alert-error">Selecione ao menos uma filial.</div>';
        return;
    }

    // 3. Preparar dados do usuário
    const userData = {
        nome,
        username,
        role,
        ativo
    };
    // Adiciona senha_hash APENAS se uma nova senha foi digitada
    if (senha) {
        userData.senha_hash = senha; // (Ainda em plaintext, conforme seu setup)
    }

    try {
        let userId = id;

        // 4. Salvar Usuário (INSERT ou PATCH)
        if (isEdit) {
            await supabaseRequest(`usuarios?id=eq.${id}`, 'PATCH', userData);
        } else {
            const response = await supabaseRequest('usuarios', 'POST', userData);
            if (!response || response.length === 0) throw new Error("Falha ao criar o usuário, não obteve resposta.");
            userId = response[0].id; // Pega o ID do novo usuário
        }

        if (!userId) throw new Error("ID do usuário não definido.");

        // 5. Salvar Associações de Filiais (DELETE all, then POST new)
        
        // 5a. Deletar associações antigas
        await supabaseRequest(`usuario_filiais?usuario_id=eq.${userId}`, 'DELETE');

        // 5b. Preparar novas associações
        const filiaisToInsert = selectedFilialIds.map(filialId => ({
            usuario_id: userId,
            filial_id: filialId
        }));

        // 5c. Inserir novas associações
        await supabaseRequest('usuario_filiais', 'POST', filiaisToInsert);

        // 6. Sucesso
        showNotification(`Usuário ${isEdit ? 'atualizado' : 'criado'} com sucesso!`, 'success');
        closeModal('usuarioModal');
        loadGerenciarUsuarios(); // Recarrega a tabela

    } catch (error) {
        console.error("Erro ao salvar usuário:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar: ${error.message}</div>`;
    }
}
