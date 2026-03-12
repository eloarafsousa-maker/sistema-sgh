/* ============================================================
   PRINCIPAL.JS — SGH · Sistema de Gestão Hídrica
   ============================================================ */


// ============================================================
// DADOS EM MEMÓRIA (substituídos por MySQL futuramente)
// ============================================================

let sensores = [
  { id: 1, nome: 'Sensor 1 - Entrada',  tipo: 'ph',          cadastrado: '10/01/2025 08:00' },
  { id: 2, nome: 'Sensor 2 - Saida',    tipo: 'turbidez',    cadastrado: '10/01/2025 08:05' },
  { id: 3, nome: 'Sensor 3 - Reserva',  tipo: 'temperatura', cadastrado: '10/01/2025 08:10' },
];

let proximoId = 4;
let medicoes  = [];

// Limites de alerta — editáveis em Configurações
let limites = {
  phMin: 6.5, phMax: 8.5,
  turbMax: 5.0, tempMax: 30.0
};

// Referências aos gráficos Chart.js
let graficos = {};

// Nomes legíveis para exibição
const nomes = {
  ph:          'pH',
  turbidez:    'Turbidez (NTU)',
  temperatura: 'Temperatura (°C)',
  nivel:       'Nível (%)'
};

// Unidades por tipo
const unidades = { ph: '', turbidez: ' NTU', temperatura: '°C', nivel: '%' };


// ============================================================
// NAVEGAÇÃO
// ============================================================

const titulosMenu = {
  status:    'Status Geral',
  registrar: 'Registrar Leitura',
  graficos:  'Gráficos',
  historico: 'Histórico',
  sensores:  'Sensores',
  config:    'Configurações'
};

document.querySelectorAll('.menu-item').forEach(function(item) {
  item.addEventListener('click', function() {
    const secao = this.getAttribute('data-secao');

    // Atualiza item ativo
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('ativo'));
    this.classList.add('ativo');

    // Troca a tela visível
    document.querySelectorAll('.tela').forEach(el => el.classList.remove('ativa'));
    const tela = document.getElementById('sec-' + secao);
    if (tela) tela.classList.add('ativa');

    // Atualiza título no topbar
    document.getElementById('titulo-tela').textContent = titulosMenu[secao] || '';

    // Fecha sidebar no mobile
    document.getElementById('sidebar').classList.remove('aberta');

    // Atualiza tabelas ao entrar nelas
    if (secao === 'historico') renderHistorico();
    if (secao === 'sensores')  renderSensores();
  });
});

// Botão menu mobile
document.getElementById('btn-menu').addEventListener('click', function() {
  document.getElementById('sidebar').classList.toggle('aberta');
});


// ============================================================
// RELÓGIO EM TEMPO REAL
// ============================================================

function atualizarRelogio() {
  const agora = new Date();
  document.getElementById('relogio').textContent =
    agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}


// ============================================================
// SAUDAÇÃO POR HORÁRIO
// ============================================================

function exibirSaudacao() {
  const hora = new Date().getHours();
  let texto;

  if      (hora >= 5  && hora < 12) texto = 'Bom dia.';
  else if (hora >= 12 && hora < 18) texto = 'Boa tarde.';
  else                               texto = 'Boa noite.';

  document.getElementById('saudacao').textContent = texto + ' Bem-vindo ao SGH.';

  document.getElementById('data-hoje').textContent =
    new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
}


// ============================================================
// STATUS DOS CARDS — avalia o status e aplica a cor certa
// ============================================================

function avaliarStatus(tipo, valor) {
  if (tipo === 'ph') {
    if (valor < limites.phMin || valor > limites.phMax) return 'critico';
    if (valor < limites.phMin + 0.3 || valor > limites.phMax - 0.3) return 'atencao';
  }
  if (tipo === 'turbidez') {
    if (valor > limites.turbMax) return 'critico';
    if (valor > limites.turbMax * 0.8) return 'atencao';
  }
  if (tipo === 'temperatura') {
    if (valor > limites.tempMax) return 'critico';
    if (valor > limites.tempMax * 0.9) return 'atencao';
  }
  if (tipo === 'nivel') {
    if (valor < 20) return 'critico';
    if (valor < 35) return 'atencao';
  }
  return 'ok';
}

