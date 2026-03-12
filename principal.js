/* ============================================================
   PRINCIPAL.JS — SGH · Sistema de Gestão Hídrica
   
   O que foi adicionado em relação ao original:
   - Conexao com o Supabase (banco de dados)
   - Login verificado antes de carregar a pagina
   - Sensores, medicoes e configuracoes salvos no banco
   - Realtime: atualiza automaticamente quando ESP32 envia dado
   
   O restante (graficos, status, navegacao) nao foi alterado.
   ============================================================ */


// ============================================================
// CONEXAO COM O SUPABASE
// ============================================================
const SUPABASE_URL = 'https://huvohrqgcrgbdqwhgrro.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwfhEgVmZMnnpVJinn8teg_xQmasw0K';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// ============================================================
// DADOS EM MEMÓRIA (igual ao original)
// ============================================================
let sensores  = [];
let medicoes  = [];
let proximoId = 1;

let limites = {
  phMin: 6.5, phMax: 8.5,
  turbMax: 5.0, tempMax: 30.0
};

let graficos = {};

const nomes    = { ph: 'pH', turbidez: 'Turbidez (NTU)', temperatura: 'Temperatura (°C)', nivel: 'Nível (%)' };
const unidades = { ph: '', turbidez: ' NTU', temperatura: '°C', nivel: '%' };


// ============================================================
// VERIFICAR LOGIN
// Se o usuario nao estiver logado, volta para o index.html
// ============================================================
async function verificarLogin() {
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    window.location.href = 'index.html';
    return false;
  }
  // Mostra o email do usuario logado na sidebar
  const email = data.session.user.email;
  const nomeEl = document.getElementById('nome-usuario');
  if (nomeEl) nomeEl.textContent = email.split('@')[0];
  return true;
}


// ============================================================
// NAVEGAÇÃO (igual ao original)
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

    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('ativo'));
    this.classList.add('ativo');

    document.querySelectorAll('.tela').forEach(el => el.classList.remove('ativa'));
    const tela = document.getElementById('sec-' + secao);
    if (tela) tela.classList.add('ativa');

    document.getElementById('titulo-tela').textContent = titulosMenu[secao] || '';
    document.getElementById('sidebar').classList.remove('aberta');

    if (secao === 'historico') renderHistorico();
    if (secao === 'sensores')  renderSensores();
  });
});

document.getElementById('btn-menu').addEventListener('click', function() {
  document.getElementById('sidebar').classList.toggle('aberta');
});

// Botao sair: encerra sessao no Supabase
document.getElementById('btn-sair').addEventListener('click', async function() {
  await sb.auth.signOut();
  window.location.href = 'index.html';
});


// ============================================================
// RELOGIO (igual ao original)
// ============================================================
function atualizarRelogio() {
  const agora = new Date();
  document.getElementById('relogio').textContent =
    agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}


// ============================================================
// SAUDACAO (igual ao original)
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
// STATUS DOS CARDS (igual ao original)
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

const statusConfig = {
  ok:      { texto: 'Normal',  classe: 'status-ok'      },
  atencao: { texto: 'Atenção', classe: 'status-atencao' },
  critico: { texto: 'Critico', classe: 'status-critico' },
};

function atualizarCard(tipo, valor) {
  const s   = avaliarStatus(tipo, valor);
  const cfg = statusConfig[s];

  const card  = document.getElementById('card-' + tipo);
  const badge = document.getElementById('badge-' + tipo);
  if (!card || !badge) return;

  card.classList.remove('status-ok', 'status-atencao', 'status-critico');
  card.classList.add(cfg.classe);
  badge.textContent = cfg.texto;
}

function inicializarCards() {
  const valoresIniciais = { ph: 7.2, turbidez: 4.8, temperatura: 28.5, nivel: 72 };
  Object.entries(valoresIniciais).forEach(([tipo, valor]) => {
    atualizarCard(tipo, valor);
  });
}


// ============================================================
// GRAFICOS (igual ao original)
// ============================================================
function criarGrafico(id, label, cor, dados) {
  const ctx = document.getElementById(id).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: dados.labels,
      datasets: [{
        label, data: dados.valores,
        borderColor: cor, backgroundColor: cor + '18',
        borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
        fill: true, tension: 0.3
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true, animation: false,
      plugins: { legend: { labels: { font: { size: 11, family: 'Inter' }, color: '#5a6278' } } },
      scales: {
        x: { grid: { color: '#eee' }, ticks: { color: '#888', font: { size: 10 } } },
        y: { grid: { color: '#eee' }, ticks: { color: '#888', font: { size: 10 } } }
      }
    }
  });
}

