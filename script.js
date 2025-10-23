// --- Variáveis Globais ---
let currentUser = null; // { id, nome, username, role, filiais: [{id, nome}] }
let selectedFilial = null; // { id, nome, descricao }
let produtosCache = []; // Cache simples de produtos para lookup
let todasFiliaisCache = []; // Cache de todas as filiais para admin
let cgoCache = []; // NOVO: Cache de CGOs ativos
let todosCgoCache = []; // NOVO: Cache de TODOS os CGOs (para admin)
let carrinhoItens = []; // NOVO: Array para o "carrinho" da nova solicitação
let tiposBaixaCache = []
let todasTiposBaixaCache = []; // NOVO: Cache de TODOS os tipos (admin)
let lancamentosCache = []; // NOVO: Cache de despesas externas
let carrinhoFinanceiro = [];
let meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
let orcamentosCache = {}; // Cache para orçamentos
let realizadoManualCache = []; 
let linhasOrcamentariasCache = []; 
let todasLinhasOrcamentariasCache = [];
let chartInstances = {}; // Cache para as instâncias dos gráficos

// --- Inicialização (SUBSTITUIR esta parte dentro do DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Nova Solicitação
    const qtdInput = document.getElementById('quantidadeSolicitada');
    const valorInput = document.getElementById('valorUnitarioSolicitado');
    const codigoInput = document.getElementById('produtoCodigo');
    const tipoBaixaSelect = document.getElementById('tipoBaixaSelect');

    if (qtdInput && valorInput) {
        qtdInput.addEventListener('input', calcularValorTotalSolicitado);
        valorInput.addEventListener('input', calcularValorTotalSolicitado);
    }
    if (codigoInput) {
        codigoInput.addEventListener('blur', buscarProdutoPorCodigo); // AJUSTADO
    }
    if (tipoBaixaSelect) { // AJUSTADO
    tipoBaixaSelect.addEventListener('change', handleTipoBaixaChange); // NOVA FUNÇÃO
}

    // Bind forms (adicionado linhaForm)
    document.getElementById('addItemForm')?.addEventListener('submit', handleAddItem);
    document.getElementById('submitPedidoButton')?.addEventListener('click', handleNovaSolicitacaoSubmit);
    document.getElementById('executarForm')?.addEventListener('submit', handleExecucaoSubmit);
    document.getElementById('retiradaForm')?.addEventListener('submit', handleRetiradaSubmit);
    document.getElementById('usuarioForm')?.addEventListener('submit', handleUsuarioFormSubmit);
    document.getElementById('filialForm')?.addEventListener('submit', handleFilialFormSubmit);
    document.getElementById('cgoForm')?.addEventListener('submit', handleCgoFormSubmit);
    document.getElementById('produtoForm')?.addEventListener('submit', handleProdutoFormSubmit);
    document.getElementById('tipoBaixaForm')?.addEventListener('submit', handleTipoBaixaFormSubmit);
    document.getElementById('linhaForm')?.addEventListener('submit', handleLinhaFormSubmit); // AJUSTADO
    document.getElementById('addItemNfForm')?.addEventListener('submit', handleAddItemFinanceiro);
    document.getElementById('submitLancamentoNfButton')?.addEventListener('click', handleLancamentoNfSubmit);
    document.getElementById('nfLinhaOrcamentariaSelect')?.addEventListener('change', simularImpactoOrcamentoNF);
    document.getElementById('carrinhoNfItensBody')?.addEventListener('click', function(event) {
        if (event.target.closest('.remover-nf-item')) {
            const index = event.target.closest('.remover-nf-item').dataset.index;
            removerItemFinanceiro(index);
        }
    });

    // Consulta CGO
    document.getElementById('helpCgoButton')?.addEventListener('click', abrirConsultaCgoModal);
    document.getElementById('cgoSearchInput')?.addEventListener('input', filtrarCgoConsulta);

    // Gerenciar Orçamentos (AJUSTADO)
    document.getElementById('buscarOrcamentosBtn')?.addEventListener('click', loadGerenciarOrcamentos);
    
    // NOVO: Event listeners para Gráficos
    document.getElementById('gerarGraficosBtn')?.addEventListener('click', loadGraficosData);

    // NOVO: Event listeners para Lançamento Manual
    document.getElementById('buscarRealizadoManualBtn')?.addEventListener('click', loadRealizadoManualForm);
    document.getElementById('lancamentoManualForm')?.addEventListener('submit', handleLancamentoManualRealizadoSubmit);

        
    // Adiciona listener para salvar orçamento via delegation (AJUSTADO)
    const orcamentosTableBody = document.getElementById('orcamentosTableBody');
    if (orcamentosTableBody) {
        orcamentosTableBody.addEventListener('click', function(event) {
            if (event.target && event.target.matches('button.btn-success')) {
                const button = event.target;
                const row = button.closest('tr');
                // Pega linhaId do data attribute do BOTÃO
                const linhaId = button.dataset.linhaId;
                const filialId = document.getElementById('orcamentoFilialSelect').value;
                const ano = document.getElementById('orcamentoAnoSelect').value;
                if (linhaId && filialId && ano && row) {
                    salvarOrcamento(linhaId, filialId, ano, row);
                } else {
                    console.error("Faltando dados para salvar orçamento:", { linhaId, filialId, ano, row });
               }
            }
        });
    }
});

async function handleLogin(event) {
    event.preventDefault(); // Impede o recarregamento da página

    // Limpa a mensagem de erro anterior
    showError(''); 
    
    // Leitura dos campos do formulário (ID 'username' e 'password')
    const email = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    
    try {
        // 1. Chamar a API de Autenticação do Supabase
        const authResponse = await fetch('/api/login', { 
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ email, password })
        });
        
        if (!authResponse.ok) {
            // Isso captura o 401: credenciais inválidas
            throw new Error('Falha na autenticação. Verifique e-mail e senha.');
        }

        const { user: authUser, session: authSession } = await authResponse.json();
        
        // 2. ARMAZENAR O TOKEN JWT (CRUCIAL para todas as requisições futuras)
        // ESTAS LINHAS FORAM MOVIDAS PARA CÁ.
        localStorage.setItem('auth_token', authSession.access_token);
        // O user só será salvo no final, após a busca do perfil
        
        // 3. Buscar o perfil customizado E AS FILIAIS (SELECT COMPLEXO COM JOIN)
        // O supabaseRequest agora tem o token no localStorage e deve funcionar.
        const customProfile = await supabaseRequest('GET', `usuarios?auth_user_id=eq.${authUser.id}&select=*,usuario_filiais(filial_id,filiais(id,nome,descricao))`);
        
        const user = customProfile[0];

        if (!user) {
            // Falha se o usuário autenticado não tiver um registro correspondente na tabela 'usuarios'
            throw new Error('Perfil de usuário não encontrado. Vínculo de dados incompleto.');
        }
        
        // *** Mapear e Limpar Filiais ***
        const userFiliais = user.usuario_filiais ? user.usuario_filiais.map(uf => uf.filiais) : [];
        
        if (userFiliais.length === 0) {
            throw new Error('Usuário não tem filiais associadas ou RLS bloqueou a busca das filiais.');
        }

        // Finaliza o objeto do usuário
        user.filiais = userFiliais; 
        delete user.usuario_filiais; 
        
        // Define o usuário globalmente para uso em redirectToDashboard
        currentUser = user; 

        // 4. ARMAZENAR DADOS DO USUÁRIO
        localStorage.setItem('user', JSON.stringify(currentUser)); 
        
        // 5. Redirecionar
        redirectToDashboard();

    } catch (error) {
        // Exibe o erro (incluindo falha de RLS que retorna 401/403)
        showError(error.message);
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
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');

    document.querySelectorAll('.sidebar nav .nav-item').forEach(item => item.classList.remove('active'));
    if (element) { element.classList.add('active'); }
    else {
        const linkSelector = viewId === 'homeView' ? '.sidebar nav a[href="#homeView"]' : `.sidebar nav a[href="#${viewId.replace('View', '')}"]`;
        const link = document.querySelector(linkSelector);
        if (link) link.classList.add('active');
    }

    // Carrega dados específicos da view
    // Garante que as funções existam antes de chamar
    try {
        switch (viewId) {
            case 'novaSolicitacaoView': if(typeof iniciarNovaSolicitacao === 'function') iniciarNovaSolicitacao(); break;
            case 'minhasSolicitacoesView': if(typeof loadMinhasSolicitacoes === 'function') loadMinhasSolicitacoes(); break;
            case 'aprovarSolicitacoesView': if(typeof loadAprovacoesPendentes === 'function') loadAprovacoesPendentes(); break;
            case 'executarSolicitacoesView': if(typeof loadExecucoesPendentes === 'function') loadExecucoesPendentes(); break;
            case 'historicoBaixasView': if(typeof loadHistoricoGeral === 'function') loadHistoricoGeral(); break;
            case 'gerenciarUsuariosView': if(typeof loadGerenciarUsuarios === 'function') loadGerenciarUsuarios(); break;
            case 'gerenciarFiliaisView': if(typeof loadGerenciarFiliais === 'function') loadGerenciarFiliais(); break;
            case 'gerenciarProdutosView': if(typeof loadGerenciarProdutos === 'function') loadGerenciarProdutos(); break;
            case 'gerenciarCgoView': if(typeof loadGerenciarCgo === 'function') loadGerenciarCgo(); break;
            case 'gerenciarTiposBaixaView': if(typeof loadGerenciarTiposBaixa === 'function') loadGerenciarTiposBaixa(); break;
            case 'gerenciarLinhasView': if(typeof loadGerenciarLinhas === 'function') loadGerenciarLinhas(); break; // Corrigido
            case 'gerenciarOrcamentosView': if(typeof prepararGerenciarOrcamentos === 'function') prepararGerenciarOrcamentos(); break; // Corrigido
            case 'lancamentosFinanceirosView': if(typeof loadLancamentosFinanceiros === 'function') loadLancamentosFinanceiros(); break;
            // NOVOS CASOS
            case 'graficosView': if(typeof prepararGraficosView === 'function') prepararGraficosView(); break;
            case 'lancamentoManualRealizadoView': if(typeof prepararLancamentoManualRealizadoView === 'function') prepararLancamentoManualRealizadoView(); break;
        }
    } catch(e) {
        console.error(`Erro ao carregar dados para a view ${viewId}:`, e);
    }

    if (typeof feather !== 'undefined') feather.replace();
    if (typeof AOS !== 'undefined') AOS.refresh();
}

// SUBSTITUA A FUNÇÃO 'logout' (Linha ~234)
function logout() {
    currentUser = null; selectedFilial = null;
    todasFiliaisCache = []; cgoCache = []; todosCgoCache = []; carrinhoItens = [];
    // ATUALIZADO: Usando novas variáveis de cache
    linhasOrcamentariasCache = []; todasLinhasOrcamentariasCache = []; orcamentosCache = {};
    tiposBaixaCache = []; todasTiposBaixaCache = []; realizadoManualCache = []; 
    carrinhoFinanceiro = []; lancamentosCache = [];
    document.getElementById('mainSystem').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('helpCgoButton').style.display = 'none';
    document.getElementById('loginForm').reset();
    document.getElementById('loginAlert').innerHTML = '';
    document.getElementById('filialSelectGroup').style.display = 'none';
    showNotification('Você foi desconectado.', 'info');
}

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


// SUBSTITUA A FUNÇÃO ANTIGA
async function buscarProdutoPorCodigo() {
    const codigo = document.getElementById('produtoCodigo').value.trim();
    const descricaoInput = document.getElementById('produtoDescricao');
    const produtoIdInput = document.getElementById('produtoId');
    const valorUnitInput = document.getElementById('valorUnitarioSolicitado');
    const selectedTipoBaixaId = document.getElementById('tipoBaixaSelect').value; // MUDOU
    const tipoBaixaNome = document.getElementById('tipoBaixaSelect').options[document.getElementById('tipoBaixaSelect').selectedIndex].text;

    descricaoInput.value = ''; produtoIdInput.value = ''; valorUnitInput.value = '';
    descricaoInput.classList.remove('input-error'); calcularValorTotalSolicitado();

    if (!codigo || !selectedTipoBaixaId) return; // MUDOU

    try {
        // 1. Busca o produto
        let produto = produtosCache.find(p => p.codigo === codigo);
        if (!produto) {
            const response = await supabaseRequest(`produtos?codigo=eq.${codigo}&select=id,descricao,cgos_permitidos`);
            if (response && response[0]) { produto = response[0]; produtosCache.push(produto); }
        }

        if (produto) {
            // 2. Busca todos os CGOs (para mapear tipo_baixa_id -> codigo_cgo)
            const allCgos = await getAllCgoCache(false); // Pega do cache se possível

            // 3. Filtra CGOs que pertencem ao Tipo de Baixa selecionado
            const cgosDoTipo = allCgos
                .filter(c => c.tipo_baixa_id == selectedTipoBaixaId)
                .map(c => c.codigo_cgo); // Array de códigos: ["750", "753"]

            if (cgosDoTipo.length === 0) {
                showNotification('Este Tipo de Baixa não tem CGOs associados.', 'error');
                descricaoInput.value = 'Tipo de Baixa não configurado';
                descricaoInput.classList.add('input-error');
                return;
            }

            // 4. Pega os CGOs permitidos do Produto
            const cgosDoProduto = produto.cgos_permitidos || []; // Array: ["750", "499"]

            // 5. Verifica se há INTERSEÇÃO (overlap)
            const isPermitido = cgosDoProduto.some(cgoProduto => cgosDoTipo.includes(cgoProduto));

            if (isPermitido) {
                descricaoInput.value = produto.descricao; 
                produtoIdInput.value = produto.id; 
                valorUnitInput.focus();
            } else {
                descricaoInput.value = `${produto.descricao} (NÃO PERMITIDO p/ ${tipoBaixaNome})`;
                produtoIdInput.value = ''; 
                descricaoInput.classList.add('input-error');
                showNotification('Produto não permitido para este Tipo de Baixa.', 'error');
            }
        } else {
            descricaoInput.value = 'Produto não encontrado'; 
            produtoIdInput.value = '';
            showNotification('Produto não cadastrado.', 'error');
        }
        calcularValorTotalSolicitado();
    } catch (error) {
        console.error("Erro ao buscar produto:", error);
        descricaoInput.value = 'Erro ao buscar'; produtoIdInput.value = '';
        showNotification('Erro ao buscar produto.', 'error');
    }
}

