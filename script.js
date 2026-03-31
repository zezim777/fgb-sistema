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

// VARIÁVEIS DA NOTIFICAÇÃO REAL-TIME
let listaNotificacoesGlobais = [];
let ultimaNotifLida = localStorage.getItem('ultima_notif_lida') || 0;

// --- GATILHOS INICIAIS (BLINDAGEM PARA IPHONE/SAFARI) ---
document.addEventListener('DOMContentLoaded', () => {
    
    const regSetor = document.getElementById('reg-setor');
    if (regSetor) {
        setoresFGB.forEach(s => { 
            const novaOpcao = new Option(s, s);
            regSetor.add(novaOpcao); 
        });
    }

    if (localStorage.getItem('fgb_tema') === 'dark') {
        document.body.classList.add('dark-mode');
        const btnModalTema = document.getElementById('btn-modal-tema');
        if (btnModalTema) btnModalTema.innerText = '☀️ Ativar Modo Claro';
    }

    if (localStorage.getItem('fgb_logado') === 'true') {
        abrirPainelCompleto();
    }
});


// --- LÓGICA DO MODO NOTURNO E PERSONALIZAÇÃO ---
function alternarTema() {
    document.body.classList.toggle('dark-mode');
    const modoEscuroAtivo = document.body.classList.contains('dark-mode');
    localStorage.setItem('fgb_tema', modoEscuroAtivo ? 'dark' : 'light');
    
    const btnModalTema = document.getElementById('btn-modal-tema');
    if (btnModalTema) {
        btnModalTema.innerText = modoEscuroAtivo ? '☀️ Ativar Modo Claro' : '🌙 Ativar Modo Escuro';
    }
}

function abrirModalPersonalizar() {
    document.querySelector('.user-menu-container').classList.remove('active');
    document.getElementById('modal-personalizar').style.display = 'flex';
}
function fecharModalPersonalizar() { document.getElementById('modal-personalizar').style.display = 'none'; }

function toggleSenha(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === "password") {
        input.type = "text";
        btn.innerText = "OCULTAR"; 
    } else {
        input.type = "password";
        btn.innerText = "VER";
    }
}

function toggleMenuUsuario(event) {
    event.stopPropagation(); 
    document.querySelector('.notification-container').classList.remove('active');
    document.querySelector('.user-menu-container').classList.toggle('active');
}

function toggleNotificacoes(event) {
    event.stopPropagation(); 
    document.querySelector('.user-menu-container').classList.remove('active');
    const notifCont = document.querySelector('.notification-container');
    notifCont.classList.toggle('active');
    if(notifCont.classList.contains('active')) lerNotificacoes();
}

window.onclick = function(event) {
    const menuCont = document.querySelector('.user-menu-container');
    const notifCont = document.querySelector('.notification-container');
    
    if (menuCont && !menuCont.contains(event.target)) menuCont.classList.remove('active');
    if (notifCont && !notifCont.contains(event.target)) notifCont.classList.remove('active');
};

// --- FUNÇÕES DE TRANSMISSÃO GLOBAL (ADMIN) ---
function abrirModalAdminNotif() { document.getElementById('modal-admin-notif').style.display = 'flex'; }

function fecharModalAdminNotif() {
    document.getElementById('modal-admin-notif').style.display = 'none';
    document.getElementById('texto-admin-notif').value = '';
}

function enviarNotificacaoGlobal() {
    const texto = document.getElementById('texto-admin-notif').value.trim();
    if (!texto) return alert("Digite o aviso oficial antes de enviar!");

    const idMsg = Date.now();
    const dataEnvio = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR');

    db.ref('notificacoes_globais/' + idMsg).set({ id: idMsg, msg: texto, data: dataEnvio })
    .then(() => { 
        alert("📢 Aviso transmitido em tempo real para toda a fundação!"); 
        fecharModalAdminNotif(); 
    })
    .catch(e => alert("Erro ao transmitir: " + e.message));
}

