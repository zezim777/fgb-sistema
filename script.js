// --- 1. CONFIG E BANCO ---
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

const fasesPadrao = ["Confecção do QDD", "Parecer Jurídico", "Publicação de Edital", "Abertura de Certame", "Homologação"];
const setoresFGB = ["FGB-AC - Assessoria de Comunicação", "FGB-AJ - Assessoria Jurídica", "FGB-AP - Assessoria de Planejamento", "FGB-CA - Coordenadora Administrativa", "FGB-CCL - Coordenadoria de Contratos e Licitações", "FGB-CEC - Coordenadoria de Equipamentos Culturais", "FGB-CEOF - Coordenadoria de Execução Orçamentária Financeira", "FGB-CG - Chefia de Gabinete", "FGB-CI - Controle Interno", "FGB-CMPC - Conselho Municipal de Políticas Culturais", "FGB-COA - Coordenadoria de Artes", "FGB-CPHC - Coordenadoria de Patrimônio Histórico", "FGB-DG - Diretoria de Gestão", "FGB-DPC - Diretoria de Políticas Culturais", "FGB-PR - Presidência", "FGB-SAP - Seção de Almoxarifado e Patrimônio", "FGB-SEC - Secretaria Executiva dos Conselhos", "FGB-SGP - Seção de Gestão de Pessoas"];

let dbUsuarios = {}, dbProcessos = null, listaNotificacoesGlobais = [];
let ultimaNotifLida = localStorage.getItem('ultima_notif_lida') || 0;

document.addEventListener('DOMContentLoaded', () => {
    const regSetor = document.getElementById('reg-setor');
    if (regSetor) setoresFGB.forEach(s => regSetor.add(new Option(s, s)));
    if (localStorage.getItem('fgb_tema') === 'dark') document.body.classList.add('dark-mode');
    if (localStorage.getItem('fgb_logado') === 'true') abrirPainelCompleto();
});

// --- NOVO: SISTEMA DE HISTÓRICO DE ATIVIDADES ---
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
        if(!dados) {
            listaDiv.innerHTML = '<p class="empty-hist">Nenhuma ação recente...</p>';
            return;
        }
        Object.values(dados).reverse().forEach(h => {
            listaDiv.innerHTML += `
                <div class="hist-card">
                    ${h.msg}
                    <span class="hist-time">🕒 ${h.data.split(' ')[1]}</span>
                </div>
            `;
        });
    });
}

// --- FUNÇÕES DE LOGIN E INTERFACE ---
function fazerLogin() {
    const u = document.getElementById('login-user').value.toLowerCase().trim();
    const p = document.getElementById('login-pass').value;
    db.ref('usuarios/' + u).once('value', snap => {
        const d = snap.val();
        if (d && d.senha === p) {
            localStorage.setItem('fgb_logado', 'true');
            localStorage.setItem('fgb_user', u);
            localStorage.setItem('fgb_setor', d.setor || ""); 
            localStorage.setItem('fgb_nivel', d.nivel || "Operador"); 
            abrirPainelCompleto();
        } else alert("Usuário ou senha incorretos!");
    });
}

function abrirPainelCompleto() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-system').style.display = 'block';
    iniciarLeituraDeDados();
    carregarHistorico(); // Ativa o histórico no menu lateral
}

// --- MODAIS E CONFIGURAÇÕES ---
function abrirModalPerfil() {
    const u = localStorage.getItem('fgb_user'), dados = dbUsuarios[u] || {};
    document.getElementById('profile-user-title').innerText = `@${u}`;
    document.getElementById('profile-setor-tag').innerText = dados.setor ? dados.setor.split(' -')[0] : '---';
    document.getElementById('p-full-name').value = dados.nomeReal || "";
    document.getElementById('p-role').value = dados.cargo || "";
    
    let c = 0, v = 0;
    if(dbProcessos) Object.values(dbProcessos).forEach(p => { if(p.dono === u && !p.excluido) { c++; v += parseFloat(p.valor?.replace(/[^\d,]/g, '').replace(',', '.') || 0); } });
    document.getElementById('p-count').innerText = c;
    document.getElementById('p-value').innerText = v.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    
    document.getElementById('modal-perfil').style.display = 'flex';
}
function fecharModalPerfil() { document.getElementById('modal-perfil').style.display = 'none'; }
function salvarPerfil() {
    const u = localStorage.getItem('fgb_user');
    db.ref('usuarios/' + u).update({ nomeReal: document.getElementById('p-full-name').value, cargo: document.getElementById('p-role').value })
    .then(() => { alert("Perfil Atualizado!"); fecharModalPerfil(); });
}

