// --- LEITURA AUTOMÁTICA DO TEMA AO ABRIR O SITE ---
const temaSalvo = localStorage.getItem('fgb_tema');
if (temaSalvo === 'dark') {
    document.body.classList.add('dark-mode');
}

// --- 1. CONEXÃO COM O BANCO DE DADOS FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyCnYlfhCCLj5btCZB86RhEKYc7kjFMwlaw",
    authDomain: "sistema-de-licitacoes.firebaseapp.com",
    databaseURL: "https://sistema-de-licitacoes-default-rtdb.firebaseio.com",
    projectId: "sistema-de-licitacoes",
    storageBucket: "sistema-de-licitacoes.firebasestorage.app",
    messagingSenderId: "459656328732",
    appId: "1:459656328732:web:940b71d2f3abfe335b91d9"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- 2. DADOS DA FGB E VARIÁVEIS DE SISTEMA ---
const fasesPadrao = ["Confecção do QDD", "Parecer Jurídico", "Publicação de Edital", "Abertura de Certame", "Homologação"];
const setoresFGB = [
    "FGB-AC - Assessoria de Comunicação", "FGB-AJ - Assessoria Jurídica", "FGB-AP - Assessoria de Planejamento",
    "FGB-CA - Coordenadora Administrativa", "FGB-CCL - Coordenadoria de Contratos e Licitações", "FGB-CEC - Coordenadoria de Equipamentos Culturais",
    "FGB-CEOF - Coordenadoria de Execução Orçamentária Financeira", "FGB-CG - Chefia de Gabinete",
    "FGB-CI - Controle Interno", "FGB-CMPC - Conselho Municipal de Políticas Culturais",
    "FGB-COA - Coordenadoria de Artes", "FGB-CPHC - Coordenadoria de Patrimônio Histórico",
    "FGB-DG - Diretoria de Gestão", "FGB-DPC - Diretoria de Políticas Culturais", "FGB-PR - Presidência",
    "FGB-SAP - Seção de Almoxarifado e Patrimônio", "FGB-SEC - Secretaria Executiva dos Conselhos",
    "FGB-SGP - Seção de Gestão de Pessoas"
];
let temporizadorInatividade;
let dbUsuarios = {};
let dbProcessos = null;
let listaNotificacoesGlobais = [];
let ultimaNotifLida = localStorage.getItem('ultima_notif_lida') || 0;

document.addEventListener('DOMContentLoaded', () => {
    const regSetor = document.getElementById('reg-setor');
    if (regSetor) {
        setoresFGB.forEach(s => { 
            const novaOpcao = new Option(s, s);
            regSetor.add(novaOpcao); 
        });
    }
    if (localStorage.getItem('fgb_tema') === 'dark') document.body.classList.add('dark-mode');
    if (localStorage.getItem('fgb_logado') === 'true') abrirPainelCompleto();
});

// --- 3. SISTEMA DE HISTÓRICO (SIDEBAR) ---
function registrarAtividade(mensagem) {
    const u = localStorage.getItem('fgb_user');
    if (!u) return;
    const id = Date.now();
    const dataHora = new Date().toLocaleString('pt-BR');
    db.ref(`historico/${u}/${id}`).set({ msg: mensagem, data: dataHora });
}

function carregarHistorico() {
    const u = localStorage.getItem('fgb_user');
    const listaDiv = document.getElementById('historico-lista');
    if(!listaDiv) return;
    db.ref(`historico/${u}`).limitToLast(5).on('value', snap => {
        listaDiv.innerHTML = '';
        const dados = snap.val();
        if(!dados) { listaDiv.innerHTML = '<p class="empty-hist">Nenhuma ação recente...</p>'; return; }
        Object.values(dados).reverse().forEach(h => {
            listaDiv.innerHTML += `<div class="hist-card">${h.msg}<span class="hist-time">🕒 ${h.data.split(' ')[1]}</span></div>`;
        });
    });
}