function deletarNotificacaoGlobal(idMsg) {
    if(confirm("Tem certeza que deseja APAGAR este aviso para toda a equipe? Ele sumirá da tela de todos instantaneamente.")) {
        db.ref('notificacoes_globais/' + idMsg).remove();
    }
}

function renderizarNotificacoes() {
    const listaDiv = document.getElementById('notif-list');
    const badge = document.getElementById('notif-badge');
    const emoji = document.getElementById('bell-emoji');
    const usuarioAtual = localStorage.getItem('fgb_user');
    
    if(!listaDiv) return;

    listaDiv.innerHTML = '';
    let numNaoLidas = 0;
    let maiorIdNotificacao = 0;

    if(listaNotificacoesGlobais.length === 0) {
        listaDiv.innerHTML = '<div class="notif-item empty">Nenhuma notificação oficial no momento.</div>';
        badge.style.display = 'none';
        return;
    }

    listaNotificacoesGlobais.sort((a,b) => b.id - a.id).forEach(notif => {
        if(notif.id > maiorIdNotificacao) maiorIdNotificacao = notif.id;
        if(notif.id > ultimaNotifLida) numNaoLidas++;
        
        let btnExcluir = '';
        if(usuarioAtual === 'joseeminem') {
            btnExcluir = `<button class="btn-excluir-notif" onclick="deletarNotificacaoGlobal(${notif.id})" title="Apagar aviso globalmente">✖</button>`;
        }
        
        listaDiv.innerHTML += `
            <div class="notif-item">
                ${btnExcluir}
                <strong style="color: var(--danger);">📢 FGB Cloud Informa:</strong><br>
                ${notif.msg}<br>
                <span style="font-size:0.7rem; color:#95a5a6; display:block; margin-top:3px;">Recebido em: ${notif.data}</span>
            </div>
        `;
    });

    if(numNaoLidas > 0) {
        if(badge.innerText != numNaoLidas) {
            emoji.classList.remove('ringing');
            void emoji.offsetWidth; 
            emoji.classList.add('ringing');
        }
        badge.innerText = numNaoLidas;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function lerNotificacoes() {
    if(listaNotificacoesGlobais.length > 0) {
        let maiorIdNotificacao = Math.max(...listaNotificacoesGlobais.map(n => n.id));
        localStorage.setItem('ultima_notif_lida', maiorIdNotificacao);
        ultimaNotifLida = maiorIdNotificacao;
        document.getElementById('notif-badge').style.display = 'none';
    }
}

function abrirModalSugestao() { document.getElementById('modal-sugestao').style.display = 'flex'; }
function fecharModalSugestao() { document.getElementById('modal-sugestao').style.display = 'none'; document.getElementById('texto-sugestao').value = ''; }

function enviarSugestao() {
    const texto = document.getElementById('texto-sugestao').value.trim();
    if (!texto) return alert("Escreva algo antes de enviar!");

    const usuarioAtual = localStorage.getItem('fgb_user') || 'Usuário Não Logado';
    const idSugestao = Date.now();
    const dataEnvio = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR');

    db.ref('sugestoes/' + idSugestao).set({ id: idSugestao, usuario: usuarioAtual, mensagem: texto, data: dataEnvio })
    .then(() => { alert("✅ Sua sugestão foi enviada com sucesso! Muito obrigado."); fecharModalSugestao(); })
    .catch(e => alert("Erro ao enviar: " + e.message));
}

function alternarTela(id) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('cadastro-screen').classList.add('hidden');
    document.getElementById('recuperar-screen').classList.add('hidden');
    document.getElementById(id).classList.remove('hidden');
}

function alterarSenha() {
    const u = document.getElementById('rec-user').value.toLowerCase().trim();
    const k = document.getElementById('rec-keyword').value.trim();
    const novaSenha = document.getElementById('rec-pass').value;

    if (!u || !k || !novaSenha) return alert("Preencha o Usuário, Palavra-Chave e a Nova Senha!");

    db.ref('usuarios/' + u).once('value', snap => {
        if (snap.exists()) {
            const userData = snap.val();
            if (userData.palavraChave && userData.palavraChave.toLowerCase() === k.toLowerCase()) {
                db.ref('usuarios/' + u).update({ senha: novaSenha }).then(() => {
                    alert("✅ Senha alterada com sucesso! Faça seu login.");
                    document.getElementById('rec-user').value = '';
                    document.getElementById('rec-keyword').value = '';
                    document.getElementById('rec-pass').value = '';
                    alternarTela('login-screen');
                });
            } else {
                alert("❌ Palavra-Chave incorreta. A senha não foi alterada por segurança.");
            }
        } else {
            alert("❌ Usuário não encontrado no sistema.");
        }
    });
}

function cadastrarUsuario() {
    const u = document.getElementById('reg-user').value.toLowerCase().trim();
    const p = document.getElementById('reg-pass').value;
    const k = document.getElementById('reg-keyword').value.trim();
    const s = document.getElementById('reg-setor').value;
    const n = document.getElementById('reg-nivel').value;
    const btn = document.getElementById('btn-cadastrar');

    if (!u || !p || !k || !s) return alert("Preencha Usuário, Senha, Palavra-Chave e selecione o Setor!");

    const caracteresInvalidos = /[.#$\[\]\/\s]/;
    if (caracteresInvalidos.test(u)) return alert("ERRO: O nome de usuário não pode conter pontos, espaços ou símbolos.");

    btn.innerText = "VERIFICANDO...";
    btn.disabled = true;

    db.ref('usuarios').once('value', snapshot => {
        let coordenadorJaExiste = false;
        if (n === "Coordenador" && snapshot.exists()) {
            snapshot.forEach(child => {
                const userDb = child.val();
                if (userDb.nivel === "Coordenador" && userDb.setor === s) coordenadorJaExiste = true;
            });
        }

        if (coordenadorJaExiste) {
            btn.innerText = "SALVAR E ENTRAR";
            btn.disabled = false;
            return alert(`❌ ERRO: Já existe um Coordenador cadastrado para o setor selecionado (${s}).`);
        }

        db.ref('usuarios/' + u).set({ usuario: u, senha: p, setor: s, nivel: n, palavraChave: k })
        .then(() => {
            alert("✅ Cadastro realizado com sucesso! Faça seu login.");
            btn.innerText = "SALVAR E ENTRAR";
            btn.disabled = false;
            alternarTela('login-screen');
        })
        .catch(error => {
            btn.innerText = "SALVAR E ENTRAR";
            btn.disabled = false;
            alert("❌ ERRO DO SERVIDOR: " + error.message);
        });
    });
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
            localStorage.setItem('fgb_setor', d.setor || ""); 
            localStorage.setItem('fgb_nivel', d.nivel || "Operador"); 
            abrirPainelCompleto();
        } else {
            alert("Usuário ou senha incorretos!");
        }
    });
}

