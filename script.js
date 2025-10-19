// --- Variáveis Globais ---
let currentUser = null; // { id, nome, username, role, filiais: [{id, nome}] }
let selectedFilial = null; // { id, nome, descricao }
let produtosCache = []; // Cache simples de produtos para lookup
let todasFiliaisCache = []; // Cache de todas as filiais para admin
let cgoCache = []; // NOVO: Cache de CGOs ativos
let todosCgoCache = []; // NOVO: Cache de TODOS os CGOs (para admin)
let carrinhoItens = []; // NOVO: Array para o "carrinho" da nova solicitação

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Listeners para cálculo automático e busca de produto (Formulário de ADICIONAR ITEM)
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

    // Listeners para modal de execução (REMOVIDO, agora é dinâmico)

    // Bind forms (novos e antigos)
    document.getElementById('addItemForm')?.addEventListener('submit', handleAddItem); // NOVO
    document.getElementById('submitPedidoButton')?.addEventListener('click', handleNovaSolicitacaoSubmit); // NOVO
    document.getElementById('executarForm')?.addEventListener('submit', handleExecucaoSubmit);
    document.getElementById('retiradaForm')?.addEventListener('submit', handleRetiradaSubmit);
    document.getElementById('usuarioForm')?.addEventListener('submit', handleUsuarioFormSubmit);
    document.getElementById('filialForm')?.addEventListener('submit', handleFilialFormSubmit);
    document.getElementById('cgoForm')?.addEventListener('submit', handleCgoFormSubmit);
    document.getElementById('produtoForm')?.addEventListener('submit', handleProdutoFormSubmit); // NOVO

    // NOVO: Listeners para o painel de consulta CGO
    document.getElementById('helpCgoButton')?.addEventListener('click', abrirConsultaCgoModal);
    document.getElementById('cgoSearchInput')?.addEventListener('input', filtrarCgoConsulta);
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
    document.getElementById('helpCgoButton').style.display = 'flex'; // NOVO: Mostra o botão flutuante

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
            if (!firstVisibleLink && !item.dataset.role?.includes('admin')) { // Não define admin como padrão
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
            limparCarrinho(); // NOVO: Limpa o carrinho ao entrar na view
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
        // NOVOS CASES
        case 'gerenciarUsuariosView':
            loadGerenciarUsuarios();
            break;
        case 'gerenciarFiliaisView':
            loadGerenciarFiliais();
            break;
        case 'gerenciarProdutosView': // NOVO
            loadGerenciarProdutos();
            break;
        case 'gerenciarCgoView': // NOVO
            loadGerenciarCgo();
            break;
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
    cgoCache = []; 
    todosCgoCache = []; 
    carrinhoItens = []; // NOVO: Limpa o carrinho
    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('helpCgoButton').style.display = 'none'; // NOVO: Esconde o botão flutuante
    document.getElementById('loginForm').reset();
    document.getElementById('loginAlert').innerHTML = '';
    document.getElementById('filialSelectGroup').style.display = 'none';
    showNotification('Você foi desconectado.', 'info');
}

// --- Funções de Lógica de Negócio (Solicitações - NOVO "CARRINHO") ---

/**
 * NOVO: Limpa o carrinho e reseta os formulários da view 'novaSolicitacaoView'
 */
function limparCarrinho() {
    carrinhoItens = [];
    document.getElementById('addItemForm')?.reset();
    document.getElementById('addItemAlert').innerHTML = '';
    document.getElementById('novaSolicitacaoAlert').innerHTML = '';
    renderCarrinho();
}

/**
 * NOVO: Adiciona um item ao array 'carrinhoItens'
 */
function handleAddItem(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('addItemAlert');
    alertContainer.innerHTML = '';

    // Pegar dados do formulário
    const produtoId = document.getElementById('produtoId').value;
    const produtoCodigo = document.getElementById('produtoCodigo').value;
    const produtoDescricao = document.getElementById('produtoDescricao').value;
    const quantidade = parseInt(document.getElementById('quantidadeSolicitada').value);
    const valorUnitario = parseFloat(document.getElementById('valorUnitarioSolicitado').value);
    const valorTotal = parseFloat(document.getElementById('valorTotalSolicitado').value);

    // Validação
    if (!produtoId || produtoDescricao === 'Produto não encontrado') {
        alertContainer.innerHTML = '<div class="alert alert-error">Produto inválido. Busque um código válido.</div>';
        return;
    }
    if (isNaN(quantidade) || quantidade <= 0) {
         alertContainer.innerHTML = '<div class="alert alert-error">Quantidade deve ser maior que zero.</div>';
        return;
    }
     if (isNaN(valorUnitario) || valorUnitario < 0) {
         alertContainer.innerHTML = '<div class="alert alert-error">Valor unitário inválido.</div>';
        return;
    }
    // Verifica se o item já está no carrinho
    if (carrinhoItens.find(item => item.produto_id === produtoId)) {
         alertContainer.innerHTML = '<div class="alert alert-error">Este produto já foi adicionado. Remova-o para alterar.</div>';
        return;
    }

    // Adiciona ao array do carrinho
    carrinhoItens.push({
        produto_id: produtoId,
        produto_desc: `${produtoCodigo} - ${produtoDescricao}`,
        quantidade_solicitada: quantidade,
        valor_unitario_solicitado: valorUnitario,
        valor_total_solicitado: valorTotal
    });

    // Renderiza o carrinho
    renderCarrinho();
    
    // Limpa o formulário de adicionar
    document.getElementById('addItemForm').reset();
    document.getElementById('produtoId').value = '';
    document.getElementById('produtoDescricao').value = '';
    document.getElementById('valorTotalSolicitado').value = '';
    document.getElementById('produtoCodigo').focus();
    showNotification('Item adicionado ao pedido!', 'success', 2000);
}

/**
 * NOVO: Renderiza a tabela do carrinho com base no array 'carrinhoItens'
 */