// Textos e classes CSS por status
const statusConfig = {
  ok:      { texto: 'Normal',  classe: 'status-ok',      badgeTxt: 'Normal'  },
  atencao: { texto: 'Atenção', classe: 'status-atencao', badgeTxt: 'Atencao' },
  critico: { texto: 'Critico', classe: 'status-critico', badgeTxt: 'Critico' },
};

// Atualiza o card de status de um parâmetro
function atualizarCard(tipo, valor) {
  const s = avaliarStatus(tipo, valor);
  const cfg = statusConfig[s];

  const card  = document.getElementById('card-' + tipo);
  const badge = document.getElementById('badge-' + tipo);

  if (!card || !badge) return;

  // Remove classes de status antigas
  card.classList.remove('status-ok', 'status-atencao', 'status-critico');
  card.classList.add(cfg.classe);

  badge.textContent = cfg.badgeTxt;
  badge.style.background = '';
  badge.style.color      = '';
}

// Inicializa os cards com os valores padrão
function inicializarCards() {
  const valoresIniciais = { ph: 7.2, turbidez: 4.8, temperatura: 28.5, nivel: 72 };
  Object.entries(valoresIniciais).forEach(([tipo, valor]) => {
    atualizarCard(tipo, valor);
    // Marca como "ok" por padrão
    document.getElementById('card-' + tipo).classList.add('status-ok');
  });
}


// ============================================================
// GRÁFICOS
// ============================================================

function criarGrafico(id, label, cor, dados) {
  const ctx = document.getElementById(id).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: dados.labels,
      datasets: [{
        label:           label,
        data:            dados.valores,
        borderColor:     cor,
        backgroundColor: cor + '18',
        borderWidth:     2,
        pointRadius:     3,
        pointHoverRadius: 5,
        fill:            true,
        tension:         0.3
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      animation:           false,
      plugins: {
        legend: {
          labels: { font: { size: 11, family: 'Inter' }, color: '#5a6278' }
        }
      },
      scales: {
        x: { grid: { color: '#eee' }, ticks: { color: '#888', font: { size: 10 } } },
        y: { grid: { color: '#eee' }, ticks: { color: '#888', font: { size: 10 } } }
      }
    }
  });
}

function inicializarGraficos() {
  const labels = ['08:00', '09:00', '10:00', '11:00', '12:00'];

  graficos.ph = criarGrafico('graf-ph', 'pH', '#1a4fa0',
    { labels: [...labels], valores: [7.0, 7.1, 7.2, 7.0, 7.3] });

  graficos.turbidez = criarGrafico('graf-turbidez', 'Turbidez (NTU)', '#c68a00',
    { labels: [...labels], valores: [3.2, 3.8, 4.1, 4.5, 4.8] });

  graficos.temperatura = criarGrafico('graf-temperatura', 'Temperatura (C)', '#a01a1a',
    { labels: [...labels], valores: [25.0, 25.5, 26.0, 27.0, 28.5] });

  graficos.nivel = criarGrafico('graf-nivel', 'Nível (%)', '#1a7a3a',
    { labels: [...labels], valores: [70, 71, 72, 71, 72] });
}

// Adiciona ponto ao gráfico
function atualizarGrafico(tipo, valor, horaLabel) {
  const g = graficos[tipo];
  if (!g) return;
  g.data.labels.push(horaLabel);
  g.data.datasets[0].data.push(valor);
  // Mantém no máximo 20 pontos para não poluir
  if (g.data.labels.length > 20) {
    g.data.labels.shift();
    g.data.datasets[0].data.shift();
  }
  g.update();
}


// ============================================================
// REGISTRAR LEITURA — fluxo principal de uso do operador
// ============================================================