function inicializarGraficos() {
  const labels = ['08:00', '09:00', '10:00', '11:00', '12:00'];

  graficos.ph          = criarGrafico('graf-ph',          'pH',              '#1a4fa0', { labels: [...labels], valores: [7.0, 7.1, 7.2, 7.0, 7.3] });
  graficos.turbidez    = criarGrafico('graf-turbidez',    'Turbidez (NTU)',   '#c68a00', { labels: [...labels], valores: [3.2, 3.8, 4.1, 4.5, 4.8] });
  graficos.temperatura = criarGrafico('graf-temperatura', 'Temperatura (C)',  '#a01a1a', { labels: [...labels], valores: [25.0, 25.5, 26.0, 27.0, 28.5] });
  graficos.nivel       = criarGrafico('graf-nivel',       'Nível (%)',        '#1a7a3a', { labels: [...labels], valores: [70, 71, 72, 71, 72] });
}

function atualizarGrafico(tipo, valor, horaLabel) {
  const g = graficos[tipo];
  if (!g) return;
  g.data.labels.push(horaLabel);
  g.data.datasets[0].data.push(valor);
  if (g.data.labels.length > 20) {
    g.data.labels.shift();
    g.data.datasets[0].data.shift();
  }
  g.update();
}


// ============================================================
// CARREGAR DADOS DO SUPABASE
// Roda uma vez quando a pagina abre
// ============================================================

// Carrega sensores do banco
async function carregarSensores() {
  const { data, error } = await sb.from('sensor').select('*').order('id');
  if (error) { console.error('Erro ao carregar sensores:', error.message); return; }

  sensores = data.map(s => ({
    id:         s.id,
    nome:       s.nome_sensor,
    tipo:       s.tipo_sensor,
    cadastrado: new Date(s.data_cadastro).toLocaleString('pt-BR')
  }));

  renderSensores();
  atualizarSelectSensores();
}

// Carrega as ultimas 100 medicoes do banco
async function carregarMedicoes() {
  const { data, error } = await sb
    .from('medicao')
    .select('*, sensor(nome_sensor)')
    .order('data_hora', { ascending: false })
    .limit(100);

  if (error) { console.error('Erro ao carregar medicoes:', error.message); return; }

  medicoes = data.map(m => ({
    id:         m.id_medicao,
    id_sensor:  m.id_sensor,
    nomeSensor: m.sensor?.nome_sensor || 'Desconhecido',
    tipo:       m.tipo,
    valor:      parseFloat(m.valor),
    data_hora:  new Date(m.data_hora).toLocaleString('pt-BR')
  }));

  // Atualiza os cards com a leitura mais recente de cada tipo
  const ultimas = {};
  medicoes.forEach(m => { if (!ultimas[m.tipo]) ultimas[m.tipo] = m; });
  Object.entries(ultimas).forEach(([tipo, m]) => {
    atualizarCard(tipo, m.valor);
    const valEl = document.getElementById('val-' + tipo);
    if (valEl) valEl.childNodes[0].textContent = m.valor + ' ';
  });

  // Mostra a ultima atualizacao
  if (medicoes.length > 0) {
    const ult = medicoes[0];
    document.getElementById('ultima-atualizacao').textContent =
      'Ultima atualizacao: ' + ult.nomeSensor + ' — ' + nomes[ult.tipo] + ': ' + ult.valor + unidades[ult.tipo] + ' (' + ult.data_hora + ')';
  }
}

// Carrega configuracoes de limites do banco
async function carregarConfiguracoes() {
  const { data } = await sb.from('configuracao').select('*').limit(1).maybeSingle();
  if (!data) return;

  limites = { phMin: data.ph_min, phMax: data.ph_max, turbMax: data.turb_max, tempMax: data.temp_max };

  // Preenche os campos na tela de configuracoes
  document.getElementById('cfg-ph-min')   && (document.getElementById('cfg-ph-min').value   = data.ph_min);
  document.getElementById('cfg-ph-max')   && (document.getElementById('cfg-ph-max').value   = data.ph_max);
  document.getElementById('cfg-turb-max') && (document.getElementById('cfg-turb-max').value = data.turb_max);
  document.getElementById('cfg-temp-max') && (document.getElementById('cfg-temp-max').value = data.temp_max);
}