// --- 4. FUNÇÕES DE ADMIN E MEGAFONE ---
function abrirModalAdminNotif() { document.getElementById('modal-admin-notif').style.display = 'flex'; }
function fecharModalAdminNotif() { document.getElementById('modal-admin-notif').style.display = 'none'; document.getElementById('texto-admin-notif').value = ''; }
function enviarNotificacaoGlobal() {
    const texto = document.getElementById('texto-admin-notif').value.trim();
    if (!texto) return alert("Digite o aviso!");
    const idMsg = Date.now();
    db.ref('notificacoes_globais/' + idMsg).set({ id: idMsg, msg: texto, data: new Date().toLocaleString() })
    .then(() => { alert("📢 Transmitido!"); fecharModalAdminNotif(); registrarAtividade("Enviou aviso global"); });
}

// --- 5. LÓGICA DE TELAS E AUTENTICAÇÃO INTEGRAL ---
function alternarTela(id) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('cadastro-screen').classList.add('hidden');
    document.getElementById('recuperar-screen').classList.add('hidden');
    document.getElementById(id).classList.remove('hidden');
}

function toggleSenha(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === "password") { input.type = "text"; btn.innerText = "OCULTAR"; } else { input.type = "password"; btn.innerText = "VER"; }
}

function fazerLogin() {
    const u = document.getElementById('login-user').value.toLowerCase().trim();
    const p = document.getElementById('login-pass').value;
    if (!u || !p) return alert("Preencha Usuário e Senha!");
    db.ref('usuarios/' + u).once('value', snap => {
        const d = snap.val();
        if (d && d.senha === p) {
            localStorage.setItem('fgb_logado', 'true');
            localStorage.setItem('fgb_user', u);
            abrirPainelCompleto();
        } else alert("Usuário ou senha incorretos!");
    });
}

function cadastrarUsuario() {
    const u = document.getElementById('reg-user').value.toLowerCase().trim();
    const p = document.getElementById('reg-pass').value;
    const k = document.getElementById('reg-keyword').value;
    const s = document.getElementById('reg-setor').value.trim(); // Limpa espaços extras
    const n = document.getElementById('reg-nivel').value;

    if (!u || !p || !k || !s) return alert("Por favor, preencha todos os campos.");

    // BUSCA OS DADOS MAIS RECENTES DIRETO DO FIREBASE
    db.ref('usuarios').once('value', snap => {
        const todosUsuarios = snap.val() || {};

        // 1. Verificação de Usuário Duplicado
        if (todosUsuarios[u]) {
            return alert(`O nome de usuário "${u}" já existe no sistema.`);
        }

        // 2. VARREDURA DE SEGURANÇA (Regra de 1 Coordenador por Setor)
        if (n === 'Coordenador') {
            let coordenadorExistente = null;

            // Percorre todos os usuários cadastrados no banco
            Object.values(todosUsuarios).forEach(user => {
                if (user.setor.trim() === s && user.nivel === 'Coordenador') {
                    coordenadorExistente = user.usuario;
                }
            });

            // Se a varredura encontrou alguém, bloqueia imediatamente
            if (coordenadorExistente) {
                const siglaSetor = s.split(' -')[0];
                return alert(`BLOQUEIO DE HIERARQUIA: O setor ${siglaSetor} já possui um Coordenador (${coordenadorExistente.toUpperCase()}). Não é permitido mais de um coordenador por setor.`);
            }
        }

        // 3. GRAVAÇÃO SEURA (Só acontece se passar em todas as travas acima)
        db.ref('usuarios/' + u).set({
            usuario: u,
            senha: p,
            palavraChave: k,
            setor: s,
            nivel: n,
            tema: 'light'
        }).then(() => {
            alert("Cadastro realizado com sucesso!");
            alternarTela('login-screen');
            // Limpa os campos
            document.getElementById('reg-user').value = '';
            document.getElementById('reg-pass').value = '';
        });
    });
}

