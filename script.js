// --- CONFIG E BANCO ---
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

// --- CONTROLE DE MODAIS (PERFIL E CONFIG) ---
function abrirModalPerfil() {
    const u = localStorage.getItem('fgb_user');
    const dados = dbUsuarios[u] || {};
    
    document.getElementById('profile-user-title').innerText = `@${u}`;
    document.getElementById('profile-setor-tag').innerText = dados.setor ? dados.setor.split(' -')[0] : 'Setor Indefinido';
    document.getElementById('p-full-name').value = dados.nomeReal || "";
    document.getElementById('p-role').value = dados.cargo || "";

    // OPÇÃO 2: Calcular Estatísticas Individuais
    let count = 0, total = 0;
    if(dbProcessos) {
        Object.values(dbProcessos).forEach(p => {
            if(p.dono === u && !p.excluido) {
                count++;
                if(p.valor) total += parseFloat(p.valor.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
            }
        });
    }
    document.getElementById('p-count').innerText = count;
    document.getElementById('p-value').innerText = total.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

    document.querySelector('.user-menu-container').classList.remove('active');
    document.getElementById('modal-perfil').style.display = 'flex';
}
function fecharModalPerfil() { document.getElementById('modal-perfil').style.display = 'none'; }

function salvarPerfil() {
    const u = localStorage.getItem('fgb_user');
    const nome = document.getElementById('p-full-name').value.trim();
    const cargo = document.getElementById('p-role').value.trim();
    
    db.ref('usuarios/' + u).update({ nomeReal: nome, cargo: cargo })
    .then(() => { alert("✅ Identidade atualizada no FGB Cloud!"); fecharModalPerfil(); });
}

function abrirModalConfig() {
    document.querySelector('.user-menu-container').classList.remove('active');
    document.getElementById('modal-config').style.display = 'flex';
}
function fecharModalConfig() { document.getElementById('modal-config').style.display = 'none'; }

// --- LÓGICA CORE ---
function alternarTema() {
    document.body.classList.toggle('dark-mode');
    const modo = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('fgb_tema', modo);
    document.getElementById('btn-modal-tema').innerText = modo === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro';
}

function fazerLogin() {
    const u = document.getElementById('login-user').value.toLowerCase().trim();
    const p = document.getElementById('login-pass').value;
    db.ref('usuarios/' + u).once('value', snap => {
        const d = snap.val();
        if (d && d.senha === p) {
            localStorage.setItem('fgb_logado', 'true');
            localStorage.setItem('fgb_user', u);
            abrirPainelCompleto();
        } else alert("Acesso negado!");
    });
}

function abrirPainelCompleto() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-system').style.display = 'block';
    iniciarLeituraDeDados();
}

function iniciarLeituraDeDados() {
    db.ref('usuarios').on('value', snap => { dbUsuarios = snap.val() || {}; renderizarTela(); });
    db.ref('processos').on('value', snap => { dbProcessos = snap.val(); renderizarTela(); });
    db.ref('notificacoes_globais').on('value', snap => { listaNotificacoesGlobais = snap.val() ? Object.values(snap.val()) : []; renderizarNotificacoes(); });
}