function fazerLogout(porInatividade = false) { 
    if(porInatividade) alert("⏱️ Sua sessão expirou.");
    localStorage.clear(); 
    location.reload(); 
}

function resetarTimerInatividade() {
    clearTimeout(temporizadorInatividade);
    temporizadorInatividade = setTimeout(() => fazerLogout(true), 3600000); 
}

function iniciarMonitoramento() {
    document.onmousemove = resetarTimerInatividade;
    document.onkeypress = resetarTimerInatividade;
    document.onclick = resetarTimerInatividade;
    resetarTimerInatividade(); 
}

function abrirPainelCompleto() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('cadastro-screen').classList.add('hidden');
    document.getElementById('recuperar-screen').classList.add('hidden');
    document.getElementById('main-system').style.display = 'block';
    document.body.style.justifyContent = 'flex-start';
    iniciarMonitoramento(); 
    iniciarLeituraDeDados(); 
}

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
    const emp = document.getElementById('input-empresa').value;
    const obj = document.getElementById('input-objeto').value;
    const dat = document.getElementById('input-data').value;
    const usuarioAtual = localStorage.getItem('fgb_user'); 
    const meuPerfil = dbUsuarios[usuarioAtual] || {};
    if (!emp || !obj || dat.length < 10) return alert("Preencha todos os campos!");
    
    const novoId = Date.now();
    db.ref('processos/' + novoId).set({
        id: novoId, dono: usuarioAtual, setorOrigem: meuPerfil.setor || "", 
        empresa: emp, objeto: obj, data: dat, fase: "", setor: meuPerfil.setor || "", valor: "", excluido: false
    });
    document.getElementById('input-empresa').value = ''; 
    document.getElementById('input-objeto').value = ''; 
    document.getElementById('input-data').value = '';
}