function alterarSenha() {
    const u = document.getElementById('rec-user').value.toLowerCase().trim(), k = document.getElementById('rec-keyword').value, p = document.getElementById('rec-pass').value;
    db.ref('usuarios/' + u).once('value', snap => {
        if (snap.exists() && snap.val().palavraChave === k) { db.ref('usuarios/' + u).update({ senha: p }).then(() => { alert("Senha Alterada!"); alternarTela('login-screen'); }); }
        else alert("Dados incorretos!");
    });
}

function fazerLogout() { localStorage.clear(); location.reload(); }

function abrirPainelCompleto() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-system').style.display = 'block';
    const sidebar = document.getElementById('sidebar-menu');
    if (sidebar) sidebar.style.display = 'flex';
    iniciarLeituraDeDados();
    carregarHistorico();
}

// --- 6. FUNÇÕES DE LICITAÇÃO (MÁSCARAS E ATUALIZAÇÕES) ---
function mascaraData(campo) {
    let v = campo.value.replace(/\D/g, "");
    if (v.length > 2) v = v.substring(0,2) + "/" + v.substring(2);
    if (v.length > 5) v = v.substring(0,5) + "/" + v.substring(5,10);
    campo.value = v;
}

function mascaraMoeda(campo) {
    let valor = campo.value.replace(/\D/g, "");
    if (valor === "") { campo.value = ""; return; }
    valor = (parseInt(valor) / 100).toFixed(2) + "";
    valor = valor.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    campo.value = "R$ " + valor;
}

function adicionarProcesso() {
    const emp = document.getElementById('input-empresa').value, obj = document.getElementById('input-objeto').value, dat = document.getElementById('input-data').value, u = localStorage.getItem('fgb_user');
    if (!emp || !obj || dat.length < 10) return alert("Preencha tudo!");
    const id = Date.now();
    db.ref('processos/' + id).set({ id: id, dono: u, setorOrigem: dbUsuarios[u].setor, empresa: emp, objeto: obj, data: dat, fase: "", setor: dbUsuarios[u].setor, valor: "", excluido: false })
    .then(() => { registrarAtividade(`Criou processo: ${emp.substring(0,10)}...`); document.getElementById('input-empresa').value=''; document.getElementById('input-objeto').value=''; document.getElementById('input-data').value=''; });
}

function atualizarCampo(id, campo, valor) { db.ref('processos/' + id).update({ [campo]: valor }).then(() => registrarAtividade(`Atualizou ${campo}`)); }
function moverParaLixeira(id, estado) { db.ref('processos/' + id).update({ excluido: estado }).then(() => registrarAtividade(estado ? "Excluiu item" : "Restaurou item")); }
function transferirProcesso(id, n) { if(n && confirm("Delegar?")) db.ref('processos/' + id).update({ dono: n }).then(() => registrarAtividade(`Delegou para ${n}`)); }

function filtrarProcessos() {
    const t = document.getElementById('input-pesquisa').value.toLowerCase();
    document.querySelectorAll('.processo-card').forEach(c => c.style.display = c.innerText.toLowerCase().includes(t) ? 'block' : 'none');
}

// --- 7. MOTOR DE RENDERIZAÇÃO E DASHBOARD ---
function iniciarLeituraDeDados() {
    db.ref('usuarios').on('value', snap => { dbUsuarios = snap.val() || {}; renderizarTela(); });
    db.ref('processos').on('value', snap => { dbProcessos = snap.val(); renderizarTela(); });
    db.ref('notificacoes_globais').on('value', snap => { listaNotificacoesGlobais = snap.val() ? Object.values(snap.val()) : []; renderizarNotificacoes(); });
}