function calcularValorTotalSolicitado() {
    const qtd = parseFloat(document.getElementById('quantidadeSolicitada').value) || 0;
    const valorUnit = parseFloat(document.getElementById('valorUnitarioSolicitado').value) || 0;
    const total = qtd * valorUnit;
    document.getElementById('valorTotalSolicitado').value = total.toFixed(2);
}

// SUBSTITUA A FUNÇÃO ANTIGA
async function handleNovaSolicitacaoSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('novaSolicitacaoAlert');
    const tipoBaixaId = document.getElementById('tipoBaixaSelect').value; // MUDOU
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Enviando solicitação...</div>';

    if (!tipoBaixaId) { // MUDOU
        alertContainer.innerHTML = '<div class="alert alert-error">Selecione o Tipo de Baixa.</div>'; 
        return; 
    }
    if (carrinhoItens.length === 0) { 
        alertContainer.innerHTML = '<div class="alert alert-error">Adicione itens ao pedido.</div>'; 
        return; 
    }

    try {
        const solicitacaoHeader = {
            filial_id: selectedFilial.id, 
            solicitante_id: currentUser.id,
            status: 'aguardando_aprovacao', 
            tipo_baixa_id: parseInt(tipoBaixaId) // MUDOU
        };
        const response = await supabaseRequest('solicitacoes_baixa', 'POST', solicitacaoHeader);
        if (!response || !response[0]?.id) throw new Error('Falha ao criar o cabeçalho.');
        const novaSolicitacaoId = response[0].id;

        const itensParaInserir = carrinhoItens.map(item => ({
            solicitacao_id: novaSolicitacaoId, 
            produto_id: item.produto_id,
            quantidade_solicitada: item.quantidade_solicitada, 
            valor_unitario_solicitado: item.valor_unitario_solicitado,
            valor_total_solicitado: item.valor_total_solicitado, 
            status: 'aguardando_aprovacao'
        }));
        await supabaseRequest('solicitacao_itens', 'POST', itensParaInserir);

        showNotification('Solicitação enviada!', 'success');
        if(typeof iniciarNovaSolicitacao === 'function') iniciarNovaSolicitacao(); // Chama a função que reseta
        showView('minhasSolicitacoesView', document.querySelector('a[href="#minhasSolicitacoes"]'));

    } catch (error) {
        console.error("Erro ao enviar solicitação:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro: ${error.message}</div>`;
    }
}

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
    if (!modal) return;
    modal.style.display = 'none';
    const alertDiv = modal.querySelector('[id$="Alert"]');
    if (alertDiv) alertDiv.innerHTML = '';

    // Limpeza específica de cada modal
    if (modalId === 'usuarioModal' && document.getElementById('usuarioForm')) { document.getElementById('usuarioForm').reset(); document.getElementById('usuarioId').value = ''; }
    if (modalId === 'filialModal' && document.getElementById('filialForm')) { document.getElementById('filialForm').reset(); document.getElementById('filialId').value = ''; }
    if (modalId === 'cgoModal' && document.getElementById('cgoForm')) { document.getElementById('cgoForm').reset(); document.getElementById('cgoId').value = ''; }
    if (modalId === 'produtoModal' && document.getElementById('produtoForm')) { document.getElementById('produtoForm').reset(); document.getElementById('produtoIdAdmin').value = ''; }
    if (modalId === 'tipoBaixaModal' && document.getElementById('tipoBaixaForm')) { document.getElementById('tipoBaixaForm').reset(); document.getElementById('tipoBaixaId').value = ''; }
    if (modalId === 'detalhesDespesaModal') { /* Apenas fecha */ }
    if (modalId === 'linhaModal' && document.getElementById('linhaForm')) { document.getElementById('linhaForm').reset(); document.getElementById('linhaId').value = ''; }
    if (modalId === 'consultaCgoModal' && document.getElementById('cgoSearchInput')) { document.getElementById('cgoSearchInput').value = ''; if(typeof filtrarCgoConsulta === 'function') filtrarCgoConsulta(); }
}

// SUBSTITUA A FUNÇÃO ANTIGA
async function abrirDetalhesModal(id) {
    const modal = document.getElementById('detalhesModal'); const content = document.getElementById('detalhesContent'); const orcamentoSection = document.getElementById('detalhesOrcamentoSection');
    document.getElementById('detalhesId').textContent = id; content.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando...</div>'; orcamentoSection.style.display = 'none'; modal.style.display = 'flex';
    try {
        // AJUSTE: Adicionado tipo_baixa_id e tipos_baixa(nome) ao select
        const s = await supabaseRequest(`solicitacoes_baixa?id=eq.${id}&select=*,filiais(nome,descricao),usuarios:usuarios!solicitacoes_baixa_solicitante_id_fkey(nome),tipo_baixa_id,tipos_baixa(nome)`); 
        if (!s || !s[0]) throw new Error('Solicitação não encontrada.'); const sol = s[0];

        // AJUSTE: Adicionado produtos(codigo,descricao) para a simulação
        const itens = await supabaseRequest(`solicitacao_itens?solicitacao_id=eq.${id}&select=*,produtos(id,codigo,descricao),usuarios_aprovador:usuarios!solicitacao_itens_aprovador_id_fkey(nome),usuarios_executor:usuarios!solicitacao_itens_executor_id_fkey(nome),usuarios_retirada:usuarios!solicitacao_itens_retirada_por_id_fkey(nome)&order=id.asc`);

        const anexos = await supabaseRequest(`anexos_baixa?solicitacao_id=eq.${id}`);
        const formatDate = (d) => d ? new Date(d).toLocaleString('pt-BR') : 'N/A'; let anexosHtml = 'Nenhum.'; if (anexos && anexos.length > 0) { anexosHtml = anexos.map(a => `<a href="${a.url_arquivo}" target="_blank" class="text-blue-600 hover:underline block">${a.nome_arquivo || 'Ver'}</a>`).join(''); }

        // AJUSTE: Exibe o Tipo de Baixa (Intenção)
        const tipoBaixaNome = sol.tipos_baixa ? sol.tipos_baixa.nome : (sol.codigo_movimentacao_previsto || 'N/A (Antigo)'); // Fallback

        let headerHtml = `<p><strong>Status:</strong> <span class="status-badge status-${sol.status}">${getStatusLabel(sol.status)}</span></p> <p><strong>Filial:</strong> ${sol.filiais.nome} - ${sol.filiais.descricao}</p> <p><strong>Solicitante:</strong> ${sol.usuarios.nome}</p> <p><strong>Data:</strong> ${formatDate(sol.data_solicitacao)}</p> <p><strong>Tipo de Baixa:</strong> ${tipoBaixaNome}</p> <p><strong>Anexos:</strong></p> <div>${anexosHtml}</div> <hr class="my-4"> <h4 class="text-lg font-semibold mb-2">Itens</h4>`;

        let itensHtml = (itens || []).map(item => { const fotosHtml = (item.fotos_retirada_urls && item.fotos_retirada_urls.length > 0) ? item.fotos_retirada_urls.map(url => `<a href="${url}" target="_blank" class="text-blue-600 hover:underline mr-2">Ver</a>`).join('') : 'Nenhum'; return `<div class="bg-gray-50 p-4 rounded border mb-3"> <p class="font-bold">${item.produtos.codigo} - ${item.produtos.descricao}</p> <p><strong>Status Item:</strong> <span class="status-badge status-${item.status}">${getStatusLabel(item.status)}</span></p> <hr class="my-2"> <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 text-sm"> <div><h5>Solicitação</h5> <p>Qtd: ${item.quantidade_solicitada}</p> <p>Valor: R$ ${item.valor_total_solicitado.toFixed(2)}</p> </div> <div><h5>Aprovação</h5> <p>Por: ${item.usuarios_aprovador?.nome || '-'}</p> ${item.status === 'negada' ? `<p>Motivo: ${item.motivo_negacao || 'N/A'}</p>` : ''} </div> <div class="mt-2"><h5>Execução</h5> <p>Por: ${item.usuarios_executor?.nome || '-'}</p> <p>Qtd: ${item.quantidade_executada ?? '-'}</p> <p>Valor: R$ ${item.valor_total_executado?.toFixed(2) ?? '-'}</p> <p>CGO: ${item.codigo_movimentacao || '-'}</p> <p>Justif: ${item.justificativa_execucao || '-'}</p> </div> <div class="mt-2"><h5>Retirada</h5> <p>Por: ${item.usuarios_retirada?.nome || '-'}</p> <p>Anexos: ${fotosHtml}</p> </div> </div> </div>`; }).join('');
        content.innerHTML = headerHtml + (itensHtml || '<p>Nenhum item.</p>'); if (typeof feather !== 'undefined') feather.replace();

        // AJUSTE: Chama a simulação com o tipo_baixa_id
        if ((currentUser.role === 'gestor' || currentUser.role === 'admin') && sol.status === 'aguardando_aprovacao' && sol.tipo_baixa_id && typeof mostrarSimulacaoOrcamento === 'function') {
            // Passa o ID do tipo, a filial e os itens (que agora têm produtos)
            mostrarSimulacaoOrcamento(sol.tipo_baixa_id, sol.filial_id, itens);
        }
    } catch (error) { content.innerHTML = `<div class="alert alert-error">Erro: ${error.message}</div>`; orcamentoSection.style.display = 'none'; }
}