function atualizarCampo(id, campo, valor) { db.ref('processos/' + id).update({ [campo]: valor }); }
function moverParaLixeira(id, estado) { db.ref('processos/' + id).update({ excluido: estado }); }
function transferirProcesso(id, novoDono) {
    if(novoDono === "") return;
    if(confirm(`Delegar processo para '${novoDono.toUpperCase()}'?`)) db.ref('processos/' + id).update({ dono: novoDono });
}

function limparLixeiraPermanente() {
    const usuarioAtual = localStorage.getItem('fgb_user');
    const meuSetor = dbUsuarios[usuarioAtual].setor || "";
    if(confirm("Apagar permanentemente a lixeira do setor?")) {
        db.ref('processos').once('value', snapshot => {
            snapshot.forEach(child => {
                const p = child.val();
                if(p.excluido && (p.setor === meuSetor)) child.ref.remove();
            });
        });
    }
}

function filtrarProcessos() {
    const termo = document.getElementById('input-pesquisa').value.toLowerCase();
    const cards = document.querySelectorAll('.processo-card');
    cards.forEach(card => card.style.display = card.innerText.toLowerCase().includes(termo) ? 'block' : 'none');
}

function iniciarLeituraDeDados() {
    db.ref('usuarios').on('value', snap => {
        dbUsuarios = snap.val() || {};
        if (dbProcessos !== null) renderizarTela(); 
    });
    db.ref('processos').on('value', snap => {
        dbProcessos = snap.val();
        renderizarTela(); 
    });
    db.ref('notificacoes_globais').on('value', snap => {
        const d = snap.val();
        listaNotificacoesGlobais = d ? Object.values(d) : [];
        renderizarNotificacoes();
    });
}

