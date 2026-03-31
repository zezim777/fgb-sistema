// --- 1. CONFIGURAÇÃO FIREBASE ---
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

// --- SISTEMA DE HISTÓRICO ---
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

// --- FUNÇÕES DO MEGAFONE (ADMIN) - ESSENCIAIS ---
function abrirModalAdminNotif() {
    const modal = document.getElementById('modal-admin-notif');
    if (modal) {
        modal.style.display = 'flex';
    } else {
        console.error("Erro: Modal do Megafone não encontrado no HTML!");
    }
}

function fecharModalAdminNotif() {
    const modal = document.getElementById('modal-admin-notif');
    if (modal) modal.style.display = 'none';
    const campoTexto = document.getElementById('texto-admin-notif');
    if (campoTexto) campoTexto.value = '';
}

function enviarNotificacaoGlobal() {
    const texto = document.getElementById('texto-admin-notif').value.trim();
    if (!texto) return alert("Digite o aviso oficial!");
    const idMsg = Date.now();
    const dataEnvio = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR');
    db.ref('notificacoes_globais/' + idMsg).set({ id: idMsg, msg: texto, data: dataEnvio })
    .then(() => { 
        alert("📢 Transmissão realizada!"); 
        fecharModalAdminNotif(); 
        registrarAtividade("Enviou aviso global");
    });
}

// --- LÓGICA DE LOGIN E TELAS ---
function fazerLogin() {
    const u = document.getElementById('login-user').value.toLowerCase().trim();
    const p = document.getElementById('login-pass').value;
    db.ref('usuarios/' + u).once('value', snap => {
        const d = snap.val();
        if (d && d.senha === p) {
            localStorage.setItem('fgb_logado', 'true');
            localStorage.setItem('fgb_user', u);
            abrirPainelCompleto();
        } else alert("Usuário ou senha incorretos!");
    });
}

function abrirPainelCompleto() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-system').style.display = 'block';
    const sidebar = document.getElementById('sidebar-menu');
    if (sidebar) sidebar.style.display = 'flex';
    iniciarLeituraDeDados();
    carregarHistorico();
}

// --- MOTOR DE DADOS ---
function iniciarLeituraDeDados() {
    db.ref('usuarios').on('value', snap => { dbUsuarios = snap.val() || {}; renderizarTela(); });
    db.ref('processos').on('value', snap => { dbProcessos = snap.val(); renderizarTela(); });
    db.ref('notificacoes_globais').on('value', snap => { 
        const d = snap.val();
        listaNotificacoesGlobais = d ? Object.values(d) : []; 
        renderizarNotificacoes(); 
    });
}

function renderizarTela() {
    const u = localStorage.getItem('fgb_user'), meuP = dbUsuarios[u] || {}, meuS = (meuP.setor || "").trim(), meuN = meuP.nivel || "Operador";
    document.getElementById('user-display').innerText = `${meuN}: ${u.toUpperCase()} | ${meuS.split(' -')[0]}`;
    
    // VISIBILIDADE DO MEGAFONE (SÓ PARA VOCÊ)
    const adminCont = document.getElementById('admin-container');
    if (u === 'joseeminem' && adminCont) adminCont.classList.add('visible');

    if (meuN === 'Coordenador') {
        const d = document.getElementById('dash-setor');
        if (d) d.classList.remove('hidden');
    }

    const ativosDiv = document.getElementById('lista-ativos'), lixeiraDiv = document.getElementById('lista-lixeira');
    if (!ativosDiv || !lixeiraDiv) return;
    ativosDiv.innerHTML = ''; lixeiraDiv.innerHTML = '';
    if (!dbProcessos) return;

    Object.values(dbProcessos).reverse().forEach(p => {
        const perfilDono = dbUsuarios[p.dono] || {};
        const setorDono = (perfilDono.setor || "").trim();
        if (!(p.dono === u || (meuN === 'Coordenador' && setorDono === meuS))) return;

        const card = `<div class="processo-card">
            <button onclick="moverParaLixeira(${p.id}, ${!p.excluido})">${p.excluido?'↺':'✖'}</button>
            <div class="empresa">${p.empresa}</div><div class="objeto">${p.objeto}</div>
        </div>`;
        if (p.excluido) lixeiraDiv.innerHTML += card; else ativosDiv.innerHTML += card;
    });
}

// --- FUNÇÕES AUXILIARES ---
function toggleSenha(id, btn) { const input = document.getElementById(id); if (input.type === "password") { input.type = "text"; btn.innerText = "OCULTAR"; } else { input.type = "password"; btn.innerText = "VER"; } }
function alternarTela(id) { document.getElementById('login-screen').classList.add('hidden'); document.getElementById('cadastro-screen').classList.add('hidden'); document.getElementById('recuperar-screen').classList.add('hidden'); document.getElementById(id).classList.remove('hidden'); }
function fazerLogout() { localStorage.clear(); location.reload(); }
function mascaraData(c) { let v = c.value.replace(/\D/g, ""); if (v.length > 2) v = v.substring(0,2) + "/" + v.substring(2); if (v.length > 5) v = v.substring(0,5) + "/" + v.substring(5,10); c.value = v; }
function mascaraMoeda(c) { let v = c.value.replace(/\D/g, ""); if (v === "") return; v = (parseInt(v) / 100).toFixed(2) + ""; v = v.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1."); c.value = "R$ " + v; }
function toggleMenuUsuario(e) { e.stopPropagation(); document.querySelector('.user-menu-container').classList.toggle('active'); }
function toggleNotificacoes(e) { e.stopPropagation(); document.querySelector('.notification-container').classList.toggle('active'); }
function renderizarNotificacoes() {
    const b = document.getElementById('notif-badge');
    if(b) { b.innerText = listaNotificacoesGlobais.length; b.style.display = listaNotificacoesGlobais.length > 0 ? 'flex' : 'none'; }
}
function cadastrarUsuario() {
    const u = document.getElementById('reg-user').value.toLowerCase().trim(), p = document.getElementById('reg-pass').value, k = document.getElementById('reg-keyword').value, s = document.getElementById('reg-setor').value, n = document.getElementById('reg-nivel').value;
    db.ref('usuarios/' + u).set({ usuario: u, senha: p, palavraChave: k, setor: s, nivel: n }).then(() => { alert("Cadastrado!"); alternarTela('login-screen'); });
}
function moverParaLixeira(id, s) { db.ref('processos/' + id).update({ excluido: s }).then(() => registrarAtividade(s ? "Excluiu item" : "Restaurou item")); }