function renderizarTela() {
    const u = localStorage.getItem('fgb_user');
    
    // ESCUDO DE PROTEÇÃO PARA O LOGIN (Se não estiver logado, não tenta renderizar a tela interna)
    if (!u) return;

    const meuP = dbUsuarios[u] || {}; 
    const meuS = (meuP.setor || "").trim();
    const meuN = meuP.nivel || "Operador";

    // Mostra o nome do usuário
    const display = document.getElementById('user-display');
    if (display) {
        display.innerText = `${meuN}: ${u.toUpperCase()} | ${meuS.split(' -')[0]}`;
    }
    
    // VERIFICA O TEMA DO FIREBASE
    if (meuP.tema === 'dark') {
        document.body.classList.add('dark-mode');
        localStorage.setItem('fgb_tema', 'dark');
    } else if (meuP.tema === 'light') {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('fgb_tema', 'light');
    }

    if (u === 'joseeminem') {
        const adminMenu = document.getElementById('admin-menu-item');
        if (adminMenu) adminMenu.style.display = 'block';
    }
    
    if (meuN === 'Coordenador') {
        document.getElementById('dash-setor')?.classList.remove('hidden');
        document.getElementById('btn-report')?.classList.remove('hidden');
    }

    // --- AQUI COMEÇA A PARTE DOS PROCESSOS QUE ESTAVA "SOLTA" E CAUSANDO O ERRO ---
    const ativosDiv = document.getElementById('lista-ativos'), lixeiraDiv = document.getElementById('lista-lixeira');
    if (!ativosDiv || !lixeiraDiv) return;
    ativosDiv.innerHTML = ''; lixeiraDiv.innerHTML = '';
    
    if (!dbProcessos) { ativosDiv.innerHTML = '<p>Nenhum processo.</p>'; return; }

    let tSetor = 0, vSetor = 0;
    Object.values(dbProcessos).reverse().forEach(p => {
        const perfilDono = dbUsuarios[p.dono] || {};
        const setorDono = (perfilDono.setor || p.setorOrigem || "").trim();
        if (!(p.dono === u || (meuN === 'Coordenador' && (setorDono === meuS || p.setor === meuS)))) return;

        if (!p.excluido && (setorDono === meuS || p.setor === meuS)) {
            tSetor++;
            vSetor += parseFloat(p.valor?.replace(/[^\d,]/g, '').replace(',', '.') || 0);
        }

        const sF = `<option disabled ${!p.fase?'selected':''}>Fase...</option>` + fasesPadrao.map(f => `<option ${p.fase===f?'selected':''}>${f}</option>`).join('');
        const sS = `<option disabled ${!p.setor?'selected':''}>Setor...</option>` + setoresFGB.map(s => `<option ${p.setor===s?'selected':''}>${s}</option>`).join('');
        
        let trans = '';
        if (meuN === 'Coordenador' && !p.excluido) {
            let opts = `<option selected disabled>Delegar...</option>`;
            Object.keys(dbUsuarios).forEach(k => { if (dbUsuarios[k].setor?.trim() === meuS && dbUsuarios[k].nivel !== "Coordenador") opts += `<option value="${k}">${k.toUpperCase()}</option>`; });
            trans = `<div class="transfer-box"><select onchange="transferirProcesso(${p.id}, this.value)">${opts}</select></div>`;
        }

        const card = `<div class="processo-card ${p.excluido?'na-lixeira':''}">
            <button class="btn-excluir" onclick="moverParaLixeira(${p.id}, ${!p.excluido})">${p.excluido?'↺ Restaurar':'✖ Excluir'}</button>
            <div class="empresa">${p.empresa}</div><div class="objeto">${p.objeto}</div>
            <div class="tag-box status-box">📍 Fase: <select onchange="atualizarCampo(${p.id},'fase',this.value)">${sF}</select></div>
            <div class="tag-box setor-box">🏢 Setor: <select onchange="atualizarCampo(${p.id},'setor',this.value)">${sS}</select></div>
            <div class="detalhes">
                <span>📅 Data:</span><input type="text" class="input-card" value="${p.data}" maxlength="10" onkeyup="mascaraData(this)" onchange="atualizarCampo(${p.id},'data',this.value)">
                <span>💰 Valor:</span><input type="text" class="input-card" value="${p.valor}" onkeyup="mascaraMoeda(this)" onchange="atualizarCampo(${p.id},'valor',this.value)">
            </div>${trans}</div>`;
        if (p.excluido) lixeiraDiv.innerHTML += card; else ativosDiv.innerHTML += card;
    });

    if (meuN === 'Coordenador') {
        const t = document.getElementById('stat-total'), v = document.getElementById('stat-valor');
        if(t) t.innerText = tSetor;
        if(v) v.innerText = vSetor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    }
} // <--- AGORA A FUNÇÃO ESTÁ FECHADA NO LUGAR CORRETO, PROTEGENDO TODO O CÓDIGO