function registrarLeitura() {
  const sensorEl  = document.getElementById('reg-sensor');
  const tipo      = document.getElementById('reg-tipo').value;
  const valorStr  = document.getElementById('reg-valor').value.trim();
  const feedbackEl = document.getElementById('feedback-registro');

  // Validação: sensor selecionado
  if (!sensorEl.value) {
    exibirFeedback(feedbackEl, 'erro', 'Selecione um sensor antes de registrar.');
    return;
  }

  // Validação: valor informado
  if (!valorStr) {
    exibirFeedback(feedbackEl, 'erro', 'Informe o valor medido.');
    document.getElementById('reg-valor').focus();
    return;
  }

  const valor = parseFloat(valorStr);

  // Regra: sem negativos
  if (valor < 0) {
    exibirFeedback(feedbackEl, 'erro', 'O valor nao pode ser negativo.');
    return;
  }

  // Regra: limites por tipo
  const maximos = { ph: 14, turbidez: 2000, temperatura: 150, nivel: 100 };
  if (valor > maximos[tipo]) {
    exibirFeedback(feedbackEl, 'erro', 'Valor acima do limite maximo aceito.');
    return;
  }

  // Tudo certo — registra
  const agora      = new Date();
  const horaLabel  = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dataHora   = agora.toLocaleString('pt-BR');
  const sensorId   = parseInt(sensorEl.value);
  const sensor     = sensores.find(s => s.id === sensorId);
  const nomeSensor = sensor ? sensor.nome : 'Desconhecido';

  // Estrutura compatível com a tabela MySQL "medicoes"
  medicoes.push({ id: medicoes.length + 1, id_sensor: sensorId, nomeSensor, tipo, valor, data_hora: dataHora });

  // Atualiza gráfico
  atualizarGrafico(tipo, valor, horaLabel);

  // Atualiza painel de status
  const valEl = document.getElementById('val-' + tipo);
  if (valEl) {
    const small = valEl.querySelector('small');
    valEl.childNodes[0].textContent = valor + ' ';
    atualizarCard(tipo, valor);
  }

  // Atualiza texto de última leitura
  document.getElementById('ultima-atualizacao').textContent =
    'Ultima atualizacao: ' + nomeSensor + ' — ' + nomes[tipo] + ': ' + valor + unidades[tipo] + ' (' + dataHora + ')';

  // Mostra card de confirmação
  document.getElementById('ul-descricao').textContent =
    nomeSensor + ' — ' + nomes[tipo] + ': ' + valor + unidades[tipo];
  document.getElementById('ul-hora').textContent = dataHora;
  document.getElementById('ultima-leitura').style.display = 'block';

  // Limpa campo
  document.getElementById('reg-valor').value = '';
  document.getElementById('reg-valor').focus();

  exibirFeedback(feedbackEl, 'ok', 'Leitura registrada com sucesso.');
}


// ============================================================
// HISTÓRICO
// ============================================================

function renderHistorico() {
  const filtro = document.getElementById('filtro-tipo').value;
  const tbody  = document.getElementById('tbody-historico');
  const lista  = filtro ? medicoes.filter(m => m.tipo === filtro) : medicoes;

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="sem-dados">Nenhuma leitura encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = [...lista].reverse().map((m, i) => {
    const s = avaliarStatus(m.tipo, m.valor);
    const badgeMap = {
      ok:      '<span class="badge-ok">Normal</span>',
      atencao: '<span class="badge-av">Atencao</span>',
      critico: '<span class="badge-cr">Critico</span>'
    };
    return `
      <tr>
        <td>${lista.length - i}</td>
        <td>${m.nomeSensor}</td>
        <td>${nomes[m.tipo] || m.tipo}</td>
        <td><strong>${m.valor}${unidades[m.tipo]}</strong></td>
        <td>${badgeMap[s]}</td>
        <td>${m.data_hora}</td>
      </tr>
    `;
  }).join('');
}

function limparHistorico() {
  if (confirm('Deseja apagar todo o historico de leituras?')) {
    medicoes = [];
    renderHistorico();
    document.getElementById('ultima-atualizacao').textContent =
      'Nenhuma leitura registrada ainda.';
    document.getElementById('ultima-leitura').style.display = 'none';
  }
}


// ============================================================
// SENSORES
// ============================================================