// ============================================================
// REALTIME — escuta novos dados do ESP32 em tempo real
// Quando o ESP32 enviar um dado novo, a tela atualiza sozinha
// ============================================================
function iniciarRealtime() {
  sb.channel('medicoes_canal')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'medicao' },
      function(payload) {
        const m = payload.new;
        const sensor     = sensores.find(s => s.id === m.id_sensor);
        const nomeSensor = sensor ? sensor.nome : 'ESP32';

        const nova = {
          id:         m.id_medicao,
          id_sensor:  m.id_sensor,
          nomeSensor,
          tipo:       m.tipo,
          valor:      parseFloat(m.valor),
          data_hora:  new Date(m.data_hora).toLocaleString('pt-BR')
        };

        // Adiciona no inicio da lista
        medicoes.unshift(nova);

        // Atualiza grafico, card e ultima atualizacao
        const hora = new Date(m.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        atualizarGrafico(nova.tipo, nova.valor, hora);
        atualizarCard(nova.tipo, nova.valor);

        const valEl = document.getElementById('val-' + nova.tipo);
        if (valEl) valEl.childNodes[0].textContent = nova.valor + ' ';

        document.getElementById('ultima-atualizacao').textContent =
          'Ao vivo (ESP32): ' + nomeSensor + ' — ' + nomes[nova.tipo] + ': ' + nova.valor + unidades[nova.tipo] + ' (' + nova.data_hora + ')';
      }
    )
    .subscribe();
}


// ============================================================
// REGISTRAR LEITURA — salva no Supabase
// ============================================================
async function registrarLeitura() {
  const sensorEl   = document.getElementById('reg-sensor');
  const tipo       = document.getElementById('reg-tipo').value;
  const valorStr   = document.getElementById('reg-valor').value.trim();
  const feedbackEl = document.getElementById('feedback-registro');

  if (!sensorEl.value) {
    exibirFeedback(feedbackEl, 'erro', 'Selecione um sensor antes de registrar.');
    return;
  }
  if (!valorStr) {
    exibirFeedback(feedbackEl, 'erro', 'Informe o valor medido.');
    document.getElementById('reg-valor').focus();
    return;
  }

  const valor = parseFloat(valorStr);

  if (valor < 0) {
    exibirFeedback(feedbackEl, 'erro', 'O valor nao pode ser negativo.');
    return;
  }

  const maximos = { ph: 14, turbidez: 2000, temperatura: 150, nivel: 100 };
  if (valor > maximos[tipo]) {
    exibirFeedback(feedbackEl, 'erro', 'Valor acima do limite maximo aceito.');
    return;
  }

  // Salva no banco de dados
  const { error } = await sb.from('medicao').insert({
    id_sensor: parseInt(sensorEl.value),
    tipo,
    valor,
    data_hora: new Date().toISOString(),
    origem:    'manual'
  });

  if (error) {
    exibirFeedback(feedbackEl, 'erro', 'Erro ao salvar: ' + error.message);
    return;
  }

  // Mostra confirmacao
  const sensor     = sensores.find(s => s.id === parseInt(sensorEl.value));
  const nomeSensor = sensor ? sensor.nome : 'Desconhecido';
  const dataHora   = new Date().toLocaleString('pt-BR');

  document.getElementById('ul-descricao').textContent =
    nomeSensor + ' — ' + nomes[tipo] + ': ' + valor + unidades[tipo];
  document.getElementById('ul-hora').textContent = dataHora;
  document.getElementById('ultima-leitura').style.display = 'block';

  document.getElementById('reg-valor').value = '';
  document.getElementById('reg-valor').focus();
  exibirFeedback(feedbackEl, 'ok', 'Leitura registrada com sucesso!');
}