// SUBSTITUA A FUNÇÃO ANTIGA
async function abrirExecutarModal(id) { // id é solicitacao_id
    const modal = document.getElementById('executarModal');
    document.getElementById('executarId').textContent = id;
    document.getElementById('executarSolicitacaoId').value = id;
    document.getElementById('executarForm').reset();
    document.getElementById('executarAlert').innerHTML = '';

    // IDs dos novos campos
    const tipoBaixaIdInput = document.getElementById('executarTipoBaixaId');
    const intencaoBaixaSpan = document.getElementById('executarIntencaoBaixa');

    const listContainer = document.getElementById('executarItensList');
    listContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando itens...</div>';

    const cgoSelect = document.getElementById('codigoMovimentacao');
    cgoSelect.innerHTML = '<option value="">Selecione os itens primeiro...</option>';
    cgoSelect.disabled = true;

    intencaoBaixaSpan.textContent = 'Carregando...';
    tipoBaixaIdInput.value = '';

    modal.style.display = 'flex';

    try {
        // 1. Busca o Tipo de Baixa da Solicitação
        const solResponse = await supabaseRequest(
            `solicitacoes_baixa?id=eq.${id}&select=tipo_baixa_id,tipos_baixa(nome,descricao)`
        );
        if (!solResponse || !solResponse[0] || !solResponse[0].tipo_baixa_id) {
            throw new Error('Não foi possível encontrar a intenção (Tipo de Baixa) desta solicitação.');
        }

        const tipoBaixa = solResponse[0].tipos_baixa;
        const tipoBaixaId = solResponse[0].tipo_baixa_id;

        // 2. Preenche os campos no modal
        tipoBaixaIdInput.value = tipoBaixaId;
        intencaoBaixaSpan.textContent = `${tipoBaixa.nome} ${tipoBaixa.descricao ? `(${tipoBaixa.descricao})` : ''}`;

        // 3. Busca os itens aprovados (lógica antiga mantida)
        const response = await supabaseRequest(
            `solicitacao_itens?solicitacao_id=eq.${id}&status=eq.aprovada&select=*,produtos(codigo,descricao,cgos_permitidos)&order=id.asc`
        );

        if (!response || response.length === 0) {
            listContainer.innerHTML = '<div class="text-center py-4 text-gray-500">Nenhum item aprovado aguardando execução para este pedido.</div>';
            return;
        }

        // Renderiza a lista de itens (lógica antiga mantida)
        listContainer.innerHTML = response.map(item => {
            const produto = item.produtos;
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
        intencaoBaixaSpan.textContent = 'Erro!';
    }
}

// SUBSTITUA A FUNÇÃO ANTIGA
async function atualizarCgosPermitidos() {
    const cgoSelect = document.getElementById('codigoMovimentacao');
    const checkedItems = document.querySelectorAll('input[name="executar_item_ids"]:checked');

    // 1. Pega o TIPO DE BAIXA ID da solicitação (armazenado no input oculto)
    const tipoBaixaId = document.getElementById('executarTipoBaixaId').value;

    if (checkedItems.length === 0) {
        cgoSelect.innerHTML = '<option value="">Selecione os itens primeiro...</option>';
        cgoSelect.disabled = true;
        return;
    }
    if (!tipoBaixaId) {
         cgoSelect.innerHTML = '<option value="">Erro: Tipo de Baixa não definido.</option>';
         cgoSelect.disabled = true;
         return;
    }

    let cgosComunsDosProdutos = null;

    // 2. Encontra a INTERSEÇÃO de CGOs permitidos pelos PRODUTOS (lógica antiga)
    for (const item of checkedItems) {
        const cgosDoItem = JSON.parse(item.dataset.cgos); // ex: ["475", "480", "750"]

        if (cgosComunsDosProdutos === null) {
            cgosComunsDosProdutos = new Set(cgosDoItem);
        } else {
            cgosComunsDosProdutos = new Set(
                [...cgosComunsDosProdutos].filter(cgo => cgosDoItem.includes(cgo))
            );
        }
    }
    // Agora cgosComunsDosProdutos = Set {"750", "499"}

    // 3. Encontra os CGOs permitidos pelo TIPO DE BAIXA
    const allCgos = await getAllCgoCache(false);
    const cgosDoTipo = allCgos
        .filter(c => c.tipo_baixa_id == tipoBaixaId)
        .map(c => c.codigo_cgo); // Array ["750", "753"]

    // 4. Filtra a lista de CGOs dos produtos (passo 2) contra a lista do Tipo de Baixa (passo 3)
    const cgosFinaisPermitidos = [...cgosComunsDosProdutos].filter(cgo => cgosDoTipo.includes(cgo));
    // Ex: {"750", "499"} filtrado por ["750", "753"] = ["750"]

    // 5. Busca os detalhes desses CGOs no cache para exibir
    const cgosDoCache = await getCgoCache(); // Pega CGOs ativos
    const cgosFiltradosParaDropdown = cgosDoCache.filter(cgo => cgosFinaisPermitidos.includes(cgo.codigo_cgo));

    if (cgosFiltradosParaDropdown.length === 0) {
        cgoSelect.innerHTML = '<option value="">Nenhum CGO em comum para (Itens + Tipo de Baixa).</option>';
        cgoSelect.disabled = true;
    } else {
        cgoSelect.innerHTML = '<option value="">-- Selecione um CGO --</option>';
        cgosFiltradosParaDropdown.forEach(cgo => {
            cgoSelect.innerHTML += `<option value="${cgo.codigo_cgo}">${cgo.codigo_cgo} - ${cgo.descricao_cgo}</option>`;
        });
        cgoSelect.disabled = false;
    }
}
 
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
            // ATENÇÃO: A lógica original só salvava uma foto. Mantenho a correção feita mais abaixo para suportar array de URLs.
            // foto_retirada_url: fotoUrl 
            fotos_retirada_urls: [fotoUrl] // Garante que seja um array para consistência
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


async function supabaseRequest(method, endpoint, body = null) {
    // 1. Obter o token JWT do armazenamento local
    const authToken = localStorage.getItem('auth_token');
    if (!authToken) {
        // Se não tiver token, força o logout para segurança
        logout(); 
        throw new Error("Sessão expirada. Faça login novamente.");
    }
    
    // 2. Montar a requisição para o Proxy
    const url = `/api/proxy?endpoint=${endpoint}`;
    
    const config = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            // 3. INJETAR O TOKEN NO CABEÇALHO 'Authorization'
            'Authorization': `Bearer ${authToken}` 
        }
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.body = JSON.stringify(body);
    }

    const response = await fetch(url, config);
    
    if (!response.ok) {
        // Se 401 ou 403, pode ser token inválido/expirado
        if (response.status === 401 || response.status === 403) {
             logout(); 
        }
        const errorText = await response.text();
        throw new Error(`Erro na requisição Supabase: ${errorText}`);
    }
    
    return response.json();
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
/**
 * NOVO Helper: Cache de TODOS os Tipos de Baixa (para admin)
 */
async function getAllTiposBaixaCache(forceRefresh = false) {
    if (typeof todasTiposBaixaCache === 'undefined' || todasTiposBaixaCache.length === 0 || forceRefresh) {
        todasTiposBaixaCache = await supabaseRequest('tipos_baixa?select=id,nome,descricao,ativo&order=nome.asc') || [];
    }
    return todasTiposBaixaCache;
}

async function getFiliaisCache(forceRefresh = false) { if (typeof todasFiliaisCache === 'undefined' || todasFiliaisCache.length === 0 || forceRefresh) { todasFiliaisCache = await supabaseRequest('filiais?select=id,nome,descricao&order=nome.asc') || []; } return todasFiliaisCache; }
async function getCgoCache(forceRefresh = false) {
    // CORREÇÃO: Garante que a variável exista antes de acessar .length
    if (typeof cgoCache === 'undefined' || cgoCache.length === 0 || forceRefresh) {
        console.log(">>> getCgoCache: Buscando CGOs do Supabase..."); // Log 7
        cgoCache = await supabaseRequest('cgo?ativo=eq.true&select=id,codigo_cgo,descricao_cgo,obs,linha_orcamentaria_id&order=codigo_cgo.asc') || []; // Garante que seja array
        console.log(">>> getCgoCache: Recebido do Supabase:", cgoCache); // Log 8
    } else {
        console.log(">>> getCgoCache: Usando cache."); // Log 9
    }
    return cgoCache;
}
// SUBSTITUA A FUNÇÃO ANTIGA (Linha ~782)
async function getAllCgoCache(forceRefresh = false) { 
    if (typeof todosCgoCache === 'undefined' || todosCgoCache.length === 0 || forceRefresh) { 
        // ADICIONADO: tipo_baixa_id no select
        todosCgoCache = await supabaseRequest('cgo?select=id,codigo_cgo,descricao_cgo,obs,ativo,linha_orcamentaria_id,tipo_baixa_id&order=codigo_cgo.asc') || []; 
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

// =======================================================
// === NOVO: FUNÇÕES DE GERENCIAMENTO DE TIPOS DE BAIXA ===
// =======================================================

async function loadGerenciarTiposBaixa() {
    const tbody = document.getElementById('tiposBaixaTableBody');
    tbody.innerHTML = `<tr><td colspan="4" class="loading"><div class="spinner"></div>Carregando tipos...</td></tr>`;
    try {
        const tipos = await getAllTiposBaixaCache(true); // Força refresh
        renderTiposBaixaTable(tbody, tipos || []);
    } catch (error) {
        console.error("Erro ao carregar Tipos de Baixa:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}

function renderTiposBaixaTable(tbody, tipos) {
    if (!tipos || tipos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Nenhum tipo encontrado.</td></tr>`; return;
    }
    tbody.innerHTML = tipos.map(t => {
        const statusClass = t.ativo ? 'text-green-600' : 'text-red-600';
        const statusText = t.ativo ? 'Ativo' : 'Inativo';
        const toggleButton = t.ativo
            ? `<button class="btn btn-warning btn-small ml-1" onclick="toggleTipoBaixaStatus(${t.id}, false)">Desativar</button>`
            : `<button class="btn btn-success btn-small ml-1" onclick="toggleTipoBaixaStatus(${t.id}, true)">Ativar</button>`;
        return `
            <tr class="text-sm">
                <td><strong>${t.nome}</strong></td> <td>${t.descricao || '-'}</td>
                <td><span class="font-semibold ${statusClass}">${statusText}</span></td>
                <td> <button class="btn btn-primary btn-small" onclick="abrirTipoBaixaModal(${t.id})">Editar</button> ${toggleButton} </td>
            </tr>`;
    }).join('');
}

async function abrirTipoBaixaModal(id = null) {
    const modal = document.getElementById('tipoBaixaModal');
    const form = document.getElementById('tipoBaixaForm');
    const alertContainer = document.getElementById('tipoBaixaAlert');
    const title = document.getElementById('tipoBaixaModalTitle');
    alertContainer.innerHTML = ''; form.reset(); document.getElementById('tipoBaixaId').value = id || '';

    if (id) {
        title.textContent = `Editar Tipo de Baixa #${id}`;
        try {
            const tipos = await getAllTiposBaixaCache();
            const tipo = tipos.find(t => t.id === id);
            if (!tipo) throw new Error("Tipo de Baixa não encontrado.");
            document.getElementById('tipoBaixaNome').value = tipo.nome;
            document.getElementById('tipoBaixaDescricao').value = tipo.descricao || '';
            document.getElementById('tipoBaixaAtivo').checked = tipo.ativo;
        } catch(error) { alertContainer.innerHTML = `<div class="alert alert-error">Erro: ${error.message}</div>`; return; }
    } else {
        title.textContent = 'Novo Tipo de Baixa';
        document.getElementById('tipoBaixaAtivo').checked = true;
    }
    modal.style.display = 'flex';
}

async function handleTipoBaixaFormSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('tipoBaixaAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando...</div>';
    const id = document.getElementById('tipoBaixaId').value;
    const nome = document.getElementById('tipoBaixaNome').value.trim();
    const descricao = document.getElementById('tipoBaixaDescricao').value.trim();
    const ativo = document.getElementById('tipoBaixaAtivo').checked;
    const isEdit = !!id;

    if (!nome) { alertContainer.innerHTML = '<div class="alert alert-error">O Nome é obrigatório.</div>'; return; }

    const tipoData = { nome, descricao: descricao || null, ativo };
    try {
        if (isEdit) {
            await supabaseRequest(`tipos_baixa?id=eq.${id}`, 'PATCH', tipoData);
        } else {
            await supabaseRequest('tipos_baixa', 'POST', tipoData);
        }
        tiposBaixaCache = []; todasTiposBaixaCache = []; // Limpa caches
        showNotification(`Tipo de Baixa ${isEdit ? 'atualizado' : 'criado'}!`, 'success');
        closeModal('tipoBaixaModal');
        loadGerenciarTiposBaixa();
    } catch (error) {
        console.error("Erro ao salvar Tipo de Baixa:", error);
        let errorMsg = error.message;
        if (errorMsg.includes('duplicate key value') && errorMsg.includes('tipos_baixa_nome_key')) { errorMsg = "Já existe um tipo com este nome."; }
        alertContainer.innerHTML = `<div class="alert alert-error">Erro: ${errorMsg}</div>`;
    }
}

async function toggleTipoBaixaStatus(id, newStatus) {
    const action = newStatus ? 'ativar' : 'desativar';
    if (!confirm(`Tem certeza que deseja ${action} o Tipo de Baixa #${id}?`)) return;
    try {
        await supabaseRequest(`tipos_baixa?id=eq.${id}`, 'PATCH', { ativo: newStatus });
        tiposBaixaCache = []; todasTiposBaixaCache = []; // Limpa caches
        showNotification(`Tipo de Baixa #${id} ${action}do!`, 'success');
        loadGerenciarTiposBaixa();
    } catch (error) {
        console.error(`Erro ao ${action} Tipo:`, error);
        showNotification(`Erro ao ${action} Tipo: ${error.message}`, 'error');
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

// SUBSTITUA A FUNÇÃO ANTIGA (Linha ~1011)
async function abrirCgoModal(id = null) {
    const modal = document.getElementById('cgoModal'); 
    const form = document.getElementById('cgoForm'); 
    const alertC = document.getElementById('cgoAlert'); 
    const title = document.getElementById('cgoModalTitle'); 
    const linhaSelect = document.getElementById('cgoLinhaOrcamentaria');
    const tipoBaixaSelect = document.getElementById('cgoTipoBaixaSelect');

    alertC.innerHTML = ''; 
    form.reset(); 
    document.getElementById('cgoId').value = id || '';
    
    linhaSelect.innerHTML = '<option value="">Carregando...</option>'; 
    linhaSelect.disabled = true;
    tipoBaixaSelect.innerHTML = '<option value="">Carregando...</option>';
    tipoBaixaSelect.disabled = true;

    try {
        // Carrega Linhas (Lógica antiga)
        if (typeof getLinhasOrcamentariasCache !== 'function') throw new Error("Função getLinhasOrcamentariasCache não definida.");
        const linhas = await getLinhasOrcamentariasCache(true);
        linhaSelect.innerHTML = '<option value="">Nenhuma</option>';
        if (linhas && linhas.length > 0) { linhas.forEach(l => { linhaSelect.innerHTML += `<option value="${l.id}">${l.codigo} - ${l.descricao}</option>`; }); }
        linhaSelect.disabled = false;

        // MUDANÇA: Carrega TODOS os Tipos de Baixa (ativos e inativos)
        if (typeof getAllTiposBaixaCache !== 'function') throw new Error("Função getAllTiposBaixaCache não definida.");
        const tipos = await getAllTiposBaixaCache(true); // <-- MUDANÇA DE getTiposBaixaCache PARA getAllTiposBaixaCache
        
        tipoBaixaSelect.innerHTML = '<option value="">Nenhum (Tipo Geral)</option>';
        if (tipos && tipos.length > 0) { 
            tipos.forEach(t => { 
                // Adiciona (Inativo) se não estiver ativo
                const statusLabel = t.ativo ? '' : ' (Inativo)';
                tipoBaixaSelect.innerHTML += `<option value="${t.id}">${t.nome}${statusLabel}</option>`; 
            }); 
        }
        tipoBaixaSelect.disabled = false;

    } catch (e) { 
        alertC.innerHTML = `<div class="alert alert-error">Erro Dep: ${e.message}</div>`; 
        return; 
    }

    if (id) {
        title.textContent = `Editar CGO #${id}`; document.getElementById('cgoCodigo').disabled = true;
        try {
            if (typeof getAllCgoCache !== 'function') throw new Error("Função getAllCgoCache não definida.");
            const cgos = await getAllCgoCache(); // Esta chamada agora trará o tipo_baixa_id (Fix 1)
            const cgo = cgos.find(c => c.id === id); if (!cgo) throw new Error("CGO não encontrado.");
            
            document.getElementById('cgoCodigo').value = cgo.codigo_cgo; 
            document.getElementById('cgoDescricao').value = cgo.descricao_cgo; 
            document.getElementById('cgoObs').value = cgo.obs || ''; 
            document.getElementById('cgoAtivo').checked = cgo.ativo; 
            linhaSelect.value = cgo.linha_orcamentaria_id || '';
            
            // Esta linha agora vai funcionar
            tipoBaixaSelect.value = cgo.tipo_baixa_id || ''; 
            
        } catch(error) { 
            alertC.innerHTML = `<div class="alert alert-error">Erro: ${error.message}</div>`; 
            return; 
        }
    } else { 
        title.textContent = 'Novo CGO'; 
        document.getElementById('cgoCodigo').disabled = false; 
        document.getElementById('cgoAtivo').checked = true; 
    }
    modal.style.display = 'flex';
}

// SUBSTITUA A FUNÇÃO 'handleCgoFormSubmit' PELA ESTA:
async function handleCgoFormSubmit(event) {
    event.preventDefault(); 
    const alertC = document.getElementById('cgoAlert'); 
    alertC.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando...</div>'; 
    const id = document.getElementById('cgoId').value; 
    const codigo_cgo = document.getElementById('cgoCodigo').value.trim(); 
    const desc = document.getElementById('cgoDescricao').value.trim(); 
    const obs = document.getElementById('cgoObs').value.trim(); 
    const ativo = document.getElementById('cgoAtivo').checked; 
    const linha_id = document.getElementById('cgoLinhaOrcamentaria').value ? parseInt(document.getElementById('cgoLinhaOrcamentaria').value) : null;
    
    // LINHA FALTANTE: Pega o valor do Tipo de Baixa
    const tipo_baixa_id = document.getElementById('cgoTipoBaixaSelect').value ? parseInt(document.getElementById('cgoTipoBaixaSelect').value) : null;
    
    const isEdit = !!id;
    
    if (!codigo_cgo || !desc) { 
        alertC.innerHTML = '<div class="alert alert-error">Código e Descrição obrigatórios.</div>'; 
        return; 
    }
    
    const cgoData = { 
        codigo_cgo, 
        descricao_cgo: desc, 
        obs: obs || null, 
        ativo, 
        linha_orcamentaria_id: linha_id,
        tipo_baixa_id: tipo_baixa_id // CAMPO FALTANTE: Adiciona ao payload
    };
    
    try {
        if (isEdit) { 
            delete cgoData.codigo_cgo; 
            await supabaseRequest(`cgo?id=eq.${id}`, 'PATCH', cgoData); 
        } else { 
            await supabaseRequest('cgo', 'POST', cgoData); 
        }
        
        cgoCache = []; todosCgoCache = []; // Limpa caches
        showNotification(`CGO ${isEdit ? 'atualizado' : 'criado'}!`, 'success'); 
        closeModal('cgoModal');
        
        if (typeof loadGerenciarCgo === 'function') loadGerenciarCgo();
    } catch (error) { 
        let msg = error.message; 
        if (msg.includes('duplicate key') && msg.includes('cgo_codigo_cgo_key')) { msg = "Código já existe."; } 
        alertC.innerHTML = `<div class="alert alert-error">Erro: ${msg}</div>`; 
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

// =======================================================
// === NOVO: FUNÇÕES DE GERENCIAMENTO DE LINHAS ORÇAMENTÁRIAS ===
// =======================================================

/**
 * NOVO Helper: Cache de Linhas Orçamentárias Ativas
 */
async function getLinhasOrcamentariasCache(forceRefresh = false) { if (typeof linhasOrcamentariasCache === 'undefined' || linhasOrcamentariasCache.length === 0 || forceRefresh) { linhasOrcamentariasCache = await supabaseRequest('linhas_orcamentarias?ativo=eq.true&select=id,codigo,descricao&order=codigo.asc') || []; } return linhasOrcamentariasCache; }

/**
 * NOVO Helper: Cache de TODAS as Linhas Orçamentárias (para admin)
 */
async function getAllLinhasOrcamentariasCache(forceRefresh = false) {
    // CORREÇÃO: Verifica se a variável existe antes de acessar .length
    if (typeof todasLinhasOrcamentariasCache === 'undefined' || todasLinhasOrcamentariasCache.length === 0 || forceRefresh) {
        todasLinhasOrcamentariasCache = await supabaseRequest('linhas_orcamentarias?select=id,codigo,descricao,ativo&order=codigo.asc') || []; // Garante que seja array
    }
    return todasLinhasOrcamentariasCache;
}

/**
 * NOVO: Carrega a lista de Linhas Orçamentárias para a view de admin.
 */
async function loadGerenciarLinhas() {
    const tbody = document.getElementById('linhasTableBody');
    tbody.innerHTML = `<tr><td colspan="4" class="loading"><div class="spinner"></div>Carregando linhas...</td></tr>`;
    try {
        const linhas = await getAllLinhasOrcamentariasCache(true); // Força refresh
        renderLinhasTable(tbody, linhas || []);
    } catch (error) {
        console.error("Erro ao carregar Linhas Orçamentárias:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}

/**
 * NOVO: Renderiza a tabela de Linhas Orçamentárias na view de admin.
 */
function renderLinhasTable(tbody, linhas) {
    if (!linhas || linhas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Nenhuma linha encontrada.</td></tr>`; return;
    }
    tbody.innerHTML = linhas.map(l => {
        const statusClass = l.ativo ? 'text-green-600' : 'text-red-600';
        const statusText = l.ativo ? 'Ativa' : 'Inativa';
        const toggleButton = l.ativo
            ? `<button class="btn btn-warning btn-small ml-1" onclick="toggleLinhaStatus(${l.id}, false)">Desativar</button>`
            : `<button class="btn btn-success btn-small ml-1" onclick="toggleLinhaStatus(${l.id}, true)">Ativar</button>`;
        return `
            <tr class="text-sm">
                <td><strong>${l.codigo}</strong></td> <td>${l.descricao}</td>
                <td><span class="font-semibold ${statusClass}">${statusText}</span></td>
                <td> <button class="btn btn-primary btn-small" onclick="abrirLinhaModal(${l.id})">Editar</button> ${toggleButton} </td>
            </tr>`;
    }).join('');
}

/**
 * NOVO: Abre o modal para criar (id=null) ou editar (id=valor) uma Linha Orçamentária.
 */
async function abrirLinhaModal(id = null) {
    const modal = document.getElementById('linhaModal');
    const form = document.getElementById('linhaForm');
    const alertContainer = document.getElementById('linhaAlert');
    const title = document.getElementById('linhaModalTitle');
    alertContainer.innerHTML = ''; form.reset(); document.getElementById('linhaId').value = id || '';

    if (id) {
        title.textContent = `Editar Linha #${id}`;
        document.getElementById('linhaCodigo').disabled = true;
        try {
            const linhas = await getAllLinhasOrcamentariasCache();
            const linha = linhas.find(l => l.id === id);
            if (!linha) throw new Error("Linha não encontrada.");
            document.getElementById('linhaCodigo').value = linha.codigo;
            document.getElementById('linhaDescricao').value = linha.descricao;
            document.getElementById('linhaAtivo').checked = linha.ativo;
        } catch(error) { alertContainer.innerHTML = `<div class="alert alert-error">Erro: ${error.message}</div>`; return; }
    } else {
        title.textContent = 'Nova Linha Orçamentária';
        document.getElementById('linhaCodigo').disabled = false;
        document.getElementById('linhaAtivo').checked = true;
    }
    modal.style.display = 'flex';
}

/**
 * NOVO: Trata a submissão do formulário de criação/edição de Linha Orçamentária.
 */
async function handleLinhaFormSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('linhaAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando...</div>';
    const id = document.getElementById('linhaId').value;
    const codigo = document.getElementById('linhaCodigo').value.trim();
    const descricao = document.getElementById('linhaDescricao').value.trim();
    const ativo = document.getElementById('linhaAtivo').checked;
    const isEdit = !!id;

    if (!codigo || !descricao) { alertContainer.innerHTML = '<div class="alert alert-error">Código e Descrição são obrigatórios.</div>'; return; }

    const linhaData = { codigo, descricao, ativo };
    try {
        if (isEdit) {
            delete linhaData.codigo;
            await supabaseRequest(`linhas_orcamentarias?id=eq.${id}`, 'PATCH', linhaData);
        } else {
            await supabaseRequest('linhas_orcamentarias', 'POST', linhaData);
        }
        linhasOrcamentariasCache = []; todasLinhasOrcamentariasCache = []; // Limpa caches
        showNotification(`Linha ${isEdit ? 'atualizada' : 'criada'}!`, 'success');
        closeModal('linhaModal');
        loadGerenciarLinhas();
    } catch (error) {
        console.error("Erro ao salvar Linha:", error);
        let errorMsg = error.message;
        if (errorMsg.includes('duplicate key value') && errorMsg.includes('linhas_orcamentarias_codigo_key')) { errorMsg = "Já existe uma linha com este código."; }
        alertContainer.innerHTML = `<div class="alert alert-error">Erro: ${errorMsg}</div>`;
    }
}

/**
 * NOVO: Ativa ou desativa uma Linha Orçamentária.
 */
async function toggleLinhaStatus(id, newStatus) {
    const action = newStatus ? 'ativar' : 'desativar';
    if (!confirm(`Tem certeza que deseja ${action} a Linha #${id}?`)) return;
    try {
        await supabaseRequest(`linhas_orcamentarias?id=eq.${id}`, 'PATCH', { ativo: newStatus });
        linhasOrcamentariasCache = []; todasLinhasOrcamentariasCache = []; // Limpa caches
        showNotification(`Linha #${id} ${action}da!`, 'success');
        loadGerenciarLinhas();
    } catch (error) {
        console.error(`Erro ao ${action} Linha:`, error);
        showNotification(`Erro ao ${action} Linha: ${error.message}`, 'error');
     }
}


// =======================================================
// === NOVO: FUNÇÕES DE GERENCIAMENTO DE ORÇAMENTOS ===
// =======================================================

/**
 * NOVO: Prepara a view 'gerenciarOrcamentosView' carregando filtros
 */
async function prepararGerenciarOrcamentos() {
    const filialSelect = document.getElementById('orcamentoFilialSelect');
    const anoSelect = document.getElementById('orcamentoAnoSelect');
    const tbody = document.getElementById('orcamentosTableBody');

    // Reseta a tabela
    tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4 text-gray-500">Selecione uma filial e um ano para começar.</td></tr>`;

    // Carrega filiais
    filialSelect.innerHTML = '<option value="">Carregando filiais...</option>';
    try {
        const filiais = await getFiliaisCache(true); // Força refresh
        filialSelect.innerHTML = '<option value="">-- Selecione uma Filial --</option>';
        filiais.forEach(f => { filialSelect.innerHTML += `<option value="${f.id}">${f.nome} - ${f.descricao}</option>`; });
    } catch (e) { filialSelect.innerHTML = '<option value="">Erro ao carregar</option>'; }

    // Popula anos (ex: 2024, 2025, 2026)
    const anoAtual = new Date().getFullYear();
    anoSelect.innerHTML = '';
    for (let i = anoAtual - 1; i <= anoAtual + 1; i++) {
        anoSelect.innerHTML += `<option value="${i}" ${i === anoAtual ? 'selected' : ''}>${i}</option>`;
    }
}

/**
 * NOVO: Carrega a "planilha" de orçamentos para a filial/ano selecionados
 */
async function loadGerenciarOrcamentos() {
    const filialId = document.getElementById('orcamentoFilialSelect').value;
    const ano = document.getElementById('orcamentoAnoSelect').value;
    const tbody = document.getElementById('orcamentosTableBody');
    const alertContainer = document.getElementById('orcamentosAlert');
    alertContainer.innerHTML = '';

    if (!filialId || !ano) {
        alertContainer.innerHTML = '<div class="alert alert-error">Selecione a Filial e o Ano.</div>'; return;
    }

    tbody.innerHTML = `<tr><td colspan="14" class="loading"><div class="spinner"></div>Carregando orçamentos...</td></tr>`;

    try {
        // 1. Busca todas as Linhas Orçamentárias ATIVAS
        const linhas = await getLinhasOrcamentariasCache(true);

        // 2. Busca os Orçamentos existentes para esta filial/ano
        const orcamentosExistentes = await supabaseRequest(
            `orcamentos_mensais?filial_id=eq.${filialId}&ano=eq.${ano}&select=linha_id,mes_1,mes_2,mes_3,mes_4,mes_5,mes_6,mes_7,mes_8,mes_9,mes_10,mes_11,mes_12`
        );
        // Cria um mapa para acesso rápido: { linhaId: { mes_1: valor, ... } }
        const orcamentoMap = new Map(orcamentosExistentes.map(o => [o.linha_id, o]));

        // 3. Renderiza a tabela
        renderOrcamentosTable(tbody, linhas, orcamentoMap, filialId, ano);

    } catch (error) {
        console.error("Erro ao carregar Orçamentos:", error);
        tbody.innerHTML = `<tr><td colspan="14" class="alert alert-error">Erro ao carregar: ${error.message}</td></tr>`;
    }
}

/**
 * NOVO: Renderiza a tabela de orçamentos, permitindo edição
 */
function renderOrcamentosTable(tbody, linhas, orcamentoMap, filialId, ano) {
    if (!linhas || linhas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4 text-gray-500">Nenhuma Linha Orçamentária ativa encontrada.</td></tr>`; return;
    }

    tbody.innerHTML = linhas.map(linha => {
        const orcamentoLinha = orcamentoMap.get(linha.id) || {}; // Pega o orçamento da linha ou um objeto vazio
        let inputsMeses = '';
        for (let mes = 1; mes <= 12; mes++) {
            const valor = orcamentoLinha[`mes_${mes}`] || 0;
            inputsMeses += `
                <td class="p-1">
                    <input type="number" step="0.01" min="0"
                           class="w-24 text-right orcamento-input p-1 border rounded"
                           data-linha-id="${linha.id}"
                           data-mes="${mes}"
                           value="${valor.toFixed(2)}">
                </td>`;
        }

        // Adiciona data-linha-id ao botão Salvar para delegation
        return `
            <tr class="text-sm hover:bg-gray-50">
                <td class="font-semibold p-2">${linha.codigo} - ${linha.descricao}</td>
                ${inputsMeses}
                <td class="p-1">
                    <button class="btn btn-success btn-small" data-linha-id="${linha.id}">
                        Salvar
                    </button>
                </td>
            </tr>`;
    }).join('');
}


/**
 * NOVO: Salva (UPSERT) o orçamento de uma linha/filial/ano
 */
async function salvarOrcamento(linhaId, filialId, ano, tableRow) {
    const inputs = tableRow.querySelectorAll('.orcamento-input');
    const alertContainer = document.getElementById('orcamentosAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando...</div>';

    const orcamentoData = {
        linha_id: parseInt(linhaId), // Garante que seja número
        filial_id: parseInt(filialId), // Garante que seja número
        ano: parseInt(ano), // Garante que seja número
    };

    let hasError = false;
    inputs.forEach(input => {
        const mes = input.dataset.mes;
        const valor = parseFloat(input.value);
        if (isNaN(valor) || valor < 0) {
            input.classList.add('input-error'); // Destaca erro
            hasError = true;
        } else {
            input.classList.remove('input-error');
            orcamentoData[`mes_${mes}`] = valor.toFixed(2); // Garante 2 casas decimais
        }
    });

    if (hasError) {
        alertContainer.innerHTML = '<div class="alert alert-error">Valores inválidos encontrados. Corrija os campos em vermelho.</div>';
        return;
    }

    try {
        // Usa UPSERT via POST com header 'Prefer' e parâmetro 'on_conflict'
        await supabaseRequest(
            `orcamentos_mensais?on_conflict=linha_id,filial_id,ano`,
            'POST',
            orcamentoData,
            { 'Prefer': 'resolution=merge-duplicates' } // Header essencial para UPSERT
        );
        alertContainer.innerHTML = ''; // Limpa alerta em caso de sucesso
        showNotification(`Orçamento para Linha ID ${linhaId} salvo!`, 'success', 1500);
    } catch (error) {
        console.error("Erro ao salvar orçamento:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar: ${error.message}</div>`;
    }
}

// SUBSTITUA A FUNÇÃO ANTIGA
async function mostrarSimulacaoOrcamento(tipoBaixaId, filialId, itensSolicitados) {
    const orcamentoSection = document.getElementById('detalhesOrcamentoSection');
    orcamentoSection.innerHTML = '<div class="loading"><div class="spinner"></div>Simulando orçamento...</div>';
    orcamentoSection.style.display = 'block';

    try {
        // 1. Encontrar CGOs e Linhas vinculados a este Tipo de Baixa
        const allCgos = await getAllCgoCache(false);
        const cgosDoTipo = allCgos.filter(c => c.tipo_baixa_id == tipoBaixaId);

        if (cgosDoTipo.length === 0) {
            orcamentoSection.innerHTML = '<p class="text-gray-600">Este Tipo de Baixa não tem CGOs associados.</p>';
            return;
        }

        // 2. Mapear o impacto de CADA ITEM para sua(s) linha(s) orçamentária(s)
        // (Esta é a lógica de "rateio" que você pediu)
        const impactoPorLinha = new Map(); // Key: linhaId, Value: { total: 0, itens: [] }
        let itensIndefinidos = []; // Itens que não puderam ser mapeados
        let valorIndefinido = 0;

        // Usaremos um cache de produtos para não buscar no loop
        const produtoInfoCache = new Map();

        for (const item of itensSolicitados) {
            let produto;
            if (produtoInfoCache.has(item.produto_id)) {
                produto = produtoInfoCache.get(item.produto_id);
            } else {
                const prodRes = await supabaseRequest(`produtos?id=eq.${item.produto_id}&select=cgos_permitidos`);
                produto = (prodRes && prodRes[0]) ? prodRes[0] : { cgos_permitidos: [] };
                produtoInfoCache.set(item.produto_id, produto);
            }

            const cgosPermitidosDoProduto = produto.cgos_permitidos || [];

            // Encontra CGOs válidos (Interseção de CGOs do Produto E CGOs do Tipo de Baixa)
            const cgosValidosParaItem = cgosDoTipo.filter(cgo => 
                cgosPermitidosDoProduto.includes(cgo.codigo_cgo) && cgo.linha_orcamentaria_id
            );

            // Encontra as linhas orçamentárias únicas para esses CGOs válidos
            const linhasValidas = [...new Set(cgosValidosParaItem.map(c => c.linha_orcamentaria_id))];

            if (linhasValidas.length === 1) {
                // Cenário ideal: O item só pode ir para UMA linha orçamentária
                const linhaId = linhasValidas[0];
                const data = impactoPorLinha.get(linhaId) || { total: 0, itens: [] };
                data.total += item.valor_total_solicitado;
                data.itens.push(item.produtos.codigo); // item.produtos já foi buscado no modal
                impactoPorLinha.set(linhaId, data);
            } else {
                // Cenário ambíguo (0 ou múltiplas linhas)
                // O custo não pode ser alocado com certeza
                itensIndefinidos.push(item.produtos.codigo);
                valorIndefinido += item.valor_total_solicitado;
            }
        }

        // 3. Buscar Orçado e Realizado para cada linha afetada
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth() + 1; // 1-12
        let htmlResult = `<h5 class="font-semibold text-blue-800 mb-2">Simulação Orçamentária (Mês ${mesAtual}/${anoAtual})</h5>`;

        if (impactoPorLinha.size === 0 && valorIndefinido === 0) {
             htmlResult += '<p>Nenhum item desta solicitação impacta o orçamento (CGOs não vinculados a linhas).</p>';
             orcamentoSection.innerHTML = htmlResult;
             return;
        }

        const todasLinhas = await getAllLinhasOrcamentariasCache(false);

        for (const [linhaId, impactoData] of impactoPorLinha.entries()) {
            const linhaInfo = todasLinhas.find(l => l.id == linhaId) || { codigo: '?', descricao: `Linha ID ${linhaId}` };

            // Busca o Orçado
            const orcamento = await supabaseRequest(
                `orcamentos_mensais?filial_id=eq.${filialId}&linha_id=eq.${linhaId}&ano=eq.${anoAtual}&select=mes_${mesAtual}`
            );
            const orcadoMes = (orcamento && orcamento[0]) ? parseFloat(orcamento[0][`mes_${mesAtual}`]) || 0 : 0;

            // Calcula o Realizado
            const realizadoMes = await calcularRealizadoLinha(linhaId, filialId, anoAtual, mesAtual);

            // Calcula Saldos
            const saldoAtual = orcadoMes - realizadoMes;
            const saldoPosAprovacao = saldoAtual - impactoData.total;

            htmlResult += `
                <div class="border-t pt-3 mt-3">
                    <p><strong>Linha:</strong> ${linhaInfo.codigo} - ${linhaInfo.descricao}</p>
                    <p><strong>Orçado Mês:</strong> R$ ${orcadoMes.toFixed(2)}</p>
                    <p><strong>Realizado Mês:</strong> R$ ${realizadoMes.toFixed(2)}</p>
                    <p class="font-bold text-blue-700"><strong>Saldo Atual:</strong> R$ ${saldoAtual.toFixed(2)}</p>
                    <p><strong>Impacto (Itens ${impactoData.itens.join(', ')}):</strong> - R$ ${impactoData.total.toFixed(2)}</p>
                    <p class="font-bold ${saldoPosAprovacao < 0 ? 'text-red-600' : 'text-green-600'}">
                        <strong>Saldo Pós-Aprovação:</strong> R$ ${saldoPosAprovacao.toFixed(2)}
                        ${saldoPosAprovacao < 0 ? ' (Orçamento Estourado!)' : ''}
                    </p>
                </div>
            `;
        }

        if (valorIndefinido > 0) {
             htmlResult += `
                <div class="border-t pt-3 mt-3">
                    <p class="font-bold text-yellow-700">Aviso de Custo Indefinido</p>
                    <p>Um valor de <strong>R$ ${valorIndefinido.toFixed(2)}</strong> (itens: ${itensIndefinidos.join(', ')}) não pôde ser alocado a uma linha específica devido a ambiguidades (produto permitido em CGOs de linhas diferentes) e não está na simulação acima.</p>
                </div>
            `;
        }

        orcamentoSection.innerHTML = htmlResult;

    } catch (error) {
        console.error("Erro ao simular orçamento:", error);
        orcamentoSection.innerHTML = `<p class="text-red-600">Erro ao simular orçamento: ${error.message}</p>`;
    }
}

// SUBSTITUA A FUNÇÃO 'calcularRealizadoLinha' (Linha ~1458)
async function calcularRealizadoLinha(linhaId, filialId, ano, mes) {
    // Formata as datas de início e fim do mês
    const inicioMes = new Date(ano, mes - 1, 1).toISOString();
    const fimMes = new Date(ano, mes, 0, 23, 59, 59, 999).toISOString(); // Último dia do mês

    let realizadoBaixas = 0;
    let realizadoDespesas = 0;
    let realizadoManual = 0; // NOVO

    // --- PARTE 1: Calcula o realizado das BAIXAS (lógica antiga) ---
    const cgos = await getAllCgoCache();
    const cgosDaLinha = cgos.filter(c => c.linha_orcamentaria_id === linhaId).map(c => c.codigo_cgo);

    if (cgosDaLinha.length > 0) {
        const responseBaixas = await supabaseRequest(
            `solicitacao_itens?select=valor_total_executado,solicitacoes_baixa!inner(filial_id)&solicitacoes_baixa.filial_id=eq.${filialId}&data_execucao=gte.${inicioMes}&data_execucao=lte.${fimMes}&codigo_movimentacao=in.(${cgosDaLinha.join(',')})&status=in.(aguardando_retirada,finalizada)`
        );
        realizadoBaixas = (responseBaixas || []).reduce((sum, item) => sum + (item.valor_total_executado || 0), 0);
    }

    // --- PARTE 2: Calcula o realizado das DESPESAS EXTERNAS (lógica nova) ---
    const responseDespesas = await supabaseRequest(
        `despesas_externas?filial_id=eq.${filialId}&linha_orcamentaria_id=eq.${linhaId}&data_nf=gte.${inicioMes}&data_nf=lte.${fimMes}&select=valor_total_nf`
    );
    realizadoDespesas = (responseDespesas || []).reduce((sum, item) => sum + (item.valor_total_nf || 0), 0);
    
    // --- PARTE 3: Busca o realizado manual (NOVO) ---
    const responseManual = await supabaseRequest(
        `realizado_manual_historico?filial_id=eq.${filialId}&linha_orcamentaria_id=eq.${linhaId}&ano=eq.${ano}&mes=eq.${mes}&select=valor_realizado`
    );
    realizadoManual = (responseManual && responseManual[0]) ? parseFloat(responseManual[0].valor_realizado) : 0; // Usa parseFloat

    // LÓGICA DE PRIORIDADE: Se houver valor manual, ele SOBREPÕE o valor calculado.
    // Presumimos que o valor manual é o "real" para o período histórico.
    let realizadoTotal = 0;
    
    // Se for o mês/ano atual, ou se o valor manual for 0, usa o calculado.
    // Se for um mês/ano passado E tiver valor manual, usa o manual.
    const hoje = new Date();
    const dataAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const dataBusca = new Date(ano, mes - 1, 1);
    
    if (dataBusca < dataAtual && realizadoManual > 0) {
        realizadoTotal = realizadoManual;
        console.log(`Realizado Linha ${linhaId} (Mês ${mes}): USANDO VALOR MANUAL R$ ${realizadoManual}`);
    } else {
        realizadoTotal = realizadoBaixas + realizadoDespesas;
        console.log(`Realizado Linha ${linhaId} (Mês ${mes}): Baixas R$ ${realizadoBaixas} + Despesas NF R$ ${realizadoDespesas} = R$ ${realizadoTotal}`);
    }
    
    return realizadoTotal;
}


function handleTipoBaixaChange() {
    const tipoBaixaId = document.getElementById('tipoBaixaSelect').value; // RENOMEADO
    const passo2Div = document.getElementById('solicitacaoPasso2');

    if (typeof limparCarrinho === 'function') {
        limparCarrinho(); // Reseta itens se trocar o Tipo
    } else {
        console.error("Função limparCarrinho não definida!");
    }

    if (tipoBaixaId && passo2Div) {
        passo2Div.style.display = 'block'; 
        const produtoCodigoInput = document.getElementById('produtoCodigo');
        if (produtoCodigoInput) produtoCodigoInput.focus();
    } else if (passo2Div) {
        passo2Div.style.display = 'none'; 
    }
}

async function iniciarNovaSolicitacao() {
    console.log(">>> iniciarNovaSolicitacao chamada!"); 
    limparCarrinho();
    const tipoBaixaSelect = document.getElementById('tipoBaixaSelect'); // RENOMEADO
    const passo2Div = document.getElementById('solicitacaoPasso2');
    const alertContainer = document.getElementById('tipoBaixaAlert'); // RENOMEADO

    alertContainer.innerHTML = '';
    passo2Div.style.display = 'none';
    tipoBaixaSelect.disabled = true;
    tipoBaixaSelect.innerHTML = '<option value="">Carregando tipos de baixa...</option>';

    try {
        console.log(">>> Tentando chamar getTiposBaixaCache..."); 
        const tipos = await getTiposBaixaCache(true); // NOVO: Busca tipos de baixa
        console.log(">>> getTiposBaixaCache retornou:", tipos); 

        if (tipos && tipos.length > 0) { 
            tipoBaixaSelect.innerHTML = '<option value="">-- Selecione o Tipo de Baixa --</option>';
            tipos.forEach(tipo => {
                // USA O ID DO TIPO, E MOSTRA NOME/DESCRIÇÃO
                tipoBaixaSelect.innerHTML += `<option value="${tipo.id}">${tipo.nome} ${tipo.descricao ? `(${tipo.descricao})` : ''}</option>`;
            });
            tipoBaixaSelect.disabled = false;
            console.log(">>> Dropdown de Tipos de Baixa populado."); 
        } else {
            tipoBaixaSelect.innerHTML = '<option value="">Nenhum Tipo de Baixa ativo</option>';
            alertContainer.innerHTML = '<div class="alert alert-error">Nenhum Tipo de Baixa ativo cadastrado. Contate o administrador.</div>';
            console.log(">>> Nenhum Tipo de Baixa encontrado."); 
        }
    } catch (error) {
        console.error(">>> Erro DENTRO de iniciarNovaSolicitacao ao carregar Tipos:", error); 
        tipoBaixaSelect.innerHTML = '<option value="">Erro ao carregar</option>';
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao carregar tipos de baixa: ${error.message}</div>`;
    }
}

async function getTiposBaixaCache(forceRefresh = false) {
    if (typeof tiposBaixaCache === 'undefined' || tiposBaixaCache.length === 0 || forceRefresh) {
        tiposBaixaCache = await supabaseRequest('tipos_baixa?ativo=eq.true&select=id,nome,descricao&order=nome.asc') || [];
    }
    return tiposBaixaCache;
}

// =======================================================
// === NOVO: FUNÇÕES DE LANÇAMENTOS FINANCEIROS (NF) ===
// =======================================================

/**
 * Carrega a view de Lançamentos Financeiros
 */
async function loadLancamentosFinanceiros() {
    const linhaSelect = document.getElementById('nfLinhaOrcamentariaSelect');
    linhaSelect.innerHTML = '<option value="">Carregando linhas...</option>';
    linhaSelect.disabled = true;

    // Limpa o formulário
    document.getElementById('lancamentoNfForm').reset();
    document.getElementById('addItemNfForm').reset();
    document.getElementById('nfSimulacaoOrcamento').style.display = 'none';
    document.getElementById('lancamentoNfAlert').innerHTML = '';
    document.getElementById('addItemNfAlert').innerHTML = '';
    carrinhoFinanceiro = [];
    renderCarrinhoFinanceiro();
    
    // 1. Carrega o dropdown de Linhas Orçamentárias
    try {
        const linhas = await getLinhasOrcamentariasCache(true);
        if (linhas && linhas.length > 0) {
            linhaSelect.innerHTML = '<option value="">-- Selecione uma Linha --</option>';
            linhas.forEach(l => {
                linhaSelect.innerHTML += `<option value="${l.id}">${l.codigo} - ${l.descricao}</option>`;
            });
            linhaSelect.disabled = false;
        } else {
            linhaSelect.innerHTML = '<option value="">Nenhuma linha cadastrada</option>';
        }
    } catch (e) {
        linhaSelect.innerHTML = '<option value="">Erro ao carregar linhas</option>';
    }
    
    // 2. Carrega o histórico de lançamentos
    const tbody = document.getElementById('lancamentosNfTableBody');
    tbody.innerHTML = `<tr><td colspan="8" class="loading"><div class="spinner"></div>Carregando...</td></tr>`;
    try {
        lancamentosCache = await supabaseRequest(
            `despesas_externas?filial_id=eq.${selectedFilial.id}&select=*,linhas_orcamentarias(codigo,descricao)&order=created_at.desc&limit=50`
        ) || [];
        renderLancamentosTable(tbody, lancamentosCache);
    } catch (error) {
        console.error("Erro ao carregar despesas:", error);
        tbody.innerHTML = `<tr><td colspan="8" class="alert alert-error">Erro: ${error.message}</td></tr>`;
    }
}

/**
 * Renderiza a tabela de histórico de NFs
 */
function renderLancamentosTable(tbody, despesas) {
    if (!despesas || despesas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-gray-500">Nenhum lançamento encontrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = despesas.map(d => {
        const dataLanc = new Date(d.created_at).toLocaleDateString('pt-BR');
        const dataNf = d.data_nf ? new Date(d.data_nf).toLocaleDateString('pt-BR') : 'N/A';
        const linhaDesc = d.linhas_orcamentarias ? `${d.linhas_orcamentarias.codigo} - ${d.linhas_orcamentarias.descricao}` : 'Linha não encontrada';
        
        const anexoLink = d.anexo_nf_url
            ? `<a href="${d.anexo_nf_url}" target="_blank" class="text-blue-600 hover:underline">${d.nome_anexo_nf || 'Ver Anexo'}</a>`
            : 'Nenhum';
            
        return `
            <tr class="text-sm">
                <td>${d.id}</td>
                <td>${dataLanc}</td>
                <td>${dataNf}</td>
                <td>${d.numero_nf}</td>
                <td>${linhaDesc}</td>
                <td class="text-right">R$ ${d.valor_total_nf.toFixed(2)}</td>
                <td>${anexoLink}</td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="abrirDetalhesDespesaModal(${d.id})">
                        <i data-feather="eye" class="h-4 w-4"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    if (typeof feather !== 'undefined') feather.replace();
}

/**
 * Adiciona um item ao carrinho financeiro
 */
function handleAddItemFinanceiro(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('addItemNfAlert');
    alertContainer.innerHTML = '';
    
    const descricao = document.getElementById('nfItemDescricao').value;
    const quantidade = parseFloat(document.getElementById('nfItemQtd').value);
    const valorUnitario = parseFloat(document.getElementById('nfItemValorUnit').value);
    
    if (!descricao || isNaN(quantidade) || quantidade <= 0 || isNaN(valorUnitario) || valorUnitario < 0) {
        alertContainer.innerHTML = '<div class="alert alert-error">Preencha todos os campos do item com valores válidos.</div>';
        return;
    }
    
    carrinhoFinanceiro.push({
        descricao_item: descricao,
        quantidade: quantidade,
        valor_unitario: valorUnitario,
        valor_total: quantidade * valorUnitario
    });
    
    renderCarrinhoFinanceiro();
    simularImpactoOrcamentoNF(); // Re-simula
    document.getElementById('addItemNfForm').reset();
    document.getElementById('nfItemDescricao').focus();
}

/**
 * Renderiza a tabela do carrinho financeiro
 */
function renderCarrinhoFinanceiro() {
    const tbody = document.getElementById('carrinhoNfItensBody');
    const totalSpan = document.getElementById('carrinhoNfValorTotal');
    const submitButton = document.getElementById('submitLancamentoNfButton');
    
    if (carrinhoFinanceiro.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum item adicionado.</td></tr>`;
        totalSpan.textContent = '0.00';
        submitButton.disabled = true;
        return;
    }

    let valorTotalNF = 0;
    tbody.innerHTML = carrinhoFinanceiro.map((item, index) => {
        valorTotalNF += item.valor_total;
        return `
            <tr class="text-sm">
                <td>${item.descricao_item}</td>
                <td class="text-center">${item.quantidade}</td>
                <td class="text-right">R$ ${item.valor_unitario.toFixed(2)}</td>
                <td class="text-right">R$ ${item.valor_total.toFixed(2)}</td>
                <td class="text-center">
                    <button type="button" class="btn btn-danger btn-small remover-nf-item" data-index="${index}">
                        <i data-feather="trash-2" class="h-4 w-4" style="pointer-events: none;"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    totalSpan.textContent = valorTotalNF.toFixed(2);
    submitButton.disabled = false;
    if (typeof feather !== 'undefined') feather.replace();
}

/**
 * Remove item do carrinho financeiro
 */
function removerItemFinanceiro(index) {
    carrinhoFinanceiro.splice(index, 1);
    renderCarrinhoFinanceiro();
    simularImpactoOrcamentoNF(); // Re-simula
}

/**
 * Mostra a simulação do orçamento ao selecionar a linha
 */
async function simularImpactoOrcamentoNF() {
    const linhaId = document.getElementById('nfLinhaOrcamentariaSelect').value;
    const simulacaoDiv = document.getElementById('nfSimulacaoOrcamento');
    const valorTotalNF = parseFloat(document.getElementById('carrinhoNfValorTotal').textContent) || 0;
    
    if (!linhaId) {
        simulacaoDiv.style.display = 'none';
        return;
    }
    
    simulacaoDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Simulando...</div>';
    simulacaoDiv.style.display = 'block';

    try {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth() + 1; // 1-12

        // 1. Busca Orçado
        const orcamento = await supabaseRequest(
            `orcamentos_mensais?filial_id=eq.${selectedFilial.id}&linha_id=eq.${linhaId}&ano=eq.${anoAtual}&select=mes_${mesAtual}`
        );
        const orcadoMes = (orcamento && orcamento[0]) ? parseFloat(orcamento[0][`mes_${mesAtual}`]) || 0 : 0;

        // 2. Calcula Realizado (agora com a função atualizada)
        const realizadoMes = await calcularRealizadoLinha(linhaId, selectedFilial.id, anoAtual, mesAtual);

        // 3. Calcula Saldos
        const saldoAtual = orcadoMes - realizadoMes;
        const saldoPosAprovacao = saldoAtual - valorTotalNF;
        
        const linhaInfo = (await getLinhasOrcamentariasCache()).find(l => l.id == linhaId);

        simulacaoDiv.innerHTML = `
            <h5 class="font-semibold text-blue-800 mb-2">Simulação (Mês ${mesAtual}/${anoAtual}) - Linha: ${linhaInfo.codigo}</h5>
            <p><strong>Orçado Mês:</strong> R$ ${orcadoMes.toFixed(2)}</p>
            <p><strong>Realizado Atual (Baixas + NFs):</strong> R$ ${realizadoMes.toFixed(2)}</p>
            <p class="font-bold text-blue-700"><strong>Saldo Atual:</strong> R$ ${saldoAtual.toFixed(2)}</p>
            <hr class="my-2">
            <p><strong>Impacto desta NF:</strong> - R$ ${valorTotalNF.toFixed(2)}</p>
            <p class="font-bold ${saldoPosAprovacao < 0 ? 'text-red-600' : 'text-green-600'}">
                <strong>Saldo Pós-Lançamento:</strong> R$ ${saldoPosAprovacao.toFixed(2)}
                ${saldoPosAprovacao < 0 ? ' (Orçamento Estourado!)' : ''}
            </p>
        `;

    } catch (error) {
        console.error("Erro ao simular orçamento NF:", error);
        simulacaoDiv.innerHTML = `<div class="alert alert-error">Erro ao simular: ${error.message}</div>`;
    }
}

/**
 * Salva o lançamento financeiro (NF)
 */
async function handleLancamentoNfSubmit() {
    const alertContainer = document.getElementById('lancamentoNfAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando...</div>';
    
    // 1. Validar dados
    const numeroNf = document.getElementById('nfNumero').value;
    const dataNfInput = document.getElementById('nfData').value;
    const anexoFile = document.getElementById('nfAnexo').files[0];
    const linhaId = document.getElementById('nfLinhaOrcamentariaSelect').value;
    const valorTotalNF = parseFloat(document.getElementById('carrinhoNfValorTotal').textContent);
    
    if (!numeroNf || !dataNfInput || !anexoFile || !linhaId || !carrinhoFinanceiro.length) {
        alertContainer.innerHTML = '<div class="alert alert-error">Todos os campos são obrigatórios: Nº NF, Data, Anexo, Itens e Linha Orçamentária.</div>';
        return;
    }
    
    const dataNf = new Date(dataNfInput).toISOString();

    try {
        // 2. Criar o cabeçalho da Despesa (sem o anexo ainda)
        const despesaHeader = {
            usuario_id: currentUser.id,
            filial_id: selectedFilial.id,
            linha_orcamentaria_id: parseInt(linhaId),
            numero_nf: numeroNf,
            data_nf: dataNf,
            valor_total_nf: valorTotalNF,
            obs: 'Lançado via sistema.'
        };
        const responseHeader = await supabaseRequest('despesas_externas', 'POST', despesaHeader);
        if (!responseHeader || !responseHeader[0]?.id) throw new Error('Falha ao criar o cabeçalho da despesa.');
        
        const despesaId = responseHeader[0].id;
        
        // 3. Fazer o Upload do anexo (reutilizando a API)
        alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Enviando anexo...</div>';
        let anexoUrl = '';
        let anexoNome = anexoFile.name;
        
        try {
            // Usamos o 'despesaId' como 'solicitacaoId' na API (hack)
            const apiUrl = `/api/upload?fileName=${encodeURIComponent(anexoNome)}&solicitacaoId=${despesaId}&fileType=nf_externa`;
            const responseUpload = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': anexoFile.type || 'application/octet-stream' },
                body: anexoFile,
            });
            if (!responseUpload.ok) throw new Error('Falha no upload do anexo.');
            const resultUpload = await responseUpload.json();
            anexoUrl = resultUpload.publicUrl;
        } catch (uploadError) {
            console.warn("Upload falhou, continuando sem anexo:", uploadError);
            showNotification('Falha no upload do anexo, mas a despesa foi salva sem ele.', 'warning');
        }

        // 4. Atualizar o cabeçalho com a URL do anexo
        if (anexoUrl) {
            await supabaseRequest(`despesas_externas?id=eq.${despesaId}`, 'PATCH', {
                anexo_nf_url: anexoUrl,
                nome_anexo_nf: anexoNome
            });
        }
        
        // 5. Inserir os Itens
        alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando itens...</div>';
        const itensParaInserir = carrinhoFinanceiro.map(item => ({
            despesa_id: despesaId,
            ...item // descricao_item, quantidade, valor_unitario, valor_total
        }));
        await supabaseRequest('despesas_externas_itens', 'POST', itensParaInserir);
        
        // 6. Sucesso
        showNotification('Despesa externa (NF) lançada com sucesso!', 'success');
        loadLancamentosFinanceiros(); // Recarrega a view
        
    } catch (error) {
        console.error("Erro ao salvar lançamento NF:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar: ${error.message}</div>`;
    }
}

/**
 * Abre o modal de detalhes da despesa
 */
async function abrirDetalhesDespesaModal(despesaId) {
    const modal = document.getElementById('detalhesDespesaModal');
    const content = document.getElementById('detalhesDespesaContent');
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Carregando...</div>';
    
    // Busca a despesa no cache
    const despesa = lancamentosCache.find(d => d.id === despesaId);
    if (!despesa) {
        content.innerHTML = '<div class="alert alert-error">Erro: Despesa não encontrada no cache.</div>';
        return;
    }
    
    document.getElementById('detalhesDespesaNfNum').textContent = despesa.numero_nf;
    modal.style.display = 'flex';
    
    try {
        // Busca os itens desta despesa
        const itens = await supabaseRequest(`despesas_externas_itens?despesa_id=eq.${despesaId}&select=*%20&order=id.asc`);
        
        const dataLanc = new Date(despesa.created_at).toLocaleString('pt-BR');
        const dataNf = despesa.data_nf ? new Date(despesa.data_nf).toLocaleDateString('pt-BR') : 'N/A';
        const linhaDesc = despesa.linhas_orcamentarias ? `${despesa.linhas_orcamentarias.codigo} - ${despesa.linhas_orcamentarias.descricao}` : 'N/A';
        const anexoLink = despesa.anexo_nf_url
            ? `<a href="${despesa.anexo_nf_url}" target="_blank" class="btn btn-primary btn-small">Ver Anexo (NF)</a>`
            : '<p>Nenhum anexo.</p>';

        let headerHtml = `
            <p><strong>Nº NF:</strong> ${despesa.numero_nf}</p>
            <p><strong>Data NF:</strong> ${dataNf}</p>
            <p><strong>Data Lançamento:</strong> ${dataLanc}</p>
            <p><strong>Linha Orçamentária:</strong> ${linhaDesc}</p>
            <p><strong>Valor Total:</strong> R$ ${despesa.valor_total_nf.toFixed(2)}</p>
            <div class="mt-2">${anexoLink}</div>
            <hr class="my-4">
            <h4 class="text-lg font-semibold mb-2">Itens da Despesa</h4>
        `;
        
        let itensHtml = (itens || []).map(item => {
            return `
                <div class="bg-gray-50 p-3 rounded border mb-2 grid grid-cols-4 gap-2">
                    <p class="col-span-2"><strong>Item:</strong> ${item.descricao_item}</p>
                    <p><strong>Qtd:</strong> ${item.quantidade}</p>
                    <p class="text-right"><strong>Total:</strong> R$ ${item.valor_total.toFixed(2)}</p>
                </div>
            `;
        }).join('');
        
        content.innerHTML = headerHtml + (itensHtml || '<p>Nenhum item.</p>');
        if (typeof feather !== 'undefined') feather.replace();

    } catch (error) {
        content.innerHTML = `<div class="alert alert-error">Erro ao buscar itens: ${error.message}</div>`;
    }
}


function limparCarrinho() {
    carrinhoItens = []; // Limpa o array global
    
    // Reseta o formulário de adicionar item
    const addItemForm = document.getElementById('addItemForm');
    if (addItemForm) {
        addItemForm.reset();
        document.getElementById('produtoId').value = '';
        document.getElementById('produtoDescricao').value = '';
        document.getElementById('valorTotalSolicitado').value = '';
        // Limpa classes de erro que podem ter ficado
        document.getElementById('produtoCodigo').classList.remove('input-error');
        document.getElementById('produtoDescricao').classList.remove('input-error');
    }
    
    // Limpa os alertas
    const addItemAlert = document.getElementById('addItemAlert');
    const novaSolicitacaoAlert = document.getElementById('novaSolicitacaoAlert');
    if (addItemAlert) addItemAlert.innerHTML = '';
    if (novaSolicitacaoAlert) novaSolicitacaoAlert.innerHTML = '';
    
    // Re-renderiza o carrinho (que agora está vazio)
    if (typeof renderCarrinho === 'function') {
        renderCarrinho();
    } else {
        console.error("limparCarrinho: A função renderCarrinho() não foi encontrada.");
    }
}

// =======================================================
// === NOVAS FUNÇÕES: GRÁFICOS E LANÇAMENTO MANUAL ===
// =======================================================

function renderChartOrçadoRealizado(canvasId, data, lineCode, lineDesc, desvioPercentual) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas com ID ${canvasId} não encontrado no DOM.`);
        return null;
    }
    
    const ctx = canvas.getContext('2d');
    
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
    
    // Mapeia os dados, garantindo que o primeiro dataset seja Orçado (Linha) e o segundo Realizado (Barra)
    const datasets = [
        {
            label: 'Orçado',
            data: data.datasets[0].data, // Pega os dados do Orçado
            backgroundColor: 'rgba(0, 119, 182, 1)', 
            borderColor: 'rgba(0, 119, 182, 1)',
            borderWidth: 2,
            type: 'line', // <--- Orçado em LINHA
            fill: false, 
            tension: 0.2, 
            pointRadius: 5, 
        },
        {
            label: 'Realizado (Baixas + NF + Manual)',
            data: data.datasets[1].data, // Pega os dados do Realizado
            backgroundColor: 'rgba(0, 212, 170, 0.7)', // Cor Verde (Primary)
            borderColor: 'rgba(0, 212, 170, 1)',
            borderWidth: 1,
            type: 'bar' // <--- Realizado em BARRA
        }
    ];

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar', // Tipo base do gráfico
        data: {
            labels: data.labels, // Meses
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: false,
                    title: { display: true, text: 'Mês' }
                },
                y: {
                    stacked: false,
                    beginAtZero: true,
                    title: { display: true, text: 'Valor (R$)' },
                    ticks: {
                        callback: function(value) {
                            return 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                        }
                    }
                }
            },
            plugins: {
                legend: { position: 'top' },
                title: { 
                    display: true, 
                    text: `${lineCode} - ${lineDesc}`,
                    font: { size: 16 }
                },
                subtitle: { 
                    display: true,
                    text: `Desvio Anual: ${desvioPercentual.toFixed(2)}%`,
                    color: desvioPercentual > 0 ? '#10B981' : '#D62828', // Verde ou Vermelho
                    font: { size: 14, weight: 'bold' }
                },
                tooltip: {
                     callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                label += 'R$ ' + context.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
    return chartInstances[canvasId];
}

function renderChartComparativoAnual(canvasId, data, anoAtual, anoAnterior) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

    // As variáveis anoAtual e anoAnterior já são passadas como argumentos.
    
    const desvioOrcadoTotal = data.orcadoAtual.reduce((a, b) => a + b, 0) - data.orcadoAnterior.reduce((a, b) => a + b, 0);
    const desvioRealizadoTotal = data.realizadoAtual.reduce((a, b) => a + b, 0) - data.realizadoAnterior.reduce((a, b) => a + b, 0);
    
    // Calcula o percentual de Realizado A vs A-1 (para o título/subtítulo)
    const realizadoAnteriorTotal = data.realizadoAnterior.reduce((a, b) => a + b, 0);
    const realizadoAtualTotal = data.realizadoAtual.reduce((a, b) => a + b, 0);
    const crescimentoRealizado = realizadoAnteriorTotal > 0 ? ((realizadoAtualTotal - realizadoAnteriorTotal) / realizadoAnteriorTotal) * 100 : 0;
    
    const dataSets = [
        // Orçado (Planejado)
        {
            label: `Orçado ${anoAnterior}`,
            data: data.orcadoAnterior,
            backgroundColor: 'rgba(0, 119, 182, 0.4)', // Azul claro
            borderColor: 'rgba(0, 119, 182, 1)',
            borderWidth: 1,
            stack: 'Orçado'
        },
        {
            label: `Orçado ${anoAtual}`,
            data: data.orcadoAtual,
            backgroundColor: 'rgba(0, 119, 182, 0.9)', // Azul escuro
            borderColor: 'rgba(0, 119, 182, 1)',
            borderWidth: 1,
            stack: 'Orçado'
        },
        // Realizado
        {
            label: `Realizado ${anoAnterior}`,
            data: data.realizadoAnterior,
            backgroundColor: 'rgba(0, 212, 170, 0.4)', // Verde claro
            borderColor: 'rgba(0, 212, 170, 1)',
            borderWidth: 1,
            stack: 'Realizado'
        },
        {
            label: `Realizado ${anoAtual}`,
            data: data.realizadoAtual,
            backgroundColor: 'rgba(0, 212, 170, 0.9)', // Verde escuro
            borderColor: 'rgba(0, 212, 170, 1)',
            borderWidth: 1,
            stack: 'Realizado'
        }
    ];

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: { labels: meses, datasets: dataSets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true }, // Empilha Orçado A/A-1 e Realizado A/A-1
                y: { 
                    beginAtZero: true, 
                    title: { display: true, text: 'Valor (R$)' },
                    ticks: {
                        callback: function(value) {
                            return 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                        }
                    }
                }
            },
            plugins: {
                title: { 
                    display: true, 
                    text: `Comparativo Orçado/Realizado Anual Global`,
                    font: { size: 18, weight: 'bold' }
                },
                subtitle: {
                    display: true,
                    text: `Crescimento Realizado A/A-1: ${crescimentoRealizado.toFixed(2)}%`,
                    color: crescimentoRealizado > 0 ? '#D62828' : '#10B981', // Vermelho (aumento de custo) ou Verde (redução)
                    font: { size: 14, weight: 'bold' }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                label += 'R$ ' + context.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
    // Adiciona o resumo do desvio na div auxiliar, se houver uma.
    const resumoDiv = document.getElementById('resumoComparativoAnual');
    if (resumoDiv) {
        resumoDiv.innerHTML = `
            <p class="text-sm font-semibold mt-2">
                Desvio Orçado Total (${anoAtual} vs ${anoAnterior}): R$ ${desvioOrcadoTotal.toFixed(2)}
            </p>
            <p class="${crescimentoRealizado > 0 ? 'text-red-600' : 'text-green-600'} font-bold">
                Desvio Realizado Total (${anoAtual} vs ${anoAnterior}): R$ ${desvioRealizadoTotal.toFixed(2)}
            </p>
        `;
    }
}


async function fetchAllDataForCharts(filialId, ano) {
    const anoAnterior = parseInt(ano) - 1;
    const anos = [parseInt(ano), anoAnterior];
    const todasLinhas = await getAllLinhasOrcamentariasCache(false);
    const linhasAtivas = todasLinhas.filter(l => l.ativo);

    let dataByLineAndYear = {}; // { linhaId: { ano: { orcado: [], realizado: [] } } }

    for (const linha of linhasAtivas) {
        dataByLineAndYear[linha.id] = {};

        for (const currentAno of anos) {
            dataByLineAndYear[linha.id][currentAno] = { orcado: [], realizado: [] };

            const realizedData = await Promise.all(
                meses.map(async (_, mesIndex) => {
                    const mes = mesIndex + 1;
                    return calcularRealizadoLinha(linha.id, filialId, currentAno, mes);
                })
            );

            for (let mes = 1; mes <= 12; mes++) {
                // 1. Buscar Orçado
                const orcamento = await supabaseRequest(
                    `orcamentos_mensais?filial_id=eq.${filialId}&linha_id=eq.${linha.id}&ano=eq.${currentAno}&select=mes_${mes}`
                );
                // CORREÇÃO: Garante que o valor é um float
                const orcadoMes = (orcamento && orcamento[0]) ? parseFloat(orcamento[0][`mes_${mes}`]) || 0 : 0;
                
                // 2. Realizado já está em realizedData[mes-1]
                const realizadoMes = realizedData[mes - 1];
                
                dataByLineAndYear[linha.id][currentAno].orcado.push(orcadoMes);
                dataByLineAndYear[linha.id][currentAno].realizado.push(realizadoMes);
            }
        }
    }
    
    return {
        linesData: dataByLineAndYear,
        linhasAtivas: linhasAtivas // Para iterar e obter detalhes
    };
}

function restoreGraficosViewStructure(filialId, ano, linhas, comparativoAnualData) {
    const view = document.getElementById('graficosView');
    const filialInfo = todasFiliaisCache.find(f => f.id == filialId);
    
    // Conteúdo Principal
    let htmlContent = `
        <h1 class="text-3xl font-bold text-gray-800 mb-6">Análises e Indicadores</h1>
        
        <div class="bg-white p-6 rounded-lg shadow-md mb-6">
            <h3 class="text-xl font-semibold mb-4">Filtros</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="form-group">
                    <label for="graficoFilialSelect" class="font-semibold">Filial:</label>
                    <select id="graficoFilialSelect" class="w-full"></select>
                </div>
                <div class="form-group">
                    <label for="graficoAnoSelect" class="font-semibold">Ano:</label>
                    <select id="graficoAnoSelect" class="w-full"></select>
                </div>
                <div class="form-group pt-6">
                    <button id="gerarGraficosBtn" class="btn btn-primary w-full">Gerar Gráficos</button>
                </div>
            </div>
            <div class="alert alert-info mt-4">Dados consolidados para ${filialInfo.nome} no ano de ${ano}.</div>
        </div>

        <div class="bg-white p-6 rounded-lg shadow-md mb-8">
            <h3 class="text-xl font-bold text-gray-800 mb-4">1. Comparativo Anual Global (${parseInt(ano) - 1} vs ${ano})</h3>
            <p class="text-sm text-gray-500 mb-2">Visão macro do Orçado e Realizado total das linhas ativas.</p>
            <div class="relative h-96">
                <canvas id="comparativoAnualChart"></canvas>
            </div>
            <div id="resumoComparativoAnual" class="mt-4"></div>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div class="bg-white p-6 rounded-lg shadow-md">
                <h3 class="text-xl font-semibold mb-4">Orçado vs Realizado (CGOs Mais Usados)</h3>
                <p class="text-sm text-gray-500 mb-2">Comparativo Orçado vs Realizado por CGO (Mês Atual).</p>
                <div class="relative h-96">
                    <canvas id="orcamentoRealizadoCGOsChart"></canvas>
                </div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-md">
                <h3 class="text-xl font-semibold mb-4">Projeção de Gastos (Mês Atual)</h3>
                <p class="text-sm text-gray-500 mb-2">Valor Realizado até hoje vs Projeção de Fechamento (Linhas).</p>
                <div class="relative h-96">
                    <canvas id="projecaoGastosMensalChart"></canvas>
                </div>
            </div>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4">2. Análise Detalhada por Linha Orçamentária</h2>
        <div id="linhasChartsContainer" class="space-y-8">
    `;
    
    // Adiciona os containers individuais (vazios por enquanto)
    linhas.forEach(linha => {
        htmlContent += `
            <div class="bg-white p-6 rounded-lg shadow-md">
                <h3 class="text-xl font-semibold mb-4">${linha.codigo} - ${linha.descricao}</h3>
                <p class="text-sm text-gray-500 mb-2">Orçado vs Realizado Mensal.</p>
                <div class="relative h-96">
                    <canvas id="linhaChart-${linha.id}"></canvas>
                </div>
            </div>
        `;
    });

    htmlContent += `</div>`; 
    
    view.innerHTML = htmlContent;
    
    // Rebind the filters and button listeners
    prepararGraficosView(filialId, ano); // Popula os dropdowns e seleciona o filtro atual
    document.getElementById('gerarGraficosBtn').addEventListener('click', loadGraficosData);
    
    return;
}

async function prepararGraficosView(selectedFilialId = null, selectedAno = null) {
    const filialSelect = document.getElementById('graficoFilialSelect');
    const anoSelect = document.getElementById('graficoAnoSelect');
    
    // Popula filiais (usa o cache já existente)
    filialSelect.innerHTML = '<option value="">Carregando filiais...</option>';
    try {
        const filiais = await getFiliaisCache(true);
        filialSelect.innerHTML = filiais.map(f => `<option value="${f.id}" ${f.id == (selectedFilialId || selectedFilial.id) ? 'selected' : ''}>${f.nome} - ${f.descricao}</option>`).join('');
    } catch (e) { filialSelect.innerHTML = '<option value="">Erro ao carregar</option>'; }

    // Popula anos
    const anoAtual = new Date().getFullYear();
    anoSelect.innerHTML = '';
    for (let i = anoAtual - 2; i <= anoAtual + 1; i++) {
        anoSelect.innerHTML += `<option value="${i}" ${i == (selectedAno || anoAtual) ? 'selected' : ''}>${i}</option>`;
    }
    
    // Rebind o listener do botão, caso a estrutura tenha sido recriada
    document.getElementById('gerarGraficosBtn').removeEventListener('click', loadGraficosData);
    document.getElementById('gerarGraficosBtn').addEventListener('click', loadGraficosData);
    
    if (typeof feather !== 'undefined') feather.replace();
}


async function prepararLancamentoManualRealizadoView() {
    const filialSelect = document.getElementById('manualFilialSelect');
    const anoSelect = document.getElementById('manualAnoSelect');
    const linhaSelect = document.getElementById('manualLinhaSelect');
    
    document.getElementById('lancamentoManualFormContainer').style.display = 'none';

    // 1. Popula Filiais
    filialSelect.innerHTML = '<option value="">Carregando...</option>';
    try {
        // CORREÇÃO: Garante que a filial selecionada está ativa
        const filiais = await getFiliaisCache(true);
        filialSelect.innerHTML = '<option value="">-- Selecione a Filial --</option>' + filiais.map(f => `<option value="${f.id}" ${f.id === selectedFilial.id ? 'selected' : ''}>${f.nome} - ${f.descricao}</option>`).join('');
    } catch (e) { filialSelect.innerHTML = '<option value="">Erro ao carregar</option>'; }

    // 2. Popula Linhas Orçamentárias (TODAS)
    linhaSelect.innerHTML = '<option value="">Carregando...</option>';
    try {
        const linhas = await getAllLinhasOrcamentariasCache(true);
        linhaSelect.innerHTML = '<option value="">-- Selecione a Linha --</option>' + linhas.map(l => `<option value="${l.id}">${l.codigo} - ${l.descricao} ${l.ativo ? '' : '(Inativa)'}</option>`).join('');
    } catch (e) { linhaSelect.innerHTML = '<option value="">Erro ao carregar</option>'; }
    
    // 3. Popula Anos (Anos anteriores)
    const anoAtual = new Date().getFullYear();
    anoSelect.innerHTML = '';
    for (let i = anoAtual - 5; i <= anoAtual; i++) {
        anoSelect.innerHTML += `<option value="${i}" ${i === anoAtual ? 'selected' : ''}>${i}</option>`;
    }
    
    // Os listeners do Lançamento Manual já estão no DOMContentLoaded e devem funcionar agora que os selects são populados.
}

async function loadGraficosData() {
    const filialSelect = document.getElementById('graficoFilialSelect');
    const anoSelect = document.getElementById('graficoAnoSelect');
    const filialId = filialSelect.value;
    // CORREÇÃO: Variável 'ano' agora é local e numérica
    const ano = parseInt(anoSelect.value); 
    const container = document.getElementById('graficosContainer');
    
    if (!filialId || isNaN(ano)) {
         showNotification('Selecione a Filial e o Ano para gerar os gráficos.', 'error');
         return;
    }
    
    // Destrói instâncias de gráficos antigas (boa prática)
    Object.values(chartInstances).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    chartInstances = {};

    // 1. Mostrar estado de carregamento
    document.getElementById('graficosView').innerHTML = `
        <h1 class="text-3xl font-bold text-gray-800 mb-6">Análises e Indicadores</h1>
        <div class="loading"><div class="spinner"></div>Calculando métricas e gerando gráficos...</div>
    `;
    
    try {
        const anoAnterior = ano - 1;
        const fetchedData = await fetchAllDataForCharts(filialId, ano);
        const linhas = fetchedData.linhasAtivas;
        const allLinesData = fetchedData.linesData;

        // --- 2. PREPARAR DADOS PARA O COMPARATIVO ANUAL (GLOBAL) ---
        let orcadoAnteriorTotal = Array(12).fill(0);
        let orcadoAtualTotal = Array(12).fill(0);
        let realizadoAnteriorTotal = Array(12).fill(0);
        let realizadoAtualTotal = Array(12).fill(0);

        for (const lineId in allLinesData) {
            if (allLinesData[lineId][anoAnterior]) {
                allLinesData[lineId][anoAnterior].orcado.forEach((val, i) => orcadoAnteriorTotal[i] += val);
                allLinesData[lineId][anoAnterior].realizado.forEach((val, i) => realizadoAnteriorTotal[i] += val);
            }
            if (allLinesData[lineId][ano]) {
                allLinesData[lineId][ano].orcado.forEach((val, i) => orcadoAtualTotal[i] += val);
                allLinesData[lineId][ano].realizado.forEach((val, i) => realizadoAtualTotal[i] += val);
            }
        }

        const comparativoAnualData = {
            orcadoAnterior: orcadoAnteriorTotal,
            orcadoAtual: orcadoAtualTotal,
            realizadoAnterior: realizadoAnteriorTotal,
            realizadoAtual: realizadoAtualTotal,
        };

        // --- 3. RECRIAR A ESTRUTURA HTML (E FILTROS) ---
        restoreGraficosViewStructure(filialId, ano, linhas, comparativoAnualData);
        
        // --- 4. RENDERIZAR GRÁFICOS ---
        
        // A) COMPARATIVO ANUAL GLOBAL
        renderChartComparativoAnual('comparativoAnualChart', comparativoAnualData, ano, anoAnterior);

        // B) GRÁFICOS INDIVIDUAIS POR LINHA
        linhas.forEach(linha => {
            const linhaDataAtual = allLinesData[linha.id][ano];
            
            const orcadoAnual = linhaDataAtual.orcado.reduce((a, b) => a + b, 0);
            const realizadoAnual = linhaDataAtual.realizado.reduce((a, b) => a + b, 0);
            const desvioPercentual = orcadoAnual > 0 ? ((orcadoAnual - realizadoAnual) / orcadoAnual) * 100 : 0;

            const dadosGraficoLinha = {
                labels: meses,
                datasets: [
                    { label: 'Orçado', data: linhaDataAtual.orcado },
                    { label: 'Realizado (Baixas + NF + Manual)', data: linhaDataAtual.realizado }
                ]
            };
            renderChartOrçadoRealizado(`linhaChart-${linha.id}`, dadosGraficoLinha, linha.codigo, linha.descricao, desvioPercentual);
        });
        
        showNotification(`Gráficos individuais e comparativos carregados para o ano de ${ano}.`, 'success', 3000);
        
        // Implementar Esqueletos para Outros Gráficos (Opcional)

    } catch (error) {
        console.error("Erro ao carregar dados dos gráficos:", error);
        
        // Restaurar a estrutura da view, mesmo em caso de erro.
        document.getElementById('graficosView').innerHTML = `
            <h1 class="text-3xl font-bold text-gray-800 mb-6">Análises e Indicadores</h1>
            <div id="graficosContainer" class="space-y-8">
                 <div class="alert alert-error">Erro ao carregar dados: ${error.message}</div>
                 <div class="bg-white p-6 rounded-lg shadow-md mb-6">
                    <h3 class="text-xl font-semibold mb-4">Filtros</h3>
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div class="form-group">
                            <label for="graficoFilialSelect" class="font-semibold">Filial:</label>
                            <select id="graficoFilialSelect" class="w-full"></select>
                        </div>
                        <div class="form-group">
                            <label for="graficoAnoSelect" class="font-semibold">Ano:</label>
                            <select id="graficoAnoSelect" class="w-full"></select>
                        </div>
                        <div class="form-group pt-6">
                            <button id="gerarGraficosBtn" class="btn btn-primary w-full">Gerar Gráficos</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        prepararGraficosView(filialId, ano); 
        document.getElementById('gerarGraficosBtn').addEventListener('click', loadGraficosData);
    }
}


async function loadRealizadoManualForm() {
    const filialId = document.getElementById('manualFilialSelect').value;
    const ano = document.getElementById('manualAnoSelect').value;
    const linhaId = document.getElementById('manualLinhaSelect').value;
    const alertContainer = document.getElementById('lancamentoManualAlert');
    const formContainer = document.getElementById('lancamentoManualFormContainer');
    const inputsGrid = document.getElementById('realizadoManualInputsGrid');
    
    alertContainer.innerHTML = '';
    formContainer.style.display = 'none';

    if (!filialId || !ano || !linhaId) {
        alertContainer.innerHTML = '<div class="alert alert-error">Selecione a Filial, o Ano e a Linha Orçamentária.</div>';
        return;
    }
    
    inputsGrid.innerHTML = '<div class="loading col-span-4"><div class="spinner"></div>Carregando valores existentes...</div>';
    
    // Atualiza campos ocultos do formulário
    document.getElementById('manualFormLinhaId').value = linhaId;
    document.getElementById('manualFormFilialId').value = filialId;
    document.getElementById('manualFormAno').value = ano;

    try {
        // 1. Busca os valores manuais existentes para o período (12 meses)
        const response = await supabaseRequest(
            `realizado_manual_historico?filial_id=eq.${filialId}&linha_orcamentaria_id=eq.${linhaId}&ano=eq.${ano}&select=mes,valor_realizado`
        );
        
        // Mapeia o resultado para fácil acesso: { 1: 1500.00, 2: 2000.00, ... }
        const valoresExistentes = new Map(response.map(r => [r.mes, parseFloat(r.valor_realizado) || 0]));
        
        // 2. Cria os 12 inputs
        let inputsHtml = '';
        for (let mes = 1; mes <= 12; mes++) {
            const valor = valoresExistentes.get(mes) || 0;
            inputsHtml += `
                <div class="form-group">
                    <label for="manual_mes_${mes}">${meses[mes - 1]} (${mes}):</label>
                    <input type="number" id="manual_mes_${mes}" name="manual_mes_${mes}" 
                           value="${valor.toFixed(2)}" step="0.01" min="0" class="w-full text-right" required>
                </div>
            `;
        }
        
        // 3. Exibe o formulário
        inputsGrid.innerHTML = inputsHtml;
        formContainer.style.display = 'block';

        // Opcional: Mostra a descrição da linha
        const linhaSelect = document.getElementById('manualLinhaSelect');
        const linhaDesc = linhaSelect.options[linhaSelect.selectedIndex].text;
        showNotification(`Pronto para editar a linha: ${linhaDesc}`, 'info', 3000);

    } catch (error) {
        console.error("Erro ao buscar Realizado Manual:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao carregar: ${error.message}</div>`;
    }
}

async function handleLancamentoManualRealizadoSubmit(event) {
    event.preventDefault();
    const alertContainer = document.getElementById('lancamentoManualAlert');
    alertContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Salvando realizado manual...</div>';
    
    const linhaId = document.getElementById('manualFormLinhaId').value;
    const filialId = document.getElementById('manualFormFilialId').value;
    const ano = document.getElementById('manualFormAno').value;
    
    let dadosParaUpsert = [];

    // 1. Coleta os 12 valores
    for (let mes = 1; mes <= 12; mes++) {
        const input = document.getElementById(`manual_mes_${mes}`);
        const valor = parseFloat(input.value);
        
        if (isNaN(valor) || valor < 0) {
            alertContainer.innerHTML = `<div class="alert alert-error">Valor inválido para o mês ${meses[mes-1]}.</div>`;
            return;
        }

        dadosParaUpsert.push({
            filial_id: parseInt(filialId),
            linha_orcamentaria_id: parseInt(linhaId),
            ano: parseInt(ano),
            mes: mes,
            valor_realizado: valor.toFixed(2)
        });
    }

    try {
        await supabaseRequest(
            `realizado_manual_historico?on_conflict=filial_id,linha_orcamentaria_id,ano,mes`,
            'POST',
            dadosParaUpsert,
            { 'Prefer': 'resolution=merge-duplicates' } // Header essencial para UPSERT
        );
        
        realizadoManualCache = []; // Limpa o cache para forçar a próxima busca a ler o novo valor
        showNotification('Valores manuais salvos com sucesso!', 'success');
        
        // Opcional: Recarrega a tela para limpar, mas não é estritamente necessário
        document.getElementById('lancamentoManualFormContainer').style.display = 'none';

    } catch (error) {
        console.error("Erro ao salvar Realizado Manual:", error);
        alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar: ${error.message}</div>`;
    }
}


function showError(message) {
    const alertContainer = document.getElementById('loginAlert');
    if (alertContainer) {
        // Assume que 'alert-error' é a classe de estilo para a mensagem de erro
        alertContainer.innerHTML = `<div class="alert alert-error">${message}</div>`;
        // Remove a mensagem de erro após 5 segundos, se necessário
        setTimeout(() => {
            alertContainer.innerHTML = '';
        }, 5000);
    } else {
        console.error("Erro de Login:", message);
    }
}

// Adicione ou substitua a função redirectToDashboard no script.js
function redirectToDashboard() {
    // Certifique-se de que 'currentUser' foi definido em 'handleLogin'
    if (!currentUser || !currentUser.filiais || currentUser.filiais.length === 0) {
        showError("Erro fatal: Dados do usuário incompletos após o login.");
        logout(); // Força o logout
        return;
    }
    
    const filiais = currentUser.filiais;

    // Se o usuário tem apenas 1 filial, seleciona automaticamente
    if (filiais.length === 1) {
        selectedFilial = filiais[0];
        // Sua função que carrega a interface principal do sistema
        showMainSystem(); 
    } 
    // Se o usuário tem mais de 1 filial (AJUSTE NECESSÁRIO NO SEU SISTEMA)
    else if (filiais.length > 1) {
        console.warn("Usuário tem múltiplas filiais. Exibir modal de seleção é o ideal.");
        
        // PARA TESTES: Seleciona a primeira filial para prosseguir
        selectedFilial = filiais[0];
        showMainSystem(); 
    }
}