function abrirModalConfig() { document.getElementById('modal-config').style.display = 'flex'; }
function fecharModalConfig() { document.getElementById('modal-config').style.display = 'none'; }

function alternarTema() {
    document.body.classList.toggle('dark-mode');
    const modo = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('fgb_tema', modo);
    document.getElementById('btn-modal-tema').innerText = modo === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro';
}

// --- MOTOR DE DADOS ---
function iniciarLeituraDeDados() {
    db.ref('usuarios').on('value', snap => { dbUsuarios = snap.val() || {}; renderizarTela(); });
    db.ref('processos').on('value', snap => { dbProcessos = snap.val(); renderizarTela(); });
    db.ref('notificacoes_globais').on('value', snap => { listaNotificacoesGlobais = snap.val() ? Object.values(snap.val()) : []; renderizarNotificacoes(); });
}

function adicionarProcesso() {
    const e = document.getElementById('input-empresa').value, o = document.getElementById('input-objeto').value, d = document.getElementById('input-data').value, u = localStorage.getItem('fgb_user');
    if (!e || !o || d.length < 10) return alert("Preencha tudo!");
    const id = Date.now();
    db.ref('processos/' + id).set({ id: id, dono: u, setorOrigem: dbUsuarios[u].setor, empresa: e, objeto: o, data: d, fase: "", setor: dbUsuarios[u].setor, valor: "", excluido: false })
    .then(() => registrarAtividade(`Criou processo: ${e.substring(0,15)}...`));
}

function atualizarCampo(id, campo, valor) {
    db.ref('processos/' + id).update({ [campo]: valor })
    .then(() => {
        if(campo === 'fase') registrarAtividade(`Alterou fase p/ ${valor}`);
        if(campo === 'valor') registrarAtividade(`Atualizou valor de um processo`);
    });
}

function moverParaLixeira(id, estado) {
    db.ref('processos/' + id).update({ excluido: estado })
    .then(() => registrarAtividade(estado ? "Moveu item para lixeira" : "Restaurou item da lixeira"));
}

function transferirProcesso(id, novoDono) {
    if(novoDono && confirm("Delegar processo?")) {
        db.ref('processos/' + id).update({ dono: novoDono })
        .then(() => registrarAtividade(`Delegou processo para ${novoDono.toUpperCase()}`));
    }
}