// ============================================================
// HISTORICO (igual ao original, agora usa dados do banco)
// ============================================================
function renderHistorico() {
  const filtro = document.getElementById('filtro-tipo').value;
  const tbody  = document.getElementById('tbody-historico');
  const lista  = filtro ? medicoes.filter(m => m.tipo === filtro) : medicoes;

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="sem-dados">Nenhuma leitura encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map((m, i) => {
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

async function limparHistorico() {
  if (!confirm('Deseja apagar todo o historico de leituras?')) return;

  const { error } = await sb.from('medicao').delete().neq('id_medicao', 0);
  if (error) { alert('Erro ao limpar: ' + error.message); return; }

  medicoes = [];
  renderHistorico();
  document.getElementById('ultima-atualizacao').textContent = 'Nenhuma leitura registrada ainda.';
  document.getElementById('ultima-leitura').style.display = 'none';
}


// ============================================================
// SENSORES — salva e remove do banco
// ============================================================
async function salvarSensor() {
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

  // Salva no banco
  const { data, error } = await sb.from('sensor').insert({
    nome_sensor:   nome,
    tipo_sensor:   tipo,
    data_cadastro: new Date().toISOString()
  }).select().single();

  if (error) {
    exibirFeedback(feedEl, 'erro', 'Erro ao salvar: ' + error.message);
    return;
  }

  sensores.push({
    id:         data.id,
    nome:       data.nome_sensor,
    tipo:       data.tipo_sensor,
    cadastrado: new Date(data.data_cadastro).toLocaleString('pt-BR')
  });

  document.getElementById('sen-nome').value = '';
  renderSensores();
  atualizarSelectSensores();
  exibirFeedback(feedEl, 'ok', 'Sensor "' + nome + '" salvo com sucesso!');
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
      <td><button class="btn-remover" onclick="removerSensor(${s.id})">Remover</button></td>
    </tr>
  `).join('');
}

async function removerSensor(id) {
  const s = sensores.find(s => s.id === id);
  if (!s || !confirm('Remover o sensor "' + s.nome + '"?')) return;

  const { error } = await sb.from('sensor').delete().eq('id', id);
  if (error) { alert('Erro ao remover: ' + error.message); return; }

  sensores = sensores.filter(s => s.id !== id);
  renderSensores();
  atualizarSelectSensores();
}

function atualizarSelectSensores() {
  const sel = document.getElementById('reg-sensor');
  if (!sel) return;
  sel.innerHTML = sensores.length === 0
    ? '<option value="">Nenhum sensor cadastrado</option>'
    : sensores.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
}


// ============================================================
// CONFIGURACOES — salva no banco
// ============================================================
async function salvarConfig() {
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

  // Upsert: atualiza se ja existe, cria se nao existe
  const { error } = await sb.from('configuracao').upsert({
    id: 1, ph_min: phMin, ph_max: phMax, turb_max: turbMax, temp_max: tempMax,
    atualizado_em: new Date().toISOString()
  });

  if (error) { exibirFeedback(feedEl, 'erro', 'Erro ao salvar: ' + error.message); return; }

  limites = { phMin, phMax, turbMax, tempMax };

  document.getElementById('lim-ph').textContent          = 'Faixa: ' + phMin + ' — ' + phMax;
  document.getElementById('lim-turbidez').textContent    = 'Limite: ate ' + turbMax + ' NTU';
  document.getElementById('lim-temperatura').textContent = 'Limite: ate ' + tempMax + ' °C';

  exibirFeedback(feedEl, 'ok', 'Configuracoes salvas com sucesso!');
}


// ============================================================
// CHATBOT
// ============================================================
function toggleChat() {
  const j = document.getElementById('janela-chat');
  j.style.display = j.style.display === 'none' ? 'block' : 'none';
}


// ============================================================
// AUXILIAR — mostra mensagem de feedback e some em 4s
// ============================================================
function exibirFeedback(el, tipo, msg) {
  el.textContent   = msg;
  el.className     = 'feedback ' + tipo;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}


// ============================================================
// INICIALIZACAO — roda quando a pagina termina de carregar
// ============================================================
document.addEventListener('DOMContentLoaded', async function() {

  // 1. Verifica se o usuario esta logado
  const logado = await verificarLogin();
  if (!logado) return;

  // 2. Monta a interface
  exibirSaudacao();
  inicializarCards();
  inicializarGraficos();
  atualizarRelogio();
  setInterval(atualizarRelogio, 1000);
  setInterval(exibirSaudacao, 60000);

  // 3. Carrega dados do banco de dados
  await carregarConfiguracoes();
  await carregarSensores();
  await carregarMedicoes();

  // 4. Liga o realtime para receber dados do ESP32 ao vivo
  iniciarRealtime();
});