function renderCarrinho() {
    const tbody = document.getElementById('carrinhoItensBody');
    const totalSpan = document.getElementById('carrinhoValorTotal');
    const submitButton = document.getElementById('submitPedidoButton');

    if (carrinhoItens.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum item adicionado.</td></tr>`;
        totalSpan.textContent = '0.00';
        submitButton.disabled = true;
        return;
    }

    let valorTotalPedido = 0;
    tbody.innerHTML = carrinhoItens.map((item, index) => {
        valorTotalPedido += item.valor_total_solicitado;
        return `
            <tr class="text-sm">
                <td>${item.produto_desc}</td>
                <td class="text-center">${item.quantidade_solicitada}</td>
                <td class="text-right">R$ ${item.valor_unitario_solicitado.toFixed(2)}</td>
                <td class="text-right">R$ ${item.valor_total_solicitado.toFixed(2)}</td>
                <td class="text-center">
                    <button class="btn btn-danger btn-small" onclick="removerItemDoCarrinho(${index})">
                        <i data-feather="trash-2" class="h-4 w-4"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    totalSpan.textContent = valorTotalPedido.toFixed(2);
    submitButton.disabled = false;
    if (typeof feather !== 'undefined') {
        feather.replace(); // Renderiza os ícones de lixeira
    }
}

/**
 * NOVO: Remove um item do array 'carrinhoItens'
 */
function removerItemDoCarrinho(index) {
    carrinhoItens.splice(index, 1); // Remove o item do array pelo índice
    renderCarrinho();
    showNotification('Item removido.', 'info', 2000);
}


/**
 * REESCRITO: Busca o produto (sem alteração de lógica)
 */
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
            // IMPORTANTE: Agora também buscamos 'cgos_permitidos'
            const response = await supabaseRequest(`produtos?codigo=eq.${codigo}&select=id,descricao,cgos_permitidos`);
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

/**
 * REESCRITO: Calcula o total (sem alteração de lógica)
 */
function calcularValorTotalSolicitado() {
    const qtd = parseFloat(document.getElementById('quantidadeSolicitada').value) || 0;
    const valorUnit = parseFloat(document.getElementById('valorUnitarioSolicitado').value) || 0;
    const total = qtd * valorUnit;
    document.getElementById('valorTotalSolicitado').value = total.toFixed(2);
}

/**
 * REESCRITO: Envia o "carrinho" (pedido e itens)
 */
async function handleNovaSolicitacaoSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('novaSolicitacaoAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Enviando solicitação...</div>';
    
    if (carrinhoItens.length === 0) {
         alertContainer.innerHTML = '<div class="alert alert-error">Adicione pelo menos um item ao pedido.</div>';
        return;
    }

    try {
        // 1. Criar o "cabeçalho" da solicitação
        const solicitacaoHeader = {
            filial_id: selectedFilial.id,
            solicitante_id: currentUser.id,
            status: 'aguardando_aprovacao' // Status geral do pedido
        };
        
        // Usamos 'Prefer: return=representation' para pegar o ID de volta
        const response = await supabaseRequest('solicitacoes_baixa', 'POST', solicitacaoHeader);
        
        if (!response || response.length === 0 || !response[0].id) {
            throw new Error('Falha ao criar o cabeçalho da solicitação.');
        }

        const novaSolicitacaoId = response[0].id;
        
        // 2. Preparar os itens
        const itensParaInserir = carrinhoItens.map(item => ({
            solicitacao_id: novaSolicitacaoId,
            produto_id: item.produto_id,
            quantidade_solicitada: item.quantidade_solicitada,
            valor_unitario_solicitado: item.valor_unitario_solicitado,
            valor_total_solicitado: item.valor_total_solicitado,
            status: 'aguardando_aprovacao' // Status de cada item
        }));

        // 3. Inserir todos os itens
        await supabaseRequest('solicitacao_itens', 'POST', itensParaInserir);

        // 4. Sucesso
        showNotification('Solicitação de baixa enviada com sucesso!', 'success');
        limparCarrinho();
        showView('minhasSolicitacoesView', document.querySelector('a[href="#minhasSolicitacoes"]'));

    } catch (error) {
        console.error("Erro ao enviar solicitação:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao enviar: ${error.message}</div>`;
        // TODO: Adicionar lógica para deletar o "cabeçalho" caso a inserção dos itens falhe (rollback manual)
    }
}

// --- Funções de Carregamento de Dados das Views (REESCRITAS) ---

/**
 * REESCRITO: Carrega os PEDIDOS do usuário
 */
async function loadMinhasSolicitacoes() {
    const tbody = document.getElementById('minhasSolicitacoesBody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading"><div class="spinner"></div>Carregando...</td></tr>`;

    try {
        const response = await supabaseRequest(
            `solicitacoes_baixa?solicitante_id=eq.${currentUser.id}&filial_id=eq.${selectedFilial.id}&select=id,data_solicitacao,status,solicitacao_itens(quantidade_solicitada,valor_total_solicitado,status,produtos(codigo,descricao))&order=data_solicitacao.desc`
        );
        renderSolicitacoesTable(tbody, response || [], 'operacao');
    } catch (error) {
        console.error("Erro ao carregar minhas solicitações:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}

/**
 * REESCRITO: Carrega PEDIDOS pendentes de aprovação
 */
async function loadAprovacoesPendentes() {
    const tbody = document.getElementById('aprovarSolicitacoesBody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading"><div class="spinner"></div>Carregando...</td></tr>`;

    try {
        const filialIds = currentUser.filiais.map(f => f.id);
        const response = await supabaseRequest(
            `solicitacoes_baixa?status=eq.aguardando_aprovacao&filial_id=in.(${filialIds.join(',')})&select=id,data_solicitacao,status,usuarios!solicitacoes_baixa_solicitante_id_fkey(nome),solicitacao_itens(quantidade_solicitada,valor_total_solicitado,status,produtos(codigo,descricao))&order=data_solicitacao.asc`
        );
        renderSolicitacoesTable(tbody, response || [], 'gestor');
    } catch (error) {
        console.error("Erro ao carregar aprovações:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}

/**
 * REESCRITO: Carrega PEDIDOS pendentes de execução
 */
async function loadExecucoesPendentes() {
    const tbody = document.getElementById('executarSolicitacoesBody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading"><div class="spinner"></div>Carregando...</td></tr>`;

    try {
        // Gestor/Prevenção vê todas aprovadas da(s) sua(s) filial(is)
         const filialIds = currentUser.filiais.map(f => f.id);
         // Busca pedidos 'aprovados' OU 'aguardando_retirada' (parcialmente executados)
        const response = await supabaseRequest(
            `solicitacoes_baixa?status=in.(aprovada,aguardando_retirada)&filial_id=in.(${filialIds.join(',')})&select=id,data_solicitacao,status,usuarios!solicitacoes_baixa_solicitante_id_fkey(nome),solicitacao_itens(quantidade_solicitada,valor_total_solicitado,status,produtos(codigo,descricao))&order=data_solicitacao.asc`
        );
        renderSolicitacoesTable(tbody, response || [], 'prevencao');
    } catch (error) {
        console.error("Erro ao carregar execuções:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}

/**
 * REESCRITO: Carrega HISTÓRICO de pedidos
 */
async function loadHistoricoGeral() {
    const tbody = document.getElementById('historicoBaixasBody');
    tbody.innerHTML = `<tr><td colspan="9" class="loading"><div class="spinner"></div>Carregando histórico...</td></tr>`;

     try {
        const filialIds = currentUser.filiais.map(f => f.id);
        const response = await supabaseRequest(
            `solicitacoes_baixa?filial_id=in.(${filialIds.join(',')})&select=id,data_solicitacao,status,filiais(nome),usuarios!solicitacoes_baixa_solicitante_id_fkey(nome),solicitacao_itens(quantidade_executada,valor_total_executado,status,produtos(codigo,descricao))&order=data_solicitacao.desc&limit=100`
        );
        renderSolicitacoesTable(tbody, response || [], 'historico');
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
        tbody.innerHTML = `<tr><td colspan="9" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}


// SUBSTITUA esta função no script.js
function renderSolicitacoesTable(tbody, solicitacoes, context) {
    if (!solicitacoes || solicitacoes.length === 0) {
        const colspan = context === 'historico' ? 9 : 7;
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-4 text-gray-500">Nenhuma solicitação encontrada.</td></tr>`;
        return;
    }

    tbody.innerHTML = solicitacoes.map(s => {
        const itens = s.solicitacao_itens || [];
        const dataSol = new Date(s.data_solicitacao).toLocaleDateString('pt-BR');
        const solicitanteNome = s.usuarios ? s.usuarios.nome : 'Desconhecido';
        const filialNome = s.filiais ? s.filiais.nome : selectedFilial.nome; // Para histórico

        // --- Lógica de Resumo de Itens (sem alteração) ---
        let produtoDesc = 'Nenhum item';
        let qtdTotalSol = 0;
        let valorTotalSol = 0;
        let qtdTotalExec = 0;
        let valorTotalExec = 0;

        if (itens.length === 1) {
            const item = itens[0];
            produtoDesc = item.produtos ? `${item.produtos.codigo} - ${item.produtos.descricao}` : 'Produto inválido';
            qtdTotalSol = item.quantidade_solicitada;
            valorTotalSol = item.valor_total_solicitado;
            qtdTotalExec = item.quantidade_executada ?? 0;
            valorTotalExec = item.valor_total_executado ?? 0;
        } else if (itens.length > 1) {
            produtoDesc = `Múltiplos Itens (${itens.length})`;
            itens.forEach(item => {
                qtdTotalSol += item.quantidade_solicitada;
                valorTotalSol += item.valor_total_solicitado;
                qtdTotalExec += item.quantidade_executada ?? 0;
                valorTotalExec += item.valor_total_executado ?? 0;
            });
        }
        // --- Fim da Lógica de Resumo ---

        let actions = '';
        if (context === 'operacao') {
            actions = `<button class="btn btn-primary btn-small" onclick="abrirDetalhesModal('${s.id}')">Ver Detalhes</button>`;
            
            // **** MUDANÇA AQUI ****
            // Se o pedido está aguardando retirada (ou seja, tem itens prontos), mostra o botão de Retirada em Lote
            if (s.status === 'aguardando_retirada') {
                 actions += `<button class="btn btn-success btn-small ml-1" onclick="abrirRetiradaLoteModal('${s.id}')">Confirmar Retirada</Sbutton>`;
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
                    <td class="text-center">${qtdTotalExec}</td>
                    <td class="text-right">${valorTotalExec.toFixed(2)}</td>
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
                    <td class="text-center">${qtdTotalSol}</td>
                    <td class="text-right">${valorTotalSol.toFixed(2)}</td>
                    <td><span class="status-badge status-${s.status}">${getStatusLabel(s.status)}</span></td>
                    <td>${actions}</td>
                </tr>
            `;
        }
    }).join('');
}

function getStatusLabel(status) {
    const labels = {
        'aguardando_aprovacao': 'Aguard. Aprovação',
        'aprovada': 'Aprovada',
        'negada': 'Negada',
        'executando': 'Em Execução', // Status de item
        'aguardando_retirada': 'Aguard. Retirada', // Pode ser do pedido (parcial) ou item
        'finalizada': 'Finalizada',
        'parcialmente_executado': 'Parcial. Executado' // NOVO status de pedido
    };
    if (typeof status === 'string' && status) {
        if (labels[status]) {
            return labels[status];
        }
        try {
            return status.replace('_', ' ').toUpperCase();
        } catch (e) {
             console.warn("Erro ao formatar status inesperado:", status, e);
             return status || 'Desconhecido';
        }
    } else {
        console.warn("Status inválido recebido:", status);
        return 'Desconhecido';
    }
}


// --- Funções de Ações (REESCRITAS) ---

/**
 * REESCRITO: Aprova TODOS os itens de um pedido
 */
async function aprovarSolicitacao(id) { // id é solicitacao_id
    if (!confirm(`Tem certeza que deseja APROVAR todos os itens do pedido #${id}?`)) return;
    
    try {
        const updateData = {
            status: 'aprovada',
            aprovador_id: currentUser.id,
            data_aprovacao_negacao: new Date().toISOString()
        };
        
        // 1. Atualiza todos os ITENS
        await supabaseRequest(`solicitacao_itens?solicitacao_id=eq.${id}&status=eq.aguardando_aprovacao`, 'PATCH', updateData);
        
        // 2. Atualiza o PEDIDO (cabeçalho)
        await supabaseRequest(`solicitacoes_baixa?id=eq.${id}`, 'PATCH', { status: 'aprovada' });

        showNotification(`Pedido #${id} aprovado!`, 'success');
        loadAprovacoesPendentes();
    } catch (error) {
        console.error("Erro ao aprovar:", error);
        showNotification(`Erro ao aprovar #${id}: ${error.message}`, 'error');
    }
}

/**
 * REESCRITO: Nega TODOS os itens de um pedido
 */
async function negarSolicitacao(id) { // id é solicitacao_id
    const motivo = prompt(`Digite o motivo para NEGAR todos os itens do pedido #${id}:`);
    if (motivo === null) return; // Cancelado pelo usuário

    try {
        const updateData = {
            status: 'negada',
            aprovador_id: currentUser.id,
            data_aprovacao_negacao: new Date().toISOString(),
            motivo_negacao: motivo || 'Motivo não informado.'
        };

        // 1. Atualiza todos os ITENS
        await supabaseRequest(`solicitacao_itens?solicitacao_id=eq.${id}&status=eq.aguardando_aprovacao`, 'PATCH', updateData);
        
        // 2. Atualiza o PEDIDO (cabeçalho)
        await supabaseRequest(`solicitacoes_baixa?id=eq.${id}`, 'PATCH', { status: 'negada' });

        showNotification(`Pedido #${id} negado.`, 'info');
        loadAprovacoesPendentes();
    } catch (error) {
        console.error("Erro ao negar:", error);
        showNotification(`Erro ao negar #${id}: ${error.message}`, 'error');
    }
}

// --- Funções dos Modais (REESCRITAS) ---

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        const alertDiv = modal.querySelector('[id$="Alert"]');
        if (alertDiv) alertDiv.innerHTML = '';
        
        if (modalId === 'usuarioModal') {
            document.getElementById('usuarioForm').reset();
            document.getElementById('usuarioId').value = '';
        }
        if (modalId === 'filialModal') {
            document.getElementById('filialForm').reset();
            document.getElementById('filialId').value = '';
        }
        if (modalId === 'cgoModal') {
            document.getElementById('cgoForm').reset();
            document.getElementById('cgoId').value = '';
        }
        if (modalId === 'produtoModal') { // NOVO
            document.getElementById('produtoForm').reset();
            document.getElementById('produtoIdAdmin').value = '';
        }
        if (modalId === 'consultaCgoModal') {
            document.getElementById('cgoSearchInput').value = '';
            filtrarCgoConsulta();
        }
    }
}

/**
 * REESCRITO: Abre detalhes do PEDIDO e lista seus ITENS
 */
async function abrirDetalhesModal(id) { // id é solicitacao_id
    const modal = document.getElementById('detalhesModal');
    const content = document.getElementById('detalhesContent');
    document.getElementById('detalhesId').textContent = id;
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando...</div>';
    modal.style.display = 'flex';

    try {
        // 1. Busca o Pedido (cabeçalho)
        const s = await supabaseRequest(
            `solicitacoes_baixa?id=eq.${id}&select=*,filiais(nome,descricao),usuarios:usuarios!solicitacoes_baixa_solicitante_id_fkey(nome)`
        );
        if (!s || s.length === 0) throw new Error('Solicitação não encontrada.');
        const sol = s[0];

        // 2. Busca os Itens
        const itens = await supabaseRequest(
            `solicitacao_itens?solicitacao_id=eq.${id}&select=*,produtos(codigo,descricao),usuarios_aprovador:usuarios!solicitacao_itens_aprovador_id_fkey(nome),usuarios_executor:usuarios!solicitacao_itens_executor_id_fkey(nome),usuarios_retirada:usuarios!solicitacao_itens_retirada_por_id_fkey(nome)&order=id.asc`
        );
        
        // 3. Busca Anexos do Pedido
        const anexos = await supabaseRequest(`anexos_baixa?solicitacao_id=eq.${id}`);


        const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('pt-BR') : 'N/A';

        // Links de Anexos (Nível Pedido)
        let anexosHtml = 'Nenhum anexo.';
        if (anexos && anexos.length > 0) {
            anexosHtml = anexos.map(anexo =>
                `<a href="${anexo.url_arquivo}" target="_blank" class="text-blue-600 hover:underline block">${anexo.nome_arquivo || 'Ver Anexo'}</a>`
            ).join('');
        }

        // Renderiza o Cabeçalho
        let headerHtml = `
            <p><strong>Status do Pedido:</strong> <span class="status-badge status-${sol.status}">${getStatusLabel(sol.status)}</span></p>
            <p><strong>Filial:</strong> ${sol.filiais.nome} - ${sol.filiais.descricao}</p>
            <p><strong>Solicitante:</strong> ${sol.usuarios.nome}</p>
            <p><strong>Data:</strong> ${formatDate(sol.data_solicitacao)}</p>
            <p><strong>Anexos do Pedido:</strong></p>
            <div>${anexosHtml}</div>
            <hr class="my-4">
            <h4 class="text-lg font-semibold mb-2">Itens do Pedido</h4>
        `;

        // Renderiza cada Item
        let itensHtml = (itens || []).map(item => {
            const fotoRetiradaHtml = item.foto_retirada_url
                ? `<a href="${item.foto_retirada_url}" target="_blank" class="text-blue-600 hover:underline">Ver Foto</a>`
                : 'Não anexada';

            // NOVO: Botão de Retirada por item
            let retiradaBtn = '';
            if (item.status === 'aguardando_retirada' && (currentUser.role === 'operacao' || currentUser.role === 'admin')) {
                retiradaBtn = `<button class="btn btn-success btn-small mt-2" onclick="abrirRetiradaModal(${item.id}, ${sol.id})">Confirmar Retirada</button>`;
            }

            return `
                <div class="bg-gray-50 p-4 rounded border border-gray-200 mb-3">
                    <p class="font-bold text-base">${item.produtos.codigo} - ${item.produtos.descricao}</p>
                    <p><strong>Status do Item:</strong> <span class="status-badge status-${item.status}">${getStatusLabel(item.status)}</span></p>
                    <hr class="my-2">
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <div>
                            <h5 class="font-semibold mb-1">Solicitação</h5>
                            <p><strong>Qtd.:</strong> ${item.quantidade_solicitada}</p>
                            <p><strong>Valor Total:</strong> R$ ${item.valor_total_solicitado.toFixed(2)}</p>
                        </div>
                        <div>
                            <h5 class="font-semibold mb-1">Aprovação</h5>
                            <p><strong>Por:</strong> ${item.usuarios_aprovador?.nome || 'Pendente'}</p>
                            ${item.status === 'negada' ? `<p><strong>Motivo:</strong> ${item.motivo_negacao || 'N/A'}</p>` : ''}
                        </div>
                        <div>
                            <h5 class="font-semibold mb-1 mt-2">Execução (Prevenção)</h5>
                            <p><strong>Por:</strong> ${item.usuarios_executor?.nome || 'Pendente'}</p>
                            <p><strong>Qtd.:</strong> ${item.quantidade_executada ?? 'N/A'}</p>
                            <p><strong>Valor Total:</strong> R$ ${item.valor_total_executado?.toFixed(2) ?? 'N/A'}</p>
                            <p><strong>CGO:</strong> ${item.codigo_movimentacao || 'N/A'}</p>
                            <p><strong>Justificativa:</strong> ${item.justificativa_execucao || 'N/A'}</p>
                        </div>
                        <div>
                            <h5 class="font-semibold mb-1 mt-2">Retirada (Operação)</h5>
                            <p><strong>Por:</strong> ${item.usuarios_retirada?.nome || 'Pendente'}</p>
                            <p><strong>Foto:</strong> ${fotoRetiradaHtml}</p>
                            ${retiradaBtn}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        content.innerHTML = headerHtml + (itensHtml || '<p>Nenhum item encontrado.</p>');
        if (typeof feather !== 'undefined') {
            feather.replace();
        }

    } catch (error) {
        console.error("Erro ao carregar detalhes:", error);
        content.innerHTML = `<div class="alert alert-error">Erro ao carregar detalhes: ${error.message}</div>`;
    }
}

/**
 * REESCRITO: Abre modal de Execução para um PEDIDO
 */
async function abrirExecutarModal(id) { // id é solicitacao_id
    const modal = document.getElementById('executarModal');
    document.getElementById('executarId').textContent = id;
    document.getElementById('executarSolicitacaoId').value = id;
    document.getElementById('executarForm').reset();
    document.getElementById('executarAlert').innerHTML = '';
    
    const listContainer = document.getElementById('executarItensList');
    listContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando itens...</div>';
    
    const cgoSelect = document.getElementById('codigoMovimentacao');
    cgoSelect.innerHTML = '<option value="">Selecione os itens primeiro...</option>';
    cgoSelect.disabled = true;

    modal.style.display = 'flex';

    try {
        // Busca todos os itens APROVADOS desta solicitação
        // E já traz os dados do produto, incluindo a nova coluna 'cgos_permitidos'
        const response = await supabaseRequest(
            `solicitacao_itens?solicitacao_id=eq.${id}&status=eq.aprovada&select=*,produtos(codigo,descricao,cgos_permitidos)&order=id.asc`
        );

        if (!response || response.length === 0) {
            listContainer.innerHTML = '<div class="text-center py-4 text-gray-500">Nenhum item aprovado aguardando execução para este pedido.</div>';
            return;
        }

        // Renderiza a lista de itens com checkboxes
        listContainer.innerHTML = response.map(item => {
            const produto = item.produtos;
            // Armazena os CGOs permitidos num data attribute
            // JSON.stringify é uma forma fácil de guardar o array como string
            const cgosPermitidos = JSON.stringify(produto.cgos_permitidos || []);

            return `
                <div class="bg-gray-50 p-4 rounded border flex items-start">
                    <input type="checkbox" value="${item.id}" name="executar_item_ids" 
                           class="h-5 w-5 mt-1 mr-3" 
                           onchange="atualizarCgosPermitidos()"
                           data-cgos='${cgosPermitidos}'>
                    
                    <div class="flex-1">
                        <p class="font-semibold">${produto.codigo} - ${produto.descricao}</p>
                        <p class="text-sm text-gray-700">
                            Qtd. Aprovada: ${item.quantidade_solicitada} | 
                            Valor Total: R$ ${item.valor_total_solicitado.toFixed(2)}
                        </p>
                        
                        <div class="form-grid mt-2" style="grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div class="form-group">
                                <label for="qtd_exec_${item.id}" class="text-xs font-semibold">Qtd. Real:</label>
                                <input type="number" id="qtd_exec_${item.id}" value="${item.quantidade_solicitada}" class="w-full" style="padding: 8px;">
                            </div>
                            <div class="form-group">
                                <label for="val_unit_${item.id}" class="text-xs font-semibold">Valor Unit. Real:</label>
                                <input type="number" step="0.01" id="val_unit_${item.id}" value="${item.valor_unitario_solicitado.toFixed(2)}" class="w-full" style="padding: 8px;">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Erro ao carregar itens para execução:", error);
        listContainer.innerHTML = `<div class="alert alert-error">Erro ao carregar itens: ${error.message}</div>`;
    }
}


/**
 * NOVO: Filtra o dropdown de CGOs com base nos itens selecionados
 */
async function atualizarCgosPermitidos() {
    const cgoSelect = document.getElementById('codigoMovimentacao');
    const checkedItems = document.querySelectorAll('input[name="executar_item_ids"]:checked');

    if (checkedItems.length === 0) {
        cgoSelect.innerHTML = '<option value="">Selecione os itens primeiro...</option>';
        cgoSelect.disabled = true;
        return;
    }

    let cgosPermitidosComuns = null;

    // Itera por todos os itens checados
    for (const item of checkedItems) {
        // Lê o array de CGOs do data-attribute
        const cgosDoItem = JSON.parse(item.dataset.cgos); // ex: ["475", "480"]

        if (cgosPermitidosComuns === null) {
            // No primeiro item, o conjunto comum é o conjunto dele
            cgosPermitidosComuns = new Set(cgosDoItem);
        } else {
            // Nos itens seguintes, faz a INTERSEÇÃO
            cgosPermitidosComuns = new Set(
                [...cgosPermitidosComuns].filter(cgo => cgosDoItem.includes(cgo))
            );
        }
    }

    // Agora cgosPermitidosComuns (um Set) contém apenas CGOs presentes em TODOS os itens selecionados
    
    // Busca os detalhes desses CGOs no cache
    const cgosDoCache = await getCgoCache(); // Pega CGOs ativos
    
    const cgosFiltrados = cgosDoCache.filter(cgo => cgosPermitidosComuns.has(cgo.codigo_cgo));

    if (cgosFiltrados.length === 0) {
        cgoSelect.innerHTML = '<option value="">Nenhum CGO em comum para os itens selecionados.</option>';
        cgoSelect.disabled = true;
    } else {
        cgoSelect.innerHTML = '<option value="">-- Selecione um CGO --</option>';
        cgosFiltrados.forEach(cgo => {
            cgoSelect.innerHTML += `<option value="${cgo.codigo_cgo}">${cgo.codigo_cgo} - ${cgo.descricao_cgo}</option>`;
        });
        cgoSelect.disabled = false;
    }
}


/**
 * REESCRITO: Submissão do formulário de Execução
 */
async function handleExecucaoSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('executarAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Processando execução...</div>';

    const solicitacaoId = document.getElementById('executarSolicitacaoId').value;
    const checkedItems = document.querySelectorAll('input[name="executar_item_ids"]:checked');
    const justificativa = document.getElementById('justificativaExecucao').value.trim();
    const codigoMov = document.getElementById('codigoMovimentacao').value;
    const anexoFiles = document.getElementById('anexosExecucao').files;

    // Validação
    if (checkedItems.length === 0) {
        alertContainer.innerHTML = '<div class="alert alert-error">Selecione pelo menos um item para executar.</div>';
        return;
    }
    if (!codigoMov) {
        alertContainer.innerHTML = '<div class="alert alert-error">Selecione um CGO válido (comum a todos os itens).</div>';
        return;
    }
    if (!justificativa) {
        alertContainer.innerHTML = '<div class="alert alert-error">A justificativa é obrigatória.</div>';
        return;
    }

    const dataExecucao = new Date().toISOString();
    let itensParaAtualizar = [];
    let itemIdsAtualizados = [];

    // 1. Prepara os dados de atualização para cada item
    try {
        for (const item of checkedItems) {
            const itemId = item.value;
            itemIdsAtualizados.push(itemId);
            const qtd = parseInt(document.getElementById(`qtd_exec_${itemId}`).value);
            const valUnit = parseFloat(document.getElementById(`val_unit_${itemId}`).value);
            
            if (isNaN(qtd) || qtd < 0 || isNaN(valUnit) || valUnit < 0) {
                throw new Error(`Valores inválidos para o item ID ${itemId}.`);
            }
            
            itensParaAtualizar.push({
                id: itemId, // ID do item
                data: {
                    status: 'aguardando_retirada', // Próximo status
                    executor_id: currentUser.id,
                    data_execucao: dataExecucao,
                    quantidade_executada: qtd,
                    valor_unitario_executado: valUnit,
                    valor_total_executado: qtd * valUnit,
                    justificativa_execucao: justificativa,
                    codigo_movimentacao: codigoMov
                }
            });
        }
    } catch (error) {
         alertContainer.innerHTML = `<div class="alert alert-error">${error.message}</div>`;
         return;
    }

    // 2. Enviar atualizações
    try {
        // A forma mais fácil é um loop de PATCH
        for (const item of itensParaAtualizar) {
             await supabaseRequest(`solicitacao_itens?id=eq.${item.id}`, 'PATCH', item.data);
        }
        
        // 3. Atualizar o status do PEDIDO (cabeçalho)
        // Verificamos se *todos* os itens do pedido foram movidos.
        // Vamos apenas setar para 'aguardando_retirada' que sinaliza 'parcial' ou 'total'
        await supabaseRequest(`solicitacoes_baixa?id=eq.${solicitacaoId}`, 'PATCH', { status: 'aguardando_retirada' });
        
        // 4. Lidar com Anexos (Lógica original mantida, anexa ao PEDIDO)
        let anexoUrls = [];
        if (anexoFiles.length > 0) {
            alertContainer.innerHTML += '<div class="loading"><div class="spinner"></div>Enviando anexos...</div>';
            for (const file of anexoFiles) {
                try {
                    const apiUrl = `/api/upload?fileName=${encodeURIComponent(file.name)}&solicitacaoId=${solicitacaoId}&fileType=anexo`;
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': file.type || 'application/octet-stream' },
                        body: file,
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(`Erro ${response.status} ao enviar ${file.name}: ${errorData.details || errorData.error}`);
                    }
                    const result = await response.json();
                    if (result.publicUrl) {
                        anexoUrls.push({
                             solicitacao_id: parseInt(solicitacaoId), // Linka ao PEDIDO
                             url_arquivo: result.publicUrl,
                             nome_arquivo: file.name,
                             uploader_id: currentUser.id
                        });
                    }
                } catch (uploadError) {
                    console.error(`Falha no upload do anexo ${file.name}:`, uploadError);
                    showNotification(`Falha no upload do anexo ${file.name}: ${uploadError.message}`, 'error');
                }
            }

            if (anexoUrls.length > 0) {
                alertContainer.innerHTML += '<div class="loading"><div class="spinner"></div>Salvando referências...</div>';
                await supabaseRequest('anexos_baixa', 'POST', anexoUrls);
                showNotification('Referências dos anexos salvas.', 'success');
            }
        }

        showNotification(`Itens executados com sucesso! Aguardando retirada.`, 'success');
        closeModal('executarModal');
        loadExecucoesPendentes();

    } catch (error) {
        console.error("Erro ao executar baixa:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao executar: ${error.message}</div>`;
    }
}

/**
 * REESCRITO: Abre modal de Retirada para um ITEM
 */
async function abrirRetiradaModal(itemId, solicitacaoId) { // MUDANÇA: Recebe itemId e solicitacaoId
     const modal = document.getElementById('retiradaModal');
    document.getElementById('retiradaId').textContent = itemId;
    document.getElementById('retiradaSolicitacaoId').value = itemId; // Salva o ID do ITEM
    document.getElementById('retiradaForm').reset();
    
    // NOVO: Adiciona um campo oculto para o ID do Pedido (necessário para o upload)
    let pedidoIdInput = document.getElementById('retiradaPedidoId');
    if (!pedidoIdInput) {
        pedidoIdInput = document.createElement('input');
        pedidoIdInput.type = 'hidden';
        pedidoIdInput.id = 'retiradaPedidoId';
        document.getElementById('retiradaForm').appendChild(pedidoIdInput);
    }
    pedidoIdInput.value = solicitacaoId; // Salva o ID do PEDIDO

     try {
         // Busca o ITEM específico
         const s = await supabaseRequest(`solicitacao_itens?id=eq.${itemId}&select=quantidade_executada,valor_total_executado,produtos(codigo,descricao)`);
         if (!s || s.length === 0) throw new Error('Item da solicitação não encontrado ou não executado.');
         const item = s[0];

         document.getElementById('retiradaProduto').textContent = `${item.produtos.codigo} - ${item.produtos.descricao}`;
         document.getElementById('retiradaQtdExecutada').textContent = item.quantidade_executada ?? 'N/A';
         document.getElementById('retiradaValorExecutado').textContent = item.valor_total_executado?.toFixed(2) ?? 'N/A';

         modal.style.display = 'flex';

    } catch (error) {
        console.error("Erro ao abrir modal de retirada:", error);
        showNotification(`Erro ao carregar dados do item #${itemId}: ${error.message}`, 'error');
    }
}

/**
 * REESCRITO: Submissão do formulário de Retirada (por ITEM)
 */
async function handleRetiradaSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('retiradaAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Processando...</div>';

    const itemId = document.getElementById('retiradaSolicitacaoId').value; // Este é o ID do ITEM
    const solicitacaoId = document.getElementById('retiradaPedidoId').value; // Este é o ID do PEDIDO
    const fotoFile = document.getElementById('fotoRetirada').files[0];

    if (!fotoFile) {
        alertContainer.innerHTML = '<div class="alert alert-error">Por favor, anexe a foto da retirada.</div>';
        return;
    }
    if (!solicitacaoId) {
         alertContainer.innerHTML = '<div class="alert alert-error">Erro: ID do Pedido não encontrado.</div>';
         return;
    }

    try {
        let fotoUrl = '';
        alertContainer.innerHTML += '<div class="loading"><div class="spinner"></div>Enviando foto...</div>';

        // --- LÓGICA DE UPLOAD (Usa o ID do PEDIDO para a pasta) ---
        try {
            const apiUrl = `/api/upload?fileName=${encodeURIComponent(fotoFile.name)}&solicitacaoId=${solicitacaoId}&fileType=foto_retirada`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': fotoFile.type || 'application/octet-stream' },
                body: fotoFile,
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Erro ${response.status} ao enviar foto: ${errorData.details || errorData.error}`);
            }
            const result = await response.json();
            if (result.publicUrl) {
                fotoUrl = result.publicUrl;
            } else {
                throw new Error('API de upload não retornou a URL da foto.');
            }
        } catch (uploadError) {
             console.error('Falha no upload da foto:', uploadError);
             throw uploadError;
        }
        // --- FIM DO UPLOAD ---


        // Atualizar o ITEM com a URL da foto e o status final
        const updateData = {
            status: 'finalizada', // Status final do ITEM
            retirada_por_id: currentUser.id,
            data_retirada: new Date().toISOString(),
            foto_retirada_url: fotoUrl
        };
        await supabaseRequest(`solicitacao_itens?id=eq.${itemId}`, 'PATCH', updateData);
        
        // TODO: Adicionar lógica para verificar se TODOS os itens do pedido 'solicitacaoId'
        // estão 'finalizada' ou 'negada', e então atualizar o status do PEDIDO (cabeçalho)
        // para 'finalizada'. (Opcional, mas bom para limpeza)

        showNotification(`Retirada do item #${itemId} confirmada!`, 'success');
        closeModal('retiradaModal');
        closeModal('detalhesModal'); // Fecha o modal de detalhes também
        loadMinhasSolicitacoes(); // Recarrega a lista principal

    } catch (error) {
        console.error("Erro ao confirmar retirada:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao confirmar: ${error.message}</div>`;
    }
}


/**
 * REESCRITO: supabaseRequest (Mantendo o error handling melhorado)
 */
async function supabaseRequest(endpoint, method = 'GET', data = null) {
    const [endpointBase, queryParams] = endpoint.split('?', 2);
    if (typeof SUPABASE_PROXY_URL === 'undefined') {
        throw new Error("SUPABASE_PROXY_URL não está definida.");
    }
    let proxyUrl = `${SUPABASE_PROXY_URL}?endpoint=${endpointBase}`;
    if (queryParams) {
        proxyUrl += `&${queryParams}`;
    }

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
    };
    if (data && (method === 'POST' || method === 'PATCH')) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(proxyUrl, options);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Frontend] Proxy/Supabase Error Response Text:', response.status, errorText);
            let errorJson;
            let errorMessage = errorText || `Erro ${response.status} na comunicação.`;
            try {
                errorJson = JSON.parse(errorText);
                errorMessage = errorJson.message || errorJson.error || errorMessage;
            } catch (parseError) {
                // ignore
            }
            throw new Error(errorMessage);
        }

        if (response.status === 204 || method === 'DELETE') {
             return null;
        }
        try {
            return await response.json();
        } catch (e) {
             console.warn("Resposta bem-sucedida não era JSON válido, retornando null.");
             return null;
        }
    } catch (error) {
        console.error(`Falha na requisição via Proxy [${method} ${endpoint}]:`, error);
        if (typeof showNotification === 'function') {
            showNotification(`Erro de comunicação: ${error.message}`, 'error');
        } else {
            alert(`Erro de comunicação: ${error.message}`);
        }
        throw error;
    }
}


// Função de Notificação (sem alteração)
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
        feather.replace();
    }
    setTimeout(() => {
        notification.classList.add('hide');
        notification.addEventListener('animationend', () => notification.remove());
    }, timeout);
}


// =======================================================
// === FUNÇÕES DE GERENCIAMENTO (ADMIN) ===
// =======================================================

async function getFiliaisCache() {
    if (todasFiliaisCache.length === 0) {
        todasFiliaisCache = await supabaseRequest('filiais?select=id,nome,descricao&order=nome.asc');
    }
    return todasFiliaisCache;
}

async function getCgoCache(forceRefresh = false) {
    if (cgoCache.length === 0 || forceRefresh) {
        cgoCache = await supabaseRequest('cgo?ativo=eq.true&select=codigo_cgo,descricao_cgo,obs&order=codigo_cgo.asc');
    }
    return cgoCache;
}

async function getAllCgoCache(forceRefresh = false) {
    if (todosCgoCache.length === 0 || forceRefresh) {
        todosCgoCache = await supabaseRequest('cgo?select=id,codigo_cgo,descricao_cgo,obs,ativo&order=codigo_cgo.asc');
    }
    return todosCgoCache;
}

// --- Gerenciamento de Usuários (sem alteração) ---
async function loadGerenciarUsuarios() {
    const tbody = document.getElementById('usuariosTableBody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading"><div class="spinner"></div>Carregando usuários...</td></tr>`;
    try {
        const usuarios = await supabaseRequest('usuarios?select=id,nome,username,email,role,ativo&order=nome.asc');
        renderUsuariosTable(tbody, usuarios || []);
    } catch (error) {
        console.error("Erro ao carregar usuários:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}
function renderUsuariosTable(tbody, usuarios) {
    if (!usuarios || usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-gray-500">Nenhum usuário encontrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = usuarios.map(u => {
        const statusClass = u.ativo ? 'text-green-600' : 'text-red-600';
        const statusText = u.ativo ? 'Ativo' : 'Inativo';
        const roleLabel = u.role.charAt(0).toUpperCase() + u.role.slice(1);
        return `
            <tr class="text-sm">
                <td>${u.id}</td>
                <td>${u.nome}</td>
                <td>${u.username}</td>
                <td>${u.email || '-'}</td> <td>${roleLabel}</td>
                <td><span class="font-semibold ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="abrirUsuarioModal(${u.id})">Editar</button>
                    </td>
            </tr>
        `;
    }).join('');
}
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
    filiaisContainer.innerHTML = '<div class="loading text-sm">Carregando filiais...</div>';
    let filiais = [];
    try {
        filiais = await getFiliaisCache();
    } catch (e) {
        alertContainer.innerHTML = `<div class="alert alert-error">Falha fatal ao carregar filiais: ${e.message}</div>`;
        return;
    }
    if (filiais.length > 0) {
         filiaisContainer.innerHTML = filiais.map(f => `
            <label class="flex items-center space-x-2 text-sm">
                <input type="checkbox" value="${f.id}" name="filiais">
                <span>${f.nome} (${f.descricao})</span>
            </label>
         `).join('');
    } else {
        filiaisContainer.innerHTML = '<div class="text-sm text-red-600">Nenhuma filial cadastrada.</div>';
    }
    if (id) {
        title.textContent = `Editar Usuário #${id}`;
        senhaHelp.style.display = 'block';
        document.getElementById('usuarioSenha').required = false;
        try {
            const userResponse = await supabaseRequest(`usuarios?id=eq.${id}&select=*,usuario_filiais(filial_id)`);
            if (!userResponse || userResponse.length === 0) throw new Error('Usuário não encontrado.');
            const user = userResponse[0];
            const filiaisAtuais = user.usuario_filiais.map(uf => uf.filial_id);
            document.getElementById('usuarioNome').value = user.nome;
            document.getElementById('usuarioUsername').value = user.username;
            document.getElementById('usuarioEmail').value = user.email || '';
            document.getElementById('usuarioRole').value = user.role;
            document.getElementById('usuarioAtivo').checked = user.ativo;
            filiaisContainer.querySelectorAll('input[name="filiais"]').forEach(checkbox => {
                if (filiaisAtuais.includes(parseInt(checkbox.value))) {
                    checkbox.checked = true;
                }
            });
        } catch (error) {
            console.error("Erro ao carregar dados do usuário:", error);
            alertContainer.innerHTML = `<div class="alert alert-error">Erro ao carregar dados: ${error.message}</div>`;
            return;
        }
    } else {
        title.textContent = 'Novo Usuário';
        senhaHelp.style.display = 'none';
        document.getElementById('usuarioSenha').required = true;
        document.getElementById('usuarioAtivo').checked = true;
    }
    modal.style.display = 'flex';
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
}
async function handleUsuarioFormSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('usuarioAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando...</div>';
    const id = document.getElementById('usuarioId').value;
    const nome = document.getElementById('usuarioNome').value;
    const username = document.getElementById('usuarioUsername').value;
    const email = document.getElementById('usuarioEmail').value;
    const senha = document.getElementById('usuarioSenha').value;
    const role = document.getElementById('usuarioRole').value;
    const ativo = document.getElementById('usuarioAtivo').checked;
    const selectedFiliaisCheckboxes = document.querySelectorAll('#usuarioFiliaisCheckboxes input[name="filiais"]:checked');
    const selectedFilialIds = Array.from(selectedFiliaisCheckboxes).map(cb => parseInt(cb.value));
    const isEdit = !!id;
    if (!nome || !username || !role || !email) {
         alertContainer.innerHTML = '<div class="alert alert-error">Nome, Usuário, E-mail e Grupo são obrigatórios.</div>';
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
    const userData = { nome, username, email, role, ativo };
    if (senha) {
        userData.senha_hash = senha;
    }
    try {
        let userId = id;
        if (isEdit) {
            await supabaseRequest(`usuarios?id=eq.${id}`, 'PATCH', userData);
        } else {
            const response = await supabaseRequest('usuarios', 'POST', userData);
            if (!response || response.length === 0) throw new Error("Falha ao criar o usuário, não obteve resposta.");
            userId = response[0].id;
        }
        if (!userId) throw new Error("ID do usuário não definido.");
        await supabaseRequest(`usuario_filiais?usuario_id=eq.${userId}`, 'DELETE');
        const filiaisToInsert = selectedFilialIds.map(filialId => ({
            usuario_id: userId,
            filial_id: filialId
        }));
        await supabaseRequest('usuario_filiais', 'POST', filiaisToInsert);
        showNotification(`Usuário ${isEdit ? 'atualizado' : 'criado'} com sucesso!`, 'success');
        closeModal('usuarioModal');
        loadGerenciarUsuarios();
    } catch (error) {
        console.error("Erro ao salvar usuário:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar: ${error.message}</div>`;
    }
}


// --- Gerenciamento de Filiais (sem alteração) ---
async function loadGerenciarFiliais() {
    const tbody = document.getElementById('filiaisTableBody');
    tbody.innerHTML = `<tr><td colspan="4" class="loading"><div class="spinner"></div>Carregando filiais...</td></tr>`;
    try {
        const filiais = await getFiliaisCache();
        renderFiliaisTable(tbody, filiais || []);
    } catch (error) {
        console.error("Erro ao carregar filiais:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}
function renderFiliaisTable(tbody, filiais) {
    if (!filiais || filiais.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Nenhuma filial encontrada.</td></tr>`;
        return;
    }
    tbody.innerHTML = filiais.map(f => `
        <tr class="text-sm">
            <td>${f.id}</td>
            <td>${f.nome}</td>
            <td>${f.descricao}</td>
            <td>
                <button class="btn btn-primary btn-small" onclick="abrirFilialModal(${f.id})">Editar</button>
                <button class="btn btn-danger btn-small ml-1" onclick="removerFilial(${f.id})">Remover</button>
            </td>
        </tr>
    `).join('');
}
async function abrirFilialModal(id = null) {
    const modal = document.getElementById('filialModal');
    const form = document.getElementById('filialForm');
    const alertContainer = document.getElementById('filialAlert');
    const title = document.getElementById('filialModalTitle');
    alertContainer.innerHTML = '';
    form.reset();
    document.getElementById('filialId').value = id || '';
    if (id) {
        title.textContent = `Editar Filial #${id}`;
        try {
            const filiais = await getFiliaisCache();
            const filial = filiais.find(f => f.id === id);
            if (!filial) throw new Error("Filial não encontrada no cache.");
            document.getElementById('filialNome').value = filial.nome;
            document.getElementById('filialDescricao').value = filial.descricao;
        } catch(error) {
             alertContainer.innerHTML = `<div class="alert alert-error">Erro ao carregar dados: ${error.message}</div>`;
             return;
        }
    } else {
        title.textContent = 'Nova Filial';
    }
    modal.style.display = 'flex';
}
async function handleFilialFormSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('filialAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando...</div>';
    const id = document.getElementById('filialId').value;
    const nome = document.getElementById('filialNome').value;
    const descricao = document.getElementById('filialDescricao').value;
    const isEdit = !!id;
    if (!nome || !descricao) {
         alertContainer.innerHTML = '<div class="alert alert-error">Nome e Descrição são obrigatórios.</div>';
         return;
    }
    const filialData = { nome, descricao };
    try {
        if (isEdit) {
            await supabaseRequest(`filiais?id=eq.${id}`, 'PATCH', filialData);
        } else {
            await supabaseRequest('filiais', 'POST', filialData);
        }
        todasFiliaisCache = []; 
        showNotification(`Filial ${isEdit ? 'atualizada' : 'criada'} com sucesso!`, 'success');
        closeModal('filialModal');
        loadGerenciarFiliais();
    } catch (error) {
         console.error("Erro ao salvar filial:", error);
         alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar: ${error.message}</div>`;
    }
}
async function removerFilial(id) {
    if (!confirm(`Tem certeza que deseja remover a Filial #${id}? \n\nAVISO: Isso pode falhar se a filial estiver associada a usuários ou solicitações.`)) {
        return;
    }
    try {
        await supabaseRequest(`filiais?id=eq.${id}`, 'DELETE');
        todasFiliaisCache = []; 
        showNotification(`Filial #${id} removida com sucesso!`, 'success');
        loadGerenciarFiliais();
    } catch (error) {
         console.error("Erro ao remover filial:", error);
         if (error.message.includes('foreign key constraint')) {
             showNotification(`Erro: Não é possível remover a filial #${id} pois ela está em uso (associada a usuários ou solicitações).`, 'error', 6000);
         } else {
             showNotification(`Erro ao remover filial: ${error.message}`, 'error');
         }
    }
}


// =======================================================
// === NOVO: FUNÇÕES DE GERENCIAMENTO DE PRODUTOS ===
// =======================================================

async function loadGerenciarProdutos() {
    const tbody = document.getElementById('produtosTableBody');
    tbody.innerHTML = `<tr><td colspan="4" class="loading"><div class="spinner"></div>Carregando produtos...</td></tr>`;
    try {
        // Busca produtos e seus CGOs permitidos
        const produtos = await supabaseRequest('produtos?select=id,codigo,descricao,cgos_permitidos&order=codigo.asc');
        renderProdutosTable(tbody, produtos || []);
    } catch (error) {
        console.error("Erro ao carregar produtos:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}

function renderProdutosTable(tbody, produtos) {
    if (!produtos || produtos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Nenhum produto encontrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = produtos.map(p => {
        // Formata o array de CGOs para exibição
        let cgosHtml = 'Nenhum';
        if (p.cgos_permitidos && p.cgos_permitidos.length > 0) {
            // Mostra CGOs como badges
            cgosHtml = p.cgos_permitidos.map(cgo => `<span class="status-badge status-aprovada" style="margin: 2px; background-color: #e0e7ff; color: #3730a3;">${cgo}</span>`).join(' ');
        }

        return `
            <tr class="text-sm">
                <td><strong>${p.codigo}</strong></td>
                <td>${p.descricao}</td>
                <td>${cgosHtml}</td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="abrirProdutoModal(${p.id})">Editar</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function abrirProdutoModal(id = null) {
    const modal = document.getElementById('produtoModal');
    const form = document.getElementById('produtoForm');
    const alertContainer = document.getElementById('produtoAlert');
    const title = document.getElementById('produtoModalTitle');
    const cgosContainer = document.getElementById('produtoCgosCheckboxes');
    alertContainer.innerHTML = '';
    form.reset();
    document.getElementById('produtoIdAdmin').value = id || '';

    // 1. Carregar todos os CGOs ativos
    cgosContainer.innerHTML = '<div class="loading text-sm">Carregando CGOs...</div>';
    let cgosAtivos = [];
    try {
        cgosAtivos = await getCgoCache(true); // Força refresh do cache de CGOs ativos
        if (cgosAtivos.length > 0) {
             cgosContainer.innerHTML = cgosAtivos.map(c => `
                <label class="flex items-center space-x-2 text-sm">
                    <input type="checkbox" value="${c.codigo_cgo}" name="cgos">
                    <span>${c.codigo_cgo} - ${c.descricao_cgo}</span>
                </label>
             `).join('');
        } else {
            cgosContainer.innerHTML = '<div class="text-sm text-red-600">Nenhum CGO ativo cadastrado.</div>';
        }
    } catch (e) {
        alertContainer.innerHTML = `<div class="alert alert-error">Falha fatal ao carregar CGOs: ${e.message}</div>`;
        return;
    }

    if (id) {
        // --- MODO EDIÇÃO ---
        title.textContent = `Editar Produto #${id}`;
        document.getElementById('produtoCodigoAdmin').disabled = true; // Não permite editar o código
        try {
            const prod = await supabaseRequest(`produtos?id=eq.${id}&select=*`);
            if (!prod || prod.length === 0) throw new Error("Produto não encontrado.");
            const produto = prod[0];

            document.getElementById('produtoCodigoAdmin').value = produto.codigo;
            document.getElementById('produtoDescricaoAdmin').value = produto.descricao;
            
            // Marcar os CGOs permitidos
            if (produto.cgos_permitidos && produto.cgos_permitidos.length > 0) {
                cgosContainer.querySelectorAll('input[name="cgos"]').forEach(checkbox => {
                    if (produto.cgos_permitidos.includes(checkbox.value)) {
                        checkbox.checked = true;
                    }
                });
            }
        } catch(error) {
             alertContainer.innerHTML = `<div class="alert alert-error">Erro ao carregar dados: ${error.message}</div>`;
             return;
        }
    } else {
        // --- MODO CRIAÇÃO ---
        title.textContent = 'Novo Produto';
        document.getElementById('produtoCodigoAdmin').disabled = false;
    }
    modal.style.display = 'flex';
}

async function handleProdutoFormSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('produtoAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando...</div>';

    const id = document.getElementById('produtoIdAdmin').value;
    const codigo = document.getElementById('produtoCodigoAdmin').value.trim();
    const descricao = document.getElementById('produtoDescricaoAdmin').value.trim();
    const isEdit = !!id;

    // Pega os CGOs selecionados
    const selectedCgosCheckboxes = document.querySelectorAll('#produtoCgosCheckboxes input[name="cgos"]:checked');
    const cgos_permitidos = Array.from(selectedCgosCheckboxes).map(cb => cb.value); // Array de strings ["475", "480"]

    if (!codigo || !descricao) {
         alertContainer.innerHTML = '<div class="alert alert-error">Código e Descrição são obrigatórios.</div>';
         return;
    }

    const produtoData = {
        codigo,
        descricao,
        cgos_permitidos // Salva o array de códigos
    };

    try {
        if (isEdit) {
            delete produtoData.codigo; // Não atualiza o código na edição
            await supabaseRequest(`produtos?id=eq.${id}`, 'PATCH', produtoData);
        } else {
            await supabaseRequest('produtos', 'POST', produtoData);
        }
        
        showNotification(`Produto ${isEdit ? 'atualizado' : 'criado'} com sucesso!`, 'success');
        closeModal('produtoModal');
        loadGerenciarProdutos();
        produtosCache = []; // Limpa o cache de produtos para forçar reload na solicitação

    } catch (error) {
         console.error("Erro ao salvar produto:", error);
         let errorMsg = error.message;
         if (errorMsg.includes('duplicate key value') && errorMsg.includes('produtos_codigo_key')) {
             errorMsg = "Já existe um produto com este código.";
         }
         alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar: ${errorMsg}</div>`;
    }
}


// =======================================================
// === FUNÇÕES DE CONSULTA CGO (sem alteração) ===
// =======================================================

async function abrirConsultaCgoModal() {
    const modal = document.getElementById('consultaCgoModal');
    const listContainer = document.getElementById('consultaCgoList');
    listContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando CGOs...</div>';
    modal.style.display = 'flex';
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
    try {
        const cgos = await getCgoCache(false); 
        renderConsultaCgoList(cgos || []);
    } catch (error) {
        console.error("Erro ao carregar CGOs para consulta:", error);
        listContainer.innerHTML = `<div class="alert alert-error">Erro ao carregar: ${error.message}</div>`;
    }
}
function renderConsultaCgoList(cgos) {
    const listContainer = document.getElementById('consultaCgoList');
    if (!cgos || cgos.length === 0) {
        listContainer.innerHTML = `<div id="cgoConsultaEmptyState">Nenhum CGO ativo encontrado.</div>`;
        return;
    }
    listContainer.innerHTML = cgos.map(c => `
        <div class="cgo-item-card" data-filter-text="${(c.codigo_cgo + ' ' + c.descricao_cgo + ' ' + (c.obs || '')).toLowerCase()}">
            <div class="cgo-item-header">
                <span class="cgo-item-codigo">${c.codigo_cgo}</span>
                <span class="cgo-item-descricao">${c.descricao_cgo}</span>
            </div>
            <p class="cgo-item-obs">${c.obs || 'Sem observações.'}</p>
        </div>
    `).join('');
}
function filtrarCgoConsulta() {
    const searchTerm = document.getElementById('cgoSearchInput').value.toLowerCase();
    const items = document.querySelectorAll('#consultaCgoList .cgo-item-card');
    let itemsFound = 0;
    items.forEach(item => {
        const filterText = item.dataset.filterText;
        if (filterText.includes(searchTerm)) {
            item.style.display = 'block';
            itemsFound++;
        } else {
            item.style.display = 'none';
        }
    });
    let emptyState = document.getElementById('cgoConsultaEmptyState');
    if (itemsFound === 0 && items.length > 0) {
        if (!emptyState) {
            emptyState = document.createElement('div');
            emptyState.id = 'cgoConsultaEmptyState';
            document.getElementById('consultaCgoList').appendChild(emptyState);
        }
        emptyState.textContent = 'Nenhum CGO encontrado para "' + searchTerm + '"';
        emptyState.style.display = 'block';
    } else if (emptyState) {
        emptyState.style.display = 'none';
    }
}


// =======================================================
// === FUNÇÕES DE GERENCIAMENTO CGO (sem alteração) ===
// =======================================================

async function loadGerenciarCgo() {
    const tbody = document.getElementById('cgoTableBody');
    tbody.innerHTML = `<tr><td colspan="5" class="loading"><div class="spinner"></div>Carregando CGOs...</td></tr>`;
    try {
        const cgos = await getAllCgoCache(true);
        renderCgoTable(tbody, cgos || []);
    } catch (error) {
        console.error("Erro ao carregar CGOs:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}
function renderCgoTable(tbody, cgos) {
    if (!cgos || cgos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum CGO encontrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = cgos.map(c => {
        const statusClass = c.ativo ? 'text-green-600' : 'text-red-600';
        const statusText = c.ativo ? 'Ativo' : 'Inativo';
        const toggleButton = c.ativo
            ? `<button class="btn btn-warning btn-small ml-1" onclick="toggleCgoStatus(${c.id}, false)">Desativar</button>`
            : `<button class="btn btn-success btn-small ml-1" onclick="toggleCgoStatus(${c.id}, true)">Ativar</button>`;
        return `
            <tr class="text-sm">
                <td><strong>${c.codigo_cgo}</strong></td>
                <td>${c.descricao_cgo}</td>
                <td>${c.obs || '-'}</td>
                <td><span class="font-semibold ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="abrirCgoModal(${c.id})">Editar</button>
                    ${toggleButton}
                </td>
            </tr>
        `;
    }).join('');
}
async function abrirCgoModal(id = null) {
    const modal = document.getElementById('cgoModal');
    const form = document.getElementById('cgoForm');
    const alertContainer = document.getElementById('cgoAlert');
    const title = document.getElementById('cgoModalTitle');
    alertContainer.innerHTML = '';
    form.reset();
    document.getElementById('cgoId').value = id || '';
    if (id) {
        title.textContent = `Editar CGO #${id}`;
        document.getElementById('cgoCodigo').disabled = true;
        try {
            const cgos = await getAllCgoCache();
            const cgo = cgos.find(c => c.id === id);
            if (!cgo) throw new Error("CGO não encontrado no cache.");
            document.getElementById('cgoCodigo').value = cgo.codigo_cgo;
            document.getElementById('cgoDescricao').value = cgo.descricao_cgo;
            document.getElementById('cgoObs').value = cgo.obs || '';
            document.getElementById('cgoAtivo').checked = cgo.ativo;
        } catch(error) {
             alertContainer.innerHTML = `<div class="alert alert-error">Erro ao carregar dados: ${error.message}</div>`;
             return;
        }
    } else {
        title.textContent = 'Novo CGO';
        document.getElementById('cgoCodigo').disabled = false;
        document.getElementById('cgoAtivo').checked = true;
    }
    modal.style.display = 'flex';
}
async function handleCgoFormSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('cgoAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando...</div>';
    const id = document.getElementById('cgoId').value;
    const codigo_cgo = document.getElementById('cgoCodigo').value.trim();
    const descricao_cgo = document.getElementById('cgoDescricao').value.trim();
    const obs = document.getElementById('cgoObs').value.trim();
    const ativo = document.getElementById('cgoAtivo').checked;
    const isEdit = !!id;
    if (!codigo_cgo || !descricao_cgo) {
         alertContainer.innerHTML = '<div class="alert alert-error">Código CGO e Descrição são obrigatórios.</div>';
         return;
    }
    const cgoData = { codigo_cgo, descricao_cgo, obs: obs || null, ativo };
    try {
        if (isEdit) {
            delete cgoData.codigo_cgo;
            await supabaseRequest(`cgo?id=eq.${id}`, 'PATCH', cgoData);
        } else {
            await supabaseRequest('cgo', 'POST', cgoData);
        }
        cgoCache = []; 
        todosCgoCache = [];
        showNotification(`CGO ${isEdit ? 'atualizado' : 'criado'} com sucesso!`, 'success');
        closeModal('cgoModal');
        loadGerenciarCgo();
    } catch (error) {
         console.error("Erro ao salvar CGO:", error);
         let errorMsg = error.message;
         if (errorMsg.includes('duplicate key value violates unique constraint "cgo_codigo_cgo_key"')) {
             errorMsg = "Já existe um CGO com este código.";
         }
         alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar: ${errorMsg}</div>`;
    }
}
async function toggleCgoStatus(id, newStatus) {
    const action = newStatus ? 'ativar' : 'desativar';
    if (!confirm(`Tem certeza que deseja ${action} o CGO #${id}?`)) {
        return;
    }
    try {
        await supabaseRequest(`cgo?id=eq.${id}`, 'PATCH', { ativo: newStatus });
        cgoCache = []; 
        todosCgoCache = [];
        showNotification(`CGO #${id} ${action.replace('a', 'a')}do com sucesso!`, 'success');
        loadGerenciarCgo();
    } catch (error) {
         console.error(`Erro ao ${action} CGO:`, error);
         showNotification(`Erro ao ${action} CGO: ${error.message}`, 'error');
    }
}

// SUBSTITUA a função 'abrirRetiradaModal' antiga por esta:
/**
 * NOVO: Abre modal de Retirada para um PEDIDO (em lote)
 */
async function abrirRetiradaLoteModal(solicitacaoId) { 
    const modal = document.getElementById('retiradaModal');
    document.getElementById('retiradaPedidoIdDisplay').textContent = solicitacaoId;
    document.getElementById('retiradaSolicitacaoId').value = solicitacaoId; // Salva o ID do PEDIDO
    document.getElementById('retiradaForm').reset();
    document.getElementById('retiradaAlert').innerHTML = '';
    
    const listContainer = document.getElementById('retiradaItensList');
    listContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando itens...</div>';

    modal.style.display = 'flex';

    try {
        // Busca todos os itens AGUARDANDO RETIRADA desta solicitação
        const response = await supabaseRequest(
            `solicitacao_itens?solicitacao_id=eq.${solicitacaoId}&status=eq.aguardando_retirada&select=*,produtos(codigo,descricao)&order=id.asc`
        );

        if (!response || response.length === 0) {
            listContainer.innerHTML = '<div class="text-center py-4 text-gray-500">Nenhum item aguardando retirada para este pedido.</div>';
            return;
        }

        // Renderiza a lista de itens com checkboxes
        listContainer.innerHTML = response.map(item => {
            const produto = item.produtos;
            return `
                <div class="bg-gray-50 p-4 rounded border flex items-start">
                    <input type="checkbox" value="${item.id}" name="retirar_item_ids" 
                           class="h-5 w-5 mt-1 mr-3" checked> <div class="flex-1">
                        <p class="font-semibold">${produto.codigo} - ${produto.descricao}</p>
                        <p class="text-sm text-gray-700">
                            Qtd. Executada: ${item.quantidade_executada} | 
                            Valor Total: R$ ${item.valor_total_executado.toFixed(2)}
                        </p>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Erro ao carregar itens para retirada:", error);
        listContainer.innerHTML = `<div class="alert alert-error">Erro ao carregar itens: ${error.message}</div>`;
    }
}


// SUBSTITUA a função 'handleRetiradaSubmit' antiga por esta:
/**
 * NOVO: Submissão do formulário de Retirada (em lote e com múltiplos anexos)
 */
async function handleRetiradaSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('retiradaAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Processando retirada...</div>';

    const solicitacaoId = document.getElementById('retiradaSolicitacaoId').value; // ID do PEDIDO
    const fotoFiles = document.getElementById('fotosRetirada').files; // Múltiplos arquivos
    const checkedItems = document.querySelectorAll('input[name="retirar_item_ids"]:checked');

    if (checkedItems.length === 0) {
        alertContainer.innerHTML = '<div class="alert alert-error">Selecione pelo menos um item para confirmar a retirada.</div>';
        return;
    }
    if (!fotoFiles || fotoFiles.length === 0) {
        alertContainer.innerHTML = '<div class="alert alert-error">Por favor, anexe pelo menos uma foto ou anexo.</div>';
        return;
    }

    try {
        // 1. Fazer Upload de TODAS as fotos/anexos
        alertContainer.innerHTML += '<div class="loading"><div class="spinner"></div>Enviando anexos...</div>';
        let fotosUrls = []; // Array que vai guardar as URLs
        
        for (const file of fotoFiles) {
            try {
                // Usamos o ID do PEDIDO para a pasta
                const apiUrl = `/api/upload?fileName=${encodeURIComponent(file.name)}&solicitacaoId=${solicitacaoId}&fileType=foto_retirada`; 
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': file.type || 'application/octet-stream' },
                    body: file,
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Erro ${response.status} ao enviar ${file.name}: ${errorData.details || errorData.error}`);
                }
                const result = await response.json();
                if (result.publicUrl) {
                    fotosUrls.push(result.publicUrl); // Adiciona a URL ao nosso array
                }
            } catch (uploadError) {
                 console.error(`Falha no upload do anexo ${file.name}:`, uploadError);
                 throw new Error(`Falha no upload do anexo ${file.name}`);
            }
        }
        
        if (fotosUrls.length === 0) {
             throw new Error('Nenhum anexo foi enviado com sucesso.');
        }

        // 2. Atualizar todos os ITENS selecionados
        alertContainer.innerHTML += '<div class="loading"><div class="spinner"></div>Atualizando itens...</div>';
        
        const dataRetirada = new Date().toISOString();
        
        for (const item of checkedItems) {
            const itemId = item.value;
            
            const updateData = {
                status: 'finalizada', // Status final do ITEM
                retirada_por_id: currentUser.id,
                data_retirada: dataRetirada,
                fotos_retirada_urls: fotosUrls // Salva o ARRAY de URLs
            };
            await supabaseRequest(`solicitacao_itens?id=eq.${itemId}`, 'PATCH', updateData);
        }

        // 3. (Opcional) Verificar se o PEDIDO (cabeçalho) está 100% finalizado
        // Busca itens que AINDA NÃO estejam finalizados ou negados
        const itensPendentes = await supabaseRequest(
            `solicitacao_itens?solicitacao_id=eq.${solicitacaoId}&status=not.in.(finalizada,negada)&select=id&limit=1`
        );
        
        // Se não há mais itens pendentes, fecha o pedido
        if (itensPendentes.length === 0) {
            await supabaseRequest(`solicitacoes_baixa?id=eq.${solicitacaoId}`, 'PATCH', { status: 'finalizada' });
        }
        
        showNotification(`Retirada de ${checkedItems.length} item(ns) confirmada!`, 'success');
        closeModal('retiradaModal');
        loadMinhasSolicitacoes(); // Recarrega a lista principal

    } catch (error) {
        console.error("Erro ao confirmar retirada:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao confirmar: ${error.message}</div>`;
    }
}