function renderizarTela() {
    const u = localStorage.getItem('fgb_user'), meuP = dbUsuarios[u] || {};
    const meuS = (meuP.setor || "").trim(), meuN = meuP.nivel || "Operador";
    
    document.getElementById('user-display').innerText = `${meuN}: ${u.toUpperCase()} | ${meuS.split(' -')[0]}`;
    if (u === 'joseeminem') document.getElementById('admin-container').classList.add('visible');

    if (meuN === 'Coordenador') {
        document.getElementById('dash-setor').classList.remove('hidden');
        document.getElementById('btn-report').classList.remove('hidden');
        document.getElementById('btn-limpar-lixeira').classList.remove('hidden');
    }

    const ativosDiv = document.getElementById('lista-ativos');
    const lixeiraDiv = document.getElementById('lista-lixeira');
    ativosDiv.innerHTML = ''; lixeiraDiv.innerHTML = '';
    
    if (!dbProcessos) { ativosDiv.innerHTML = '<p>Vazio.</p>'; return; }
    let tSetor = 0, vSetor = 0, fCount = {};

    Object.values(dbProcessos).reverse().forEach(p => {
        const setorDono = (dbUsuarios[p.dono]?.setor || p.setorOrigem || "").trim();
        if (!(p.dono === u || (meuN === 'Coordenador' && (setorDono === meuS || p.setor === meuS)))) return;

        if (!p.excluido && (setorDono === meuS || p.setor === meuS)) {
            tSetor++;
            if (p.valor) vSetor += parseFloat(p.valor.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
            if (p.fase) fCount[p.fase] = (fCount[p.fase] || 0) + 1;
        }

        const sF = `<option disabled ${!p.fase?'selected':''}>Fase...</option>` + fasesPadrao.map(f => `<option ${p.fase===f?'selected':''}>${f}</option>`).join('');
        const sS = `<option disabled ${!p.setor?'selected':''}>Setor...</option>` + setoresFGB.map(s => `<option ${p.setor===s?'selected':''}>${s}</option>`).join('');
        
        let transHTML = '';
        if (meuN === 'Coordenador' && !p.excluido) {
            let opts = `<option selected disabled>Delegar...</option>`;
            Object.keys(dbUsuarios).forEach(k => {
                if (dbUsuarios[k].setor?.trim() === meuS && dbUsuarios[k].nivel !== "Coordenador") opts += `<option value="${k}">${k.toUpperCase()}</option>`;
            });
            transHTML = `<div style="margin-top:10px;border-top:1px dashed #ddd;"><select onchange="transferirProcesso(${p.id}, this.value)">${opts}</select></div>`;
        }

        const card = `<div class="processo-card ${p.excluido?'na-lixeira':''}">
            <button onclick="moverParaLixeira(${p.id}, ${!p.excluido})">${p.excluido?'↺':'✖'}</button>
            <div class="empresa">${p.empresa}</div><div class="objeto">${p.objeto}</div>
            <div class="tag-box status-box">📍 <select onchange="atualizarCampo(${p.id},'fase',this.value)">${sF}</select></div>
            <div class="tag-box setor-box">🏢 <select onchange="atualizarCampo(${p.id},'setor',this.value)">${sS}</select></div>
            <div class="detalhes">
                <span>📅</span><input type="text" class="input-card" value="${p.data}" onchange="atualizarCampo(${p.id},'data',this.value)">
                <span>💰</span><input type="text" class="input-card" value="${p.valor}" onkeyup="mascaraMoeda(this)" onchange="atualizarCampo(${p.id},'valor',this.value)">
            </div>${transHTML}</div>`;
        if (p.excluido) lixeiraDiv.innerHTML += card; else ativosDiv.innerHTML += card;
    });

    if (meuN === 'Coordenador') {
        document.getElementById('stat-total').innerText = tSetor;
        document.getElementById('stat-valor').innerText = vSetor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    }
}

// --- FUNÇÕES AUXILIARES (DELETAR, NOTIF, ETC) ---
function toggleMenuUsuario(e) { e.stopPropagation(); document.querySelector('.user-menu-container').classList.toggle('active'); }
function toggleNotificacoes(e) { e.stopPropagation(); document.querySelector('.notification-container').classList.toggle('active'); }
function fazerLogout() { localStorage.clear(); location.reload(); }
function mascaraData(c) { let v = c.value.replace(/\D/g, ""); if (v.length > 2) v = v.substring(0,2) + "/" + v.substring(2); if (v.length > 5) v = v.substring(0,5) + "/" + v.substring(5,10); c.value = v; }
function mascaraMoeda(c) { let v = c.value.replace(/\D/g, ""); if (v === "") return; v = (parseInt(v) / 100).toFixed(2) + ""; v = v.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1."); c.value = "R$ " + v; }
function adicionarProcesso() {
    const e = document.getElementById('input-empresa').value, o = document.getElementById('input-objeto').value, d = document.getElementById('input-data').value, u = localStorage.getItem('fgb_user');
    if (!e || !o || d.length < 10) return alert("Erro!");
    const id = Date.now();
    db.ref('processos/' + id).set({ id: id, dono: u, setorOrigem: dbUsuarios[u].setor, empresa: e, objeto: o, data: d, fase: "", setor: dbUsuarios[u].setor, valor: "", excluido: false });
}
function atualizarCampo(id, c, v) { db.ref('processos/' + id).update({ [c]: v }); }
function moverParaLixeira(id, s) { db.ref('processos/' + id).update({ excluido: s }); }
function transferirProcesso(id, n) { if(n && confirm(`Delegar?`)) db.ref('processos/' + id).update({ dono: n }); }