// --- RENDERIZAÇÃO ---
function renderizarTela() {
    const u = localStorage.getItem('fgb_user'), meuP = dbUsuarios[u] || {}, meuS = (meuP.setor || "").trim(), meuN = meuP.nivel || "Operador";
    document.getElementById('user-display').innerText = `${meuN}: ${u.toUpperCase()} | ${meuS.split(' -')[0]}`;
    if (u === 'joseeminem') document.getElementById('admin-container').classList.add('visible');
    if (meuN === 'Coordenador') { 
        document.getElementById('dash-setor').classList.remove('hidden'); 
        document.getElementById('btn-report').classList.remove('hidden'); 
        document.getElementById('btn-limpar-lixeira').classList.remove('hidden'); 
    }

    const ativosDiv = document.getElementById('lista-ativos'), lixeiraDiv = document.getElementById('lista-lixeira');
    ativosDiv.innerHTML = ''; lixeiraDiv.innerHTML = '';
    if (!dbProcessos) return;

    let tSetor = 0, vSetor = 0;
    Object.values(dbProcessos).reverse().forEach(p => {
        const setorDono = (dbUsuarios[p.dono]?.setor || p.setorOrigem || "").trim();
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
            <button class="btn-excluir" onclick="moverParaLixeira(${p.id}, ${!p.excluido})">${p.excluido?'↺':'✖'}</button>
            <div class="empresa">${p.empresa}</div><div class="objeto">${p.objeto}</div>
            <div class="tag-box status-box">📍 <select onchange="atualizarCampo(${p.id},'fase',this.value)">${sF}</select></div>
            <div class="tag-box setor-box">🏢 <select onchange="atualizarCampo(${p.id},'setor',this.value)">${sS}</select></div>
            <div class="detalhes">
                <span>📅</span><input type="text" class="input-card" value="${p.data}" onchange="atualizarCampo(${p.id},'data',this.value)">
                <span>💰</span><input type="text" class="input-card" value="${p.valor}" onkeyup="mascaraMoeda(this)" onchange="atualizarCampo(${p.id},'valor',this.value)">
            </div>${trans}</div>`;
        if (p.excluido) lixeiraDiv.innerHTML += card; else ativosDiv.innerHTML += card;
    });

    if (meuN === 'Coordenador') {
        document.getElementById('stat-total').innerText = tSetor;
        document.getElementById('stat-valor').innerText = vSetor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    }
}

// --- FUNÇÕES DE AUXÍLIO REPETIDAS (Ver Senha, Cadastro, etc - RESTAURADAS) ---
function toggleSenha(id, btn) { const input = document.getElementById(id); if (input.type === "password") { input.type = "text"; btn.innerText = "OCULTAR"; } else { input.type = "password"; btn.innerText = "VER"; } }
function alternarTela(id) { document.getElementById('login-screen').classList.add('hidden'); document.getElementById('cadastro-screen').classList.add('hidden'); document.getElementById('recuperar-screen').classList.add('hidden'); document.getElementById(id).classList.remove('hidden'); }
function fazerLogout() { localStorage.clear(); location.reload(); }
function mascaraData(c) { let v = c.value.replace(/\D/g, ""); if (v.length > 2) v = v.substring(0,2) + "/" + v.substring(2); if (v.length > 5) v = v.substring(0,5) + "/" + v.substring(5,10); c.value = v; }
function mascaraMoeda(c) { let v = c.value.replace(/\D/g, ""); if (v === "") return; v = (parseInt(v) / 100).toFixed(2) + ""; v = v.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1."); c.value = "R$ " + v; }
function toggleMenuUsuario(e) { e.stopPropagation(); document.querySelector('.user-menu-container').classList.toggle('active'); }
function toggleNotificacoes(e) { e.stopPropagation(); document.querySelector('.notification-container').classList.toggle('active'); }
function filtrarProcessos() { const t = document.getElementById('input-pesquisa').value.toLowerCase(); document.querySelectorAll('.processo-card').forEach(c => c.style.display = c.innerText.toLowerCase().includes(t) ? 'block' : 'none'); }
function fecharModalSugestao() { document.getElementById('modal-sugestao').style.display = 'none'; }
function abrirModalSugestao() { document.getElementById('modal-sugestao').style.display = 'flex'; }
function fecharModalAdminNotif() { document.getElementById('modal-admin-notif').style.display = 'none'; }
function fecharModalConfig() { document.getElementById('modal-config').style.display = 'none'; }
function lerNotificacoes() { localStorage.setItem('ultima_notif_lida', Date.now()); document.getElementById('notif-badge').style.display = 'none'; }

// Funções de Cadastro e Recuperação (Restauradas)
function cadastrarUsuario() {
    const u = document.getElementById('reg-user').value.toLowerCase().trim(), p = document.getElementById('reg-pass').value, k = document.getElementById('reg-keyword').value, s = document.getElementById('reg-setor').value, n = document.getElementById('reg-nivel').value;
    if (!u || !p || !k || !s) return alert("Preencha tudo!");
    db.ref('usuarios/' + u).set({ usuario: u, senha: p, palavraChave: k, setor: s, nivel: n }).then(() => { alert("Cadastrado!"); alternarTela('login-screen'); });
}
function alterarSenha() {
    const u = document.getElementById('rec-user').value.toLowerCase().trim(), k = document.getElementById('rec-keyword').value, p = document.getElementById('rec-pass').value;
    db.ref('usuarios/' + u).once('value', snap => {
        if (snap.exists() && snap.val().palavraChave === k) { db.ref('usuarios/' + u).update({ senha: p }).then(() => { alert("Senha Alterada!"); alternarTela('login-screen'); }); }
        else alert("Dados incorretos!");
    });
}