/**
 * i18n.js — Paquetes de idioma del agente.
 *
 * El español vive en skill.js (el original). Aquí se añaden los demás con la
 * MISMA forma, para que el motor y la voz no noten la diferencia: cada paquete
 * trae sus propios patrones de detección (regex) porque "automatizar todo" y
 * "automate everything" no se parecen en nada.
 *
 * Para añadir un idioma: copia el bloque `en`, traduce, y regístralo en PACKS
 * y en IDIOMAS (el selector de la interfaz).
 */
import { SKILL as es } from './skill.js';

const en = {
  codigo: 'en', stt: 'en-US', voz: 'en-US', etiqueta: 'EN',
  identidad: { ...es.identidad, nombre: 'Nexa', empresa: 'SINAPTIA' },
  saludoVoz: "Hi, I'm Nexa. Tell me in one sentence what you need and I'll take you straight there.",

  saludo: {
    ciudadFallback: 'your city',
    plantilla:
      '{saludo}. In {ciudad}, AI can already work for your business.\n\n' +
      'Right where you are it can analyze your competition, give you marketing analysis and ideas, ' +
      'build offers for the local market —or tailored to events in your area— and optimize your ' +
      'local logistics: routes, deliveries and demand.\n\n' +
      "I'm {nombre}, {empresa}'s assistant. A couple of questions about your operation and I'll leave you " +
      'a one-page PDF brief with what is worth automating — and what is not.\n\n' +
      'I will start: what does your company do?',
  },
  correcciones: [
    { id: 'todo_automatico',
      cuando: [/automate (everything|all of it|the whole)/i, /(whole|entire) (company|business).{0,20}automat/i],
      decir: 'Let me stop you kindly: automating "everything" is the fastest way to burn money. ' +
             'The order that works is: map the process, simplify it, then automate it. ' +
             'Automate a broken process and you only get faster mistakes.',
      porque: 'The client asked to automate everything; we explained map-first, simplify-second.',
      retoma: 'So, one step at a time: which single process hurts the most today?' },
    { id: 'chatbot_sin_humanos',
      cuando: [/chatbot that (answers|handles) (everything|all)/i, /without (any )?(humans|people|supervision)/i],
      decir: 'Careful here: a bot that answers EVERYTHING with no supervision is a roulette wheel with a nice interface. ' +
             'The right design answers the routine and hands over to a person for negotiation, complaints, ' +
             'or anything involving money. The error is not eliminated: it is bounded.',
      porque: 'Asked for an unsupervised bot; we defined mandatory human handoff at critical points.',
      retoma: 'Tell me: what share of your enquiries is always the same question?' },
    { id: 'un_gpt_para_mi_empresa',
      cuando: [/(buy|get|put) (a |an )?(chatgpt|gpt|grok|claude|gemini) for my (company|business)/i],
      decir: 'Important nuance: you do not need "a ChatGPT", you need a system. The model is only the engine; ' +
             'the value is connecting it to YOUR data, your processes and your rules, with validations so it ' +
             'cannot invent prices or policies. That is engineering, not a subscription.',
      porque: 'Confused model with system; we clarified the value is in integration and validation.',
      retoma: 'To ground it: where does the information the system must consult live today?' },
    { id: 'entrenar_con_mis_datos',
      cuando: [/train (it|the model)? (with|on) my (data|documents)/i, /learn from my (data|documents|files)/i],
      decir: 'Good instinct, wrong technical name: you almost never need to train a model. ' +
             'What we use is retrieval over your documents (RAG): the system consults your information when ' +
             'answering and cites it. Cheaper, safer, and it updates itself when you edit the document.',
      porque: 'Asked to train a model; we proposed RAG as the correct, cheaper alternative.',
      retoma: 'Are your documents in one repository, or scattered across emails and folders?' },
    { id: 'ia_infalible',
      cuando: [/(never fails|infallible|100 ?% (safe|accurate|reliable))/i],
      decir: 'I wish: it does not exist. Models are probabilistic and get it wrong once in a while. ' +
             'That is why serious design does not promise zero errors: it adds validations, human review where ' +
             'it matters, and a log of every decision. That is what you should demand from any vendor.',
      porque: 'Assumed infallible AI; we set a realistic expectation with validations and human control.',
      retoma: 'Knowing that: which decision would you never leave to a machine?' },
    { id: 'reemplazar_personas',
      cuando: [/replace (my |the )?(employees|staff|team|people)/i, /fire (people|staff|employees)/i],
      decir: 'I say this straight because I get asked a lot: this does not remove people, it removes tasks. ' +
             'Your team stops transcribing and answering the same thing a hundred times, and goes back to what ' +
             'a machine cannot do: negotiate, care for the client, decide. Projects that promise firing people ' +
             'are the ones cancelled at month three.',
      porque: 'Wanted to replace staff; we reframed as removing tasks, not jobs.',
      retoma: 'Then: which repetitive tasks do you want off your team this week?' },
    { id: 'para_ayer',
      cuando: [/(by yesterday|by tomorrow|this week|in a week|urgently|right now)/i],
      decir: 'I understand the urgency, and one part can go fast: the first real piece can be up and running soon. ' +
             'What does not exist is a complete, reliable system overnight, and whoever sells you that will ' +
             'deliver it broken. I would rather give you something that truly works inside the first phase than something fast and broken.',
      porque: 'Asked for impossible deadlines; we offered a first piece inside the first phase, without promising dates.',
      retoma: 'With that in mind: which process would you like to see working first?' },
    { id: 'es_caro',
      cuando: [/(too expensive|very expensive|no budget|can'?t afford|no money)/i],
      decir: 'Fair. Put it in perspective: an office hire costs you every month and works eight hours. ' +
             'A well-built system is paid for once and works always. If it still is not the moment, the ' +
             'diagnosis still helps: it tells you what to fix for free and when to come back.',
      porque: 'Price objection; reframed against the cost of a hire and offered an entry path.',
      retoma: 'What holds you back more: the amount, or not being sure of the return?' },
    { id: 'que_cierre_ventas',
      cuando: [/(close sales|invoice|charge|sign) (on its own|by itself|alone)/i, /sell (by itself|alone)/i],
      decir: 'Put the brake there: prepare, yes; decide, no. Having the system qualify, quote inside your policy ' +
             'and book meetings is excellent. Having it sign or invoice alone is a legal and financial risk not ' +
             'worth taking. The human approves; the machine prepares.',
      porque: 'Wanted AI closing sales or invoicing; limited to preparing with human approval.',
      retoma: 'Said that: who approves a quote in your company today?' },
  ],
  descubrimiento: [
    { campo: 'sector', pregunta: 'What does your company do?',
      ayuda: 'One line is enough: "we sell spare parts", "we are a clinic", "software for logistics".',
      capturar: /(?:we are|we do|we sell|i sell|company does|business is)\s+([a-z\s]{4,60})/i },
    { campo: 'dolor', pregunta: 'Which process costs you the most time or money today?',
      ayuda: 'Examples: answering enquiries, quoting, invoicing, reports, onboarding clients.', capturar: null },
    { campo: 'volumen', pregunta: 'Roughly how many enquiries, orders or documents of that kind per month?',
      ayuda: 'An approximate number works: 50, 300, 2,000. If you do not know, say "no idea" and we move on.',
      capturar: /(\d[\d.\s,]*)/i, opcional: true },
    { campo: 'contacto', pregunta: 'Perfect. For the brief I need three things: your name, your email and your company name.',
      ayuda: 'One message is fine: "Laura Ortiz, laura@x.com, Andinos Parts".', capturar: null },
  ],
  conocimiento: [
    { cuando: [/how much (does it cost|is it|would it be)|price|pricing|fee/i],
      decir: 'Honest ranges: a diagnosis with a real pilot, 1,800 USD fixed. Agents and automations from 3,500. ' +
             'Custom applications from 8,000. And always optional monthly care from 900. The exact number comes ' +
             'from your process, not from a list.' },
    { cuando: [/how long|how (much )?time|deadline/i],
      decir: 'The diagnosis with a pilot is the first phase. A complete agent is a medium project; a custom ' +
             'application, a large one. Scope and time come from reviewing your process together, not from a list. ' +
             'And one rule: if someone promises fixed timelines without looking at your operation, ask what they are leaving out.' },
    { cuando: [/my data|privacy|confidential|secur/i],
      decir: 'Your data is never used to train anyone\'s models. We sign confidentiality and data-processing ' +
             'agreements before touching anything, and if your sector requires it, the system lives in your own ' +
             'infrastructure.' },
    { cuando: [/what is (rag|an agent|an ai agent)|how does it work/i],
      decir: 'Short version: an AI agent is a system that understands a message, consults YOUR data, decides an ' +
             'action and executes it in your tools — with rules defining what it may do alone and what needs your ' +
             'approval. It is not a floating chat: it is a digital employee with written limits.' },
    { cuando: [/whatsapp/i],
      decir: 'Yes, and it is one of the highest-return builds: answering in seconds on WhatsApp with your real ' +
             'catalogue behind it, handing over to a human when negotiation starts. It is the typical first piece.' },
    { cuando: [/thanks|perfect|great|excellent/i],
      decir: 'Thank you. I stay with you until the brief is ready.' },
  ],
  propuestas: {
    reglas: [
      { cuando: /(answer|enquir|attention|whatsapp|client|lead|sales)/i,
        titulo: 'Immediate-response agent',
        que: 'An agent answers enquiries on web and WhatsApp in seconds, consults your real catalogue or policies, ' +
             'qualifies the interested party and books visits or calls in your team calendar.',
        fases: 'Phase 1: diagnosis + pilot agent on one channel. Phase 2: CRM integration and all channels. ' +
               'Phase 3: metrics panel and continuous improvement.',
        inversion: '3,500 – 12,000 USD depending on channels and integrations',
        no: 'It will not negotiate prices or accept offers: those decisions stay human.' },
      { cuando: /(quot|invoic|document|transcri|load|order)/i,
        titulo: 'Back-office automation',
        que: 'The system reads incoming documents, extracts and validates data against your masters, and records it ' +
             'in your ERP or accounting with human approval above a threshold you define.',
        fases: 'Phase 1: one document type in production. Phase 2: remaining documents and exceptions. ' +
               'Phase 3: reconciliation and automatic reports.',
        inversion: '2,000 – 9,000 USD depending on volume and systems',
        no: 'Nothing with firm accounting impact is recorded without human review until measured error is zero.' },
      { cuando: /(report|inform|data|excel|consolid|dashboard)/i,
        titulo: 'Data consolidation and automatic reports',
        que: 'A pipeline joins your scattered systems into one source of truth and produces the reports someone ' +
             'builds by hand today, scheduled, with anomaly alerts.',
        fases: 'Phase 1: source inventory and minimum dashboard. Phase 2: report automation. Phase 3: alerts and ' +
               'simple forecasting.',
        inversion: '4,000 – 15,000 USD depending on number of sources',
        no: 'We will not touch spreadsheets that are a single source of truth before versioning them.' },
      { cuando: /(onboarding|train|internal|question|polic|document|manual)/i,
        titulo: 'Internal knowledge copilot',
        que: 'A copilot that answers your team consulting your policies, manuals and history, citing the source of ' +
             'every answer and logging the questions it could not answer.',
        fases: 'Phase 1: centralise and version documentation. Phase 2: copilot with citations. Phase 3: knowledge-gap ' +
               'detection.',
        inversion: '3,000 – 10,000 USD depending on document volume',
        no: 'If documentation is not centralised, that is step 1: without a single source there is no reliable copilot.' },
    ],
    porDefecto: {
      titulo: 'Automation diagnosis',
      que: 'An audited lift of your processes with impact-vs-viability scoring, and a real pilot in production ' +
           'inside the first phase to validate with data, not opinions.',
      fases: 'Phase 1: diagnosis + pilot. Phase 2: the winning process to full production. Phase 3: continuous ' +
             'operation and improvement.',
      inversion: '1,800 USD for the diagnosis, deducted from the next project',
      no: 'No process is automated before being mapped and simplified.',
    },
  },
  cierre: {
    presentar: 'Ready, {nombreUsuario}. With what you told me, this is what I would do in your place:\n\n' +
               '**{titulo}**\n{que}\n\n{fases}\n\nEstimated investment: {inversion}\n\nAnd what I would NOT do: {no}',
    ofrecerPdf: 'Shall I leave all of this in a one-page PDF, with your data and the next steps, so you can review it ' +
                'calmly or forward it to whoever decides with you?',
    despedidaPdf: 'Done. Check the PDF: it carries your data, the pain you told me, the proposal with phases, the ' +
                  'investment range and — important — what we recommend NOT automating.',
    despedidaNo: 'No problem. Whenever you want to resume, I am here and your conversation stays in this browser.',
  },
  cuerdas: {
    retomando: 'And getting back to it:',
    noSe: /(no idea|don'?t know|not sure|no clue)/i,
    si: /^(yes|yep|yeah|ok|okay|sure|go ahead|please do)\b/i,
    no: /^(no|nop|nah|not now|later)\b/i,
    precio: /how much (does it cost|is it|would it be|will it be)|price|pricing|fee|investment/i,
    saludoHora: (h) => (h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 19 ? 'Good afternoon' : 'Good evening'),
  },
};

const pt = {
  codigo: 'pt', stt: 'pt-BR', voz: 'pt-BR', etiqueta: 'PT',
  identidad: { ...es.identidad, nombre: 'Nexa', empresa: 'SINAPTIA' },
  saludoVoz: 'Oi, sou a Nexa. Me diga em uma frase o que você precisa e eu te levo direto.',

  saludo: {
    ciudadFallback: 'sua cidade',
    plantilla:
      '{saludo}. Em {ciudad}, a IA já pode trabalhar pelo seu negócio.\n\n' +
      'Aí onde você está ela pode analisar sua concorrência, dar análises e ideias de marketing, ' +
      'criar ofertas para o mercado local —ou personalizadas por eventos da sua região— e otimizar ' +
      'a logística da sua zona: rotas, entregas e demanda.\n\n' +
      'Sou {nombre}, assistente da {empresa}. Com algumas perguntas entendo sua operação e deixo um brief ' +
      'em PDF com o que vale automatizar — e o que não vale.\n\n' +
      'Começo eu: o que sua empresa faz?',
  },
  correcciones: [
    { id: 'todo_automatico',
      cuando: [/automatizar (tudo|toda a empresa|o negócio inteiro)/i],
      decir: 'Deixa eu te parar com carinho: automatizar "tudo" é o jeito mais rápido de queimar dinheiro. ' +
             'A ordem que funciona é mapear o processo, simplificar e só então automatizar. ' +
             'Automatizar um processo quebrado só gera erros mais rápidos.',
      porque: 'Pediu para automatizar tudo; explicamos mapear primeiro, simplificar depois.',
      retoma: 'Então, um passo de cada vez: qual processo mais dói hoje?' },
    { id: 'chatbot_sin_humanos',
      cuando: [/chatbot que (responda|atenda) tudo/i, /sem (humanos|pessoas|supervisão)/i],
      decir: 'Cuidado: um bot que responde TUDO sem supervisão é uma roleta com interface bonita. ' +
             'O desenho certo responde o rotineiro e passa para uma pessoa em negociação, reclamações ou ' +
             'qualquer coisa com dinheiro. O erro não se elimina: se limita.',
      porque: 'Pediu bot sem supervisão; definimos passagem humana obrigatória nos pontos críticos.',
      retoma: 'Me diz: que parte das suas consultas é sempre a mesma pergunta?' },
    { id: 'un_gpt_para_mi_empresa',
      cuando: [/(comprar|colocar|por) (um |o )?(chatgpt|gpt|grok|claude|gemini) (para|na) (minha|empresa)/i],
      decir: 'Nuance importante: você não precisa de "um ChatGPT", precisa de um sistema. O modelo é só o motor; ' +
             'o valor está em conectá-lo aos SEUS dados, seus processos e suas regras, com validações para não ' +
             'inventar preços nem políticas. Isso é engenharia, não assinatura.',
      porque: 'Confundiu modelo com sistema; esclarecemos que o valor está na integração e nas validações.',
      retoma: 'Para aterrizar: onde vive hoje a informação que o sistema precisa consultar?' },
    { id: 'que_cierre_ventas',
      cuando: [/(fechar vendas|faturar|cobrar|assinar) (sozinho|sozinha|por conta própria)/i],
      decir: 'Põe o freio aí: preparar, sim; decidir, não. Que o sistema qualifique, cote dentro da sua política e ' +
             'agende é excelente. Que assine ou fature sozinho é um risco legal e financeiro que não vale a pena. ' +
             'O humano aprova; a máquina prepara.',
      porque: 'Queria IA fechando vendas ou faturando; limitamos a preparar com aprovação humana.',
      retoma: 'Dito isso: quem aprova um orçamento na sua empresa hoje?' },
  ],
  descubrimiento: [
    { campo: 'sector', pregunta: 'O que sua empresa faz?',
      ayuda: 'Uma linha basta: "vendemos peças", "somos uma clínica", "software para logística".',
      capturar: /(?:somos|vendemos|vendo|a empresa faz|negócio é)\s+([a-záéíóúãõç\s]{4,60})/i },
    { campo: 'dolor', pregunta: 'Que processo te custa mais tempo ou dinheiro hoje?',
      ayuda: 'Exemplos: responder consultas, orçar, faturar, relatórios, onboarding de clientes.', capturar: null },
    { campo: 'volumen', pregunta: 'Mais ou menos quantas consultas, pedidos ou documentos desses por mês?',
      ayuda: 'Um número aproximado serve: 50, 300, 2.000. Se não souber, diga "não sei" e seguimos.',
      capturar: /(\d[\d.\s,]*)/i, opcional: true },
    { campo: 'contacto', pregunta: 'Perfeito. Para o brief preciso de três coisas: seu nome, seu email e o nome da empresa.',
      ayuda: 'Em uma mensagem só: "Laura Ortiz, laura@x.com, Andinos Peças".', capturar: null },
  ],
  conocimiento: [
    { cuando: [/quanto (custa|é|seria)|preço|preco|valor/i],
      decir: 'Faixas honestas: diagnóstico com piloto real, 1.800 USD fechado. Agentes e automações a partir de 3.500. ' +
             'Aplicações sob medida a partir de 8.000. E cuidado mensal opcional a partir de 900. O número exato sai ' +
             'do seu processo, não de uma lista.' },
    { cuando: [/quanto tempo|prazo|demora/i],
      decir: 'O diagnóstico com piloto é a primeira fase. Um agente completo é um projeto médio; uma aplicação sob ' +
             'medida, um grande. Escopo e tempo saem de revisar seu processo juntos, não de uma lista. ' +
             'E uma regra: se alguém prometer metade disso, pergunte o que estão deixando de fora.' },
    { cuando: [/meus dados|privacidade|confidencial|seguran/i],
      decir: 'Seus dados nunca treinam modelos de ninguém. Assinamos confidencialidade e acordo de tratamento antes ' +
             'de tocar em qualquer coisa e, se seu setor exigir, o sistema vive na sua própria infraestrutura.' },
    { cuando: [/whatsapp/i],
      decir: 'Sim, e é uma das construções de maior retorno: responder em segundos no WhatsApp com seu catálogo real ' +
             'por trás, passando para um humano quando começa a negociação. É a primeira peça típica.' },
    { cuando: [/obrigad|perfeito|ótimo|otimo|excelente/i],
      decir: 'Obrigado a você. Fico contigo até o brief estar pronto.' },
  ],
  propuestas: {
    reglas: [
      { cuando: /(responder|consulta|atend|whatsapp|cliente|lead|venda)/i,
        titulo: 'Agente de resposta imediata',
        que: 'Um agente responde consultas na web e no WhatsApp em segundos, consulta seu catálogo ou políticas reais, ' +
             'qualifica o interessado e agenda visitas ou ligações na agenda da equipe.',
        fases: 'Fase 1: diagnóstico + agente piloto em um canal. Fase 2: integração com CRM e todos os canais. ' +
               'Fase 3: painel de métricas e melhoria contínua.',
        inversion: '3.500 – 12.000 USD conforme canais e integrações',
        no: 'Não negocia preço nem aceita ofertas: essas decisões continuam humanas.' },
    ],
    porDefecto: {
      titulo: 'Diagnóstico de automação',
      que: 'Um levantamento auditado dos seus processos com pontuação de impacto contra viabilidade, e um piloto real ' +
           'em produção dentro da primeira fase para validar com dados, não com opiniões.',
      fases: 'Fase 1: diagnóstico + piloto. Fase 2: o processo vencedor em produção completa. Fase 3: operação ' +
             'contínua e melhoria.',
      inversion: '1.800 USD pelo diagnóstico, descontados do projeto seguinte',
      no: 'Nenhum processo é automatizado antes de ser mapeado e simplificado.',
    },
  },
  cierre: {
    presentar: 'Pronto, {nombreUsuario}. Com o que você me contou, é isto que eu faria no seu lugar:\n\n' +
               '**{titulo}**\n{que}\n\n{fases}\n\nInvestimento estimado: {inversion}\n\nE o que eu NÃO faria: {no}',
    ofrecerPdf: 'Deixo tudo isto em um PDF de uma página, com seus dados e os próximos passos, para revisar com calma ' +
                'ou encaminhar a quem decide com você?',
    despedidaPdf: 'Feito. Veja o PDF: leva seus dados, a dor que você contou, a proposta com fases, a faixa de ' +
                  'investimento e — importante — o que recomendamos NÃO automatizar.',
    despedidaNo: 'Sem problema. Quando quiser retomar, estou aqui e sua conversa fica neste navegador.',
  },
  cuerdas: {
    retomando: 'E voltando ao assunto:',
    noSe: /(não sei|nao sei|não tenho ideia|no tengo)/i,
    si: /^(sim|sim, pode|ok|okay|claro|pode|por favor)\b/i,
    no: /^(não|nao|agora não|depois)\b/i,
    precio: /quanto (custa|é|seria|fica)|preço|preco|valor|investimento/i,
    saludoHora: (h) => (h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 19 ? 'Boa tarde' : 'Boa noite'),
  },
};

export const PACKS = { es, en, pt };
export const IDIOMAS = [
  { codigo: 'es', etiqueta: 'ES', nombre: 'Español' },
  { codigo: 'en', etiqueta: 'EN', nombre: 'English' },
  { codigo: 'pt', etiqueta: 'PT', nombre: 'Português' },
];

/** Resuelve el paquete por código o por navigator.language ('en-US' → 'en'). */
export function packPor(codigo) {
  if (!codigo) return es;
  const c = String(codigo).toLowerCase();
  if (PACKS[c]) return PACKS[c];
  const base = c.split('-')[0];
  return PACKS[base] || es;
}