function salvarSensor() {
  const nome   = document.getElementById('sen-nome').value.trim();
  const tipo   = document.getElementById('sen-tipo').value;
  const feedEl = document.getElementById('feedback-sensor');

  if (!nome) {
    exibirFeedback(feedEl, 'erro', 'Informe o nome do sensor.');
    document.getElementById('sen-nome').focus();
    return;
  }
  if (nome.length < 3) {
    exibirFeedback(feedEl, 'erro', 'O nome deve ter pelo menos 3 caracteres.');
    return;
  }

  sensores.push({ id: proximoId++, nome, tipo, cadastrado: new Date().toLocaleString('pt-BR') });
  document.getElementById('sen-nome').value = '';
  renderSensores();
  atualizarSelectSensores();
  exibirFeedback(feedEl, 'ok', 'Sensor "' + nome + '" salvo com sucesso.');
}

function renderSensores() {
  const tbody = document.getElementById('tbody-sensores');
  if (sensores.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="sem-dados">Nenhum sensor cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = sensores.map(s => `
    <tr>
      <td>${s.id}</td>
      <td>${s.nome}</td>
      <td>${nomes[s.tipo] || s.tipo}</td>
      <td>${s.cadastrado}</td>
      <td>
        <button class="btn-remover" onclick="removerSensor(${s.id})">Remover</button>
      </td>
    </tr>
  `).join('');
}

function removerSensor(id) {
  const s = sensores.find(s => s.id === id);
  if (!s) return;
  if (confirm('Remover o sensor "' + s.nome + '"?')) {
    sensores = sensores.filter(s => s.id !== id);
    renderSensores();
    atualizarSelectSensores();
  }
}

function atualizarSelectSensores() {
  const sel = document.getElementById('reg-sensor');
  if (!sel) return;
  sel.innerHTML = sensores.length === 0
    ? '<option value="">Nenhum sensor cadastrado</option>'
    : sensores.map(s =>
        `<option value="${s.id}">${s.nome}</option>`
      ).join('');
}


// ============================================================
// CONFIGURAÇÕES
// ============================================================

function salvarConfig() {
  const feedEl  = document.getElementById('feedback-config');
  const phMin   = parseFloat(document.getElementById('cfg-ph-min').value);
  const phMax   = parseFloat(document.getElementById('cfg-ph-max').value);
  const turbMax = parseFloat(document.getElementById('cfg-turb-max').value);
  const tempMax = parseFloat(document.getElementById('cfg-temp-max').value);

  if (isNaN(phMin) || isNaN(phMax) || isNaN(turbMax) || isNaN(tempMax)) {
    exibirFeedback(feedEl, 'erro', 'Preencha todos os campos corretamente.');
    return;
  }
  if (phMin >= phMax) {
    exibirFeedback(feedEl, 'erro', 'O pH minimo deve ser menor que o pH maximo.');
    return;
  }

  limites = { phMin, phMax, turbMax, tempMax };

  // Atualiza os textos de faixa nos cards de status
  document.getElementById('lim-ph').textContent       = 'Faixa: ' + phMin + ' — ' + phMax;
  document.getElementById('lim-turbidez').textContent = 'Limite: ate ' + turbMax + ' NTU';
  document.getElementById('lim-temperatura').textContent = 'Limite: ate ' + tempMax + ' °C';

  exibirFeedback(feedEl, 'ok', 'Configuracoes salvas com sucesso.');
}


// ============================================================
// CHATBOT
// ============================================================

function toggleChat() {
  const j = document.getElementById('janela-chat');
  j.style.display = j.style.display === 'none' ? 'block' : 'none';
}


// ============================================================
// AUXILIAR: exibe mensagem de feedback e some em 4s
// ============================================================

function exibirFeedback(el, tipo, msg) {
  el.textContent  = msg;
  el.className    = 'feedback ' + tipo;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}


// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  exibirSaudacao();
  inicializarCards();
  inicializarGraficos();
  atualizarSelectSensores();
  renderSensores();

  // Relógio atualiza a cada segundo
  atualizarRelogio();
  setInterval(atualizarRelogio, 1000);

  // Saudação atualiza a cada minuto
  setInterval(exibirSaudacao, 60000);
});