function renderizarTela() {
    const usuarioAtual = localStorage.getItem('fgb_user'); 
    const meuPerfil = dbUsuarios[usuarioAtual] || {};
    const meuSetor = (meuPerfil.setor || "").trim();
    const meuNivel = meuPerfil.nivel || "Operador";

    const displayUser = document.getElementById('user-display');
    if (displayUser) displayUser.innerText = `Painel de ${meuNivel}: ${usuarioAtual.toUpperCase()} | 🏢 ${meuSetor.split(' -')[0]}`;

    if (usuarioAtual === 'joseeminem') document.getElementById('admin-container').classList.add('visible');

    const dashSetor = document.getElementById('dash-setor');
    const btnReport = document.getElementById('btn-report');
    const btnLimparLixeira = document.getElementById('btn-limpar-lixeira');

    if (meuNivel === 'Coordenador') {
        dashSetor.classList.remove('hidden');
        btnReport.classList.remove('hidden');
        btnLimparLixeira.classList.remove('hidden');
    }

    const ativosDiv = document.getElementById('lista-ativos');
    const lixeiraDiv = document.getElementById('lista-lixeira');
    ativosDiv.innerHTML = ''; lixeiraDiv.innerHTML = '';
    
    if (!dbProcessos) { ativosDiv.innerHTML = '<p>Nenhum processo encontrado.</p>'; return; }

    let totalSetor = 0, valorTotal = 0, fasesCount = {};

    Object.values(dbProcessos).reverse().forEach(p => {
        const donoDoProcesso = p.dono;
        const perfilDoDono = dbUsuarios[donoDoProcesso] || {};
        const setorDono = (perfilDoDono.setor || p.setorOrigem || "").trim();

        let temPermissao = (donoDoProcesso === usuarioAtual || (meuNivel === 'Coordenador' && (setorDono === meuSetor || p.setor === meuSetor)));
        if (!temPermissao) return;

        if (!p.excluido && (setorDono === meuSetor || p.setor === meuSetor)) {
            totalSetor++;
            if (p.valor) valorTotal += parseFloat(p.valor.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
            if (p.fase) fasesCount[p.fase] = (fasesCount[p.fase] || 0) + 1;
        }
        
        const selectFase = `<option value="" disabled ${!p.fase ? 'selected' : ''}>Fase...</option>` + fasesPadrao.map(f => `<option value="${f}" ${p.fase === f ? 'selected' : ''}>${f}</option>`).join('');
        const selectSetor = `<option value="" disabled ${!p.setor ? 'selected' : ''}>Setor...</option>` + setoresFGB.map(s => `<option value="${s}" ${p.setor === s ? 'selected' : ''}>${s}</option>`).join('');
        
        // --- LÓGICA DE DELEGAÇÃO CORRIGIDA ---
        let transferHTML = '';
        if (meuNivel === 'Coordenador' && !p.excluido) {
            let options = `<option value="" selected disabled>Transferir para Operador...</option>`;
            Object.keys(dbUsuarios).forEach(uKey => {
                const u = dbUsuarios[uKey];
                // Regra: Mesmo setor && NÃO ser o dono atual && Ser nível OPERADOR
                if (u.setor.trim() === meuSetor && uKey !== donoDoProcesso && u.nivel === "Operador") {
                    options += `<option value="${uKey}">${uKey.toUpperCase()}</option>`;
                }
            });
            transferHTML = `<div style="margin-top:10px;border-top:1px dashed #ddd;padding-top:5px;"><span style="font-size:0.8rem;color:#7f8c8d;font-weight:bold;">🔄 Delegar para:</span><select onchange="transferirProcesso(${p.id}, this.value)" style="width:100%;margin-top:5px;border:1px solid #ddd;">${options}</select></div>`;
        }
        
        const htmlCard = `
            <div class="processo-card ${p.excluido ? 'na-lixeira' : ''}">
                <button class="btn-excluir" onclick="moverParaLixeira(${p.id}, ${!p.excluido})">${p.excluido ? '↺' : '✖'}</button>
                <div class="empresa">${p.empresa}</div>
                <div class="objeto">${p.objeto}</div>
                ${donoDoProcesso !== usuarioAtual ? `<span class="autor-badge">Por: ${donoDoProcesso.toUpperCase()}</span>` : ''}
                <div class="tag-box status-box">📍 Fase: <select onchange="atualizarCampo(${p.id}, 'fase', this.value)">${selectFase}</select></div>
                <div class="tag-box setor-box">🏢 Setor: <select onchange="atualizarCampo(${p.id}, 'setor', this.value)">${selectSetor}</select></div>
                <div class="detalhes">
                    <span>📅 Data:</span><input type="text" class="input-card" value="${p.data}" onchange="atualizarCampo(${p.id}, 'data', this.value)">
                    <span>💰 Valor:</span><input type="text" class="input-card" value="${p.valor}" placeholder="R$ 0,00" onkeyup="mascaraMoeda(this)" onchange="atualizarCampo(${p.id}, 'valor', this.value)">
                </div>
                ${transferHTML}
            </div>`;
        if (p.excluido) lixeiraDiv.innerHTML += htmlCard; else ativosDiv.innerHTML += htmlCard;
    });

    if (meuNivel === 'Coordenador') {
        document.getElementById('stat-total').innerText = totalSetor;
        document.getElementById('stat-valor').innerText = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        let max = 0, f = "-";
        for (const key in fasesCount) { if (fasesCount[key] > max) { max = fasesCount[key]; f = key; } }
        document.getElementById('stat-fase').innerText = f;
    }
    filtrarProcessos();
}