// --- 8. OUTROS MODAIS E NOTIFICAÇÕES ---
function alternarTema() {
    const isDark = document.body.classList.toggle('dark-mode');
    const temaEscolhido = isDark ? 'dark' : 'light';
    
    // Salva na memória do PC/Celular
    localStorage.setItem('fgb_tema', temaEscolhido);

    // Salva na Nuvem da Firebase
    const u = localStorage.getItem('fgb_user');
    if (u && typeof db !== 'undefined') {
        db.ref(`usuarios/${u}`).update({ tema: temaEscolhido }).catch(e => console.log("Erro ao salvar tema"));
    }
}

function toggleMenuUsuario(e) { e.stopPropagation(); document.querySelector('.user-menu-container').classList.toggle('active'); }
function toggleNotificacoes(e) { e.stopPropagation(); document.querySelector('.notification-container').classList.toggle('active'); }

function renderizarNotificacoes() {
    const b = document.getElementById('notif-badge');
    const listaDiv = document.getElementById('notif-lista-container'); // Verifique se este ID existe no seu HTML

    // 1. ATUALIZA O NÚMERO (O que você já fazia)
    if (b) {
        b.innerText = listaNotificacoesGlobais.length;
        b.style.display = listaNotificacoesGlobais.length > 0 ? 'flex' : 'none';
    }

    // 2. PREENCHE A LISTA DE MENSAGENS
    if (listaDiv) {
        listaDiv.innerHTML = ''; // Limpa a lista anterior para não duplicar

        if (listaNotificacoesGlobais.length === 0) {
            listaDiv.innerHTML = '<p class="empty-notif">Nenhuma notificação nova.</p>';
            return;
        }

        // Percorre as notificações do Firebase e cria o HTML de cada uma
        // Usamos .reverse() para a mais recente aparecer no topo
        listaNotificacoesGlobais.slice().reverse().forEach(n => {
            const item = document.createElement('div');
            item.className = 'notif-item';
            item.innerHTML = `
                <div class="notif-content">
                    <span class="notif-msg">${n.msg}</span>
                    <span class="notif-time">🕒 ${n.data.split(',')[1] || n.data}</span>
                </div>
            `;
            listaDiv.appendChild(item);
        });
    }
}

function abrirModalPerfil() { document.getElementById('modal-perfil').style.display = 'flex'; }
function fecharModalPerfil() { document.getElementById('modal-perfil').style.display = 'none'; }
function abrirModalConfig() { document.getElementById('modal-config').style.display = 'flex'; }
function fecharModalConfig() { document.getElementById('modal-config').style.display = 'none'; }
function abrirModalSugestao() { document.getElementById('modal-sugestao').style.display = 'flex'; }
function fecharModalSugestao() { document.getElementById('modal-sugestao').style.display = 'none'; }

// --- FUNÇÃO PARA ABRIR/FECHAR MENU LATERAL NO CELULAR ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-menu');
    if (sidebar) {
        sidebar.classList.toggle('active');
    }
}

// Fechar o menu automaticamente ao clicar em um item (opcional)
document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar-menu');
    const btn = document.getElementById('btn-menu-mobile');
    if (window.innerWidth < 800 && sidebar.classList.contains('active')) {
        if (!sidebar.contains(e.target) && e.target !== btn) {
            sidebar.classList.remove('active');
        }
    }
});